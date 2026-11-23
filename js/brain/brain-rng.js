// brain-rng.js — her randomness, keyed and resumable.
//
// Every draw that shapes what she IS or what she LEARNS comes from here instead
// of `Math.random()`. `Math.random()` cannot be seeded or saved, so before this
// a restart re-rolled her innate temperament (the amygdala module is rebuilt on
// every boot from fresh random weights), and a resumed walk sampled a different
// sequence than an uninterrupted one would have.
//
// THE GENERATOR IS COUNTER-BASED. A value is a pure function of
// (seed, site, n): mix(seed ⊕ hash(site) ⊕ n). So a stream's whole state is
// one integer, which is what makes it cheap to save and exact to resume, and
// two sites can never disturb each other — a chat draw does not shift the
// curriculum's sequence, because they are different keys.
//
// TWO KINDS OF STREAM:
//   brainStream(site)                    — the counter persists in the save
//                                          and resumes where it stopped. For
//                                          sampling that happens while she runs.
//   brainStream(site, { fromStart: true }) — starts at 0 on every boot. For a
//                                          structure rebuilt on every boot (her
//                                          amygdala's innate weights) and for
//                                          weight initialisation: the same seed
//                                          builds the same thing every time.
//
// The seed is set once per brain. A fresh walk takes a new one (or
// DREAM_RNG_SEED pins it) and it is saved with her weights, so the walk can be
// rebuilt from it. Without a seed the module self-seeds from the platform's
// crypto source, so a browser page or a stand-alone harness still gets good
// randomness — it is just not one anybody can replay.
//
// ⚠ Uniform on [0, 1) with 32 bits of resolution. That is what every call
// site used `Math.random()` for; none of them needed 53.

const _streams = new Map();   // site -> { n }
const _fromStart = new Set();  // sites whose counter is NOT persisted
let _seed = null;              // uint32, null until set or self-seeded

function _fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// MurmurHash3's 32-bit finaliser — full avalanche, the standard mixer for a
// counter-based generator.
function _mix(x) {
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

function _cryptoSeed() {
  try {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (c && typeof c.getRandomValues === 'function') {
      const a = new Uint32Array(1);
      c.getRandomValues(a);
      return a[0] >>> 0;
    }
  } catch { /* fall through */ }
  // No crypto source at all: time is the only entropy left. Not replayable,
  // which is exactly what an unseeded stream promises anyway.
  return _mix((Date.now() >>> 0) ^ 0x9e3779b9);
}

function _ensureSeed() {
  if (_seed === null) _seed = _cryptoSeed();
  return _seed;
}

// The n-th value of a site's stream. n can exceed 2^32 (weight initialisation
// at biological scale draws billions), so both halves of n enter the hash.
function _value(siteKey, n) {
  const lo = n >>> 0;
  const hi = Math.floor(n / 4294967296) >>> 0;
  return _mix(_seed ^ siteKey ^ _mix(lo ^ _mix(hi ^ siteKey))) / 4294967296;
}

/**
 * A uniform [0, 1) generator for one site. Calling it twice with the same
 * site returns generators sharing ONE counter, so a site can fetch its stream
 * wherever it is convenient without forking the sequence.
 */
export function brainStream(site, opts = {}) {
  const name = String(site);
  if (opts.fromStart) _fromStart.add(name);
  let st = _streams.get(name);
  if (!st) { st = { n: 0 }; _streams.set(name, st); }
  const key = _fnv1a(name);
  return () => {
    _ensureSeed();
    return _value(key, st.n++);
  };
}

/** One draw from a site's stream — for sites that draw rarely. */
export function brainRandom(site) {
  return brainStream(site)();
}

/**
 * Set her seed. Call before anything draws. A changed seed resets every
 * counter, because a counter only means something against the seed it ran on.
 */
export function brainRngSeed(seed) {
  const s = Number(seed);
  if (!Number.isFinite(s)) return _ensureSeed();
  const next = (s >>> 0);
  if (next !== _seed) { for (const st of _streams.values()) st.n = 0; }
  _seed = next;
  return _seed;
}

/** What to save: the seed and every persisted counter. */
export function brainRngState() {
  const counters = {};
  for (const [name, st] of _streams) {
    if (_fromStart.has(name) || st.n === 0) continue;
    counters[name] = st.n;
  }
  return { seed: _ensureSeed(), counters };
}

/**
 * Restore a saved state. The seed comes first; counters apply only to
 * persisted streams, so a structure rebuilt on every boot still starts at 0.
 */
export function brainRngRestore(state) {
  if (!state || typeof state !== 'object') return false;
  if (!Number.isFinite(Number(state.seed))) return false;
  brainRngSeed(state.seed);
  const c = state.counters && typeof state.counters === 'object' ? state.counters : {};
  for (const [name, n] of Object.entries(c)) {
    if (_fromStart.has(name)) continue;
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) continue;
    let st = _streams.get(name);
    if (!st) { st = { n: 0 }; _streams.set(name, st); }
    st.n = Math.floor(v);
  }
  return true;
}

/** For the snapshot: is she seeded, and how many draws has each stream made. */
export function brainRngSummary() {
  const streams = {};
  for (const [name, st] of _streams) streams[name] = { n: st.n, fromStart: _fromStart.has(name) };
  return { seeded: _seed !== null, seed: _seed, streams };
}
