/**
 * THE SPEECH READOUT — what she is about to say, read from the state she is in.
 *
 *   score(word) = Σ over the ACTIVE units of the speaking state  W[unit][word]
 *   she says the word with the highest score.
 *
 * It is the sem → word_motor equation (active meaning cells drive word slots,
 * the strongest slot speaks) held in the form the equation actually has: every
 * word slot can read every unit of the state.
 *
 * THE STATE (`stateUnits`) is sparse and built from parts that do not overlap.
 * Some parts are EXACT — this very moment (everything said to her plus every
 * word she has said so far), her last two / three / four words as one thing —
 * so a line she was taught comes back as taught. The others are SHARED between
 * moments that are alike — her last words one by one, what they mean, the gist
 * so far, each word that was said to her, its neighbouring pairs, the word it
 * was about — so a question worded differently still lands near its answer.
 * Her mood is part of the state too (`liveUnits`), so the same moment can come
 * out differently when she feels different.
 *
 * THE RULE is "teach until she says it" (`teach`): look at what she would say
 * in this state; if it is not the taught word by a margin, raise the taught
 * word and lower the word that beat it, by exactly the step that closes the
 * gap. Nothing changes when she is already right, so a word taught in a
 * thousand contexts is not overwritten by each new one. Several words taught in
 * the SAME state are all right there and are never pushed against each other.
 *
 * REHEARSAL: the readout keeps a sample of the moments it was taught and, while
 * new lessons run, goes back over old ones — checking, and correcting only the
 * ones a newer lesson disturbed. That is what keeps an early grade's lines from
 * being worn away by a later grade's.
 *
 * A unit's row holds weights only for the words it was ever taught about (a
 * short list), and becomes a plain array over the vocabulary only once it has
 * weights for a third of it — so size follows what she has learned.
 *
 * No words are stored here and nothing is retrieved: a row is a unit's weights
 * onto word slots, the same thing a synapse row is. Measured numbers live in
 * docs/THRESHOLD-DERIVATION.md.
 */

const D = 300;                       // embedding dimensions

// ── Stripe layout. Each stripe is a run of units with its own meaning. ────────
const ID = 1024;                     // identity stripes: K units of 1,024 per word
const CJ = 1 << 16;                  // exact stripes (a pair / triple / quad of her words)
const LINE = 1 << 17;                // this exact moment: what was said + every word of hers so far
const BAG = 2048;                    // each word that was said to her, wherever it stood
const BI = 1 << 15;                  // each neighbouring pair of words said to her
const POS = 64;                      // how far into her line she is
const LIVE = 64;                     // how she feels
const HP = 7;                        // places in her answer that hold what was said to her separately
const L = (() => {
  let o = 0; const at = (n) => { const s = o; o += n; return s; };
  const l = {
    w1Id: at(ID), w1Mean: at(D),     // her last word: who it is, what it means
    w2Id: at(ID), w3Id: at(ID),      // the two words before it
    opener: at(ID),                  // the word her line began with
    pos: at(POS),
    gist: at(D),                     // everything said so far (what was said to her + her words)
    pair: at(CJ), triple: at(CJ), quad: at(CJ),
    line: at(LINE),
    // What was said to her is held once PER PLACE in her answer (her first
    // word, her second … her seventh and on). Otherwise the state before her
    // first word is a part of every later state of the same answer, and the
    // words of one answer compete with each other on the same units: measured,
    // reworded questions lost their first word, then their second.
    heardBag: at(BAG * HP), heardBi: at(BI),
    heardKey: at(ID * HP), heardGist: at(D * HP),
    concept: at(ID), conceptMean: at(D),   // a thing in mind, to be named: who it is, what it means
    about: at(ID), aboutMean: at(D),       // what her own line is about, held while she says it
  };
  l.live = at(LIVE);                 // LAST: everything from here up is how she feels, not the moment
  l.G = o; return l;
})();
const K = { w1: 8, mean: 4, w2: 6, w3: 4, opener: 3, pos: 2, gist: 12, conj: 6, quad: 4, line: 6,
  bag: 3, bi: 2, heardKey: 8, heardGist: 12, concept: 8, conceptMean: 8, about: 8, aboutMean: 8, live: 2 };
const HEARD_MAX = 16;                // words of a heard line that enter the bag / pairs

/** The slot that means "the line is finished". Passed as `target` to teach(). */
export const SPEECH_END = -2;

const MARGIN = 0.1;                  // per active unit: the taught word must lead by 0.1 × (active units)
const TRIES = 4;                     // rivals corrected per teach
const W_MAX = 8;                     // weight bound
const MU_MIN_WORDS = 1000;           // the common-meaning vector is not fixed from fewer words than this
const REHEARSE_CAP = 200000;         // taught moments kept for rehearsal
const REHEARSE_EVERY = 1;            // one old moment is gone back over per this many teaches
const SAME_STATE_MAX = 64;           // words remembered as taught in one same state
const LIST_SCAN = 16;                // a row this short is searched by looking through it
const WIDE_MIN = 256;                // a row is never made a plain array below this many weights
const VOCAB_STEP = 2048;             // plain-array rows and the score buffer grow in these steps

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
/** A state lists each unit once. */
function unique(out) {
  if (out.length < 2) return out;
  const seen = new Set(); let w = 0;
  for (let i = 0; i < out.length; i++) { const u = out[i]; if (!seen.has(u)) { seen.add(u); out[w++] = u; } }
  out.length = w; return out;
}
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9'\s-]+/g, ' ').split(/\s+/).filter(Boolean);
const slotOf = (key, mask) => (Math.imul(key, 0x9E3779B1) >>> 0) & mask;
const clampW = (v) => (v > W_MAX ? W_MAX : v < -W_MAX ? -W_MAX : v);
const stepUp = (n) => Math.max(VOCAB_STEP, Math.ceil(n / VOCAB_STEP) * VOCAB_STEP);
/** An exact unit stands for one particular run of words (a pair, triple, quad, a whole moment, a heard pair). */
const isHeardPair = (u) => u >= L.heardBi && u < L.heardKey;
const isExact = (u) => (u >= L.pair && u < L.heardBag) || isHeardPair(u);

export class SpeechReadout {
  constructor(embeddings, opts = {}) {
    this.emb = embeddings;
    this.G = L.G;
    // A unit's row is one of:
    //   a LIST  — words it has a weight for (lk) and the weights (lv), ln of them,
    //             with a lookup table (lx: word → position + 1) once it is long;
    //   WIDE    — a plain array over word slots (wd), once it covers a third of the vocabulary.
    this.lk = new Array(L.G).fill(null);
    this.lv = new Array(L.G).fill(null);
    this.lx = new Array(L.G).fill(null);
    this.ln = new Int32Array(L.G);
    this.wd = new Array(L.G).fill(null);
    this.endW = new Float32Array(L.G);       // each unit's weight onto "the line is finished"
    this.use = new Uint32Array(L.G);         // times each unit has taken a correction
    this._share = new Float64Array(128);
    this.entries = 0;                        // weights held (word weights; the end weights are apart)
    this.wide = 0;                           // rows that are plain arrays
    this.nWords = 0;                         // the largest vocabulary a teach or read has named
    this.mu = null;                          // the common part of every word vector, removed before a meaning is read
    this.muWords = 0;
    // the last read: scores are valid for [0, _n) when _all, else for the words in _touched[0.._nt)
    this._score = new Float32Array(0);
    this._mark = new Int32Array(0);
    this._touched = new Int32Array(1024); this._nt = 0; this._epoch = 0; this._end = 0; this._all = false; this._n = 0;
    // rehearsal: a sample of taught moments — the state (without mood) and the words taught there
    this.rehearseCap = Number(opts.rehearseCap) >= 0 ? Number(opts.rehearseCap) : REHEARSE_CAP;
    this.rehearseEvery = Number(opts.rehearseEvery) > 0 ? Number(opts.rehearseEvery) : REHEARSE_EVERY;
    this.mem = [];                           // [{ key, units:Int32Array, targets:number[] }]
    this.memAt = new Map();                  // state key → index in mem
    this.memSeen = 0;                        // distinct moments ever offered
    this._rng = 0x2545F491;
    this.stats = { teaches: 0, alreadyRight: 0, corrections: 0, pushes: 0, says: 0, rehearsed: 0, rehearsalFixes: 0 };
  }

  // ── Meaning ────────────────────────────────────────────────────────────────
  /** The vector every word shares, so a meaning stripe carries what is DIFFERENT
   *  about a word. Fixed once the table holds enough words, and saved. */
  _mean() {
    if (this.mu) return this.mu;
    const mu = new Float64Array(D); let n = 0;
    const table = this.emb && this.emb._embeddings;
    if (table && typeof table.values === 'function') {
      for (const v of table.values()) { for (let i = 0; i < D; i++) mu[i] += v[i]; if (++n >= 20000) break; }
    }
    if (n > 0) for (let i = 0; i < D; i++) mu[i] /= n;
    if (n >= MU_MIN_WORDS) { this.mu = mu; this.muWords = n; }
    else if (!this._muWarned) {
      this._muWarned = true;
      try { console.warn(`[SpeechReadout] the word table holds ${n} vectors (< ${MU_MIN_WORDS}); the common-meaning vector is NOT fixed yet and meanings are read without it until the table is loaded.`); } catch { /* console unavailable */ }
    }
    return mu;
  }
  /** The k most positive dimensions of (vec − common part), as units at `base`. */
  _meaningUnits(vec, k, base, out) {
    if (!vec || !vec.length) return;
    const mu = this._mean();
    const best = new Int32Array(k).fill(-1); const bv = new Float64Array(k).fill(0);
    for (let d = 0; d < D && d < vec.length; d++) {
      const v = vec[d] - mu[d];
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
  wordUnits(word, idBase, kId, salt, out, meanBase = -1, kMean = 0) {
    hashUnits(word, kId, ID, salt, idBase, out);
    if (meanBase >= 0 && kMean > 0) this._meaningUnits(this.emb.getEmbedding(word), kMean, meanBase, out);
  }

  // ── States ────────────────────────────────────────────────────────────────────
  /**
   * The state before she says her next word.
   *   heard  = what was said to her ('' when the line is her own)
   *   prefix = the words she has said so far in this line
   *   about  = what her own line is about: a word, or the 300-d meaning(s) in
   *            her mind when no word is attached (a mood, a memory). It stays
   *            lit for the whole line, so a thought is a sentence ABOUT
   *            something and not only a chain of next words.
   */
  stateUnits(heard, prefix, about = null) {
    const out = [];
    const p = Array.isArray(prefix) ? prefix.filter(Boolean).map((w) => String(w).toLowerCase()) : [];
    const h = tokens(heard);
    const n = p.length;
    const topic = typeof about === 'string' ? about.toLowerCase().trim() : '';
    const topicFeats = (about && typeof about !== 'string') ? about : null;
    if (!n && !h.length && !topic && !topicFeats) return out;
    if (topic) this.wordUnits(topic, L.about, K.about, 35, out, L.aboutMean, K.aboutMean);
    else if (topicFeats) { const m = this._featsMean(topicFeats); if (m) this._meaningUnits(m, K.aboutMean, L.aboutMean, out); }
    // her own words so far
    if (n >= 1) this.wordUnits(p[n - 1], L.w1Id, K.w1, 1, out, L.w1Mean, K.mean);
    if (n >= 2) hashUnits(p[n - 2], K.w2, ID, 2, L.w2Id, out);
    if (n >= 3) hashUnits(p[n - 3], K.w3, ID, 3, L.w3Id, out);
    if (n >= 2) hashUnits(p[0], K.opener, ID, 23, L.opener, out);
    hashUnits('p' + Math.min(n, 12), K.pos, POS, 21, L.pos, out);
    if (n >= 2) hashUnits(p[n - 2] + ' ' + p[n - 1], K.conj, CJ, 7, L.pair, out);
    if (n >= 3) hashUnits(p[n - 3] + ' ' + p[n - 2] + ' ' + p[n - 1], K.conj, CJ, 9, L.triple, out);
    if (n >= 4) hashUnits(p[n - 4] + ' ' + p[n - 3] + ' ' + p[n - 2] + ' ' + p[n - 1], K.quad, CJ, 10, L.quad, out);
    // this exact moment
    hashUnits(h.join(' ') + '|' + p.join(' '), K.line, LINE, 25, L.line, out);
    const g = this._gist(h.concat(p));
    if (g) this._meaningUnits(g, K.gist, L.gist, out);
    // what was said to her, in parts a differently worded line still shares
    if (h.length) {
      const hw = h.length > HEARD_MAX ? h.slice(0, HEARD_MAX) : h;
      const at = Math.min(n, HP - 1);           // which place in her answer this is
      for (const w of hw) hashUnits(w, K.bag, BAG, 27, L.heardBag + at * BAG, out);
      for (let i = 1; i < hw.length; i++) hashUnits(at + ':' + hw[i - 1] + ' ' + hw[i], K.bi, BI, 29, L.heardBi, out);
      const key = this._keyWord(h);
      if (key) hashUnits(key, K.heardKey, ID, 13, L.heardKey + at * ID, out);
      const hg = this._gist(h);
      if (hg) this._meaningUnits(hg, K.heardGist, L.heardGist + at * D, out);
    }
    return unique(out);
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
    return unique(out);
  }
  /**
   * A meaning in mind with no word attached (a mood, a memory, a topic vector):
   * the meaning half of the concept state, so naming generalises to it by what
   * the meaning is like. `feats` = the 300-d vectors written into sem; values of
   * 1.5 or more are identity markers, not meaning, and are left out.
   */
  meaningUnits(feats) {
    const out = []; const m = this._featsMean(feats);
    if (m) this._meaningUnits(m, K.conceptMean, L.conceptMean, out);
    return out;
  }
  /** The mean of one or several 300-d meanings (identity markers ≥ 1.5 left out), or null. */
  _featsMean(feats) {
    const list = (Array.isArray(feats) && feats.length && typeof feats[0] !== 'number') ? feats : [feats];
    const m = new Float64Array(D); let n = 0;
    for (const f of list) {
      if (!f || !f.length) continue;
      for (let i = 0; i < D && i < f.length; i++) { const v = f[i]; if (v < 1.5 && v > -1.5) m[i] += v; }
      n++;
    }
    if (!n) return null;
    for (let i = 0; i < D; i++) m[i] /= n;
    return m;
  }
  /** What a line is about: the word in it that is least like every other word. */
  aboutOf(words) { return this._keyWord(Array.isArray(words) ? words : tokens(words)); }
  /**
   * How she feels, as units: pleasant ↔ unpleasant and calm ↔ stirred, each in
   * five steps. Added to whatever state she speaks or is taught in, so a word
   * taught while she felt one way leans toward that feeling afterwards.
   */
  liveUnits(valence, arousal) {
    const out = [];
    const step = (x, lo, hi) => { const t = (Number(x) - lo) / (hi - lo); return Math.max(0, Math.min(4, Math.floor((Number.isFinite(t) ? t : 0.5) * 5))); };
    hashUnits('v' + step(valence, -1, 1), K.live, LIVE, 31, L.live, out);
    hashUnits('a' + step(arousal, 0, 1), K.live, LIVE, 33, L.live, out);
    return unique(out);
  }

  // ── Rows ──────────────────────────────────────────────────────────────────────
  /** Position of `key` in unit u's list, or −1. */
  _find(u, key) {
    const n = this.ln[u]; const k = this.lk[u];
    const x = this.lx[u];
    if (!x) { for (let i = 0; i < n; i++) if (k[i] === key) return i; return -1; }
    const mask = x.length - 1; let j = slotOf(key, mask);
    for (;;) { const p = x[j]; if (p === 0) return -1; if (k[p - 1] === key) return p - 1; j = (j + 1) & mask; }
  }
  _index(u) {
    const n = this.ln[u]; const k = this.lk[u];
    let cap = 64; while (cap < n * 2 + 2) cap *= 2;
    const x = new Int32Array(cap); const mask = cap - 1;
    for (let i = 0; i < n; i++) { let j = slotOf(k[i], mask); while (x[j] !== 0) j = (j + 1) & mask; x[j] = i + 1; }
    this.lx[u] = x;
  }
  /** Add `d` to unit u's weight for word `key`. */
  _add(u, key, d) {
    const w = this.wd[u];
    if (w) {
      if (key >= w.length) { const nw = new Float32Array(stepUp(key + 1)); nw.set(w); this.wd[u] = nw; nw[key] = clampW(d); this.entries++; return; }
      if (w[key] === 0) this.entries++;
      w[key] = clampW(w[key] + d);
      return;
    }
    let k = this.lk[u];
    if (!k) { k = this.lk[u] = new Int32Array(4); this.lv[u] = new Float32Array(4); }
    const at = this._find(u, key);
    if (at >= 0) { this.lv[u][at] = clampW(this.lv[u][at] + d); return; }
    let n = this.ln[u];
    if (n === k.length) {
      const nk = new Int32Array(n * 2); nk.set(k); const nv = new Float32Array(n * 2); nv.set(this.lv[u]);
      k = this.lk[u] = nk; this.lv[u] = nv;
    }
    k[n] = key; this.lv[u][n] = clampW(d); this.ln[u] = ++n; this.entries++;
    if (n > LIST_SCAN) {
      const x = this.lx[u];
      if (!x || n * 2 + 2 > x.length) this._index(u);
      else { const mask = x.length - 1; let j = slotOf(key, mask); while (x[j] !== 0) j = (j + 1) & mask; x[j] = n; }
    }
    if (n >= WIDE_MIN && n * 3 > this.nWords) this._widen(u);
  }
  /** Turn unit u's list into a plain array over word slots. */
  _widen(u) {
    const n = this.ln[u]; const k = this.lk[u], v = this.lv[u];
    let top = this.nWords; for (let i = 0; i < n; i++) if (k[i] >= top) top = k[i] + 1;
    const w = new Float32Array(stepUp(top));
    for (let i = 0; i < n; i++) w[k[i]] = v[i];
    this.wd[u] = w; this.lk[u] = null; this.lv[u] = null; this.lx[u] = null; this.ln[u] = 0; this.wide++;
  }

  // ── What she says, held in her cells ────────────────────────────────────────────
  /**
   * Put the learned part in her cells. From here on the state lights cells
   * (`cellsOf`), every word's score is what the pathway delivers to that
   * word's own run of cells, and a lesson changes the pathway's wires — no
   * weight is kept in this object. The last run of cells stands for "the line
   * is finished". `matrix` is word-cell rows × state-cell columns.
   */
  attachPathway(matrix, opts = {}) {
    const cell = Math.max(1, Math.floor(opts.cellSize || 1));
    const buckets = Math.floor(matrix.rows / cell);
    if (buckets < 2) throw new Error(`[SpeechReadout] the speech pathway has room for ${buckets} word(s) at ${cell} cells a word`);
    this.path = {
      m: matrix, cell, buckets, end: buckets - 1, span: matrix.cols,
      per: Math.max(1, Math.floor(opts.cellsPerUnit || 4)),       // state cells one unit lights
      eta: typeof opts.eta === 'number' ? opts.eta : 0.05,          // one correction's step on a wire
      fan: matrix.rows > 0 ? matrix.nnz / matrix.rows : 0,          // wires a word cell has
    };
    return this.path;
  }
  /** The state cells these units light (region-relative, each listed once). */
  cellsOf(units) {
    const p = this.path; const seen = new Set();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      for (let s = 0; s < p.per; s++) {
        let h = (Math.imul(u + 1, 0x9E3779B1) ^ Math.imul(s + 7, 0x85EBCA6B)) >>> 0;
        h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15;
        seen.add((h >>> 0) % p.span);
      }
    }
    return Int32Array.from(seen);
  }
  /** The lead a taught word must have: what ONE correction adds to a word's cells in this state. */
  _cellMargin(cells) { const p = this.path; return p.eta * p.fan * cells.length / p.span; }
  _scoresCells(units, nWords) {
    const p = this.path;
    if (nWords > this.nWords) this.nWords = nWords;
    if (this._score.length < p.buckets) { this._score = new Float32Array(p.buckets); this._mark = new Int32Array(0); }
    const cells = this.cellsOf(units);
    p.m.bucketMeans(cells, p.cell, p.buckets, this._score);
    this._cells = cells;
    this._end = this._score[p.end];
    this._all = true; this._n = Math.min(nWords, p.end); this._nt = 0;
    return this._score;
  }
  /** `_fit` when the weights are her pathway's: raise the taught word's cells, lower the word that wrongly led. */
  _fitCells(units, target, nWords, also, tries) {
    const p = this.path; const isEnd = target === SPEECH_END;
    if (!isEnd && !(target >= 0 && target < p.end)) return { right: false, updates: 0 };
    const s = this._scoresCells(units, nWords); const cells = this._cells;
    const margin = this._cellMargin(cells);
    const alsoEnd = !!(also && also.includes(SPEECH_END));
    let updates = 0, right = false;
    for (let t = 0; t < tries; t++) {
      const e = this._end;
      const tv = isEnd ? e : s[target];
      let [rival, rv] = this._best(isEnd ? -1 : target, also, 0);
      if (!isEnd && !alsoEnd && e > rv) { rv = e; rival = SPEECH_END; }
      if (t === 0) {
        let sib = -Infinity;
        if (also) { for (const b of also) { if (b === target) continue; const v = b === SPEECH_END ? e : (b >= 0 && b < this._n ? s[b] : -Infinity); if (v > sib) sib = v; } }
        right = Math.max(tv, sib) > rv;
      }
      if (tv > 0 && tv - rv >= margin) break;
      const tb = isEnd ? p.end : target;
      s[tb] = p.m.stepRows(cells, tb * p.cell, p.cell, p.eta) / p.cell;
      if (rival !== -1 && rv > 0) {
        const rb = rival === SPEECH_END ? p.end : rival;
        s[rb] = p.m.stepRows(cells, rb * p.cell, p.cell, -p.eta) / p.cell;
      }
      this._end = s[p.end];
      updates++;
    }
    return { right, updates };
  }

  // ── Read ──────────────────────────────────────────────────────────────────────
  /**
   * Score of every word slot [0, nWords) in this state. The returned array is
   * reused and is valid for [0, nWords): zero for every word no active unit has
   * a weight for. The end slot's score is left in `this._end`.
   */
  scores(units, nWords) {
    if (this.path) return this._scoresCells(units, nWords);
    if (nWords > this.nWords) this.nWords = nWords;
    if (this._score.length < nWords) {
      const cap = stepUp(nWords);
      this._score = new Float32Array(cap); this._mark = new Int32Array(cap); this._nt = 0; this._epoch = 0; this._all = false; this._n = 0;
    }
    const s = this._score, mark = this._mark; let T = this._touched;
    if (this._all) s.fill(0, 0, this._n); else for (let i = 0; i < this._nt; i++) s[T[i]] = 0;
    // plain-array rows first: once one is active every word is in play
    let all = false, end = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i]; end += this.endW[u];
      const w = this.wd[u]; if (!w) continue;
      all = true;
      const m = nWords < w.length ? nWords : w.length;
      for (let b = 0; b < m; b++) s[b] += w[b];
    }
    const ep = ++this._epoch; let nt = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i]; const n = this.ln[u]; if (!n) continue;
      const k = this.lk[u], v = this.lv[u];
      if (all) { for (let j = 0; j < n; j++) { const key = k[j]; if (key < nWords) s[key] += v[j]; } continue; }
      for (let j = 0; j < n; j++) {
        const key = k[j]; if (key >= nWords) continue;
        if (mark[key] !== ep) {
          mark[key] = ep; s[key] = v[j];
          if (nt === T.length) { const nT = new Int32Array(T.length * 2); nT.set(T); T = this._touched = nT; }
          T[nt++] = key;
        } else s[key] += v[j];
      }
    }
    this._all = all; this._n = nWords; this._nt = nt; this._end = end;
    return s;
  }
  /** Score of "the line is finished" in this state. */
  endScore(units) {
    if (this.path) { this._scoresCells(units, this.nWords || 1); return this._end; }
    let e = 0; for (let i = 0; i < units.length; i++) e += this.endW[units[i]]; return e;
  }
  /** The strongest word of the last read that is not in `skip`: [slot, score]; slot −1 when no word scores above `floor`. */
  _best(skipA, skipList, floor) {
    const s = this._score; let bw = -1, bv = floor;
    if (this._all) {
      for (let b = 0; b < this._n; b++) { if (s[b] > bv && b !== skipA && !(skipList && skipList.includes(b))) { bv = s[b]; bw = b; } }
    } else {
      const T = this._touched;
      for (let i = 0; i < this._nt; i++) { const b = T[i]; if (s[b] > bv && b !== skipA && !(skipList && skipList.includes(b))) { bv = s[b]; bw = b; } }
    }
    return [bw, bv];
  }
  /** Per-word means in the shape the emission argmax takes (score ÷ active units),
   *  with the end-of-line mean alongside as `.end`. */
  bucketMeans(units, nWords) {
    const s = this.scores(units, nWords); const out = new Float32Array(nWords);
    if (this.path) {   // already a mean per word cell
      const m = Math.min(nWords, this._n); for (let b = 0; b < m; b++) out[b] = s[b];
      out.end = this._end; this.stats.says++;
      return out;
    }
    const d = Math.max(1, units.length);
    if (this._all) for (let b = 0; b < nWords; b++) out[b] = s[b] / d;
    else { const T = this._touched; for (let i = 0; i < this._nt; i++) out[T[i]] = s[T[i]] / d; }
    out.end = this._end / d;
    this.stats.says++;
    return out;
  }
  /** The word she would say in this state: its slot, SPEECH_END, or −1 for nothing. */
  top(units, nWords) {
    if (!units || !units.length) return -1;
    this.scores(units, nWords);
    const [bw, bv] = this._best(-1, null, 0);
    if (this._end > 0 && this._end >= bv) return SPEECH_END;
    return bw;
  }
  /** Where `target` ranks in this state (1 = she would say it; −1 = she would not say it at all). */
  rank(units, target, nWords) {
    if (!units.length || target >= nWords || (target < 0 && target !== SPEECH_END)) return -1;
    const s = this.scores(units, nWords); const e = this._end;
    const t = target === SPEECH_END ? e : s[target];
    if (!(t > 0)) return -1;
    let r = 1;
    if (this._all) { for (let b = 0; b < nWords; b++) if (b !== target && s[b] >= t) r++; }
    else { const T = this._touched; for (let i = 0; i < this._nt; i++) if (T[i] !== target && s[T[i]] >= t) r++; }
    if (target !== SPEECH_END && e >= t) r++;
    return r;
  }
  /** The words taught in exactly this state, as far as rehearsal still holds it. */
  taughtHere(units) {
    const m = this.mem[this.memAt.get(this._key(units))];
    return m ? m.targets : null;
  }
  /** Would she say `target` here, or another word she was also taught to say here? */
  saysTaught(units, target, nWords) {
    const t = this.top(units, nWords);
    if (t === target) return true;
    const also = this.taughtHere(units);
    return !!(also && t !== -1 && also.includes(t) && also.includes(target));
  }

  // ── Teach ─────────────────────────────────────────────────────────────────────
  /** The moment's key: its units without how she feels. */
  _key(units) {
    let a = 0x811C9DC5, b = 0x9E3779B9;
    for (let i = 0; i < units.length; i++) {
      const u = units[i]; if (u >= L.live) continue;
      a = Math.imul(a ^ u, 16777619) >>> 0;
      b = (Math.imul(b ^ (u + 0x7F4A7C15), 0x85EBCA6B) >>> 0); b ^= b >>> 13;
    }
    return a * 2097152 + ((b >>> 0) >>> 11);
  }
  _rand() { let x = this._rng; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; this._rng = x; return x / 4294967296; }
  /** Note that `target` was taught in this state; returns the words taught here (target included). */
  _remember(units, target) {
    if (!this.rehearseCap) return null;
    const key = this._key(units);
    let at = this.memAt.get(key);
    if (at === undefined) {
      this.memSeen++;
      let base = units;
      for (let i = 0; i < units.length; i++) if (units[i] >= L.live) { base = units.filter((u) => u < L.live); break; }
      const entry = { key, units: Int32Array.from(base), targets: [target] };
      if (this.mem.length < this.rehearseCap) { at = this.mem.length; this.mem.push(entry); }
      else {
        // a uniform sample of every moment ever taught
        if (this._rand() * this.memSeen >= this.rehearseCap) return entry.targets;
        at = Math.floor(this._rand() * this.mem.length);
        this.memAt.delete(this.mem[at].key); this.mem[at] = entry;
      }
      this.memAt.set(key, at);
      return entry.targets;
    }
    const t = this.mem[at].targets;
    if (!t.includes(target) && t.length < SAME_STATE_MAX) t.push(target);
    return t;
  }
  /** Does this state hold something that was said to her? */
  _heardIn(units) { for (let i = 0; i < units.length; i++) { const u = units[i]; if (u >= L.heardBag && u < L.concept) return true; } return false; }
  /** The state a rewording would light: level 1 leaves out the exact moment; level 2 also the heard word-pairs. */
  _general(units, level) {
    const out = [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u >= L.line && u < L.heardBag) continue;
      if (level >= 2 && isHeardPair(u)) continue;
      out.push(u);
    }
    return out;
  }
  /**
   * The same state with the thing's own word left out, where that applies:
   * naming a thing (its meaning alone), or opening a line about a thing (its
   * meaning and "nothing said yet"). Null for every other state.
   */
  _meaningOnly(units) {
    let named = false, topic = false, spoken = false;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u >= L.concept && u < L.conceptMean) named = true;
      else if (u >= L.about && u < L.aboutMean) topic = true;
      else if (u >= L.w1Id && u < L.w1Mean) spoken = true;
    }
    if (!named && !(topic && !spoken)) return null;
    const out = [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if ((u >= L.concept && u < L.conceptMean) || (u >= L.about && u < L.aboutMean) || (u >= L.line && u < L.heardBag)) continue;
      out.push(u);
    }
    return out;
  }
  /** One "teach until she says it" in one state. Returns { right, updates }. */
  _fit(units, target, nWords, also, marginPer, tries) {
    if (this.path) return this._fitCells(units, target, nWords, also, tries);
    const isEnd = target === SPEECH_END;
    const n = units.length; const margin = marginPer * n;
    const s = this.scores(units, nWords);            // read once; the changes below are applied to it directly
    if (!isEnd && !this._all && this._mark[target] !== this._epoch) {   // keep the taught word among the touched
      this._mark[target] = this._epoch;
      if (this._nt === this._touched.length) { const nT = new Int32Array(this._nt * 2); nT.set(this._touched); this._touched = nT; }
      this._touched[this._nt++] = target;
    }
    const alsoEnd = !!(also && also.includes(SPEECH_END));
    let updates = 0, right = false;
    for (let t = 0; t < tries; t++) {
      const e = this._end;
      const tv = isEnd ? e : s[target];
      // The strongest OTHER slot, words and end alike. A word no unit has a
      // weight for scores zero, so zero is the floor she must clear.
      let [rival, rv] = this._best(isEnd ? -1 : target, also, 0);
      if (!isEnd && !alsoEnd && e > rv) { rv = e; rival = SPEECH_END; }
      if (t === 0) {
        let sib = -Infinity;
        if (also) { for (const b of also) { if (b === target) continue; const v = b === SPEECH_END ? e : (b >= 0 && b < nWords ? s[b] : -Infinity); if (v > sib) sib = v; } }
        right = Math.max(tv, sib) > rv;
      }
      const loss = margin - (tv - rv);
      if (loss <= 0) break;
      const none = rival === -1;
      // WHO TAKES THE CORRECTION. A unit that has been corrected often is one
      // many moments share; a unit corrected rarely is particular to this
      // moment. Each unit's share is 1/√(1 + times corrected), so what is
      // particular to this moment carries the change and what is shared settles
      // into what is generally true — a correction here disturbs other moments
      // little. The taught word is raised on every unit; the word that beat it
      // is lowered only on the shared units (an exact unit belongs to one
      // moment and has nothing to say about other words).
      const use = this.use; let sumAll = 0, sumShared = 0;
      const share = n <= this._share.length ? this._share : (this._share = new Float64Array(n * 2));
      for (let i = 0; i < n; i++) {
        const u = units[i]; const a = 1 / Math.sqrt(1 + use[u]);
        share[i] = a; sumAll += a; if (!isExact(u)) sumShared += a;
      }
      const up = (none || !(sumShared > 0) ? loss : loss / 2) + 1e-4 * n;
      const down = (none || !(sumShared > 0)) ? 0 : loss / 2 + 1e-4 * n;
      for (let i = 0; i < n; i++) {
        const u = units[i]; const tu = up * share[i] / sumAll;
        if (isEnd) this.endW[u] = clampW(this.endW[u] + tu); else this._add(u, target, tu);
        if (use[u] < 0xFFFFFFFF) use[u]++;
        if (!down || isExact(u)) continue;
        const td = down * share[i] / sumShared;
        if (rival === SPEECH_END) this.endW[u] = clampW(this.endW[u] - td); else this._add(u, rival, -td);
      }
      if (isEnd) this._end += up; else s[target] += up;
      if (down) { if (rival === SPEECH_END) this._end -= down; else s[rival] -= down; }
      updates++;
    }
    return { right, updates };
  }
  /**
   * Teach until she says it: in this state, `target` must lead every other word
   * slot by MARGIN × (active units). Returns { right, updates } — `right` is
   * whether she already said it (or another word taught in this same state)
   * before any change. `opts.also` — other slots taught in this same state.
   */
  teach(units, target, nWords, opts = {}) {
    const isEnd = target === SPEECH_END;
    if (!units || !units.length || target >= nWords || (target < 0 && !isEnd)) return { right: false, updates: 0 };
    let also = this._remember(units, target);
    if (opts.also && opts.also.size) { also = also ? also.slice() : []; for (const b of opts.also) if (!also.includes(b)) also.push(b); }
    const r = this._fit(units, target, nWords, also, opts.margin ?? MARGIN, opts.tries ?? TRIES);
    this.stats.teaches++; if (r.right) this.stats.alreadyRight++; this.stats.corrections += r.updates;
    // A REPLY IS ALSO TAUGHT AS A REWORDING WOULD FIND IT. When something was
    // said to her, the same word is taught again in the state with the exact
    // moment left out, and once more with the heard word-pairs left out too —
    // what a differently worded line still lights (its words, the word it is
    // about, its gist, her own words so far). Without this the exact units
    // take the whole lesson and a rewording finds nothing.
    // The same holds for a MEANING: a thing is also taught by what it means
    // with its own word left out — naming it, and opening a line about it — so
    // a feeling or a memory with no word attached still finds words.
    if (opts.general !== false) {
      const wider = [];
      if (this._heardIn(units)) { wider.push(this._general(units, 1), this._general(units, 2)); }
      else { const g = this._meaningOnly(units); if (g) wider.push(g); }
      for (const g of wider) {
        if (g.length < 4 || g.length === units.length) continue;
        const ga = this._remember(g, target);
        const gr = this._fit(g, target, nWords, ga, opts.margin ?? MARGIN, opts.tries ?? TRIES);
        this.stats.generalTeaches = (this.stats.generalTeaches || 0) + 1; this.stats.corrections += gr.updates;
      }
    }
    if (this.mem.length > 1 && this.stats.teaches % this.rehearseEvery === 0) this.rehearse(1, nWords);
    return r;
  }
  /** Go back over `count` taught moments: check each, and correct it only if a later lesson disturbed it. */
  rehearse(count, nWords) {
    let fixed = 0;
    for (let c = 0; c < count && this.mem.length; c++) {
      const m = this.mem[Math.floor(this._rand() * this.mem.length)];
      const target = m.targets[Math.floor(this._rand() * m.targets.length)];
      if (target >= nWords) continue;
      const r = this._fit(m.units, target, nWords, m.targets, MARGIN, 2);
      this.stats.rehearsed++; if (r.updates) { this.stats.rehearsalFixes++; fixed++; }
    }
    return fixed;
  }
  /** "Not this word, here": lower `word` until the best other slot leads it by the margin. */
  pushAway(units, word, nWords, opts = {}) {
    if (!units || !units.length || !(word >= 0) || word >= nWords) return false;
    if (this.path) {
      const p = this.path; if (word >= p.end) return false;
      const sc = this._scoresCells(units, nWords); const cells = this._cells; const margin = this._cellMargin(cells);
      let pushed = false;
      for (let t = 0; t < TRIES; t++) {
        const [, bv] = this._best(word, null, 0);
        if (Math.max(bv, this._end, 0) - sc[word] >= margin || !(sc[word] > 0)) break;
        sc[word] = p.m.stepRows(cells, word * p.cell, p.cell, -p.eta) / p.cell;
        pushed = true;
      }
      if (pushed) this.stats.pushes++;
      return pushed;
    }
    const s = this.scores(units, nWords);
    const [, bv] = this._best(word, null, 0);
    const rv = Math.max(bv, this._end, 0);
    const loss = (opts.margin ?? MARGIN) * units.length - (rv - s[word]);
    if (loss <= 0) return false;
    const tau = loss / units.length + 1e-4;
    for (let i = 0; i < units.length; i++) this._add(units[i], word, -tau);
    this.scores(units, nWords);                      // leave the last read consistent with the rows
    this.stats.pushes++;
    return true;
  }

  // ── Save / restore ────────────────────────────────────────────────────────────
  /**
   * { header, buffers } — header is JSON-safe; buffers are written in order.
   * Body (all little-endian 32-bit): taught unit ids · their weight counts ·
   * every row as (word slots, weights) · every unit's end weight · every
   * unit's correction count · rehearsal:
   * unit counts · target counts · units · targets. Nothing here is one
   * allocation the size of the whole table.
   */
  serialize() {
    const buffers = []; const CH = 1 << 20;            // 4 MB per piece
    let cur = new Int32Array(CH), cf = new Float32Array(cur.buffer), n = 0, bytes = 0;
    const flush = () => { if (n) { buffers.push(Buffer.from(cur.buffer, 0, n * 4)); bytes += n * 4; cur = new Int32Array(CH); cf = new Float32Array(cur.buffer); n = 0; } };
    const pi = (x) => { if (n === CH) flush(); cur[n++] = x; };
    const pf = (x) => { if (n === CH) flush(); cf[n++] = x; };
    const count = (u) => { const w = this.wd[u]; if (!w) return this.ln[u]; let c = 0; for (let b = 0; b < w.length; b++) if (w[b] !== 0) c++; return c; };
    const counts = new Int32Array(this.G); let nU = 0, total = 0;
    for (let u = 0; u < this.G; u++) { const c = count(u); counts[u] = c; if (c > 0) { nU++; total += c; } }
    for (let u = 0; u < this.G; u++) if (counts[u] > 0) pi(u);
    for (let u = 0; u < this.G; u++) if (counts[u] > 0) pi(counts[u]);
    for (let u = 0; u < this.G; u++) {
      if (!(counts[u] > 0)) continue;
      const w = this.wd[u];
      if (w) { for (let b = 0; b < w.length; b++) if (w[b] !== 0) pi(b); for (let b = 0; b < w.length; b++) if (w[b] !== 0) pf(w[b]); }
      else { const k = this.lk[u], v = this.lv[u]; for (let j = 0; j < counts[u]; j++) pi(k[j]); for (let j = 0; j < counts[u]; j++) pf(v[j]); }
    }
    for (let u = 0; u < this.G; u++) pf(this.endW[u]);
    for (let u = 0; u < this.G; u++) pi(this.use[u] | 0);
    let mU = 0, mT = 0;
    for (const m of this.mem) pi(m.units.length);
    for (const m of this.mem) pi(m.targets.length);
    for (const m of this.mem) { for (let i = 0; i < m.units.length; i++) pi(m.units[i]); mU += m.units.length; }
    for (const m of this.mem) { for (const t of m.targets) pi(t); mT += m.targets.length; }
    flush();
    return {
      header: { v: 2, G: this.G, nWords: this.nWords, units: nU, entries: total, moments: this.mem.length, momentUnits: mU, momentTargets: mT,
        memSeen: this.memSeen, bytes, mu: this.mu ? Array.from(this.mu) : null, muWords: this.muWords, stats: this.stats },
      buffers,
    };
  }
  /**
   * Restore from a header and its body. `body` is a Buffer, or a function
   * `(byteLength) → Buffer` that returns the next bytes of the file in order
   * (so a large file is never read as one piece). Returns false, changing
   * nothing, when the header does not describe this layout or the body is short
   * or inconsistent.
   */
  restore(header, body) {
    const H = header;
    const int = (x) => Number.isInteger(x) && x >= 0;
    if (!H || H.v !== 2 || H.G !== this.G || !int(H.units) || !int(H.entries) || !int(H.moments) || !int(H.momentUnits) || !int(H.momentTargets)) return false;
    if (H.units > this.G) return false;
    const need = (2 * H.units + 2 * H.entries + 2 * this.G + 2 * H.moments + H.momentUnits + H.momentTargets) * 4;
    let off = 0;
    const next = typeof body === 'function' ? body : (len) => { const b = body.subarray(off, off + len); off += len; return b; };
    const ints = (count) => {
      const out = new Int32Array(count); const dst = Buffer.from(out.buffer);
      for (let got = 0; got < count * 4;) {
        const b = next(Math.min(64 << 20, count * 4 - got));
        if (!b || !b.length) throw new Error('short body');
        b.copy(dst, got); got += b.length;
      }
      return out;
    };
    let ids, counts, rows, endW, use, mLen, mTLen, mUnits, mTargets;
    try {
      if (typeof body !== 'function' && (!body || body.length < need)) return false;
      ids = ints(H.units); counts = ints(H.units);
      let sum = 0; for (let i = 0; i < H.units; i++) { if (ids[i] < 0 || ids[i] >= this.G || counts[i] <= 0) return false; sum += counts[i]; }
      if (sum !== H.entries) return false;
      rows = new Array(H.units);
      for (let i = 0; i < H.units; i++) { const k = ints(counts[i]); const v = new Float32Array(ints(counts[i]).buffer); rows[i] = [k, v]; }
      endW = new Float32Array(ints(this.G).buffer);
      use = new Uint32Array(ints(this.G).buffer);
      mLen = ints(H.moments); mTLen = ints(H.moments);
      let su = 0, stt = 0; for (let i = 0; i < H.moments; i++) { su += mLen[i]; stt += mTLen[i]; }
      if (su !== H.momentUnits || stt !== H.momentTargets) return false;
      mUnits = ints(H.momentUnits); mTargets = ints(H.momentTargets);
    } catch { return false; }
    this.lk.fill(null); this.lv.fill(null); this.lx.fill(null); this.wd.fill(null); this.ln.fill(0);
    this.entries = 0; this.wide = 0;
    this.nWords = int(H.nWords) ? H.nWords : 0;
    for (let i = 0; i < H.units; i++) {
      const [k, v] = rows[i]; const u = ids[i]; const n = k.length;
      for (let j = 0; j < n; j++) if (k[j] >= this.nWords) this.nWords = k[j] + 1;
      let cap = 4; while (cap < n) cap *= 2;
      const lk = new Int32Array(cap); lk.set(k); const lv = new Float32Array(cap); lv.set(v);
      this.lk[u] = lk; this.lv[u] = lv; this.ln[u] = n; this.entries += n;
      if (n > LIST_SCAN) this._index(u);
    }
    for (let i = 0; i < H.units; i++) { const u = ids[i]; if (this.ln[u] >= WIDE_MIN && this.ln[u] * 3 > this.nWords) this._widen(u); }
    this.endW.set(endW); this.use.set(use);
    this.mem = []; this.memAt = new Map();
    let ou = 0, ot = 0;
    for (let i = 0; i < H.moments; i++) {
      const units = mUnits.slice(ou, ou + mLen[i]); ou += mLen[i];
      const targets = Array.from(mTargets.subarray(ot, ot + mTLen[i])); ot += mTLen[i];
      const key = this._key(units);
      this.memAt.set(key, this.mem.length); this.mem.push({ key, units, targets });
    }
    this.memSeen = int(H.memSeen) ? Math.max(H.memSeen, this.mem.length) : this.mem.length;
    if (Array.isArray(H.mu) && H.mu.length === D) { this.mu = Float64Array.from(H.mu); this.muWords = int(H.muWords) ? H.muWords : 0; }
    if (H.stats) this.stats = { ...this.stats, ...H.stats };
    this._nt = 0; this._all = false; this._n = 0; this._score.fill(0);
    return true;
  }
  /** Counts for the dashboard: how much has been taught and how big it is. */
  summary() {
    let taughtUnits = 0, bytes = 0;
    for (let u = 0; u < this.G; u++) {
      const w = this.wd[u];
      if (w) { taughtUnits++; bytes += w.length * 4; }
      else if (this.ln[u] > 0) { taughtUnits++; bytes += this.lk[u].length * 8 + (this.lx[u] ? this.lx[u].length * 4 : 0); }
    }
    return { units: this.G, taughtUnits, wideUnits: this.wide, entries: this.entries, moments: this.mem.length, momentsSeen: this.memSeen,
      bytes, muWords: this.muWords, ...this.stats };
  }
}

export const SPEECH_LAYOUT = L;
