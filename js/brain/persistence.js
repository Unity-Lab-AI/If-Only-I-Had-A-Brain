/**
 * persistence.js — Brain State Persistence
 *
 * Saves and loads the brain's learned state across sessions.
 * Everything the brain learned — projection weights, cluster
 * synapses, oscillator coupling, episodic memory, dictionary —
 * persists to localStorage (browser) or disk (server).
 *
 * The brain never starts from zero after the first session.
 * Every interaction makes it smarter. Every session builds on the last.
 */

import { SparseMatrix } from './sparse-matrix.js';
import { sharedEmbeddings } from './embeddings.js';
// T14.16 — letter inventory persistence. Pulls from the T14.1 module
// so reloads restore the same inventory-insertion order the cortex
// weights were trained against.
import { serializeInventory as _t14SerializeInventory, loadInventory as _t14LoadInventory } from './letter-input.js';

// T14.16 — shallow helpers for serializing nested Maps. The learned
// language statistics on NeuronCluster (T14.13) use Map-of-Maps shapes
// that JSON.stringify can't handle directly.
function mapOfMapsToJson(m) {
  if (!(m instanceof Map)) return null;
  const out = {};
  for (const [k, inner] of m) {
    if (inner instanceof Map) {
      out[k] = Object.fromEntries(inner);
    } else if (typeof inner === 'number') {
      out[k] = inner;
    }
  }
  return out;
}
function mapOfMapOfMapsToJson(m) {
  if (!(m instanceof Map)) return null;
  const out = {};
  for (const [k, inner] of m) {
    if (inner instanceof Map) out[k] = mapOfMapsToJson(inner);
  }
  return out;
}
function jsonToMapOfMaps(obj) {
  const m = new Map();
  if (!obj || typeof obj !== 'object') return m;
  for (const [k, inner] of Object.entries(obj)) {
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const sub = new Map(Object.entries(inner));
      m.set(k, sub);
    } else if (typeof inner === 'number') {
      m.set(k, inner);
    }
  }
  return m;
}
function jsonToMapOfMapOfMaps(obj) {
  const m = new Map();
  if (!obj || typeof obj !== 'object') return m;
  for (const [k, inner] of Object.entries(obj)) {
    m.set(k, jsonToMapOfMaps(inner));
  }
  return m;
}

const STORAGE_KEY = 'unity_brain_state';
// VERSION bumped 2 → 3 as part of R2 brain-refactor-full-control.
// PATTERN_DIM changed 32 → 50 to match GloVe semantic embedding
// dimension. Any persisted cortex patterns, context vectors, or
// memory centroids from v2 have the wrong shape and wrong values
// (letter-hash vs GloVe). Old v2 state gets rejected on load and
// the brain boots fresh with semantic patterns from the start.
// T14.16 (2026-04-14) — schema bumped to v4 to persist T14 learned
// language state on the cortex cluster: T14.1 letter inventory,
// T14.13 fineTypeTransitions / sentenceFormSchemas / sentenceFormTotals
// / intentResponseMap, T14.16.5 identity-lock thresholds. Old v3 saves
// have none of these fields and will be rejected on load so the brain
// boots clean with curriculum re-run instead of hydrating into an
// inconsistent state that mixes T13 schema with T14 code.
//
// VERSION 5 — bumped to invalidate older pre-equational-rebuild saves.
// The equational rebuild shipped 39 new teaching methods + 98
// production probes + the _teachHebbian substrate fix + _gateHistory
// telemetry. Any v4 save has recurrent matrix + cross-projection
// weights trained against the OLD ELA-K _teachVocabList +
// _teachSentenceList word-list pattern plus the pre-fix free↔sem
// broken binding. Loading that state would contaminate the current
// direct-pattern teaching. V5 rejection forces a clean boot with full
// curriculum re-run under the current equational methods.
// VERSION 6 — MIND-SPACE INTEGRATION + SENSORY REGION layout change. Ships equational vision (LLM
// describer removed), bidirectional imagine-workspace, thought-ops + synesthesia + equational memory,
// the autonomous process governor, and TWO NEW cortical regions (gustatory + somatosensory, carved
// from `free` in cluster.js). That region change shifts the cortex partition, so any v5 save's
// synapses/projection weights are allocated against the OLD layout and would corrupt if loaded. V6
// rejection forces a clean boot + FRESH full K→PhD walk under the new layout — exactly what we want.
const VERSION = 6;

export class BrainPersistence {

  /**
   * Save the brain's complete learned state.
   *
   * @param {UnityBrain} brain — the brain instance
   * @returns {boolean} — true if saved successfully
   */
  static save(brain) {
    try {
      const state = {
        version: VERSION,
        savedAt: new Date().toISOString(),
        time: brain.time,
        frameCount: brain.frameCount,
        // T15 — legacy drugState string kept for back-compat older saves,
        // but drugScheduler.serialize() is the authoritative record now.
        drugState: brain._drugStateLabel ? brain._drugStateLabel() : (brain.drugState || 'sober'),
        drugScheduler: brain.drugScheduler && typeof brain.drugScheduler.serialize === 'function'
          ? brain.drugScheduler.serialize()
          : null,
        reward: brain.reward,

        // Projection weights — the learned language→action mapping (native CSR)
        projections: brain.projections.map(proj => ({
          sourceSize: proj.source.size,
          targetSize: proj.target.size,
          format: 'csr',
          ...proj._sparse.serialize(),
        })),

        // Cluster synapse matrices — per-cluster learned connections
        clusterSynapses: {},

        // Oscillator coupling — learned coherence patterns
        oscCoupling: Array.from(brain.oscCoupling),

        // Episodic memory
        episodes: brain.memorySystem._episodes.map(ep => ({
          pattern: Array.from(ep.pattern),
          timestamp: ep.timestamp,
          trigger: ep.trigger,
          arousal: ep.arousal,
          valence: ep.valence,
          psi: ep.psi,
        })),

        // Motor channel rates (learned action preferences)
        motorChannels: Array.from(brain.motor.channelRates),

        // Semantic weights — learned word→action mapping from sensory processor
        semanticWeights: brain.sensory?._semanticWeights ? Object.fromEntries(
          Object.entries(brain.sensory._semanticWeights).map(([k, v]) => [k, Array.from(v)])
        ) : null,

        // R8 — semantic embedding refinements from sharedEmbeddings.
        // GloVe is the base table (loaded from CDN each session, not
        // persisted), but the online context refinement deltas that
        // Unity learns from live conversation DO persist across
        // restarts. This makes long-term learning stick — if Unity
        // learns that "unity" goes near "code" and "high" in her
        // conversations, that association survives a reload.
        embeddingRefinements: sharedEmbeddings?.serializeRefinements
          ? sharedEmbeddings.serializeRefinements()
          : null,

        // MS.I6 — equational visual memory. Unity's perceived/imagined forms persist AS
        // EQUATIONS (the field C, the .uvme medium): the visual cortex's recent field-Cs are
        // plain-serialisable (base64 coeff channels), so they survive a reload and can be
        // recalled + re-experienced (via imagine) next session. The equation IS the memory.
        visualMemory: (brain.visualCortex && Array.isArray(brain.visualCortex._recentRecs))
          ? brain.visualCortex._recentRecs.slice(-8)
          : null,
      };

      // T14.16 — persist T14-era language state on the cortex cluster.
      // Letter inventory (T14.1), learned language-statistics Maps (T14.13),
      // and identity-lock calibrated thresholds (T14.16.5) all live on
      // `brain.clusters.cortex` and survive a reload via this block.
      try {
        const cortex = brain.clusters?.cortex;
        if (cortex) {
          state.t14Language = {
            letterInventory: _t14SerializeInventory(),
            fineTypeTransitions: cortex.fineTypeTransitions
              ? mapOfMapsToJson(cortex.fineTypeTransitions) : null,
            sentenceFormSchemas: cortex.sentenceFormSchemas
              ? mapOfMapOfMapsToJson(cortex.sentenceFormSchemas) : null,
            sentenceFormTotals: cortex.sentenceFormTotals
              ? mapOfMapsToJson(cortex.sentenceFormTotals) : null,
            intentResponseMap: cortex.intentResponseMap
              ? mapOfMapsToJson(cortex.intentResponseMap) : null,
            identityThresholds: {
              ENGLISH_SURPRISE_THRESHOLD: cortex.ENGLISH_SURPRISE_THRESHOLD ?? null,
              ENGLISH_FINETYPE_MIN: cortex.ENGLISH_FINETYPE_MIN ?? null,
              HEALTH_ENTROPY_MIN: cortex.HEALTH_ENTROPY_MIN ?? null,
              HEALTH_VOCAB_MIN: cortex.HEALTH_VOCAB_MIN ?? null,
              HEALTH_WM_VARIANCE_MIN: cortex.HEALTH_WM_VARIANCE_MIN ?? null,
            },
            // T14.24 Session 1 — multi-subject curriculum grade state.
            // grades = per-subject {ela, math, science, social, art}.
            // grade = legacy ELA mirror kept for pre-T14.24 callers.
            // passedCells = flat list of "subject/grade" keys that have
            // cleared their gate at least once.
            // Session 17 — probeHistory tracks per-cell pass/fail counts
            // from continuous background self-testing so the state
            // survives reloads and Unity picks up where she left off.
            curriculum: {
              grades: cortex.grades && typeof cortex.grades === 'object' ? { ...cortex.grades } : null,
              passedCells: Array.isArray(cortex.passedCells) ? [...cortex.passedCells] : null,
              probeHistory: cortex.probeHistory && typeof cortex.probeHistory === 'object' ? { ...cortex.probeHistory } : null,
            },
          };
        }
      } catch (err) {
        console.warn('[Persistence] language state snapshot failed:', err?.message || err);
      }

      // Save cluster synapses — native CSR format (all clusters use SparseMatrix)
      for (const [name, cluster] of Object.entries(brain.clusters)) {
        state.clusterSynapses[name] = {
          size: cluster.size,
          format: 'csr',
          ...cluster.synapses.serialize(),
        };
      }

      const json = JSON.stringify(state);
      const sizeMB = (json.length / 1048576).toFixed(2);

      // Check if it fits in localStorage (~5MB limit)
      if (json.length > 4 * 1048576) {
        // Too big — save only projections and dictionary (most important).
        // Track which sections we DROP so the operator gets a real
        // diagnostic instead of a generic "saved minimal" log line.
        // Problems.md High finding: silent data loss. The fallback
        // path used to log at `console.log` and not name the dropped
        // sections, so the operator had no signal that episodic
        // memory + cluster synapses + semantic weights + the t14
        // language block had just been silently discarded.
        const droppedSections = [];
        if (state.clusterSynapses) droppedSections.push('clusterSynapses');
        if (state.episodes) droppedSections.push('episodes');
        if (state.semanticWeights) droppedSections.push('semanticWeights');
        if (state.embeddingRefinements) droppedSections.push('embeddingRefinements');
        if (state.t14Language) droppedSections.push('t14Language');
        if (state.visualMemory) droppedSections.push('visualMemory');
        const minimal = {
          version: VERSION,
          savedAt: state.savedAt,
          time: state.time,
          drugState: state.drugState,
          projections: state.projections,
          oscCoupling: state.oscCoupling,
          motorChannels: state.motorChannels,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
        console.error(
          `[Persistence] ⚠ Saved MINIMAL state — full was ${sizeMB}MB > 4MB cap. ` +
          `DROPPED: ${droppedSections.join(', ') || '(none — but state still exceeded cap)'}. ` +
          `Episodic memory + cluster synapses + semantic weights are NOT in this save. ` +
          `Reload will restore an attenuated brain.`
        );
      } else {
        localStorage.setItem(STORAGE_KEY, json);
        console.log(`[Persistence] Saved full brain state: ${sizeMB}MB`);
      }

      return true;
    } catch (err) {
      console.warn('[Persistence] Save failed:', err.message);
      return false;
    }
  }

  /**
   * Load saved brain state and apply to the brain instance.
   *
   * @param {UnityBrain} brain — the brain instance to restore
   * @returns {boolean} — true if loaded successfully
   */
  static load(brain) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      console.log('[Persistence] No saved brain state found — starting fresh');
      return false;
    }

    // Explicit JSON parse handler — corruption needs a recovery copy
    // and a distinct error message so the operator can tell "no save
    // state" from "save state corrupted". Problems.md Low finding.
    let state;
    try {
      state = JSON.parse(raw);
    } catch (err) {
      const corruptKey = `${STORAGE_KEY}__corrupt`;
      try {
        localStorage.setItem(corruptKey, raw);
        console.error(
          `[Persistence] Save state JSON CORRUPTED — NOT auto-clearing. ` +
          `Raw state copied to '${corruptKey}' for manual recovery. ` +
          `Parse error: ${err.message}`
        );
      } catch (backupErr) {
        console.error(
          `[Persistence] Save state JSON CORRUPTED + backup write failed ('${backupErr.message}'). ` +
          `Original raw state remains at '${STORAGE_KEY}' — clear by hand once recovered. ` +
          `Parse error: ${err.message}`
        );
      }
      return false;
    }

    // Version check — DON'T destructively wipe on mismatch. Move
    // the prior-version state to a backup key so the operator can
    // recover if the version bump turns out to be premature or buggy.
    // Problems.md High finding: original implementation called
    // `localStorage.removeItem(STORAGE_KEY)` on any version mismatch
    // with no backup, leaving zero recourse.
    if (state.version !== VERSION) {
      const backupKey = `${STORAGE_KEY}__backup_v${state.version}`;
      try {
        localStorage.setItem(backupKey, raw);
        console.warn(
          `[Persistence] Version mismatch: saved=${state.version}, current=${VERSION}. ` +
          `Prior-version state saved to '${backupKey}' for one-cycle recovery — clear that key once you're confident the bump is stable.`
        );
      } catch (backupErr) {
        console.warn(
          `[Persistence] Version mismatch: saved=${state.version}, current=${VERSION}. ` +
          `Could not write backup ('${backupErr.message}') — proceeding with destructive clear since localStorage is full.`
        );
      }
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }

    // Section-by-section restore with per-section try/catch + counters.
    // Problems.md Medium finding: prior implementation wrapped the
    // ENTIRE restore body in one try, so a single bad field anywhere
    // (corrupted episode pattern, wrong-shape clusterSynapse entry,
    // broken t14Language sub-object) corrupted the whole load. Now
    // each section is independent — projections can survive even when
    // episodes are malformed, etc.
    const restored = {};
    const failed = {};

    // Restore projection weights — native CSR only (all projections use SparseMatrix)
    try {
      if (state.projections && state.projections.length === brain.projections.length) {
        let ok = 0;
        for (let i = 0; i < brain.projections.length; i++) {
          const saved = state.projections[i];
          const proj = brain.projections[i];
          if (
            saved.sourceSize === proj.source.size &&
            saved.targetSize === proj.target.size &&
            saved.format === 'csr' &&
            proj._sparse
          ) {
            proj._sparse = SparseMatrix.deserialize(saved, { wMin: -0.5, wMax: 1.0 });
            ok++;
          }
        }
        restored.projections = `${ok}/${brain.projections.length}`;
      }
    } catch (err) {
      failed.projections = err.message;
    }

    // Restore cluster synapses — native CSR only (all clusters use SparseMatrix)
    try {
      if (state.clusterSynapses) {
        let ok = 0;
        const total = Object.keys(state.clusterSynapses).length;
        for (const [name, saved] of Object.entries(state.clusterSynapses)) {
          const cluster = brain.clusters[name];
          if (!cluster || saved.size !== cluster.size || saved.format !== 'csr') continue;
          cluster.synapses = SparseMatrix.deserialize(saved, { wMin: -2.0, wMax: 2.0 });
          ok++;
        }
        restored.clusterSynapses = `${ok}/${total}`;
      }
    } catch (err) {
      failed.clusterSynapses = err.message;
    }

    // Restore oscillator coupling
    try {
      if (state.oscCoupling && state.oscCoupling.length === brain.oscCoupling.length) {
        brain.oscCoupling = new Float64Array(state.oscCoupling);
        restored.oscCoupling = 'ok';
      }
    } catch (err) {
      failed.oscCoupling = err.message;
    }

    // Restore episodic memory
    try {
      if (state.episodes) {
        let ok = 0;
        for (const ep of state.episodes) {
          try {
            brain.memorySystem._episodes.push({
              pattern: new Float64Array(ep.pattern),
              timestamp: ep.timestamp,
              trigger: ep.trigger,
              arousal: ep.arousal,
              valence: ep.valence,
              psi: ep.psi,
            });
            ok++;
          } catch {
            // Per-episode skip — one bad pattern doesn't lose the rest.
          }
        }
        restored.episodes = `${ok}/${state.episodes.length}`;
      }
    } catch (err) {
      failed.episodes = err.message;
    }

    // Restore motor channel rates
    try {
      if (state.motorChannels) {
        for (let i = 0; i < Math.min(state.motorChannels.length, brain.motor.channelRates.length); i++) {
          brain.motor.channelRates[i] = state.motorChannels[i];
        }
        restored.motorChannels = 'ok';
      }
    } catch (err) {
      failed.motorChannels = err.message;
    }

    // Restore semantic weights
    try {
      if (state.semanticWeights && brain.sensory?._semanticWeights) {
        let ok = 0;
        const total = Object.keys(state.semanticWeights).length;
        for (const [key, arr] of Object.entries(state.semanticWeights)) {
          if (brain.sensory._semanticWeights[key] && arr.length === brain.sensory._semanticWeights[key].length) {
            brain.sensory._semanticWeights[key] = new Float64Array(arr);
            ok++;
          }
        }
        restored.semanticWeights = `${ok}/${total}`;
      }
    } catch (err) {
      failed.semanticWeights = err.message;
    }

    // R8 — restore embedding refinements learned in past sessions.
    try {
      if (state.embeddingRefinements && sharedEmbeddings?.loadRefinements) {
        sharedEmbeddings.loadRefinements(state.embeddingRefinements);
        restored.embeddingRefinements = 'ok';
      }
    } catch (err) {
      failed.embeddingRefinements = err.message;
    }

    // MS.I6 — restore equational visual memory (the field-C / .uvme medium). Past-session
    // perceived/imagined forms come back as equations she can recall + re-experience (imagine).
    try {
      if (Array.isArray(state.visualMemory) && brain.visualCortex) {
        const recs = state.visualMemory.filter(r => r && r.channels).slice(-8);
        brain.visualCortex._recentRecs = recs;
        if (recs.length) brain.visualCortex._lastRec = recs[recs.length - 1];
        restored.visualMemory = `${recs.length}`;
      }
    } catch (err) {
      failed.visualMemory = err?.message || String(err);
    }

    // T14.16 — restore T14 language state onto the cortex cluster
    try {
      if (state.t14Language) {
        const cortex = brain.clusters?.cortex;
        if (cortex) {
          if (Array.isArray(state.t14Language.letterInventory)) {
            _t14LoadInventory(state.t14Language.letterInventory);
          }
          if (state.t14Language.fineTypeTransitions) {
            cortex.fineTypeTransitions = jsonToMapOfMaps(state.t14Language.fineTypeTransitions);
          }
          if (state.t14Language.sentenceFormSchemas) {
            cortex.sentenceFormSchemas = jsonToMapOfMapOfMaps(state.t14Language.sentenceFormSchemas);
          }
          if (state.t14Language.sentenceFormTotals) {
            cortex.sentenceFormTotals = jsonToMapOfMaps(state.t14Language.sentenceFormTotals);
          }
          if (state.t14Language.intentResponseMap) {
            cortex.intentResponseMap = jsonToMapOfMaps(state.t14Language.intentResponseMap);
          }
          if (state.t14Language.identityThresholds) {
            const th = state.t14Language.identityThresholds;
            if (th.ENGLISH_SURPRISE_THRESHOLD != null) cortex.ENGLISH_SURPRISE_THRESHOLD = th.ENGLISH_SURPRISE_THRESHOLD;
            if (th.ENGLISH_FINETYPE_MIN != null) cortex.ENGLISH_FINETYPE_MIN = th.ENGLISH_FINETYPE_MIN;
            if (th.HEALTH_ENTROPY_MIN != null) cortex.HEALTH_ENTROPY_MIN = th.HEALTH_ENTROPY_MIN;
            if (th.HEALTH_VOCAB_MIN != null) cortex.HEALTH_VOCAB_MIN = th.HEALTH_VOCAB_MIN;
            if (th.HEALTH_WM_VARIANCE_MIN != null) cortex.HEALTH_WM_VARIANCE_MIN = th.HEALTH_WM_VARIANCE_MIN;
          }
          // T14.24 Session 1 — restore multi-subject curriculum state.
          if (state.t14Language.curriculum) {
            const c = state.t14Language.curriculum;
            if (c.grades && typeof c.grades === 'object') {
              cortex.grades = {
                ela: c.grades.ela || 'pre-K',
                math: c.grades.math || 'pre-K',
                science: c.grades.science || 'pre-K',
                social: c.grades.social || 'pre-K',
                art: c.grades.art || 'pre-K',
                life: c.grades.life || 'pre-K',
              };
            }
            if (Array.isArray(c.passedCells)) cortex.passedCells = [...c.passedCells];
            // T14.24 Session 17 — restore continuous self-testing state
            if (c.probeHistory && typeof c.probeHistory === 'object') {
              cortex.probeHistory = { ...c.probeHistory };
            }
          }
          // After restoring cluster state, re-run setCluster on the
          // LanguageCortex wrapper so its local Maps re-point at the
          // freshly-restored cluster Maps by identity (T14.13 bridge).
          if (typeof brain.innerVoice?.languageCortex?.setCluster === 'function') {
            brain.innerVoice.languageCortex.setCluster(cortex);
          }
          restored.t14Language = 'ok';
        }
      }
    } catch (err) {
      failed.t14Language = err?.message || String(err);
    }

    // Restore metadata
    // T15 — if the scheduler can be rehydrated, do that. Otherwise fall
    // back to the legacy drugState string (treated as decorative — no
    // fake ingestion events created to preserve the old static label).
    try {
      if (state.drugScheduler && brain.drugScheduler && typeof brain.drugScheduler.load === 'function') {
        brain.drugScheduler.load(state.drugScheduler);
        if (typeof brain._refreshBrainParamsFromScheduler === 'function') {
          brain._refreshBrainParamsFromScheduler();
        }
        restored.drugScheduler = 'ok';
      } else if (state.drugState && !brain.drugScheduler) {
        // Legacy save from pre-T15. Just keep the string field if brain has
        // no scheduler (shouldn't happen post-T15 but defensive).
        brain.drugState = state.drugState;
        restored.drugState = 'legacy';
      }
    } catch (err) {
      failed.drugScheduler = err?.message || String(err);
    }
    if (state.reward) brain.reward = state.reward;

    // Per-section restore summary — replaces the old all-or-nothing
    // success log so the operator can tell exactly what came back vs
    // what got skipped due to per-section corruption.
    const restoredEntries = Object.entries(restored).map(([k, v]) => `${k}=${v}`).join(', ');
    const failedEntries = Object.entries(failed).map(([k, v]) => `${k}(${v})`).join(', ');
    console.log(
      `[Persistence] Brain restored from ${state.savedAt} (t=${(state.time ?? 0).toFixed(1)}s) — ` +
      `restored: ${restoredEntries || 'none'}` +
      (failedEntries ? ` — FAILED: ${failedEntries}` : '')
    );
    return true;
  }

  /**
   * Export brain state as a downloadable JSON file.
   * "Transfer Unity's memory to another device."
   *
   * @param {UnityBrain} brain
   * @returns {string} — data URL for download
   */
  static export(brain) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Save first, then export
      BrainPersistence.save(brain);
    }
    const data = localStorage.getItem(STORAGE_KEY) || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    return URL.createObjectURL(blob);
  }

  /**
   * Import brain state from a JSON file.
   *
   * @param {string} json — raw JSON string
   * @param {UnityBrain} brain
   * @returns {boolean}
   */
  static import(json, brain) {
    try {
      const state = JSON.parse(json);
      if (state.version !== VERSION) {
        console.warn('[Persistence] Import version mismatch');
        return false;
      }
      localStorage.setItem(STORAGE_KEY, json);
      return BrainPersistence.load(brain);
    } catch (err) {
      console.warn('[Persistence] Import failed:', err.message);
      return false;
    }
  }

  /**
   * Clear all saved brain state. Factory reset.
   */
  static clear() {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Persistence] Brain state cleared — next boot starts fresh');
  }
}
