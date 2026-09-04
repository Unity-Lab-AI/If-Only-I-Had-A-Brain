'use strict';

/* ────────────────────────────────────────────────────────────────────────────
 * GLOVE PROVISION — make the one boot-fatal file impossible to be missing.
 *
 * ⛔⛔ WHY THIS EXISTS. On 2026-09-04 a press deleted `corpora/` from the box and
 * could not replace it, because the corpus had moved to a second repo the box's
 * deploy key was never authorised on. The brain then booted, failed to load
 * GloVe, logged `⛔ Boot STOPS here by design (NO FALLBACKS)` — and ran anyway
 * with a dead language subsystem, which is worse than dying because it looks
 * alive. The table has a public, unauthenticated, canonical source and the boot
 * could not fetch it.
 *
 * ⭐ THE CODE ALREADY NAMED THAT SOURCE. `js/brain/embeddings.js` throws with
 * *"download glove.6B.300d.txt from https://nlp.stanford.edu/data/glove.6B.zip"*.
 * The error told an operator exactly what to do and the process could not do it
 * itself. This closes that gap at the only place that always runs: the boot.
 *
 * ⚠ THIS IS PROVISIONING, NOT A CAPABILITY FALLBACK. It fetches the canonical
 * published table — real 300d GloVe vectors, not a degraded substitute. The
 * NO-FALLBACKS law forbids a LESSER capability (hash vectors instead of semantic
 * ones); fetching the real artefact from its publisher is not that. If the fetch
 * fails, the boot still dies exactly as before.
 *
 * ⚠ AND IT IS NOT NECESSARILY BYTE-IDENTICAL TO WHATEVER IS ON A GIVEN BOX —
 * measured, not assumed. Read out of the live archive's central directory on
 * 2026-09-04, `glove.6B.300d.txt` is **1,037,965,801** bytes; the copy sitting in
 * this repo's working tree is **1,037,962,819** — 2,982 bytes apart, far too
 * small a gap to be line endings across 400,000 rows, so the two are different
 * distributions of the same table rather than the same file. Both parse, both
 * carry 400,000 300-dimension vectors, and the checks below accept either.
 * **Do not write a test that pins an exact byte count here.**
 *
 * ⛔⛔ ZERO EXTERNAL TOOLS, DELIBERATELY. `deploy/self-update.sh` does this same
 * job with the `unzip` binary, and has to report honestly when the box does not
 * have it. Putting that dependency in the BOOT path would recreate tonight's bug
 * in a new place: an unverified external tool standing between the brain and the
 * one file it cannot start without. Both published mirrors ship a `.zip`, so
 * this reads the archive itself with `zlib` — a Node built-in. Nothing to
 * install, nothing to be missing.
 * ──────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');
const { pipeline } = require('stream');

// Both verified reachable and unauthenticated 2026-09-04: HTTP 200,
// content-type application/zip, 862,182,613 bytes.
const SOURCES = [
  'https://nlp.stanford.edu/data/glove.6B.zip',
  'https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip',
];
const MEMBER = 'glove.6B.300d.txt';
// The real table is 1,037,962,819 bytes. A floor an order of magnitude below it
// separates "present" from "a pointer stub or a truncated transfer" without
// pinning a number that a future re-publish could legitimately move.
const MIN_BYTES = 100 * 1000 * 1000;

function _bytes(p) { try { return fs.statSync(p).size; } catch { return 0; } }

/**
 * Is the table on disk and plausibly the real thing?
 *
 * ⛔ EXISTENCE IS NOT THE CHECK. A git-LFS pointer stub is a real, readable file
 * of ~131 bytes, and a truncated download is a real file too — the boot would
 * open either one and die. Size AND shape, because they catch different
 * failures: the first row of a real table is a word followed by 300 floats.
 */
function tableLooksReal(file) {
  const n = _bytes(file);
  if (n < MIN_BYTES) return { ok: false, why: n === 0 ? 'absent' : `only ${n} bytes`, bytes: n };
  let head = '';
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(8192);
    const read = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    head = buf.slice(0, read).toString('utf8');
  } catch { return { ok: false, why: 'unreadable', bytes: n }; }
  const firstLine = head.split('\n')[0] || '';
  const fields = firstLine.trim().split(/\s+/).length;
  if (fields !== 301) return { ok: false, why: `first row has ${fields} fields, expected 301`, bytes: n };
  return { ok: true, bytes: n };
}

function _download(url, dest, log) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Unity-Brain/1.0' } }, (res) => {
      // Both mirrors redirect; follow rather than treating a 302 as failure.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(_download(res.headers.location, dest, log));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const total = Number(res.headers['content-length'] || 0);
      let got = 0, lastPct = -1;
      res.on('data', (c) => {
        got += c.length;
        if (total) {
          const pct = Math.floor((got / total) * 100 / 10) * 10;
          // Every 10% only — the boot log is read by humans, not a progress bar.
          if (pct > lastPct) { lastPct = pct; log(`  … ${pct}% (${(got / 1048576).toFixed(0)} MB)`); }
        }
      });
      pipeline(res, fs.createWriteStream(dest), (err) => (err ? reject(err) : resolve()));
    });
    req.on('error', reject);
    // A stalled socket must not hang the boot forever.
    req.setTimeout(15 * 60 * 1000, () => req.destroy(new Error('download timeout')));
  });
}

/**
 * Locate one member inside a ZIP by reading its central directory.
 *
 * ⚠ Deliberately minimal: this reads the End-of-Central-Directory record, walks
 * the central directory, and returns the byte offset where that member's
 * compressed data begins. It is not a general ZIP implementation and does not
 * try to be — it handles the one archive shape both mirrors publish.
 */
function _findMember(fd, size, name) {
  // EOCD is at the end, after a comment of unknown length — scan back for its
  // signature over the maximum comment size plus the record itself.
  const tailLen = Math.min(size, 66000);
  const tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no EOCD — not a zip');
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOff = tail.readUInt32LE(eocd + 16);
  if (cdOff === 0xffffffff || cdSize === 0xffffffff) throw new Error('zip64 central directory unsupported');

  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOff);
  let p = 0;
  while (p + 46 <= cd.length) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const method = cd.readUInt16LE(p + 10);
    const compSize = cd.readUInt32LE(p + 20);
    const uncompSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const cmtLen = cd.readUInt16LE(p + 32);
    const lhOff = cd.readUInt32LE(p + 42);
    const entryName = cd.slice(p + 46, p + 46 + nameLen).toString('latin1');
    if (entryName === name || entryName.endsWith('/' + name)) {
      // The local header repeats the name/extra lengths, and its extra field
      // can differ in length from the central one — so the data offset MUST be
      // computed from the local header, never from the central directory.
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, lhOff);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header');
      const lhName = lh.readUInt16LE(26);
      const lhExtra = lh.readUInt16LE(28);
      return { method, compSize, uncompSize, dataOffset: lhOff + 30 + lhName + lhExtra };
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  throw new Error(`member ${name} not found in archive`);
}

function _extract(zipPath, outPath, log) {
  return new Promise((resolve, reject) => {
    const size = _bytes(zipPath);
    const fd = fs.openSync(zipPath, 'r');
    let member;
    try { member = _findMember(fd, size, MEMBER); }
    catch (e) { fs.closeSync(fd); return reject(e); }
    fs.closeSync(fd);
    log(`  archive member found: ${MEMBER}, ${(member.uncompSize / 1048576).toFixed(0)} MB uncompressed (method ${member.method})`);
    const src = fs.createReadStream(zipPath, {
      start: member.dataOffset,
      end: member.dataOffset + member.compSize - 1,
    });
    const out = fs.createWriteStream(outPath);
    // 0 = stored, 8 = deflate. Anything else is not something to guess at.
    if (member.method === 0) return pipeline(src, out, (e) => (e ? reject(e) : resolve()));
    if (member.method !== 8) return reject(new Error(`unsupported compression method ${member.method}`));
    pipeline(src, zlib.createInflateRaw(), out, (e) => (e ? reject(e) : resolve()));
  });
}

/**
 * Ensure the GloVe table is on disk, fetching it if it is not.
 *
 * Returns { ok, action, bytes, why } and NEVER throws — a provisioning failure
 * must surface as the boot's own FATAL with its own wording, not as a different
 * exception from in here.
 */
async function ensureGloveTable(opts = {}) {
  const corporaDir = opts.corporaDir || path.join(process.cwd(), 'corpora');
  const log = opts.log || ((m) => console.log(`[GloVe] ${m}`));
  const file = path.join(corporaDir, MEMBER);

  const have = tableLooksReal(file);
  if (have.ok) return { ok: true, action: 'already-present', bytes: have.bytes };

  if (process.env.DREAM_GLOVE_FETCH === '0') {
    log(`table is ${have.why} and DREAM_GLOVE_FETCH=0 — not fetching.`);
    return { ok: false, action: 'disabled', why: have.why };
  }

  log(`table is ${have.why} at ${file}.`);
  log('This is the one file the boot cannot start without, and it has a public source — fetching it rather than dying.');

  try { fs.mkdirSync(corporaDir, { recursive: true }); } catch { /* exists */ }
  const zipTmp = path.join(corporaDir, '.glove.6B.zip.part');
  const outTmp = path.join(corporaDir, '.glove.6B.300d.txt.part');

  for (const url of SOURCES) {
    try {
      log(`downloading ${url} (~862 MB) …`);
      try { fs.unlinkSync(zipTmp); } catch { /* nf */ }
      await _download(url, zipTmp, log);
      log(`  downloaded ${( _bytes(zipTmp) / 1048576).toFixed(0)} MB, extracting ${MEMBER} …`);
      try { fs.unlinkSync(outTmp); } catch { /* nf */ }
      await _extract(zipTmp, outTmp, log);

      // ⛔ VERIFIED BEFORE IT IS TRUSTED, AND BEFORE IT IS MOVED INTO PLACE. A
      // half-written file at the real path is worse than no file: the next boot
      // would find it, believe it, and die on it.
      const got = tableLooksReal(outTmp);
      if (!got.ok) {
        log(`  REJECTED — ${got.why}. Discarding rather than leaving a file the boot would die on.`);
        try { fs.unlinkSync(outTmp); } catch { /* nf */ }
        continue;
      }
      fs.renameSync(outTmp, file);
      try { fs.unlinkSync(zipTmp); } catch { /* nf */ }
      log(`PROVISIONED — ${got.bytes.toLocaleString()} bytes at ${file}. The boot's hardest precondition is satisfied.`);
      return { ok: true, action: 'fetched', bytes: got.bytes, source: url };
    } catch (e) {
      log(`  failed from ${url}: ${(e && e.message) || e}`);
    }
  }

  try { fs.unlinkSync(zipTmp); } catch { /* nf */ }
  try { fs.unlinkSync(outTmp); } catch { /* nf */ }
  return { ok: false, action: 'all-sources-failed', why: have.why };
}

module.exports = {
  ensureGloveTable, tableLooksReal, MEMBER, MIN_BYTES,
  // ⚠ EXPORTED FOR VERIFICATION, not for callers. The zip reader is the part of
  // this file most likely to be subtly wrong — offsets computed from the wrong
  // header, a compression method assumed rather than read — and a component
  // that cannot be exercised in isolation gets shipped on inspection alone,
  // which is how this project keeps finding bugs after the fact.
  _internals: { _findMember, _extract, _download },
};
