// DRAWGATE — WordNet lexicographer-category taxonomy for the drawable check.
//
// The operator's law: she draws ONLY a thing, person, place, or animal.
// Word lists cannot cover the real world; a TAXONOMY can. WordNet (a static
// lexical database — the same legal class as the dictionary service, zero
// text-AI) files every noun sense under a lexicographer category at build
// time. The categories that ARE things/people/places/animals:
//
//   05 noun.animal    06 noun.artifact   08 noun.body    13 noun.food
//   15 noun.location  17 noun.object     18 noun.person  20 noun.plant
//   25 noun.shape
//
// Everything else (act, attribute, cognition, communication, event, feeling,
// motive, phenomenon, possession, process, quantity, relation, state, time)
// is not a picture of anything.
//
// Verdict semantics — the taxonomy GRANTS, it never hard-denies alone:
//   'concrete' → some sense of the word is a thing/person/place/animal
//   'abstract' → WordNet knows the word and NO sense is concrete
//   'unknown'  → the word is not in WordNet (proper nouns, new words)
// Callers treat 'abstract' and 'unknown' as "ask the definition evidence" —
// e.g. "lightning" files under phenomenon yet IS drawable, and its dictionary
// definition ("a flash of light…") carries that evidence.
//
// Index loads lazily once (~120k lemmas, a few MB) and data.noun stays a
// Buffer sliced by byte offset — WordNet data lines are addressed by offset,
// so each sense costs one indexOf + one small toString.

'use strict';

const fs = require('fs');
const path = require('path');

// + 27 noun.substance: water, snow, rain, mud, fire — paintable stuff of the
// world. (Full-sweep verified: the abstract families never enter through 27.)
const CONCRETE_LEX = new Set([5, 6, 8, 13, 15, 17, 18, 20, 25, 27]);

let _index = null;   // Map<lemma, {offs: string[], tag: number}>
let _data = null;    // Buffer of data.noun
let _loadFailed = false;

function _load() {
  if (_index || _loadFailed) return;
  try {
    const dict = require('wordnet-db').path;
    const idxText = fs.readFileSync(path.join(dict, 'index.noun'), 'utf8');
    _data = fs.readFileSync(path.join(dict, 'data.noun'));
    _index = new Map();
    for (const line of idxText.split('\n')) {
      if (!line || line[0] === ' ') continue;   // header lines start with spaces
      const f = line.trim().split(/\s+/);
      const n = parseInt(f[2], 10);
      if (!n) continue;
      // tagsense_cnt (how many senses are corpus-attested) sits just before
      // the synset offsets — 0 means "this noun reading never actually occurs"
      _index.set(f[0], { offs: f.slice(-n), tag: parseInt(f[f.length - n - 1], 10) || 0 });
    }
    console.log(`[DrawableTaxonomy] WordNet noun index loaded: ${_index.size} lemmas`);
  } catch (e) {
    _loadFailed = true;
    console.warn(`[DrawableTaxonomy] WordNet unavailable (${e && e.message}) — every word falls to definition evidence`);
  }
}

// {lex, inst} for a synset — inst=true marks an INSTANCE synset (a named
// individual: Sojourner Truth, the deity Chaos, Doris Day). Instances must
// not certify a common word as concrete.
function _senseInfo(offsetStr) {
  const o = parseInt(offsetStr, 10);
  if (!Number.isFinite(o) || o < 0 || !_data || o >= _data.length) return { lex: -1, inst: false };
  const nl = _data.indexOf(10, o);
  const line = _data.toString('utf8', o, nl > o ? nl : Math.min(_data.length, o + 600));
  return { lex: parseInt(line.split(/\s+/)[1], 10), inst: line.includes(' @i ') };
}

// 'concrete' | 'abstract' | 'unknown'
function drawableVerdict(word) {
  _load();
  if (!_index) return 'unknown';
  const w = String(word || '').toLowerCase().trim().replace(/\s+/g, '_');
  if (!w) return 'unknown';
  const e = _index.get(w);
  if (!e || !e.offs.length) return 'unknown';
  // UNATTESTED-NOUN GUARD: a word whose noun reading never occurs in the
  // tagged corpora (tagsense 0) while the SAME word IS attested as a verb/
  // adjective/adverb is really that other thing wearing a dictionary-artifact
  // noun ("have" → the haves, "go" → the board game, "see" → a diocese,
  // "there" → that place). Requiring the OTHER side to be attested is what
  // spares "crayon" — a real artifact that simply never made the corpus in
  // ANY part of speech. Measured in, three rounds.
  _loadOtherPos();
  const senses = e.offs.map(_senseInfo).filter(s => !s.inst);
  if (!senses.length) return 'abstract';
  if (e.tag === 0 && _otherPosTag && (_otherPosTag.get(w) | 0) > 0) return 'abstract';
  // PRIMARY-SENSE GUARD: a word whose most-frequent real sense is a QUANTITY
  // (23) is not a drawing subject even when a card game borrowed it — "seven"
  // stays a number despite "a card bearing seven pips". (Communication-primary
  // was guarded here too and MEASURED OUT: it killed "book" — communication
  // primary, physical volume senses very real — while every word it was meant
  // to catch (music, dance, consonant) has no concrete sense and refuses on
  // the main loop anyway.)
  if (senses[0].lex === 23) return 'abstract';
  // (An attestation guard was TRIED here and deleted after measuring: corpus
  // sense-frequency kills book/table/fire — their content/event senses
  // out-attest their physical ones in any tagged corpus — while "addition"
  // survives every honest cut because a building wing IS attested English.
  // Residuals like "addition" are exactly what the viewer's 🚫 not-drawable
  // button is for: one press bans the word permanently, persisted across
  // walks. A rule that lies about books to catch one math word is worse.)
  for (const s of senses) if (CONCRETE_LEX.has(s.lex)) return 'concrete';
  return 'abstract';
}

// The lexicographer category of the word's PRIMARY (most frequent, non-
// instance) noun sense, or -1 when WordNet has no noun entry. 18 = noun.person.
function primaryLex(word) {
  _load();
  if (!_index) return -1;
  const w = String(word || '').toLowerCase().trim().replace(/\s+/g, '_');
  const e = w && _index.get(w);
  if (!e || !e.offs.length) return -1;
  for (const off of e.offs) {
    const s = _senseInfo(off);
    if (!s.inst) return s.lex;
  }
  return -1;
}

// Is the word a descriptor WordNet knows — a noun of any category or an
// adjective? Function words, inflections and glue are simply ABSENT from
// these indexes, which is what lets a definition tail be built with no
// stop-word list at all.
let _adjIndex = null;
function _loadAdj() {
  if (_adjIndex || _loadFailed) return;
  try {
    const dict = require('wordnet-db').path;
    const txt = fs.readFileSync(path.join(dict, 'index.adj'), 'utf8');
    _adjIndex = new Set();
    for (const line of txt.split('\n')) {
      if (!line || line[0] === ' ') continue;
      _adjIndex.add(line.slice(0, line.indexOf(' ')));
    }
  } catch { _adjIndex = null; }
}
function knownDescriptor(word) {
  _load(); _loadAdj();
  const w = String(word || '').toLowerCase().trim();
  if (!w) return false;
  return !!((_index && _index.has(w)) || (_adjIndex && _adjIndex.has(w)));
}

// WordNet knows this word ONLY in non-noun parts of speech (adjective, verb,
// adverb). That is a curated verdict that the word is not a thing at all —
// it protects the definition-evidence lane from crowd-dictionary slang noun
// senses ("strange" is adjective/verb everywhere except one slang entry).
let _otherPos = null;
let _otherPosTag = null;   // Map<lemma, max tagsense across verb/adj/adv>
function _loadOtherPos() {
  if (_otherPos || _loadFailed) return;
  try {
    const dict = require('wordnet-db').path;
    _otherPos = new Set();
    _otherPosTag = new Map();
    for (const f of ['index.adj', 'index.verb', 'index.adv']) {
      const txt = fs.readFileSync(path.join(dict, f), 'utf8');
      for (const line of txt.split('\n')) {
        if (!line || line[0] === ' ') continue;
        const parts = line.trim().split(/\s+/);
        const lemma = parts[0];
        if (!lemma) continue;
        _otherPos.add(lemma);
        const n = parseInt(parts[2], 10) || 0;
        const tag = parseInt(parts[parts.length - n - 1], 10) || 0;   // tagsense_cnt sits before the offsets
        if (tag > (_otherPosTag.get(lemma) | 0)) _otherPosTag.set(lemma, tag);
      }
    }
  } catch { _otherPos = null; _otherPosTag = null; }
}
function knownOnlyNonNoun(word) {
  _load(); _loadOtherPos();
  const w = String(word || '').toLowerCase().trim();
  if (!w || !_otherPos) return false;
  return _otherPos.has(w) && !(_index && _index.has(w));
}

// AGESTEER — does any noun sense of the word descend from juvenile.n.01
// (WordNet's "young person" subtree: child, boy, girl, baby, toddler…)?
// Used by the reference-prompt builder: a person word that is NOT juvenile-
// descended gets "adult" ridden into the prompt as POSITIVE steering, because
// the generator's own prior resolves age-less role words toward the very
// young (measured live: "friend" → teen girls, "teacher" → a schoolgirl).
// Words that SHOULD render young (boy, baby, child) are exactly the juvenile
// subtree and are left alone.
let _juvRoot = null;
function _resolveJuvRoot() {
  if (_juvRoot !== null) return _juvRoot;
  const e = _index && _index.get('juvenile');
  _juvRoot = (e && e.offs && e.offs[0]) ? String(parseInt(e.offs[0], 10)) : '';
  return _juvRoot;
}
function _hypernymsOf(offsetStr) {
  const o = parseInt(offsetStr, 10);
  if (!Number.isFinite(o) || o < 0 || !_data || o >= _data.length) return [];
  const nl = _data.indexOf(10, o);
  const line = _data.toString('utf8', o, nl > o ? nl : Math.min(_data.length, o + 900));
  const outs = [];
  for (const m of line.matchAll(/@i? (\d{8}) n /g)) outs.push(String(parseInt(m[1], 10)));
  return outs;
}
function _glossOf(offsetStr) {
  const o = parseInt(offsetStr, 10);
  if (!Number.isFinite(o) || o < 0 || !_data || o >= _data.length) return '';
  const nl = _data.indexOf(10, o);
  const line = _data.toString('utf8', o, nl > o ? nl : Math.min(_data.length, o + 900));
  const bar = line.indexOf(' | ');
  return bar > 0 ? line.slice(bar + 3) : '';
}
function descendsFromJuvenile(word) {
  _load();
  if (!_index) return false;
  const w = String(word || '').toLowerCase().trim().replace(/\s+/g, '_');
  const e = w && _index.get(w);
  if (!e || !e.offs.length) return false;
  // WordNet's tree files boy under male.n.02 (not juvenile), so the subtree
  // walk alone misses boy/girl/baby — but WordNet's own curated GLOSS carries
  // the age evidence ("a youthful male person", "a young woman", "a very
  // young child"). Either witness counts: the juvenile subtree OR age words
  // in the primary senses' glosses — both are the database's own knowledge.
  const AGE = /\b(young|youthful|juvenile|child|children|infant|newborn|baby)\b/i;
  for (const off of e.offs.slice(0, 3)) {
    if (_senseInfo(off).lex === 18 && AGE.test(_glossOf(off))) return true;
  }
  const root = _resolveJuvRoot();
  if (!root) return false;
  const seen = new Set();
  const queue = e.offs.map(x => String(parseInt(x, 10)));
  let depth = 0;
  while (queue.length && depth < 4000) {
    const cur = queue.shift(); depth++;
    if (cur === root) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const h of _hypernymsOf(cur)) if (!seen.has(h)) queue.push(h);
  }
  return false;
}

// The word's noun reading is UNATTESTED (tagsense 0): it exists in the index
// but never occurs as a noun in the tagged corpora. Callers cross-examine
// such grants against the dictionary's grammar tags ("or" is granted by an
// unattested heraldry sense and its dictionary entry says conjunction).
function unattestedNoun(word) {
  _load();
  if (!_index) return false;
  const w = String(word || '').toLowerCase().trim().replace(/\s+/g, '_');
  const e = w && _index.get(w);
  return !!(e && e.tag === 0);
}

module.exports = { drawableVerdict, primaryLex, knownDescriptor, knownOnlyNonNoun, unattestedNoun, descendsFromJuvenile };
