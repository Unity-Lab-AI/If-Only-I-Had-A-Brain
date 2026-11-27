/**
 * THE SPEECH READOUT — what she is about to say, read from the state she is in.
 *
 *   score(word) = Σ over the ACTIVE units of the speaking state  W[unit][word]
 *   she says the word with the highest score.
 *
 * It is the sem → word_motor equation (active meaning cells drive word slots,
 * the strongest slot speaks) held in the form the equation actually has. On the
 * neuron sheet a tiled pattern lights every cell of a group identically, so the
 * 2.5 M-cell × 1.2 M-cell projection carried one number per (group, word slot)
 * and sampled it through 6 random wires per cell — a word slot read the last
 * word's identity through about one wire. Here every word slot reads every unit.
 *
 * THE STATE is sparse and built from parts that do not overlap (`stateUnits`):
 *   her last word (identity + meaning) · the word before it · the one before
 *   that · the pair and the triple as wholes · the gist of everything said so
 *   far · and, when someone spoke to her, what they said (exact line, its key
 *   word, its gist).
 * About 40–70 units are active out of ~9,900, so two different moments share
 * little, and one moment said twice is identical.
 *
 * THE RULE is "teach until she says it" (`teach`): look at what she would say
 * in this state; if it is not the taught word by a margin, raise the taught
 * word and lower the word that beat it, by exactly the step that closes the
 * gap. Nothing changes when she is already right, so a word taught in a
 * thousand contexts is not overwritten by each new one.
 *
 * Measured with her pre-K → grade-2 life stories (1,864 words, 13,580 taught
 * transitions): 93.8 % of taught transitions recalled after 4 visits, against
 * 1.1 % for the wiring and state this replaces.
 *
 * No words are stored here and nothing is retrieved: a row is a unit's weights
 * onto word slots, the same thing a synapse row is.
 */

const D = 300;                       // embedding dimensions

// ── Stripe layout. Each stripe is a run of units with its own meaning. ────────
const ID = 512;                      // identity stripes: K units of 512 per word
const CJ = 2048;                     // conjunction stripes (a pair / a triple / a whole heard line)
const L = (() => {
  let o = 0; const at = (n) => { const s = o; o += n; return s; };
  const l = {
    w1Id: at(ID), w1Mean: at(D),     // her last word: who it is, what it means
    w2Id: at(ID), w3Id: at(ID),      // the two words before it
    gist: at(D),                     // everything said so far (what was said to her + her words)
    pair: at(CJ), triple: at(CJ),    // her last two / three words as one thing
    heardLine: at(CJ),               // the exact line said to her
    heardKey: at(ID), heardGist: at(D),
    concept: at(ID), conceptMean: at(D),   // a thing in mind, to be named: who it is, what it means
  };
  l.G = o; return l;
})();
const K = { w1: 8, mean: 4, w2: 6, w3: 4, gist: 12, conj: 6, heardKey: 8, concept: 8, conceptMean: 8 };

/** The slot that means "the line is finished". Passed as `target` to teach(). */
export const SPEECH_END = -2;

const MARGIN = 0.1;                  // per active unit: the taught word must lead by 0.1 × (active units)
const TRIES = 4;                     // rivals corrected per teach
const W_MAX = 8;                     // weight bound
const GROW = 2048;                   // word capacity grows in steps

function h32(str, salt) {
  let h = (2166136261 ^ Math.imul(salt + 1, 0x9E3779B1)) >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
/** K distinct units of `span`, each from its own hash of (text, salt). */
function hashUnits(text, k, span, salt, base, out) {
  const start = out.length;
  for (let s = 0; out.length - start < k && s < k * 8; s++) {
    const u = base + (h32(text, salt * 131 + s) % span);
    let dup = false; for (let i = start; i < out.length; i++) if (out[i] === u) { dup = true; break; }
    if (!dup) out.push(u);
  }
}
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z'\s-]+/g, ' ').split(/\s+/).filter(Boolean);

export class SpeechReadout {
  constructor(embeddings) {
    this.emb = embeddings;
    this.G = L.G;
    this.rows = new Array(L.G).fill(null);   // rows[unit] = Float32Array(capacity) once a unit has been taught
    this.endRow = new Float32Array(L.G);     // each unit's weight onto "the line is finished"
    this.cap = 0;                            // word capacity of every allocated row
    this.mu = null;                          // the common part of every word vector, removed before a meaning is read
    this._score = new Float32Array(0);
    this.stats = { teaches: 0, alreadyRight: 0, corrections: 0, pushes: 0, says: 0 };
  }

  // ── Meaning ────────────────────────────────────────────────────────────────
  /** The vector every word shares, so a meaning stripe carries what is DIFFERENT
   *  about a word. Fixed once (the table's most frequent words) and saved. */
  _mean() {
    if (this.mu) return this.mu;
    const mu = new Float64Array(D); let n = 0;
    const table = this.emb && this.emb._embeddings;
    if (table && typeof table.values === 'function') {
      for (const v of table.values()) { for (let i = 0; i < D; i++) mu[i] += v[i]; if (++n >= 20000) break; }
    }
    if (n > 0) for (let i = 0; i < D; i++) mu[i] /= n;
    this.mu = mu; return mu;
  }
  /** The k most positive dimensions of (vec − common part), as units at `base`. */
  _meaningUnits(vec, k, base, out, removeMean = true) {
    if (!vec || !vec.length) return;
    const mu = removeMean ? this._mean() : null;
    const best = new Int32Array(k).fill(-1); const bv = new Float64Array(k).fill(0);
    for (let d = 0; d < D && d < vec.length; d++) {
      const v = vec[d] - (mu ? mu[d] : 0);
      if (!(v > bv[k - 1])) continue;
      let j = k - 1; while (j > 0 && v > bv[j - 1]) { bv[j] = bv[j - 1]; best[j] = best[j - 1]; j--; }
      bv[j] = v; best[j] = d;
    }
    for (let j = 0; j < k; j++) if (best[j] >= 0) out.push(base + best[j]);
  }
  _gist(words) {
    const g = new Float64Array(D); let n = 0;
    for (const w of words) { const e = this.emb.getEmbedding(w); if (!e) continue; for (let i = 0; i < D; i++) g[i] += e[i]; n++; }
    if (n > 0) for (let i = 0; i < D; i++) g[i] /= n;
    return n > 0 ? g : null;
  }

  // ── The ONE word code: who the word is + what it means. ───────────────────────
  /** Units for `word` placed at an identity stripe and (optionally) a meaning stripe. */
  wordUnits(word, idBase, kId, salt, out, meanBase = -1, kMean = 0) {
    hashUnits(word, kId, ID, salt, idBase, out);
    if (meanBase >= 0 && kMean > 0) this._meaningUnits(this.emb.getEmbedding(word), kMean, meanBase, out);
  }

  // ── States ────────────────────────────────────────────────────────────────────
  /**
   * The state before she says her next word.
   *   heard  = what was said to her ('' when the line is her own)
   *   prefix = the words she has said so far in this line
   */
  stateUnits(heard, prefix) {
    const out = [];
    const p = Array.isArray(prefix) ? prefix.filter(Boolean).map((w) => String(w).toLowerCase()) : [];
    const h = tokens(heard);
    const n = p.length;
    if (!n && !h.length) return out;
    const w1 = n >= 1 ? p[n - 1] : '^', w2 = n >= 2 ? p[n - 2] : '^', w3 = n >= 3 ? p[n - 3] : '^';
    if (n >= 1) this.wordUnits(w1, L.w1Id, K.w1, 1, out, L.w1Mean, K.mean);
    else hashUnits('^', K.w1, ID, 1, L.w1Id, out);                       // the start of her line
    hashUnits(w2, K.w2, ID, 2, L.w2Id, out);
    hashUnits(w3, K.w3, ID, 3, L.w3Id, out);
    hashUnits(w2 + ' ' + w1, K.conj, CJ, 7, L.pair, out);
    hashUnits(w3 + ' ' + w2 + ' ' + w1, K.conj, CJ, 9, L.triple, out);
    const g = this._gist(h.concat(p));
    if (g) this._meaningUnits(g, K.gist, L.gist, out);
    if (h.length) {
      hashUnits(h.join(' '), K.conj, CJ, 11, L.heardLine, out);
      const key = this._keyWord(h);
      if (key) hashUnits(key, K.heardKey, ID, 13, L.heardKey, out);
      const hg = this._gist(h);
      if (hg) this._meaningUnits(hg, K.gist, L.heardGist, out);
    }
    return out;
  }
  /** The word of a heard line that is least like every other word: the one it is about. */
  _keyWord(h) {
    const mu = this._mean(); let best = null, bestV = -1;
    for (const w of h) {
      const e = this.emb.getEmbedding(w); if (!e) continue;
      let v = 0; for (let i = 0; i < D; i++) { const x = e[i] - mu[i]; v += x * x; }
      if (v > bestV) { bestV = v; best = w; }
    }
    return best;
  }
  /** A thing in mind, to be named: the word's identity and its meaning. */
  conceptUnits(word) {
    const out = []; const w = String(word || '').toLowerCase().trim();
    if (!w) return out;
    this.wordUnits(w, L.concept, K.concept, 17, out, L.conceptMean, K.conceptMean);
    return out;
  }
  /**
   * A meaning in mind with no word attached (a mood, a memory, a topic vector):
   * the meaning half of the concept state, so naming generalises to it by what
   * the meaning is like. `feats` = the 300-d vectors written into sem; values of
   * 1.5 or more are identity markers, not meaning, and are left out.
   */
  meaningUnits(feats) {
    const out = []; const list = Array.isArray(feats) ? feats : [feats];
    const m = new Float64Array(D); let n = 0;
    for (const f of list) {
      if (!f || !f.length) continue;
      for (let i = 0; i < D && i < f.length; i++) { const v = f[i]; if (v < 1.5 && v > -1.5) m[i] += v; }
      n++;
    }
    if (!n) return out;
    for (let i = 0; i < D; i++) m[i] /= n;
    this._meaningUnits(m, K.conceptMean, L.conceptMean, out);
    return out;
  }

  // ── Read ──────────────────────────────────────────────────────────────────────
  _grow(nWords) {
    if (nWords <= this.cap) return;
    const cap = Math.ceil(nWords / GROW) * GROW;
    for (let u = 0; u < this.G; u++) {
      const r = this.rows[u]; if (!r) continue;
      const nr = new Float32Array(cap); nr.set(r); this.rows[u] = nr;
    }
    this.cap = cap;
  }
  /** Score of every word slot [0, nWords) in this state. The returned array is reused. */
  scores(units, nWords) {
    if (this._score.length < nWords) this._score = new Float32Array(Math.ceil(nWords / GROW) * GROW);
    const s = this._score; s.fill(0, 0, nWords);
    const n = Math.min(nWords, this.cap);
    for (let i = 0; i < units.length; i++) {
      const r = this.rows[units[i]]; if (!r) continue;
      for (let b = 0; b < n; b++) s[b] += r[b];
    }
    return s;
  }
  /** Score of "the line is finished" in this state. */
  endScore(units) { let e = 0; for (let i = 0; i < units.length; i++) e += this.endRow[units[i]]; return e; }
  /** Per-word means in the shape the emission argmax takes (score ÷ active units),
   *  with the end-of-line mean alongside as `.end`. */
  bucketMeans(units, nWords) {
    const s = this.scores(units, nWords); const out = new Float32Array(nWords);
    const d = Math.max(1, units.length);
    for (let b = 0; b < nWords; b++) out[b] = s[b] / d;
    out.end = this.endScore(units) / d;
    this.stats.says++;
    return out;
  }
  /** Where `target` ranks in this state (1 = she would say it). */
  rank(units, target, nWords) {
    if (!units.length || target >= nWords || (target < 0 && target !== SPEECH_END)) return -1;
    const s = this.scores(units, nWords); const e = this.endScore(units);
    const t = target === SPEECH_END ? e : s[target]; let r = 1;
    for (let b = 0; b < nWords; b++) if (b !== target && s[b] >= t) r++;
    if (target !== SPEECH_END && e >= t) r++;
    return r;
  }

  // ── Teach ─────────────────────────────────────────────────────────────────────
  _row(u) { let r = this.rows[u]; if (!r) { r = this.rows[u] = new Float32Array(this.cap); } return r; }
  /**
   * Teach until she says it: in this state, `target` must lead every other word
   * slot by MARGIN × (active units). Returns { right, updates } — `right` is
   * whether she already said it before any change.
   */
  teach(units, target, nWords, opts = {}) {
    const isEnd = target === SPEECH_END;
    if (!units || !units.length || target >= nWords || (target < 0 && !isEnd)) return { right: false, updates: 0 };
    this._grow(nWords);
    const margin = (opts.margin ?? MARGIN) * units.length;
    const tries = opts.tries ?? TRIES;
    const bump = (slot, d) => {                       // slot: a word index, or SPEECH_END
      for (let i = 0; i < units.length; i++) {
        if (slot === SPEECH_END) { const v = this.endRow[units[i]] + d; this.endRow[units[i]] = v > W_MAX ? W_MAX : v < -W_MAX ? -W_MAX : v; }
        else { const r = this._row(units[i]); const v = r[slot] + d; r[slot] = v > W_MAX ? W_MAX : v < -W_MAX ? -W_MAX : v; }
      }
    };
    // `opts.also` — other slots taught in this SAME state (a sentence start that
    // has several taught next words). They are not rivals: teaching one must not
    // push the others down, and saying any of them here is right.
    const also = opts.also && opts.also.size ? opts.also : null;
    let updates = 0, right = false;
    for (let t = 0; t < tries; t++) {
      const s = this.scores(units, nWords); const e = this.endScore(units);
      const tv = isEnd ? e : s[target];
      let rival = -1, rv = -Infinity;                 // the strongest OTHER slot, words and end alike
      let sib = -Infinity;                            // the strongest slot also taught here
      for (let b = 0; b < nWords; b++) {
        if (b === target) continue;
        if (also && also.has(b)) { if (s[b] > sib) sib = s[b]; continue; }
        if (s[b] > rv) { rv = s[b]; rival = b; }
      }
      if (!isEnd) { if (also && also.has(SPEECH_END)) { if (e > sib) sib = e; } else if (e > rv) { rv = e; rival = SPEECH_END; } }
      const none = rival === -1;
      if (t === 0) right = none ? Math.max(tv, sib) > 0 : Math.max(tv, sib) > rv;
      const loss = margin - (tv - (none ? 0 : rv));
      if (loss <= 0) break;
      const tau = loss / (2 * units.length) + 1e-4;
      bump(target, tau);
      if (!none) bump(rival, -tau);
      updates++;
    }
    this.stats.teaches++; if (right) this.stats.alreadyRight++; this.stats.corrections += updates;
    return { right, updates };
  }
  /** "Not this word, here": lower `word` until the best other slot leads it by the margin. */
  pushAway(units, word, nWords, opts = {}) {
    if (!units || !units.length || !(word >= 0) || word >= nWords) return false;
    this._grow(nWords);
    const s = this.scores(units, nWords);
    let rv = this.endScore(units); for (let b = 0; b < nWords; b++) if (b !== word && s[b] > rv) rv = s[b];
    const loss = (opts.margin ?? MARGIN) * units.length - (rv - s[word]);
    if (loss <= 0) return false;
    const tau = loss / units.length + 1e-4;
    for (let i = 0; i < units.length; i++) { const r = this._row(units[i]); const v = r[word] - tau; r[word] = v < -W_MAX ? -W_MAX : v; }
    this.stats.pushes++;
    return true;
  }

  // ── Save / restore ────────────────────────────────────────────────────────────
  /** { header, buffers } — header is JSON-safe; buffers are the taught rows in header order. */
  serialize(nWords) {
    const units = []; const buffers = [];
    const n = Math.min(nWords, this.cap);
    for (let u = 0; u < this.G; u++) {
      const r = this.rows[u]; if (!r) continue;
      units.push(u); buffers.push(Buffer.from(r.buffer, r.byteOffset, n * 4));
    }
    buffers.push(Buffer.from(this.endRow.buffer, this.endRow.byteOffset, this.G * 4));   // last: the end-of-line row
    return { header: { v: 1, G: this.G, nWords: n, units, mu: this.mu ? Array.from(this.mu) : null, stats: this.stats }, buffers };
  }
  restore(header, buf) {
    if (!header || header.v !== 1 || header.G !== this.G) return false;
    const n = header.nWords | 0; const need = header.units.length * n * 4 + this.G * 4;
    if (!buf || buf.length < need) return false;
    const f32 = (off, count) => new Float32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + count * 4));
    this.rows.fill(null); this.cap = 0; this._grow(Math.max(1, n));
    for (let i = 0; i < header.units.length; i++) {
      const r = new Float32Array(this.cap);
      r.set(f32(i * n * 4, n));
      this.rows[header.units[i]] = r;
    }
    this.endRow.set(f32(header.units.length * n * 4, this.G));
    if (Array.isArray(header.mu) && header.mu.length === D) this.mu = Float64Array.from(header.mu);
    if (header.stats) this.stats = { ...this.stats, ...header.stats };
    return true;
  }
  /** Counts for the dashboard: how much has been taught and how big it is. */
  summary() {
    let taughtUnits = 0; for (let u = 0; u < this.G; u++) if (this.rows[u]) taughtUnits++;
    return { units: this.G, taughtUnits, wordCapacity: this.cap, bytes: taughtUnits * this.cap * 4, ...this.stats };
  }
}

export const SPEECH_LAYOUT = L;
