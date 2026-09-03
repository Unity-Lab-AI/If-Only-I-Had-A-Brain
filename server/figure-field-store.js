// figure-field-store.js — A PRECOMPUTED WAVELET FIELD IS A PERCEPT SOURCE.
//
// The design goal is that she sees a precomputed field the SAME way she sees
// her own drawing or a camera frame — one perception path, not a special case:
// a field read here enters `_perceiveTextbookFigure` at exactly the point a
// freshly-transformed image would, and every step after it — `describe`,
// `store.set`, `_queuePhraseTeach` (ORDER tag 13 + ATTACH tag 35) — is
// untouched. **A percept SOURCE, not a new lane**, which is the only reason
// this cannot drift away from how she sees a camera frame or her own drawing.
//
// ⛔ WHY THIS EXISTS AT ALL. The corpus figures were transformed once already,
// into `UnityAILab/BrainWaves`. Nothing in the brain read them, so the walk
// re-fetched and re-transformed all 32,296 — measured at ~64 CPU-hours and
// 32,296 third-party fetches for work already done. Reading the field instead
// is a JSON parse, and the figure drain goes from ~69 h to the pacing floor.
//
// ⚠ A MISS IS NOT AN ERROR. Roughly a fifth of corpus figures never produced a
// field (dead URLs, non-Wikimedia SVGs, GIFs), and the network path remains
// correct for every one of them. `miss` is counted separately from `stub` and
// `malformed` precisely so a silently-dead cache cannot hide inside one number.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ⭐ THE DUPLICATE THIS FILE USED TO WARN ABOUT IS GONE. `figKey`, `bare` and
// `shardName` were written out here in full and again in the field producer,
// which could not be edited while its run was live — the batch loop respawns
// `node` every batch, so an edit would have landed mid-run against a job with
// hours left. The run has ended, and all five copies of the rule now resolve to
// the module below. Two owners of a hash rule is how two writers drift apart.
const { figKey, bareKey: bare, shardName } = require('../js/brain/figure-identity.cjs');

// Where the press leaves them. `deploy/self-update.sh` syncs `BrainWaves` here
// on every Update / Fresh-walk, and the path is on the rsync EXCLUDE list so
// the next press cannot delete what it just downloaded.
function fieldsRoot() {
  const env = process.env.DREAM_FIGURE_FIELDS_DIR;
  if (env && String(env).trim()) return String(env).trim();
  return path.join(__dirname, '..', 'fields');
}

const stats = {
  enabled: null,      // resolved on first use, so the log states it once
  root: null,
  hit: 0,             // a field was read and produced a usable rec
  miss: 0,            // no file — the network path handles it, NOT an error
  stub: 0,            // an LFS pointer stub: `git lfs pull` never ran
  malformed: 0,       // present, parsed, and not a field
  truncated: 0,       // a .gz that will not inflate: an interrupted SYNC, not a bad field
  gz: 0,              // how many reads came from the compressed encoding
  bytes: 0,
  lastErr: null,
  lastErrAt: 0,
};

// An LFS pointer is a tiny text file that begins with a version line. It parses
// as neither JSON nor a field, and — the trap — `JSON.parse` failing on it
// looks identical to a corrupt field unless you check for this shape first.
function looksLikePointer(buf) {
  if (buf.length > 400) return false;
  return buf.slice(0, 60).toString('utf8').startsWith('version https://git-lfs');
}

/**
 * Load the precomputed field for a figure URL.
 *
 * @returns {null | { rec, phrase, links, citations, url, bytes }}
 *   `null` on any miss, stub or malformed file — the caller falls through to
 *   the network path, which is always correct.
 */
function loadField(url) {
  if (stats.enabled === false) return null;
  const root = stats.root || (stats.root = fieldsRoot());
  if (stats.enabled === null) {
    stats.enabled = fs.existsSync(root);
    if (!stats.enabled) {
      console.log(`[FigureField] no field store at ${root} — every figure will be fetched and transformed live (set DREAM_FIGURE_FIELDS_DIR, or let the press sync BrainWaves).`);
      return null;
    }
    console.log(`[FigureField] field store found at ${root} — precomputed wavelet fields will be read instead of re-transformed.`);
  }

  // ⛔⛔ BOTH ENCODINGS ARE LIVE AND NEITHER IS "THE OLD ONE". A field is a JSON
  // skeleton wrapping base64 payloads — the shape that compresses — and git LFS
  // stores objects verbatim, so it never does this for us. Measured on a real
  // field: **10,952,378 B -> 5,364,645 B, 51%, byte-identical coefficients.** At
  // a projected 251 GB for the completed set that difference is the whole
  // question of whether it can live twice, once in Forgejo and once on the box.
  //
  // ⚠ THE READER HAS TO ACCEPT BOTH WHATEVER THE MIGRATION DECIDES, because any
  // resumed run straddles the change: a pass that starts before it and finishes
  // after it leaves a store holding both, and a reader that knew only one
  // encoding would report those as `miss` and silently re-transform them live.
  // `.gz` is preferred so a half-finished migration converges on the smaller
  // file rather than reading whichever it happens to find first.
  const key = figKey(url);
  const stem = path.join(root, shardName(key), bare(key));
  let buf, gz = false;
  try {
    buf = fs.readFileSync(`${stem}.field.json.gz`); gz = true;
  } catch {
    try {
      buf = fs.readFileSync(`${stem}.field.json`);
    } catch {
      stats.miss++;
      return null;
    }
  }
  const file = gz ? `${stem}.field.json.gz` : `${stem}.field.json`;
  // The stub check below runs on the RAW bytes deliberately — an LFS pointer for
  // a `.gz` path is still a ~130-byte text file, not gzip, so it must be caught
  // before anything tries to inflate it or the real delivery failure would be
  // reported as a corrupt archive.
  const rawBytes = buf.length;

  // ⛔⛔ THE POINTER-STUB CHECK IS THE WHOLE REASON THIS IS NOT A ONE-LINER.
  // `*.field.json` is an LFS filter in BrainWaves, and `git clone --depth 1` is
  // NOT LFS-aware — without `git lfs pull` every file on disk is a ~130-byte
  // pointer. That is the `/raw/` vs `/media/` trap one layer down, and it fails
  // OPEN: a stub is a real file, so a naive existence check reports a healthy
  // cache while she perceives nothing.
  if (looksLikePointer(buf)) {
    stats.stub++;
    if (stats.stub === 1 || stats.stub % 500 === 0) {
      stats.lastErr = 'LFS pointer stub — `git lfs pull` has not run for the field store';
      stats.lastErrAt = Date.now();
      console.warn(`[FigureField] ⛔ ${file} is an LFS POINTER, not a field (${stats.stub} so far). The sync ran without \`git lfs pull\`; she is transforming every figure live. This is a delivery failure, not a cache miss.`);
    }
    return null;
  }

  // ⛔ A TRUNCATED ARCHIVE IS ITS OWN FAILURE AND IS COUNTED AS ONE. Folding it
  // into `malformed` would hide the one cause that says something about the
  // DELIVERY rather than the field — a `.gz` that will not inflate means the
  // sync was interrupted, and that is a different thing to fix from a field that
  // inflates cleanly and carries no channels.
  if (gz) {
    try {
      buf = zlib.gunzipSync(buf);
    } catch (e) {
      stats.truncated++;
      stats.lastErr = `field gunzip: ${e && e.message}`;
      stats.lastErrAt = Date.now();
      if (stats.truncated === 1 || stats.truncated % 200 === 0) {
        console.warn(`[FigureField] ⛔ ${file} will not inflate (${stats.truncated} so far) — the field sync was interrupted, so this is a delivery failure and not a bad field.`);
      }
      return null;
    }
  }

  let j;
  try {
    j = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    stats.malformed++;
    stats.lastErr = `field parse: ${e && e.message}`;
    stats.lastErrAt = Date.now();
    return null;
  }

  // A field without channels is not a field. Refusing here rather than banking
  // it is what stops a truncated or half-written file from becoming a memory
  // that scores 0 forever — the recall lane cannot tell those apart later.
  const rec = j && j.rec;
  if (!rec || !rec.channels || !rec.channels.Y) {
    stats.malformed++;
    stats.lastErr = 'field carried no rec.channels';
    stats.lastErrAt = Date.now();
    return null;
  }

  stats.hit++;
  // ⚠ ON-DISK bytes, not inflated bytes. This counter answers "what did the sync
  // have to deliver", which is the question the size work was about; the inflated
  // size is a property of the field and is the same either way.
  stats.bytes += rawBytes;
  if (gz) stats.gz++;
  return {
    rec,
    // ⚠ The caller PREFERS the queue row's phrase. The row's text travels with
    // it (the unlabelled-frame rule — a binding resolved at perception time
    // reads ambient state), so the field's own copy is a fallback for a figure that
    // reached the drain without one, never an override.
    phrase: typeof j.phrase === 'string' ? j.phrase : null,
    links: Array.isArray(j.links) ? j.links : [],
    citations: Number(j.citations) || 0,
    url: typeof j.url === 'string' ? j.url : String(url || ''),
    bytes: rawBytes,
  };
}

/** Dashboard-shaped snapshot. Counters are separate BY REASON on purpose. */
function fieldStoreStats() {
  return {
    enabled: stats.enabled,
    root: stats.root,
    hit: stats.hit,
    miss: stats.miss,
    stub: stats.stub,
    malformed: stats.malformed,
    truncated: stats.truncated,
    gz: stats.gz,
    mb: +(stats.bytes / 1048576).toFixed(1),
    lastErr: stats.lastErr,
    lastErrAgeMs: stats.lastErrAt ? Date.now() - stats.lastErrAt : null,
  };
}

module.exports = { figKey, bare, shardName, fieldsRoot, loadField, fieldStoreStats };
