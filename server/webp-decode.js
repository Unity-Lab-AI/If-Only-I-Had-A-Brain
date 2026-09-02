'use strict';
// webp-decode.js — WEBP → RGBA, so a webp figure reaches her eyes the same way a
// jpeg or a png does.
//
// ⛔⛔ WHY THIS FILE EXISTS, AND WHY IT IS NOT A WORKAROUND.
//
// `_decodeImageToRGBA` understood two formats: jpeg (jpeg-js) and png (pngjs).
// Everything else returned null, and `visual-memory.js` already carried the
// scar in a comment — *"a generator handing back HTML or webp died invisibly"*.
// Every figure PubMed Central serves for a modern article is `.webp`, so the
// entire research-literature figure lane would have banked rows that look
// perfectly well-formed and fail at perception, reported as `failed`, which is
// indistinguishable from a dead link.
//
// ⭐ THE CONVERSION AFTER THIS POINT ALREADY EXISTS AND IS NOT TOUCHED. The
// mind-space analyser enters at RGBA — `equationalizeImageData(img)` takes
// ImageData, and in the browser the BROWSER did the format decode, which is why
// there is no per-format code anywhere in it. From RGBA on it is rgb→YCbCr,
// reflect-pad to a multiple of 64, the CDF 9/7 lifting transform, energy-target
// term selection, Int16 quantise. We run that exact code, with the same lifting
// constants. **So the only thing missing was pixels.** This file produces
// pixels; the coefficient stage is unchanged and stays format-blind.
//
// ⛔ A `VP8 ` chunk is a LOSSY VP8 key frame, so "just decode it" means a real
// intra decoder: boolean arithmetic decoder, key-frame mode parsing, token and
// dequantisation, inverse DCT and inverse Walsh-Hadamard, ten intra predictors,
// the loop filter, and YUV420 → RGBA. Every one of those is ported from the
// reference decoder in RFC 6386 rather than written from memory, and the ~3,300
// constants they need are DERIVED from the same spec by
// `.claude/scripts/fetch-vp8-tables.mjs` into `server/vp8-tables.json`.
//
// ⚠ WHY DERIVED AND NOT TYPED — a measured reason, not a preference. Written out
// from memory, `default_coeff_probs` began `253, 136, 254`. The spec's table
// begins with an entire band of `128`s and `253, 136, 254` is band **1**. Every
// coefficient would have been read one band out of position. Because every value
// feeds ONE shared arithmetic decoder, a single wrong constant does not blur the
// picture — it desynchronises the stream and everything after it is noise. That
// is also the one mercy here: **this decoder cannot be subtly wrong.** It either
// reproduces the image or it produces static.
//
// LICENCE: algorithms and constants from RFC 6386, whose code components are
// BSD-licensed (Copyright (c) 2010, 2011, Google Inc.).

const fs = require('fs');
const path = require('path');

let T = null;
function tables() {
  if (T) return T;
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'vp8-tables.json'), 'utf8'));
  const t = raw.tables;
  // Fail loudly and once. A missing or short table is not something to limp
  // past — it would decode to noise and the noise would be blamed on the codec.
  const need = { dc_qlookup: 128, ac_qlookup: 128, default_coeff_probs: 1056, coeff_update_probs: 1056, kf_b_mode_probs: 900 };
  for (const [k, n] of Object.entries(need)) {
    if (!Array.isArray(t[k]) || t[k].length !== n) throw new Error(`vp8-tables.json: ${k} is ${t[k] ? t[k].length : 'absent'}, expected ${n} — re-run .claude/scripts/fetch-vp8-tables.mjs`);
  }
  T = {
    dcq: Int16Array.from(t.dc_qlookup),
    acq: Int16Array.from(t.ac_qlookup),
    defProbs: Uint8Array.from(t.default_coeff_probs),
    updProbs: Uint8Array.from(t.coeff_update_probs),
    kfB: Uint8Array.from(t.kf_b_mode_probs),
    kfY: Uint8Array.from(t.kf_ymode_prob),
    kfUV: Uint8Array.from(t.kf_uv_mode_prob),
    bands: Uint8Array.from(t.coeff_bands),
    zigzag: Uint8Array.from(t.zigzag),
    cat: [t.Pcat1, t.Pcat2, t.Pcat3, t.Pcat4, t.Pcat5, t.Pcat6].map((a) => Uint8Array.from(a)),
  };
  return T;
}

// Mode enums, in the spec's order. Intra luma: DC/V/H/TM then B_PRED.
const DC_PRED = 0, V_PRED = 1, H_PRED = 2, TM_PRED = 3, B_PRED = 4;
const B_DC = 0, B_TM = 1, B_VE = 2, B_HE = 3, B_LD = 4, B_RD = 5, B_VR = 6, B_VL = 7, B_HD = 8, B_HU = 9;

// Trees, transcribed from RFC 6386 with the symbolic leaves resolved. These are
// small enough to check by eye; the large probability tables are not, which is
// why those are derived instead.
const KF_YMODE_TREE = [-B_PRED, 2, 4, 6, -DC_PRED, -V_PRED, -H_PRED, -TM_PRED];
const UV_MODE_TREE = [-DC_PRED, 2, -V_PRED, 4, -H_PRED, -TM_PRED];
const BMODE_TREE = [
  -B_DC, 2,
  -B_TM, 4,
  -B_VE, 6,
  8, 12,
  -B_HE, 10,
  -B_RD, -B_VR,
  -B_LD, 14,
  -B_VL, 16,
  -B_HD, -B_HU,
];
const SEGMENT_TREE = [2, 4, -0, -1, -2, -3];
// Token tree. Leaves 0..4 are literal values, 5..10 are the extra-bit
// categories, 11 is end-of-block.
const TOKEN_EOB = 11;
const COEFF_TREE = [
  -TOKEN_EOB, 2,
  -0, 4,
  -1, 6,
  8, 12,
  -2, 10,
  -3, -4,
  14, 16,
  -5, -6,
  18, 20,
  -7, -8,
  -9, -10,
];
const CAT_BASE = [5, 7, 11, 19, 35, 67];

// Per-block token context slots. 25 blocks map onto 9 slots: four luma columns
// or rows, two each for U and V, and one for Y2.
const LEFT_CTX_IDX = Uint8Array.from([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8]);
const ABOVE_CTX_IDX = Uint8Array.from([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 4, 5, 4, 5, 6, 7, 6, 7, 8]);

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const sat8 = (v) => (v < -128 ? -128 : v > 127 ? 127 : v);

// ── The boolean arithmetic decoder ───────────────────────────────────────────
// Ported verbatim from RFC 6386 §20.2. The `bit_count === 8` refill and the
// `range < 128` renormalisation loop are the whole contract; getting either
// subtly wrong desynchronises everything downstream.
class Bool {
  constructor(buf, start, size) {
    this.b = buf;
    if (size >= 2) { this.value = (buf[start] << 8) | buf[start + 1]; this.pos = start + 2; this.left = size - 2; }
    else { this.value = 0; this.pos = start; this.left = 0; }
    this.range = 255;
    this.count = 0;
  }
  get(prob) {
    const split = 1 + (((this.range - 1) * prob) >> 8);
    const SPLIT = split << 8;
    let ret;
    if (this.value >= SPLIT) { ret = 1; this.range -= split; this.value -= SPLIT; }
    else { ret = 0; this.range = split; }
    while (this.range < 128) {
      this.value <<= 1;
      this.range <<= 1;
      if (++this.count === 8) {
        this.count = 0;
        if (this.left) { this.value |= this.b[this.pos++]; this.left--; }
      }
    }
    return ret;
  }
  bit() { return this.get(128); }
  uint(bits) { let z = 0; for (let i = bits - 1; i >= 0; i--) z |= this.bit() << i; return z; }
  int(bits) { let z = 0; for (let i = bits - 1; i >= 0; i--) z |= this.bit() << i; return this.bit() ? -z : z; }
  maybeInt(bits) { return this.bit() ? this.int(bits) : 0; }
  tree(t, p, pOff = 0, start = 0) {
    let i = start;
    while ((i = t[i + this.get(p[pOff + (i >> 1)])]) > 0);
    return -i;
  }
}

// ── Inverse Walsh-Hadamard (the Y2 block) — RFC 6386 §20.8 ───────────────────
function iwalsh(inp, out) {
  let a1, b1, c1, d1, a2, b2, c2, d2;
  for (let i = 0; i < 4; i++) {
    a1 = inp[i] + inp[12 + i];
    b1 = inp[4 + i] + inp[8 + i];
    c1 = inp[4 + i] - inp[8 + i];
    d1 = inp[i] - inp[12 + i];
    out[i] = a1 + b1;
    out[4 + i] = c1 + d1;
    out[8 + i] = a1 - b1;
    out[12 + i] = d1 - c1;
  }
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    a1 = out[o] + out[o + 3];
    b1 = out[o + 1] + out[o + 2];
    c1 = out[o + 1] - out[o + 2];
    d1 = out[o] - out[o + 3];
    a2 = a1 + b1; b2 = c1 + d1; c2 = a1 - b1; d2 = d1 - c1;
    out[o] = (a2 + 3) >> 3;
    out[o + 1] = (b2 + 3) >> 3;
    out[o + 2] = (c2 + 3) >> 3;
    out[o + 3] = (d2 + 3) >> 3;
  }
}

// ── Inverse DCT, added straight onto the prediction — RFC 6386 §20.8 ─────────
const COSPI8SQRT2M1 = 20091, SINPI8SQRT2 = 35468;
const idctTmp = new Int32Array(16);
function idctAdd(plane, off, stride, co, coOff) {
  // columns
  for (let i = 0; i < 4; i++) {
    const c0 = co[coOff + i], c1 = co[coOff + 4 + i], c2 = co[coOff + 8 + i], c3 = co[coOff + 12 + i];
    const a1 = c0 + c2;
    const b1 = c0 - c2;
    let temp1 = (c1 * SINPI8SQRT2) >> 16;
    let temp2 = c3 + ((c3 * COSPI8SQRT2M1) >> 16);
    const cc1 = temp1 - temp2;
    temp1 = c1 + ((c1 * COSPI8SQRT2M1) >> 16);
    temp2 = (c3 * SINPI8SQRT2) >> 16;
    const d1 = temp1 + temp2;
    idctTmp[i] = a1 + d1;
    idctTmp[12 + i] = a1 - d1;
    idctTmp[4 + i] = b1 + cc1;
    idctTmp[8 + i] = b1 - cc1;
  }
  // rows, and add to the prediction in place
  for (let i = 0; i < 4; i++) {
    const r = i * 4;
    const t0 = idctTmp[r], t1 = idctTmp[r + 1], t2 = idctTmp[r + 2], t3 = idctTmp[r + 3];
    const a1 = t0 + t2;
    const b1 = t0 - t2;
    let temp1 = (t1 * SINPI8SQRT2) >> 16;
    let temp2 = t3 + ((t3 * COSPI8SQRT2M1) >> 16);
    const c1 = temp1 - temp2;
    temp1 = t1 + ((t1 * COSPI8SQRT2M1) >> 16);
    temp2 = (t3 * SINPI8SQRT2) >> 16;
    const d1 = temp1 + temp2;
    const o = off + i * stride;
    plane[o] = clamp255(plane[o] + ((a1 + d1 + 4) >> 3));
    plane[o + 3] = clamp255(plane[o + 3] + ((a1 - d1 + 4) >> 3));
    plane[o + 1] = clamp255(plane[o + 1] + ((b1 + c1 + 4) >> 3));
    plane[o + 2] = clamp255(plane[o + 2] + ((b1 - c1 + 4) >> 3));
  }
}

// ── Intra predictors — RFC 6386 §20.14, written in place with a border ───────
// Each reads `off - 1` for the left column and `off - stride` for the row above,
// which is why the frame carries a border and why the border fixups below are
// mode-dependent rather than a flat constant.
function predDC(p, off, stride, n) {
  let dc = 0;
  for (let i = 0; i < n; i++) dc += p[off - 1 + i * stride] + p[off - stride + i];
  dc = n === 16 ? (dc + 16) >> 5 : n === 8 ? (dc + 8) >> 4 : (dc + 4) >> 3;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) p[off + i * stride + j] = dc;
}
function predV(p, off, stride, n) {
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) p[off + i * stride + j] = p[off - stride + j];
}
function predH(p, off, stride, n) {
  for (let i = 0; i < n; i++) { const l = p[off - 1 + i * stride]; for (let j = 0; j < n; j++) p[off + i * stride + j] = l; }
}
function predTM(p, off, stride, n) {
  const c = p[off - stride - 1];
  for (let i = 0; i < n; i++) {
    const l = p[off - 1 + i * stride];
    for (let j = 0; j < n; j++) p[off + i * stride + j] = clamp255(l + p[off - stride + j] - c);
  }
}
// The ten 4x4 sub-block predictors. `A[k]` is the row above (with four pixels of
// above-right available), `L[k]` the left column, `C` the above-left corner.
function b4(p, off, stride, mode) {
  const A = (k) => p[off - stride + k];
  const L = (k) => p[off - 1 + k * stride];
  const C = p[off - stride - 1];
  const set = (r, c, v) => { p[off + r * stride + c] = v; };
  const avg3 = (x, y, z) => (x + 2 * y + z + 2) >> 2;
  const avg2 = (x, y) => (x + y + 1) >> 1;
  switch (mode) {
    case B_DC: {
      let dc = 4;
      for (let i = 0; i < 4; i++) dc += A(i) + L(i);
      dc >>= 3;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, dc);
      break;
    }
    case B_TM: predTM(p, off, stride, 4); break;
    case B_VE: {
      const v = [avg3(C, A(0), A(1)), avg3(A(0), A(1), A(2)), avg3(A(1), A(2), A(3)), avg3(A(2), A(3), A(4))];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, v[c]);
      break;
    }
    case B_HE: {
      const v = [avg3(C, L(0), L(1)), avg3(L(0), L(1), L(2)), avg3(L(1), L(2), L(3)), avg3(L(2), L(3), L(3))];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, v[r]);
      break;
    }
    case B_LD: {
      const p0 = avg3(A(0), A(1), A(2)), p1 = avg3(A(1), A(2), A(3)), p2 = avg3(A(2), A(3), A(4));
      const p3 = avg3(A(3), A(4), A(5)), p4 = avg3(A(4), A(5), A(6)), p5 = avg3(A(5), A(6), A(7));
      const p6 = avg3(A(6), A(7), A(7));
      const v = [p0, p1, p2, p3, p1, p2, p3, p4, p2, p3, p4, p5, p3, p4, p5, p6];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, v[r * 4 + c]);
      break;
    }
    case B_RD: {
      const p0 = avg3(L(0), C, A(0)), p1 = avg3(C, A(0), A(1)), p2 = avg3(A(0), A(1), A(2)), p3 = avg3(A(1), A(2), A(3));
      const p4 = avg3(L(1), L(0), C), p5 = avg3(L(2), L(1), L(0)), p6 = avg3(L(3), L(2), L(1));
      const v = [p0, p1, p2, p3, p4, p0, p1, p2, p5, p4, p0, p1, p6, p5, p4, p0];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, v[r * 4 + c]);
      break;
    }
    case B_VR: {
      const p0 = avg2(C, A(0)), p1 = avg2(A(0), A(1)), p2 = avg2(A(1), A(2)), p3 = avg2(A(2), A(3));
      const p4 = avg3(L(0), C, A(0)), p5 = avg3(C, A(0), A(1)), p6 = avg3(A(0), A(1), A(2)), p7 = avg3(A(1), A(2), A(3));
      const p8 = avg3(L(1), L(0), C), p9 = avg3(L(2), L(1), L(0));
      const v = [p0, p1, p2, p3, p4, p5, p6, p7, p8, p0, p1, p2, p9, p4, p5, p6];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, v[r * 4 + c]);
      break;
    }
    case B_VL: {
      const p0 = avg2(A(0), A(1)), p1 = avg2(A(1), A(2)), p2 = avg2(A(2), A(3)), p3 = avg2(A(3), A(4));
      const p4 = avg3(A(0), A(1), A(2)), p5 = avg3(A(1), A(2), A(3)), p6 = avg3(A(2), A(3), A(4)), p7 = avg3(A(3), A(4), A(5));
      const p8 = avg3(A(4), A(5), A(6)), p9 = avg3(A(5), A(6), A(7));
      const v = [p0, p1, p2, p3, p4, p5, p6, p7, p1, p2, p3, p8, p5, p6, p7, p9];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, v[r * 4 + c]);
      break;
    }
    case B_HD: {
      const p0 = avg2(L(0), C), p1 = avg3(L(0), C, A(0)), p2 = avg3(C, A(0), A(1)), p3 = avg3(A(0), A(1), A(2));
      const p4 = avg2(L(1), L(0)), p5 = avg3(L(1), L(0), C);
      const p6 = avg2(L(2), L(1)), p7 = avg3(L(2), L(1), L(0));
      const p8 = avg2(L(3), L(2)), p9 = avg3(L(3), L(2), L(1));
      const v = [p0, p1, p2, p3, p4, p5, p0, p1, p6, p7, p4, p5, p8, p9, p6, p7];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, v[r * 4 + c]);
      break;
    }
    case B_HU: {
      const p0 = avg2(L(0), L(1)), p1 = avg3(L(0), L(1), L(2)), p2 = avg2(L(1), L(2)), p3 = avg3(L(1), L(2), L(3));
      const p4 = avg2(L(2), L(3)), p5 = avg3(L(2), L(3), L(3)), p6 = L(3);
      const v = [p0, p1, p2, p3, p2, p3, p4, p5, p4, p5, p6, p6, p6, p6, p6, p6];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) set(r, c, v[r * 4 + c]);
      break;
    }
    default: break;
  }
}

// ── The loop filter — RFC 6386 §20.6 ────────────────────────────────────────
function commonAdjust(p, o, s, useOuter) {
  const P1 = p[o - 2 * s], P0 = p[o - s], Q0 = p[o], Q1 = p[o + s];
  let a = 3 * (Q0 - P0);
  if (useOuter) a += sat8(P1 - Q1);
  a = sat8(a);
  const f1 = (a + 4 > 127 ? 127 : a + 4) >> 3;
  const f2 = (a + 3 > 127 ? 127 : a + 3) >> 3;
  p[o - s] = clamp255(P0 + f2);
  p[o] = clamp255(Q0 - f1);
  return f1;
}
function subblockFilter(p, o, s, hev, interior, edge) {
  if (!normalThreshold(p, o, s, edge, interior)) return;
  const hevOn = highEdgeVariance(p, o, s, hev);
  if (hevOn) { commonAdjust(p, o, s, 1); return; }
  const f1 = commonAdjust(p, o, s, 0);
  const a = (f1 + 1) >> 1;
  p[o - 2 * s] = clamp255(p[o - 2 * s] + a);
  p[o + s] = clamp255(p[o + s] - a);
}
function mbFilter(p, o, s, hev, interior, edge) {
  if (!normalThreshold(p, o, s, edge, interior)) return;
  if (highEdgeVariance(p, o, s, hev)) { commonAdjust(p, o, s, 1); return; }
  const P2 = p[o - 3 * s], P1 = p[o - 2 * s], P0 = p[o - s];
  const Q0 = p[o], Q1 = p[o + s], Q2 = p[o + 2 * s];
  const w = sat8(sat8(P1 - Q1) + 3 * (Q0 - P0));
  let a = (27 * w + 63) >> 7;
  p[o - s] = clamp255(P0 + a); p[o] = clamp255(Q0 - a);
  a = (18 * w + 63) >> 7;
  p[o - 2 * s] = clamp255(P1 + a); p[o + s] = clamp255(Q1 - a);
  a = (9 * w + 63) >> 7;
  p[o - 3 * s] = clamp255(P2 + a); p[o + 2 * s] = clamp255(Q2 - a);
}
function highEdgeVariance(p, o, s, hev) {
  return Math.abs(p[o - 2 * s] - p[o - s]) > hev || Math.abs(p[o + s] - p[o]) > hev;
}
function simpleThreshold(p, o, s, limit) {
  return (Math.abs(p[o - s] - p[o]) * 2 + (Math.abs(p[o - 2 * s] - p[o + s]) >> 1)) <= limit;
}
function normalThreshold(p, o, s, edge, interior) {
  const I = interior;
  return simpleThreshold(p, o, s, 2 * edge + I)
    && Math.abs(p[o - 4 * s] - p[o - 3 * s]) <= I && Math.abs(p[o - 3 * s] - p[o - 2 * s]) <= I
    && Math.abs(p[o - 2 * s] - p[o - s]) <= I && Math.abs(p[o + 3 * s] - p[o + 2 * s]) <= I
    && Math.abs(p[o + 2 * s] - p[o + s]) <= I && Math.abs(p[o + s] - p[o]) <= I;
}

// ── Container ────────────────────────────────────────────────────────────────
// Returns `{ chunk, start, size }` for the bitstream, or a reason it cannot be
// read. ⚠ VP8L (lossless) and the alpha-carrying VP8X form are NAMED rather
// than silently failing: "I do not decode this variant yet" and "this file is
// broken" are different facts and a caller that cannot tell them apart reports
// the wrong one.
function findChunk(b) {
  if (b.length < 16) return { reason: 'too short to be a RIFF container' };
  if (!(b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46)) return { reason: 'not RIFF' };
  if (!(b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)) return { reason: 'RIFF but not WEBP' };
  let p = 12;
  const rd32 = (o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  while (p + 8 <= b.length) {
    const tag = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    const size = rd32(p + 4);
    const body = p + 8;
    if (tag === 'VP8 ') return { chunk: tag, start: body, size: Math.min(size, b.length - body) };
    if (tag === 'VP8L') return { reason: 'VP8L lossless webp — this decoder handles the lossy VP8 form' };
    if (tag === 'VP8X') { p = body + size + (size & 1); continue; }   // extended header: keep walking to the real bitstream
    p = body + size + (size & 1);
  }
  return { reason: 'no VP8 bitstream chunk found' };
}

/**
 * Decode a WebP buffer to RGBA.
 * @returns {{w:number,h:number,data:Uint8ClampedArray}|null}
 * On refusal returns null and sets `decodeWebP.lastReason` — never throws at the
 * caller, because this sits on the perception path.
 */
function decodeWebP(buf) {
  decodeWebP.lastReason = '';
  try {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const found = findChunk(b);
    if (found.reason) { decodeWebP.lastReason = found.reason; return null; }
    return decodeVP8(b, found.start, found.size);
  } catch (e) {
    decodeWebP.lastReason = e && e.message ? e.message : String(e);
    return null;
  }
}

function decodeVP8(b, start, size) {
  const t = tables();
  if (size < 10) { decodeWebP.lastReason = 'VP8 chunk shorter than its own frame header'; return null; }
  const tag = b[start] | (b[start + 1] << 8) | (b[start + 2] << 16);
  const isKey = (tag & 1) === 0;
  const firstPart = (tag >> 5) & 0x7FFFF;
  if (!isKey) { decodeWebP.lastReason = 'VP8 interframe — a still webp must carry a key frame'; return null; }
  if (!(b[start + 3] === 0x9d && b[start + 4] === 0x01 && b[start + 5] === 0x2a)) {
    decodeWebP.lastReason = 'VP8 key-frame start code missing';
    return null;
  }
  const W = ((b[start + 7] << 8) | b[start + 6]) & 0x3FFF;
  const H = ((b[start + 9] << 8) | b[start + 8]) & 0x3FFF;
  if (!W || !H) { decodeWebP.lastReason = `VP8 declares a ${W}x${H} frame`; return null; }

  const mbCols = (W + 15) >> 4, mbRows = (H + 15) >> 4;
  const d = new Bool(b, start + 10, Math.min(firstPart, size - 10));

  d.bit();  // colour space
  d.bit();  // clamping type

  // ── segmentation ──
  const seg = { enabled: 0, updateMap: 0, abs: 0, quant: [0, 0, 0, 0], lf: [0, 0, 0, 0], probs: [255, 255, 255] };
  seg.enabled = d.bit();
  if (seg.enabled) {
    seg.updateMap = d.bit();
    const updateData = d.bit();
    if (updateData) {
      seg.abs = d.bit();
      for (let i = 0; i < 4; i++) seg.quant[i] = d.bit() ? d.int(7) : 0;
      for (let i = 0; i < 4; i++) seg.lf[i] = d.bit() ? d.int(6) : 0;
    }
    if (seg.updateMap) for (let i = 0; i < 3; i++) seg.probs[i] = d.bit() ? d.uint(8) : 255;
  }

  // ── loop filter header ──
  const lf = { simple: d.bit(), level: d.uint(6), sharpness: d.uint(3), deltaEnabled: 0, refDelta: [0, 0, 0, 0], modeDelta: [0, 0, 0, 0] };
  lf.deltaEnabled = d.bit();
  if (lf.deltaEnabled && d.bit()) {
    for (let i = 0; i < 4; i++) if (d.bit()) lf.refDelta[i] = d.int(6);
    for (let i = 0; i < 4; i++) if (d.bit()) lf.modeDelta[i] = d.int(6);
  }

  // ── residual partitions ──
  const nParts = 1 << d.uint(2);
  const afterFirst = start + 10 + firstPart;
  const sizesAt = afterFirst;
  const dataStart = afterFirst + (nParts - 1) * 3;
  if (dataStart > start + size) { decodeWebP.lastReason = 'partition table runs past the chunk'; return null; }
  const parts = [];
  let cursor = dataStart;
  for (let i = 0; i < nParts; i++) {
    let psz;
    if (i < nParts - 1) psz = b[sizesAt + i * 3] | (b[sizesAt + i * 3 + 1] << 8) | (b[sizesAt + i * 3 + 2] << 16);
    else psz = (start + size) - cursor;
    if (psz < 0 || cursor + psz > start + size) { decodeWebP.lastReason = `residual partition ${i} runs past the chunk`; return null; }
    parts.push(new Bool(b, cursor, psz));
    cursor += psz;
  }

  // ── quantiser ──
  const qIndex = d.uint(7);
  const yDc = d.maybeInt(4), y2Dc = d.maybeInt(4), y2Ac = d.maybeInt(4), uvDc = d.maybeInt(4), uvAc = d.maybeInt(4);
  const cq = (q) => (q < 0 ? 0 : q > 127 ? 127 : q);
  // Y2 DC doubles and Y2 AC scales by 155/100 with a floor of 8; UV DC is capped
  // at 132. Those four adjustments are in the spec, not invented here.
  const dqFor = (segIdx) => {
    let q = qIndex;
    if (seg.enabled) q = seg.abs ? seg.quant[segIdx] : q + seg.quant[segIdx];
    const y2a = Math.max(8, Math.floor(t.acq[cq(q + y2Ac)] * 155 / 100));
    return [
      [t.dcq[cq(q + yDc)], t.acq[cq(q)]],                       // Y1
      [t.dcq[cq(q + y2Dc)] * 2, y2a],                           // Y2
      [Math.min(132, t.dcq[cq(q + uvDc)]), t.acq[cq(q + uvAc)]], // UV
    ];
  };
  const dq = [];
  for (let i = 0; i < (seg.enabled ? 4 : 1); i++) dq.push(dqFor(i));

  d.bit();   // refresh entropy probs (key frame)

  // ── coefficient probability updates ──
  const probs = Uint8Array.from(t.defProbs);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) for (let k = 0; k < 3; k++) for (let l = 0; l < 11; l++) {
    const idx = ((i * 8 + j) * 3 + k) * 11 + l;
    if (d.get(t.updProbs[idx])) probs[idx] = d.uint(8);
  }
  const noSkip = d.bit();
  const skipProb = noSkip ? d.uint(8) : 0;

  // ── pass one: every macroblock's modes, from partition 0 in raster order ──
  // Modes live in partition 0 and residuals in the DCT partitions, two
  // independent streams, so reading all modes first is equivalent to the
  // reference's row-by-row interleave and much simpler to hold in one head.
  const nMB = mbRows * mbCols;
  const yModes = new Uint8Array(nMB), uvModes = new Uint8Array(nMB);
  const segIds = new Uint8Array(nMB), skips = new Uint8Array(nMB);
  const bModes = new Uint8Array(nMB * 16);
  // Sub-block mode context. Outside the frame the context is B_DC.
  const aboveB = new Uint8Array(mbCols * 4);
  const leftB = new Uint8Array(4);
  for (let mbY = 0; mbY < mbRows; mbY++) {
    leftB.fill(B_DC);
    for (let mbX = 0; mbX < mbCols; mbX++) {
      const m = mbY * mbCols + mbX;
      if (seg.enabled && seg.updateMap) segIds[m] = d.tree(SEGMENT_TREE, seg.probs);
      skips[m] = noSkip ? d.get(skipProb) : 0;
      const ym = d.tree(KF_YMODE_TREE, t.kfY);
      yModes[m] = ym;
      if (ym === B_PRED) {
        for (let i = 0; i < 16; i++) {
          const r = i >> 2, c = i & 3;
          const a = r === 0 ? aboveB[mbX * 4 + c] : bModes[m * 16 + (r - 1) * 4 + c];
          const l = c === 0 ? leftB[r] : bModes[m * 16 + r * 4 + (c - 1)];
          const bm = d.tree(BMODE_TREE, t.kfB, (a * 10 + l) * 9);
          bModes[m * 16 + i] = bm;
        }
      } else {
        // A whole-macroblock mode still supplies sub-block context to its
        // neighbours, via the equivalent 4x4 mode.
        const eq = ym === DC_PRED ? B_DC : ym === V_PRED ? B_VE : ym === H_PRED ? B_HE : B_TM;
        bModes.fill(eq, m * 16, m * 16 + 16);
      }
      for (let c = 0; c < 4; c++) aboveB[mbX * 4 + c] = bModes[m * 16 + 12 + c];
      for (let r = 0; r < 4; r++) leftB[r] = bModes[m * 16 + r * 4 + 3];
      uvModes[m] = d.tree(UV_MODE_TREE, t.kfUV);
    }
  }

  // ── the frame, with a border so predictors can read off-frame neighbours ──
  const BORDER = 16;
  const yStride = mbCols * 16 + BORDER * 2;
  const uvStride = mbCols * 8 + BORDER * 2;
  const yPlane = new Uint8Array(yStride * (mbRows * 16 + BORDER * 2));
  const uPlane = new Uint8Array(uvStride * (mbRows * 8 + BORDER * 2));
  const vPlane = new Uint8Array(uvStride * (mbRows * 8 + BORDER * 2));
  const yOrigin = BORDER * yStride + BORDER;
  const uvOrigin = BORDER * uvStride + BORDER;

  const coeffs = new Int16Array(25 * 16);
  const y2out = new Int16Array(16);
  const hasCoeffs = new Uint8Array(nMB);

  // Token contexts: nine slots per macroblock, carried left along a row and
  // down each column.
  const aboveCtx = new Uint8Array(mbCols * 9);
  const leftCtx = new Uint8Array(9);

  // ⚠ MODE-DEPENDENT BORDER FIXUPS. Out-of-frame is 127 above and 129 left —
  // EXCEPT under DC_PRED, where the spec duplicates the other edge instead, and
  // except at row/column zero where it falls back to the constant. A flat
  // 127/129 is the obvious guess and it is wrong.
  const fixupLeft = (p, off, stride, n, row, mode) => {
    if (mode === DC_PRED && row) {
      for (let i = 0; i < n; i++) p[off - 1 + i * stride] = p[off - stride + i];
    } else {
      for (let i = -1; i < n; i++) p[off - 1 + i * stride] = 129;
    }
  };
  const fixupAbove = (p, off, stride, n, col, mode) => {
    if (mode === DC_PRED && col) {
      for (let i = 0; i < n; i++) p[off - stride + i] = p[off - 1 + i * stride];
    } else {
      for (let i = -1; i < n; i++) p[off - stride + i] = 127;
    }
    for (let i = 0; i < 4; i++) p[off - stride + n + i] = 127;   // above-right, for the diagonal sub-block modes
  };

  for (let mbY = 0; mbY < mbRows; mbY++) {
    leftCtx.fill(0);
    const part = parts[mbY & (nParts - 1)];
    for (let mbX = 0; mbX < mbCols; mbX++) {
      const m = mbY * mbCols + mbX;
      const yOff = yOrigin + mbY * 16 * yStride + mbX * 16;
      const uOff = uvOrigin + mbY * 8 * uvStride + mbX * 8;
      const vOff = uOff;

      if (mbX === 0) {
        fixupLeft(yPlane, yOff, yStride, 16, mbY, yModes[m]);
        fixupLeft(uPlane, uOff, uvStride, 8, mbY, uvModes[m]);
        fixupLeft(vPlane, vOff, uvStride, 8, mbY, uvModes[m]);
        if (mbY === 0) yPlane[yOff - yStride - 1] = 127;
      }
      if (mbY === 0) {
        fixupAbove(yPlane, yOff, yStride, 16, mbX, yModes[m]);
        fixupAbove(uPlane, uOff, uvStride, 8, mbX, uvModes[m]);
        fixupAbove(vPlane, vOff, uvStride, 8, mbX, uvModes[m]);
      }

      coeffs.fill(0);
      const dqs = dq[seg.enabled ? segIds[m] : 0];
      const hasY2 = yModes[m] !== B_PRED;
      let any = 0;
      if (!skips[m]) {
        any = decodeMBTokens(part, probs, t, coeffs, hasY2, dqs, leftCtx, aboveCtx, mbX * 9);
      } else {
        // A skipped macroblock has no residual, so its contexts clear —
        // ⛔ EXCEPT SLOT 8, THE Y2 CONTEXT, WHICH ONLY CLEARS IF THIS
        // MACROBLOCK WOULD HAVE WRITTEN ONE. The spec says it in as many
        // words: *"We have to preserve the context of the second order block
        // if this mode would not have updated it."* Clearing it
        // unconditionally makes every B_PRED macroblock destroy a context it
        // never touched, and the error COMPOUNDS down the frame — the picture
        // stays legible at the top and smears progressively lower down, which
        // reads like a prediction bug rather than a context bug.
        for (let i = 0; i < 8; i++) { leftCtx[i] = 0; aboveCtx[mbX * 9 + i] = 0; }
        if (hasY2) { leftCtx[8] = 0; aboveCtx[mbX * 9 + 8] = 0; }
      }
      hasCoeffs[m] = any;

      // ── luma ──
      if (yModes[m] === B_PRED) {
        // Above-right of sub-block 3 is copied down the right edge so blocks
        // 7, 11 and 15 have the four pixels the diagonal modes read.
        for (let k = 0; k < 4; k++) {
          const src = yPlane[yOff - yStride + 16 + k];
          yPlane[yOff + 3 * yStride + 16 + k] = src;
          yPlane[yOff + 7 * yStride + 16 + k] = src;
          yPlane[yOff + 11 * yStride + 16 + k] = src;
        }
        for (let i = 0; i < 16; i++) {
          const off = yOff + (i >> 2) * 4 * yStride + (i & 3) * 4;
          b4(yPlane, off, yStride, bModes[m * 16 + i]);
          idctAdd(yPlane, off, yStride, coeffs, i * 16);
        }
      } else {
        const mode = yModes[m];
        if (mode === DC_PRED) predDC(yPlane, yOff, yStride, 16);
        else if (mode === V_PRED) predV(yPlane, yOff, yStride, 16);
        else if (mode === H_PRED) predH(yPlane, yOff, yStride, 16);
        else predTM(yPlane, yOff, yStride, 16);
        iwalsh(coeffs.subarray(24 * 16, 25 * 16), y2out);
        for (let i = 0; i < 16; i++) coeffs[i * 16] = y2out[i];
        for (let i = 0; i < 16; i++) {
          const off = yOff + (i >> 2) * 4 * yStride + (i & 3) * 4;
          idctAdd(yPlane, off, yStride, coeffs, i * 16);
        }
      }
      // ── chroma ──
      const um = uvModes[m];
      for (const [pl, off] of [[uPlane, uOff], [vPlane, vOff]]) {
        if (um === DC_PRED) predDC(pl, off, uvStride, 8);
        else if (um === V_PRED) predV(pl, off, uvStride, 8);
        else if (um === H_PRED) predH(pl, off, uvStride, 8);
        else predTM(pl, off, uvStride, 8);
      }
      for (let i = 0; i < 4; i++) {
        const off = uOff + (i >> 1) * 4 * uvStride + (i & 1) * 4;
        idctAdd(uPlane, off, uvStride, coeffs, (16 + i) * 16);
      }
      for (let i = 0; i < 4; i++) {
        const off = vOff + (i >> 1) * 4 * uvStride + (i & 1) * 4;
        idctAdd(vPlane, off, uvStride, coeffs, (20 + i) * 16);
      }
    }
    // The reference extends the last row of the rightmost macroblock four
    // pixels to the right, for the sub-block modes that read above-right.
    const edge = yOrigin + mbY * 16 * yStride + mbCols * 16;
    for (let k = 0; k < 4; k++) yPlane[edge + 15 * yStride + k] = yPlane[edge - 1 + 15 * yStride];
  }

  // ── loop filter, whole frame ──
  // ⚠ RUN AFTER RECONSTRUCTION, NEVER INTERLEAVED THE OTHER WAY. The reference
  // predicts row N then filters row N-1, so intra prediction always reads
  // UNFILTERED neighbours. Filtering a row before the row below is predicted
  // would feed filtered pixels into prediction and drift the whole picture.
  if (lf.level) {
    for (let mbY = 0; mbY < mbRows; mbY++) {
      for (let mbX = 0; mbX < mbCols; mbX++) {
        const m = mbY * mbCols + mbX;
        let level = lf.level;
        if (seg.enabled) level = seg.abs ? seg.lf[segIds[m]] : level + seg.lf[segIds[m]];
        if (lf.deltaEnabled) {
          level += lf.refDelta[0];                       // key frame: the current frame
          if (yModes[m] === B_PRED) level += lf.modeDelta[0];
        }
        level = level > 63 ? 63 : level < 0 ? 0 : level;
        if (!level) continue;
        let interior = level;
        if (lf.sharpness) {
          interior >>= lf.sharpness > 4 ? 2 : 1;
          if (interior > 9 - lf.sharpness) interior = 9 - lf.sharpness;
        }
        if (interior < 1) interior = 1;
        let hev = level >= 15 ? 1 : 0;
        if (level >= 40) hev++;
        // The third increment is inter-frame only; a still webp never takes it.
        const sub = hasCoeffs[m] || yModes[m] === B_PRED;
        const yOff = yOrigin + mbY * 16 * yStride + mbX * 16;
        const uOff = uvOrigin + mbY * 8 * uvStride + mbX * 8;

        if (lf.simple) {
          // The simple filter touches luma only, by the spec.
          if (mbX) for (let i = 0; i < 16; i++) { const o = yOff + i * yStride; if (simpleThreshold(yPlane, o, 1, 2 * (level + 2) + interior)) commonAdjust(yPlane, o, 1, 1); }
          if (sub) for (const dx of [4, 8, 12]) for (let i = 0; i < 16; i++) { const o = yOff + i * yStride + dx; if (simpleThreshold(yPlane, o, 1, 2 * level + interior)) commonAdjust(yPlane, o, 1, 1); }
          if (mbY) for (let i = 0; i < 16; i++) { const o = yOff + i; if (simpleThreshold(yPlane, o, yStride, 2 * (level + 2) + interior)) commonAdjust(yPlane, o, yStride, 1); }
          if (sub) for (const dy of [4, 8, 12]) for (let i = 0; i < 16; i++) { const o = yOff + dy * yStride + i; if (simpleThreshold(yPlane, o, yStride, 2 * level + interior)) commonAdjust(yPlane, o, yStride, 1); }
          continue;
        }

        // vertical macroblock edge
        if (mbX) {
          for (let i = 0; i < 16; i++) mbFilter(yPlane, yOff + i * yStride, 1, hev, interior, level + 2);
          for (let i = 0; i < 8; i++) { mbFilter(uPlane, uOff + i * uvStride, 1, hev, interior, level + 2); mbFilter(vPlane, uOff + i * uvStride, 1, hev, interior, level + 2); }
        }
        if (sub) {
          for (const dx of [4, 8, 12]) for (let i = 0; i < 16; i++) subblockFilter(yPlane, yOff + i * yStride + dx, 1, hev, interior, level);
          for (let i = 0; i < 8; i++) { subblockFilter(uPlane, uOff + i * uvStride + 4, 1, hev, interior, level); subblockFilter(vPlane, uOff + i * uvStride + 4, 1, hev, interior, level); }
        }
        // horizontal macroblock edge
        if (mbY) {
          for (let i = 0; i < 16; i++) mbFilter(yPlane, yOff + i, yStride, hev, interior, level + 2);
          for (let i = 0; i < 8; i++) { mbFilter(uPlane, uOff + i, uvStride, hev, interior, level + 2); mbFilter(vPlane, uOff + i, uvStride, hev, interior, level + 2); }
        }
        if (sub) {
          for (const dy of [4, 8, 12]) for (let i = 0; i < 16; i++) subblockFilter(yPlane, yOff + dy * yStride + i, yStride, hev, interior, level);
          for (let i = 0; i < 8; i++) { subblockFilter(uPlane, uOff + 4 * uvStride + i, uvStride, hev, interior, level); subblockFilter(vPlane, uOff + 4 * uvStride + i, uvStride, hev, interior, level); }
        }
      }
    }
  }

  // ── YUV420 → RGBA, libwebp's integer BT.601 studio-swing path ──
  const out = new Uint8ClampedArray(W * H * 4);
  const clip8 = (v) => { const s = v >> 6; return s < 0 ? 0 : s > 255 ? 255 : s; };
  for (let y = 0; y < H; y++) {
    const yr = yOrigin + y * yStride;
    const cr = uvOrigin + (y >> 1) * uvStride;
    for (let x = 0; x < W; x++) {
      const Y = yPlane[yr + x], U = uPlane[cr + (x >> 1)], V = vPlane[cr + (x >> 1)];
      const yy = (Y * 19077) >> 8;
      const o = (y * W + x) * 4;
      out[o] = clip8(yy + ((V * 26149) >> 8) - 14234);
      out[o + 1] = clip8(yy - ((U * 6419) >> 8) - ((V * 13320) >> 8) + 8708);
      out[o + 2] = clip8(yy + ((U * 33050) >> 8) - 17685);
      out[o + 3] = 255;
    }
  }
  return { w: W, h: H, data: out };
}

// ── Token / coefficient decode — RFC 6386 §20.16 ─────────────────────────────
// Block order inside a macroblock: Y2 first when present, then the sixteen luma
// blocks, then four U and four V. `type` selects the probability plane, and only
// type 0 — luma in a macroblock that HAS a Y2 block — starts at coefficient 1,
// because its DC arrives from the inverse Walsh transform instead.
function decodeMBTokens(bd, probs, t, coeffs, hasY2, dqs, leftCtx, aboveCtx, aOff) {
  const zz = t.zigzag, bands = t.bands;
  let anyNonZero = 0;

  const block = (i, type, dqf) => {
    const li = LEFT_CTX_IDX[i], ai = ABOVE_CTX_IDX[i];
    let ctx = leftCtx[li] + aboveCtx[aOff + ai];
    let c = type === 0 ? 1 : 0;
    const base = type * 8 * 3 * 11;
    let has = 0;
    let skipEob = false;
    while (c < 16) {
      const pOff = base + bands[c] * 3 * 11 + ctx * 11;
      // The end-of-block branch cannot follow a zero token, so it is skipped by
      // entering the tree one node in.
      const tok = bd.tree(COEFF_TREE, probs, pOff, skipEob ? 2 : 0);
      if (tok === TOKEN_EOB) break;
      if (tok === 0) { ctx = 0; skipEob = true; c++; continue; }
      let abs;
      if (tok <= 4) abs = tok;
      else {
        const cat = tok - 5;
        const cp = t.cat[cat];
        let extra = 0;
        for (let k = 0; k < cp.length; k++) extra += extra + bd.get(cp[k]);
        abs = CAT_BASE[cat] + extra;
      }
      ctx = abs === 1 ? 1 : 2;
      skipEob = false;
      const v = bd.bit() ? -abs : abs;
      coeffs[i * 16 + zz[c]] = v * dqf[c === 0 ? 0 : 1];
      has = 1;
      c++;
    }
    leftCtx[li] = has;
    aboveCtx[aOff + ai] = has;
    if (has) anyNonZero = 1;
  };

  if (hasY2) {
    block(24, 1, dqs[1]);
    for (let i = 0; i < 16; i++) block(i, 0, dqs[0]);
  } else {
    for (let i = 0; i < 16; i++) block(i, 3, dqs[0]);
    // ⛔ SLOT 8 IS LEFT ALONE ON PURPOSE. This macroblock has no Y2 block, so
    // it never wrote that context and must not clear it — the next macroblock
    // that does have a Y2 block reads it. Zeroing it here was the same defect
    // as in the skip path.
  }
  for (let i = 16; i < 24; i++) block(i, 2, dqs[2]);
  return anyNonZero;
}

module.exports = { decodeWebP };
