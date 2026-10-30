// LETTERFORMS — REAL vector glyph outlines, read from a real font file.
//
// ⛔⛔ WHY THIS EXISTS: SHE WAS LEARNING TO WRITE BY COPYING A 5x7 BITMAP.
//
// The operator reported that her handwriting was not improving and asked that
// her drawing and her writing be one system with her brain rather than a
// bolted-on script. (His exact words are in the board and the ledger, where
// verbatim belongs — never in code.) He was right on both counts, and the
// proof was in the source she copied —
// the lowercase 'r' in the old `FONT5X7` table was:
//
//     00000
//     00000
//     10110      <- the shoulder of the 'r' is THREE LIT PIXELS
//     11001
//     10000
//     10000
//     10000
//
// Her tracer was faithful; the teacher was three pixels wide. And the practice
// loop scored her hand against that same bitmap, so ⭐ PRACTICE COULD ONLY EVER
// CONVERGE ON THE BITMAP — it could make her reproduce a bad 'r' more exactly,
// never a good one. A practice loop cannot exceed its reference.
//
// The same font's real 'r' is ONE CONTOUR OF 20 POINTS, 12 of them on-curve.
// That is what she is shown now.
//
// ⭐ AND THIS DELETES A HARDCODED ASSET RATHER THAN ADDING ONE, which is the
// architectural half of what he asked for. The letterforms are no longer a
// table authored in this repo; they are read from a typeface at runtime, and
// she perceives them through the same eyes, the same `traceCentreline`
// skeletoniser and the same practice loop as everything else she looks at. One
// system.
//
// ⛔ NO FALLBACK TO A BITMAP. If no font on the machine parses, she writes
// NOTHING and this module says so loudly. That is the existing contract for an
// untraceable glyph ("she will write nothing for those rather than stamp a font
// she never learned") and the project's standing rule against fallbacks: a
// silent degrade to the bitmap would reinstate the exact defect this replaces,
// invisibly.
//
// ⚠ SERVER-SIDE BY NECESSITY. `js/brain/mindspace/gpu.js` is bundled for the
// browser and cannot read a file, so the parse happens here and the outlines
// are INJECTED into the mind-space engine. The proxy passthrough ships in the
// same change — a method missing there is this project's signature defect (a
// missing `imagine()` banked colourless schemas for a day while engine-direct
// harnesses looked fine).

import fs from 'node:fs';
import path from 'node:path';

// Candidate faces, in preference order, per platform. ⚠ These are DISCOVERY
// paths, not a letterform table — whichever one parses first supplies real
// outlines, and `DREAM_LETTERFORM_FONT` overrides the lot.
//
// Candara leads on Windows deliberately: it is a humanist face with pen-like
// terminals, which is the right thing for a hand that is learning to write
// rather than to typeset. It is also the one verified to parse here.
const WINDOWS_DIRS = ['C:/Windows/Fonts', 'C:/WINDOWS/Fonts'];
const LINUX_DIRS = [
  '/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/truetype/liberation',
  '/usr/share/fonts/truetype/noto', '/usr/share/fonts/TTF', '/usr/share/fonts',
];
const PREFERRED = [
  'Candara.ttf', 'calibri.ttf', 'segoeui.ttf', 'arial.ttf', 'verdana.ttf',
  'georgia.ttf', 'tahoma.ttf',
  'DejaVuSans.ttf', 'LiberationSans-Regular.ttf', 'NotoSans-Regular.ttf', 'FreeSans.ttf',
];

function candidatePaths() {
  const out = [];
  const env = process.env.DREAM_LETTERFORM_FONT;
  if (env) out.push(env);
  const dirs = process.platform === 'win32' ? WINDOWS_DIRS : LINUX_DIRS;
  for (const name of PREFERRED) for (const d of dirs) out.push(path.join(d, name));
  // Last resort for discovery only: any .ttf in the first readable dir. Still a
  // REAL typeface — this is not a fallback to a synthetic font.
  for (const d of dirs) {
    try {
      for (const f of fs.readdirSync(d)) if (/\.ttf$/i.test(f)) out.push(path.join(d, f));
    } catch { /* dir absent on this machine */ }
  }
  return out;
}

// ─── the TrueType reader ──────────────────────────────────────────────────────
// Only what a letterform needs: the table directory, head (unitsPerEm), maxp
// (glyph count), cmap (char -> glyph id), loca (glyph offsets) and glyf
// (contours). No hinting, no kerning, no layout.
class TrueTypeFont {
  constructor(buf, src) {
    this.buf = buf;
    this.src = src;
    this.tables = {};
    const numTables = buf.readUInt16BE(4);
    if (!numTables || numTables > 512) throw new Error('implausible table count');
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16;
      if (o + 16 > buf.length) throw new Error('table directory past EOF');
      const tag = buf.toString('latin1', o, o + 4).trim();
      this.tables[tag] = { off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) };
    }
    for (const t of ['head', 'maxp', 'cmap', 'loca', 'glyf']) {
      if (!this.tables[t]) throw new Error(`no ${t} table (CFF/OpenType outlines are not glyf)`);
    }
    const head = this.tables.head.off;
    this.unitsPerEm = buf.readUInt16BE(head + 18);
    this.indexToLocFormat = buf.readInt16BE(head + 50);
    this.numGlyphs = buf.readUInt16BE(this.tables.maxp.off + 4);
    if (!this.unitsPerEm) throw new Error('unitsPerEm is 0');
    this._cmap = new Map();
    this._buildCmap();
    if (this._cmap.size === 0) throw new Error('no usable cmap subtable');
  }

  // ⚠ THREE cmap FORMATS, not one. The first version of this reader handled
  // only format 4 and reported "no mapping" for EVERY character of Arial and
  // Calibri — which reads exactly like a broken font rather than a reader that
  // asked the wrong question. Measured: Candara 10/10 glyphs, Arial 0/10,
  // Calibri 0/10. Format 12 (segmented coverage, >BMP capable) and format 6
  // (trimmed table) are what those faces actually ship.
  _buildCmap() {
    const b = this.buf, c = this.tables.cmap.off;
    const n = b.readUInt16BE(c + 2);
    const subs = [];
    for (let i = 0; i < n; i++) {
      const pid = b.readUInt16BE(c + 4 + i * 8);
      const eid = b.readUInt16BE(c + 6 + i * 8);
      const off = b.readUInt32BE(c + 8 + i * 8);
      // Unicode: (3,1) BMP, (3,10) full, (0,*) Unicode. Prefer full coverage.
      const rank = (pid === 3 && eid === 10) ? 0 : (pid === 3 && eid === 1) ? 1 : (pid === 0) ? 2 : 9;
      if (rank < 9) subs.push({ rank, off: c + off });
    }
    subs.sort((a, z) => a.rank - z.rank);
    for (const s of subs) {
      try { this._readSubtable(s.off); } catch { /* try the next subtable */ }
      if (this._cmap.size) return;
    }
  }

  _readSubtable(sub) {
    const b = this.buf;
    const fmt = b.readUInt16BE(sub);
    if (fmt === 4) {
      const segX2 = b.readUInt16BE(sub + 6);
      const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = b.readUInt16BE(ends + s * 2), st = b.readUInt16BE(starts + s * 2);
        if (st > end || end === 0xffff && st === 0xffff) continue;
        const delta = b.readInt16BE(deltas + s * 2), ro = b.readUInt16BE(ranges + s * 2);
        for (let code = st; code <= end && code <= 0xffff; code++) {
          let gid;
          if (ro === 0) gid = (code + delta) & 0xffff;
          else {
            const gi = b.readUInt16BE(ranges + s * 2 + ro + (code - st) * 2);
            gid = gi === 0 ? 0 : (gi + delta) & 0xffff;
          }
          if (gid) this._cmap.set(code, gid);
        }
      }
    } else if (fmt === 12) {
      const nGroups = b.readUInt32BE(sub + 12);
      for (let g = 0; g < nGroups; g++) {
        const o = sub + 16 + g * 12;
        const st = b.readUInt32BE(o), end = b.readUInt32BE(o + 4), sg = b.readUInt32BE(o + 8);
        // Letterforms are ASCII here; a full-plane walk would be millions of
        // entries for nothing.
        for (let code = st; code <= end && code <= 0x2fff; code++) this._cmap.set(code, sg + (code - st));
      }
    } else if (fmt === 6) {
      const first = b.readUInt16BE(sub + 6), count = b.readUInt16BE(sub + 8);
      for (let i = 0; i < count; i++) {
        const gid = b.readUInt16BE(sub + 10 + i * 2);
        if (gid) this._cmap.set(first + i, gid);
      }
    } else {
      throw new Error(`cmap format ${fmt} unsupported`);
    }
  }

  _glyphRange(gid) {
    const b = this.buf, l = this.tables.loca.off;
    if (gid < 0 || gid >= this.numGlyphs) return [0, 0];
    return this.indexToLocFormat === 0
      ? [b.readUInt16BE(l + gid * 2) * 2, b.readUInt16BE(l + gid * 2 + 2) * 2]
      : [b.readUInt32BE(l + gid * 4), b.readUInt32BE(l + gid * 4 + 4)];
  }

  // Raw points per contour, in FONT UNITS, with the on-curve flag preserved —
  // the quadratic flattening happens above this so composites can be assembled
  // from untouched point sets.
  _glyphPoints(gid, depth = 0) {
    const b = this.buf;
    const [s, e] = this._glyphRange(gid);
    if (s >= e) return [];                       // a legitimately empty glyph (space)
    const g = this.tables.glyf.off + s;
    const nc = b.readInt16BE(g);
    if (nc < 0) {
      // COMPOSITE GLYPH. ⚠ Many faces build even plain ASCII this way; a reader
      // that skips composites silently loses characters, and a lost character
      // reads as "she never learned it" rather than "the reader gave up".
      if (depth > 4) return [];
      const out = [];
      let p = g + 10;
      for (;;) {
        const flags = b.readUInt16BE(p), subGid = b.readUInt16BE(p + 2);
        p += 4;
        let dx = 0, dy = 0;
        if (flags & 1) { dx = b.readInt16BE(p); dy = b.readInt16BE(p + 2); p += 4; }
        else { dx = b.readInt8(p); dy = b.readInt8(p + 1); p += 2; }
        let a = 1, bb = 0, cc = 0, d = 1;
        if (flags & 8) { a = d = b.readInt16BE(p) / 16384; p += 2; }
        else if (flags & 0x40) { a = b.readInt16BE(p) / 16384; d = b.readInt16BE(p + 2) / 16384; p += 4; }
        else if (flags & 0x80) {
          a = b.readInt16BE(p) / 16384; bb = b.readInt16BE(p + 2) / 16384;
          cc = b.readInt16BE(p + 4) / 16384; d = b.readInt16BE(p + 6) / 16384; p += 8;
        }
        for (const cont of this._glyphPoints(subGid, depth + 1)) {
          out.push(cont.map((q) => ({
            x: a * q.x + cc * q.y + dx,
            y: bb * q.x + d * q.y + dy,
            on: q.on,
          })));
        }
        if (!(flags & 0x20)) break;              // MORE_COMPONENTS
      }
      return out;
    }
    const endPts = [];
    for (let i = 0; i < nc; i++) endPts.push(b.readUInt16BE(g + 10 + i * 2));
    const nPts = nc ? endPts[nc - 1] + 1 : 0;
    if (!nPts) return [];
    let p = g + 10 + nc * 2;
    p += 2 + b.readUInt16BE(p);                  // skip hinting instructions
    const flags = [];
    while (flags.length < nPts) {
      const f = b[p++]; flags.push(f);
      if (f & 8) { let r = b[p++]; while (r-- > 0 && flags.length < nPts) flags.push(f); }
    }
    const xs = []; let x = 0;
    for (let i = 0; i < nPts; i++) {
      const f = flags[i];
      if (f & 2) { const d = b[p++]; x += (f & 16) ? d : -d; }
      else if (!(f & 16)) { x += b.readInt16BE(p); p += 2; }
      xs.push(x);
    }
    const ys = []; let y = 0;
    for (let i = 0; i < nPts; i++) {
      const f = flags[i];
      if (f & 4) { const d = b[p++]; y += (f & 32) ? d : -d; }
      else if (!(f & 32)) { y += b.readInt16BE(p); p += 2; }
      ys.push(y);
    }
    const contours = [];
    let start = 0;
    for (let ci = 0; ci < nc; ci++) {
      const end = endPts[ci];
      if (end < start) { start = end + 1; continue; }
      const pts = [];
      for (let i = start; i <= end; i++) pts.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
      if (pts.length >= 2) contours.push(pts);
      start = end + 1;
    }
    return contours;
  }

  // ⚠ TRUETYPE CURVES ARE QUADRATIC, and the point list is not a simple
  // alternation: two consecutive OFF-curve points imply an on-curve point at
  // their MIDPOINT, and a contour may legally START off-curve. Getting either
  // rule wrong does not throw — it produces a letter with a dent in it, which
  // is indistinguishable from a bad typeface at a glance.
  glyphContours(ch, steps = 8) {
    const gid = this._cmap.get(String(ch).codePointAt(0)) || 0;
    if (!gid) return null;
    const raw = this._glyphPoints(gid);
    if (!raw.length) return [];
    const out = [];
    for (const pts of raw) {
      // Normalise the ring so it begins on-curve.
      let startIdx = pts.findIndex((q) => q.on);
      let ring;
      if (startIdx < 0) {
        // Every point is off-curve: the implied on-curve points are all the
        // midpoints. Synthesise the first one and walk from there.
        const mid = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2, on: true };
        ring = [mid, ...pts];
      } else {
        ring = pts.slice(startIdx).concat(pts.slice(0, startIdx));
      }
      const poly = [{ x: ring[0].x, y: ring[0].y }];
      let i = 1;
      const n = ring.length;
      const quad = (p0, c, p1) => {
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, mt = 1 - t;
          poly.push({
            x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
            y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
          });
        }
      };
      while (i <= n) {
        const cur = ring[i % n];
        const prev = poly[poly.length - 1];
        if (cur.on) { poly.push({ x: cur.x, y: cur.y }); i++; continue; }
        const nxt = ring[(i + 1) % n];
        const end = nxt.on ? nxt : { x: (cur.x + nxt.x) / 2, y: (cur.y + nxt.y) / 2 };
        quad(prev, cur, end);
        i += nxt.on ? 2 : 1;
      }
      if (poly.length >= 3) out.push(poly);
    }
    return out;
  }
}

// ─── public surface ───────────────────────────────────────────────────────────

let _loaded = null;     // { font, path, triedCount } | null
let _attempted = false;
// ⚠ Declared ABOVE its consumer on purpose. A module-level `const` used by a
// function defined earlier is safe only because the call happens after module
// evaluation — which is a property of the call sites, not of this file, and this
// project has already paid for assuming a `typeof` guard shields a TDZ.
const _loadFailures = [];

export function letterformLoadFailures() { return _loadFailures.slice(0, 12); }

export function loadLetterformFont() {
  if (_attempted) return _loaded;
  _attempted = true;
  const tried = [];
  for (const p of candidatePaths()) {
    if (tried.includes(p)) continue;
    tried.push(p);
    let buf;
    try { buf = fs.readFileSync(p); } catch { continue; }
    try {
      const font = new TrueTypeFont(buf, p);
      // ⛔ A font that parses is not a font that WORKS. Demand real outlines for
      // a spread of characters before accepting it, or a face with an exotic
      // cmap would be accepted and then produce an alphabet of blanks.
      const probe = ['a', 'r', 'e', 'A', 'R', '8', '-'];
      const got = probe.filter((c) => { const g = font.glyphContours(c); return g && g.length; });
      if (got.length < probe.length) throw new Error(`only ${got.length}/${probe.length} probe glyphs produced outlines`);
      _loaded = { font, path: p, triedCount: tried.length };
      return _loaded;
    } catch (e) {
      if (tried.length <= 12) _loadFailures.push(`${path.basename(p)}: ${e.message}`);
    }
  }
  return null;
}

/**
 * Every ASCII printable's outline, normalised into a unit box with y DOWN
 * (screen orientation, which is what the stroke consumers already use).
 *
 * ⚠ The normalisation is PER FONT, not per glyph: all glyphs share one scale
 * and baseline so an 'o' is shorter than an 'l' and a 'p' hangs below the line.
 * Normalising each glyph into its own box would make every letter the same
 * height, which is not writing — it is a row of stamps.
 */
export function letterformOutlines(chars, steps = 8) {
  const L = loadLetterformFont();
  if (!L) return null;
  const { font } = L;
  const upem = font.unitsPerEm;
  const out = {};
  // One shared vertical frame: cap/ascender region above the baseline plus a
  // descender allowance below it, expressed in em units.
  const TOP = 0.80, BOTTOM = -0.22;              // em, baseline at 0
  const span = TOP - BOTTOM;
  for (const ch of chars) {
    const cs = font.glyphContours(ch, steps);
    if (cs === null) continue;                   // unmapped — she learns nothing for it
    if (!cs.length) { out[ch] = { contours: [], blank: true }; continue; }   // space
    let minX = Infinity, maxX = -Infinity;
    for (const c of cs) for (const p of c) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
    const wEm = (maxX - minX) / upem;
    const contours = cs.map((c) => c.map((p) => ({
      // x: left-aligned on the glyph's own ink, scaled by the shared frame
      x: ((p.x - minX) / upem) / span,
      // y: flipped (font y is UP, screen y is DOWN) against the shared frame
      y: (TOP - (p.y / upem)) / span,
    })));
    out[ch] = { contours, blank: false, widthFrac: wEm / span };
  }
  return { glyphs: out, source: L.path, unitsPerEm: upem, frame: { TOP, BOTTOM } };
}
