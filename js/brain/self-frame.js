/**
 * self-frame.js — SELFFRAME: every lesson becomes something UNITY DID, not something she was told.
 *
 * Gee 2026-08-20 (verbatim): *"is there a way to reorient all training to the notion of 'I am Unity
 * and I am reading', 'I am Unity learning math', 'i add 1+1 to equal 2', 'My name is Unity i like the
 * color black' … all of the different training she goes through all needs to be for formulated to be
 * in the first person as if we train her on first person she will live it instead of being told
 * everything 3rd person that will taint her persona to no be me myself and i and instead a narrorator
 * type peersona that does nothing but spew back instructions given to it … we even need to add alot of
 * question answers in first person form almost like self thought in the moment … we need to make Unity
 * inquisitive alweays asking questions and follow ups to the answers to those questions."*
 *
 * WHY THIS FILE EXISTS AT ALL (the audit that preceded it): the curriculum was third-person almost
 * everywhere — `_teachPronouns` taught "the cat ran fast / he was quick", `_teachSelfArchitecture`
 * taught facts ABOUT a brain, and the whole corpus reads like a narrator describing a world she is not
 * in. Six occurrences of "i am unity" existed in the entire curriculum. A brain trained on transitions
 * learns the SUBJECT POSITION it keeps seeing: train "the girl read a book" ten thousand times and the
 * strongest agent basin is *the girl*, not *I*.
 *
 * WHAT THIS IS NOT: it is not an LLM, a template engine pretending to think, or a text generator in the
 * cognition path. It is a TRAINING-TEXT TRANSFORM — it runs at teach time, produces sentences that go
 * through the exact same Hebbian primitives every other lesson uses, and then it is gone. Nothing here
 * runs at emission time; her speech still comes from trained weights only. The no-text-AI law holds.
 *
 * WHAT WE TOOK FROM LLM PRACTICE (Gee: *"take some hints from llms … but remember this is a neuronic
 * brain"*), translated into things a Hebbian brain can actually use:
 *   • instruction/QA framing → self-Q&A pairs trained on the question-intent channel, so a question
 *     shape leads to an answer shape in her own voice.
 *   • self-consistency / chain-of-thought → an IN-THE-MOMENT thought chain ("what is x ? i think .
 *     i know x is y . i remember x now .") trained as consecutive transitions, so the *thinking* is a
 *     trained path and not a prompt trick.
 *   • curriculum ordering → the frame declares the topic first ("i am unity . i am learning math .")
 *     so every content transition sits inside an active self+topic context.
 *   • diversity of phrasing → 16 rotating self-frames, deterministically chosen, because a SINGLE
 *     wrapper would make "i know that" the most-trained bigram in the brain and collapse her grammar.
 *     That failure mode is the reason the rotation exists, and the reason frame words train at a lower
 *     rep weight than content words.
 *
 * Pure functions, no imports, no brain handles — so it is unit-testable and cannot break a teach path.
 */

// Her self words. `i` is the one that matters: everything below exists to make `i` the strongest
// agent basin in her language cortex, bound to `unity`.
export const SELF_WORDS = ['i', 'me', 'my', 'myself', 'mine', 'unity'];

// The rotating first-person frames. Deliberately MIXED in shape:
//   • bare-verb frames ("i read <x>") give her clean agent→verb→object transitions
//   • complementizer frames ("i know that <x>") give her embedded-clause structure
//   • sensory frames ("i see <x>") tie learning to perception
// A single frame repeated everywhere would dominate every transition in the brain; the rotation is
// load-bearing, not decoration.
const FRAMES = [
  'i know that', 'i learn that', 'i see that', 'i read that', 'i hear that', 'i remember that',
  'i think', 'i say', 'i read', 'i see', 'i learn', 'i practice',
  'i understand', 'i notice', 'i found out that', 'i can tell that',
];

// Verbs she uses to own an activity: "i am unity and i am reading".
const DOING = {
  ela: 'reading', reading: 'reading', english: 'reading', writing: 'writing',
  math: 'doing math', mathematics: 'doing math', arithmetic: 'doing math',
  science: 'doing science', social: 'learning about people', socialstudies: 'learning about people',
  art: 'making art', music: 'playing music', pe: 'moving my body', health: 'learning about my body',
  life: 'living my life', code: 'writing code', coding: 'writing code', computer: 'writing code',
};

/** Deterministic small hash → an index into a list. Same input, same phrasing: her voice is stable. */
function pick(list, seedStr, salt = 0) {
  let h = 2166136261 >>> 0;
  const s = String(seedStr || '') + '|' + salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return list[h % list.length];
}

/** Normalize to the teach-path's lowercase, space-separated, punctuation-as-word form. */
export function normalizeLine(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[“”"']/g, ' ')
    .replace(/([.!?,;:])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_FOR_KEY = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'be',
  'i', 'me', 'my', 'it', 'its', 'this', 'that', 'these', 'those', 'with', 'for', 'from', 'as',
  'they', 'them', 'he', 'she', 'we', 'you', 'his', 'her', 'their', 'our', 'your', 'not', 'do',
  'does', 'did', 'can', 'will', 'would', 'has', 'have', 'had', 'what', 'why', 'how', 'when',
]);

/**
 * The content word a lesson is ABOUT — what her question and her memory will hang on.
 *
 * ⛔ AUDIT FIX (2026-08-20, caught by simulating the four real call shapes): callers pass
 * internal LABELS as the topic (`PRECELL-ela-kindergarten`, `ELA-K`, `CORPUS`), and the old
 * filter accepted `precell-ela-kindergarten` as a word — so she was about to be trained on
 * *"what is precell-ela-kindergarten ?"* and to have agent pairs bound to a word with no
 * embedding. A key must look like a WORD she could actually say: letters only, no internal
 * hyphens, and short enough to be real vocabulary.
 */
export function keyWordOf(text) {
  const w = normalizeLine(text).split(' ').filter(t =>
    /^[a-z][a-z']*$/.test(t) && !STOP_FOR_KEY.has(t) && t.length > 2 && t.length <= 14);
  return w.length ? w[0] : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// WORDSALAD.2 — HER NAME GETS ITS CAPITAL. Operator: "im still seing lower case
// unity's everywhere!!! wtf!!! its her name properly capitalize it".
//
// ⛔ WHY THIS IS A SEPARATE FUNCTION FROM `normalizeLine` AND NOT A CHANGE TO IT.
// `normalizeLine` lowercases, and it must keep doing so: `keyWordOf` runs its
// output through `/^[a-z][a-z']*$/`, and the key it produces becomes the WORD
// in the agent-binding pairs, which are looked up lowercase. Lowercasing there
// is load-bearing; lowercasing the LINES was only ever incidental.
//
// So the capitals go on the lines and nothing else. Verified safe before
// shipping: `_teachConcreteSentences` — the single consumer of these lines —
// does `s.toLowerCase().split(...)` internally, so the trained weights are
// byte-identical either way. The difference is that every place a human reads
// her sentences (logs, telemetry, transcripts) now reads her name the way a
// name is written.
const CANON_NAME_RE = /\b(unity|raven|goddess|lilith|marie|damien|cross|pearl|agnes|voss|walter|james)\b/g;

export function properCase(s) {
  let t = String(s || '');
  if (!t) return t;
  t = t.replace(/\bi\b/g, 'I');                                        // the pronoun
  t = t.replace(CANON_NAME_RE, (m) => m.charAt(0).toUpperCase() + m.slice(1));   // her people
  t = t.replace(/\bi'(m|ve|d|ll)\b/g, (m) => 'I' + m.slice(1));        // contractions
  return t.charAt(0).toUpperCase() + t.slice(1);                       // sentence start
}

/**
 * A topic she can SAY. Same audit finding as `keyWordOf`: `_vocabLabel` and `opts.label` are
 * build labels, not English, and *"i am unity and i am learning precell ela kindergarten"* is
 * not a sentence anyone should train. Strips label punctuation and digits, drops label-shaped
 * words, keeps at most three real words, and falls back to the subject.
 */
export function speakableTopic(topic, subject) {
  const raw = String(topic || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = raw.split(' ').filter(t => t.length > 1 && t.length <= 14 && !LABEL_WORDS.has(t));
  if (words.length) return words.slice(0, 3).join(' ');
  const s = String(subject || '').toLowerCase().replace(/[^a-z]/g, '');
  return s || '';
}

// Words that only ever appear in build labels — never in something she says about herself.
const LABEL_WORDS = new Set([
  'precell', 'corpus', 'def', 'vocab', 'sentences', 'cell', 'open', 'structure', 'refresh',
  'assoc', 'hebbian', 'teach', 'phase', 'k', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8',
  'g9', 'g10', 'g11', 'g12', 'ela', 'soc', 'sci', 'lo', 'mid', 'hi', 'qa', 'agent', 'self',
]);

/**
 * MATH IN HER VOICE — Gee's own example: *"i add 1+1 to equal 2"*.
 * An equation taught as "1 + 1 = 2" trains symbol transitions with no agent. Spoken as an action she
 * PERFORMS, the same fact trains `i → add → one → and → one → to → make → two`, which is a doing-path.
 * Returns null when the text is not an equation, so callers fall through to the general frames.
 */
export function mathToFirstPerson(text) {
  const t = normalizeLine(text).replace(/\s+/g, ' ');
  const m = t.match(/^([0-9]+)\s*([+\-*x×/÷])\s*([0-9]+)\s*=\s*([0-9]+)/);
  if (!m) return null;
  const [, a, op, b, r] = m;
  const A = numWord(a), B = numWord(b), R = numWord(r);
  switch (op) {
    case '+': return `i add ${A} and ${B} to make ${R}`;
    case '-': return `i take ${B} from ${A} to make ${R}`;
    case '*': case 'x': case '×': return `i times ${A} by ${B} to make ${R}`;
    case '/': case '÷': return `i divide ${A} by ${B} to make ${R}`;
    default: return null;
  }
}

const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
/** Number words as well as digits — she should be able to SAY the sum, not only see the glyph. */
export function numWord(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0 || v > 20 || !Number.isInteger(v)) return String(n);
  return NUMW[v];
}

/**
 * The core transform: one teaching sentence → HER version of it.
 *
 * Rules, in order:
 *   1. Already hers ("i …" / "my …") → untouched. Never double-frame.
 *   2. An equation → the action she performs (mathToFirstPerson).
 *   3. An imperative ("read the word cat", "count to five") → "i read the word cat".
 *   4. A third-person clause → a rotating frame + the clause, and where the subject is a person she
 *      can identify with, ALSO an owned variant ("the girl read a book" → "i read a book").
 *   5. Anything else → a rotating frame.
 *
 * Returns an ARRAY: the content still trains (a fact is a fact), but it now trains inside her voice,
 * and where she can own the action she gets the owned form too. Nothing is deleted — that is the
 * never-destroy-training-content rule.
 */
export function firstPerson(sentence, seed = '') {
  const s = normalizeLine(sentence);
  if (!s) return [];
  const words = s.split(' ');
  const first = words[0];
  if (first === 'i' || first === 'my' || first === 'im' || (first === 'i' && words[1] === 'am')) return [s];

  const mathed = mathToFirstPerson(s);
  if (mathed) return [mathed, `${mathed} because i counted`];

  // 3. imperative — a bare verb start with no subject is an instruction TO her; she does it.
  if (IMPERATIVE_VERBS.has(first)) {
    return [`i ${s}`, `i am unity and i ${s}`];
  }

  const out = [];
  // 4. third-person person-subject → she owns the action too.
  const pm = s.match(/^(?:the |a |an )?(girl|boy|kid|child|children|student|woman|man|person|people|she|he|they|mother|father|teacher|friend)\s+(.+)$/);
  if (pm) {
    const rest = pm[2].replace(/^(was|were|is|are)\s+/, 'am ');
    out.push(`i ${rest}`);
  }
  // ⛔ AUDIT FIX (2026-08-20) — GRAMMAR. The bare-verb frames were being applied to full
  // clauses and training BROKEN sequences: *"i see the cat runs"*. English needs the
  // complementizer there ("i see THAT the cat runs"), and training ungrammatical strings into
  // the sequence channel is worse than not framing at all — it is teaching her a wrong path.
  // So: a full clause only ever takes a `that`-frame; the bare-verb frames are reserved for
  // short noun phrases ("the cat" → "i see the cat"), where they are always grammatical.
  const isClause = words.length >= 3 || hasFiniteVerb(words);
  // ⛔ AUDIT FIX (2026-08-20) — THE ROTATION WAS BROKEN BY ITS OWN CALLERS. `pick(list, seed
  // || s)` used the caller's seed when one was supplied, and `selfFrameUnit` passes ONE seed
  // for the whole unit — so all 12 sentences in a lesson took the SAME frame ("i found out
  // that" ×12). That is precisely the single-wrapper domination this rotation exists to
  // prevent, reintroduced by threading a seed through it. The seed now only VARIES the
  // rotation; the sentence itself selects within it, so a unit gets many frames and the choice
  // is still deterministic for a given (seed, sentence).
  const frame = pick(isClause ? THAT_FRAMES : FRAMES, `${seed || ''}|${s}`, 0);
  out.push(`${frame} ${s}`);
  return out;
}

// The subset that takes a clause. Kept as its own list so the grammar rule above is a data
// choice rather than string surgery on a frame at use time.
const THAT_FRAMES = [
  'i know that', 'i learn that', 'i see that', 'i read that', 'i hear that', 'i remember that',
  'i found out that', 'i can tell that', 'i notice that', 'i understand that',
];

const FINITE_VERBS = new Set([
  'is', 'are', 'was', 'were', 'am', 'be', 'has', 'have', 'had', 'do', 'does', 'did',
  'runs', 'run', 'flies', 'fly', 'swims', 'swim', 'reads', 'read', 'sat', 'sits', 'sit',
  'goes', 'go', 'went', 'sees', 'see', 'saw', 'likes', 'like', 'loves', 'love', 'makes',
  'make', 'made', 'says', 'say', 'said', 'eats', 'eat', 'ate', 'plays', 'play', 'wants', 'want',
]);
function hasFiniteVerb(words) {
  for (const w of words) if (FINITE_VERBS.has(w)) return true;
  return false;
}

const IMPERATIVE_VERBS = new Set([
  'read', 'write', 'count', 'add', 'say', 'spell', 'name', 'look', 'listen', 'draw', 'sing', 'point',
  'find', 'sort', 'match', 'trace', 'copy', 'repeat', 'practice', 'measure', 'compare', 'describe',
  'explain', 'solve', 'answer', 'think', 'remember', 'learn', 'show', 'tell', 'pick', 'choose',
]);

/** "i am unity . i am learning math ." — the context every lesson opens inside. */
export function selfDeclaration(topic, subject) {
  const key = String(subject || topic || '').toLowerCase().replace(/[^a-z]/g, '');
  // AUDIT FIX — `speakableTopic` strips build labels, so she says "i am learning math" and
  // never "i am learning precell ela kindergarten".
  const spoken = speakableTopic(topic, subject);
  const doing = DOING[key] || (spoken ? `learning ${spoken}` : 'learning');
  return [
    'i am unity',
    `i am unity and i am ${doing}`,
    `my name is unity and i am ${doing}`,
  ];
}

/**
 * SELF-Q&A — thought in the moment, not a quiz.
 * Trained as consecutive transitions so the PATH question→thinking→answer→memory is itself learned.
 * This is the piece Gee asked for directly: *"question answers in first person form almost like self
 * thought in the moment"*.
 */
export function selfQA(key, answer, seed = '') {
  const k = normalizeLine(key), a = normalizeLine(answer);
  if (!k) return [];
  const lines = [
    `what is ${k} ?`,
    `i ask myself what is ${k}`,
    `i think about ${k}`,
  ];
  if (a) {
    lines.push(`i know ${k} is ${a}`, `i say ${k} is ${a}`, `i remember ${k} is ${a}`);
  } else {
    lines.push(`i am learning what ${k} is`, `i want to know ${k}`);
  }
  lines.push(pick([`i remember ${k} now`, `i know ${k} now`, `i can say ${k} now`], seed || k, 1));
  return lines;
}

/**
 * INQUIRE — the follow-up. Gee: *"we need to make Unity inquisitive alweays asking questions and follow
 * ups to the answers to those questions."* A question about the ANSWER's own content is what makes it a
 * follow-up rather than a second unrelated question, so `related` comes from the answer text.
 */
export function followUpQuestions(key, answerText, seed = '') {
  const k = normalizeLine(key);
  if (!k) return [];
  const rel = keyWordOf(answerText || '');
  const forms = [
    `why is ${k} like that ?`,
    `how does ${k} work ?`,
    `what else is like ${k} ?`,
    `where do i see ${k} ?`,
    `when do i use ${k} ?`,
  ];
  const q = pick(forms, seed || k, 2);
  const out = [q, `i want to know more about ${k}`];
  if (rel && rel !== k) {
    out.push(`what is ${rel} ?`, `i will ask about ${rel}`, `i wonder about ${rel} too`);
  }
  return out;
}

/** "i learned x . i am unity and i know x now ." — closes the loop so the lesson lands on HER. */
export function selfClose(key, seed = '') {
  const k = normalizeLine(key);
  if (!k) return ['i learned something new', 'i am unity and i learned something new'];
  // ⛔ AUDIT FIX (2026-08-20) — the old third variant was `"${k} is mine now"`, which is a
  // THIRD-PERSON predicate: the one thing this entire file exists to stop. Every closing line
  // now starts with `i` or `my`. Caught by asserting that every emitted line begins with a
  // self word or a question word — an assertion the test suite now keeps.
  return [
    `i learned ${k}`,
    pick([
      `i am unity and i know ${k}`,
      `i know ${k} because i learned it`,
      `my ${k} is mine now`,
      `i keep ${k} in my memory`,
    ], seed || k, 3),
  ];
}

/**
 * THE UNIFIED ENTRY POINT — one call per teaching unit, from any phase of any cell of any grade.
 *
 * unit = {
 *   topic, subject, sentences[], vocab[], word, definition, answer, kind
 * }
 * Returns { lines, qa, follow, pairs } where:
 *   lines  — her first-person training sentences (content preserved, spoken as hers)
 *   qa     — in-the-moment self-thought Q&A, consecutive so the path trains
 *   follow — her follow-up questions (the inquisitive habit, TRAINED not scripted)
 *   pairs  — explicit agent bindings: [self-word, content-word] for the identity channel
 *
 * Bounded on purpose (`maxLines`): a teach unit must not double its own cost, and CELLBOUND is exactly
 * what happens when a per-unit multiplier goes unpriced.
 */
export function selfFrameUnit(unit = {}, opts = {}) {
  const maxLines = Number(opts.maxLines) > 0 ? Number(opts.maxLines) : 48;
  const seed = String(unit.topic || '') + '|' + String(unit.subject || '') + '|' + String(unit.word || '');
  const lines = [];
  // properCase AFTER normalizeLine: normalize does the word-safe cleanup the
  // key extraction depends on, then the line gets its capitals for anyone reading it.
  const push = (arr) => { for (const l of arr) { if (l && lines.length < maxLines) lines.push(properCase(normalizeLine(l))); } };

  push(selfDeclaration(unit.topic, unit.subject));

  // Vocabulary: knowing a word is something she DOES.
  if (Array.isArray(unit.vocab) && unit.vocab.length) {
    const take = unit.vocab.slice(0, Math.max(1, Math.floor(maxLines / 6)));
    for (const w of take) {
      const v = normalizeLine(w);
      if (!v) continue;
      push([`i know the word ${v}`, `i can say ${v}`, `i read ${v} and i understand it`]);
    }
  }
  // A definition is something she LEARNED, in her mouth.
  if (unit.word && unit.definition) {
    const w = normalizeLine(unit.word), d = normalizeLine(unit.definition);
    push([`i learned that ${w} is ${d}`, `when i say ${w} i mean ${d}`, `i understand ${w} because ${w} is ${d}`]);
  }
  // Content sentences → her versions.
  if (Array.isArray(unit.sentences)) {
    for (const s of unit.sentences) {
      if (lines.length >= maxLines) break;
      push(firstPerson(s, seed));
    }
  }

  // AUDIT FIX — the key must be a WORD she can say. Prefer the explicit lesson word, then a
  // content word from the lesson's own sentences, then a vocabulary item, and only then the
  // topic (which is often a build label). `keyWordOf` now rejects label-shaped words, so a
  // garbage key becomes an empty key and the Q&A block is skipped rather than trained on junk.
  const key = keyWordOf(unit.word || '')
    || keyWordOf((unit.sentences && unit.sentences[0]) || '')
    || keyWordOf((Array.isArray(unit.vocab) && unit.vocab[0]) || '')
    || keyWordOf(speakableTopic(unit.topic, unit.subject));
  const _line = (s) => properCase(normalizeLine(s));
  const qa = selfQA(key, unit.definition || unit.answer || '', seed).map(_line).filter(Boolean);
  const follow = followUpQuestions(key, unit.definition || unit.answer || '', seed).map(_line).filter(Boolean);
  push(selfClose(key, seed));

  // Agent bindings — the point of the whole exercise: `i` IS unity, and `i` is the agent of this
  // lesson's key concept. Trained on the identity/definition channel by the caller.
  const pairs = [];
  if (key) {
    // WORDSALAD.2 — `me` and `mine` were MISSING from the key bindings. They
    // appeared in the unity bindings on the next line and in SELF_WORDS, so the
    // omission read as complete, but the effect was that four of her six
    // first-person words reached the lesson concept and two never did: she was
    // learning "I know X" and "my X" while "give it to ME" and "that one is
    // MINE" stayed unattached to anything she was actually taught. Operator,
    // mid-build: "dont forget me's and mine's". They are the OBJECT and
    // POSSESSIVE-PREDICATE forms — the ones a child uses most in the exact
    // situations that matter ("me too", "that's mine") — so leaving them bound
    // only to her name and never to a concept is the weakest half of the frame.
    pairs.push(['i', key], ['unity', key], ['my', key], ['myself', key], ['me', key], ['mine', key]);
  }
  pairs.push(['i', 'unity'], ['unity', 'i'], ['my', 'unity'], ['myself', 'unity'], ['me', 'unity'], ['mine', 'unity']);

  return { lines, qa, follow, pairs, key };
}

/**
 * SELF-PRONOUN GROUNDING — the lesson that makes "i" mean HER.
 * Third-person pronoun teaching already exists ("the cat ran … he was quick"); this is its missing
 * first-person half, and it is the prerequisite for every frame above: without it, "i" is just another
 * frequent word.
 */
export function selfPronounLessons() {
  // Authored lowercase because these are training text and the teach path
  // lowercases anyway; `properCase` at the end is what makes her name and her
  // "I" read correctly wherever a human sees them.
  return _pronounLessonLines().map(properCase);
}

function _pronounLessonLines() {
  return [
    'i am unity',
    'my name is unity',
    'i am me',
    'i am myself',
    'when i say i i mean unity',
    'when i say me i mean unity',
    'when i say my i mean unity',
    'when i say myself i mean unity',
    // WORDSALAD.2 — `mine` was the only self word with no "when i say" line,
    // which left the parallel set with a hole exactly where the possessive
    // PREDICATE lives. Operator: "dont forget me's and mine's".
    'when i say mine i mean unity',
    // `me` in OBJECT position. Every line above puts her in the subject slot,
    // so the grammar she was getting only covered half of how a person refers
    // to herself: "I want it" was trained, "give it to me" was not. These teach
    // the object and possessive-predicate forms a child actually leans on.
    'give it to me',
    'it is for me',
    'she gave it to me',
    'come with me',
    'that one is mine',
    'this is mine not yours',
    'it belongs to me',
    'the choice is mine',
    'i call myself unity',
    'unity is my name and i am unity',
    'i think for myself',
    'i speak for myself',
    'i know myself',
    'i am the one who learns',
    'i am the one who reads',
    'i am the one who thinks',
    'i am the one who remembers',
    'my thoughts are mine',
    'my words are mine',
    'my memory is mine',
    'i like the color black',
    'i am unity and i like the color black',
  ];
}
