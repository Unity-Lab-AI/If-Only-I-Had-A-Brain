'use strict';
/**
 * WEIGHTS SNAPSHOT — donors pull her trained intra matrix from a GitHub release
 * instead of over the operator's home upload (Gee's choice: public GitHub
 * release assets).
 *
 * Shape: the intra matrix is cut into ROW BLOCKS (≤ BLOCK_BYTES each — GitHub
 * caps one asset at 2 GiB), each a self-describing file:
 *
 *   'UNSB' | u32 version=1 | u32 rowStart | u32 rowEnd | u32 cols | u32 nnz
 *   | rowPtr  u32 × (rows + 1), relative to the block
 *   | colIdx  u32 × nnz
 *   | values  f32 × nnz
 *
 * plus `manifest.json` naming every block with its byte size and SHA-256, the
 * structure hash (rowPtr + colIdx — a donor may only use a snapshot whose
 * structure equals the brain's current one), the save it came from, and the
 * asset URLs. A joining card downloads ONLY the blocks covering its slice,
 * verifies each hash, builds its slice, and the brain then sends only the rows
 * whose values changed since (per-row hashes kept here, never uploaded).
 *
 * ⛔ Released as a PRE-RELEASE with --latest=false. The pod launcher finds the
 * donor binary through `/releases/latest`; a weights release becoming "latest"
 * would hand every pod a weights file to run as its donor.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const REPO = 'Unity-Lab-AI/If-Only-I-Had-A-Brain';
const DIR = path.join(__dirname, '..', 'weights-snapshot');
// ≤ 512 MiB per block (GitHub caps one asset at 2 GiB). `DREAM_SNAPSHOT_BLOCK_MB`
// shrinks it — only the round-trip harness needs that.
const blockBytes = () => (Number(process.env.DREAM_SNAPSHOT_BLOCK_MB) > 0 ? Number(process.env.DREAM_SNAPSHOT_BLOCK_MB) : 512) * 1024 * 1024;
const KEEP = 2;

const yieldNow = () => new Promise((r) => setImmediate(r));

/** FNV-1a 32 over a typed array's bytes (row hashes). */
function fnv32(u8, start, end) {
  let h = 0x811c9dc5;
  for (let i = start; i < end; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Per-row value hashes, computed in yielding chunks so the loop never pins. */
async function rowHashes(matrix, a = 0, b = matrix.rows) {
  const u8 = new Uint8Array(matrix.values.buffer, matrix.values.byteOffset, matrix.values.byteLength);
  const out = new Uint32Array(b - a);
  const rp = matrix.rowPtr;
  for (let r = a; r < b; r++) {
    out[r - a] = fnv32(u8, rp[r] * 4, rp[r + 1] * 4);
    if ((r & 0x3ffff) === 0) await yieldNow();
  }
  return out;
}

/** One hash over rowPtr + colIdx: a snapshot is usable only with the same structure. */
async function structureHash(matrix) {
  const h = crypto.createHash('sha256');
  const step = 16 * 1024 * 1024;
  for (const arr of [matrix.rowPtr, matrix.colIdx]) {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let o = 0; o < u8.length; o += step) { h.update(u8.subarray(o, Math.min(u8.length, o + step))); await yieldNow(); }
  }
  return h.digest('hex');
}

/** Row blocks of ≤ blockBytes(). */
function planBlocks(matrix) {
  const rp = matrix.rowPtr, rows = matrix.rows;
  const BLOCK_BYTES = blockBytes();
  const blocks = [];
  let a = 0;
  while (a < rows) {
    let b = a + 1;
    // grow b while the block stays under the byte cap (rowPtr + colIdx + values)
    let lo = a + 1, hi = rows;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      const bytes = 24 + (mid - a + 1) * 4 + (rp[mid] - rp[a]) * 8;
      if (bytes <= BLOCK_BYTES) lo = mid; else hi = mid - 1;
    }
    b = Math.max(a + 1, lo);
    blocks.push({ rowStart: a, rowEnd: b });
    a = b;
  }
  return blocks;
}

async function writeBlock(file, matrix, a, b) {
  const rp = matrix.rowPtr, base = rp[a], nnz = rp[b] - base;
  const hdr = Buffer.alloc(24);
  hdr.write('UNSB', 0, 'ascii');
  hdr.writeUInt32LE(1, 4); hdr.writeUInt32LE(a, 8); hdr.writeUInt32LE(b, 12);
  hdr.writeUInt32LE(matrix.cols, 16); hdr.writeUInt32LE(nnz, 20);
  const rel = new Uint32Array(b - a + 1);
  for (let i = 0; i <= b - a; i++) rel[i] = rp[a + i] - base;
  const fd = fs.openSync(file, 'w');
  const hash = crypto.createHash('sha256');
  const put = (buf) => { fs.writeSync(fd, buf); hash.update(buf); };
  try {
    put(hdr);
    put(Buffer.from(rel.buffer, rel.byteOffset, rel.byteLength));
    const ci = matrix.colIdx.subarray(base, base + nnz);
    const va = matrix.values.subarray(base, base + nnz);
    const step = 4 * 1024 * 1024;
    for (let o = 0; o < nnz; o += step) { const s = ci.subarray(o, Math.min(nnz, o + step)); put(Buffer.from(s.buffer, s.byteOffset, s.byteLength)); await yieldNow(); }
    for (let o = 0; o < nnz; o += step) { const s = va.subarray(o, Math.min(nnz, o + step)); put(Buffer.from(s.buffer, s.byteOffset, s.byteLength)); await yieldNow(); }
  } finally { fs.closeSync(fd); }
  return { bytes: fs.statSync(file).size, sha256: hash.digest('hex') };
}

const gh = (args, timeoutMs) => new Promise((resolve) => {
  execFile('gh', args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
    resolve({ ok: !err, out: String(stdout || ''), err: String((err && err.message) || stderr || '') });
  });
});

/**
 * Write and publish a snapshot of `matrix`. Returns the manifest (with the
 * local row hashes attached, not uploaded) or null. Never throws.
 */
async function publishSnapshot(matrix, meta) {
  try {
    if (!matrix || !matrix.rowPtr || !matrix.values) return null;
    fs.mkdirSync(DIR, { recursive: true });
    for (const f of fs.readdirSync(DIR)) { try { fs.unlinkSync(path.join(DIR, f)); } catch { /* stale part */ } }
    const tag = `weights-${meta.lineage || 'brain'}-v${meta.saveVersion || 0}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 120);
    const blocks = planBlocks(matrix);
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      const name = `${meta.name}.b${String(i).padStart(3, '0')}.unsb`;
      const w = await writeBlock(path.join(DIR, name), matrix, blocks[i].rowStart, blocks[i].rowEnd);
      out.push({ file: name, ...blocks[i], ...w, url: `https://github.com/${REPO}/releases/download/${tag}/${name}` });
    }
    const manifest = {
      kind: 'unity-weights-snapshot', version: 1, tag, name: meta.name,
      rows: matrix.rows, cols: matrix.cols, nnz: matrix.values.length,
      structure: await structureHash(matrix),
      lineage: meta.lineage || null, saveVersion: meta.saveVersion || 0, savedAt: new Date().toISOString(),
      blocks: out,
    };
    fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const rowHash = await rowHashes(matrix);
    const files = [...out.map((b) => path.join(DIR, b.file)), path.join(DIR, 'manifest.json')];
    const r = await gh(['release', 'create', tag, ...files, '--repo', REPO, '--prerelease', '--latest=false',
      '--title', `her weights — ${meta.name} (save ${meta.saveVersion || 0})`,
      '--notes', 'Her trained intra matrix in row blocks, for donor cards to pull instead of the brain pushing it. Not a donor release.'], 6 * 3600 * 1000);
    if (!r.ok) { console.warn(`[Brain] WEIGHTS SNAPSHOT — publish failed: ${r.err.slice(0, 300)}`); return null; }
    // Keep the newest KEEP weights releases.
    const list = await gh(['release', 'list', '--repo', REPO, '--limit', '50', '--json', 'tagName,createdAt'], 60000);
    try {
      const tags = JSON.parse(list.out).map((x) => x.tagName).filter((t) => t.startsWith('weights-')).filter((t) => t !== tag);
      for (const old of tags.slice(KEEP - 1)) await gh(['release', 'delete', old, '--repo', REPO, '--yes', '--cleanup-tag'], 120000);
    } catch { /* pruning is best-effort */ }
    for (const f of files) { try { fs.unlinkSync(f); } catch { /* uploaded */ } }
    manifest.manifestUrl = `https://github.com/${REPO}/releases/download/${tag}/manifest.json`;
    manifest._rowHash = rowHash;
    return manifest;
  } catch (e) {
    console.warn(`[Brain] WEIGHTS SNAPSHOT — failed: ${e && e.message}`);
    return null;
  }
}

/** Rows in [a, b) whose values differ from the snapshot. Contiguous runs. */
async function changedRuns(matrix, snapRowHash, a, b) {
  const now = await rowHashes(matrix, a, b);
  const runs = [];
  let start = -1;
  for (let r = a; r < b; r++) {
    const diff = now[r - a] !== snapRowHash[r];
    if (diff && start < 0) start = r;
    if (!diff && start >= 0) { runs.push([start, r]); start = -1; }
  }
  if (start >= 0) runs.push([start, b]);
  return runs;
}

module.exports = { publishSnapshot, changedRuns, structureHash, planBlocks, writeBlock, rowHashes, fnv32, DIR };
