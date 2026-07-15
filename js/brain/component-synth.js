/**
 * component-synth.js — Equational Component Synthesis (R6.2)
 *
 * When the BG motor action selects `build_ui`, this module produces
 * a ready-to-inject sandbox component spec without calling any AI.
 * The pipeline is:
 *
 *   1. Parse `docs/component-templates.txt` at boot into a library
 *      of primitives. Each primitive has:
 *        - id (kebab-case name)
 *        - description (one sentence, used for semantic matching)
 *        - html / css / js template strings
 *      The file itself is corpus data (same rule as Ultimate Unity.txt
 *      and english-baseline.txt) — templates are authored in the text
 *      file, NOT hardcoded in source here.
 *
 *   2. For every primitive description, compute its semantic embedding
 *      via `sharedEmbeddings.getSentenceEmbedding(description)` at
 *      boot. These are the "primitive centroids" — each one is a 50d
 *      GloVe vector representing what the primitive is for.
 *
 *   3. When `generate(userRequest, brainState)` is called:
 *      a. Compute the user request's sentence embedding
 *      b. Cosine against every primitive centroid
 *      c. Pick the highest-scoring primitive
 *      d. Fill the template's html/css/js strings (no placeholder
 *         substitution for now — the templates are complete as-is,
 *         and params can be extended later via `{{var}}` tokens)
 *      e. Generate a unique component id from a cortex pattern hash
 *      f. Return { id, html, css, js }
 *
 *   4. If no primitive scores above a minimum threshold (user asked
 *      for something Unity doesn't have a template for), return null.
 *      The calling code falls through to a verbal response.
 *
 * Zero hardcoded component specs in this source file. Every HTML,
 * CSS, and JS string lives in docs/component-templates.txt and is
 * parseable / editable / extendable there. Adding a new primitive =
 * appending a new `=== PRIMITIVE: name ===` block to the corpus.
 */

import { sharedEmbeddings } from './embeddings.js';

// Minimum semantic similarity to pick a template. Below this, the
// synth declines — user's request doesn't match any known primitive
// closely enough. Tuned empirically: GloVe sentence cosines between
// "calculator" and "calculator with buttons" land ~0.85+, between
// "todo list" and "list items" ~0.70, totally unrelated requests
// land ~0.10-0.30. 0.40 is a permissive floor that accepts near-
// synonyms but rejects unrelated requests.
const MIN_MATCH_SCORE = 0.40;

export class ComponentSynth {
  constructor() {
    this._primitives = [];  // { id, description, descEmbed, html, css, js }
    this._loaded = false;
  }

  /**
   * Parse a template corpus file. Called from engine.js boot after
   * the corpus is fetched. The parser handles the `=== PRIMITIVE:
   * id ===` / `DESCRIPTION:` / `HTML:` / `END_HTML` / `CSS:` /
   * `END_CSS` / `JS:` / `END_JS` grammar documented in the file.
   *
   * Comment lines starting with `#` at the top of the file are
   * skipped. Blank lines are preserved inside template blocks.
   *
   * @param {string} text — full file contents
   * @returns {number} — number of primitives parsed
   */
  loadTemplates(text) {
    if (!text || typeof text !== 'string') return 0;
    this._primitives = [];

    // Split into blocks on the === PRIMITIVE marker
    const blockRegex = /===\s*PRIMITIVE:\s*([a-z0-9-]+)\s*===([\s\S]*?)(?====\s*PRIMITIVE:|$)/gi;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
      const id = match[1].trim();
      const body = match[2];

      // Extract description
      const descMatch = body.match(/DESCRIPTION:\s*(.+)/);
      const description = descMatch ? descMatch[1].trim() : '';

      // Extract html / css / js sections using END_ markers
      const htmlMatch = body.match(/HTML:\s*\n([\s\S]*?)\nEND_HTML/);
      const cssMatch = body.match(/CSS:\s*\n([\s\S]*?)\nEND_CSS/);
      const jsMatch = body.match(/JS:\s*\n([\s\S]*?)\nEND_JS/);

      const html = htmlMatch ? htmlMatch[1].trim() : '';
      const css = cssMatch ? cssMatch[1].trim() : '';
      const js = jsMatch ? jsMatch[1].trim() : '';

      // Skip primitives missing required fields
      if (!id || !description || (!html && !js)) {
        console.warn(`[ComponentSynth] Skipping malformed primitive "${id}"`);
        continue;
      }

      // Compute the description's semantic embedding once at load
      // time so matching is fast at generation time.
      const descEmbed = sharedEmbeddings.getSentenceEmbedding(description);

      this._primitives.push({ id, description, descEmbed, html, css, js });
    }

    this._loaded = true;
    console.log(`[ComponentSynth] Loaded ${this._primitives.length} component templates`);
    return this._primitives.length;
  }

  /**
   * Produce a sandbox component spec for the user's build request.
   *
   * @param {string} userRequest — what the user asked for ("build me
   *   a timer", "make a counter", etc.)
   * @param {object} brainState — full brain state from engine.getState
   *   (arousal, valence, cortex pattern, etc.) — used for future
   *   equation-derived parameter filling
   * @returns {{ id, html, css, js }|null} — spec ready for
   *   `sandbox.inject()`, or null if no primitive matches
   */
  generate(userRequest, brainState = {}) {
    if (!this._loaded || this._primitives.length === 0) {
      console.warn('[ComponentSynth] Cannot generate — templates not loaded');
      return null;
    }
    if (!userRequest || typeof userRequest !== 'string') return null;

    const parsed = brainState.parsed || null;
    const cortexEntityVec = this._cortexEntityVec(brainState);
    const pick = this._pickPrimitive(userRequest, parsed, cortexEntityVec);
    if (!pick) {
      console.log(`[ComponentSynth] No primitive matches "${userRequest.slice(0, 40)}"`);
      return null;
    }
    console.log(`[ComponentSynth] Matched "${userRequest.slice(0, 40)}" → ${pick.prim.id} @ ${pick.score.toFixed(2)}`);
    return this._buildSpec(pick.prim, pick.score, brainState, parsed);
  }

  /**
   * MULTI-PRIMITIVE COMPOSITION — "build a clock and a calculator", "a dashboard
   * with a timer and a todo list" → assemble SEVERAL primitives into one build.
   * Splits the request on conjunctions/commas, matches each part, and returns
   * one spec per DISTINCT primitive. Each spec is rendered in its OWN
   * Shadow-DOM-isolated component by the sandbox, so concatenating them has no
   * selector/JS collisions (that is exactly why isolation matters here). The
   * whole-request best match is always the primary, so a plain single-thing
   * request still returns exactly one spec. Extra parts must clear a slightly
   * higher bar than the primary so a weak/noise sub-phrase never bolts on a
   * spurious component.
   *
   * @returns {{ composite: boolean, specs: Array }|null} specs (1+) or null.
   */
  generateMany(userRequest, brainState = {}) {
    if (!this._loaded || this._primitives.length === 0) return null;
    if (!userRequest || typeof userRequest !== 'string') return null;

    const parsed = brainState.parsed || null;
    const cortexEntityVec = this._cortexEntityVec(brainState);

    const chosen = [];
    const seen = new Set();
    // Primary: the whole request (captures single-concept intent incl. names
    // with internal conjunctions like "rock paper and scissors").
    const primary = this._pickPrimitive(userRequest, parsed, cortexEntityVec);
    if (primary) { chosen.push(primary); seen.add(primary.prim.id); }
    // Extra components: one per conjunction-split part, stricter threshold,
    // deduped against what's already chosen.
    for (const part of this._splitRequest(userRequest)) {
      const pick = this._pickPrimitive(part, parsed, cortexEntityVec);
      if (pick && pick.score >= MIN_MATCH_SCORE + 0.05 && !seen.has(pick.prim.id)) {
        seen.add(pick.prim.id);
        chosen.push(pick);
      }
    }
    if (chosen.length === 0) {
      console.log(`[ComponentSynth] No primitive matches "${userRequest.slice(0, 40)}"`);
      return null;
    }
    const specs = chosen.map(p => this._buildSpec(p.prim, p.score, brainState, parsed));
    if (specs.length > 1) {
      console.log(`[ComponentSynth] Composed ${specs.length}: ${chosen.map(p => p.prim.id).join(' + ')}`);
    } else {
      console.log(`[ComponentSynth] Matched "${userRequest.slice(0, 40)}" → ${chosen[0].prim.id} @ ${chosen[0].score.toFixed(2)}`);
    }
    return { composite: specs.length > 1, specs };
  }

  /**
   * Split a build request into candidate sub-requests on conjunctions + commas.
   * "a timer and a calculator, plus a clock" → ["a timer","a calculator","a clock"].
   * Returns [] when there is no conjunction (so single-concept requests don't
   * fan out). Parts shorter than 3 chars are dropped.
   */
  _splitRequest(req) {
    const lower = String(req).toLowerCase().trim();
    if (!/(,|\sand\s|\splus\s|\swith\s|\sthen\s)/.test(lower)) return [];
    return lower
      .split(/\s*,\s*|\s+and\s+|\s+plus\s+|\s+with\s+|\s+then\s+/)
      // AUDIT-L2 — a comma-split segment can keep a leading connector word
      // ("a clock, plus a calendar" → "plus a calendar") because the split
      // delimiters require surrounding spaces. Strip a leading connector so
      // the primitive match sees "a calendar", not "plus a calendar".
      .map(s => s.trim().replace(/^(?:plus|and|with|then)\s+/, ''))
      .filter(s => s.length >= 3);
  }

  /**
   * T14.17 — cortex entity readout vector (what the cortex is representing now),
   * or null. Extracted so single + multi generation share one source.
   */
  _cortexEntityVec(brainState) {
    const cortex = brainState && brainState.cortexCluster;
    if (!cortex || typeof cortex.entityReadout !== 'function') return null;
    const readout = cortex.entityReadout();
    if (!readout || readout.length === 0) return null;
    let norm = 0;
    for (let i = 0; i < readout.length; i++) norm += readout[i] * readout[i];
    return norm > 0.01 ? readout : null;
  }

  /**
   * Pick the best-matching primitive for one request string. Semantic cosine
   * (literal text) + optional cortex-entity cosine (0.25 weight) + structural
   * parser-type bonus (0.35). Returns { prim, score } or null below threshold.
   */
  _pickPrimitive(userRequest, parsed, cortexEntityVec) {
    const parsedTypes = (parsed?.entities?.componentTypes || []).map(t => t.replace(/s$/, ''));
    const userEmbed = sharedEmbeddings.getSentenceEmbedding(userRequest);
    let bestScore = -1, bestPrim = null;
    for (const prim of this._primitives) {
      let score = sharedEmbeddings.similarity(userEmbed, prim.descEmbed);
      if (cortexEntityVec) {
        score += sharedEmbeddings.similarity(cortexEntityVec, prim.descEmbed) * 0.25;
      }
      if (parsedTypes.length > 0) {
        for (const pt of parsedTypes) {
          if (prim.id === pt || prim.id.startsWith(pt + '-') || prim.id.endsWith('-' + pt)) { score += 0.35; break; }
        }
      }
      if (score > bestScore) { bestScore = score; bestPrim = prim; }
    }
    if (!bestPrim || bestScore < MIN_MATCH_SCORE) return null;
    return { prim: bestPrim, score: bestScore };
  }

  /**
   * Build a sandbox-ready spec from a chosen primitive: unique id from the
   * cortex pattern + `{{token}}` parameter fill from brain state.
   */
  _buildSpec(prim, score, brainState, parsed) {
    const suffix = this._suffixFromPattern(brainState.cortexPattern);
    const id = `${prim.id}-${suffix}`;
    const params = this._deriveParams(brainState, parsed);
    const fill = (s) => this._fillParams(s, params);
    return {
      id,
      html: fill(prim.html),
      css: fill(prim.css),
      js: fill(prim.js),
      _primitive: prim.id,
      _matchScore: score,
      _parsedTypes: (parsed?.entities?.componentTypes || []).map(t => t.replace(/s$/, '')),
      _parsedColors: parsed?.entities?.colors || [],
      _parsedActions: parsed?.entities?.actions || [],
      _params: params,
    };
  }

  /**
   * Derive `{{token}}` fill values from equational brain state. Pure, no AI.
   * @param {object} brainState — { cortexPattern, ... }
   * @param {object|null} parsed — language-cortex parse (may carry entities.colors)
   * @returns {object} token → value map
   */
  _deriveParams(brainState = {}, parsed = null) {
    const named = parsed?.entities?.colors?.[0];
    // A user-named color (CSS accepts 'red'/'cyan'/etc) wins; otherwise the
    // cortex pattern picks the hue — her state, her palette.
    const accent = named ? String(named) : this._hueFromPattern(brainState.cortexPattern);
    return { accent };
  }

  /**
   * Map a cortex activation pattern to a stable CSS hue. Same neural state →
   * same color (so a rebuild in the same state reuses the palette); different
   * states drift the hue. Falls back to Unity's signature magenta when no
   * pattern is available.
   */
  _hueFromPattern(cortexPattern) {
    if (!cortexPattern || !cortexPattern.length) return 'hsl(300, 85%, 62%)';  // AUDIT-N1 — was #ff00ff; use hsl() so the fallback matches the normal-path format
    let h = 0;
    const n = Math.min(16, cortexPattern.length);
    for (let i = 0; i < n; i++) h = (h + Math.floor((cortexPattern[i] + 1) * 180)) % 360;
    return `hsl(${h}, 85%, 62%)`;
  }

  /**
   * Replace `{{token}}` placeholders in a template string from the params map.
   * Unknown tokens are left intact (so a typo'd placeholder is visible, not
   * silently blanked). No-op on strings without placeholders.
   */
  _fillParams(str, params) {
    if (!str || str.indexOf('{{') === -1) return str;
    return str.replace(/\{\{(\w+)\}\}/g, (m, key) => (params && params[key] != null) ? String(params[key]) : m);
  }

  /**
   * Get stats about the loaded template library.
   */
  getStats() {
    return {
      loaded: this._loaded,
      count: this._primitives.length,
      primitives: this._primitives.map(p => ({ id: p.id, description: p.description })),
    };
  }

  /**
   * Generate an 8-char suffix from a cortex activation pattern.
   * The same pattern always produces the same suffix, so if Unity
   * rebuilds the same primitive in the same neural state, it
   * reuses the id (triggers sandbox replace semantics). Different
   * neural states produce different suffixes so she can have
   * multiple instances side by side when brain state drifts.
   */
  _suffixFromPattern(cortexPattern) {
    if (!cortexPattern || !cortexPattern.length) {
      // No pattern available — timestamp tail (still deterministic
      // within the same second so repeated calls don't spam ids)
      return String(Date.now()).slice(-8);
    }
    // Hash the first N dims of the pattern into 32 bits
    let hash = 0;
    const n = Math.min(16, cortexPattern.length);
    for (let i = 0; i < n; i++) {
      const v = Math.floor((cortexPattern[i] + 1) * 1000); // map [-1,1] → [0,2000]
      hash = ((hash << 5) - hash + v) | 0;
    }
    return Math.abs(hash).toString(36).padStart(6, '0').slice(0, 8);
  }
}
