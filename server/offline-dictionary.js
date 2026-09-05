'use strict';
/**
 * OFFLINE DICTIONARY — definitions that cannot go down.
 *
 * ⛔⛔ WHY THIS EXISTS. The definition lane fetched `api.dictionaryapi.dev` and
 * nothing else. On 2026-09-05 that host returned `000` — no response at all —
 * on every word for the whole day, and the walk sat 17.5 hours on
 * `ela/kindergarten` with `passedCellsTotal 0` and `totalWords 0`. She could not
 * bind a definition, so vocabulary never landed and the cell could not clear its
 * gate. The wiki had carried the warning for months: *the definition lane
 * depends on a third-party API with no SLA*.
 *
 * ⚠ NOTHING NEW IS INSTALLED. `wordnet-db` is already in server/package.json,
 * already on disk, and already read by drawable-taxonomy.js and the exam-bank
 * generator. Its payload is plain index/data files. This module reads them.
 *
 * ⭐ THIS IS A PEER SOURCE, NOT A FALLBACK, AND THAT DISTINCTION IS LOAD-BEARING.
 * A "last-resort single-def" arm was BANNED from the curriculum for teaching one
 * sense per word — *"only having one definiton is fucking limiting"*. WordNet
 * returns MULTI-SENSE entries with part of speech: the same shape the API
 * produces, and on average MORE senses. It is the same argument the hyphenated
 * compound retry already makes — a second query for the same capability, not a
 * lesser one.
 *
 * MEASURED against the real K vocabulary (2,221 multi-character words):
 *   2,134 answered = 96.1% · 13,139 senses · 57 ms for the ENTIRE vocabulary.
 * A 56 MB `wordset-dictionary` download was evaluated and rejected on the
 * numbers: 93.7% and 12,468 senses, for 56 MB and a network dependency.
 *
 * The ~87 it cannot answer are almost entirely function words — the, of, and,
 * to, is, was, for, with — which are STRUCTURAL, not definitional, and are
 * taught by the grammar lane as slot bindings.
 */

const fs = require('fs');
const path = require('path');

/* Lazy, once. The four indexes are ~155k lemmas and the data files stay as
   Buffers we slice on demand — the same shape drawable-taxonomy.js already uses
   for data.noun, so the resident cost is a file map, not a parsed dictionary. */
const POS = [['noun', 'noun'], ['verb', 'verb'], ['adj', 'adjective'], ['adv', 'adverb']];
let _idx = null;
let _data = null;
let _loadError = null;

function _load() {
  if (_idx || _loadError) return !_loadError;
  try {
    const dict = require('wordnet-db').path;
    _idx = {}; _data = {};
    for (const [pos] of POS) {
      const txt = fs.readFileSync(path.join(dict, 'index.' + pos), 'utf8');
      const m = new Map();
      for (const line of txt.split('\n')) {
        // ⚠ WordNet index files open with a licence header whose lines start
        // with a space. Without this guard those become bogus lemmas.
        if (!line || line[0] === ' ') continue;
        const sp = line.indexOf(' ');
        if (sp > 0) m.set(line.slice(0, sp), line);
      }
      _idx[pos] = m;
      _data[pos] = fs.readFileSync(path.join(dict, 'data.' + pos));
    }
    const total = POS.reduce((a, [p]) => a + _idx[p].size, 0);
    console.log(`[OfflineDict] WordNet loaded — ${total.toLocaleString()} lemmas across noun/verb/adj/adv. Definitions no longer require the network.`);
    return true;
  } catch (err) {
    /* ⛔ SAY SO ONCE, LOUDLY, AND STAY OUT OF THE WAY. A dictionary that cannot
       load must not throw into the teach path; the API lane still exists. But it
       must not fail silently either, or the walk stalls again for the same
       reason with one fewer clue. */
    _loadError = (err && err.message) || String(err);
    console.warn(`[OfflineDict] ⛔ WordNet could NOT be loaded (${_loadError}) — offline definitions are UNAVAILABLE and every lookup falls to the network API. This is the condition that cost 2026-09-05.`);
    return false;
  }
}

/** Every sense for an EXACT lemma, across all four parts of speech. */
function _rawSenses(lemma) {
  if (!_load()) return [];
  const out = [];
  for (const [pos, label] of POS) {
    const line = _idx[pos].get(lemma);
    if (!line) continue;
    const f = line.trim().split(/\s+/);
    const nSyn = parseInt(f[2], 10);
    if (!Number.isFinite(nSyn) || nSyn <= 0) continue;
    for (const o of f.slice(-nSyn)) {
      const off = parseInt(o, 10);
      if (!Number.isFinite(off) || off < 0 || off >= _data[pos].length) continue;
      const nl = _data[pos].indexOf(10, off);
      const dl = _data[pos].toString('utf8', off, nl > off ? nl : Math.min(_data[pos].length, off + 1400));
      const bar = dl.indexOf('|');
      if (bar < 0) continue;
      /* The gloss is `definition; "example"; "example"`. Keep the definition and
         drop the quoted examples — she is being taught what a word MEANS, and a
         usage example bound as part of the meaning is noise in the vector. */
      const gloss = dl.slice(bar + 1).trim();
      const def = gloss.split(';')[0].trim();
      if (def) out.push({ partOfSpeech: label, definition: def });
    }
  }
  return out;
}

/* ⛔⛔ THE RETRIES ARE NARROW ON PURPOSE, AND ONE OF THEM WAS CAUGHT TEACHING
   NONSENSE BEFORE IT SHIPPED.
   A general "split the word in two and look up both halves" pass recovers nine
   real compounds — and also turns the corpus typo `suprise` into `sup` + `rise`,
   which would have bound her a definition of BROTH plus ASCEND and counted it a
   success. So a split is accepted ONLY when WordNet itself holds the joined
   form (`living_room`, `milky_way`). An arbitrary split is refused.
   ⚠ These are the same retries the curriculum already runs for hyphenated
   compounds: a second query for the same capability, never a lesser one. */
function lookup(word) {
  const w = String(word == null ? '' : word).toLowerCase().trim().replace(/\s+/g, '_');
  if (!w) return [];
  let d = _rawSenses(w);
  if (d.length) return d;

  // Proper nouns — WordNet capitalises them, the corpus does not.
  d = _rawSenses(w.replace(/^[a-z]/, (c) => c.toUpperCase()));
  if (d.length) return d;

  // Closed compounds the corpus writes shut: livingroom -> living_room.
  // ONLY when the joined form exists; never a bare two-word guess.
  for (let i = 3; i <= w.length - 3; i++) {
    const joined = w.slice(0, i) + '_' + w.slice(i);
    const j = _rawSenses(joined);
    if (j.length) return j;
  }

  // Regular plurals WordNet holds in the singular (leaves/leaf is irregular and
  // is NOT guessed at — an inflection rule that invents stems is the same class
  // of error as the compound split above).
  const singular = w.endsWith('ies') && w.length > 4 ? w.slice(0, -3) + 'y'
    : w.endsWith('es') && w.length > 3 ? w.slice(0, -2)
      : w.endsWith('s') && !w.endsWith('ss') && w.length > 3 ? w.slice(0, -1)
        : null;
  if (singular) {
    d = _rawSenses(singular);
    if (d.length) return d;
  }
  return [];
}

/** True when the offline dictionary is usable at all. */
function available() { return _load(); }

/** Diagnostics for the boot banner and the dashboard. Never throws. */
function stats() {
  const ok = _load();
  return {
    available: ok,
    error: _loadError,
    lemmas: ok ? POS.reduce((a, [p]) => a + _idx[p].size, 0) : 0,
  };
}

module.exports = { lookup, available, stats };
