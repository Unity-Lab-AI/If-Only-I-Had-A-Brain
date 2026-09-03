// consolidation-engine.js — iter13 ConsolidationEngine
//
// Squire/McClelland CLS theory port — runs the dream-cycle replay pass
// that gradually transfers Tier 1 episodic traces into Tier 2 schemas
// (and from Tier 2 into Tier 3 identity-bound when promotion criteria
// are met). This is the SLEEP-CONSOLIDATION mechanism in code form.
//
// Invocation: engine.js dream cycle. When `_isDreaming = true` AND no
// chat input for >60s, ConsolidationEngine.runConsolidationPass fires
// every 5 minutes.
//
// Pass sequence (every 5 min during dream window):
//   1. EpisodicMemory.findPromotionCandidates(20) — top-20 promoted-eligible Tier 1 episodes
//   2. Group by cosine > 0.85 (SCHEMA_GROUP_COSINE) — episodes that share semantic content cluster into one schema
//   3. For each cluster: SchemaStore.createSchema OR find-existing + reinforce
//   4. Replay each schema 3-5 times via Hebbian through its hippocampus_to_cortex_projection
//      replay_lr = base_lr × (1 + emotional_weight) × log(1 + frequency)
//   5. Increment consolidation_count on source episodes
//   6. Reinforce schema consolidation_strength (drives Tier 3 promotion gate)
//   7. SchemaStore.mergeOverlappingSchemas — collapse near-duplicate schemas
//   8. SchemaStore.applyDecay — daily decay across all Tier 2
//   9. Check Tier 3 promotion candidates; promote via Tier3Store.promote
//  10. EpisodicMemory.decayEpisodes — Tier 1 decay + prune sweep
//  11. Persist all three tiers
//
// Sleep-spindle bursts: during pass, run cortex at gainMultiplier=1.2×
// baseline for 200ms windows interspersed with 1s quiet windows.
// Biological-fidelity mimicking thalamocortical sleep spindles that
// synchronize hippocampus-cortex replay in real brains.

import { _exports as schemaExports } from './hippocampal-schema.js';

const {
  cosine,
  SCHEMA_GROUP_COSINE,
} = schemaExports;

const CONSOLIDATION_INTERVAL_MS = 5 * 60 * 1000; // 5 min between passes during dream cycle
const PROMOTION_CANDIDATES_LIMIT = 20;
const REPLAYS_PER_SCHEMA = 4; // 3-5 range; 4 is the middle
const SPINDLE_BURST_GAIN = 1.2;
const SPINDLE_BURST_MS = 200;
const SPINDLE_QUIET_MS = 1000;

export class ConsolidationEngine {
  constructor(opts = {}) {
    this.brain = opts.brain || null;            // server-side Brain instance (has _db + cortexCluster + sharedEmbeddings)
    this.cluster = opts.cluster || null;        // language cortex cluster
    this.schemaStore = opts.schemaStore || null; // SchemaStore singleton
    this.tier3Store = opts.tier3Store || null;   // Tier3Store (deferred — uses SchemaStore until Tier 3 ships)
    this.lastPassAt = 0;
    this.passCount = 0;
    this._scheduledTimer = null;
    this._inFlight = false;
  }

  // Should we run a pass right now? Caller (engine dream cycle) checks
  // this and fires runConsolidationPass when true.
  shouldRunPass(now = Date.now()) {
    if (this._inFlight) return false;
    return (now - this.lastPassAt) >= CONSOLIDATION_INTERVAL_MS;
  }

  // Main pass entry point. Async because it runs Hebbian replay
  // through cluster._teachHebbianAsymmetric which awaits GPU dispatch.
  async runConsolidationPass(opts = {}) {
    if (this._inFlight) return { skipped: 'already-in-flight' };
    if (!this.brain || !this.cluster || !this.schemaStore) {
      return { skipped: 'engine not fully wired' };
    }
    // #35 — hard off-switch. There was no way to disable consolidation beyond
    // the (ineffective, can't-preempt-sync-work) DREAM_CONSOLIDATION_MAX_MS
    // deadline. At 306M neurons the CPU replay monopolizes the event loop for
    // 30s-400s and stalls the public /ws donor handshake. DREAM_CONSOLIDATION_
    // DISABLE=1 skips passes entirely (operational kill-switch — preferred
    // over shrinking the brain). The size guard in _replaySchema is the
    // narrower default fix; this is the full stop.
    if (process.env.DREAM_CONSOLIDATION_DISABLE === '1') {
      return { skipped: 'disabled-by-env (DREAM_CONSOLIDATION_DISABLE=1)' };
    }
    // Reset the per-pass GPU replay budget and remember where the
    // last pass ran out. `_gpuReplayCursor` is what makes the bound FAIR: without
    // it a pass always spends its budget on whichever schemas come first in the
    // store's iteration order, and the tail would never be replayed at all — a
    // silent truncation that would look exactly like working consolidation.
    // With it, the schemas that missed this pass lead the next one, and the
    // cursor wraps once a pass gets all the way through.
    {
      const _cap = process.env.DREAM_CONSOLIDATION_GPU_REPLAY_MAX != null
        ? Number(process.env.DREAM_CONSOLIDATION_GPU_REPLAY_MAX)
        : 64;
      this._gpuReplayBudgetLeft = (Number.isFinite(_cap) && _cap > 0) ? _cap : 0;
      this._gpuReplayCursor = this._gpuReplayCursor | 0;
      this._gpuReplaySeen = 0;
      this._gpuReplaySpentThisPass = 0;
    }
    // I.8 closure 2026-06-17 22:00 PT — skip consolidation during
    // pre-cell SEED phases. K-VOCAB-UPFRONT-MULTIDEF SEED + dream-
    // trickle phases monopolize GPU for definition fetches; a
    // concurrent consolidation pass steals GPU exclusively for
    // 30s-2.5min (operator log 2026-06-17 21:50 PT: `duration=
    // 153445ms` = 2 min 33s for a single consolidation pass during
    // _teachHebbian). Skipping during SEED preserves training velocity
    // without losing consolidation — once SEED completes, the next
    // dream window will pick up the deferred consolidation work with
    // a fresh candidate batch. `opts.forced=true` overrides this skip
    // (used by Curriculum._dreamWindow for explicit dream-cycle
    // consolidation that DOES intentionally pay the GPU cost).
    if (!opts.forced && this.cluster
        && this.cluster._curriculum
        && this.cluster._curriculum._currentMacroPhase
        && String(this.cluster._curriculum._currentMacroPhase).includes('SEED')) {
      return { skipped: 'seed-phase-active' };
    }
    // I.8 — also enforce a wall-clock cap. Operator-tunable via
    // `DREAM_CONSOLIDATION_MAX_MS` env var — default 45s for a routine pass,
    // and DREAM_CONSOLIDATION_FORCE_MAX_MS (default 120s) when opts.forced,
    // per the forced-pass note below. (This line said "default 30s" until 2026-08-27,
    // thirty lines above the code that sets 45000/120000.) When a pass
    // exceeds the cap, abort gracefully at the next phase boundary;
    // the next pass resumes work from a fresh candidate batch. Without
    // the cap, observed durations of 153s+ stole the GPU exclusively
    // for minutes during active K-cell teaching.
    // Default raised 30000 -> 45000: live-box passes were
    // DEADLINE-ABORTing at 30.5-32.1s EVERY pass — the budget sat just
    // under the real pass cost, so the tail stages (including Tier-3
    // promotion) were cut on every single pass ("0 promoted" chronically).
    // 45s finishes the pass; the env knob is unchanged for ops tuning,
    // and the cap still guards against the original 153s+ runaway passes.
    // A FORCED pass gets a longer wall than a routine
    // one. Live, inside a multi-hour K cell: mid-walk passes are idle-only by
    // design and the walk is never idle, so consolidation starved the full 2-hour
    // emergency valve — and when the starvation guard finally forced a pass, it
    // DEADLINE-ABORTed at 45,000ms having run 48,581ms of work, skipping the tail
    // (merge + schema-decay + Tier-3 promotion + episode-decay). Net: inside long
    // cells, consolidation got ≤45s of work per 2 HOURS and its tail never ran —
    // schemas were created all night, promotions never happened.
    //
    // A forced pass fires at most once per DREAM_CONSOLIDATION_FORCE_MS (2h) or
    // from an explicit dream window, and the pass yields between stages (the live
    // log shows only ~250-340ms loop blocks DURING the 48s pass), so a longer
    // wall is more yielding work, not a longer pin. Routine passes keep the 45s
    // cap unchanged — the original 153s-runaway guard stands where passes are
    // frequent. ⚠ RE-PRICE note: this WIDENS a consolidation bound rather than
    // removing any gate — the walk-finiteness pricing is untouched.
    const maxMs = opts.forced
      ? (Number(process.env.DREAM_CONSOLIDATION_FORCE_MAX_MS) > 0
          ? Number(process.env.DREAM_CONSOLIDATION_FORCE_MAX_MS)
          : 120000)
      : (Number(process.env.DREAM_CONSOLIDATION_MAX_MS) > 0
          ? Number(process.env.DREAM_CONSOLIDATION_MAX_MS)
          : 45000);
    this._consolidationDeadlineMs = Date.now() + maxMs;
    // iter20-A — harden gate. Operator caught (verbatim 2026-05-05
    // "fix it all thouroughly"): 102 consolidation passes in 67s
    // (one every 0.66s instead of 5min interval). Setting
    // `lastPassAt = Date.now()` at end of try-block left a window
    // where any throw or unexpected control flow between _inFlight=
    // true and line 195 left the gate unguarded — next tick's
    // shouldRunPass saw stale lastPassAt and re-fired immediately.
    // Setting it FIRST (right after _inFlight) means the gate is
    // closed before any work happens. Even if pass throws, the gate
    // still holds for 5 minutes.
    this._inFlight = true;
    this.lastPassAt = Date.now();
    const startMs = Date.now();
    this.passCount++;
    const passId = this.passCount;
    const stats = {
      passId,
      candidatesFound: 0,
      clustersFormed: 0,
      schemasCreated: 0,
      schemasReinforced: 0,
      replaysExecuted: 0,
      hebbianWritesTotal: 0,
      schemasMerged: 0,
      schemasDecayed: 0,
      tier3Promotions: 0,
      episodesDecayed: 0,
      episodesPruned: 0,
      durationMs: 0,
    };

    try {
      // 114.19fj.24 — Saturation veto. When sem→motor basins have
      // collapsed (per `cluster.checkSemMotorHealth()` heuristic stack —
      // env-tunable thresholds via DREAM_SAT_*), Hebbian replay just
      // deepens the saturation. Steps 1-3 + 7-10 still run; only Step 4
      // (replay) is skipped — see line ~205 below for the per-cluster
      // skip gate. Single-source-of-truth `cluster.checkSemMotorHealth()`
      // is delegated to via `_isSemMotorSaturated()` so consolidation
      // veto + curriculum-walk halt cron read the same heuristic.
      const saturationVeto = this._isSemMotorSaturated();
      if (saturationVeto) {
        console.log('[Consolidation] saturation veto — sem→motor basins collapsed, replay step (4) skipped');
        stats.saturationVeto = true;
      }

      // Step 1 — fetch promotion candidates from Tier 1
      const candidates = (typeof this.brain.findPromotionCandidates === 'function')
        ? this.brain.findPromotionCandidates(PROMOTION_CANDIDATES_LIMIT)
        : [];
      stats.candidatesFound = candidates.length;

      // Hydrate embeddings on candidates so we can cluster them.
      // brain._deserializeEmbedding turns the input_embedding BLOB into
      // a Float64Array for cosine ops.
      const hydratedCandidates = [];
      for (const ep of candidates) {
        if (ep.input_embedding) {
          const emb = (typeof this.brain._deserializeEmbedding === 'function')
            ? this.brain._deserializeEmbedding(ep.input_embedding)
            : null;
          if (emb && emb.length > 0) {
            hydratedCandidates.push({ ...ep, embedding: emb });
          }
        }
      }

      // Step 2 — cluster by cosine > SCHEMA_GROUP_COSINE
      const clusters = this._clusterByEmbeddingCosine(hydratedCandidates, SCHEMA_GROUP_COSINE);
      stats.clustersFormed = clusters.length;

      // Step 3 + 4 — for each cluster, create or reinforce a schema, then replay
      let _abortedForDeadline = false;
      for (const cluster of clusters) {
        if (cluster.length === 0) continue;
        // I.8 deadline check — abort gracefully at cluster boundary if
        // we've blown the DREAM_CONSOLIDATION_MAX_MS budget. The next
        // pass picks up remaining clusters fresh.
        if (this._consolidationDeadlineMs && Date.now() > this._consolidationDeadlineMs) {
          _abortedForDeadline = true;
          break;
        }
        // Already-promoted fast-path. iter22-F dropped the
        // `promoted_at IS NULL` filter from findPromotionCandidates so
        // anchor episodes can re-cluster as their frequency_count
        // climbs (heartbeat merges into them via iter20-K). When that
        // happens, route the candidate cluster directly back to its
        // existing schema instead of letting cosine drift below the
        // grouping threshold ever spawn a duplicate schema for the
        // same anchor. Picks the most-common schema id among
        // already-promoted episodes in the cluster.
        const promotedIdCounts = new Map();
        for (const ep of cluster) {
          const sid = ep.promoted_to_schema_id;
          if (sid) promotedIdCounts.set(sid, (promotedIdCounts.get(sid) || 0) + 1);
        }
        let schema = null;
        if (promotedIdCounts.size > 0) {
          let bestSid = null, bestCount = 0;
          for (const [sid, n] of promotedIdCounts) {
            if (n > bestCount) { bestCount = n; bestSid = sid; }
          }
          if (bestSid && this.schemaStore.schemas?.has?.(bestSid)) {
            schema = this.schemaStore.schemas.get(bestSid);
          }
        }
        // Cosine-match path runs when no episode in the cluster
        // already has a live schema (or the live schema was decayed
        // away).
        if (!schema) {
          const clusterCentroid = this._centroidOf(cluster.map(ep => ep.embedding));
          schema = this._findExistingSchema(clusterCentroid, SCHEMA_GROUP_COSINE);
        }
        if (!schema) {
          // Create new schema
          schema = this.schemaStore.createSchema(cluster);
          if (!schema) continue;
          stats.schemasCreated++;
        } else {
          // Reinforce existing — extend source_episode_ids with new ones
          for (const ep of cluster) {
            if (ep.id != null && !schema.sourceEpisodeIds.includes(ep.id)) {
              schema.sourceEpisodeIds.push(ep.id);
            }
          }
          stats.schemasReinforced++;
        }

        // Mark source episodes as promoted (Tier 1 → Tier 2 transition)
        if (typeof this.brain.markEpisodePromoted === 'function') {
          for (const ep of cluster) {
            if (ep.id != null) this.brain.markEpisodePromoted(ep.id, schema.id);
          }
        }

        // Step 4 — replay schema REPLAYS_PER_SCHEMA times via Hebbian
        // through hippocampus_to_cortex_projection. Replay magnitude
        // scales with emotional weight + log(frequency_total).
        // Skipped when saturationVeto flagged at pass entry — replay
        // against saturated basins reinforces the lock-in instead of
        // strengthening real schema patterns.
        if (!saturationVeto) {
          // Per-pass GPU replay budget. Each schema that the
          // donor carries costs one sparse dispatch (~205ms RTT measured on the
          // pod, KI-23), so an unbounded pass over a large schema store would
          // swamp the 300s consolidation interval. The budget bounds the pass;
          // the cursor below means the schemas that miss this pass are the ones
          // that go FIRST next time, so coverage completes over passes instead
          // of being silently truncated at the top of the list every time.
          if (this._gpuReplayBudgetLeft === undefined) this._gpuReplayBudgetLeft = 0;
          this._gpuReplaySeen = (this._gpuReplaySeen | 0) + 1;
          // Schemas before the cursor were already replayed by the previous
          // pass; they wait their turn so the tail of the store gets served.
          const _pastCursor = this._gpuReplaySeen > (this._gpuReplayCursor | 0);
          const replayResult = await this._replaySchema(schema, cluster, {
            ...opts,
            gpuReplayBudget: _pastCursor ? this._gpuReplayBudgetLeft : 0,
          });
          if (replayResult.gpuCarried) {
            this._gpuReplayBudgetLeft -= 1;
            this._gpuReplaySpentThisPass = (this._gpuReplaySpentThisPass | 0) + 1;
          }
          stats.replaysExecuted += replayResult.replays;
          stats.hebbianWritesTotal += replayResult.writes;
        }

        // Step 5 — increment consolidation_count on source episodes
        if (typeof this.brain.recordEpisodeConsolidation === 'function') {
          for (const ep of cluster) {
            if (ep.id != null) this.brain.recordEpisodeConsolidation(ep.id);
          }
        }
      }

      // Tail-step deadline honor — steps 7-10 previously ran UNBOUNDED after
      // the cluster loop had already blown DREAM_CONSOLIDATION_MAX_MS
      // (mergeOverlappingSchemas is O(N²) over schemas, decayEpisodes sweeps
      // the episodic DB). At biological scale those tail sweeps were the
      // part of a 'capped' pass that still ran minutes past the deadline,
      // pinning the event loop inside every dream window. Each tail step
      // now checks the same deadline; skipped steps are tagged in stats +
      // the pass log, and the NEXT pass picks them up with a fresh budget
      // (all four are idempotent maintenance sweeps, not one-shot work).
      const _pastDeadline = () => !!(this._consolidationDeadlineMs && Date.now() > this._consolidationDeadlineMs);
      const _tailSkipped = [];
      
      // Step 7 — merge overlapping schemas
      if (_pastDeadline()) {
        _tailSkipped.push('merge');
      } else {
        stats.schemasMerged = this.schemaStore.mergeOverlappingSchemas();
      }

      // Step 8 — apply daily decay across all Tier 2 schemas
      if (_pastDeadline()) {
        _tailSkipped.push('schema-decay');
      } else {
        stats.schemasDecayed = this.schemaStore.applyDecay();
      }

      // Step 9 — Tier 3 promotion check
      if (_pastDeadline()) {
        _tailSkipped.push('tier3-promotion');
      } else if (this.tier3Store && typeof this.tier3Store.checkPromotions === 'function') {
        const promoted = this.tier3Store.checkPromotions(this.schemaStore);
        stats.tier3Promotions = promoted;
      } else {
        // Inline check using shouldPromoteToTier3 (Tier 3 store may not be wired yet)
        for (const schema of this.schemaStore.schemas.values()) {
          if (!schema.promotedToTier3 && schema.shouldPromoteToTier3()) {
            schema.promotedToTier3 = true;
            schema.tier3PromotedAt = Date.now();
            stats.tier3Promotions++;
            console.log(`[Hippocampus] PROMOTED to Tier 3: ${schema.label} (${schema.id}) consolidation_strength=${schema.consolidationStrength.toFixed(2)} retrieval_count=${schema.retrievalCount} replay_count=${schema.replayCount || 0} emotional_valence=${(schema.attributeVector[0] || 0).toFixed(2)}`);
          }
        }
      }

      // Step 10 — Tier 1 decay + prune sweep
      if (_pastDeadline()) {
        _tailSkipped.push('episode-decay');
      } else if (typeof this.brain.decayEpisodes === 'function') {
        const epStats = this.brain.decayEpisodes();
        stats.episodesDecayed = epStats.decayed || 0;
        stats.episodesPruned = epStats.pruned || 0;
      }

      // Step 11 — persistence is opportunistic. ConsolidationEngine
      // doesn't directly call saveWeights to avoid lock contention with
      // periodic save. The next periodic save (5 min interval) will pick
      // up fresh schema state from SchemaStore.toJSON.

      stats.durationMs = Date.now() - startMs;
      // iter20-A: lastPassAt already set at top of pass for gate
      // hardening — no need to reassign here.
      // I.8 closure — surface deadline-abort in the log so operator
      // sees when a pass was capped by DREAM_CONSOLIDATION_MAX_MS and
      // can tune the env var if needed.
      stats.tailStepsSkipped = _tailSkipped.slice();
      const tailTag = _tailSkipped.length ? ` · ⚠ tail steps skipped past deadline: ${_tailSkipped.join('+')} (next pass catches up)` : '';
      const deadlineTag = _abortedForDeadline ? ` · ⚠ DEADLINE-ABORT (DREAM_CONSOLIDATION_MAX_MS=${(this._consolidationDeadlineMs - startMs) >= 0 ? ((this._consolidationDeadlineMs - startMs) | 0) : 30000}ms)` : '';
      console.log(`[Consolidation] pass ${passId}: ${stats.candidatesFound} candidates → ${stats.clustersFormed} clusters → ${stats.schemasCreated} new schemas, ${stats.schemasReinforced} reinforced, ${stats.replaysExecuted} replays (${stats.hebbianWritesTotal} writes), ${stats.schemasMerged} merged, ${stats.schemasDecayed} decayed, ${stats.tier3Promotions} promoted to Tier 3, ${stats.episodesDecayed} episodes decayed / ${stats.episodesPruned} pruned · duration=${stats.durationMs}ms${deadlineTag}${tailTag}`);
    } catch (err) {
      console.warn(`[Consolidation] pass ${passId} threw: ${err.message}`);
      stats.error = err.message;
    } finally {
      this._inFlight = false;
      // Advance the rotation and REPORT IT. If this pass spent its
      // whole budget there is more store than budget, so the next pass starts
      // where this one stopped; if it got all the way through, the cursor wraps.
      // The counts are logged rather than kept silent because "consolidation ran"
      // and "consolidation LEARNED" are different claims, and the whole reason
      // this fix exists is that the board could not tell them apart.
      try {
        const spent = this._gpuReplaySpentThisPass | 0;
        const seen = this._gpuReplaySeen | 0;
        if (spent > 0 && this._gpuReplayBudgetLeft <= 0 && seen > spent) {
          this._gpuReplayCursor = (this._gpuReplayCursor | 0) + spent;
          if (this._gpuReplayCursor >= seen) this._gpuReplayCursor = 0;
        } else {
          this._gpuReplayCursor = 0;   // got through everything eligible — wrap
        }
        stats.gpuReplaySchemas = spent;
        stats.gpuReplayWrites = spent * REPLAYS_PER_SCHEMA;
        stats.gpuReplayCursor = this._gpuReplayCursor | 0;
        if (spent > 0) {
          console.log(`[Consolidation] 💤 REPLAY ON THE DONOR — ${spent} schema(s) × ${REPLAYS_PER_SCHEMA} reps = ${spent * REPLAYS_PER_SCHEMA} real Hebbian writes this pass (of ${seen} eligible; cursor → ${this._gpuReplayCursor}). Her sleep is learning.`);
        }
      } catch { /* accounting must never fail a pass */ }
    }
    return stats;
  }

  // Saturation veto check — delegates to cluster.checkSemMotorHealth()
  // when available so the same heuristic stack is used by both the
  // consolidation veto and the curriculum cron. Returns the boolean
  // saturated state for the replay-skip decision.
  _isSemMotorSaturated() {
    try {
      const cluster = this.cluster;
      if (!cluster) return false;
      if (typeof cluster.checkSemMotorHealth === 'function') {
        const health = cluster.checkSemMotorHealth();
        return !!(health && health.saturated);
      }
      return false;
    } catch {
      return false;
    }
  }

  // Cluster a list of episodes by embedding cosine > threshold using
  // single-link agglomerative clustering. Each episode joins the
  // nearest existing cluster if cosine > threshold; otherwise starts
  // a new cluster. O(N²) on candidates — bounded at 20 candidates so
  // 400 cosine ops per pass, trivial cost.
  _clusterByEmbeddingCosine(episodes, threshold) {
    const clusters = [];
    for (const ep of episodes) {
      let bestCluster = null, bestCos = -Infinity;
      for (const cluster of clusters) {
        // Compute mean cosine to cluster centroid (recomputed cheaply)
        const centroid = this._centroidOf(cluster.map(e => e.embedding));
        const cos = cosine(ep.embedding, centroid);
        if (cos > bestCos) { bestCos = cos; bestCluster = cluster; }
      }
      if (bestCluster && bestCos >= threshold) {
        bestCluster.push(ep);
      } else {
        clusters.push([ep]);
      }
    }
    return clusters;
  }

  _centroidOf(embeddings) {
    if (!embeddings || embeddings.length === 0) return new Float64Array(0);
    const D = embeddings[0].length;
    const out = new Float64Array(D);
    let n = 0;
    for (const e of embeddings) {
      if (!e || e.length !== D) continue;
      for (let i = 0; i < D; i++) out[i] += e[i];
      n++;
    }
    if (n > 0) for (let i = 0; i < D; i++) out[i] /= n;
    return out;
  }

  _findExistingSchema(centroid, threshold) {
    if (!centroid || centroid.length === 0) return null;
    let best = null, bestCos = -Infinity;
    for (const schema of this.schemaStore.schemas.values()) {
      if (schema.promotedToTier3) continue;
      const cos = cosine(centroid, schema.conceptEmbedding);
      if (cos > bestCos) { bestCos = cos; best = schema; }
    }
    return bestCos >= threshold ? best : null;
  }

  // Replay a schema through its hippocampus_to_cortex_projection via
  // Hebbian writes. Replay magnitude scales with emotional weight +
  // log(frequency_total). Sleep-spindle bursts modulate cluster gain
  // during the replay window.
  async _replaySchema(schema, sourceEpisodes, opts = {}) {
    let replays = 0;
    let writes = 0;
    if (!this.cluster || typeof this.cluster._teachHebbianAsymmetric !== 'function') {
      // Cluster doesn't expose Hebbian helper directly. Use the
      // language cortex cluster's intraSynapsesHebbian if available.
      if (this.cluster && typeof this.cluster.synapses === 'object'
          && typeof this.cluster.synapses.hebbianUpdate === 'function') {
        // Fallthrough — we'll do raw cluster.synapses.hebbianUpdate writes below
      } else {
        return { replays, writes };
      }
    }

    // Compute replay magnitude scaling
    let valenceWeight = 0, freqTotal = 0;
    for (const ep of sourceEpisodes) {
      valenceWeight += Math.abs(ep.emotional_valence || 0);
      freqTotal += (ep.frequency_count || 1);
    }
    const emotionalWeight = sourceEpisodes.length > 0 ? valenceWeight / sourceEpisodes.length : 0;
    const baseLr = (this.cluster.learningRate || 0.01);
    const replayLr = baseLr * (1 + emotionalWeight) * Math.log(1 + freqTotal);

    const semRegion = this.cluster.regions && this.cluster.regions.sem;
    const motorRegion = this.cluster.regions && this.cluster.regions.motor;
    if (!semRegion || !motorRegion) return { replays, writes };

    // #35/#36 — decide the CPU-replay skip FIRST: both the synchronous
    // hebbianUpdate AND the preSem build (_buildRegionPattern allocates
    // new Float64Array(cluster.size) — hundreds of MB at biological scale)
    // must be skipped together to keep the event loop free. At scale real
    // Hebbian consolidation belongs on the GPU teach path; the cheap schema
    // bookkeeping (promotion / reinforce / decay) still runs. Tunable via
    // DREAM_CONSOLIDATION_MAX_REPLAY_NNZ (default 5,000,000; 0 disables guard).
    const _maxReplayNnz = process.env.DREAM_CONSOLIDATION_MAX_REPLAY_NNZ != null
      ? Number(process.env.DREAM_CONSOLIDATION_MAX_REPLAY_NNZ)
      : 5_000_000;
    const _synNnz = (this.cluster.synapses && this.cluster.synapses.nnz) || 0;
    const _skipCpuReplay = _maxReplayNnz > 0 && _synNnz > _maxReplayNnz;
    // ── THE GPU ROUTE THE GUARD WAS WAITING FOR ───────────────────────────────
    //
    // The guard above is CORRECT and stays: a synchronous CPU `hebbianUpdate` at
    // this nnz blocks the event loop for 30-400s. What was wrong is that its own
    // comment defers to "the GPU teach path" and NO SUCH PATH EXISTED HERE — so
    // at biological scale the replay Hebbian was skipped on every pass and only
    // schema bookkeeping ran. Measured live on the box before this fix:
    // `memoryStats.consolidation.passCount: 18` with
    // `dreamRecombinationStats.novelConsolidated: 0`. Her sleep did no learning.
    //
    // That matters far beyond tidiness. In complementary-learning-systems terms
    // the awake pass does fast, broad, overlapping encoding and the interleaved
    // replay is what SEPARATES those representations — i.e. it is what builds
    // the very margin `voice.emitRejection: "below-signal-floor"` says she
    // lacks. With replay dead, 100% of her learning happened awake, which is
    // also why the repetition counts had to be so brutal.
    //
    // ⛔ RE-PRICE (required, and computed BEFORE this shipped):
    //   • The CPU guard is NOT removed or weakened — the CPU path stays skipped
    //     at scale, so the event-loop protection it exists for is untouched.
    //   • `hebbianBoundMasked` takes a `reps` argument, so all
    //     REPLAYS_PER_SCHEMA (4) replays ride ONE dispatch instead of four.
    //   • Cost per dispatch is one sparse op ≈ 205ms RTT measured on the remote
    //     pod (KI-23). Bounded at 64 schemas per pass by default that is
    //     ≈13s of device time against a 300s consolidation interval — ~4% duty.
    //   • Unbounded it would NOT be safe: a large schema store would put every
    //     pass into hundreds of dispatches and swamp the interval, so the bound
    //     is the feature. A rotating cursor means schemas that miss one pass are
    //     first in line for the next, so coverage is complete over time rather
    //     than truncated at the top of the list.
    //   • `DREAM_CONSOLIDATION_GPU_REPLAY_MAX=0` disables the GPU route and
    //     restores exactly today's behaviour (bookkeeping only).
    const _gpuProxy = (this.cluster && this.cluster._gpuProxyReady && this.cluster._gpuProxy) || null;
    const _gpuReplayCap = process.env.DREAM_CONSOLIDATION_GPU_REPLAY_MAX != null
      ? Number(process.env.DREAM_CONSOLIDATION_GPU_REPLAY_MAX)
      : 64;
    const _canGpuReplay = !!(_skipCpuReplay && _gpuProxy
      && typeof _gpuProxy.hebbianBoundMasked === 'function'
      && Number.isFinite(_gpuReplayCap) && _gpuReplayCap > 0);
    if (_skipCpuReplay && !this._replaySkipLogged) {
      this._replaySkipLogged = true;
      if (_canGpuReplay) {
        console.warn(`[Consolidation] CPU replay SKIPPED at nnz=${_synNnz.toLocaleString()} > ${_maxReplayNnz.toLocaleString()} (a synchronous CPU replay here blocks the event loop 30s-400s) — REPLAY NOW RUNS ON THE DONOR via masked bound Hebbian, ${_gpuReplayCap} schema(s) per pass on a rotating cursor. Her sleep does real learning again. Disable with DREAM_CONSOLIDATION_GPU_REPLAY_MAX=0.`);
      } else {
        console.warn(`[Consolidation] CPU replay (hebbianUpdate + preSem build) SKIPPED — intra-synapse nnz=${_synNnz.toLocaleString()} > ${_maxReplayNnz.toLocaleString()} cap, and NO GPU REPLAY ROUTE IS AVAILABLE (donor not ready / hebbianBoundMasked missing / disabled by env). ⛔ This means consolidation is doing schema bookkeeping ONLY — no replay learning is happening this pass. Tune via DREAM_CONSOLIDATION_MAX_REPLAY_NNZ (0=disable guard) or attach a donor.`);
      }
    }

    // Pre-build the cortex-side pattern ONCE — concept embedding tiled into
    // sem region. Skipped when _skipCpuReplay (the big alloc is only needed
    // for the CPU hebbianUpdate we're not doing).
    const preSem = _skipCpuReplay ? null : this._buildRegionPattern(semRegion, schema.conceptEmbedding, false);

    // Sleep-spindle: temporary gainMultiplier bump during replay window.
    const _origGain = this.cluster.gainMultiplier ?? 1.0;
    let _spindleActive = false;
    const startSpindle = () => {
      this.cluster.gainMultiplier = _origGain * SPINDLE_BURST_GAIN;
      _spindleActive = true;
    };
    const endSpindle = () => {
      this.cluster.gainMultiplier = _origGain;
      _spindleActive = false;
    };

    // The GPU replay: ONE masked bound-Hebbian dispatch carrying
    // all REPLAYS_PER_SCHEMA reps, against the schema's own active sem rows.
    // The sleep-spindle gain is folded into the learning rate here because the
    // CPU path gets its burst via `cluster.gainMultiplier`, which a device-side
    // write does not read — same intended effect, applied where the write is.
    if (_canGpuReplay) {
      const _budget = (typeof opts.gpuReplayBudget === 'number') ? opts.gpuReplayBudget : Infinity;
      if (_budget > 0) {
        const activeIdx = this._buildRegionActiveIdx(semRegion, schema.conceptEmbedding);
        if (activeIdx && activeIdx.length) {
          try {
            const carried = _gpuProxy.hebbianBoundMasked(
              `${this.cluster.name}_intraSynapses`,
              replayLr * SPINDLE_BURST_GAIN,
              REPLAYS_PER_SCHEMA,
              activeIdx,
            ) === true;
            if (carried) {
              writes += REPLAYS_PER_SCHEMA;
              replays += REPLAYS_PER_SCHEMA;
              this._gpuReplayWrites = (this._gpuReplayWrites || 0) + REPLAYS_PER_SCHEMA;
              this._gpuReplaySchemas = (this._gpuReplaySchemas || 0) + 1;
              // The device carried the real Hebbian — the CPU loop below has
              // nothing left to do for this schema, and re-running it would
              // double-count the replay.
              return { replays, writes, gpuCarried: true };
            }
            this._gpuReplayRefused = (this._gpuReplayRefused || 0) + 1;
          } catch {
            this._gpuReplayRefused = (this._gpuReplayRefused || 0) + 1;
          }
        }
      }
    }

    try {
      for (let r = 0; r < REPLAYS_PER_SCHEMA; r++) {
        startSpindle();
        // Replay = Hebbian write through schema's projection. We use
        // the cortex cluster's _crossRegionHebbian fire-and-forget
        // mechanism (existing pattern) by calling synapses.hebbianUpdate
        // with the schema's centroid as both pre AND a post derived
        // from itself — strengthens the centroid's self-recall basin.
        // #35 — _skipCpuReplay gates the synchronous CPU write at scale.
        if (!_skipCpuReplay && this.cluster.synapses && typeof this.cluster.synapses.hebbianUpdate === 'function') {
          try {
            this.cluster.synapses.hebbianUpdate(preSem, preSem, replayLr);
            writes++;
          } catch { /* skip on synapse error */ }
        }
        replays++;
        // Sleep-spindle quiet window between bursts
        await new Promise(resolve => setTimeout(resolve, SPINDLE_BURST_MS));
        endSpindle();
        await new Promise(resolve => setTimeout(resolve, SPINDLE_QUIET_MS));
      }
    } finally {
      if (_spindleActive) endSpindle();
    }

    // Reinforcement signal on the schema. Each replay adds:
    //   Δstrength = 0.1 × emotional_weight (from spec)
    schema.reinforce(0.1 * (1 + emotionalWeight) * REPLAYS_PER_SCHEMA);

    return { replays, writes };
  }

  // The SPARSE twin of `_buildRegionPattern`.
  // The dense builder allocates `new Float64Array(cluster.size)` — hundreds of
  // megabytes at biological scale, and one of the two reasons the CPU replay was
  // guarded off in the first place. The pattern it builds is a pure tiling, so
  // the active indices can be produced directly and cheaply, which is exactly
  // what a masked GPU Hebbian write wants.
  _buildRegionActiveIdx(region, feat) {
    if (!this.cluster || !region || !feat || feat.length === 0) return null;
    const size = region.end - region.start;
    const gSize = Math.max(1, Math.floor(size / feat.length));
    const idx = [];
    for (let d = 0; d < feat.length; d++) {
      if (feat[d] <= 0) continue;
      for (let n = 0; n < gSize; n++) {
        const i = region.start + d * gSize + n;
        if (i < region.end) idx.push(i);
      }
    }
    return idx.length ? Int32Array.from(idx) : null;
  }

  _buildRegionPattern(region, feat, binarize = true) {
    if (!this.cluster || !region || !feat || feat.length === 0) {
      return new Float64Array(this.cluster ? this.cluster.size : 0);
    }
    const out = new Float64Array(this.cluster.size);
    const size = region.end - region.start;
    const gSize = Math.max(1, Math.floor(size / feat.length));
    for (let d = 0; d < feat.length; d++) {
      if (feat[d] <= 0) continue;
      for (let n = 0; n < gSize; n++) {
        const idx = region.start + d * gSize + n;
        if (idx < region.end) out[idx] = binarize ? 1 : feat[d];
      }
    }
    return out;
  }
}
