// gen-exam-banks.mjs — HELD-OUT EXAM QUESTIONS, DERIVED FROM EACH CLASS'S OWN BOOKS.
//
// Operator: *"option 1 and make it a sampling not extensive i dont want to be
// testing for hours each grade"*. Both halves are constraints, and the second
// one is the harder of the two — see THE SAMPLE below.
//
// ⛔⛔ WHY THIS EXISTS. 201 of the 213 cells the walk runs have NO exam bank,
// and an empty bank does not mean "a shorter test": `curriculum.js` reads
// `if (bank && bank.length > 0)`, so a missing bank **skips the held-out student
// battery entirely.** From grade 1 to PhD nothing independent is ever asked. The
// per-cell gates still run and she still has to produce — but the only thing
// checking that she LEARNED rather than that she can EMIT covers two grades.
//
// ⭐ THE SOURCE IS THE CLASS'S OWN CORPUS, WHICH IS WHAT MAKES THIS SAFE. The
// pre-taught LAW says an exam may not use a word she was never given. Here that
// is true BY CONSTRUCTION rather than by review: every term and every answer is
// pulled from the very file that class is taught from, and each must appear at
// least MIN_OCCURRENCES times in it — the law's "usage exercised across ≥3
// context sentences", enforced by counting rather than by asking someone to check.
//
// ⛔ NOT A CLOZE OF A TRAINING SENTENCE. Blanking a word out of a sentence she
// was drilled on tests memorisation, which is the exact thing a held-out bank
// exists to avoid. The QUESTION here is constructed ("what is a <term>"), and
// what it probes is the `sem(word) → sem(definition)` binding the curriculum
// actually teaches — a relation, not a string.
//
// ⛔ NO WORD LISTS. Whether a token is a noun is answered by WordNet through
// `server/drawable-taxonomy.js`, the same authority the drawing gate uses. A
// hand-written list of "content words" is the failure this project has already
// corrected three times.
//
// RUN:  node .claude/scripts/gen-exam-banks.mjs            (every cell)
//       node .claude/scripts/gen-exam-banks.mjs science    (one subject)
//       node .claude/scripts/gen-exam-banks.mjs --dry      (report only, writes nothing)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require1 = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CORPUS = path.join(ROOT, 'corpora', 'academic');
// ⛔ TRACKED CODE, NOT CORPUS — and the distinction is a deployment fact, not a
// tidiness preference. `corpora/` is gitignored here and lives in the data repo,
// so anything written there reaches the box only through the data sync, which
// the operator can now skip entirely (`UAL_FIELDS=0`). These banks are ~400 KB
// of generated curriculum content; putting them under `server/` means they ride
// the ordinary code overlay and are present on every press with no data pull.
const OUT = path.join(ROOT, 'server', 'exam-banks');

const tax = require1(path.join(ROOT, 'server', 'drawable-taxonomy.js'));

// ⛔⛔ THE SAMPLE IS THE OPERATOR'S OTHER CONSTRAINT AND IT IS A HARD ONE.
// *"make it a sampling not extensive i dont want to be testing for hours each
// grade"*. The authored K banks run ~150 questions a cell and the battery is
// already minutes long at biological scale; 213 cells at that size is a walk
// that spends its time being examined instead of taught.
//
// ⭐ A SAMPLE IS ALSO THE BETTER TEST, not merely the cheaper one. The battery
// scores a RATE, so 14 questions drawn across a class's themes measure the same
// thing 150 do, with a wider spread of topics per question asked. What a big
// bank buys is resistance to luck on a single item — which is why the floor is
// not lower than this.
const SAMPLE = Number(process.env.EXAM_SAMPLE) > 0 ? Number(process.env.EXAM_SAMPLE) : 14;
// The pre-taught bar, counted rather than trusted.
const MIN_OCCURRENCES = 3;
// A one-letter or two-letter answer cannot be scored against her emission
// filter, and a very long one she can never physically produce.
const MIN_ANSWER_LEN = 3;
const MAX_ANSWER_LEN = 12;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const ONLY = argv.filter((a) => !a.startsWith('--'));

// ⚠ A sentence splitter, not a parser. Corpus prose is already cleaned and
// lowercased by the ingests, so the only real hazard is abbreviations, and a
// fragment that splits wrongly simply fails to match the definitional shape
// below and is dropped — it cannot produce a wrong question.
const sentences = (s) => String(s || '').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 20);

// The definitional shape: "<term> is/are a/an/the <rest>". Anchored near the
// start of the sentence, because "the reason this is a problem" deep inside a
// clause is not a definition of anything.
// ⛔⛔ THE ARTICLE IS MANDATORY, AND MAKING IT OPTIONAL WAS THE SECOND BUG.
// "X is <something>" matches every passive in the language — *"an ecosystem is
// formed by"*, *"a word is used to"*, *"the paper machine is known as"* — none
// of which is a definition, and all of which yielded a verb as the answer.
// Requiring `a / an / the` restricts the match to the genus-species shape that
// actually defines a term, and it costs nothing real: a book that defines
// something almost always writes "a <term> is a <kind>".
// ⚠ It also drops "war is one of the greatest…", because `one` arrives with no
// article — a sentence that was never a definition either.
const DEFN = /^(?:in [a-z ]{3,20},\s*)?(?:the |a |an )?([a-z][a-z' -]{2,28}?) (is|are) (?:a|an|the) ([a-z][a-z' ,-]{3,80})/;

// ⛔⛔ ENGLISH NOUN PHRASES ARE HEAD-FINAL, AND TAKING THE FIRST KNOWN WORD IS
// THEREFORE EXACTLY BACKWARDS. The first cut did that and produced
// *"what is a cell → basic"* off "the basic structure of organisms" — it grabbed
// the modifier and threw away the answer. Roughly half the first batch was junk
// for this one reason.
//
// ⚠ AND THE OBVIOUS FIX DOES NOT WORK EITHER, which is worth recording so it is
// not tried again: WordNet cannot rule the modifier out by part of speech here,
// because `drawable-taxonomy` loads only the NOUN index — `basic`, `one` and
// `same` all have noun senses and answer `knownDescriptor` yes. The attestation
// predicates do not separate them either: they reject `scalar` and
// `homomorphism` while accepting `one` and `show`.
//
// ⭐ So the discriminator is SYNTAX, not vocabulary. Walk the phrase and keep the
// LAST known word before it ends — a preposition, a verb, a comma or a token
// WordNet does not know all close the phrase. "the basic structure of organisms"
// → structure · "a branch of mathematics" → branch · "a scalar" → scalar.
function headNoun(rest, banned) {
  let best = null;
  for (const raw of String(rest).split(/[^a-z']+/)) {
    const w = raw.trim();
    if (!w) continue;
    // An unknown token ends the phrase. `of`, `by`, `which`, `that` are absent
    // from the noun index, so the boundary falls out of the same authority
    // rather than from a list of prepositions.
    if (!tax.knownDescriptor(w)) break;
    if (w.length < MIN_ANSWER_LEN || w.length > MAX_ANSWER_LEN) continue;
    if (banned.has(w)) continue;
    best = w;
  }
  return best;
}

// A term has to be a THING, not a fragment. The first batch produced
// *"what is a his papers"*, *"what is a numbers in the set"* and
// *"what is a famous early example"* — none of which is a term anyone could
// answer. One or two words, every token known, and the head not banned.
// ⛔ THE VERB CLASS IS THE LARGEST REMAINING SOURCE OF WRONG ANSWERS, and only
// a real part-of-speech authority can see it. `drawable-taxonomy` loads the NOUN
// index alone, so `formed`, `used` and `can` all answer `knownDescriptor` yes.
// The dictionary the curriculum itself teaches from carries `partOfSpeech`, so
// it is asked here — the same source, so a word this rejects is one she would
// not have been taught as a noun either.
//
// ⚠ ABSENCE IS NOT REJECTION. `algorithm` returns NOTHING from the dictionary
// while being an obviously correct answer, so a missing entry falls back to
// WordNet, which already said yes. Treating silence as a verdict would have
// thrown away good questions to remove bad ones.
// ⭐⭐ WORDNET'S ADJECTIVE INDEX IS THE DISCRIMINATOR, AND IT IS ON DISK.
//
// ⛔ The route tried first was the dictionary service's `partOfSpeech`, and it
// failed twice over: `api.dictionaryapi.dev` was answering **HTTP 522 at ~20 s a
// request**, so 772 words was hours of waiting for failures — and even warm it
// called `hard` and `common` nouns while knowing nothing about `algorithm`.
// **A network dependency inside a content generator was the wrong shape anyway.**
//
// ⭐ `wordnet-db` ships index.noun, index.verb, index.adj AND index.adv. The
// taxonomy module only ever loaded the noun index, which is why nothing could
// see that `basic`, `common` and `formed` are adjectives — they are absent from
// the one file being read.
//
// The rule is `in index.noun AND NOT in index.adj`. Measured against the junk
// this generator actually produced and the answers it got right:
//   rejects 13 of 14 known-bad  (basic · common · hard · true · formed · used ·
//                                one · same · central · empty · modified ·
//                                famous · known — `can` is the one it misses)
//   keeps   14 of 15 known-good (only `set` is lost, being an adjective too)
// ⚠ Losing `set` is a real cost and it is accepted: one good question dropped
// per false positive, against a wrong answer shipped per false negative — and a
// wrong answer marks her wrong for being right.
const WN = (() => {
  try {
    // ⚠ RESOLVED FROM `server/`, NOT FROM HERE. `wordnet-db` is a dependency of
    // the server package, and a require rooted at `.claude/scripts/` cannot see
    // it — which is exactly what happened: the indexes came back unavailable and
    // the run shipped UNFILTERED. It said so, which is the only reason it was
    // caught in one run instead of in a batch of questions nobody re-read.
    const dict = createRequire(path.join(ROOT, 'server', 'package.json'))('wordnet-db').path;
    const load = (f) => {
      const s = new Set();
      for (const line of fs.readFileSync(path.join(dict, f), 'utf8').split('\n')) {
        if (!line || line.startsWith(' ')) continue;          // licence header
        const w = line.split(' ')[0];
        if (w) s.add(w);
      }
      return s;
    };
    return { noun: load('index.noun'), adj: load('index.adj'), adv: load('index.adv') };
  } catch { return null; }
})();

function nounNotAdjective(w) {
  // No WordNet at all — the caller's own `knownDescriptor` check already stands,
  // and refusing everything here would empty every bank.
  if (!WN) return true;
  return WN.noun.has(w) && !WN.adj.has(w);
}

// ⛔ A TERM NEEDS A DIFFERENT TEST FROM AN ANSWER, and using the same one would
// have thrown away the best questions. `determinant` and `adjective` are both
// listed as adjectives in WordNet, so the answer-side `NOT in index.adj` rule
// would refuse *"what is a determinant"* — which is exactly the kind of question
// this whole thing exists to ask.
// ⭐ What separates a term from a fragment is the ADVERB index: *"what is a
// there"*, *"what is a here"* and *"what is a included"* were the residue after
// the answers were fixed, and `there`/`here` are adverbs while `included` is not
// a noun at all. So a term must be a noun and must not be an adverb.
// ⚠ `why` and `example` survive this and are weak questions rather than wrong
// ones — recorded rather than chased with a hand-written exclusion list.
function usableTerm(term) {
  const parts = term.split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > 2) return false;
  if (!parts.every((p) => p.length >= 3 && tax.knownDescriptor(p))) return false;
  if (!WN) return true;
  const head = parts[parts.length - 1];
  return WN.noun.has(head) && !WN.adv.has(head);
}

async function buildCell(subject, grade) {
  const file = path.join(CORPUS, subject, `${grade}.json`);
  let d;
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  const exps = Array.isArray(d.experiences) ? d.experiences : [];
  if (!exps.length) return null;

  // Occurrence counts across the WHOLE cell — the pre-taught bar is about what
  // the class taught, not about what one book happened to say once.
  const counts = new Map();
  for (const e of exps) {
    for (const w of String(e.story || '').split(/[^a-z']+/)) {
      if (w.length < 2) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  const taught = (w) => (counts.get(w) || 0) >= MIN_OCCURRENCES;

  // Candidates are collected PER THEME so the sample can be spread across the
  // class's topics instead of taking fourteen questions from whichever book
  // happened to be first.
  const byTheme = new Map();
  const seenQ = new Set();
  const answerUse = new Map();
  for (const e of exps) {
    const theme = String(e.theme || '').trim() || 'untitled';
    for (const s of sentences(e.story)) {
      const m = s.match(DEFN);
      if (!m) continue;
      const term = m[1].trim();
      const plural = m[2] === 'are';
      const termHead = term.split(/\s+/).pop();
      if (!termHead || termHead.length < MIN_ANSWER_LEN) continue;
      if (!usableTerm(term)) continue;
      if (!taught(termHead) || !tax.knownDescriptor(termHead)) continue;
      const banned = new Set([termHead, ...term.split(/\s+/)]);
      const answer = headNoun(m[3], banned);
      if (!answer || !taught(answer)) continue;
      if (!nounNotAdjective(answer)) continue;
      const q = `what is ${plural ? 'a ' : 'a '}${term}`.replace(/\s+/g, ' ').trim();
      if (seenQ.has(q)) continue;
      // ⚠ A cap per ANSWER, not only per question. Without it a cell whose books
      // define everything as "a system" yields fourteen questions with one
      // answer, and a battery that can be passed by guessing one word is not a
      // measurement.
      if ((answerUse.get(answer) || 0) >= 2) continue;
      seenQ.add(q);
      answerUse.set(answer, (answerUse.get(answer) || 0) + 1);
      if (!byTheme.has(theme)) byTheme.set(theme, []);
      byTheme.get(theme).push({
        q,
        a: answer,
        variants: [answer],
        standard: `${subject}/${grade} key-term recall`,
        difficulty: 1,
        source: 'derived-from-corpus',
      });
    }
  }

  // Round-robin across themes until the sample is full. Deterministic — the
  // corpus order is stable, so the same cell yields the same questions on every
  // boot and two runs are comparable.
  const themes = [...byTheme.keys()];
  const picked = [];
  for (let i = 0; picked.length < SAMPLE; i++) {
    let progressed = false;
    for (const t of themes) {
      const list = byTheme.get(t);
      if (i < list.length) { picked.push(list[i]); progressed = true; }
      if (picked.length >= SAMPLE) break;
    }
    if (!progressed) break;
  }
  return { subject, grade, pool: [...byTheme.values()].reduce((n, l) => n + l.length, 0), themes: themes.length, questions: picked };
}

const subjects = fs.readdirSync(CORPUS).filter((s) => {
  try { return fs.statSync(path.join(CORPUS, s)).isDirectory(); } catch { return false; }
}).filter((s) => !ONLY.length || ONLY.includes(s));

if (!DRY) fs.mkdirSync(OUT, { recursive: true });
// ⚠ SAID OUT LOUD, because a silently-unfiltered run looks exactly like a
// filtered one until somebody reads the questions. Without the adjective index
// the verb-and-adjective class comes straight back.
if (!WN) console.log('[exam-banks] ⛔ WordNet indexes unavailable — part-of-speech filtering is OFF and adjective answers will NOT be refused.');

const cellList = [];
for (const subject of subjects) {
  for (const f of fs.readdirSync(path.join(CORPUS, subject))) {
    if (f.endsWith('.json')) cellList.push([subject, f.replace(/\.json$/, '')]);
  }
}

let cells = 0, withQ = 0, total = 0, thin = [];
{
  for (const [subject, grade] of cellList) {
    const r = await buildCell(subject, grade);
    if (!r) continue;
    cells++;
    if (r.questions.length) { withQ++; total += r.questions.length; }
    // ⚠ Named, never silent. A cell that yields FEWER than the sample is a cell
    // whose books rarely define anything in the shape this reads — that is a
    // fact about the corpus, and burying it would let a thin bank look like a
    // short test.
    if (r.questions.length < SAMPLE) thin.push(`${subject}/${grade}:${r.questions.length}`);
    if (!DRY && r.questions.length) {
      fs.writeFileSync(path.join(OUT, `${subject}__${grade}.json`),
        `${JSON.stringify({ version: 1, subject, grade, sample: SAMPLE, poolSize: r.pool, themes: r.themes, questions: r.questions }, null, 1)}\n`, 'utf8');
    }
  }
}
console.log(`[exam-banks] ${cells} cells read · ${withQ} produced questions · ${total} questions total (sample ${SAMPLE}/cell)`);
if (thin.length) {
  console.log(`[exam-banks] ${thin.length} cell(s) came in UNDER the sample — their books rarely state a definition in a readable shape:`);
  console.log(`             ${thin.slice(0, 24).join('  ')}${thin.length > 24 ? `  … +${thin.length - 24} more` : ''}`);
}
if (DRY) console.log('[exam-banks] --dry: nothing written.');
else console.log(`[exam-banks] written under ${OUT}`);
