// gen-phonics-questions.mjs — TURN THE DERIVED GPC RULES INTO EXAM QUESTIONS.
//
// ⛔⛔ WHAT THIS FIXES: the phonics exam was missing five letters entirely and
// taught NO letter more than one sound — 0 of 26. A reader who only ever learns
// one sound per letter cannot decode English, and the gate would still pass her.
// The rules to fix it already exist in `corpora/phonics/gpc.json`, DERIVED from
// Wikipedia's English-orthography tables and checked against the CMU
// Pronouncing Dictionary. This turns them into questions.
//
// ⛔ NO HAND-AUTHORED PHONEME SPELLINGS. The obvious design answers "what sound
// does c make?" with a typed approximation like `kuh` / `sss`, which is a
// hand-written table — the exact word-list pattern this project bans, and the
// reason the old bank was arbitrary in the first place. Instead every question
// is answerable with material the RULES already contain:
//
//   SAME-OR-DIFFERENT   does the ⟨c⟩ in `city` sound like the ⟨c⟩ in `cat`?
//                       -> derived: same `value` = yes, different = no
//   WHICH-ONE           in `ocean`, does ⟨c⟩ sound like in `cellar` or `cat`?
//                       -> the answer is an example word, not a spelling
//
// Both test the thing that was missing — that one grapheme carries more than one
// sound — and neither needs a phoneme rendered into letters.
//
// ⛔⛔ THE CONTAMINATION GATE, which the board demanded before any question was
// generated. The scrape has a known tail defect: on some row shapes the parser
// pulled values from a neighbouring column, so `dd` and `dh` both inherited
// ⟨d⟩'s rules wholesale — `/t/ as in "ached"`, `/d/ as in "dive"`. Neither
// example contains `dd` or `dh`. So a rule is used ONLY if:
//   1. its check is `confirmed` (verified against attested pronunciation), and
//   2. at least one example word ACTUALLY CONTAINS its own grapheme.
// That second test is structural, needs no list, and kills the whole bleed.
//
// ⚠ Example words are filtered to words she HAS (K + G1 vocabulary). A question
// about a word she has never met tests vocabulary, not phonics.
//
// ⛔ Generated strings must differ from the TRAIN bank's, or `_examSanitizeReport`
// strips them as duplicates — which is how five letters ended up tested by
// nothing. These forms are questions the drill never asks.
//
// RUN:  node .claude/scripts/gen-phonics-questions.mjs
// Offline. Writes corpora/phonics/exam-questions.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const gpc = JSON.parse(fs.readFileSync(path.join(ROOT, 'corpora', 'phonics', 'gpc.json'), 'utf8'));

// Her vocabulary at the band these questions serve.
const vocab = new Set();
// ⚠ Reads the JSON store — the nineteen `*-vocabulary.js` modules were retired
// 2026-09-05 and their words now live in `corpora/vocabulary/*.json`, byte-for-
// byte the same lists (verified 19/19, zero words differing, before deletion).
for (const g of ['kindergarten', 'grade1']) {
  const words = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'corpora', 'vocabulary', `${g}.json`), 'utf8'));
  for (const w of words) vocab.add(String(w).toLowerCase());
}
console.log(`[phonics] vocabulary she has: ${vocab.size.toLocaleString()} words`);

// ── the contamination gate ───────────────────────────────────────────────────
// How many DISTINCT attested sounds a grapheme has across all its confirmed
// rules — the guard that keeps vocabulary-supplemented examples honest.
function rulesPerGrapheme(src, g) {
  const vals = new Set();
  for (const r of src.rules) {
    if (r.check !== 'confirmed') continue;
    if (String(r.grapheme || '').toLowerCase() !== g) continue;
    vals.add(r.value);
  }
  return vals.size;
}

const usable = [];
const supplemented = [];
const dropped = { unconfirmed: 0, exampleLacksGrapheme: 0, noKnownExample: 0 };
for (const r of gpc.rules) {
  if (r.check !== 'confirmed') { dropped.unconfirmed++; continue; }
  const g = String(r.grapheme || '').toLowerCase();
  if (!g || !/^[a-z]+$/.test(g)) continue;
  // The example must actually contain the grapheme it is an example OF.
  const own = (r.examples || []).map((w) => String(w).toLowerCase()).filter((w) => w.includes(g));
  if (!own.length) { dropped.exampleLacksGrapheme++; continue; }
  let known = own.filter((w) => vocab.has(w));
  // ⭐ SUPPLEMENT FROM HER OWN VOCABULARY WHEN THE SOURCE'S EXAMPLES ARE OBSCURE.
  // ⟨q⟩'s only confirmed example is `iraq` and ⟨w⟩'s are `sward`, `swerve`,
  // `wale` — correct rules, but words she has never met, so both letters were
  // dropped and ⟨q⟩ is one of the five the exam was missing in the first place.
  //
  // ⛔ ONLY for single-sound graphemes and ONLY word-initially, because that is
  // the one position where the rule's value is safe without re-deriving context:
  // a word merely CONTAINING ⟨w⟩ may not use it as /w/ at all (`saw`), and
  // pairing two words that take different rules would make the answer wrong.
  // Derived from her vocabulary and the grapheme; nothing typed.
  if (!known.length && rulesPerGrapheme(gpc, g) === 1 && /^[bcdfghjklmnpqrstvwxyz]+$/.test(g)) {
    known = [...vocab].filter((w) => w.startsWith(g) && w.length >= 3 && w.length <= 8).sort().slice(0, 4);
    if (known.length) supplemented.push(`${g} (${known.slice(0, 3).join(', ')})`);
  }
  if (!known.length) { dropped.noKnownExample++; continue; }
  usable.push({ grapheme: g, value: r.value, context: r.context, examples: known });
}
console.log(`[phonics] rules usable: ${usable.length} of ${gpc.rules.length}`);
console.log(`           dropped — not confirmed: ${dropped.unconfirmed}`
  + `   example lacks its own grapheme: ${dropped.exampleLacksGrapheme}`
  + `   no example she knows: ${dropped.noKnownExample}`);

// ── group by grapheme ────────────────────────────────────────────────────────
const byGrapheme = new Map();
for (const r of usable) {
  if (!byGrapheme.has(r.grapheme)) byGrapheme.set(r.grapheme, []);
  byGrapheme.get(r.grapheme).push(r);
}

const questions = [];
const seen = new Set();
const push = (q) => {
  const k = q.q.toLowerCase();
  if (seen.has(k)) return;
  seen.add(k);
  questions.push(q);
};

let multiSoundCovered = 0;
for (const [g, rules] of [...byGrapheme.entries()].sort()) {
  const byValue = new Map();
  for (const r of rules) {
    if (!byValue.has(r.value)) byValue.set(r.value, r);
  }
  const values = [...byValue.values()];

  if (values.length >= 2) {
    multiSoundCovered++;
    // SAME-OR-DIFFERENT across two attested sounds — the direct test that this
    // grapheme is not one sound. Both directions, so a yes-bias cannot pass it.
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i].examples[0], b = values[j].examples[0];
        if (!a || !b || a === b) continue;
        push({
          q: `in "${a}" and "${b}", ${g.length > 1 ? "do the letters" : "does the letter"} "${g}" make the same sound?`,
          a: 'no', variants: ['no', 'different', 'not the same'],
          standard: 'K.RF.3a', difficulty: 2, source: 'derived-gpc',
        });
        // WHICH-ONE — answerable with an example word, never a spelled phoneme.
        const other = values[j].examples[1] || values[j].examples[0];
        if (other && other !== b) {
          push({
            q: `does "${g}" in "${other}" sound like "${g}" in "${a}" or in "${b}"?`,
            a: b, variants: [b], standard: 'K.RF.3a', difficulty: 3, source: 'derived-gpc',
          });
        }
      }
    }
    // A same-sound pair proves the question is not simply always "no".
    for (const v of values) {
      if (v.examples.length >= 2) {
        push({
          q: `in "${v.examples[0]}" and "${v.examples[1]}", ${g.length > 1 ? "do the letters" : "does the letter"} "${g}" make the same sound?`,
          a: 'yes', variants: ['yes', 'same', 'the same'],
          standard: 'K.RF.3a', difficulty: 2, source: 'derived-gpc',
        });
      }
    }
  } else if (values.length === 1 && values[0].examples.length >= 2) {
    // Single-sound graphemes still need coverage — this is the form that fills
    // the five letters the old bank tested with nothing at all.
    const v = values[0];
    push({
      // ⚠ Agreement matters here — SHE READS THESE. "which letter make" is the
      // kind of thing a generated bank ships without anyone noticing, and this
      // brain is taught language mechanics from the same material it is tested on.
      q: `which letter${g.length > 1 ? 's make' : ' makes'} the same sound in "${v.examples[0]}" and "${v.examples[1]}"?`,
      a: g, variants: [g], standard: 'K.RF.3a', difficulty: 2, source: 'derived-gpc',
    });
  }
}

const letters = new Set(questions.flatMap((q) => {
  const m = q.q.match(/"([a-z]+)"/g) || [];
  return m.map((s) => s.replace(/"/g, ''));
}));
const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
const covered = alphabet.filter((c) => byGrapheme.has(c));

const out = {
  version: 1,
  note: 'Phonics exam questions GENERATED from corpora/phonics/gpc.json, not hand-authored. '
    + 'Every question is answerable from the rules themselves — no phoneme is spelled out, because a '
    + 'typed approximation table would be exactly the arbitrary word list the derived rules replaced. '
    + 'Rules are used only when confirmed against attested pronunciation AND when an example word '
    + 'actually contains its own grapheme, which is what excludes the scrape\'s known column-bleed tail.',
  source: gpc.sources,
  generated: {
    rulesUsable: usable.length,
    rulesTotal: gpc.rules.length,
    dropped,
    graphemes: byGrapheme.size,
    multiSoundGraphemes: multiSoundCovered,
    lettersOfTheAlphabetCovered: covered.length,
    lettersMissing: alphabet.filter((c) => !byGrapheme.has(c)),
    questions: questions.length,
  },
  questions,
};
const dst = path.join(ROOT, 'corpora', 'phonics', 'exam-questions.json');
fs.writeFileSync(dst, `${JSON.stringify(out, null, 1)}\n`, 'utf8');

console.log(`[phonics] graphemes covered      ${byGrapheme.size}`);
console.log(`[phonics] MULTI-SOUND graphemes  ${multiSoundCovered}   (the bank had 0)`);
console.log(`[phonics] alphabet letters       ${covered.length}/26   missing: ${alphabet.filter((c) => !byGrapheme.has(c)).join(' ') || 'none'}`);
console.log(`[phonics] questions generated    ${questions.length}`);
console.log(`[phonics] -> ${path.relative(ROOT, dst)}`);
