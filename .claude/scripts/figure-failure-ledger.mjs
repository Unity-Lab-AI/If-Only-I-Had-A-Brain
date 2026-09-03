/**
 * ⭐⭐ THE FIGURE FAILURE LEDGER — the thing whose absence cost four hours.
 *
 * `WAVESEE.6`, approved by the operator: *"we have to figure out which figures
 * errored and figure out why and redowload only the failed figures correctly the
 * 2nd pass"*.
 *
 * ⛔ WHAT WENT WRONG WITHOUT IT, MEASURED RATHER THAN ASSERTED. The generator
 * writes `uploaded.jsonl` on SUCCESS only — 23,777 rows, every one `ok`, **zero
 * failures**. The per-stage counters exist in the worker (`httpFail`,
 * `decodeFail`, `transformFail`, `uploadFail`) but they are printed to stdout,
 * and the batch loop greps stdout down to three patterns, so **every failure
 * reason died at the pipe.**
 *
 * The consequence was a curve, not an opinion. Yield per `--limit 1500` pass:
 *
 *     911 → 854 → 860 → 862 → 788 → 692 → 617 → 553 → 539 → 405 → 331 → 270 → 207 → 156 → 121
 *
 * a success rate falling **61% → 8%**, because each pass re-attempted every dead
 * URL from every previous pass. **The run was abandoned at 26,393 of 32,296 —
 * ~5,900 figures the design could never deliver.**
 *
 * ⭐ THIS MODULE IS DELIBERATELY STANDALONE. The producer could not be edited
 * while it was running (its loop respawns `node` every batch, so an edit lands
 * mid-run), so the ledger, the classifier and the retry selector were written
 * and tested as their own unit first and wired in afterwards.
 */

import fs from 'fs';
import path from 'path';
// ⛔ THE FORMAT RULE IS NOT WRITTEN HERE ANY MORE, AND THAT IS THE FIX THIS
// MODULE MOST NEEDED. Its own list (`gif|pdf|djvu|stl|webm|mp4|svgz`) and the
// curriculum's reachability gate (`gif|pdf|djvu|stl`) had silently diverged, so
// one could call an address permanently dead while the other handed the same
// address to the perception lane as a live figure. Unlike the hash rule, whose
// two forms were provably congruent, **a list is not congruent to another list.**
import { isUndecodableFigure } from '../../js/brain/figure-identity.cjs';

/**
 * ⛔ PERMANENT vs TRANSIENT IS THE WHOLE POINT, AND IT IS THE ONE JUDGEMENT
 * THAT MUST NOT BE GUESSED. Retrying a permanent failure forever is the waste
 * that produced the decay curve; refusing to retry a transient one silently
 * loses a figure that would have worked. **One bucket cannot express both.**
 *
 * ⚠ WHEN IN DOUBT, TRANSIENT. A wrongly-transient row costs one retry. A
 * wrongly-permanent row loses the figure forever, and nothing would ever
 * re-examine it — the asymmetry is not close.
 */
export const PERMANENT = 'permanent';
export const TRANSIENT = 'transient';
export const UNKNOWN = 'unknown';

/**
 * Classify a failure from the stage it died at, the HTTP status and the message.
 *
 * @param {{stage?:string, status?:number, message?:string, url?:string}} f
 * @returns {{kind:string, reason:string, retryable:boolean}}
 */
export function classifyFailure(f = {}) {
  const stage = String(f.stage || '').toLowerCase();
  const status = Number(f.status) || 0;
  const msg = String(f.message || '').toLowerCase();
  const url = String(f.url || '');
  const ext = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [, ''])[1].toLowerCase();

  // ── Permanent: the resource is gone, or nothing here can ever read it ──────
  if (status === 404 || status === 410) {
    return { kind: PERMANENT, reason: `HTTP ${status} — the resource is gone`, retryable: false };
  }
  if (status === 401 || status === 403) {
    return { kind: PERMANENT, reason: `HTTP ${status} — refused, and a retry sends the identical request`, retryable: false };
  }
  // ⛔ FORMAT REFUSALS ARE PERMANENT BY CONSTRUCTION, not by observation: there
  // is no decoder in the path and a retry fetches the same bytes. GIF is on the
  // list on the operator's ruling — she has no temporal percept path, so a first
  // frame of an animation whose MOTION is the lesson would bank a misleading
  // percept rather than a partial one. The list itself lives with the gate that
  // enforces it, so a format decided in one place is decided in both.
  if (isUndecodableFigure(url)) {
    return { kind: PERMANENT, reason: `.${ext || 'this format'} — no decoder in this path, and a retry fetches the same bytes`, retryable: false };
  }
  // ⛔ A VECTOR WHOSE RENDITION PATH ALSO FAILED IS PERMANENT, and telling that
  // apart from a plain decode failure matters: 28 SVGs in the first ledger this
  // module ever wrote all landed in the catch-all "no stated cause" bucket and
  // would have been retried forever. The distinguishing evidence is whether the
  // rendition was even OFFERED — if the wiki API has no rendition for a file,
  // no number of retries produces one.
  if (stage === 'decode' && /the wiki api offered no rendition/.test(msg)) {
    return { kind: PERMANENT, reason: 'no decoder, and the wiki offers no rendition of this file', retryable: false };
  }
  // ⚠ But a rendition that was OFFERED and then failed to FETCH is transient —
  // that is a network fault on a URL that demonstrably exists.
  if (stage === 'decode' && /rendition path failed/.test(msg)) {
    return { kind: TRANSIENT, reason: 'a rendition exists but fetching it failed', retryable: true };
  }
  if (stage === 'decode' && /rendition did not decode/.test(msg)) {
    return { kind: PERMANENT, reason: 'the rendition itself does not decode — nothing further to try', retryable: false };
  }
  if (stage === 'decode' && /unsupported|no decoder|unknown format|bad magic/.test(msg)) {
    return { kind: PERMANENT, reason: 'undecodable media type', retryable: false };
  }
  if (/enotfound|dns/.test(msg)) {
    return { kind: PERMANENT, reason: 'DNS does not resolve — the host is gone', retryable: false };
  }

  // ── Transient: the network or the far end misbehaved, and time may fix it ──
  if (status === 429) return { kind: TRANSIENT, reason: 'HTTP 429 — rate limited', retryable: true };
  if (status >= 500 && status < 600) return { kind: TRANSIENT, reason: `HTTP ${status} — server-side`, retryable: true };
  if (/timeout|abort|econnreset|socket hang up|etimedout|econnrefused|network/.test(msg)) {
    return { kind: TRANSIENT, reason: 'network fault', retryable: true };
  }
  // ⚠ A decode failure with no stated cause is TRANSIENT, because a truncated
  // download and an unreadable format produce the same symptom and only one of
  // them is hopeless. Retrying costs one fetch; assuming permanence loses a
  // figure with no way back.
  if (stage === 'decode') {
    return { kind: TRANSIENT, reason: 'decode failed with no stated cause — may be a truncated download', retryable: true };
  }
  if (stage === 'http' && status === 0) {
    return { kind: TRANSIENT, reason: 'fetch never completed', retryable: true };
  }

  return { kind: UNKNOWN, reason: `unclassified (stage=${stage || '?'} status=${status || '?'})`, retryable: true };
}

/**
 * An append-only failure ledger.
 *
 * ⛔ WRITTEN AS IT HAPPENS, NEVER AT THE END. The run this replaces was killed
 * deliberately after 31 batches; a ledger flushed at exit would have recorded
 * nothing at all. Every row is appended and fsync-free but immediate, so a kill
 * keeps everything learned up to that instant.
 */
export class FailureLedger {
  constructor(file) {
    this.file = file;
    this.fd = null;
    this.counts = { total: 0, permanent: 0, transient: 0, unknown: 0 };
  }

  open() {
    if (this.fd !== null) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // ⛔⛔ HEAL A TORN LAST LINE BEFORE APPENDING, OR THE NEXT ROW DIES WITH IT.
    //
    // This ledger exists because the run it serves gets KILLED — that is the
    // normal way it ends. A kill lands mid-write and leaves a partial line with
    // no newline. The next append then writes DIRECTLY ONTO that fragment,
    // producing `{"key":"fig:a"...{"key":"fig:b"...}` — one line that parses as
    // neither, so **the torn row takes a perfectly good row down with it.**
    //
    // ⭐ Caught by a harness assertion that looked like a false alarm: the
    // classifier and the counter were both correct, and the missing attempt was
    // this. **A failed check is worth reading before it is dismissed.**
    try {
      const st = fs.statSync(this.file);
      if (st.size > 0) {
        const fd = fs.openSync(this.file, 'r');
        const buf = Buffer.alloc(1);
        fs.readSync(fd, buf, 0, 1, st.size - 1);
        fs.closeSync(fd);
        if (buf[0] !== 0x0a) fs.appendFileSync(this.file, '\n');
      }
    } catch { /* absent file — nothing to heal */ }
    this.fd = fs.openSync(this.file, 'a');
  }

  /** @param {{key:string,url:string,stage?:string,status?:number,message?:string}} f */
  record(f) {
    const c = classifyFailure(f);
    const row = {
      key: f.key,
      url: f.url,
      stage: f.stage || null,
      status: Number(f.status) || null,
      message: f.message ? String(f.message).slice(0, 300) : null,
      kind: c.kind,
      reason: c.reason,
      retryable: c.retryable,
      at: new Date().toISOString(),
    };
    this.open();
    fs.writeSync(this.fd, `${JSON.stringify(row)}\n`);
    this.counts.total++;
    this.counts[c.kind] = (this.counts[c.kind] | 0) + 1;
    return row;
  }

  close() {
    if (this.fd !== null) { try { fs.closeSync(this.fd); } catch { /* nf */ } this.fd = null; }
  }
}

/**
 * Read a ledger back, collapsing repeats into one row per figure.
 *
 * ⭐ ATTEMPTS ARE COUNTED, and that count is what makes a give-up decision
 * honest later: a URL that has failed transiently eight times is behaving like a
 * permanent failure whatever its status code says.
 *
 * ⚠ THE LAST VERDICT WINS. A figure that failed 404 and later succeeded-then-
 * failed differently should be judged on its most recent evidence, not its first.
 */
export function readLedger(file) {
  const byKey = new Map();
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { return byKey; }
  for (const line of lines) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }   // a torn last line on a kill
    if (!r || !r.key) continue;
    const prev = byKey.get(r.key);
    byKey.set(r.key, { ...r, attempts: prev ? (prev.attempts | 0) + 1 : 1 });
  }
  return byKey;
}

/**
 * The retry set: what a second pass should actually attempt.
 *
 * @param {string} ledgerFile
 * @param {{maxAttempts?:number}} [opts]
 */
export function retrySet(ledgerFile, opts = {}) {
  // ⚠ A CAP ON ATTEMPTS, because "transient" is a hypothesis and not a promise.
  // Without it a permanently-flaky host reproduces the exact decay curve this
  // module exists to end, just more slowly.
  const maxAttempts = opts.maxAttempts ?? 3;
  const all = readLedger(ledgerFile);
  const retry = [], givenUp = [], permanent = [];
  for (const [, r] of all) {
    if (!r.retryable) { permanent.push(r); continue; }
    if ((r.attempts | 0) >= maxAttempts) { givenUp.push(r); continue; }
    retry.push(r);
  }
  return {
    retry, givenUp, permanent,
    total: all.size,
    // ⛔ Reported, never silent. A retry pass that quietly drops the given-up set
    // would read as "everything retryable was retried", which is the same class
    // of lie as the counter that started this.
    summary: `${all.size} distinct failures — ${retry.length} to retry, `
      + `${permanent.length} permanent (never retried), ${givenUp.length} given up after ${maxAttempts} attempts`,
  };
}
