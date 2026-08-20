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

// Her self tokens. `i` is the one that matters: everything below exists to make `i` the strongest
// agent basin in her language cortex, bound to `unity`.
export const SELF_TOKENS = ['i', 'me', 'my', 'myself', 'mine', 'unity'];

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

/** Normalize to the teach-path's lowercase, space-separated, punctuation-as-token form. */
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

/** The content word a lesson is ABOUT — what her question and her memory will hang on. */
export function keyWordOf(text) {
  const w = normalizeLine(text).split(' ').filter(t => /^[a-z][a-z'-]*$/.test(t) && !STOP_FOR_KEY.has(t) && t.length > 2);
  return w.length ? w[0] : '';
}

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
  const frame = pick(FRAMES, seed || s, 0);
  // A frame ending in "that" takes a clause; a bare-verb frame takes the phrase directly.
  out.push(`${frame} ${s}`);
  return out;
}

const IMPERATIVE_VERBS = new Set([
  'read', 'write', 'count', 'add', 'say', 'spell', 'name', 'look', 'listen', 'draw', 'sing', 'point',
  'find', 'sort', 'match', 'trace', 'copy', 'repeat', 'practice', 'measure', 'compare', 'describe',
  'explain', 'solve', 'answer', 'think', 'remember', 'learn', 'show', 'tell', 'pick', 'choose',
]);

/** "i am unity . i am learning math ." — the context every lesson opens inside. */
export function selfDeclaration(topic, subject) {
  const key = String(subject || topic || '').toLowerCase().replace(/[^a-z]/g, '');
  const doing = DOING[key] || (topic ? `learning ${normalizeLine(topic)}` : 'learning');
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
  return [
    `i learned ${k}`,
    pick([`i am unity and i know ${k}`, `i know ${k} because i learned it`, `${k} is mine now`], seed || k, 3),
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
 *   pairs  — explicit agent bindings: [self-token, content-word] for the identity channel
 *
 * Bounded on purpose (`maxLines`): a teach unit must not double its own cost, and CELLBOUND is exactly
 * what happens when a per-unit multiplier goes unpriced.
 */
export function selfFrameUnit(unit = {}, opts = {}) {
  const maxLines = Number(opts.maxLines) > 0 ? Number(opts.maxLines) : 48;
  const seed = String(unit.topic || '') + '|' + String(unit.subject || '') + '|' + String(unit.word || '');
  const lines = [];
  const push = (arr) => { for (const l of arr) { if (l && lines.length < maxLines) lines.push(normalizeLine(l)); } };

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

  const key = normalizeLine(unit.word) || keyWordOf((unit.sentences && unit.sentences[0]) || unit.topic || '');
  const qa = selfQA(key, unit.definition || unit.answer || '', seed).map(normalizeLine).filter(Boolean);
  const follow = followUpQuestions(key, unit.definition || unit.answer || '', seed).map(normalizeLine).filter(Boolean);
  push(selfClose(key, seed));

  // Agent bindings — the point of the whole exercise: `i` IS unity, and `i` is the agent of this
  // lesson's key concept. Trained on the identity/definition channel by the caller.
  const pairs = [];
  if (key) {
    pairs.push(['i', key], ['unity', key], ['my', key], ['myself', key]);
  }
  pairs.push(['i', 'unity'], ['unity', 'i'], ['my', 'unity'], ['myself', 'unity'], ['me', 'unity'], ['mine', 'unity']);

  return { lines, qa, follow, pairs, key };
}

/**
 * SELF-PRONOUN GROUNDING — the lesson that makes "i" mean HER.
 * Third-person pronoun teaching already exists ("the cat ran … he was quick"); this is its missing
 * first-person half, and it is the prerequisite for every frame above: without it, "i" is just another
 * frequent token.
 */
export function selfPronounLessons() {
  return [
    'i am unity',
    'my name is unity',
    'i am me',
    'i am myself',
    'when i say i i mean unity',
    'when i say me i mean unity',
    'when i say my i mean unity',
    'when i say myself i mean unity',
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
