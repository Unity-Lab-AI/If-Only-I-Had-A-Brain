/**
 * MIND MOMENTS — the pop-ups over her brain that are not her inner voice.
 *
 * ⭐⭐ THE LINE IS HERS. THIS FILE WRITES NO ENGLISH AT ALL.
 *
 * Gee, verbatim: *"and fix the brain pop ups they arent fully complete and varied
 * and numerous it loooks like a half dozen scriped lines with like yes no
 * variables that switch and is pathetic"* — and, deciding the shape of the fix,
 * *"not the dynamic auto generated ones from her equations and need to be that"*.
 *
 * ⛔ WHAT THIS FILE USED TO BE, counted before it was replaced: three tables and a
 * switch producing **72 authored sentence shapes**, of which **61 were fixed
 * strings with nothing of hers in them** — twenty feelings with two or three
 * phrasings each, rotated by a turn counter. That is exactly what it looked like
 * from the outside: a half dozen scripted lines with the variables switching. No
 * amount of pacing or extra phrasings fixes it, because the sentences were not
 * hers.
 *
 * ⭐ Now the SERVER composes the line through `composeSentence` — the one path
 * every sentence she says goes through — seeded with the word the moment is
 * about, and publishes it as `state.mindMoment`. This file's whole job is to
 * decide whether that line is NEW and where to put it. The variety is however
 * many lines her own weights can make, and it grows as she is taught.
 *
 * ⚠ There is no fallback sentence here, deliberately. When she composes nothing
 * the server publishes nothing and no pop-up appears — the same honest silence
 * she gives everywhere else she speaks. A fallback phrase would put words in her
 * mouth again, which is the whole defect.
 *
 * Pacing lives on the server beside the composing (one moment per 25 s, the same
 * kind at most once per 3 min), so a walk's thousands of lesson events cannot
 * flood the page and this side needs no rhythm of its own.
 */

export class MindMoments {
  constructor() {
    this._lastTs = 0;
  }

  /**
   * The composed moment to show now, or null. A moment is shown once: it is new
   * only when its timestamp has moved, so the same line is never re-shown while
   * it sits in the state payload between composes.
   */
  nextFrom(state) {
    const m = state && state.mindMoment;
    if (!m || typeof m.line !== 'string' || !m.line.trim()) return null;
    const ts = Number(m.ts) || 0;
    if (!ts || ts <= this._lastTs) return null;
    this._lastTs = ts;
    return m;
  }

  /**
   * Where on the brain it appears. Derived from the word itself rather than from
   * a kind → region table: a table would need an entry for every label anyone
   * ever adds, and a missing entry silently parks every new kind of moment in the
   * same place. A word hashes to a stable spot, so moments spread out and the
   * same word always lands in the same place.
   */
  static anchor(moment, clusterCount = 16) {
    const w = String((moment && moment.about) || '');
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) { h ^= w.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return clusterCount > 0 ? (h % clusterCount) : 0;
  }

  /**
   * The two lines a pop-up shows: the word it is about, then her sentence. The
   * heading is HER word — not a phrase describing it — so nothing on screen is
   * written by anyone but her.
   */
  static text(moment) {
    const about = String((moment && moment.about) || '').trim();
    const line = String((moment && moment.line) || '').trim();
    return about ? `${about}\n› ${line}` : `› ${line}`;
  }
}
