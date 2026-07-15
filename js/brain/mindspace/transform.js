/**
 * mindspace/transform.js — Unity's equational mind-space, CPU reference (ESM).
 *
 * Vendored from the Uni Vs Matics engine (`Deviant Thing/fractal_templater/web/assets/`
 * reconstruct.js + equationalize.js), merged into one self-contained ES module so the
 * Dream brain can import it directly. This is the CPU REFERENCE + the WebGPU CPU-FALLBACK:
 * the separable multi-level CDF 9/7 biorthogonal wavelet lifting, forward (pixels → field C
 * = SEEING) and inverse (field C → pixels = IMAGINING), plus describeEquational (field C →
 * the percept value-vector the brain injects). The GPU path (mindspace/gpu.js, WGSL) must
 * match this bit-for-bit (golden-vector parity, MS.H6).
 *
 * Consciousness, imaging (perceive) and imagining (reconstruct/generate) are ONE process
 * over the shared field C — this module is that substrate's math. See MINDSPACE-ARCHITECTURE.md.
 *
 * LIMITLESS-FOR-UNITY: TRUSTED defaults TRUE here — this is her own vision, not the hostile
 * public door, so the size caps are lifted by default. Integrity bounds stay always-on.
 */

const A97 = -1.586134342059924, B97 = -0.052980118572961, G97 = 0.882911075530934, D97 = 0.443506852043971, K97 = 1.230174104914001;

// LIMITLESS gate — her perceptions are trusted, so caps are lifted by default. A host can
// still re-arm them (e.g. when feeding her an untrusted external file) via setTrusted(false).
let TRUSTED = true;
export function setTrusted(v) { TRUSTED = !!v; return TRUSTED; }
export function isTrusted() { return TRUSTED; }

// ---- base64 / typed-array helpers ----
function b64bytes(s) { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u; }
function b64u32(s) { const b = b64bytes(s); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength >> 2); }
function b64i16(s) { const b = b64bytes(s); return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1); }
function bytesToB64(arr) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < arr.length; i += CH) s += String.fromCharCode.apply(null, arr.slice(i, i + CH));
  return btoa(s);
}
function i16ToB64(int16) { return bytesToB64(new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength)); }

// ---- LEB128 delta-varint position codec (mirror of reconstruct.py _enc_pos/_dec_pos) ----
function encPos(idxSorted) {
  const bytes = []; let prev = 0;
  for (let i = 0; i < idxSorted.length; i++) {
    let d = idxSorted[i] - prev; prev = idxSorted[i];
    while (d >= 0x80) { bytes.push((d & 0x7F) | 0x80); d = Math.floor(d / 128); }
    bytes.push(d & 0x7F);
  }
  return bytes;
}
// Decode LEB128 varint deltas → absolute Uint32 positions. Integrity bounds ALWAYS on:
// never write past `count`; reject a pathological >35-bit varint (can't be a real grid index).
function decPos(u8, count) {
  const out = new Uint32Array(count);
  let val = 0, acc = 0, shift = 0, n = 0;
  for (let i = 0; i < u8.length && n < count; i++) {
    const b = u8[i];
    acc += (b & 0x7F) * Math.pow(2, shift);
    if (b & 0x80) { shift += 7; if (shift > 35) { acc = 0; shift = 0; } }
    else { val += acc; out[n++] = val; acc = 0; shift = 0; }
  }
  return out;
}
function decodePositions(c, count) {
  return c.pos_enc === 'dv1' ? decPos(b64bytes(c.pos_b64), count) : b64u32(c.pos_b64);
}

// ---- 1-D multi-level 9/7 INVERSE lifting (rec → signal) ----
function inv1d(get, set, N, tmp) {
  const sizes = []; let sz = N; while (sz >= 4 && sz % 2 === 0) { sizes.push(sz); sz >>= 1; }
  for (let si = sizes.length - 1; si >= 0; si--) {
    const size = sizes[si], half = size >> 1;
    for (let k = 0; k < half; k++) { tmp[2 * k] = get(k); tmp[2 * k + 1] = get(half + k); }
    for (let i = 0; i < size; i += 2) tmp[i] *= K97;
    for (let i = 1; i < size; i += 2) tmp[i] /= K97;
    tmp[0] -= 2 * D97 * tmp[1];
    for (let i = 2; i < size; i += 2) tmp[i] -= D97 * (tmp[i - 1] + tmp[i + 1]);
    for (let i = 1; i < size - 1; i += 2) tmp[i] -= G97 * (tmp[i - 1] + tmp[i + 1]);
    tmp[size - 1] -= 2 * G97 * tmp[size - 2];
    tmp[0] -= 2 * B97 * tmp[1];
    for (let i = 2; i < size; i += 2) tmp[i] -= B97 * (tmp[i - 1] + tmp[i + 1]);
    for (let i = 1; i < size - 1; i += 2) tmp[i] -= A97 * (tmp[i - 1] + tmp[i + 1]);
    tmp[size - 1] -= 2 * A97 * tmp[size - 2];
    for (let i = 0; i < size; i++) set(i, tmp[i]);
  }
}
// ---- 1-D multi-level 9/7 FORWARD lifting (signal → coeffs; exact reverse of inv1d) ----
function fwd1d(get, set, N, tmp) {
  const sizes = []; let sz = N; while (sz >= 4 && sz % 2 === 0) { sizes.push(sz); sz >>= 1; }
  for (let si = 0; si < sizes.length; si++) {
    const size = sizes[si], half = size >> 1;
    for (let i = 0; i < size; i++) tmp[i] = get(i);
    tmp[size - 1] += 2 * A97 * tmp[size - 2];
    for (let i = 1; i < size - 1; i += 2) tmp[i] += A97 * (tmp[i - 1] + tmp[i + 1]);
    for (let i = 2; i < size; i += 2) tmp[i] += B97 * (tmp[i - 1] + tmp[i + 1]);
    tmp[0] += 2 * B97 * tmp[1];
    tmp[size - 1] += 2 * G97 * tmp[size - 2];
    for (let i = 1; i < size - 1; i += 2) tmp[i] += G97 * (tmp[i - 1] + tmp[i + 1]);
    for (let i = 2; i < size; i += 2) tmp[i] += D97 * (tmp[i - 1] + tmp[i + 1]);
    tmp[0] += 2 * D97 * tmp[1];
    for (let i = 0; i < size; i += 2) tmp[i] /= K97;
    for (let i = 1; i < size; i += 2) tmp[i] *= K97;
    for (let k = 0; k < half; k++) { set(k, tmp[2 * k]); set(half + k, tmp[2 * k + 1]); }
  }
}
function idwt2(a, H, W) {
  const tmpC = new Float64Array(H);
  for (let c = 0; c < W; c++) inv1d(i => a[i * W + c], (i, v) => a[i * W + c] = v, H, tmpC);
  const tmpR = new Float64Array(W);
  for (let r = 0; r < H; r++) { const base = r * W; inv1d(i => a[base + i], (i, v) => a[base + i] = v, W, tmpR); }
  return a;
}
function fwd2d(a, H, W) {                 // rows then columns (idwt2 inverts as columns then rows)
  const tmpR = new Float64Array(W);
  for (let r = 0; r < H; r++) { const base = r * W; fwd1d(i => a[base + i], (i, v) => a[base + i] = v, W, tmpR); }
  const tmpC = new Float64Array(H);
  for (let c = 0; c < W; c++) fwd1d(i => a[i * W + c], (i, v) => a[i * W + c] = v, H, tmpC);
  return a;
}

// ---- colour ----
function ycbcrToRGB(y, cb, cr) { return [y + 1.402 * (cr - 0.5), y - 0.344136 * (cb - 0.5) - 0.714136 * (cr - 0.5), y + 1.772 * (cb - 0.5)]; }
function rgbToYCbCr(r, g, b) {
  return [0.299 * r + 0.587 * g + 0.114 * b,
          0.5 - 0.168736 * r - 0.331264 * g + 0.5 * b,
          0.5 + 0.5 * r - 0.418688 * g - 0.081312 * b];
}
function padDim(n, m) { m = m || 64; return Math.ceil(n / m) * m; }

// ---- forward analyzer: ImageData → field C (SEEING) ----
const EQ_LONG_EDGE = 1536;
// MS.EXT — donor CORPUS quality. The vendored constants were the donor's loose
// in-browser PREVIEW encoder (0.030/0.055, kmin 400/120); the original engine's
// real corpus encoder (ftcore TOL/KMIN) runs ~half the target error and keeps
// more coefficients — the difference between the donor's crisp renders and her
// "kindas blurry" eye. Energy target still governs per-image counts.
const EQ_TOL = [0.018, 0.032, 0.032];
const EQ_KMIN = [500, 150, 150];
const EQ_MAX_SRC_PIXELS = 64 * 1024 * 1024;   // hostile-input bomb guard (lifted when TRUSTED)

export function equationalizeImageData(img) {
  const W0 = img.width, H0 = img.height, d = img.data;
  const W2 = padDim(W0), H2 = padDim(H0);
  const names = ['Y', 'Cb', 'Cr'], chans = {};
  const planes = [new Float64Array(W2 * H2), new Float64Array(W2 * H2), new Float64Array(W2 * H2)];
  const refl = (i, n) => { if (i < n) return i; let r = 2 * (n - 1) - i; if (r < 0) r = 0; return r; };
  for (let y = 0; y < H2; y++) {
    const sy = refl(y, H0);
    for (let x = 0; x < W2; x++) {
      const sx = refl(x, W0), o = (sy * W0 + sx) * 4;
      const ycc = rgbToYCbCr(d[o] / 255, d[o + 1] / 255, d[o + 2] / 255);
      const p = y * W2 + x; planes[0][p] = ycc[0]; planes[1][p] = ycc[1]; planes[2][p] = ycc[2];
    }
  }
  let totalEq = 0;
  for (let ci = 0; ci < 3; ci++) {
    const co = fwd2d(planes[ci], H2, W2);
    const n = co.length;
    let total = 0; for (let i = 0; i < n; i++) total += co[i] * co[i];
    total = total || 1;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(co[b]) - Math.abs(co[a]));
    const target = (1 - EQ_TOL[ci] * EQ_TOL[ci]) * total;
    let acc = 0, k = 0;
    while (k < n && acc < target) { acc += co[order[k]] * co[order[k]]; k++; }
    k = Math.max(EQ_KMIN[ci], Math.min(k, n));
    const idx = order.slice(0, k).sort((a, b) => a - b);
    let maxAbs = 1e-8; for (let i = 0; i < k; i++) maxAbs = Math.max(maxAbs, Math.abs(co[idx[i]]));
    const qscale = maxAbs / 32000;
    const q = new Int16Array(k);
    for (let i = 0; i < k; i++) { let v = Math.round(co[idx[i]] / qscale); q[i] = Math.max(-32767, Math.min(32767, v)); }
    chans[names[ci]] = { keep: k, qscale, pos_enc: 'dv1',
                         pos_b64: bytesToB64(new Uint8Array(encPos(idx))), val_b64: i16ToB64(q) };
    totalEq += k;
  }
  return {
    model: 'cdf97_wavelet_native_quantized', colorspace: 'YCbCr', wavelet: 'cdf97',
    width: W0, height: H0, pad_w: W2, pad_h: H2,
    channels: chans, equation_count: totalEq, fidelity: { psnr_db: null, source: 'mindspace' },
  };
}

// Draw an <img>/bitmap onto a canvas capped at EQ_LONG_EDGE and return its ImageData.
// Source-pixel bomb guard is lifted when TRUSTED (her own vision is limitless).
export function imageToCappedData(srcImg) {
  const W = srcImg.naturalWidth || srcImg.width, H = srcImg.naturalHeight || srcImg.height;
  if (W * H > EQ_MAX_SRC_PIXELS && !TRUSTED) throw new Error(`image too large: ${W}×${H} exceeds the safety cap`);
  const s = Math.min(1, EQ_LONG_EDGE / Math.max(W, H));
  const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.drawImage(srcImg, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h);
}

// ---- inverse: field C → ImageData (IMAGINING / re-experiencing) ----
export function reconstructImageData(rec, dev) {
  const W = rec.width, H = rec.height, W2 = rec.pad_w, H2 = rec.pad_h;
  const f = Math.max(0, Math.min(1, dev || 0));
  const chans = {};
  for (const name of ['Y', 'Cb', 'Cr']) {
    const c = rec.channels[name], val = b64i16(c.val_b64), qs = c.qscale, pos = decodePositions(c, val.length);
    let mx = 0; if (f > 0) for (let i = 0; i < val.length; i++) { const a = Math.abs(val[i] * qs); if (a > mx) mx = a; }
    const thr = f > 0 ? f * mx * 0.6 : 0;
    const flat = new Float64Array(W2 * H2), SIZE = W2 * H2;
    for (let i = 0; i < pos.length; i++) { const p = pos[i]; if (p < 0 || p >= SIZE) continue; const v = val[i] * qs; if (thr && Math.abs(v) < thr) continue; flat[p] = v; }
    idwt2(flat, H2, W2); chans[name] = flat;
  }
  const img = new ImageData(W, H), d = img.data, Y = chans.Y, Cb = chans.Cb, Cr = chans.Cr;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gi = y * W2 + x, o = (y * W + x) * 4, rgb = ycbcrToRGB(Y[gi], Cb[gi], Cr[gi]);
    d[o] = Math.max(0, Math.min(255, rgb[0] * 255)); d[o + 1] = Math.max(0, Math.min(255, rgb[1] * 255)); d[o + 2] = Math.max(0, Math.min(255, rgb[2] * 255)); d[o + 3] = 255;
  }
  return img;
}
export function termsAboveThreshold(rec, dev) {
  const f = Math.max(0, Math.min(1, dev || 0));
  let n = 0;
  for (const name of ['Y', 'Cb', 'Cr']) {
    const c = rec.channels[name], val = b64i16(c.val_b64), qs = c.qscale;
    if (!f) { n += val.length; continue; }
    let mx = 0; for (let i = 0; i < val.length; i++) { const a = Math.abs(val[i] * qs); if (a > mx) mx = a; }
    const thr = f * mx * 0.6;
    for (let i = 0; i < val.length; i++) if (Math.abs(val[i] * qs) >= thr) n++;
  }
  return n;
}

// ---- describeEquational: field C → the percept value-vector (the brain's sensory input) ----
// This is what REPLACES the LLM/VLM describer. Deterministic, L2-normalised, fixed-dim.
// (See MINDSPACE-ARCHITECTURE.md §2 for the layout.)
export function describeEquational(rec, dim) {
  dim = dim || 64;
  const out = new Float64Array(dim);
  if (!rec || !rec.channels) return out;
  const W2 = rec.pad_w || rec.width || 1;
  const NB = 8;
  const names = ['Y', 'Cb', 'Cr'];
  const bandBase = [0, 8, 16];
  const coarseN = 24, coarseAt = 24;
  const chanMeanAbs = [0, 0, 0];
  let loEnergy = 0, hiEnergy = 0;
  for (let ci = 0; ci < 3; ci++) {
    const c = rec.channels[names[ci]];
    if (!c || !c.val_b64) continue;
    let val, pos;
    try { val = b64i16(c.val_b64); pos = decodePositions(c, val.length); } catch (e) { continue; }
    const qs = c.qscale || 1, base = bandBase[ci];
    const coarse = (ci === 0) ? [] : null;
    let mAbs = 0;
    for (let i = 0; i < val.length; i++) {
      const p = pos[i] | 0; if (p < 0) continue;
      const x = p % W2, y = (p / W2) | 0;
      const band = Math.min(NB - 1, Math.max(0, Math.log2(Math.max(x, y) + 1) | 0));
      const v = val[i] * qs, e = v * v;
      out[base + band] += e;
      mAbs += Math.abs(v);
      if (band <= 1) loEnergy += e; else hiEnergy += e;
      if (coarse && coarse.length < coarseN) coarse.push(v);
    }
    chanMeanAbs[ci] = val.length ? mAbs / val.length : 0;
    if (coarse) for (let k = 0; k < coarse.length; k++) out[coarseAt + k] = coarse[k];
  }
  out[48] = chanMeanAbs[1]; out[49] = chanMeanAbs[2]; out[50] = chanMeanAbs[0];
  out[51] = (loEnergy + hiEnergy) > 0 ? hiEnergy / (loEnergy + hiEnergy) : 0;
  out[52] = Math.log2((rec.equation_count || 0) + 1) / 24;
  let norm = 0; for (let i = 0; i < dim; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1; for (let i = 0; i < dim; i++) out[i] /= norm;
  return out;
}

// ── SYNESTHESIA (MS.I5) — the SAME field C heard as sound ───────────────────────────────────
// One equation, many senses. describeEquational reads the field C as a VISUAL percept;
// describeEquationalAudio reads the SAME field C as an AUDITORY percept — the master music
// equation's band→octave amplitude spectrum (ℓ = ⌊log₂ max(x,y)⌋, amplitude = |coeff|). Injected
// into the auditory region, this is "hearing what she sees" (and, from an imagined/sound-derived
// field C, "seeing what she hears"). Deterministic, L2-normalised, fixed-dim.
export function describeEquationalAudio(rec, bins) {
  bins = bins || 32;
  const out = new Float64Array(bins);
  if (!rec || !rec.channels) return out;
  const W2 = rec.pad_w || rec.width || 1;
  for (const name of ['Y', 'Cb', 'Cr']) {
    const c = rec.channels[name];
    if (!c || !c.val_b64) continue;
    let val, pos;
    try { val = b64i16(c.val_b64); pos = decodePositions(c, val.length); } catch (e) { continue; }
    const qs = c.qscale || 1;
    for (let i = 0; i < val.length; i++) {
      const p = pos[i] | 0; if (p < 0) continue;
      const x = p % W2, y = (p / W2) | 0;
      const band = Math.min(bins - 1, Math.max(0, Math.log2(Math.max(x, y) + 1) | 0));
      out[band] += Math.abs(val[i] * qs);     // amplitude into its octave band
    }
  }
  let norm = 0; for (let i = 0; i < bins; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1; for (let i = 0; i < bins; i++) out[i] /= norm;
  return out;
}

// ── THOUGHT MEDIUM (MS.I4) — cognitive operations ON the field C ────────────────────────────
// Her cognition doesn't just READ the equation, it OPERATES on it. These are the manipulate /
// change / morph verbs from the spec, done IN the equational domain (not at the pixel level):
// pure, deterministic functions field C → field C, so a thought is a transform of equations.

// pack a sorted position list + real (dequantized) values back into a channel record.
function _packChannel(posArr, realVals) {
  const k = posArr.length;
  let maxAbs = 1e-8; for (let i = 0; i < k; i++) maxAbs = Math.max(maxAbs, Math.abs(realVals[i]));
  const qscale = maxAbs / 32000;
  const q = new Int16Array(k);
  for (let i = 0; i < k; i++) { const v = Math.round(realVals[i] / qscale); q[i] = Math.max(-32767, Math.min(32767, v)); }
  return { keep: k, qscale, pos_enc: 'dv1', pos_b64: bytesToB64(new Uint8Array(encPos(Array.from(posArr)))), val_b64: i16ToB64(q) };
}

// abstract(rec, dev): cognitive "simplify / zoom-out" — drop the weakest coefficients (below a
// per-channel relative threshold) and return a genuinely simpler field C. dev∈[0,1]; 0 = identity.
export function abstract(rec, dev) {
  const f = Math.max(0, Math.min(1, dev || 0));
  if (!f) return rec;
  const channels = {}; let total = 0;
  for (const name of ['Y', 'Cb', 'Cr']) {
    const c = rec.channels[name]; if (!c) continue;
    const val = b64i16(c.val_b64), qs = c.qscale, pos = decodePositions(c, val.length);
    let mx = 0; for (let i = 0; i < val.length; i++) mx = Math.max(mx, Math.abs(val[i] * qs));
    const thr = f * mx * 0.6;
    const keepPos = [], keepVal = [];
    for (let i = 0; i < val.length; i++) { const v = val[i] * qs; if (Math.abs(v) >= thr) { keepPos.push(pos[i]); keepVal.push(v); } }
    channels[name] = keepPos.length ? _packChannel(keepPos, keepVal) : _packChannel([0], [0]);
    total += channels[name].keep;
  }
  return { ...rec, channels, equation_count: total, fidelity: { ...(rec.fidelity || {}), source: 'mindspace-abstract' } };
}

// morphField(recA, recB, t): a THOUGHT TRANSITION between two equational forms — union the two
// coefficient sets and lerp values in the equation domain. Requires the same canvas/pad dims
// (same vision size). Returns null if they differ (caller falls back). t∈[0,1].
export function morphField(recA, recB, t) {
  if (!recA || !recB || recA.pad_w !== recB.pad_w || recA.pad_h !== recB.pad_h || recA.width !== recB.width || recA.height !== recB.height) return null;
  const u = Math.max(0, Math.min(1, t)), channels = {}; let total = 0;
  for (const name of ['Y', 'Cb', 'Cr']) {
    const a = recA.channels[name], b = recB.channels[name];
    const m = new Map();
    if (a) { const v = b64i16(a.val_b64), qs = a.qscale, p = decodePositions(a, v.length); for (let i = 0; i < v.length; i++) m.set(p[i], (m.get(p[i]) || 0) + (1 - u) * v[i] * qs); }
    if (b) { const v = b64i16(b.val_b64), qs = b.qscale, p = decodePositions(b, v.length); for (let i = 0; i < v.length; i++) m.set(p[i], (m.get(p[i]) || 0) + u * v[i] * qs); }
    const keys = Array.from(m.keys()).sort((x, y) => x - y);
    const keepPos = [], keepVal = [];
    for (const p of keys) { const v = m.get(p); if (Math.abs(v) > 1e-9) { keepPos.push(p); keepVal.push(v); } }
    channels[name] = keepPos.length ? _packChannel(keepPos, keepVal) : _packChannel([0], [0]);
    total += channels[name].keep;
  }
  return { ...recA, channels, equation_count: total, fidelity: { ...(recA.fidelity || {}), source: 'mindspace-morph' } };
}

// ── traceField(rec, opts) — field C → HER HAND'S STROKES (DRAW-ENGINE, Gee 2026-07-15) ───────
// The faithful inverse of sketch(): takes a REAL field C (a thing she has SEEN /
// imagined / recombined) and traces its salient contours into stroke primitives
// her hand can draw. This REPLACES the old shape-per-word stamp + the 24-point
// radial-blob draw-from-memory: the SHAPE comes from the actual image she looked
// at, never a table. A 12-gon has nothing to do with a word; a traced contour of
// a horse she perceived IS the horse.
//
// Node-safe (NO ImageData — reconstructImageData is browser-only): runs the CDF
// 9/7 inverse straight to Y/Cb/Cr luma planes, Sobel gradient, relative-threshold
// edge map, greedy edge-follow into polylines, Douglas-Peucker simplify to a
// bounded stroke budget, colors each stroke from the field's local YCbCr. Coords
// normalized [0,1] for sketch(). Bounded working grid (a DRAWING is coarse, not a
// photo edge map) — loop-safe on the no-GPU box.
//
// REFERENCE-NOT-FACT (Gee): this is a TRACE — her interpretation of what she saw,
// coarsened + budgeted + re-colorable by the caller (her goth palette) — never a
// pixel-perfect photostat of the reference image.
function _rdp(pts, eps) {                       // Douglas-Peucker polyline simplify
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const left = _rdp(pts.slice(0, idx + 1), eps);
    const right = _rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}
export function traceField(rec, opts = {}) {
  if (!rec || !rec.channels) return [];
  const W = rec.width, H = rec.height, W2 = rec.pad_w, H2 = rec.pad_h;
  if (!W || !H || !W2 || !H2) return [];
  // inverse-transform each channel to a full plane (Node-safe: no ImageData)
  const planes = {};
  for (const name of ['Y', 'Cb', 'Cr']) {
    const c = rec.channels[name];
    const flat = new Float64Array(W2 * H2);
    if (c && c.val_b64) {
      const val = b64i16(c.val_b64), qs = c.qscale || 1, pos = decodePositions(c, val.length), SIZE = W2 * H2;
      for (let i = 0; i < pos.length; i++) { const p = pos[i]; if (p >= 0 && p < SIZE) flat[p] = val[i] * qs; }
      idwt2(flat, H2, W2);
    }
    planes[name] = flat;
  }
  // working grid — coarse on purpose (a drawing, not an edge photo). Aspect-kept.
  const target = Math.max(24, Math.min(opts.traceSide || 80, 256));
  const gw = Math.max(8, Math.round(W >= H ? target : target * (W / H)));
  const gh = Math.max(8, Math.round(H >= W ? target : target * (H / W)));
  const px = (gx) => Math.min(W - 1, Math.max(0, Math.round((gx / (gw - 1)) * (W - 1))));
  const py = (gy) => Math.min(H - 1, Math.max(0, Math.round((gy / (gh - 1)) * (H - 1))));
  const L = new Float64Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) { const sy = py(gy); for (let gx = 0; gx < gw; gx++) L[gy * gw + gx] = planes.Y[sy * W2 + px(gx)]; }
  // Sobel gradient magnitude
  const G = new Float64Array(gw * gh); let gmax = 1e-6;
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    const i = y * gw + x;
    const gxv = -L[i - gw - 1] - 2 * L[i - 1] - L[i + gw - 1] + L[i - gw + 1] + 2 * L[i + 1] + L[i + gw + 1];
    const gyv = -L[i - gw - 1] - 2 * L[i - gw] - L[i - gw + 1] + L[i + gw - 1] + 2 * L[i + gw] + L[i + gw + 1];
    const m = Math.sqrt(gxv * gxv + gyv * gyv); G[i] = m; if (m > gmax) gmax = m;
  }
  const thr = gmax * Math.max(0.03, Math.min(0.9, opts.edgeThresh ?? 0.28));
  const edge = new Uint8Array(gw * gh);
  for (let i = 0; i < G.length; i++) edge[i] = G[i] >= thr ? 1 : 0;
  // greedy edge-follow: each unvisited edge pixel seeds a polyline that walks the
  // strongest unvisited 8-neighbor until the contour ends.
  const visited = new Uint8Array(gw * gh);
  const NB = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const maxStrokes = Math.max(4, Math.min(opts.maxStrokes || 48, 240));
  const polylines = [];
  for (let sy = 0; sy < gh && polylines.length < maxStrokes; sy++) {
    for (let sx = 0; sx < gw && polylines.length < maxStrokes; sx++) {
      const si = sy * gw + sx;
      if (!edge[si] || visited[si]) continue;
      const pts = []; let cx = sx, cy = sy, ci = si, guard = 0;
      while (guard++ < gw * gh) {
        visited[ci] = 1; pts.push([cx, cy]);
        let best = -1, bestG = 0, bx = 0, by = 0;
        for (const [dx, dy] of NB) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (edge[ni] && !visited[ni] && G[ni] > bestG) { bestG = G[ni]; best = ni; bx = nx; by = ny; }
        }
        if (best < 0) break;
        cx = bx; cy = by; ci = best;
      }
      if (pts.length >= 3) polylines.push(pts);
    }
  }
  // simplify + normalize + color each stroke from the field's local YCbCr
  const eps = Math.max(0.3, opts.simplify ?? 1.1);
  const strokes = [];
  for (const pl of polylines) {
    const simp = _rdp(pl, eps);
    if (simp.length < 2) continue;
    const mid = simp[simp.length >> 1];
    const mo = py(mid[1]) * W2 + px(mid[0]);
    const rgb = ycbcrToRGB(planes.Y[mo], planes.Cb[mo], planes.Cr[mo]).map(v => Math.max(0, Math.min(255, Math.round(v * 255))));
    strokes.push({ type: 'poly', pts: simp.map(p => [p[0] / (gw - 1), p[1] / (gh - 1)]), rgb });
  }
  return strokes;
}

// low-level transform primitives exported for the GPU path / golden-vector parity (MS.H6)
export { fwd1d, fwd2d, inv1d, idwt2, rgbToYCbCr, ycbcrToRGB, padDim, encPos, decPos, decodePositions, b64bytes, b64i16, bytesToB64, i16ToB64, A97, B97, G97, D97, K97 };
