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
 *
 * ⭐ SENSES COME BACK MOST-ATTESTED-FIRST, from WordNet's own `index.sense`
 * tag counts. Before that, `_rawSenses` walked parts of speech in a fixed
 * noun-verb-adjective-adverb order, so the headline sense of a verb-dominant
 * word was its noun reading — `be` led with the chemical element and `look`
 * with an expression on a face. Measured: **2,292 lemmas change their first
 * sense** (19.5% of the 11,754 that carry any frequency evidence); the other
 * 15,176 multi-sense lemmas have `tag_cnt` 0 throughout, tie under a stable
 * sort, and keep exactly the order they always had.
 *
 * ⚠ THIS DOES NOT CHANGE WHAT SHE LEARNS. The teach path binds every sense and
 * weights none of them by position — the index is used for a display label and
 * to defer diagnostics to the final iteration, nothing else. **The set is
 * identical; only the headline moves**, which is the single-string path she
 * answers "what does X mean?" from. So it needs no fresh walk.
 *
 * Cost, measured: **21.6 us per word** for the binary search, ~1 s across a
 * whole K→PhD vocabulary, and a **7.0 MB Buffer** held unparsed.
 */

const fs = require('fs');
const path = require('path');

/* Lazy, once. The four indexes are ~155k lemmas and the data files stay as
   Buffers we slice on demand — the same shape drawable-taxonomy.js already uses
   for data.noun, so the resident cost is a file map, not a parsed dictionary. */
const POS = [['noun', 'noun'], ['verb', 'verb'], ['adj', 'adjective'], ['adv', 'adverb']];
let _idx = null;
let _data = null;
let _sense = null;
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
    /* ⭐ THE SENSE INDEX — WordNet's own answer to "which meaning is the usual
       one". Held as a Buffer and BINARY-SEARCHED, never parsed into a Map, for
       the same reason the four data files are: the resident cost has to stay a
       file map. ⛔ That is not a style preference here — the neuron count is
       DERIVED AT BOOT FROM FREE HOST RAM, so a 207,235-entry resident Map would
       be paid for in neurons. The file is byte-sorted ascending (verified), so
       a search costs ~18 seeks and no allocation. */
    /* ⛔ ITS ABSENCE MUST NOT TAKE THE DICTIONARY DOWN. This read sits inside the
       same try as the four indexes, and a `wordnet-db` build that ships without
       `index.sense` would otherwise set `_loadError` and disable EVERY offline
       definition — trading a sense-ordering improvement for the exact outage
       this module was built to end. Caught separately: no sense index means no
       frequency signal, which means the POS-block order this file has always
       used. That is a missing INPUT, not a degraded capability. */
    try {
      _sense = fs.readFileSync(path.join(dict, 'index.sense'));
    } catch (e) {
      _sense = null;
      console.warn(`[OfflineDict] ⚠ index.sense unavailable (${(e && e.message) || e}) — definitions still work, but senses fall back to part-of-speech order, so the first sense of a verb-dominant word may be its noun reading.`);
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

/* ⛔⛔ "BE" MEANT BERYLLIUM, AND THE CAUSE WAS THE LOOP ORDER BELOW.
 *
 * `_rawSenses` walks `POS` in a fixed order — noun, verb, adjective, adverb — so
 * the first sense returned is a NOUN sense whenever the word has one, whatever
 * the word actually means in use. Measured across 80 words: the first sense came
 * back a noun **70 times** and a verb **once**. So `be` led with *"a light strong
 * brittle grey toxic bivalent metallic element"* — the chemical symbol — and
 * `look` with *"the feelings expressed on a person's face"*.
 *
 * ⚠ THE MULTI-SENSE PATH WAS NEVER WRONG. Every sense binds, so what she KNOWS
 * was complete. The damage is on the single-string path, which is what she SAYS
 * when asked what a word means.
 *
 * ⭐ THE ORDER COMES FROM WORDNET'S OWN EVIDENCE, NOT FROM A POS PREFERENCE.
 * `index.sense` carries a per-sense `tag_cnt` — how often that exact sense was
 * attested in the tagged corpora. `be`'s copula verb sense scores **10,742**
 * against a noun sense that scores nothing. ⛔ A blanket "prefer verbs" rule was
 * considered and refused: `look` and `be` are verb-dominant, but `net`, `hell`
 * and `america` are not, and a POS preference would break the 70 the current
 * order gets RIGHT. The data decides per word, which is the same rule the
 * drawable taxonomy already follows — no word lists, no hand-picked tables.
 *
 * ⭐⭐ AND IT IS SURGICAL BY CONSTRUCTION: **82.9% of WordNet senses have
 * `tag_cnt` 0** (171,845 of 207,235). For those words every sense ties, the sort
 * is stable, and the existing POS-block order is preserved exactly. **A word with
 * no evidence cannot be reordered by evidence**, so this can only change words
 * WordNet actually has a frequency answer for.
 */
function _senseTags(lemma) {
  /* Binary-search the byte-sorted `index.sense` for the block of lines beginning
     `lemma%`, and return offset -> tag_cnt. Line format:
       sense_key  synset_offset  sense_number  tag_cnt
     where sense_key is `lemma%ss_type:lex_filenum:lex_id:head_word:head_id`. */
  const out = new Map();
  if (!_sense) return out;
  const key = Buffer.from(lemma + '%', 'utf8');
  let lo = 0, hi = _sense.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    // step back to the start of this line
    let s = mid;
    while (s > 0 && _sense[s - 1] !== 10) s--;
    const e = _sense.indexOf(10, s);
    const line = _sense.subarray(s, e < 0 ? _sense.length : e);
    if (Buffer.compare(line.subarray(0, key.length), key) < 0) {
      lo = (e < 0 ? _sense.length : e) + 1;
      if (lo <= mid) break;   // no forward progress — bail rather than spin
    } else {
      hi = s;
    }
  }
  // walk forward over every line sharing the prefix
  for (let s = lo; s < _sense.length;) {
    const e = _sense.indexOf(10, s);
    const end = e < 0 ? _sense.length : e;
    const line = _sense.subarray(s, end);
    if (line.length < key.length || Buffer.compare(line.subarray(0, key.length), key) !== 0) break;
    const f = line.toString('utf8').split(' ');
    if (f.length >= 4) {
      const off = parseInt(f[1], 10), tag = parseInt(f[3], 10);
      // ⚠ MAX, not overwrite: one synset can carry the lemma more than once, and
      // the strongest attestation is the honest answer for that meaning.
      if (Number.isFinite(off) && Number.isFinite(tag)) out.set(off, Math.max(out.get(off) || 0, tag));
    }
    s = end + 1;
  }
  return out;
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
      if (def) out.push({ partOfSpeech: label, definition: def, _off: off });
    }
  }
  /* Most-attested meaning first. `Array.prototype.sort` is stable in V8, so
     every sense that ties — which is all of them for the 82.9% of words WordNet
     never tagged — keeps the POS-block order it has always had. */
  const tags = _senseTags(lemma);
  if (tags.size) {
    for (const s of out) s._tag = tags.get(s._off) || 0;
    out.sort((a, b) => b._tag - a._tag);
  }
  for (const s of out) { delete s._off; delete s._tag; }
  return out;
}

/* WordNet's own suffix-detachment table, POS-scoped, in WordNet's order.
   Consumed by `lookup()` below — see the long note there for why each candidate
   is verified against the index rather than trusted, and why the irregular
   forms are deliberately left to the network lane. The noun rules that overlap
   the existing plural arm are kept so the table stays WordNet's, not a
   hand-trimmed subset; a duplicate check costs one Map hit. */
/* The third field says whether the SUFFIX ITSELF identifies the part of speech.
   ⛔ It is not decoration — it decides whether `_leadWithPos` may reorder.
   `-ed` and `-ing` can only be verb forms and `-er`/`-est` only comparatives, so
   for those the word form is direct evidence and beats attestation. **`-s`,
   `-es` and `-ies` are shared between noun plurals and verb third-person**, so
   there the ending proves nothing and attestation must decide — measured:
   `comes` detaches to `come` under BOTH the noun and the verb rule, and forcing
   the table's first match to lead made a common verb headline as the vulgar
   noun. Ambiguous endings therefore return the attested order untouched. */
/* ⭐⭐ THE ORTHOGRAPHIC RULES WORDNET PUTS IN `.exc` INSTEAD OF ITS DETACHMENT
 * TABLE — ADDED 2026-09-08, AND EVERY ONE WAS MEASURED BEFORE IT WAS WRITTEN.
 *
 * WordNet's published detachment table has no entry for `-ied`, for a doubled
 * final consonant, or for adverbial `-ly`, because its own tool resolves those
 * from the exception files. ⛔ `wordnet-db` ships NONE — its payload is nine
 * files (four `index.*`, four `data.*`, `index.sense`), verified by listing the
 * directory — so every one of these paid a network round trip for a lemma
 * already on disk.
 *
 * ⭐ MEASURED over all 19 vocabulary lists (19,339 distinct words, 2,938 of them
 * missing offline), each candidate validated against the index exactly as the
 * rules above are:
 *
 *     adj  ly   -> ""    18    discretely -> discrete
 *     verb ied  -> y     17    carried -> carry, copied -> copy, cried -> cry
 *     verb pped -> p     15    kidnapped -> kidnap, mapped -> map
 *     verb rred -> r      9    occurred -> occur, referred -> refer
 *     verb tted -> t      8    formatted -> format, submitted -> submit
 *     verb mming/gging/nning      8    slamming -> slam, debugging -> debug
 *                        ---
 *                         75   words moved from the network lane to disk
 *
 * ⚠ 75 of 2,938 is 2.6% and is not sold as more than that. The rest is function
 * words (which this dictionary cannot define at all — it is noun/verb/adj/adv
 * only), true irregulars needing the absent `.exc`, and proper nouns.
 * ⭐ The reason it matters past the count: on 2026-09-05 the dictionary API
 * returned `000` for a whole day and the walk sat 17.5 HOURS on one kindergarten
 * cell. Every word the offline lane can answer is a word that outage cannot stop.
 *
 * ⚠ SAFE BY THE SAME PROPERTY AS THE RULES ABOVE, NOT BY BEING RIGHT: a
 * detachment is accepted ONLY if the result is in the index for that part of
 * speech. `modelled -> model` and a bogus `-ly` strip are both simply discarded
 * when the stem is not a real lemma, so a wrong rule cannot invent a definition
 * — it can only fail to resolve.
 * ⚠ `-ly` validates against the ADJECTIVE index deliberately: an adverb formed
 * from an adjective has its source there (`constitutively` -> `constitutive`),
 * and leading with that part of speech is the honest headline for the reduction.
 * ⛔ NOT a hand-authored irregular table — that is the banned shape in this file
 * and `went`/`children`/`came` correctly stay on the network lane.
 */
const MORPHY = [
  ['noun', [['s', '', false], ['ses', 's', false], ['xes', 'x', false], ['zes', 'z', false], ['ches', 'ch', false], ['shes', 'sh', false], ['men', 'man', true], ['ies', 'y', false]]],
  ['verb', [['s', '', false], ['ies', 'y', false], ['es', 'e', false], ['es', '', false], ['ed', 'e', true], ['ed', '', true], ['ing', 'e', true], ['ing', '', true],
    // y -> ied (regular orthography; WordNet files these in verb.exc)
    ['ied', 'y', true],
    // doubled final consonant before -ed / -ing
    ['pped', 'p', true], ['rred', 'r', true], ['tted', 't', true], ['nned', 'n', true], ['mmed', 'm', true], ['gged', 'g', true], ['bbed', 'b', true], ['dded', 'd', true], ['lled', 'l', true],
    ['pping', 'p', true], ['rring', 'r', true], ['tting', 't', true], ['nning', 'n', true], ['mming', 'm', true], ['gging', 'g', true], ['bbing', 'b', true], ['dding', 'd', true], ['lling', 'l', true]]],
  ['adj', [['er', '', true], ['est', '', true], ['er', 'e', true], ['est', 'e', true],
    // adverbial -ly formed from an adjective
    ['ly', '', true], ['ily', 'y', true]]],
];

/* ⛔⛔ THE INFLECTION KNOWS THE PART OF SPEECH, AND THROWING THAT AWAY REMAKES
 * THE BUG THIS FILE EXISTS TO FIX.
 *
 * `_rawSenses` orders by WordNet's attestation counts across ALL parts of
 * speech. That is right for a bare lemma and WRONG for one reached by
 * detaching a verb ending: `spelled` resolves to the lemma `spell`, whose
 * best-attested sense is the NOUN — *"a psychological state induced by a magic
 * spell"* — so she would answer a question about a past-tense verb with a
 * definition of witchcraft. Same shape as `be` leading with beryllium, which
 * the sense-ordering work above was built to end.
 *
 * ⭐ A STABLE PARTITION, NOT A FILTER. Every sense still returns and still
 * binds — the module's rule is that the SET is complete and only the headline
 * moves. Senses of the inflection's own part of speech lead; everything else
 * keeps the attestation order it already had.
 */
const _POS_LABEL = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb' };
function _leadWithPos(senses, pos) {
  const want = _POS_LABEL[pos];
  if (!want) return senses;
  const lead = [], rest = [];
  for (const s of senses) (s.partOfSpeech === want ? lead : rest).push(s);
  return lead.length ? lead.concat(rest) : senses;
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
  //
  // ⭐⭐ THREE SHAPES, NOT ONE — MEASURED 2026-09-08 ON THE LIVE KINDERGARTEN
  // LIST, WHERE THE HOLIDAY VOCABULARY SPLIT ALMOST EXACTLY IN HALF.
  //
  // `laborday`, `newyear`, `independenceday`, `memorialday`, `veteransday` and
  // `groundhogday` all resolved through the plain underscore arm. `presidentsday`
  // and `valentinesday` did not — and the reason is not that WordNet lacks them:
  //
  //     presidents_day    0 senses        presidents'_day   1 sense
  //     valentines_day    0 senses        valentine_day     1 sense
  //
  // ⛔ So the entries exist and the join could not reach them: one carries a
  // POSSESSIVE APOSTROPHE and the other holds its first element SINGULAR. Those
  // words then failed offline AND on the network, landed in the permanent-miss
  // set, and were reported to the operator as vocabulary that would "train on
  // words with no definition behind them" — a real warning about a word the
  // dictionary on disk could define all along.
  //
  // ⭐ THE ALTERNATIVE WAS TO DELETE THE TOKENS FROM THE WORD LIST, AND THAT
  // WOULD HAVE BEEN A CUT. `Presidents' Day` and `Valentine's Day` are things a
  // kindergartener actually learns; removing them to silence a warning removes
  // curriculum. Fix the lookup, not the content.
  //
  // ⚠ Same propose-and-verify discipline as every other arm here: a variant is
  // returned ONLY if it is a real lemma, so a wrong guess cannot invent a
  // definition — it can only fail. `earthday`, `chinesenewyear`, `grayhair` and
  // `toystore` were probed too and WordNet genuinely holds none of them, so they
  // correctly stay on the network lane rather than being forced to resolve.
  for (let i = 3; i <= w.length - 3; i++) {
    const head = w.slice(0, i);
    const tail = w.slice(i);
    const j = _rawSenses(head + '_' + tail);
    if (j.length) return j;
    // Possessive: presidentsday -> presidents'_day
    if (head.endsWith('s')) {
      const p = _rawSenses(head + "'_" + tail);
      if (p.length) return p;
    }
    // First element singular: valentinesday -> valentine_day
    if (head.endsWith('s') && head.length > 4) {
      const s = _rawSenses(head.slice(0, -1) + '_' + tail);
      if (s.length) return s;
    }
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

  /* ⭐⭐ MORPHY — VERB AND ADJECTIVE INFLECTION, WHICH THIS MODULE NEVER DID.
   *
   * ⛔ THE COST OF NOT DOING IT, MEASURED on the live `ela/kindergarten` list:
   * of 17,873 distinct content words, 5,288 missed offline and went to the
   * network — and `called`, `depending`, `borrowed`, `representing`, `spelled`,
   * `languages`, `comes`, `oldest`, `created`, `smallest` are all in that list
   * while WordNet holds `call`, `depend`, `borrow`, `represent`, `spell`,
   * `language`, `come`, `old`, `create`, `small`. The plural arm above catches
   * `-s`/`-es`/`-ies` and nothing else, so every past tense and participle in
   * the corpus paid a network round trip for a lemma already on disk.
   *
   * ⭐ MEASURED RECOVERY: **1,806 of the 5,288 misses — 34.2%**, taking this
   * cell's network chunks from 1,058 to 697.
   *
   * ⭐⭐ IT DOES NOT INVENT STEMS, WHICH IS THE RULE THIS FILE ALREADY SETS
   * ABOVE. These are WordNet's own documented suffix-detachment rules, and a
   * detachment is ACCEPTED ONLY IF THE RESULT IS IN THE INDEX FOR THAT PART OF
   * SPEECH — propose and verify, exactly the shape the plural arm uses. A
   * candidate that is not a real lemma is discarded, never taught.
   *
   * ⚠ POS-SCOPED ON PURPOSE. `-ed`/`-ing` are checked against the VERB index
   * and `-er`/`-est` against the ADJECTIVE index, so a detachment cannot
   * succeed by landing on an unrelated noun.
   *
   * ⛔⛔ THE IRREGULARS ARE OUT OF REACH AND ARE NOT FAKED. `went`, `came`,
   * `caught`, `children`, `became`, `arose`, `shown` need WordNet's `.exc`
   * exception files — and **`wordnet-db` ships none**: its payload is nine
   * files (four `index.*`, four `data.*`, `index.sense`), verified by listing
   * the directory. A hand-authored irregular table is the banned shape here, so
   * those words correctly stay on the network lane.
   */
  for (const [pos, rules] of MORPHY) {
    for (const [suffix, replacement, posDistinctive] of rules) {
      if (!w.endsWith(suffix)) continue;
      const stem = w.slice(0, w.length - suffix.length) + replacement;
      // Two-character floor: below it a "stem" is an artefact of the rule, not
      // a word, and WordNet's own detachment tables assume the same.
      if (stem.length < 2 || stem === w) continue;
      // `_idx` is null when WordNet failed to load; the guard keeps a dead
      // dictionary silent rather than throwing into the teach path.
      if (!_idx || !_idx[pos] || !_idx[pos].has(stem)) continue;
      d = _rawSenses(stem);
      if (d.length) return posDistinctive ? _leadWithPos(d, pos) : d;
    }
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
