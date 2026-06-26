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
    const EQ_TOL = [0.030, 0.055, 0.055], EQ_KMIN = [400, 120, 120];
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
