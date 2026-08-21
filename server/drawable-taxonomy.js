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
  // tagged corpora (tagsense 0) while the word lives in the verb/adjective/
  // adverb indexes is a verb or adjective wearing a dictionary artifact —
  // "have" ("the haves") must not become drawable.
  _loadOtherPos();
  if (e.tag === 0 && _otherPos && _otherPos.has(w)) return 'abstract';
  const senses = e.offs.map(_senseInfo).filter(s => !s.inst);
  if (!senses.length) return 'abstract';
  // PRIMARY-SENSE GUARD: a word whose most-frequent real sense is a QUANTITY
  // (23) or a linguistic/communication unit (10) is not a drawing subject even
  // when a card game borrowed it — "seven" stays a number despite "a card
  // bearing seven pips".
  if (senses[0].lex === 23 || senses[0].lex === 10) return 'abstract';
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
function _loadOtherPos() {
  if (_otherPos || _loadFailed) return;
  try {
    const dict = require('wordnet-db').path;
    _otherPos = new Set();
    for (const f of ['index.adj', 'index.verb', 'index.adv']) {
      const txt = fs.readFileSync(path.join(dict, f), 'utf8');
      for (const line of txt.split('\n')) {
        if (!line || line[0] === ' ') continue;
        _otherPos.add(line.slice(0, line.indexOf(' ')));
      }
    }
  } catch { _otherPos = null; }
}
function knownOnlyNonNoun(word) {
  _load(); _loadOtherPos();
  const w = String(word || '').toLowerCase().trim();
  if (!w || !_otherPos) return false;
  return _otherPos.has(w) && !(_index && _index.has(w));
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

module.exports = { drawableVerdict, primaryLex, knownDescriptor, knownOnlyNonNoun, unattestedNoun };
