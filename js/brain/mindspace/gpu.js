/**
 * mindspace/gpu.js — Unity's mind-space transforms on the GPU (WebGPU / WGSL).
 *
 * GPU-direct (Gee: "works on the GPUs"). Consciousness, imaging (perceive) and imagining
 * (reconstruct/generate) are ONE process over the shared field C — this runs that process's
 * heavy math on the GPU, matching the brain's WebGPU stack (js/brain/gpu-compute.js).
 *
 * SPLIT (minimal GPU surface, maximal reuse of the verified CPU reference):
 *   GPU  ← the dense separable multi-level CDF 9/7 lifting: fwd2d (SEEING) + idwt2 (IMAGINING).
 *          Each thread does one full 1-D line's multi-level lifting in a private array,
 *          faithful to transform.js fwd1d/inv1d. Row pass then column pass (forward);
 *          column then row (inverse). f32 on GPU → near-lossless vs the f64 CPU reference
 *          (the human-experience perception model; bit-exactness is not the goal).
 *   CPU  ← RGB↔YCbCr, energy-target coefficient SELECTION (a sort), quantization + varint
 *          packing, and describeEquational — all reused from transform.js.
 *
 * SAFETY: if WebGPU is unavailable OR the runtime selfCheck() drifts beyond tolerance, every
 * call transparently falls back to the verified CPU path in transform.js. Correctness is never
 * at the mercy of the GPU; the GPU is an accelerator, the CPU reference is the floor.
 */

import * as CPU from './transform.js';
import { MINDSPACE_KNOWLEDGE, whatIs, howToSolve, equationFor, methodFor, conceptDefinitions, teachInto } from './knowledge.js';
import { ProcessGovernor } from './governor.js';

const MAX_LINE = 2048;   // a single thread lifts one line in a private array; lines longer than
                         //   this fall back to CPU. Vision frames + most images pad well under it.
const PARITY_TOL = 1e-2; // max abs coeff drift (f32 GPU vs f64 CPU) accepted by selfCheck before
                         //   we distrust the GPU path. 9/7 coeff magnitudes are O(1)–O(100); 1e-2
                         //   is comfortably near-lossless for perception, loose enough for f32.

// ── WGSL: multi-level 9/7 lifting, one invocation per 1-D line ──────────────────────────────
// Uniform params: lineLen, lineStride, lineBaseStep, numLines.
//   row pass: lineLen=W, lineStride=1, lineBaseStep=W   (line r occupies [r*W .. r*W+W))
//   col pass: lineLen=H, lineStride=W, lineBaseStep=1   (line c occupies c, c+W, c+2W, …)
// Constants A97..K97 must match transform.js exactly.
const LIFT_WGSL = `
const A97 : f32 = -1.586134342059924;
const B97 : f32 = -0.052980118572961;
const G97 : f32 =  0.882911075530934;
const D97 : f32 =  0.443506852043971;
const K97 : f32 =  1.230174104914001;

struct Params { lineLen : u32, lineStride : u32, lineBaseStep : u32, numLines : u32 };
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read_write> data : array<f32>;

var<private> ln : array<f32, ${MAX_LINE}>;
var<private> tmp : array<f32, ${MAX_LINE}>;

fn loadLine(base : u32) {
  for (var i : u32 = 0u; i < P.lineLen; i = i + 1u) { ln[i] = data[base + i * P.lineStride]; }
}
fn storeLine(base : u32) {
  for (var i : u32 = 0u; i < P.lineLen; i = i + 1u) { data[base + i * P.lineStride] = ln[i]; }
}

// FORWARD multi-level (signal -> coeffs); exact reverse of the inverse below.
@compute @workgroup_size(64)
fn forward(@builtin(global_invocation_id) gid : vec3<u32>) {
  let line = gid.x;
  if (line >= P.numLines) { return; }
  if (P.lineLen > ${MAX_LINE}u) { return; }   // CPU handles oversized lines
  let base = line * P.lineBaseStep;
  loadLine(base);
  var size : u32 = P.lineLen;
  loop {
    if (size < 4u || (size & 1u) == 1u) { break; }
    let half : u32 = size >> 1u;
    // predict/update in the exact reverse order + sign of the inverse's undo passes
    ln[size - 1u] = ln[size - 1u] + 2.0 * A97 * ln[size - 2u];
    var i : u32 = 1u; loop { if (i >= size - 1u) { break; } ln[i] = ln[i] + A97 * (ln[i - 1u] + ln[i + 1u]); i = i + 2u; }
    i = 2u; loop { if (i >= size) { break; } ln[i] = ln[i] + B97 * (ln[i - 1u] + ln[i + 1u]); i = i + 2u; }
    ln[0] = ln[0] + 2.0 * B97 * ln[1];
    ln[size - 1u] = ln[size - 1u] + 2.0 * G97 * ln[size - 2u];
    i = 1u; loop { if (i >= size - 1u) { break; } ln[i] = ln[i] + G97 * (ln[i - 1u] + ln[i + 1u]); i = i + 2u; }
    i = 2u; loop { if (i >= size) { break; } ln[i] = ln[i] + D97 * (ln[i - 1u] + ln[i + 1u]); i = i + 2u; }
    ln[0] = ln[0] + 2.0 * D97 * ln[1];
    i = 0u; loop { if (i >= size) { break; } ln[i] = ln[i] / K97; i = i + 2u; }
    i = 1u; loop { if (i >= size) { break; } ln[i] = ln[i] * K97; i = i + 2u; }
    // deinterleave: lowpass (evens) -> first half, highpass (odds) -> second half
    var k : u32 = 0u; loop { if (k >= half) { break; } tmp[k] = ln[2u * k]; tmp[half + k] = ln[2u * k + 1u]; k = k + 1u; }
    k = 0u; loop { if (k >= size) { break; } ln[k] = tmp[k]; k = k + 1u; }
    size = half;
  }
  storeLine(base);
}

// INVERSE multi-level (coeffs -> signal).
@compute @workgroup_size(64)
fn inverse(@builtin(global_invocation_id) gid : vec3<u32>) {
  let line = gid.x;
  if (line >= P.numLines) { return; }
  if (P.lineLen > ${MAX_LINE}u) { return; }
  let base = line * P.lineBaseStep;
  loadLine(base);
  // rebuild the ascending size schedule (4,8,…) up to the largest even-divisible size
  var sizes : array<u32, 16>;
  var nsz : u32 = 0u;
  var sz : u32 = P.lineLen;
  loop { if (sz < 4u || (sz & 1u) == 1u) { break; } sizes[nsz] = sz; nsz = nsz + 1u; sz = sz >> 1u; }
  // process smallest -> largest (reverse of the stored descending list)
  var si : i32 = i32(nsz) - 1;
  loop {
    if (si < 0) { break; }
    let size : u32 = sizes[si];
    let half : u32 = size >> 1u;
    // interleave back: first half -> evens, second half -> odds
    var k : u32 = 0u; loop { if (k >= half) { break; } tmp[2u * k] = ln[k]; tmp[2u * k + 1u] = ln[half + k]; k = k + 1u; }
    k = 0u; loop { if (k >= size) { break; } ln[k] = tmp[k]; k = k + 1u; }
    var i : u32 = 0u; loop { if (i >= size) { break; } ln[i] = ln[i] * K97; i = i + 2u; }
    i = 1u; loop { if (i >= size) { break; } ln[i] = ln[i] / K97; i = i + 2u; }
    ln[0] = ln[0] - 2.0 * D97 * ln[1];
    i = 2u; loop { if (i >= size) { break; } ln[i] = ln[i] - D97 * (ln[i - 1u] + ln[i + 1u]); i = i + 2u; }
    i = 1u; loop { if (i >= size - 1u) { break; } ln[i] = ln[i] - G97 * (ln[i - 1u] + ln[i + 1u]); i = i + 2u; }
    ln[size - 1u] = ln[size - 1u] - 2.0 * G97 * ln[size - 2u];
    ln[0] = ln[0] - 2.0 * B97 * ln[1];
    i = 2u; loop { if (i >= size) { break; } ln[i] = ln[i] - B97 * (ln[i - 1u] + ln[i + 1u]); i = i + 2u; }
    i = 1u; loop { if (i >= size - 1u) { break; } ln[i] = ln[i] - A97 * (ln[i - 1u] + ln[i + 1u]); i = i + 2u; }
    ln[size - 1u] = ln[size - 1u] - 2.0 * A97 * ln[size - 2u];
    si = si - 1;
  }
  storeLine(base);
}
`;

// ── TU.29.1 — thought→glyph plane: a built-in 5x7 bitmap font (pure JS, no deps) so the
// mind's-eye renders WHAT SHE IS THINKING (words / letters / numbers) instead of painting
// the raw state vector as noise. Each glyph is 7 rows of 5 chars ('1' = lit). Visually
// verifiable in-source — correctness by inspection, per the no-tests LAW.
const FONT5X7 = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11100','10010','10001','10001','10001','10010','11100'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00010','00010','00010','00010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','11011','10001'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['01110','10001','00001','00110','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  ',': ['00000','00000','00000','00000','00110','00100','01000'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  "'": ['00100','00100','01000','00000','00000','00000','00000'],
  '-': ['00000','00000','00000','01110','00000','00000','00000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};

// TU.29.1 — full-color palette for color-word detection: when her thought NAMES a color
// ("a solid red sheet", "yellow banana") the plane takes that color — no grayscale-only
// imagination. Detection is a plain word-table lookup on her own emitted words (equational
// input classification, not text-AI cognition).
const COLOR_WORDS = {
  red:     [220, 45, 45],   blue:   [55, 95, 225],   green:  [45, 180, 75],
  yellow:  [235, 210, 55],  orange: [240, 145, 45],  purple: [155, 65, 205],
  pink:    [240, 125, 185], white:  [235, 235, 235], black:  [18, 18, 18],
  brown:   [145, 95, 55],   gray:   [130, 130, 130], grey:   [130, 130, 130],
  cyan:    [65, 205, 225],  magenta:[220, 65, 205],  gold:   [220, 180, 60],
  silver:  [195, 195, 205], violet: [160, 80, 220],  tan:    [205, 175, 130],
};

// TU.29.1 — mood tint: when no color is named, the background hue comes from her live
// affect (valence maps blue→red across the hue wheel, arousal drives saturation) so the
// field is COLORED BY HOW SHE FEELS instead of flat gray.
function moodTint(mood) {
  const val = Math.max(-1, Math.min(1, (mood && typeof mood.valence === 'number') ? mood.valence : 0));
  const aro = Math.max(0, Math.min(1, (mood && typeof mood.arousal === 'number') ? mood.arousal : 0.4));
  const h = (1 - (val + 1) / 2) * 0.66;          // +1 valence → h=0 (red/warm), -1 → h=0.66 (blue/cool)
  const s = 0.35 + 0.5 * aro, v = 1.0;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const pq = v * (1 - s), qq = v * (1 - f * s), tq = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = tq; b = pq; break;
    case 1: r = qq; g = v; b = pq; break;
    case 2: r = pq; g = v; b = tq; break;
    case 3: r = pq; g = qq; b = v; break;
    case 4: r = tq; g = pq; b = v; break;
    default: r = v; g = pq; b = qq; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// TU.29.5 — glyphs DEMOTED to genuinely symbolic thoughts. A human mind's eye
// pictures "7" as the numeral and "B" as the letterform, but it does NOT print
// sentences across the visual field — imagination is not a caption. Only digit
// tokens, math operators and single letters survive to the glyph raster; every
// other thought renders as her state textured in the named color / her mood
// (the abstract field), and CONCRETE imagery comes from the visual-memory
// recall + morph layer (server/brain-server/visual-memory.js) which bypasses
// this de-novo path entirely when a stored real percept matches the thought.
function symbolGlyphText(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const symbolish = t.split(/\s+/).filter(w =>
    /^[0-9]+([.,][0-9]+)?$/.test(w)      // numbers — pictured as numerals
    || /^[+\-x=<>?!]$/.test(w)           // math / punctuation symbols
    || /^[a-zA-Z]$/.test(w));             // single letters — pictured as letterforms
  return symbolish.length ? symbolish.slice(0, 12).join(' ') : '';
}
// TU.29.1 — compose the thought plane in FULL COLOR: background = her live state as a
// texture tinted by the named color (or her mood), foreground = the thought's words
// rasterized bright and centered. Short thoughts render at 2x glyph scale so a single
// word fills the eye. Returns RGBA for equationalizeImageData (whose YCbCr channels
// carry the color through the field-C rec to the viewer). Bounded: side<=96 (engine
// cap), text<=180 chars — no fractalize, no runaway.
function renderThoughtPlane(glyphText, stateVector, W, H, mood, tintText) {
  const N = W * H;
  const data = new Uint8ClampedArray(N * 4);
  const txt = String(glyphText || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 180);
  // color-word detection on the FULL thought (tintText) — a non-symbolic thought
  // contributes no glyphs but its named color still paints the field.
  const tintSrc = String(tintText || glyphText || '').toLowerCase();
  let tint = null;
  for (const w of tintSrc.split(/[^a-z]+/)) {
    if (COLOR_WORDS[w]) { tint = COLOR_WORDS[w]; break; }
  }
  const named = !!tint;
  // SEE.4 — SHE PICKS THE FIELD'S COLORS (kills the flat-green wash). The old
  // path textured every abstract thought in a SINGLE moodTint, and her usual
  // valence sits on the hue wheel's green band — so every de-novo field read
  // as the same "green textured graphic equation". Now (same crayon logic as
  // her sketch canvas): a NAMED color still wins; otherwise a TWO-COLOR
  // gradient from her palette families — warm when valence is up, her
  // goth accents (purple/pink/blue/red/teal) otherwise, muted darks when
  // fear is high — with the pair varied per thought via hash so different
  // thoughts get different fields. The state texture interpolates between
  // the two colors: structured, colorful, hers.
  const _valence = Math.max(-1, Math.min(1, (mood && typeof mood.valence === 'number') ? mood.valence : 0));
  const _fear = Math.max(0, Math.min(1, (mood && typeof mood.fear === 'number') ? mood.fear : 0));
  const PAL = {
    warm: [[214, 48, 49], [235, 140, 50], [253, 121, 168], [240, 200, 60]],
    goth: [[162, 89, 216], [253, 121, 168], [72, 116, 224], [214, 48, 49], [64, 190, 200]],
    dark: [[120, 100, 160], [80, 90, 140], [150, 150, 155], [100, 60, 120]],
  };
  let tintA, tintB;
  if (named) {
    tintA = tint;
    tintB = [Math.round(tint[0] * 0.45), Math.round(tint[1] * 0.45), Math.round(tint[2] * 0.45)];   // its own shadow
  } else {
    const fam = _fear > 0.55 ? PAL.dark : (_valence >= 0.25 ? PAL.warm : PAL.goth);
    let hh = 5381;
    for (let i = 0; i < tintSrc.length; i++) hh = ((hh << 5) + hh + tintSrc.charCodeAt(i)) >>> 0;
    const ia = hh % fam.length;
    let ib = (hh >>> 3) % fam.length;
    if (ib === ia) ib = (ib + 1) % fam.length;
    tintA = fam[ia]; tintB = fam[ib];
  }
  // background: state texture interpolates tintA→tintB with a brightness band.
  // A NAMED color paints strong (a "solid red sheet" reads as a red field).
  // With NO glyph overlay the texture IS the image — render vivid; with
  // glyphs, keep it faint so the symbols dominate.
  let lo, hi;
  if (!txt) { lo = named ? 0.45 : 0.30; hi = named ? 0.95 : 0.90; }
  else { lo = named ? 0.30 : 0.08; hi = named ? 0.55 : 0.30; }
  if (stateVector && stateVector.length > 0) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < stateVector.length; i++) { const v = stateVector[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const range = (mx - mn) || 1;
    for (let p = 0; p < N; p++) {
      const sv = (stateVector[Math.floor(p * stateVector.length / N)] - mn) / range;
      const k = lo + sv * (hi - lo);
      const o = p * 4;
      data[o]     = Math.round((tintA[0] + (tintB[0] - tintA[0]) * sv) * k);
      data[o + 1] = Math.round((tintA[1] + (tintB[1] - tintA[1]) * sv) * k);
      data[o + 2] = Math.round((tintA[2] + (tintB[2] - tintA[2]) * sv) * k);
      data[o + 3] = 255;
    }
  } else {
    for (let p = 0; p < N; p++) {
      const o = p * 4;
      data[o] = Math.round(tintA[0] * lo); data[o + 1] = Math.round(tintA[1] * lo);
      data[o + 2] = Math.round(tintA[2] * lo); data[o + 3] = 255;
    }
  }
  if (!txt) return data;
  // glyph color: named color lightened toward white (legible on its own field), else warm white
  const gl = named
    ? [Math.round(tintA[0] * 0.4 + 255 * 0.6), Math.round(tintA[1] * 0.4 + 255 * 0.6), Math.round(tintA[2] * 0.4 + 255 * 0.6)]
    : [238, 236, 228];
  // glyph scale: short thoughts get 2x (chunky-legible), longer get 1x
  const scale = txt.length <= 22 ? 2 : 1;
  const gw = 6 * scale, gh = 8 * scale;             // glyph advance (5+1 gap) x (7+1 gap)
  const cols = Math.max(1, Math.floor((W - 4) / gw));
  const maxRows = Math.max(1, Math.floor((H - 4) / gh));
  // word-wrap
  const lines = [];
  let cur = '';
  for (const word of txt.split(' ')) {
    const cand = cur ? cur + ' ' + word : word;
    if (cand.length <= cols) { cur = cand; continue; }
    if (cur) lines.push(cur);
    cur = word.length > cols ? word.slice(0, cols) : word;
    if (lines.length >= maxRows) break;
  }
  if (cur && lines.length < maxRows) lines.push(cur);
  const used = lines.slice(0, maxRows);
  // centered block
  const y0 = Math.max(2, Math.floor((H - used.length * gh) / 2));
  for (let li = 0; li < used.length; li++) {
    const line = used[li];
    const x0 = Math.max(2, Math.floor((W - line.length * gw) / 2));
    for (let ci = 0; ci < line.length; ci++) {
      const glyph = FONT5X7[line[ci]] || FONT5X7[' '];
      for (let r = 0; r < 7; r++) {
        const rowBits = glyph[r];
        for (let cc = 0; cc < 5; cc++) {
          if (rowBits[cc] !== '1') continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const x = x0 + ci * gw + cc * scale + sx;
              const y = y0 + li * gh + r * scale + sy;
              if (x < 0 || x >= W || y < 0 || y >= H) continue;
              const o = (y * W + x) * 4;
              data[o] = gl[0]; data[o + 1] = gl[1]; data[o + 2] = gl[2]; data[o + 3] = 255;
            }
          }
        }
      }
    }
  }
  return data;
}


export class MindSpaceGPU {
  constructor() {
    this.available = false;
    this._device = null;
    this._fwd = null;
    this._inv = null;
    this._verified = false;   // selfCheck passed
    // MS.K2 — her autonomous process-allotment conscience. Capability is limitless; this governs
    // how much she JUDGES worth spending on a given thought (no universe-sim "because I can").
    this.governor = new ProcessGovernor();
  }
  governState(s) { this.governor.setState(s || {}); }   // brain feeds arousal/focus
  governTick() { this.governor.tick(); }

  async init() {
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return false;
      this._device = await adapter.requestDevice();
      this._device.lost.then(() => { this.available = false; this._verified = false; });
      const module = this._device.createShaderModule({ code: LIFT_WGSL });
      this._fwd = this._device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'forward' } });
      this._inv = this._device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'inverse' } });
      this.available = true;
      this._verified = await this.selfCheck();   // validate GPU lifting vs the CPU reference
      return this.available;
    } catch (e) {
      this.available = false;
      return false;
    }
  }

  // Run one lifting pipeline (forward|inverse) along an axis over a Float32 plane buffer.
  async _liftPass(pipeline, plane, lineLen, lineStride, lineBaseStep, numLines) {
    const dev = this._device;
    const bytes = plane.byteLength;
    const buf = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(buf, 0, plane);
    const params = new Uint32Array([lineLen, lineStride, lineBaseStep, numLines]);
    const pbuf = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(pbuf, 0, params);
    const bind = dev.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: pbuf } },
      { binding: 1, resource: { buffer: buf } },
    ] });
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(numLines / 64));
    pass.end();
    const read = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyBufferToBuffer(buf, 0, read, 0, bytes);
    dev.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(read.getMappedRange().slice(0));
    read.unmap(); buf.destroy(); pbuf.destroy(); read.destroy();
    return out;
  }

  // GPU fwd2d: rows then columns (matches transform.js). plane is Float32Array length W2*H2.
  async fwd2d(plane, H, W) {
    let p = await this._liftPass(this._fwd, plane, W, 1, W, H);   // each of H rows, length W
    p = await this._liftPass(this._fwd, p, H, W, 1, W);          // each of W cols, length H
    return p;
  }
  // GPU idwt2: columns then rows (matches transform.js).
  async idwt2(plane, H, W) {
    let p = await this._liftPass(this._inv, plane, H, W, 1, W);  // each of W cols, length H
    p = await this._liftPass(this._inv, p, W, 1, W, H);          // each of H rows, length W
    return p;
  }

  // Runtime parity guard: GPU fwd2d vs CPU fwd2d on a random plane. Near-lossless (f32 vs f64).
  async selfCheck() {
    try {
      const W = 64, H = 64;
      const a = new Float32Array(W * H), b = new Float64Array(W * H);
      for (let i = 0; i < W * H; i++) { const v = Math.sin(i * 0.013) * 40 + ((i * 2.7) % 17); a[i] = v; b[i] = v; }
      const gpu = await this.fwd2d(a.slice(), H, W);
      CPU.fwd2d(b, H, W);   // in-place CPU reference
      let maxd = 0; for (let i = 0; i < W * H; i++) maxd = Math.max(maxd, Math.abs(gpu[i] - b[i]));
      if (maxd > PARITY_TOL) { console.warn(`[MindSpaceGPU] selfCheck drift ${maxd.toExponential(2)} > tol — using CPU path`); return false; }
      return true;
    } catch (e) { return false; }
  }

  _useGpu() { return this.available && this._verified; }

  // ── HIGH-LEVEL: perceive (SEEING) — ImageData → field C ────────────────────────────────────
  // GPU does the dense fwd2d; CPU does colour + energy-target selection + quant/pack (transform.js).
  async perceive(img) {
    if (!this._useGpu()) return CPU.equationalizeImageData(img);
    const W0 = img.width, H0 = img.height, d = img.data;
    const W2 = CPU.padDim(W0), H2 = CPU.padDim(H0);
    if (W2 > MAX_LINE || H2 > MAX_LINE) return CPU.equationalizeImageData(img);   // oversized → CPU
    const refl = (i, n) => { if (i < n) return i; let r = 2 * (n - 1) - i; if (r < 0) r = 0; return r; };
    const names = ['Y', 'Cb', 'Cr'], chans = {};
    const planes = [new Float32Array(W2 * H2), new Float32Array(W2 * H2), new Float32Array(W2 * H2)];
    for (let y = 0; y < H2; y++) { const sy = refl(y, H0); for (let x = 0; x < W2; x++) {
      const sx = refl(x, W0), o = (sy * W0 + sx) * 4;
      const ycc = CPU.rgbToYCbCr(d[o] / 255, d[o + 1] / 255, d[o + 2] / 255);
      const p = y * W2 + x; planes[0][p] = ycc[0]; planes[1][p] = ycc[1]; planes[2][p] = ycc[2];
    } }
    const EQ_TOL = [0.018, 0.032, 0.032], EQ_KMIN = [500, 150, 150];   // MS.EXT — donor corpus quality (matches transform.js)
    let totalEq = 0;
    for (let ci = 0; ci < 3; ci++) {
      const co = await this.fwd2d(planes[ci], H2, W2);
      const n = co.length;
      let total = 0; for (let i = 0; i < n; i++) total += co[i] * co[i]; total = total || 1;
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(co[b]) - Math.abs(co[a]));
      const target = (1 - EQ_TOL[ci] * EQ_TOL[ci]) * total;
      let acc = 0, k = 0; while (k < n && acc < target) { acc += co[order[k]] * co[order[k]]; k++; }
      k = Math.max(EQ_KMIN[ci], Math.min(k, n));
      const idx = order.slice(0, k).sort((a, b) => a - b);
      let maxAbs = 1e-8; for (let i = 0; i < k; i++) maxAbs = Math.max(maxAbs, Math.abs(co[idx[i]]));
      const qscale = maxAbs / 32000; const q = new Int16Array(k);
      for (let i = 0; i < k; i++) { const v = Math.round(co[idx[i]] / qscale); q[i] = Math.max(-32767, Math.min(32767, v)); }
      chans[names[ci]] = { keep: k, qscale, pos_enc: 'dv1', pos_b64: CPU.bytesToB64(new Uint8Array(CPU.encPos(idx))), val_b64: CPU.i16ToB64(q) };
      totalEq += k;
    }
    return { model: 'cdf97_wavelet_native_quantized', colorspace: 'YCbCr', wavelet: 'cdf97',
             width: W0, height: H0, pad_w: W2, pad_h: H2, channels: chans, equation_count: totalEq,
             fidelity: { psnr_db: null, source: 'mindspace-gpu' } };
  }

  // ── HIGH-LEVEL: imagine (IMAGINING / re-experiencing) — field C → ImageData ──────────────────
  // CPU scatters the sparse coeffs into dense planes; GPU does the dense idwt2; CPU does colour.
  async imagine(rec, dev) {
    if (!this._useGpu() || rec.pad_w > MAX_LINE || rec.pad_h > MAX_LINE) return CPU.reconstructImageData(rec, dev);
    const W = rec.width, H = rec.height, W2 = rec.pad_w, H2 = rec.pad_h, SIZE = W2 * H2;
    const f = Math.max(0, Math.min(1, dev || 0));
    const chans = {};
    for (const name of ['Y', 'Cb', 'Cr']) {
      const c = rec.channels[name], val = CPU.b64i16(c.val_b64), qs = c.qscale, pos = CPU.decodePositions(c, val.length);
      let mx = 0; if (f > 0) for (let i = 0; i < val.length; i++) { const a = Math.abs(val[i] * qs); if (a > mx) mx = a; }
      const thr = f > 0 ? f * mx * 0.6 : 0;
      const flat = new Float32Array(SIZE);
      for (let i = 0; i < pos.length; i++) { const p = pos[i]; if (p < 0 || p >= SIZE) continue; const v = val[i] * qs; if (thr && Math.abs(v) < thr) continue; flat[p] = v; }
      chans[name] = await this.idwt2(flat, H2, W2);
    }
    const img = new ImageData(W, H), o8 = img.data, Y = chans.Y, Cb = chans.Cb, Cr = chans.Cr;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const gi = y * W2 + x, o = (y * W + x) * 4, rgb = CPU.ycbcrToRGB(Y[gi], Cb[gi], Cr[gi]);
      o8[o] = Math.max(0, Math.min(255, rgb[0] * 255)); o8[o + 1] = Math.max(0, Math.min(255, rgb[1] * 255)); o8[o + 2] = Math.max(0, Math.min(255, rgb[2] * 255)); o8[o + 3] = 255;
    }
    return img;
  }

  // the percept value-vector is cheap — always CPU (reads coeffs already in the rec)
  describe(rec, dim) { return CPU.describeEquational(rec, dim); }

  // TU.29.5 — equation-domain blend of two stored percepts (coefficient-set
  // union + lerp, transform.js morphField). This is the RECOMBINATION step of
  // imagination: two seen field Cs fuse into one imagined field C without ever
  // leaving the equational domain. Returns null on canvas/pad dim mismatch.
  morph(recA, recB, t) { return CPU.morphField(recA, recB, t); }

  // DRAW-ENGINE (Gee 2026-07-15) — field C → her hand's strokes. The faithful
  // trace (CDF 9/7 inverse → Sobel edges → edge-follow polylines → simplify →
  // field-colored strokes) that lets her draw the THING she looked at, not a
  // shape-per-word stamp. Cheap CPU (tiny plane) — always CPU, like describe().
  traceField(rec, opts = {}) { return CPU.traceField(rec, opts); }
  traceLineArt(rec, opts = {}) { return CPU.traceLineArt(rec, opts); }
  traceColorFill(rec, opts = {}) { return CPU.traceColorFill(rec, opts); }
  stylizeField(rec, opts = {}) { return CPU.stylizeField(rec, opts); }
  composeFields(recs, opts = {}) { return CPU.composeFields(recs, opts); }

  // ── DE-NOVO IMAGINATION (UVM-INT.3) — cortex state → field C, no camera/file ─────────────────
  // Her current mind-state (any cortex activation vector — sem region, percept, emission
  // embedding) is folded into a small grayscale image and equationalized into a REAL field C.
  // This is imagination FROM her own mind: the thought literally becomes an internal image she
  // then perceives — the source the camera-seeded imagine() path lacked (so headless/server Unity
  // can imagine at all). Pure CPU CDF 9/7 on a tiny plane = loop-safe even on the no-GPU box.
  // Governor-gated: a de-novo daydream is a modest spend, and imagined depth (image side) scales
  // with the grant so she only imagines as richly as the thought is worth.
  //
  // ⛔ NO NANOMETER IMAGING (operator caution): this uses ONLY the bounded forward-9-7 transform
  // (image → field C). It NEVER invokes `fractalize` (the Newton-z³ infinite-zoom "no bottom-out"
  // path) — that's the one that would seize the brain by growing detail forever. Resolution is
  // HARD-CAPPED at maxSide (≤96, default 64) so the plane is a fixed tiny grid regardless of state
  // length OR governor grant — imagination has a floor of detail, never infinite resolution.
  imagineFromState(stateVector, opts = {}) {
    // TU.29.11 — imagination is CONTINUOUS: a quiet mind still holds an image
    // (the ambient wash of its mood), it never goes blank. When the cortex seed
    // is empty/missing, synthesize a small mood-driven vector instead of
    // returning null so the mind's-eye always has SOMETHING to render — the
    // de-novo path below then paints her live mood as a vivid field, never black.
    if (!stateVector || stateVector.length === 0) {
      const aro = (opts.mood && typeof opts.mood.arousal === 'number') ? opts.mood.arousal : 0.4;
      const n = 64;
      stateVector = new Float64Array(n);
      for (let i = 0; i < n; i++) stateVector[i] = 0.5 + 0.5 * Math.sin(i * (0.6 + aro)) ;  // gentle ambient wash
    }
    const grant = this.governor.allot({
      kind: 'imagine-denovo', requestedUnits: opts.units ?? 48,
      priority: opts.priority, value: opts.value,
    });
    const ratio = Math.max(0, Math.min(1, grant.ratio ?? 1));
    // Image side: scales with how much the thought is worth, hard-bounded so the transform stays
    // loop-safe regardless of state length or grant (a 96² plane padded is still tiny for CDF 9/7).
    const maxSide = Math.max(8, Math.min(opts.maxSide ?? 128, 192));   // MS.EXT — cap raised 96→192 (CPU CDF 9/7 on a padded 256² plane is still ms; no-fractalize intact)
    // TU.29.1/.2 — TEXT MODE + COLOR: when the caller passes the thought's TEXT, the plane
    // renders the actual words/letters/numbers (glyph raster over a state texture tinted by
    // a named color word or her live mood) instead of painting the raw vector as grayscale
    // noise. Text mode uses the FULL maxSide (a ~300-dim sentence embedding was collapsing
    // baseSide to ~17px) with a hard 48px legibility floor — the governor still ALLOTS the
    // spend (grant above), it just can't shrink the canvas below readable. Vector mode keeps
    // the state-sampled field but floors at 32px and takes the mood tint instead of gray.
    // TU.29.5 — IMAGINATION, not a text printer. Glyphs fire ONLY for genuinely
    // symbolic thoughts (numbers / single letters / math marks — symbols a mind
    // pictures AS glyphs). Everything else renders as her live state textured in
    // the thought's named color or her mood — the abstract field a mind holds for
    // a concept it has never SEEN. Concrete imagery (banana as a banana) comes
    // from the visual-memory recall/morph layer, which bypasses this path.
    const glyphText = symbolGlyphText(opts.text);
    const hasGlyphs = glyphText.length > 0;
    let side;
    if (opts.side) {
      // MS.EXT — exact-side override: morphField requires identical canvas/pad
      // dims, so a caller anchoring a de-novo field onto a stored percept passes
      // side = memory.width and the planes match (bounded, never fractalize).
      side = Math.max(16, Math.min(Math.round(opts.side), 512));
    } else if (hasGlyphs) {
      side = Math.max(96, Math.round(maxSide * (0.75 + 0.25 * ratio)));   // legibility floor
    } else {
      // MS.EXT — the old side collapsed to sqrt(stateVector.length): a 300-dim
      // embedding seeded a 17px base → the 32px floor, so EVERY de-novo thought
      // field rendered 32² and the viewer upscaled it ~16x into mush ("kindas
      // blurry"). The state texture samples the vector across ANY plane size —
      // resolution is a rendering choice, not information content. Render the
      // full plane; the governor still modulates within a high band.
      side = Math.max(96, Math.round(maxSide * (0.6 + 0.4 * ratio)));
    }
    if (!opts.side) side = Math.min(side, maxSide);
    const W = side, H = side;
    const data = renderThoughtPlane(glyphText, stateVector, W, H, opts.mood, opts.text);
    const rec = CPU.equationalizeImageData({ width: W, height: H, data });
    if (rec) rec.fidelity = { psnr_db: null, source: 'mindspace-denovo' };
    return rec;
  }

  // ── TU.29.13 BUILD B — ACTIVE SKETCH CANVAS ──────────────────────────────────────────────────
  // The mind's eye as a TOOL she USES, not just a passive readout: she lays down
  // lines / vectors / points directly onto a plane and equationalizes it into a
  // real field C. `strokes` is an array of primitives she "draws":
  //   { type:'line',  x0,y0,x1,y1, rgb? }   — a vector between two normalized [0,1] points
  //   { type:'point', x,y, r?, rgb? }        — a node
  //   { type:'poly',  pts:[[x,y]...], rgb? } — a connected path (a shape / gesture)
  // Coordinates are normalized [0,1] so callers reason in "canvas space". Colors
  // default to her mood tint. Output is a bounded (≤96px) field C — the SAME
  // equational substrate as perception/imagination, so what she draws is a real
  // image she can then re-see, morph, or remember. No fractalize, hard side cap.
  sketch(strokes, opts = {}) {
    // DRAW.8 — hard cap raised 96 → 512 so the drawing composer can grow the
    // canvas with her grade (K=96 … adult=512). The 96 cap was a safety
    // POSTURE, not an engine limit — MAX_LINE is 2048 and the CPU CDF 9/7 on
    // a padded 512² plane is still milliseconds. Callers pass the grade-gated
    // side (server chat.js _drawCanvasSide); no-fractalize invariant intact.
    const side = Math.max(16, Math.min(opts.maxSide ?? 96, 512));
    const W = side, H = side, N = W * H;
    const data = new Uint8ClampedArray(N * 4);
    // DRAW.3 — background is PAPER (her dark sketchbook page), not a mood
    // wash. The old bg painted moodTint*0.12 AND the default ink was the
    // same moodTint lightened — with her valence parked mid-low the hue sat
    // at ~0.27 so every sketch rendered green-on-green ("green screen").
    // Now: near-neutral dark paper with only a FAINT mood tint (10%), and
    // strokes carry their OWN chosen colors (the composer's crayon box);
    // the mood-ink fallback only applies to un-colored strokes.
    const bg = moodTint(opts.mood);
    const paper = [26, 25, 29];
    for (let p = 0; p < N; p++) { const o = p * 4; data[o] = Math.round(paper[0] * 0.9 + bg[0] * 0.1); data[o + 1] = Math.round(paper[1] * 0.9 + bg[1] * 0.1); data[o + 2] = Math.round(paper[2] * 0.9 + bg[2] * 0.1); data[o + 3] = 255; }
    const ink = opts.rgb || [Math.round(bg[0] * 0.4 + 255 * 0.6), Math.round(bg[1] * 0.4 + 255 * 0.6), Math.round(bg[2] * 0.4 + 255 * 0.6)];
    const px = (x, y, rgb) => { const xi = Math.round(x * (W - 1)), yi = Math.round(y * (H - 1)); if (xi < 0 || xi >= W || yi < 0 || yi >= H) return; const o = (yi * W + xi) * 4; data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255; };
    const dot = (x, y, r, rgb) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) px(x + dx / (W - 1), y + dy / (H - 1), rgb); };
    const line = (x0, y0, x1, y1, rgb) => {   // sampled DDA in normalized space
      const steps = Math.max(2, Math.round(Math.hypot((x1 - x0) * W, (y1 - y0) * H)));
      for (let i = 0; i <= steps; i++) { const t = i / steps; px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rgb); }
    };
    for (const s of (Array.isArray(strokes) ? strokes : [])) {
      if (!s) continue;
      const rgb = s.rgb || ink;
      if (s.type === 'line') line(s.x0, s.y0, s.x1, s.y1, rgb);
      else if (s.type === 'point') dot(s.x, s.y, Math.max(0, Math.min(4, s.r ?? 1)), rgb);
      else if (s.type === 'poly' && Array.isArray(s.pts)) { for (let i = 0; i + 1 < s.pts.length; i++) line(s.pts[i][0], s.pts[i][1], s.pts[i + 1][0], s.pts[i + 1][1], rgb); }
      else if (s.type === 'fill' && Array.isArray(s.pts) && s.pts.length >= 3) {
        // filled region (color-fill draw style) — bbox fill in normalized space
        // (exact for the axis-aligned cells traceColorFill emits).
        let mnx = 1, mny = 1, mxx = 0, mxy = 0;
        for (const p of s.pts) { if (p[0] < mnx) mnx = p[0]; if (p[1] < mny) mny = p[1]; if (p[0] > mxx) mxx = p[0]; if (p[1] > mxy) mxy = p[1]; }
        const xa = Math.round(mnx * (W - 1)), xb = Math.round(mxx * (W - 1)), ya = Math.round(mny * (H - 1)), yb = Math.round(mxy * (H - 1));
        for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) { if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue; const o = (yy * W + xx) * 4; data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255; }
      }
    }
    const rec = CPU.equationalizeImageData({ width: W, height: H, data });
    if (rec) rec.fidelity = { psnr_db: null, source: 'mindspace-sketch' };
    return rec;
  }

  // DRAW.1 — letters as PENCIL STROKES (her own hand), not a raster stamp.
  // Converts each character's 5x7 bitmap (FONT5X7 — single source of truth shared
  // with the glyph raster) into line strokes for sketch(): horizontal + vertical
  // runs of lit cells become line segments, isolated single cells become points.
  // NO WOBBLE / NO JITTER (Gee 2026-07-15: "NO FUCKING WOBBLE ... wobble = dumbing
  // her down"). Her handwriting is her CLEAN trained hand — crisp + legible, never
  // an artificial tremor faking imperfect/child writing. j() is a hard 0 and
  // opts.wobble is ignored by design (her line quality is her trained state, period).
  // Normalized [0,1] canvas coords, bounded 12 chars.
  glyphStrokes(text, opts = {}) {
    const t = String(text || '').toUpperCase().slice(0, 12);
    if (!t) return [];
    const x0 = Math.max(0, Math.min(1, opts.x ?? 0.1));
    const y0 = Math.max(0, Math.min(1, opts.y ?? 0.78));
    const size = Math.max(0.03, Math.min(0.3, opts.size ?? 0.08));   // glyph height in canvas units
    // STYLE (Gee 2026-07-16: "wheres all the different fonts and styles and colors
    // bond underline dazzle and pizzaz into infinity"). Per-letter colours (dazzle),
    // italic slant, bold (offset double-stroke), and an underline — all NO wobble,
    // clean trained hand. Styling comes from the caller (_labelStyle, dynamic).
    const baseRgb = opts.rgb || [222, 220, 226];
    const colors = (Array.isArray(opts.colors) && opts.colors.length) ? opts.colors : null;
    const slant = Math.max(-0.5, Math.min(0.5, opts.slant || 0));
    const bold = !!opts.bold;
    const shadow = Array.isArray(opts.shadow) ? opts.shadow : null;   // drop-shadow colour
    // LETTERFORMS (Gee 2026-07-16: "alternat leter forms") — genuinely different
    // letter SHAPES, not just colour: block (solid runs) / dots (dot-matrix) /
    // serif (feet on stems) / bubble (hollow parallel outline) / tall (condensed)
    // / wide (extended). All from the one FONT5X7 grid, rendered differently —
    // composes with the dazzle colours/bold/slant/underline → infinity.
    const font = typeof opts.font === 'string' ? opts.font : 'block';
    const gh = size * (font === 'tall' ? 1.3 : 1);                    // glyph height
    const boldOff = size * 0.055;
    const cw = size * (5 / 7) * (font === 'wide' ? 1.35 : font === 'tall' ? 0.8 : 1);   // glyph width
    const adv = cw * 1.35;                // advance incl. gap
    const shx = (x, y) => x + slant * ((y0 + gh) - y);   // italic shear (top → right)
    const strokes = [];
    let cx = x0, li = 0;
    const rawLine = (ax, ay, bx, by, rgb) => {
      strokes.push({ type: 'line', x0: shx(ax, ay), y0: ay, x1: shx(bx, by), y1: by, rgb });
      if (bold) strokes.push({ type: 'line', x0: shx(ax, ay) + boldOff, y0: ay, x1: shx(bx, by) + boldOff, y1: by, rgb });
    };
    const line = (ax, ay, bx, by, rgb) => {
      if (shadow) strokes.push({ type: 'line', x0: shx(ax, ay) + boldOff * 0.9, y0: ay + boldOff * 0.9, x1: shx(bx, by) + boldOff * 0.9, y1: by + boldOff * 0.9, rgb: shadow });
      if (font === 'bubble') {                   // hollow: two parallel outlines, no fill stroke
        const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
        const off = size * 0.028, ox = (nx / nl) * off, oy = (ny / nl) * off;
        rawLine(ax + ox, ay + oy, bx + ox, by + oy, rgb);
        rawLine(ax - ox, ay - oy, bx - ox, by - oy, rgb);
        return;
      }
      rawLine(ax, ay, bx, by, rgb);
    };
    const dot = (x, y, rgb) => {
      strokes.push({ type: 'point', x: shx(x, y), y, r: font === 'bubble' ? 1 : 0, rgb });
      if (bold) strokes.push({ type: 'point', x: shx(x, y) + boldOff, y, r: 0, rgb });
    };
    for (const ch of t) {
      const glyph = FONT5X7[ch] || null;
      const col = colors ? colors[li % colors.length] : baseRgb;
      if (glyph && font === 'dots') {
        // DOT-MATRIX letterform — every lit cell is a dot; no runs at all.
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
          if (glyph[r][c] === '1') dot(cx + ((c + 0.5) / 5) * cw, y0 + ((r + 0.5) / 7) * gh, col);
        }
      } else if (glyph) {
        const covered = new Set();
        for (let r = 0; r < 7; r++) {           // horizontal runs
          let run = -1;
          for (let c = 0; c <= 5; c++) {
            const on = c < 5 && glyph[r][c] === '1';
            if (on && run < 0) run = c;
            else if (!on && run >= 0) {
              if (c - run >= 2) { const y = y0 + ((r + 0.5) / 7) * gh; line(cx + (run / 5) * cw, y, cx + ((c - 0.5) / 5) * cw, y, col); for (let k = run; k < c; k++) covered.add(r * 5 + k); }
              run = -1;
            }
          }
        }
        for (let c = 0; c < 5; c++) {           // vertical runs
          let run = -1;
          for (let r = 0; r <= 7; r++) {
            const on = r < 7 && glyph[r][c] === '1';
            if (on && run < 0) run = r;
            else if (!on && run >= 0) {
              if (r - run >= 2) {
                const x = cx + ((c + 0.5) / 5) * cw, ya = y0 + (run / 7) * gh, yb = y0 + ((r - 0.5) / 7) * gh;
                line(x, ya, x, yb, col);
                if (font === 'serif') {          // SERIF letterform — feet on stem ends
                  const f = cw * 0.24;
                  line(x - f, ya, x + f, ya, col);
                  line(x - f, yb, x + f, yb, col);
                }
                for (let k = run; k < r; k++) covered.add(k * 5 + c);
              }
              run = -1;
            }
          }
        }
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {   // isolated cells → dots
          if (glyph[r][c] === '1' && !covered.has(r * 5 + c)) dot(cx + ((c + 0.5) / 5) * cw, y0 + ((r + 0.5) / 7) * gh, col);
        }
      }
      cx += adv; li++;
      if (cx > 0.96) break;
    }
    if (opts.underline) {                        // decorative underline in the label colour
      const uy = y0 + gh * 1.08, ux1 = Math.min(0.96, cx - adv * 0.25), uc = colors ? colors[0] : baseRgb;
      strokes.push({ type: 'line', x0: x0, y0: uy, x1: ux1, y1: uy, rgb: uc });
      if (bold) strokes.push({ type: 'line', x0: x0, y0: uy + boldOff, x1: ux1, y1: uy + boldOff, rgb: uc });
    }
    return strokes;
  }

  // MS.K1 — Unity KNOWS her mind-space: all file types, equations, and how to solve them.
  // Her cognition answers "what is this file / how do I solve it" from the equation itself.
  get knowledge() { return MINDSPACE_KNOWLEDGE; }
  whatIs(extOrName) { return whatIs(extOrName); }
  howToSolve(extOrId) { return howToSolve(extOrId); }
  equationFor(id) { return equationFor(id); }
  methodFor(id) { return methodFor(id); }
  conceptDefinitions() { return conceptDefinitions(); }   // for curriculum sem-binding
  teachInto(teacher, opts) { return teachInto(teacher, opts); }   // LEARN the knowledge into sem-space
}
