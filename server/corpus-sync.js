// corpus-sync.js — THE BOOKS ARRIVE ONE FILE AT A TIME, AND THE BOX NEVER HOLDS
// TWO CORPORA.
//
// The ask: buttons in the training viewer to download the corpus, buffered
// automatically, bounded to a maximum of ONE complete copy on the box — with
// the boundary stated explicitly as not counting the git host's copy. So Forgejo keeping its
// own copy is the design and always was; the invariant is about THIS BOX.
//
// ⛔⛔ WHY THE EXISTING PRESS PATH CANNOT SATISFY THAT. `deploy/self-update.sh`
// does `git clone --depth 1` into a temp directory and then `rsync -a --delete`
// into place, so for the length of the sync the box holds the temp clone AND the
// live corpus — **two complete copies plus the clone's `.git`**, about 800 MB to
// 1.2 GB where the invariant allows 395 MB. That path is correct and stays as
// the press-time bulk sync; this module is the one that can also run WHILE she
// trains, which is why it has to be the one that obeys the bound.
//
// ⭐ WHAT MAKES ONE-COPY POSSIBLE AT ALL: THE CORPUS IS NOT LFS. The data repo's
// `.gitattributes` marks only `*.field.json` and the vector file as LFS, so the
// 193 corpus JSONs are ORDINARY GIT OBJECTS and can be streamed out one at a
// time with `git cat-file`. Nothing is ever checked out, so there is no second
// working tree at any instant — the bound is a property of the design, not
// something a cleanup step restores afterwards.
//
// ⛔ THE SCAFFOLDING IS DESTROYED AFTER EVERY BATCH, and that is the part that
// would otherwise drift into a second copy by accident. A blobless bare repo
// starts as metadata only, but every blob streamed through it is RETAINED in its
// object store — so left alone across a full pass it would slowly accumulate a
// compressed copy of the whole corpus beside the real one. Removing it per batch
// keeps the peak at ONE BATCH of files rather than one corpus.
//
// ⚠ A partial file is not a second copy, but it IS a corrupt book. Every file
// lands temp-name-then-rename inside its own directory, so a kill mid-write can
// leave a stray temp and never a half-written cell that parses as a real one.
//
// ⛔ NO NEW SECRET. The box already fetches this repository over SSH in
// `deploy/self-update.sh`, so the same key does this. An API route would have
// needed a token nobody can install without box access, and the operator has
// dashboard buttons and nothing else.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REMOTE = process.env.UAL_FIELDS_REMOTE || 'git@git.unityailab.com:UnityAILab/BrainWaves.git';
// The subtree that is the books. `corpora/glove.6B.300d.txt` is deliberately NOT
// in here: it is the one LFS object under `corpora/`, so it cannot be streamed
// with `cat-file`, and the press-time sync remains its owner.
const SUBTREE = 'corpora/academic';

function corporaRoot() {
  const env = process.env.DREAM_CORPORA_DIR;
  if (env && String(env).trim()) return String(env).trim();
  return path.join(__dirname, '..', 'corpora');
}

// Batch size and gap are the whole of "buffer": small enough that the scaffolding
// never grows, slow enough that a background pull cannot outrun the walk it is
// feeding. Both are knobs because the right pace depends on the box's link.
const BATCH = Number(process.env.DREAM_CORPUS_BUFFER_BATCH) > 0
  ? Number(process.env.DREAM_CORPUS_BUFFER_BATCH) : 4;
const GAP_MS = Number(process.env.DREAM_CORPUS_BUFFER_GAP_MS) >= 0
  ? Number(process.env.DREAM_CORPUS_BUFFER_GAP_MS) : 5000;

const state = {
  auto: false,
  phase: 'idle',        // idle | planning | pulling | error
  owed: null,           // files known to differ; null = never planned
  have: null,           // files present and byte-identical to the remote
  total: null,
  pulledThisRun: 0,
  bytesThisRun: 0,
  lastFile: null,
  lastErr: null,
  lastErrAt: 0,
  lastPlanAt: 0,
  lastPullAt: 0,
  // ⭐ THE INVARIANT, REPORTED RATHER THAN ASSERTED. A bound nobody can read is
  // a bound nobody can catch breaking, and this one is the operator's actual
  // requirement — so the peak scaffolding seen this run is published.
  scaffoldPeakBytes: 0,
  copiesOnBox: 1,
};

let _timer = null;
let _busy = false;
let _plan = null;   // [{ p, sha, size }] — remote paths that differ from local

// ── git plumbing, always async ───────────────────────────────────────────────
// ⛔ NOTHING HERE MAY BE SYNCHRONOUS. This runs inside the brain's process, and
// this project has already paid for diagnostics that rode the very loop they
// were measuring. `execFileSync` on a network fetch would pin the event loop for
// the whole round trip and stall the walk it exists to feed.
function git(args, opts = {}) {
  return new Promise((resolve) => {
    const ch = spawn('git', args, { stdio: ['ignore', opts.toFile ? 'pipe' : 'pipe', 'pipe'] });
    let out = '', err = '';
    let sink = null;
    if (opts.toFile) {
      sink = fs.createWriteStream(opts.toFile);
      ch.stdout.pipe(sink);
    } else {
      // Corpus cells reach ~10 MB, so anything buffered is bounded explicitly
      // rather than left to a default that truncates without saying so.
      ch.stdout.on('data', (d) => { if (out.length < 64 * 1024 * 1024) out += d; });
    }
    ch.stderr.on('data', (d) => { if (err.length < 65536) err += d; });
    ch.on('error', (e) => resolve({ code: -1, out, err: (e && e.message) || 'spawn failed' }));
    ch.on('close', (code) => {
      if (sink) sink.end(() => resolve({ code, out, err }));
      else resolve({ code, out, err });
    });
  });
}

// The git blob id of a file's CURRENT contents. This is what makes the sync
// incremental without a manifest of our own: the remote tree already publishes
// one of these per file, so "do I need this?" is a local hash rather than a
// download.
//
// ⛔⛔ RAW BYTES, AND `git hash-object` IS NOT THE THING TO CHECK IT AGAINST.
// That command applies the repository's CRLF filters, so on a checkout where
// line endings were converted it returns the NORMALISED hash while the bytes on
// disk are something else. Measured while building this: **10 of 12 sampled
// corpus cells contain CRLF**, and the filtered comparison disagreed on 2 of 4
// before the test was corrected to `--no-filters`, at which point it was 12/12.
//
// ⭐ The raw hash is the right one because it is the one that closes the loop:
// `cat-file blob <sha>` emits the blob's raw bytes, so a file written straight
// from that stream hashes back to `<sha>` by definition, whatever any working
// tree filter would have done to it.
//
// ⚠ THE FAILURE MODE IF A BOX EVER DOES CONVERT ON CHECKOUT: every file looks
// different from the remote forever, so the buffer re-downloads the whole corpus
// on every pass and never converges. It is visible rather than silent — `owed`
// stays at the full file count while `have` sits at zero — which is why both are
// published rather than just a percentage.
function blobShaOf(file) {
  try {
    const buf = fs.readFileSync(file);
    const h = crypto.createHash('sha1');
    h.update(`blob ${buf.length}\0`);
    h.update(buf);
    return h.digest('hex');
  } catch { return null; }
}

function dirBytes(dir) {
  let n = 0;
  const walk = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { n += fs.statSync(p).size; } catch { /* raced */ } }
    }
  };
  walk(dir);
  return n;
}

// ── the scaffolding: created per batch, destroyed per batch ──────────────────
async function withScaffold(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpusbuf-'));
  const gitDir = path.join(dir, 'cg.git');
  try {
    let r = await git(['init', '-q', '--bare', gitDir]);
    if (r.code !== 0) throw new Error(`init: ${r.err || r.code}`);
    r = await git(['--git-dir', gitDir, 'remote', 'add', 'origin', REMOTE]);
    if (r.code !== 0) throw new Error(`remote: ${r.err || r.code}`);
    // ⭐ `--filter=blob:none` IS THE BOUND. Without it this fetch pulls every
    // blob in the repository — which here means the wavelet fields as well as
    // the books, and the whole point of a buffered lane is that it never asks
    // for 114 GB to deliver 395 MB.
    r = await git(['--git-dir', gitDir, '-c', 'protocol.version=2', 'fetch', '-q',
      '--depth', '1', '--filter=blob:none', 'origin', 'main']);
    if (r.code !== 0) throw new Error(`fetch: ${(r.err || '').trim().slice(0, 300) || r.code}`);
    const res = await fn(gitDir);
    const peak = dirBytes(dir);
    if (peak > state.scaffoldPeakBytes) state.scaffoldPeakBytes = peak;
    return res;
  } finally {
    // ⛔ THE INVARIANT LIVES IN THIS `finally`. Every exit path removes the
    // scaffolding — success, throw, or a batch cut short — because a scaffold
    // that survives one failure is a scaffold that accumulates the corpus a
    // second time over the following passes.
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* next batch retries */ }
  }
}

/**
 * Work out what the box is missing, WITHOUT downloading any of it.
 * Compares the remote tree's blob ids against locally-computed ones.
 */
async function plan() {
  state.phase = 'planning';
  try {
    const root = corporaRoot();
    const owed = await withScaffold(async (gitDir) => {
      const r = await git(['--git-dir', gitDir, 'ls-tree', '-r', '-l', 'FETCH_HEAD', SUBTREE]);
      if (r.code !== 0) throw new Error(`ls-tree: ${(r.err || '').trim().slice(0, 200) || r.code}`);
      const need = [];
      let seen = 0, held = 0;
      for (const line of r.out.split('\n')) {
        // <mode> blob <sha> <size>\t<path>
        const m = line.match(/^\d+ blob ([0-9a-f]{40})\s+(\d+)\t(.+)$/);
        if (!m) continue;
        const [, sha, size, p] = m;
        if (!p.endsWith('.json')) continue;
        seen++;
        // The repo path is `corpora/academic/...`; locally `corpora` IS the root,
        // so the repo's own leading `corpora/` is dropped rather than nested.
        const local = path.join(root, p.replace(/^corpora\//, ''));
        if (blobShaOf(local) === sha) { held++; continue; }
        need.push({ p, sha, size: Number(size), local });
      }
      state.total = seen;
      state.have = held;
      return need;
    });
    _plan = owed;
    state.owed = owed.length;
    state.lastPlanAt = Date.now();
    state.phase = 'idle';
    return owed;
  } catch (e) {
    state.phase = 'error';
    state.lastErr = (e && e.message) || String(e);
    state.lastErrAt = Date.now();
    _plan = null;
    return null;
  }
}

/**
 * Pull at most `limit` owed files. One scaffold for the batch, destroyed after.
 */
async function pullBatch(limit = BATCH) {
  if (!_plan || !_plan.length) {
    const p = await plan();
    if (!p || !p.length) return { pulled: 0, owed: state.owed || 0 };
  }
  const batch = _plan.slice(0, limit);
  if (!batch.length) return { pulled: 0, owed: 0 };
  state.phase = 'pulling';
  let pulled = 0;
  try {
    await withScaffold(async (gitDir) => {
      for (const f of batch) {
        fs.mkdirSync(path.dirname(f.local), { recursive: true });
        // ⚠ Temp-name-then-rename INSIDE the destination directory: a rename is
        // only atomic within a filesystem, and a temp in the OS temp dir would
        // silently become a copy-then-delete across devices — which is both
        // non-atomic and, for a moment, a second copy of that file.
        const tmp = `${f.local}.tmp-${process.pid}`;
        const r = await git(['--git-dir', gitDir, 'cat-file', 'blob', f.sha], { toFile: tmp });
        if (r.code !== 0) {
          try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
          throw new Error(`cat-file ${f.p}: ${(r.err || '').trim().slice(0, 160) || r.code}`);
        }
        // ⛔ VERIFY BEFORE IT COUNTS. A blob that arrives truncated hashes
        // differently, and a corpus cell that parses but is short is exactly the
        // failure that reads as "she was taught it" forever after.
        if (blobShaOf(tmp) !== f.sha) {
          try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
          throw new Error(`checksum mismatch on ${f.p}`);
        }
        fs.renameSync(tmp, f.local);
        pulled++;
        state.pulledThisRun++;
        state.bytesThisRun += f.size;
        state.lastFile = f.p;
      }
    });
    _plan = _plan.slice(pulled);
    state.owed = _plan.length;
    state.lastPullAt = Date.now();
    state.phase = 'idle';
  } catch (e) {
    // Partial progress is kept — the files that landed are verified and real.
    _plan = _plan.slice(pulled);
    state.owed = _plan.length;
    state.phase = 'error';
    state.lastErr = (e && e.message) || String(e);
    state.lastErrAt = Date.now();
  }
  return { pulled, owed: state.owed };
}

// ── the auto lane ────────────────────────────────────────────────────────────
// ⛔ A SINGLE-FLIGHT GUARD, NOT A QUEUE. If a batch runs long the next tick must
// be skipped rather than stacked: overlapping batches would each build their own
// scaffold, and two scaffolds is the one thing this module exists to prevent.
async function tick() {
  if (_busy || !state.auto) return;
  _busy = true;
  try {
    const r = await pullBatch(BATCH);
    if (r.owed === 0 && state.phase !== 'error') {
      // Nothing owed. Stay armed but stop working — a re-plan on the next tick
      // is what notices an upstream change without polling the network hard.
      _plan = null;
    }
  } finally { _busy = false; }
}

function startAuto() {
  state.auto = true;
  if (_timer) return state;
  _timer = setInterval(tick, Math.max(1000, GAP_MS));
  if (_timer.unref) _timer.unref();
  tick();
  return state;
}

function stopAuto() {
  state.auto = false;
  if (_timer) { clearInterval(_timer); _timer = null; }
  if (state.phase === 'pulling') state.phase = 'idle';
  return state;
}

/** Dashboard-shaped snapshot. Every field is something the viewer renders. */
function corpusSyncState() {
  const root = corporaRoot();
  let onDisk = 0;
  try { onDisk = dirBytes(path.join(root, 'academic')); } catch { /* absent */ }
  return {
    auto: state.auto,
    phase: state.phase,
    total: state.total,
    have: state.have,
    owed: state.owed,
    pulledThisRun: state.pulledThisRun,
    mbThisRun: +(state.bytesThisRun / 1048576).toFixed(1),
    lastFile: state.lastFile,
    lastErr: state.lastErr,
    lastErrAgeMs: state.lastErrAt ? Date.now() - state.lastErrAt : null,
    onDiskMb: +(onDisk / 1048576).toFixed(1),
    // The invariant, as a number the page can show: how much transient
    // scaffolding this process has ever held at once, beside the one real copy.
    scaffoldPeakMb: +(state.scaffoldPeakBytes / 1048576).toFixed(1),
    copiesOnBox: state.copiesOnBox,
    batch: BATCH,
    gapMs: GAP_MS,
  };
}

module.exports = { plan, pullBatch, startAuto, stopAuto, corpusSyncState, corporaRoot };
