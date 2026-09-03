// perceive-corpus-figures.mjs — TURN EVERY CORPUS FIGURE INTO WAVELET COEFFICIENTS.
//
// ⛔⛔ WHY THIS EXISTS: the corpus carried 38,320 figure REFERENCES and ZERO
// coefficients. The figure queue and the background drain were both built, and
// neither had ever run a single tick — `figure-queue.db` did not exist on disk.
// The visual store held 410 records, every one a `reference-lookup` from an
// earlier day, not one key beginning `fig:`. Building the lane is not the same
// as running it, and a reference is not a percept.
//
// It does NOT need the brain up and does not disturb the frozen walk. It uses
// the SAME two stages the real perception path uses, called directly:
//   1. `_decodeImageToRGBA` from the live visual-memory mixin — the production
//      decoder, jpeg + png + the new in-repo VP8/webp path.
//   2. `equationalizeImageData` from js/brain/mindspace/transform.js — the CDF
//      9/7 forward transform, the exact function `perceive` runs on CPU.
// Harnessing the production wiring rather than reimplementing it is deliberate:
// a stand-in proves the stand-in works.
//
// ⭐ FULL RESOLUTION. No downsample anywhere in here. The 320px cap that used to
// sit in front of the transform destroyed the fine subbands that carry a
// one-pixel axis label, and those cannot be recovered later from the record.
//
// RESUMABLE AND IDEMPOTENT: the row key is `fig:` + a hash OF THE URL, so a
// re-run skips what is already stored and no figure is ever counted twice. Kill
// it and restart it freely.
//
// ⛔ THE LINK TRAVELS WITH THE ROW. Every record carries its own alt, caption,
// the corpus prose that REFERENCES it, and the cell it belongs to. Nothing here
// reads "whatever is currently being taught" — binding a percept to ambient
// state is the defect that once made a webcam placeholder become her memory of
// a word.
//
// RUN:  node .claude/scripts/perceive-corpus-figures.mjs [--concurrency N] [--limit N] [--out PATH]
// Network required. Node 18+.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Worker, isMainThread, parentPort, workerData, threadId } from 'worker_threads';
// ⭐ The failure ledger lives in its own module because this file could not be
// edited while it was running — its batch loop respawns `node` every batch, so
// an edit would have landed mid-run. It was written and harnessed standalone
// first, then wired in here once the run was stopped.
import { execFileSync } from 'child_process';
import { FailureLedger, retrySet } from './figure-failure-ledger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const UA = 'UnityBrainCurriculum/1.0 (educational research; https://www.unityailab.com; contact@unityailab.com)';

// Node has no ImageData; the server polyfills it at boot and the transform's
// reconstruct path constructs one. Same structural polyfill, installed before
// anything imports the transform.
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(a, b, c) {
      if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
      else { this.data = a; this.width = b; this.height = c; }
    }
  };
}

// ⭐ THE KEY RULE AND THE FORMAT RULE COME FROM THE REPOSITORY, NOT FROM HERE.
// Both used to be written out in this file, and both had copies elsewhere — five
// of the key rule, two of the format rule, and the two format copies did not
// hold the same list. They could not be merged while this producer was running,
// because its batch loop respawns `node` every batch and an edit would have
// landed mid-run. The run has ended, so the duplicates are gone.
//
// ⚠ Importing rather than copying is what makes the field on disk and the field
// the brain looks for provably the same address. A field produced under one copy
// of the hash and read under another is simply invisible, with no error anywhere.
import {
  figKey, bareKey as bare, shardName, isUndecodableFigure,
} from '../../js/brain/figure-identity.cjs';

// ⛔ THE IMPORT ABOVE IS AT MODULE SCOPE FOR A REASON THAT COST A RUN. `bare` and
// `shardName` once lived inside the `isMainThread` branch, so every worker threw
// a ReferenceError that the surrounding catch filed as `transformFail` — 115 of
// 120 figures "failed to transform" when the transform was never reached. This
// file is its own worker entry point, so anything both halves use must be
// resolvable in both.

// ── Forgejo generic package registry ─────────────────────────────────────────
// ⛔⛔ WHY NOT GIT, MEASURED: a field averages ~7 MB and there are 31,572 of
// them — 211 GB. Git stores its own compressed copy of every blob, so a git
// repository needs the working tree PLUS `.git`, about 420 GB, against 218 GB
// free here and a 500 GB box that already carries Forgejo and the brain. Worse,
// git never forgets: regenerating after any fidelity change leaves the old 211 GB
// in history permanently, and that is not undone by deleting files.
//
// The generic registry is the right medium for exactly this — large immutable
// artifacts, addressed by URL, no history. Each field is uploaded as it is made
// and DELETED locally straight after, so the local peak is one batch instead of
// the whole set, and only ONE copy ever exists.
//
// ⚠ The brain still needs no list of URLs. The package path is derived the same
// way the filename is: `figKey(the figure's own url)`, and those urls are already
// in the corpus. `PUT|GET /api/packages/<owner>/generic/<pkg>/<ver>/<key>.field.json`.
const FORGEJO_HOST = process.env.FORGEJO_HOST || 'https://git.unityailab.com';
const PKG_OWNER = process.env.FORGEJO_PKG_OWNER || 'UnityAILab';
const PKG_NAME = process.env.FORGEJO_PKG_NAME || 'brainwaves';
const PKG_VER = process.env.FORGEJO_PKG_VERSION || 'v1';
const pkgUrlFor = (key) => `${FORGEJO_HOST}/api/packages/${PKG_OWNER}/generic/${PKG_NAME}/${PKG_VER}/${bare(key)}.field.json`;

// The token lives in `.claude/.env` (gitignored) so it never reaches a
// transcript, a commit or a log line.
function readToken() {
  if (process.env.FORGEJO_TOKEN) return process.env.FORGEJO_TOKEN.trim();
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.claude', '.env'), 'utf8');
    const m = txt.match(/^\s*FORGEJO_TOKEN\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* absent */ }
  return null;
}

// ── every figure in the corpus, with the text that references it ─────────────
// ⛔⛔ ONE PERCEPT PER UNIQUE IMAGE, BUT EVERY CITATION OF IT IS KEPT.
//
// The same plate is legitimately cited by more than one cell, and the first cut
// of this deduped by URL and kept only the FIRST citation — which silently threw
// away the other cell's referencing prose. That is precisely the text↔image
// synchronisation this whole pass exists to produce: the picture is worth
// nothing to her unless it is bound to the words that point at it, and a plate
// cited twice has TWO sets of those words.
//
// So the image is fetched and transformed once (transforming it twice would be
// waste), and the row carries a `links[]` array with every (subject, grade,
// theme, alt, caption, context) that cites it. 32,296 unique images across
// 38,320 citations — that 6,024 difference is the number of links the first
// version would have dropped.
function collectFigures() {
  const byKey = new Map();
  // ⛔⛔ REFUSED BEFORE A SOCKET IS OPENED, WHICH IS THE POINT. These formats have
  // no decoder anywhere in the path, so every pass this producer ever made spent
  // a fetch — and for the animated ones a MediaWiki rendition round-trip on top
  // — to learn the same thing again. Measured: 193 distinct figures, **0 of which
  // ever produced a field** across 15 passes. That is pure contribution to the
  // decay curve, and it is removed by asking the rule instead of the network.
  let undecodable = 0;
  const root = path.join(ROOT, 'corpora', 'academic');
  for (const sub of fs.readdirSync(root)) {
    const sd = path.join(root, sub);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const f of fs.readdirSync(sd)) {
      if (!f.endsWith('.json')) continue;
      const grade = f.replace(/\.json$/, '');
      let d;
      try { d = JSON.parse(fs.readFileSync(path.join(sd, f), 'utf8')); } catch { continue; }
      for (const e of (d.experiences || [])) {
        for (const g of (e.figures || [])) {
          const url = g.url || g.src;
          if (!url || !/^https?:/i.test(url)) continue;
          if (isUndecodableFigure(url)) { undecodable++; continue; }
          const key = figKey(url);
          const link = {
            subject: sub, grade,
            theme: e.theme || null,
            source: e.source || null,
            licence: e.licence || null,
            alt: g.alt || null,
            caption: g.caption || null,
            context: g.context || null,
          };
          const cur = byKey.get(key);
          if (cur) cur.links.push(link);
          else byKey.set(key, { key, url, links: [link] });
        }
      }
    }
  }
  // ⛔⛔ SITE FURNITURE IS EXCLUDED STRUCTURALLY, NOT BY A LIST OF NAMES.
  //
  // An encyclopedia page carries icons: the "citation needed" question book,
  // ambox warning triangles, the Wikipedia W, portal badges, OpenStax's
  // "interactive" stamp. They arrive through the same figure field as real
  // illustrations, and they are POISON rather than merely waste —
  // `Question_book-new.svg` is cited by 203 DISTINCT THEMES across 18 subjects,
  // so perceiving it once binds a UI icon to 203 unrelated concepts.
  //
  // The signal is repetition, not vocabulary: a real illustration belongs to one
  // discussion. Measured over the whole corpus — 31,251 images cited by exactly
  // one theme, 996 by two to four, and then a cliff to 49 images cited by five
  // or more, EVERY ONE of which is furniture. The same repetition rule the
  // cs-textbook fetcher already uses for page chrome, applied one level up.
  // No word list, so a new icon nobody has seen is caught on its behaviour.
  const CHROME_THEMES = Number(process.env.FIG_CHROME_THEMES) > 0 ? Number(process.env.FIG_CHROME_THEMES) : 5;
  const all = [...byKey.values()];
  const kept = [], chrome = [], unanchored = [];
  for (const f of all) {
    const themes = new Set(f.links.map((l) => `${l.subject}/${l.theme}`)).size;
    if (themes >= CHROME_THEMES) { chrome.push({ ...f, themes }); continue; }
    // ⛔ A FIGURE WITH NO WORDS ATTACHED IS NOT PERCEIVED, because the standing
    // rule is that every illustration must be trained CONNECTED to the text that
    // references it. With no caption, no in-text reference and only a stub alt
    // ("flag"), there is nothing for the percept to bind TO — storing it spends
    // the transform and banks an image bound to nothing, which is the precise
    // shape of the poisoning an unanchored frame causes. Counted and reported,
    // never silently dropped.
    const anchored = f.links.some((l) => (l.context && l.context.length >= 40)
      || (l.caption && l.caption.length >= 40)
      || (l.alt && l.alt.length >= 15));
    if (!anchored) { unanchored.push(f); continue; }
    kept.push({ ...f, themes });
  }
  // Named, never silent — a filter that cannot be audited is a filter nobody trusts.
  if (chrome.length) {
    console.log(`[figures] excluded ${chrome.length} images as site furniture (cited by >= ${CHROME_THEMES} distinct themes):`);
    for (const c of chrome.sort((a, b) => b.themes - a.themes).slice(0, 10)) {
      console.log(`             ${String(c.themes).padStart(4)} themes  ${decodeURIComponent(c.url.split('/').pop().split('?')[0]).slice(0, 60)}`);
    }
    if (chrome.length > 10) console.log(`             ... and ${chrome.length - 10} more`);
  }
  if (unanchored.length) {
    console.log(`[figures] skipped ${unanchored.length.toLocaleString()} figures with NO anchor text `
      + '(no caption, no in-text reference, no substantive alt) — an illustration bound to nothing teaches nothing');
  }
  // Named, never silent: a figure this pass will not even attempt has to say so,
  // or the next reader counts it as a failure the retry pass should chase.
  if (undecodable) {
    console.log(`[figures] refused ${undecodable.toLocaleString()} figure citations up front — no decoder for the format `
      + '(a fetch could only ever confirm that again)');
  }
  return kept;
}

if (isMainThread) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  // ⛔⛔ THE FIELDS LIVE IN THE DATA REPO AND NOWHERE ELSE.
  //
  // Operator: *"just make sure you arnt storing the fields in both repos thay go
  // in brain waves repo. and only get pulled to the brain box on freshwalk and
  // will always copy over them selves as to only ever have one copy on the box
  // and one in forgejo"*.
  //
  // ⛔ THE OLD DEFAULT WAS `server/corpus-figures.db` — INSIDE THIS CODE REPO —
  // and that is exactly how **1.19 GB of field blobs across 68 files** ended up
  // in this repository's history, on a remote that is PUBLIC. The path is
  // gitignored now, so a repeat could no longer be committed, but a default that
  // writes a second copy onto the same disk is still the wrong default: it makes
  // "which one is real" a question, and the answer would drift.
  //
  // The default is now the data repo. `--out` still overrides for a one-off, and
  // the guard below refuses any target inside this repository whatever is passed.
  const DEFAULT_OUT = path.resolve(ROOT, '..', 'BrainWaves');
  const OUT = path.resolve(arg('--out', DEFAULT_OUT));
  // ⛔ A REFUSAL, NOT A WARNING. Writing fields into the code tree is the one
  // mistake this script must not be able to make twice, and a warning scrolls
  // past on a run that takes hours.
  const rel = path.relative(ROOT, OUT);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    console.error(`[figures] REFUSING to write fields inside the code repository (${OUT}).`);
    console.error('[figures] The fields belong in the data repo and nowhere else — one copy in Forgejo,');
    console.error('[figures] one on the brain box, none here. Pass --out <data repo> or leave it unset.');
    process.exit(2);
  }
  const LIMIT = Number(arg('--limit', 0)) || 0;
  // Each figure is a network fetch followed by a heavy single-threaded CDF 9/7
  // transform, so the two overlap and the transform is what saturates. Use the
  // machine minus two threads for the OS and whatever else is running.
  // ⚠ The old cap of 8 was arbitrary and left half a 16-thread box idle.
  const CONC = Number(arg('--concurrency', 0)) || Math.max(2, (os.cpus().length || 4) - 2);

  // ⛔⛔ ONE FILE PER FIELD, NOT ONE DATABASE — because the brain must be able to
  // pull ONE figure without downloading the set.
  //
  // A single sqlite file is the right shape for a local store and the WRONG shape
  // for a hosted one: nothing can fetch record 14,203 out of a 130 GB file over
  // HTTP. Individually-addressable files mean the coefficients live in exactly
  // ONE place (Forgejo) and the box streams a field when it teaches that figure,
  // instead of cloning the whole set back onto the same disk Forgejo is on.
  // This is also the layout the working 3D-brain corpus already uses — 24,675
  // separate `*.field.json` files — so it is a proven shape, not a new idea.
  //
  // Sharded two characters deep off the key: ~32,200 files over 36 shards keeps
  // any single directory small enough for git, rsync and a filesystem to handle.
  //
  // ⚠ NO URL LIST ANYWHERE, which is the constraint that kills naive designs.
  // The filename IS `figKey(url)` — a hash of the figure's own URL — and those
  // URLs already live in the corpus JSON. The brain derives the path from the
  // corpus entry it is teaching. Nothing is enumerated; 20,000 hardcoded URLs
  // never have to exist.
  const FIELDS = path.join(OUT, 'fields');
  fs.mkdirSync(FIELDS, { recursive: true });
  // ⛔ THE `fig:` PREFIX MUST NOT REACH A FILENAME. `figKey` returns `fig:<hash>`
  // because that is the shape the live visual store keys on — but a colon is
  // ILLEGAL in a Windows filename and NTFS silently treats it as an
  // alternate-data-stream separator, so `fig:abc.field.json` produced a stream
  // hanging off a file called `fig` and zero usable output, without the write
  // ever failing the way a real error would. Same family as the extensionless
  // binary trap this project already recorded: a path that is valid on one
  // platform and means something else entirely on another.
  const shardOf = shardName;
  const fileFor = (key) => path.join(FIELDS, shardOf(key), `${bare(key)}.field.json`);

  // ⛔ UPLOAD MODE CHANGES WHAT "ALREADY DONE" MEANS. When fields are deleted
  // locally after upload, the disk cannot be the record of what exists — so an
  // append-only ledger of uploaded keys is, and it is read back on resume. A run
  // that judged completeness by local files would redo the entire set every time.
  const UPLOAD = argv.includes('--upload');
  const TOKEN = UPLOAD ? readToken() : null;
  if (UPLOAD && !TOKEN) {
    console.error('[figures] --upload needs a token. Put `FORGEJO_TOKEN=<token>` in .claude/.env '
      + '(gitignored) or set it in the environment. Generate one at '
      + `${FORGEJO_HOST}/user/settings/applications with the write:package scope.`);
    process.exit(2);
  }
  const LEDGER = path.join(OUT, 'uploaded.jsonl');
  // The two ledgers are twins and neither is optional: one records what was
  // produced, the other records what refused to be. Only the first existed for
  // the run that decayed, which is why nothing could ever stop retrying a 404.
  const FAILURES = path.join(OUT, 'failures.jsonl');

  const all = collectFigures();
  // ⛔⛔ THE LEDGER IS ALWAYS THE RECORD, NOT THE DISK — because the delivery
  // pipeline DELETES each field locally once it has been pushed to LFS, to keep
  // the working tree bounded. A resume that asked the disk "is this field here?"
  // would answer no for everything already delivered and regenerate all 31,572
  // every run. Disk is still consulted as well, so a field that exists but was
  // never ledgered is not needlessly redone.
  const have = new Set();
  // ⛔⛔ `delivered.txt` IS THE AUTHORITY WHEN IT EXISTS, AND THE LEDGER IS NOT.
  //
  // The ledger records a field the moment it is WRITTEN. The delivery pipeline
  // does not push until a whole batch is built, so between those two points a
  // field is "done" on paper and absent from the remote — and a kill in that
  // window makes a resume SKIP it, permanently. Measured live: 954 ledgered
  // against 37 actually committed, so 917 fields were one interruption away
  // from being silently lost.
  //
  // The pipeline writes `delivered.txt` from `git ls-files` before each batch,
  // so it lists exactly what the repository really holds. Written-but-not-pushed
  // is then correctly treated as NOT done and simply regenerated.
  const DELIVERED = path.join(OUT, 'delivered.txt');
  // ⛔⛔ THE AUTHORITY IS REFRESHED HERE, BECAUSE A STALE AUTHORITY IS WORSE THAN
  // NO AUTHORITY. `delivered.txt` used to be written by the shell pipeline that
  // drove this producer, so it was only ever as current as the last batch that
  // pipeline completed — and when that pipeline was stopped the file froze.
  //
  // Measured at the moment this was written: the file listed **26,238** keys
  // while the repository actually tracked **26,359**, so a resume would have
  // re-fetched, re-decoded and re-transformed **121 figures that were already
  // delivered** — silently, and reported as progress. That is the same defect
  // class as the counter this pass also fixes: an instrument describing a
  // previous state of the world while being read as the current one.
  //
  // ⚠ READ-ONLY. `git ls-files` only lists the index; nothing here stages,
  // commits, moves or deletes anything in the delivery repository. That
  // restraint is deliberate — a chained git write against that tree has already
  // cost this project 23,782 deleted files once.
  const refreshDelivered = () => {
    try {
      const out = execFileSync('git', ['-C', OUT, 'ls-files', 'fields'], {
        encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
      });
      const keys = [];
      for (const line of out.split('\n')) {
        const m = line.trim().match(/([^/\\]+)\.field\.json$/);
        if (m) keys.push(m[1]);
      }
      if (!keys.length) return 0;
      fs.writeFileSync(DELIVERED, `${keys.join('\n')}\n`, 'utf8');
      return keys.length;
    } catch {
      // Not a git tree, or git is absent. The existing file still stands; it is
      // simply not refreshed, and the line below reports whatever it holds.
      return 0;
    }
  };
  const refreshed = refreshDelivered();

  let authoritative = false;
  try {
    const txt = fs.readFileSync(DELIVERED, 'utf8');
    for (const line of txt.split('\n')) { const k = line.trim(); if (k) have.add(`fig:${k}`); }
    authoritative = true;
    console.log(`[figures] resume source: delivered.txt — ${have.size.toLocaleString()} fields confirmed IN the repository`
      + (refreshed ? ' (regenerated from the index just now)' : ' (NOT refreshed — the delivery tree is not a git checkout here)'));
  } catch { /* no pipeline yet */ }
  if (!authoritative) {
    try {
      for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { const r = JSON.parse(line); if (r.key) have.add(r.key); } catch { /* a torn last line on a kill */ }
      }
    } catch { /* first run */ }
  }
  for (const f of all) {
    if (have.has(f.key)) continue;
    try { if (fs.statSync(fileFor(f.key)).size > 0) have.add(f.key); } catch { /* absent */ }
  }
  let todo = all.filter((f) => !have.has(f.key));

  // ⭐⭐ `--retry` — THE PASS THIS WHOLE REBUILD EXISTS FOR. Operator: *"we have to
  // figure out which figures errored and figure out why and redownload only the
  // failed figures correctly the 2nd pass"*.
  //
  // ⛔ WHAT THE DEFAULT PASS DOES WRONG WITHOUT IT: the todo list is "every
  // figure not yet delivered", which includes every figure that has already
  // failed permanently. That set only grows, so each pass spends proportionally
  // more of itself on URLs that cannot work — the measured 911 → 98 decay, a
  // success rate falling 61% → 8% while the run reported itself healthy.
  //
  // In this mode the list is the ledger's RETRYABLE set and nothing else:
  // permanent failures are never attempted, and a transient one that has already
  // been tried `maxAttempts` times is given up on — because "transient" is a
  // hypothesis, and without a cap a permanently-flaky host reproduces the exact
  // decay curve this mode exists to end, just more slowly.
  //
  // ⚠ THE COUNTS ARE PRINTED EVEN WHEN THEY ARE ZERO, and especially then. A
  // retry pass over an empty ledger must say the ledger is empty, not report
  // "nothing to do" — those read identically and mean opposite things.
  const RETRY = argv.includes('--retry');
  if (RETRY) {
    const sel = retrySet(FAILURES, { maxAttempts: Number(arg('--max-attempts', 3)) || 3 });
    console.log(`[figures] retry mode — ${sel.summary}`);
    if (!sel.total) {
      console.log('[figures] the failure ledger is EMPTY, which is not the same as "nothing failed".');
      console.log('[figures] it is written as failures happen, so it only holds passes that ran WITH it wired in.');
      console.log(`[figures] run a normal pass first; it will write ${FAILURES}.`);
      process.exit(0);
    }
    const wanted = new Set(sel.retry.map((r) => r.key));
    const byKey = new Map(all.map((f) => [f.key, f]));
    // ⚠ A ledger row whose key is no longer in the corpus is REPORTED, not
    // silently dropped: it means the corpus was re-ingested since the failure,
    // and a figure that quietly vanishes between the record and the retry is
    // exactly the kind of gap nobody goes looking for.
    const missing = [...wanted].filter((k) => !byKey.has(k));
    todo = [...wanted].filter((k) => byKey.has(k)).map((k) => byKey.get(k));
    if (missing.length) {
      console.log(`[figures] ${missing.length} ledger rows name figures no longer in the corpus — re-ingested since they failed; skipped.`);
    }
    console.log(`[figures] retrying ${todo.length.toLocaleString()} figures; `
      + `${sel.permanent.length.toLocaleString()} permanent and ${sel.givenUp.length.toLocaleString()} given-up are NOT being attempted.`);
  }
  // ⛔ `--limit` TAKES AN EVEN SPREAD, NOT THE FIRST N — because the first N is a
  // biased sample and it produced two wrong answers in a row. The list is in
  // corpus order, so `ap/` leads and every one of its figures is a large
  // Wikimedia photograph: the first-20 sample measured 17.8 MB/figure (a 562 GB
  // projection) while a host-stratified sample of the same corpus measured
  // 4 MB (130 GB). A calibration whose sample is ordered by subject is measuring
  // the subject, not the corpus.
  if (LIMIT && LIMIT < todo.length) {
    const stride = todo.length / LIMIT;
    const picked = [];
    for (let i = 0; i < LIMIT; i++) picked.push(todo[Math.floor(i * stride)]);
    todo = picked;
  }
  console.log(`[figures] corpus holds ${all.length.toLocaleString()} distinct figures`);
  console.log(`[figures] already on disk: ${have.size.toLocaleString()}   to do now: ${todo.length.toLocaleString()}   workers: ${CONC}`);
  console.log(`[figures] writing one field per figure under ${FIELDS}`);
  if (!todo.length) { console.log('[figures] nothing to do.'); process.exit(0); }

  const stats = { ok: 0, httpFail: 0, decodeFail: 0, transformFail: 0, tinyDrop: 0, uploadFail: 0, bytes: 0, coeffs: 0, px: 0 };
  // Append-only, flushed per batch. This ledger is the ONLY record of what has
  // been delivered once the local field is deleted, so it is written before the
  // counters are believed and never rewritten in place.
  const ledgerFd = fs.openSync(LEDGER, 'a');
  // ⭐⭐ THE FAILURE LEDGER — the twin of the line above, and the thing whose
  // absence turned a 32,296-figure run into a four-hour grind that stopped at
  // 26,457. `uploaded.jsonl` records SUCCESSES; without a failure record every
  // pass re-attempted every dead URL from every previous pass, and the delivered
  // yield fell 911 → 98 per pass while the run kept reporting itself healthy.
  const failLedger = new FailureLedger(FAILURES);
  const t0 = Date.now();
  let next = 0, done = 0, live = CONC;
  const indexRows = [];

  const report = () => {
    const el = (Date.now() - t0) / 1000;
    const rate = stats.ok / Math.max(1, el);
    const left = todo.length - done;
    const eta = rate > 0 ? left / rate : 0;
    const h = Math.floor(eta / 3600), m = Math.round((eta % 3600) / 60);
    console.log(`[figures] ${done.toLocaleString()}/${todo.length.toLocaleString()}  ok ${stats.ok.toLocaleString()}`
      + `  httpFail ${stats.httpFail}  decodeFail ${stats.decodeFail}  transformFail ${stats.transformFail}  tooSmall ${stats.tinyDrop}`
      + (UPLOAD ? `  uploadFail ${stats.uploadFail}` : '')
      // ⭐ THE SPLIT THAT DECIDES WHETHER ANOTHER PASS IS WORTH RUNNING, on
      // screen WHILE it runs rather than only in hindsight. A rising permanent
      // count with a flat transient count means the tail is dead and the next
      // pass will yield nothing — which is exactly the curve nobody could see.
      + (failLedger.counts.total
        ? `  |  fail ${failLedger.counts.permanent} permanent / ${failLedger.counts.transient} transient`
        : '')
      + `  |  ${(stats.bytes / 1048576).toFixed(0)} MB stored  ${(stats.coeffs / 1e6).toFixed(1)}M coefficients`
      + `  |  ${rate.toFixed(2)}/s  ETA ${h}h${String(m).padStart(2, '0')}m`);
  };

  const spawn = () => {
    const w = new Worker(fileURLToPath(import.meta.url), {
      workerData: {
        UA, FIELDS, UPLOAD, TOKEN,
        PKGBASE: `${FORGEJO_HOST}/api/packages/${PKG_OWNER}/generic/${PKG_NAME}/${PKG_VER}/`,
      },
    });
    const feed = () => {
      if (next >= todo.length) { w.postMessage(null); return; }
      w.postMessage(todo[next++]);
    };
    w.on('message', (msg) => {
      if (msg === 'ready') { feed(); return; }
      done++;
      if (msg.err) {
        // ⭐⭐ EVERY FAILURE IS WRITTEN DOWN, WITH ITS REASON, AS IT HAPPENS.
        //
        // ⛔ This is the line whose absence cost four hours. The counters below
        // are aggregates, they go to stdout, and the batch loop greps stdout down
        // to three patterns — so every REASON died at the pipe and every pass
        // re-attempted every dead URL from every previous pass. The delivered
        // yield fell 911 → 98 per pass while the run "worked".
        //
        // ⚠ Non-fatal by construction: a ledger that could break the producer
        // would be worse than no ledger.
        try {
          failLedger.record({
            key: msg.key, url: msg.url, stage: msg.stage,
            status: msg.status, message: msg.msg,
          });
        } catch { /* the ledger must never be able to stop the run */ }
        if (msg.stage === 'http') stats.httpFail++;
        else if (msg.stage === 'decode') stats.decodeFail++;
        else if (msg.stage === 'tiny') stats.tinyDrop++;
        else if (msg.stage === 'upload') {
          stats.uploadFail++;
          // An auth failure is not a per-figure problem and retrying 31,000 times
          // would just be a slow way of printing the same thing, so say it once
          // and loudly the first time it happens.
          if (stats.uploadFail === 1) console.warn(`[figures] UPLOAD FAILED (${msg.msg}) — if this is 401/403 the token lacks write:package`);
        } else stats.transformFail++;
      } else {
        // ⭐ THE WORKER ALREADY WROTE THE FILE. The field is ~4.7 MB and posting
        // it here would structured-CLONE every byte across the thread boundary —
        // 143 GB of copying over the run, serialised through the one thread that
        // must stay responsive, for a string this thread only writes to disk.
        // The worker owns the write; this side keeps counters and the index.
        stats.ok++; stats.bytes += msg.bytes;
        stats.coeffs += msg.coeffs; stats.px += msg.px;
        const row = { key: msg.key, file: `fields/${shardOf(msg.key)}/${bare(msg.key)}.field.json`, url: msg.url, w: msg.w, h: msg.h, coeffs: msg.coeffs, citations: msg.citations };
        row.bytes = msg.bytes;
        if (UPLOAD) row.pkg = pkgUrlFor(msg.key);
        // Written before the counters are trusted: this line is the ONLY proof
        // the field was produced once the local copy is gone.
        fs.writeSync(ledgerFd, `${JSON.stringify(row)}\n`);
        indexRows.push(row);
      }
      if (done % 100 === 0) report();
      feed();
    });
    w.on('error', (e) => { console.warn('[figures] worker error:', e.message); });
    w.on('exit', () => {
      live--;
      if (live === 0) {
        report();
        // ⭐ THE INDEX IS WHAT REPLACES A LIST OF 20,000 URLS. It maps the key
        // the brain can DERIVE (a hash of the figure's own url, which is already
        // in the corpus) to the field's path. Small enough to live in git beside
        // the corpus, and merged with any previous run's index so a resumed or
        // partial pass never drops rows it is not responsible for.
        const idxPath = path.join(OUT, 'index.json');
        let prior = { fields: [] };
        try { prior = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch { /* first run */ }
        const merged = new Map((prior.fields || []).map((r) => [r.key, r]));
        for (const r of indexRows) merged.set(r.key, r);
        fs.writeFileSync(idxPath, `${JSON.stringify({
          version: 1,
          note: 'Corpus figure wavelet fields. One CDF 9/7 field per figure, at FULL source resolution. '
            + 'key = djb2 hash of the figure url (derivable from the corpus, never enumerated); file = path within this tree. '
            + 'Each field file carries its own alt, caption and the corpus prose that references it, plus every citation of it.',
          model: 'cdf97_wavelet_native_quantized',
          count: merged.size,
          fields: [...merged.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
        }, null, 1)}\n`, 'utf8');
        const el = (Date.now() - t0) / 1000;
        console.log(`[figures] DONE in ${(el / 3600).toFixed(2)} h — ${stats.ok.toLocaleString()} figures perceived at FULL resolution, `
          + `${(stats.coeffs / 1e6).toFixed(1)}M wavelet coefficients, ${(stats.bytes / 1073741824).toFixed(2)} GB of fields.`);
        console.log(`[figures] index: ${merged.size.toLocaleString()} fields listed in ${idxPath}`);

        // ⭐⭐ THE PASS REPORTS ITS OWN DELTA, AND THAT IS THE WHOLE FIX.
        //
        // ⛔ THE DEFECT THIS REPLACES: the shell loop driving this producer
        // measured progress as `find fields -name '*.field.json' | wc -l` — a
        // count of a DIRECTORY, taken BEFORE the previous batch's already-pushed
        // files were removed. So every batch line reported this batch plus the
        // previous one. Verified against the repository rather than inferred:
        //
        //     batch 1  logged +1219   real +1219   (no predecessor — the only honest line)
        //     batch 2  logged +2445   real +1226   1226 + 1219 = 2445
        //     batch 3  logged +2423   real +1197   1197 + 1226 = 2423
        //     batch 8  logged +2371   real +1176   1176 + 1195 = 2371
        //
        // The data was never wrong — only the instrument — but the same variable
        // was ALSO the loop's stop condition, so the loop ran one iteration past
        // completion, and the ETA reported off it was wrong by roughly double for
        // an entire day.
        //
        // ⭐ The number below cannot have that bug, because it is not a count of
        // anything on disk: `stats.ok` is incremented once per field this process
        // actually produced. A caller reads THIS instead of counting files, so
        // there is no directory for a future loop to miscount.
        const remaining = Math.max(0, all.length - (have.size + stats.ok));
        const summary = {
          at: new Date().toISOString(),
          mode: RETRY ? 'retry' : 'sweep',
          attempted: todo.length,
          written: stats.ok,               // the honest delta — this pass only
          corpusTotal: all.length,
          alreadyHeldAtStart: have.size,
          remainingAfterThisPass: remaining,
          failures: {
            permanent: failLedger.counts.permanent,
            transient: failLedger.counts.transient,
            unknown: failLedger.counts.unknown,
            byStage: {
              http: stats.httpFail, decode: stats.decodeFail, transform: stats.transformFail, tooSmall: stats.tinyDrop,
            },
          },
        };
        try { fs.writeFileSync(path.join(OUT, 'pass-summary.json'), `${JSON.stringify(summary, null, 1)}\n`, 'utf8'); } catch { /* reporting must not fail the pass */ }
        console.log(`[figures] this pass wrote ${stats.ok.toLocaleString()} NEW fields (delta, not a directory count). `
          + `${remaining.toLocaleString()} of ${all.length.toLocaleString()} still owed.`);
        // ⛔ A ZERO HERE IS THE REAL STOP SIGNAL, and it is stated as one. The old
        // loop tested a stale count, so on the pass that genuinely found nothing
        // it kept going for one more round and only then broke.
        if (stats.ok === 0) {
          console.log('[figures] STOP: this pass produced nothing new. '
            + (failLedger.counts.transient
              ? `${failLedger.counts.transient} transient failures were recorded — \`--retry\` is the next pass, not another sweep.`
              : 'No transient failures were recorded either, so another sweep would attempt the identical set.'));
        }
      }
    });
  };
  for (let i = 0; i < CONC; i++) spawn();
} else {
  // ── worker: fetch -> decode -> CDF 9/7, at full resolution ─────────────────
  const { createRequire } = await import('module');
  const { pathToFileURL } = await import('url');
  const require1 = createRequire(import.meta.url);
  const { SERVER_VISUAL_MEMORY_MIXIN: MIX } = require1(path.join(ROOT, 'server', 'brain-server', 'visual-memory.js'));
  const host = Object.assign({}, MIX);
  // ⛔ `import()` of an absolute Windows path fails — the ESM loader reads `C:`
  // as a URL scheme ("Received protocol 'c:'"). Forward-slashing the path is not
  // enough; it needs a real file:// URL. `require` is unaffected, which is why
  // only the ESM side of this worker broke.
  const { equationalizeImageData } = await import(pathToFileURL(path.join(ROOT, 'js', 'brain', 'mindspace', 'transform.js')).href);

  const UAH = { 'User-Agent': workerData.UA };
  // ⛔⛔ RETURNS WHY IT FAILED, NOT JUST `null`. This function used to swallow
  // the status and the exception and hand back a bare `null`, so the caller
  // could only report "http" — and that is precisely why a run could burn four
  // hours re-attempting dead URLs: **nothing downstream could tell a 404 from a
  // timeout**, so nothing could ever stop retrying the 404.
  //
  // ⚠ The internal 3-attempt retry ALSO hid an attempt count. A figure that
  // failed here had already been tried three times, and the ledger needs to know
  // that before it decides whether a fourth is worth anything.
  const grab = async (url) => {
    let lastStatus = 0, lastMsg = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { headers: UAH, signal: AbortSignal.timeout(45000) });
        if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()) };
        lastStatus = r.status; lastMsg = `HTTP ${r.status}`;
        // A fact about the file rather than a transient — stop immediately and
        // say so, so the ledger can mark it permanent and never come back.
        if (r.status === 404 || r.status === 410) return { status: r.status, message: `HTTP ${r.status}`, tries: attempt + 1 };
      } catch (e) {
        lastMsg = (e && e.message) || 'fetch threw';
      }
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    }
    return { status: lastStatus, message: lastMsg || 'no response after 3 attempts', tries: 3 };
  };

  // ⛔⛔ A VECTOR HAS NO PIXELS UNTIL SOMETHING CHOOSES A SIZE, so an SVG cannot
  // be perceived without being rendered — 1,752 corpus figures are SVG, and they
  // are the SCHEMATICS: the biology diagrams, the physics figures, the charts.
  // Silently dropping them would lose the most information-dense plates in the
  // corpus. This is not a downscale of a raster; there is no raster to reduce.
  //
  // ⚠ AND THE OBVIOUS CONSTRUCTED URL NO LONGER WORKS. Wikimedia used to render
  // any width via `/thumb/<a>/<ab>/<name>/<W>px-<name>.png`; it now returns 400
  // for an unlisted width — *"Use thumbnail sizes listed on w.wiki/GHai"* — at
  // EVERY width tried (320 through 2048). So the size is not guessed: the
  // MediaWiki API is asked, and it answers with a permitted rendition (a 2048
  // request came back snapped to 3840px, on the `thumb.wikimedia.org` host,
  // which no hand-built URL would have found). Only consulted when the direct
  // decode fails, so the raster path pays nothing for it.
  const renderable = (u) => /\.(svg|gif|tif|tiff)(\?|$)/i.test(String(u).split('?')[0] + (u.includes('?') ? '?' : ''));
  const wikiRendition = async (u) => {
    const clean = String(u).split('?')[0];
    const m = clean.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/(commons|[a-z-]{2,12})\/[0-9a-f]\/[0-9a-f]{2}\/(.+)$/i);
    if (!m) return null;
    const wiki = m[1] === 'commons' ? 'commons.wikimedia.org' : `${m[1]}.wikipedia.org`;
    const title = 'File:' + decodeURIComponent(m[2]).replace(/_/g, ' ');
    // ⚠ 1600, NOT 2048 — and the difference is measured, not stylistic. The API
    // honours 640/800/1024/1280/1600 exactly, but a request ABOVE the vector's
    // declared native size gets snapped up to a permitted giant: asking 2048 for
    // a 319x222 SVG returned a **3840px** render, which turned a flag icon into
    // 16.6 MP and a 2.6 MB field. A vector has no native resolution, so this
    // width is a choice by necessity; 1600 sits above what any of these figures
    // are printed at in their own books and in the same band as the rasters.
    const api = `https://${wiki}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime`
      + `&iiurlwidth=1600&titles=${encodeURIComponent(title)}`;
    try {
      const r = await fetch(api, { headers: UAH, signal: AbortSignal.timeout(30000) });
      if (!r.ok) return null;
      const j = await r.json();
      const pages = j && j.query && j.query.pages;
      for (const k of Object.keys(pages || {})) {
        const ii = (pages[k].imageinfo || [])[0];
        if (ii && ii.thumburl) return ii.thumburl;
      }
    } catch { /* the caller records an undecodable figure */ }
    return null;
  };

  parentPort.postMessage('ready');
  parentPort.on('message', async (job) => {
    if (job === null) { process.exit(0); }
    try {
      const got = await grab(job.url);
      const buf = got && got.buf;
      if (!buf || buf.length < 64) {
        // ⭐ THE URL, THE STATUS AND THE MESSAGE TRAVEL WITH THE FAILURE. Without
        // all three the ledger cannot classify, and a classifier that cannot
        // separate 404 from timeout is the decay curve all over again.
        parentPort.postMessage({
          err: 1, stage: 'http', key: job.key, url: job.url,
          status: (got && got.status) || 0,
          msg: (got && got.message) || (buf ? `only ${buf.length} bytes` : 'no body'),
          tries: (got && got.tries) || 0,
        });
        return;
      }

      let img = host._decodeImageToRGBA(buf);
      // ⛔⛔ THE SECOND CALL SITE OF `grab`, AND CHANGING ITS RETURN SHAPE BROKE
      // IT SILENTLY. When `grab` started returning `{buf, status, message}`
      // instead of a bare Buffer, this line still read `b2.length` — which is
      // `undefined` on an object, so the guard was always false and **EVERY
      // vector rendition failed without a word.** All 28 decode failures in the
      // first ledger the new code ever wrote were SVGs, which is what exposed it.
      // ⭐ A changed return shape must be chased to every caller, and a harness
      // that only exercises the happy path will not find the one that was missed.
      let renditionTried = false, renditionUrl = null, renditionErr = null;
      if (!img && renderable(job.url)) {
        renditionTried = true;
        renditionUrl = await wikiRendition(job.url);
        if (renditionUrl) {
          const got2 = await grab(renditionUrl);
          if (got2 && got2.buf && got2.buf.length > 64) img = host._decodeImageToRGBA(got2.buf);
          else renditionErr = (got2 && got2.message) || 'rendition fetch returned no body';
        } else {
          renditionErr = 'the wiki API offered no rendition for this file';
        }
      }
      if (!img) {
        // ⚠ NAME WHICH PATH FAILED. "decoder returned nothing" told the ledger
        // nothing it could classify, so 28 vector failures all landed in the
        // catch-all "no stated cause — may be a truncated download" bucket and
        // would have been retried forever.
        const why = renditionTried
          ? (renditionErr
            ? `no decoder for this format, and the rendition path failed: ${renditionErr}`
            : 'no decoder for this format, and its rendition did not decode either')
          : 'decoder returned nothing';
        parentPort.postMessage({ err: 1, stage: 'decode', key: job.key, url: job.url, msg: why });
        return;
      }
      // A plate under 32px on a side is a spacer or an icon, not an illustration
      // — transforming it wastes the pass and stores a percept of nothing.
      if (Math.max(img.w, img.h) < 32) { parentPort.postMessage({ err: 1, stage: 'tiny', key: job.key, url: job.url, msg: `too small: ${img.w}x${img.h}` }); return; }

      const rec = equationalizeImageData({ width: img.w, height: img.h, data: img.data });
      if (!rec || !rec.channels) { parentPort.postMessage({ err: 1, stage: 'transform', key: job.key, url: job.url, msg: 'transform produced no channels' }); return; }
      rec.fidelity = { psnr_db: null, source: 'corpus-figure' };

      // Split exactly the way the live store does: JSON skeleton + one binary
      // blob for the coefficient payload. Base64 inside JSON is a 4-chars-per-
      // 3-bytes tax that lands on RESIDENT memory, which is the axis that binds.
      // ⭐ SELF-CONTAINED FIELD FILE, byte-compatible with the corpus format the
      // working 3D-brain player already reads: `model`, `colorspace`, `wavelet`,
      // dims, and per-channel `keep`/`qscale`/`pos_enc`/`pos_b64`/`val_b64`.
      // Keeping the payload inline means a fetch of one field needs one request
      // and the file survives being copied anywhere.
      let coeffs = 0;
      const chans = {};
      for (const c of ['Y', 'Cb', 'Cr']) {
        const ch = rec.channels[c];
        chans[c] = { keep: ch.keep, qscale: ch.qscale, pos_enc: ch.pos_enc, pos_b64: ch.pos_b64, val_b64: ch.val_b64 };
        coeffs += ch.keep;
      }
      const entry = JSON.stringify({
        rec: { model: rec.model, colorspace: rec.colorspace, wavelet: rec.wavelet, width: rec.width, height: rec.height, pad_w: rec.pad_w, pad_h: rec.pad_h, equation_count: rec.equation_count, fidelity: rec.fidelity, channels: chans },
        at: Date.now(), seen: 1, conf: true,
        // ⛔ THE TEXT TRAVELS WITH THE PERCEPT — every citation of this image,
        // not just the first. `phrase` mirrors the live store's field name and
        // holds the primary referencing prose; `links[]` holds all of them with
        // their cell, theme, alt and caption. A percept that has to look up its
        // own meaning later is a percept bound to ambient state, which is the
        // defect that once made an unlabelled frame become her memory of a word.
        url: job.url,
        phrase: (job.links.find((l) => l.context && l.context.length >= 40) || job.links[0] || {}).context || null,
        links: job.links,
        citations: job.links.length,
      });
      // Written here, in the worker, so the main thread never has to hold or copy
      // a multi-megabyte field. Temp-name-then-rename: a kill mid-write must not
      // leave a truncated file that the resume check counts as complete.
      const b = bare(job.key);
      const dir = path.join(workerData.FIELDS, b.slice(0, 2).padEnd(2, '0'));
      const p = path.join(dir, `${b}.field.json`);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${p}.tmp-${process.pid}-${threadId}`;
      fs.writeFileSync(tmp, entry, 'utf8');
      fs.renameSync(tmp, p);

      // ⭐ UPLOAD THEN DELETE, so the local disk holds a working set and never the
      // whole 211 GB. The delete only happens on a CONFIRMED upload — losing a
      // field because a PUT failed quietly would be unrecoverable without
      // re-running the transform, and the ledger would then be lying about it.
      if (workerData.UPLOAD) {
        let up = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const r = await fetch(workerData.PKGBASE + b + '.field.json', {
              method: 'PUT',
              headers: { Authorization: `token ${workerData.TOKEN}`, 'Content-Type': 'application/json' },
              body: entry,
              signal: AbortSignal.timeout(180000),
            });
            // 201 created, 200 ok. 409 means this exact filename is already in
            // the package version — already delivered, which is success for a
            // resumed run, not an error to retry.
            if (r.status === 201 || r.status === 200 || r.status === 409) { up = r.status; break; }
            if (r.status === 401 || r.status === 403) { up = -r.status; break; }   // auth: retrying cannot help
          } catch { /* retried */ }
          await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        }
        if (up && up > 0) {
          try { fs.unlinkSync(p); } catch { /* the sweep will get it */ }
          parentPort.postMessage({ key: job.key, bytes: entry.length, coeffs, px: img.w * img.h, url: job.url, w: img.w, h: img.h, citations: job.links.length, uploaded: up });
        } else {
          parentPort.postMessage({ err: 1, stage: 'upload', key: job.key, url: job.url, msg: `PUT ${up || 'failed'}` });
        }
        return;
      }
      parentPort.postMessage({ key: job.key, bytes: entry.length, coeffs, px: img.w * img.h, url: job.url, w: img.w, h: img.h, citations: job.links.length });
    } catch (e) {
      parentPort.postMessage({ err: 1, stage: 'transform', key: job.key, url: job.url, msg: e && e.message });
    }
  });
}
