//! mindspace.rs — Unity's equational mind-space ON THIS DONOR (ONE PROCESS).
//!
//! The donor that computes her brain ALSO computes her mind's eye: the server
//! routes `mindspace_op` JSON messages here (perceive / describe / stylizeField
//! / traceLineArt) and this module answers `mindspace_result`. Line-faithful
//! CPU port of `js/brain/mindspace/transform.js` (the engine's CPU reference):
//! separable multi-level CDF 9/7 biorthogonal wavelet lifting, forward (pixels
//! → field C = SEEING) and inverse (field C → pixels = IMAGINING), the percept
//! describer, the clean-ink line-art tracer, and the posterized field stylizer
//! with her label-stroke rasterizer. Same math, same constants, same field-C
//! wire format (base64 LEB128-delta positions + int16 quantized values) — a rec
//! produced here round-trips through the JS side bit-compatibly.
//!
//! De-novo `imagineFromState` is NOT in this build (it needs the glyph/state-
//! plane renderer; a divergent render would make her thought look different per
//! donor) — the register's `mindspaceOps` list omits it, so the server never
//! dispatches it here. Ships with the glyph-plane port in a later donor.
//!
//! Pure CPU, no engine/GPU state — runs on the donor worker thread alongside
//! the brain work (one process, one machine, her whole mind).

use serde::Deserialize;
use serde_json::{json, Map, Value};

/// Ops this donor advertises in `gpu_register.mindspaceOps` (per-op capability —
/// the server checks the op name before dispatching, so unlisted ops fall to its
/// local ramp with zero wasted round-trips). The VOICE pair (perceiveAudio /
/// reconstructAudio — her field-A equations, audio.js port) ships in this binary
/// so the server's voice-bank lane can land later dashboard-only, without
/// another donor release. The piper ONNX synth itself stays viewer-side this
/// release (ort-on-donor is the next binary's evaluation).
pub const OPS: [&str; 6] = ["perceive", "describe", "stylizeField", "traceLineArt", "perceiveAudio", "reconstructAudio"];

// ─── CDF 9/7 lifting constants (identical to transform.js) ─────────────────
const A97: f64 = -1.586134342059924;
const B97: f64 = -0.052980118572961;
const G97: f64 = 0.882911075530934;
const D97: f64 = 0.443506852043971;
const K97: f64 = 1.230174104914001;

// ─── base64 (std-only; mirrors atob/btoa over the raw byte stream) ──────────
fn b64_decode(s: &str) -> Vec<u8> {
    fn v(c: u8) -> i32 {
        match c {
            b'A'..=b'Z' => (c - b'A') as i32,
            b'a'..=b'z' => (c - b'a' + 26) as i32,
            b'0'..=b'9' => (c - b'0' + 52) as i32,
            b'+' => 62,
            b'/' => 63,
            _ => -1, // '=' padding / whitespace → skipped
        }
    }
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut buf, mut bits) = (0u32, 0u32);
    for &c in s.as_bytes() {
        let d = v(c);
        if d < 0 {
            continue;
        }
        buf = (buf << 6) | d as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    out
}

fn b64_encode(b: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(b.len().div_ceil(3) * 4);
    for ch in b.chunks(3) {
        let b0 = ch[0] as u32;
        let b1 = *ch.get(1).unwrap_or(&0) as u32;
        let b2 = *ch.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[(n >> 18 & 63) as usize] as char);
        out.push(T[(n >> 12 & 63) as usize] as char);
        out.push(if ch.len() > 1 { T[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if ch.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/// base64 → little-endian i16s (JS `Int16Array` over the decoded byte buffer).
fn b64_i16(s: &str) -> Vec<i16> {
    let b = b64_decode(s);
    b.chunks_exact(2).map(|p| i16::from_le_bytes([p[0], p[1]])).collect()
}

/// base64 → little-endian u32s (legacy non-dv1 position encoding).
fn b64_u32(s: &str) -> Vec<u32> {
    let b = b64_decode(s);
    b.chunks_exact(4).map(|p| u32::from_le_bytes([p[0], p[1], p[2], p[3]])).collect()
}

fn i16_bytes(v: &[i16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 2);
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
    out
}

// ─── LEB128 delta-varint position codec (mirror of transform.js enc/decPos) ──
fn enc_pos(idx_sorted: &[u32]) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut prev = 0u32;
    for &p in idx_sorted {
        let mut d = p - prev;
        prev = p;
        while d >= 0x80 {
            bytes.push(((d & 0x7F) | 0x80) as u8);
            d >>= 7;
        }
        bytes.push(d as u8);
    }
    bytes
}

/// Decode LEB128 varint deltas → absolute positions. Integrity bounds always on
/// (same as JS): never write past `count`; reject a pathological >35-bit varint.
fn dec_pos(u8s: &[u8], count: usize) -> Vec<u32> {
    let mut out = vec![0u32; count];
    let (mut val, mut acc, mut shift, mut n) = (0u64, 0u64, 0u32, 0usize);
    for &b in u8s {
        if n >= count {
            break;
        }
        acc += ((b & 0x7F) as u64) << shift;
        if b & 0x80 != 0 {
            shift += 7;
            if shift > 35 {
                acc = 0;
                shift = 0;
            }
        } else {
            val += acc;
            out[n] = val as u32;
            n += 1;
            acc = 0;
            shift = 0;
        }
    }
    out
}

// ─── field-C record (the JSON wire format; extra fields ignored) ────────────
#[derive(Debug, Clone, Deserialize)]
pub struct Channel {
    #[serde(default)]
    pub qscale: f64,
    #[serde(default)]
    pub pos_enc: String,
    #[serde(default)]
    pub pos_b64: String,
    #[serde(default)]
    pub val_b64: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Rec {
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub pad_w: u32,
    #[serde(default)]
    pub pad_h: u32,
    #[serde(default)]
    pub channels: std::collections::HashMap<String, Channel>,
    #[serde(default)]
    pub equation_count: f64,
}

fn decode_positions(c: &Channel, count: usize) -> Vec<u32> {
    if c.pos_enc == "dv1" {
        dec_pos(&b64_decode(&c.pos_b64), count)
    } else {
        let mut v = b64_u32(&c.pos_b64);
        v.resize(count, 0);
        v
    }
}

// ─── 1-D multi-level 9/7 lifting (strided; exact port of fwd1d/inv1d) ───────
fn lift_sizes(n: usize) -> Vec<usize> {
    let mut sizes = Vec::new();
    let mut sz = n;
    while sz >= 4 && sz % 2 == 0 {
        sizes.push(sz);
        sz >>= 1;
    }
    sizes
}

fn fwd1d(a: &mut [f64], off: usize, stride: usize, n: usize, tmp: &mut [f64]) {
    for &size in &lift_sizes(n) {
        let half = size >> 1;
        for i in 0..size {
            tmp[i] = a[off + i * stride];
        }
        tmp[size - 1] += 2.0 * A97 * tmp[size - 2];
        for i in (1..size - 1).step_by(2) {
            tmp[i] += A97 * (tmp[i - 1] + tmp[i + 1]);
        }
        for i in (2..size).step_by(2) {
            tmp[i] += B97 * (tmp[i - 1] + tmp[i + 1]);
        }
        tmp[0] += 2.0 * B97 * tmp[1];
        tmp[size - 1] += 2.0 * G97 * tmp[size - 2];
        for i in (1..size - 1).step_by(2) {
            tmp[i] += G97 * (tmp[i - 1] + tmp[i + 1]);
        }
        for i in (2..size).step_by(2) {
            tmp[i] += D97 * (tmp[i - 1] + tmp[i + 1]);
        }
        tmp[0] += 2.0 * D97 * tmp[1];
        for i in (0..size).step_by(2) {
            tmp[i] /= K97;
        }
        for i in (1..size).step_by(2) {
            tmp[i] *= K97;
        }
        for k in 0..half {
            a[off + k * stride] = tmp[2 * k];
            a[off + (half + k) * stride] = tmp[2 * k + 1];
        }
    }
}

fn inv1d(a: &mut [f64], off: usize, stride: usize, n: usize, tmp: &mut [f64]) {
    let sizes = lift_sizes(n);
    for &size in sizes.iter().rev() {
        let half = size >> 1;
        for k in 0..half {
            tmp[2 * k] = a[off + k * stride];
            tmp[2 * k + 1] = a[off + (half + k) * stride];
        }
        for i in (0..size).step_by(2) {
            tmp[i] *= K97;
        }
        for i in (1..size).step_by(2) {
            tmp[i] /= K97;
        }
        tmp[0] -= 2.0 * D97 * tmp[1];
        for i in (2..size).step_by(2) {
            tmp[i] -= D97 * (tmp[i - 1] + tmp[i + 1]);
        }
        for i in (1..size - 1).step_by(2) {
            tmp[i] -= G97 * (tmp[i - 1] + tmp[i + 1]);
        }
        tmp[size - 1] -= 2.0 * G97 * tmp[size - 2];
        tmp[0] -= 2.0 * B97 * tmp[1];
        for i in (2..size).step_by(2) {
            tmp[i] -= B97 * (tmp[i - 1] + tmp[i + 1]);
        }
        for i in (1..size - 1).step_by(2) {
            tmp[i] -= A97 * (tmp[i - 1] + tmp[i + 1]);
        }
        tmp[size - 1] -= 2.0 * A97 * tmp[size - 2];
        for i in 0..size {
            a[off + i * stride] = tmp[i];
        }
    }
}

/// Forward 2-D: rows then columns (idwt2 inverts as columns then rows).
fn fwd2d(a: &mut [f64], h: usize, w: usize) {
    let mut tmp = vec![0f64; w.max(h)];
    for r in 0..h {
        fwd1d(a, r * w, 1, w, &mut tmp);
    }
    for c in 0..w {
        fwd1d(a, c, w, h, &mut tmp);
    }
}

fn idwt2(a: &mut [f64], h: usize, w: usize) {
    let mut tmp = vec![0f64; w.max(h)];
    for c in 0..w {
        inv1d(a, c, w, h, &mut tmp);
    }
    for r in 0..h {
        inv1d(a, r * w, 1, w, &mut tmp);
    }
}

// ─── colour ─────────────────────────────────────────────────────────────────
fn ycbcr_to_rgb(y: f64, cb: f64, cr: f64) -> (f64, f64, f64) {
    (
        y + 1.402 * (cr - 0.5),
        y - 0.344136 * (cb - 0.5) - 0.714136 * (cr - 0.5),
        y + 1.772 * (cb - 0.5),
    )
}

fn rgb_to_ycbcr(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    (
        0.299 * r + 0.587 * g + 0.114 * b,
        0.5 - 0.168736 * r - 0.331264 * g + 0.5 * b,
        0.5 + 0.5 * r - 0.418688 * g - 0.081312 * b,
    )
}

fn pad_dim(n: usize) -> usize {
    n.div_ceil(64) * 64
}

// ─── forward analyzer: RGBA → field C (SEEING) — equationalizeImageData port ─
// Same corpus-quality constants as transform.js (MS.EXT).
const EQ_TOL: [f64; 3] = [0.018, 0.032, 0.032];
const EQ_KMIN: [usize; 3] = [500, 150, 150];

pub fn equationalize(w0: usize, h0: usize, rgba: &[u8]) -> Value {
    let w2 = pad_dim(w0);
    let h2 = pad_dim(h0);
    let names = ["Y", "Cb", "Cr"];
    let refl = |i: usize, n: usize| -> usize {
        if i < n {
            i
        } else {
            let r = 2 * (n as isize - 1) - i as isize;
            if r < 0 {
                0
            } else {
                r as usize
            }
        }
    };
    let mut planes = vec![vec![0f64; w2 * h2]; 3];
    for y in 0..h2 {
        let sy = refl(y, h0);
        for x in 0..w2 {
            let sx = refl(x, w0);
            let o = (sy * w0 + sx) * 4;
            let (yv, cb, cr) = rgb_to_ycbcr(
                rgba[o] as f64 / 255.0,
                rgba[o + 1] as f64 / 255.0,
                rgba[o + 2] as f64 / 255.0,
            );
            let p = y * w2 + x;
            planes[0][p] = yv;
            planes[1][p] = cb;
            planes[2][p] = cr;
        }
    }
    let mut chans = Map::new();
    let mut total_eq = 0usize;
    for ci in 0..3 {
        let co = &mut planes[ci];
        fwd2d(co, h2, w2);
        let n = co.len();
        let mut total = 0f64;
        for i in 0..n {
            total += co[i] * co[i];
        }
        if total == 0.0 {
            total = 1.0;
        }
        let mut order: Vec<u32> = (0..n as u32).collect();
        order.sort_unstable_by(|&a, &b| {
            co[b as usize]
                .abs()
                .partial_cmp(&co[a as usize].abs())
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let target = (1.0 - EQ_TOL[ci] * EQ_TOL[ci]) * total;
        let mut acc = 0f64;
        let mut k = 0usize;
        while k < n && acc < target {
            let v = co[order[k] as usize];
            acc += v * v;
            k += 1;
        }
        k = EQ_KMIN[ci].max(k.min(n)).min(n);
        let mut idx: Vec<u32> = order[..k].to_vec();
        idx.sort_unstable();
        let mut max_abs = 1e-8f64;
        for &i in &idx {
            max_abs = max_abs.max(co[i as usize].abs());
        }
        let qscale = max_abs / 32000.0;
        let mut q = vec![0i16; k];
        for i in 0..k {
            let v = (co[idx[i] as usize] / qscale).round();
            q[i] = v.clamp(-32767.0, 32767.0) as i16;
        }
        chans.insert(
            names[ci].to_string(),
            json!({
                "keep": k, "qscale": qscale, "pos_enc": "dv1",
                "pos_b64": b64_encode(&enc_pos(&idx)),
                "val_b64": b64_encode(&i16_bytes(&q)),
            }),
        );
        total_eq += k;
    }
    json!({
        "model": "cdf97_wavelet_native_quantized", "colorspace": "YCbCr", "wavelet": "cdf97",
        "width": w0, "height": h0, "pad_w": w2, "pad_h": h2,
        "channels": chans, "equation_count": total_eq,
        "fidelity": { "psnr_db": null, "source": "mindspace-donor" },
    })
}

// ─── describeEquational port: field C → the percept value-vector ─────────────
pub fn describe(rec: &Rec, dim: usize) -> Vec<f64> {
    let dim = if dim == 0 { 64 } else { dim };
    let mut out = vec![0f64; dim];
    let w2 = if rec.pad_w > 0 {
        rec.pad_w
    } else if rec.width > 0 {
        rec.width
    } else {
        1
    } as usize;
    const NB: usize = 8;
    let names = ["Y", "Cb", "Cr"];
    let band_base = [0usize, 8, 16];
    let coarse_n = 24usize;
    let coarse_at = 24usize;
    let mut chan_mean_abs = [0f64; 3];
    let (mut lo_energy, mut hi_energy) = (0f64, 0f64);
    for ci in 0..3 {
        let c = match rec.channels.get(names[ci]) {
            Some(c) if !c.val_b64.is_empty() => c,
            _ => continue,
        };
        let val = b64_i16(&c.val_b64);
        let pos = decode_positions(c, val.len());
        let qs = if c.qscale != 0.0 { c.qscale } else { 1.0 };
        let base = band_base[ci];
        let mut coarse: Vec<f64> = Vec::new();
        let mut m_abs = 0f64;
        for i in 0..val.len() {
            let p = pos[i] as usize;
            let x = p % w2;
            let y = p / w2;
            let band = (((x.max(y) as f64) + 1.0).log2().floor() as isize).clamp(0, NB as isize - 1) as usize;
            let v = val[i] as f64 * qs;
            let e = v * v;
            if base + band < dim {
                out[base + band] += e;
            }
            m_abs += v.abs();
            if band <= 1 {
                lo_energy += e;
            } else {
                hi_energy += e;
            }
            if ci == 0 && coarse.len() < coarse_n {
                coarse.push(v);
            }
        }
        chan_mean_abs[ci] = if !val.is_empty() { m_abs / val.len() as f64 } else { 0.0 };
        if ci == 0 {
            for (k, v) in coarse.iter().enumerate() {
                if coarse_at + k < dim {
                    out[coarse_at + k] = *v;
                }
            }
        }
    }
    if dim > 48 {
        out[48] = chan_mean_abs[1];
    }
    if dim > 49 {
        out[49] = chan_mean_abs[2];
    }
    if dim > 50 {
        out[50] = chan_mean_abs[0];
    }
    if dim > 51 {
        out[51] = if lo_energy + hi_energy > 0.0 { hi_energy / (lo_energy + hi_energy) } else { 0.0 };
    }
    if dim > 52 {
        out[52] = (rec.equation_count + 1.0).log2() / 24.0;
    }
    let mut norm = 0f64;
    for v in &out {
        norm += v * v;
    }
    let norm = if norm.sqrt() == 0.0 { 1.0 } else { norm.sqrt() };
    for v in out.iter_mut() {
        *v /= norm;
    }
    out
}

// ─── _fieldToGrid port: rec → coarse aspect-kept Y/Cb/Cr working grids ───────
struct Grid {
    gw: usize,
    gh: usize,
    y: Vec<f64>,
    cb: Vec<f64>,
    cr: Vec<f64>,
}

fn field_to_grid(rec: &Rec, target: usize) -> Option<Grid> {
    let (w, h, w2, h2) = (rec.width as usize, rec.height as usize, rec.pad_w as usize, rec.pad_h as usize);
    if w == 0 || h == 0 || w2 == 0 || h2 == 0 {
        return None;
    }
    let mut planes: Vec<Vec<f64>> = Vec::with_capacity(3);
    for name in ["Y", "Cb", "Cr"] {
        let mut flat = vec![0f64; w2 * h2];
        if let Some(c) = rec.channels.get(name) {
            if !c.val_b64.is_empty() {
                let val = b64_i16(&c.val_b64);
                let qs = if c.qscale != 0.0 { c.qscale } else { 1.0 };
                let pos = decode_positions(c, val.len());
                let size = w2 * h2;
                for i in 0..val.len() {
                    let p = pos[i] as usize;
                    if p < size {
                        flat[p] = val[i] as f64 * qs;
                    }
                }
                idwt2(&mut flat, h2, w2);
            }
        }
        planes.push(flat);
    }
    let t = target.clamp(24, 256);
    let gw = ((if w >= h { t as f64 } else { t as f64 * (w as f64 / h as f64) }).round() as usize).max(8);
    let gh = ((if h >= w { t as f64 } else { t as f64 * (h as f64 / w as f64) }).round() as usize).max(8);
    let pxc = |gx: usize| (((gx as f64 / (gw - 1) as f64) * (w - 1) as f64).round() as usize).min(w - 1);
    let pyc = |gy: usize| (((gy as f64 / (gh - 1) as f64) * (h - 1) as f64).round() as usize).min(h - 1);
    let mut y = vec![0f64; gw * gh];
    let mut cb = vec![0f64; gw * gh];
    let mut cr = vec![0f64; gw * gh];
    for gy in 0..gh {
        let sy = pyc(gy);
        for gx in 0..gw {
            let o = sy * w2 + pxc(gx);
            let g = gy * gw + gx;
            y[g] = planes[0][o];
            cb[g] = planes[1][o];
            cr[g] = planes[2][o];
        }
    }
    Some(Grid { gw, gh, y, cb, cr })
}

// ─── Douglas-Peucker polyline simplify (recursive, same as _rdp) ─────────────
fn rdp(pts: &[(f64, f64)], eps: f64) -> Vec<(f64, f64)> {
    if pts.len() < 3 {
        return pts.to_vec();
    }
    let a = pts[0];
    let b = pts[pts.len() - 1];
    let dx = b.0 - a.0;
    let dy = b.1 - a.1;
    let len = {
        let l = (dx * dx + dy * dy).sqrt();
        if l == 0.0 {
            1.0
        } else {
            l
        }
    };
    let (mut dmax, mut idx) = (0f64, 0usize);
    for i in 1..pts.len() - 1 {
        let d = ((pts[i].0 - a.0) * dy - (pts[i].1 - a.1) * dx).abs() / len;
        if d > dmax {
            dmax = d;
            idx = i;
        }
    }
    if dmax > eps {
        let mut left = rdp(&pts[..=idx], eps);
        let right = rdp(&pts[idx..], eps);
        left.pop();
        left.extend(right);
        left
    } else {
        vec![a, b]
    }
}

// ─── traceLineArt port — clean ink contours (DRAW-ENGINE v2) ─────────────────
// box-blur → Sobel magnitude+direction → non-max suppression → strongest-first
// seeding + bidirectional walk → minLen filter → RDP → ONE ink color.
fn opt_f64(opts: &Value, key: &str, default: f64) -> f64 {
    opts.get(key).and_then(|v| v.as_f64()).unwrap_or(default)
}

fn walk_contour(
    sx: usize,
    sy: usize,
    gw: usize,
    gh: usize,
    edge: &[u8],
    visited: &mut [u8],
    nms: &[f64],
) -> Vec<(f64, f64)> {
    const NB: [(i32, i32); 8] = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)];
    let mut pts = Vec::new();
    let (mut cx, mut cy) = (sx as i32, sy as i32);
    let mut guard = 0usize;
    while guard < gw * gh {
        guard += 1;
        pts.push((cx as f64, cy as f64));
        let (mut best, mut bg, mut bx, mut by) = (-1i64, 0f64, 0i32, 0i32);
        for (dx, dy) in NB {
            let nx = cx + dx;
            let ny = cy + dy;
            if nx < 0 || ny < 0 || nx >= gw as i32 || ny >= gh as i32 {
                continue;
            }
            let ni = (ny as usize) * gw + nx as usize;
            if edge[ni] != 0 && visited[ni] == 0 && nms[ni] > bg {
                bg = nms[ni];
                best = ni as i64;
                bx = nx;
                by = ny;
            }
        }
        if best < 0 {
            break;
        }
        visited[best as usize] = 1;
        cx = bx;
        cy = by;
    }
    pts
}

pub fn trace_line_art(rec: &Rec, opts: &Value) -> Vec<Value> {
    let grid = match field_to_grid(rec, opt_f64(opts, "traceSide", 96.0) as usize) {
        Some(g) => g,
        None => return Vec::new(),
    };
    let (gw, gh) = (grid.gw, grid.gh);
    let y = &grid.y;
    // 3x3 box blur — removes single-pixel noise edges before gradient
    let mut b = vec![0f64; gw * gh];
    for yy in 0..gh {
        for xx in 0..gw {
            let mut s = 0f64;
            let mut n = 0f64;
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    let nx = xx as i32 + dx;
                    let ny = yy as i32 + dy;
                    if nx < 0 || ny < 0 || nx >= gw as i32 || ny >= gh as i32 {
                        continue;
                    }
                    s += y[(ny as usize) * gw + nx as usize];
                    n += 1.0;
                }
            }
            b[yy * gw + xx] = s / n;
        }
    }
    // Sobel magnitude + gradient direction
    let mut g = vec![0f64; gw * gh];
    let mut th = vec![0f64; gw * gh];
    let mut gmax = 1e-6f64;
    for yy in 1..gh - 1 {
        for xx in 1..gw - 1 {
            let i = yy * gw + xx;
            let gxv = -b[i - gw - 1] - 2.0 * b[i - 1] - b[i + gw - 1] + b[i - gw + 1] + 2.0 * b[i + 1] + b[i + gw + 1];
            let gyv = -b[i - gw - 1] - 2.0 * b[i - gw] - b[i - gw + 1] + b[i + gw - 1] + 2.0 * b[i + gw] + b[i + gw + 1];
            let m = (gxv * gxv + gyv * gyv).sqrt();
            g[i] = m;
            th[i] = gyv.atan2(gxv);
            if m > gmax {
                gmax = m;
            }
        }
    }
    // non-maximum suppression → 1px ridges (kills the yarn duplication)
    let mut nms = vec![0f64; gw * gh];
    for yy in 1..gh - 1 {
        for xx in 1..gw - 1 {
            let i = yy * gw + xx;
            let deg = ((th[i] * 180.0 / std::f64::consts::PI) + 180.0) % 180.0;
            let (dx, dy): (i32, i32) = if !(22.5..157.5).contains(&deg) {
                (1, 0)
            } else if deg < 67.5 {
                (1, 1)
            } else if deg < 112.5 {
                (0, 1)
            } else {
                (1, -1)
            };
            let g1 = g[((yy as i32 + dy) as usize) * gw + (xx as i32 + dx) as usize];
            let g2 = g[((yy as i32 - dy) as usize) * gw + (xx as i32 - dx) as usize];
            nms[i] = if g[i] >= g1 && g[i] >= g2 { g[i] } else { 0.0 };
        }
    }
    let thr = gmax * opt_f64(opts, "edgeThresh", 0.16).clamp(0.04, 0.9);
    let mut edge = vec![0u8; gw * gh];
    for i in 0..nms.len() {
        edge[i] = if nms[i] >= thr { 1 } else { 0 };
    }
    // seed STRONGEST-first so main contours form before any speck
    let mut order: Vec<usize> = (0..edge.len()).filter(|&i| edge[i] != 0).collect();
    order.sort_unstable_by(|&a, &b| nms[b].partial_cmp(&nms[a]).unwrap_or(std::cmp::Ordering::Equal));
    let mut visited = vec![0u8; gw * gh];
    let max_strokes = (opt_f64(opts, "maxStrokes", 40.0) as usize).clamp(4, 300);
    let min_len = ((opt_f64(opts, "minLenFrac", 0.08) * gw.max(gh) as f64).round() as usize).max(3);
    let mut polylines: Vec<Vec<(f64, f64)>> = Vec::new();
    for &si in &order {
        if polylines.len() >= max_strokes {
            break;
        }
        if visited[si] != 0 {
            continue;
        }
        let sx = si % gw;
        let sy = si / gw;
        visited[si] = 1;
        let fwd = walk_contour(sx, sy, gw, gh, &edge, &mut visited, &nms); // one direction from the seed
        let back = walk_contour(sx, sy, gw, gh, &edge, &mut visited, &nms); // the other (first side now visited)
        let pts: Vec<(f64, f64)> = if back.len() > 1 {
            back[1..].iter().rev().cloned().chain(fwd.into_iter()).collect()
        } else {
            fwd
        };
        if pts.len() >= min_len {
            polylines.push(pts);
        }
    }
    let eps = opt_f64(opts, "simplify", 1.0).max(0.3);
    // ONE ink color (never a per-stroke random hue) — callers pass their ink.
    let ink: Vec<i64> = opts
        .get("ink")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().map(|x| x.as_i64().unwrap_or(0)).collect())
        .filter(|v: &Vec<i64>| v.len() == 3)
        .unwrap_or_else(|| vec![228, 226, 230]);
    let mut strokes = Vec::new();
    for pl in &polylines {
        let simp = rdp(pl, eps);
        if simp.len() < 2 {
            continue;
        }
        let pts: Vec<Vec<f64>> = simp
            .iter()
            .map(|p| vec![p.0 / (gw - 1) as f64, p.1 / (gh - 1) as f64])
            .collect();
        strokes.push(json!({ "type": "poly", "pts": pts, "rgb": ink.clone() }));
    }
    strokes
}

// ─── stylizeField port — detailed styled render + label-stroke rasterizer ────
pub fn stylize_field(rec: &Rec, opts: &Value, label_strokes: Option<&[Value]>) -> Option<Value> {
    let grid = field_to_grid(rec, opt_f64(opts, "traceSide", 128.0) as usize)?;
    let (gw, gh) = (grid.gw, grid.gh);
    let bands = (opt_f64(opts, "bands", 6.0) as i64).clamp(3, 16) as f64;
    let mut data = vec![0u8; gw * gh * 4];
    for i in 0..gw * gh {
        let (r, g, b) = ycbcr_to_rgb(grid.y[i], grid.cb[i], grid.cr[i]);
        let lum = (r * 0.299 + g * 0.587 + b * 0.114).clamp(0.0, 1.0);
        let q = (lum * (bands - 1.0)).round() / (bands - 1.0); // posterized tone
        let gsc = if lum > 1e-4 { q / lum } else { 1.0 }; // scale colour to the tone, keep hue
        let o = i * 4;
        data[o] = (r * gsc * 255.0).round().clamp(0.0, 255.0) as u8;
        data[o + 1] = (g * gsc * 255.0).round().clamp(0.0, 255.0) as u8;
        data[o + 2] = (b * gsc * 255.0).round().clamp(0.0, 255.0) as u8;
        data[o + 3] = 255;
    }
    // Her label strokes ([0,1] coords, thickness `w`) rasterized BOLD + silhouetted
    // straight onto the RGBA before equationalizing — the word rides in the field C.
    if let Some(ls) = label_strokes {
        let stroke_rgb = |s: &Value| -> [i64; 3] {
            s.get("rgb")
                .and_then(|v| v.as_array())
                .filter(|a| a.len() == 3)
                .map(|a| [a[0].as_i64().unwrap_or(0), a[1].as_i64().unwrap_or(0), a[2].as_i64().unwrap_or(0)])
                .unwrap_or([222, 220, 226])
        };
        let put = |data: &mut [u8], nx: f64, ny: f64, rgb: &[i64; 3]| {
            let xi = (nx * (gw - 1) as f64).round() as i64;
            let yi = (ny * (gh - 1) as f64).round() as i64;
            if xi < 0 || xi >= gw as i64 || yi < 0 || yi >= gh as i64 {
                return;
            }
            let o = ((yi as usize) * gw + xi as usize) * 4;
            data[o] = rgb[0] as u8;
            data[o + 1] = rgb[1] as u8;
            data[o + 2] = rgb[2] as u8;
            data[o + 3] = 255;
        };
        let disc = |data: &mut [u8], nx: f64, ny: f64, r: i64, rgb: &[i64; 3]| {
            for dy in -r..=r {
                for dx in -r..=r {
                    if dx * dx + dy * dy <= r * r {
                        put(&mut *data, nx + dx as f64 / (gw - 1) as f64, ny + dy as f64 / (gh - 1) as f64, rgb);
                    }
                }
            }
        };
        let w_rad = |s: &Value| -> i64 {
            match s.get("w").and_then(|v| v.as_f64()) {
                Some(w) if w > 0.0 => ((w * (gw - 1) as f64 * 0.5).round() as i64).max(1),
                _ => 0,
            }
        };
        for s in ls {
            if !s.is_object() {
                continue;
            }
            let rgb = stroke_rgb(s);
            let ty = s.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if ty == "fill" {
                if let Some(pts) = s.get("pts").and_then(|v| v.as_array()) {
                    if pts.len() >= 3 {
                        let (mut mnx, mut mny, mut mxx, mut mxy) = (1f64, 1f64, 0f64, 0f64);
                        for p in pts {
                            let px = p.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
                            let py = p.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
                            if px < mnx {
                                mnx = px;
                            }
                            if py < mny {
                                mny = py;
                            }
                            if px > mxx {
                                mxx = px;
                            }
                            if py > mxy {
                                mxy = py;
                            }
                        }
                        let xa = ((mnx * (gw - 1) as f64).round() as i64).max(0) as usize;
                        let xb = ((mxx * (gw - 1) as f64).round() as i64).min(gw as i64 - 1).max(0) as usize;
                        let ya = ((mny * (gh - 1) as f64).round() as i64).max(0) as usize;
                        let yb = ((mxy * (gh - 1) as f64).round() as i64).min(gh as i64 - 1).max(0) as usize;
                        for yy in ya..=yb {
                            for xx in xa..=xb {
                                let o = (yy * gw + xx) * 4;
                                data[o] = rgb[0] as u8;
                                data[o + 1] = rgb[1] as u8;
                                data[o + 2] = rgb[2] as u8;
                                data[o + 3] = 255;
                            }
                        }
                    }
                }
            } else if ty == "line" {
                let x0 = s.get("x0").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let y0 = s.get("y0").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let x1 = s.get("x1").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let y1 = s.get("y1").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let r = w_rad(s);
                let steps = (((x1 - x0) * gw as f64).hypot((y1 - y0) * gh as f64).round() as i64).max(2);
                for k in 0..=steps {
                    let t = k as f64 / steps as f64;
                    let x = x0 + (x1 - x0) * t;
                    let yv = y0 + (y1 - y0) * t;
                    if r > 0 {
                        disc(&mut data, x, yv, r, &rgb);
                    } else {
                        put(&mut data, x, yv, &rgb);
                    }
                }
            } else if ty == "point" {
                let x = s.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let yv = s.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let r = w_rad(s);
                if r > 0 {
                    disc(&mut data, x, yv, r, &rgb);
                } else {
                    put(&mut data, x, yv, &rgb);
                }
            }
        }
    }
    Some(equationalize(gw, gh, &data))
}

// ─── VOICE (VOX) — the same lifting in its 1-D native habitat (audio.js port) ─
// A spoken word perceived through the forward CDF 9/7 into a sparse quantized
// field-A record (her voice's equation), and re-spoken through the inverse.
const VOX_CHUNK: usize = 32768; // pow-2 lift window @24kHz ≈ 1.37s
const AUDIO_TOL: f64 = 0.02; // target relative L2 error (speech-tight)
const AUDIO_KMIN: usize = 256; // floor terms per chunk
const AUDIO_MAX_SECONDS: usize = 30; // hostile-input bound on a single perceive

pub fn perceive_audio(pcm: &[f32], sample_rate: usize) -> Option<Value> {
    if pcm.is_empty() {
        return None;
    }
    let n = pcm.len().min(sample_rate * AUDIO_MAX_SECONDS);
    let mut chunks: Vec<Value> = Vec::new();
    let mut tmp = vec![0f64; VOX_CHUNK];
    let mut terms = 0usize;
    let mut off = 0usize;
    while off < n {
        let len = VOX_CHUNK.min(n - off);
        // zero-pad the tail chunk to the full pow-2 window
        let mut buf = vec![0f64; VOX_CHUNK];
        for i in 0..len {
            buf[i] = pcm[off + i] as f64;
        }
        fwd1d(&mut buf, 0, 1, VOX_CHUNK, &mut tmp);
        // energy-target selection — content decides the term count
        let mut total = 0f64;
        for v in &buf {
            total += v * v;
        }
        if total == 0.0 {
            total = 1.0;
        }
        let mut order: Vec<u32> = (0..VOX_CHUNK as u32).collect();
        order.sort_unstable_by(|&a, &b| {
            buf[b as usize]
                .abs()
                .partial_cmp(&buf[a as usize].abs())
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let target = (1.0 - AUDIO_TOL * AUDIO_TOL) * total;
        let mut acc = 0f64;
        let mut k = 0usize;
        while k < VOX_CHUNK && acc < target {
            let v = buf[order[k] as usize];
            acc += v * v;
            k += 1;
        }
        k = AUDIO_KMIN.max(k.min(VOX_CHUNK)).min(VOX_CHUNK);
        let mut idx: Vec<u32> = order[..k].to_vec();
        idx.sort_unstable();
        let mut max_abs = 1e-8f64;
        for &i in &idx {
            max_abs = max_abs.max(buf[i as usize].abs());
        }
        let qscale = max_abs / 32000.0;
        let mut q = vec![0i16; k];
        for i in 0..k {
            q[i] = (buf[idx[i] as usize] / qscale).round().clamp(-32767.0, 32767.0) as i16;
        }
        chunks.push(json!({
            "keep": k, "qscale": qscale, "pos_enc": "dv1", "len": len,
            "pos_b64": b64_encode(&enc_pos(&idx)),
            "val_b64": b64_encode(&i16_bytes(&q)),
        }));
        terms += k;
        off += VOX_CHUNK;
    }
    Some(json!({
        "model": "cdf97_audio_native_quantized", "wavelet": "cdf97", "v": 1,
        "sampleRate": sample_rate, "length": n, "chunkSize": VOX_CHUNK,
        "chunks": chunks, "equation_count": terms,
    }))
}

pub fn reconstruct_audio(rec: &Value) -> Option<Vec<f32>> {
    let chunks = rec.get("chunks")?.as_array()?;
    let length = rec.get("length").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let chunk_size = rec.get("chunkSize").and_then(|v| v.as_u64()).unwrap_or(VOX_CHUNK as u64) as usize;
    if length == 0 || chunk_size == 0 || chunk_size > (1 << 24) {
        return None;
    }
    let mut out = vec![0f32; length];
    let mut tmp = vec![0f64; chunk_size];
    let mut off = 0usize;
    for c in chunks {
        let val = b64_i16(c.get("val_b64").and_then(|v| v.as_str()).unwrap_or(""));
        let qscale = c.get("qscale").and_then(|v| v.as_f64()).unwrap_or(1.0);
        let pos_enc = c.get("pos_enc").and_then(|v| v.as_str()).unwrap_or("");
        let pos_b64 = c.get("pos_b64").and_then(|v| v.as_str()).unwrap_or("");
        let pos = if pos_enc == "dv1" {
            dec_pos(&b64_decode(pos_b64), val.len())
        } else {
            let mut v = b64_u32(pos_b64);
            v.resize(val.len(), 0);
            v
        };
        let mut flat = vec![0f64; chunk_size];
        for i in 0..val.len() {
            let p = pos[i] as usize;
            if p < chunk_size {
                flat[p] = val[i] as f64 * qscale;
            }
        }
        inv1d(&mut flat, 0, 1, chunk_size, &mut tmp);
        let clen = c.get("len").and_then(|v| v.as_u64()).unwrap_or(chunk_size as u64) as usize;
        let len = clen.min(length.saturating_sub(off));
        for i in 0..len {
            out[off + i] = flat[i] as f32;
        }
        off += len;
    }
    Some(out)
}

// ─── op dispatcher — one mindspace_op in, one mindspace_result JSON out ──────
pub fn handle_op(id: u64, op: &str, payload: &Map<String, Value>) -> String {
    let reply = |extra: Value| -> String {
        let mut m = Map::new();
        m.insert("type".into(), json!("mindspace_result"));
        m.insert("id".into(), json!(id));
        if let Value::Object(o) = extra {
            for (k, v) in o {
                m.insert(k, v);
            }
        }
        Value::Object(m).to_string()
    };
    let parse_rec = |payload: &Map<String, Value>| -> Option<Rec> {
        payload.get("rec").cloned().and_then(|v| serde_json::from_value(v).ok())
    };
    match op {
        "perceive" => {
            let w = payload.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let h = payload.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let b64 = payload.get("rgba_b64").and_then(|v| v.as_str()).unwrap_or("");
            let bytes = b64_decode(b64);
            if w == 0 || h == 0 || bytes.len() < w * h * 4 {
                return reply(json!({ "ok": false, "error": "perceive: bad payload" }));
            }
            reply(json!({ "ok": true, "rec": equationalize(w, h, &bytes) }))
        }
        "describe" => {
            let rec = match parse_rec(payload) {
                Some(r) => r,
                None => return reply(json!({ "ok": false, "error": "describe: bad rec" })),
            };
            let dim = payload.get("dim").and_then(|v| v.as_u64()).unwrap_or(64) as usize;
            let p = describe(&rec, dim);
            let mut bytes = Vec::with_capacity(p.len() * 4);
            for v in &p {
                bytes.extend_from_slice(&(*v as f32).to_le_bytes());
            }
            reply(json!({ "ok": true, "percept_b64": b64_encode(&bytes) }))
        }
        "stylizeField" => {
            let rec = match parse_rec(payload) {
                Some(r) => r,
                None => return reply(json!({ "ok": false, "error": "stylize: bad rec" })),
            };
            let opts = payload.get("opts").cloned().unwrap_or_else(|| json!({}));
            let ls = payload.get("labelStrokes").and_then(|v| v.as_array()).cloned();
            match stylize_field(&rec, &opts, ls.as_deref()) {
                Some(r) => reply(json!({ "ok": true, "rec": r })),
                None => reply(json!({ "ok": false, "error": "stylize null" })),
            }
        }
        "traceLineArt" => {
            let rec = match parse_rec(payload) {
                Some(r) => r,
                None => return reply(json!({ "ok": false, "error": "trace: bad rec" })),
            };
            let opts = payload.get("opts").cloned().unwrap_or_else(|| json!({}));
            reply(json!({ "ok": true, "strokes": trace_line_art(&rec, &opts) }))
        }
        "perceiveAudio" => {
            let b64 = payload.get("pcm_b64").and_then(|v| v.as_str()).unwrap_or("");
            let sr = payload.get("sampleRate").and_then(|v| v.as_u64()).unwrap_or(24000) as usize;
            let bytes = b64_decode(b64);
            let pcm: Vec<f32> = bytes.chunks_exact(4).map(|p| f32::from_le_bytes([p[0], p[1], p[2], p[3]])).collect();
            match perceive_audio(&pcm, sr) {
                Some(r) => reply(json!({ "ok": true, "rec": r })),
                None => reply(json!({ "ok": false, "error": "perceiveAudio: empty pcm" })),
            }
        }
        "reconstructAudio" => {
            let rec = match payload.get("rec") {
                Some(r) => r,
                None => return reply(json!({ "ok": false, "error": "reconstructAudio: no rec" })),
            };
            match reconstruct_audio(rec) {
                Some(pcm) => {
                    let mut bytes = Vec::with_capacity(pcm.len() * 4);
                    for v in &pcm {
                        bytes.extend_from_slice(&v.to_le_bytes());
                    }
                    reply(json!({ "ok": true, "pcm_b64": b64_encode(&bytes) }))
                }
                None => reply(json!({ "ok": false, "error": "reconstructAudio: bad rec" })),
            }
        }
        _ => reply(json!({ "ok": false, "error": format!("unsupported op: {op}") })),
    }
}
