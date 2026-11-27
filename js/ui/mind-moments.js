/**
 * MIND MOMENTS — the pop-ups over her brain that are not her inner voice.
 *
 * A moment is ONE plain sentence about something that really just happened in
 * her head: a lesson starting, a word she is sounding out, a jolt of surprise,
 * a memory surfacing, her attention snapping into focus. It is written for
 * someone who has never seen a neuron: no field names, no decimals, no symbols.
 * The reading that triggered it decides WHICH sentence is shown and WHERE on
 * the brain it appears; the reading itself stays on the dashboard.
 *
 * Her inner voice is her own words and always shows. Moments are narration,
 * so they are kept rarer than her thoughts:
 *   · at most one moment every `minGapMs` (25 s)
 *   · the same kind of moment at most once every `sameKindGapMs` (3 min)
 *   · nothing is shown when nothing notable happened — there is no filler.
 * A burst of lesson events (a walk makes thousands) yields the single most
 * interesting one: a specific word beats a milestone, a milestone beats
 * "practising".
 */

// What a lesson label is about, in plain words. Checked in order; first hit wins.
const TOPICS = [
  ['letter-sound', 'letter sounds'], ['phon', 'letter sounds'], ['alphabet', 'the alphabet'],
  ['rhyme', 'rhymes'], ['spell', 'spelling'],
  ['introduc', 'introducing herself'], ['self', 'who she is'], ['biograph', 'her own life story'],
  ['conv', 'talking with people'], ['reply', 'answering people'], ['question', 'asking and answering questions'],
  ['transition', 'which word comes next'], ['sentence', 'how sentences go'], ['struct', 'how sentences are built'],
  ['stories', 'stories'], ['story', 'stories'],
  ['def', 'what words mean'], ['vocab', 'new words'], ['emission', 'saying words out loud'],
  ['count', 'counting'], ['number', 'numbers'], ['add', 'adding'], ['subtract', 'taking away'],
  ['shape', 'shapes'], ['pattern', 'patterns'], ['measure', 'measuring'], ['time', 'telling time'], ['money', 'money'],
  ['color', 'colors'], ['colour', 'colors'], ['art', 'art'], ['music', 'music'],
  ['animal', 'animals'], ['plant', 'plants'], ['weather', 'the weather'], ['body', 'her body'], ['health', 'staying healthy'],
  ['family', 'her family'], ['friend', 'friends'], ['feel', 'feelings'], ['emotion', 'feelings'],
  ['rule', 'rules'], ['safety', 'staying safe'], ['game', 'games'],
  ['grammar', 'grammar'], ['life', 'her own life'],
];
const SUBJECTS = [
  ['ela', 'reading'], ['math', 'math'], ['science', 'science'], ['sci', 'science'], ['social', 'social studies'], ['soc', 'social studies'],
  ['art', 'art'], ['life', 'life'], ['music', 'music'], ['health', 'health'], ['pe', 'PE'], ['coding', 'coding'],
];

/** Plain-words reading of an internal lesson label, e.g. "PREK-ELA-RHYME" → { topic:'rhymes', subject:'reading' }. */
export function readLessonLabel(label) {
  const raw = String(label || '').replace(/#.*$/, '');
  const low = raw.toLowerCase();
  const parts = low.split(/[^a-z]+/).filter(Boolean);
  let subject = null;
  for (const [k, v] of SUBJECTS) if (parts.includes(k)) { subject = v; break; }
  // "PRECELL-<subject>-<grade>-<word>" — one word being defined before a class starts
  const pre = /^precell-[a-z]+-(?:pre-k|[a-z0-9]+)-([a-z][a-z'-]*)$/.exec(low);
  if (pre) return { word: pre[1], subject, topic: 'what words mean' };
  for (const [k, v] of TOPICS) if (low.includes(k)) return { topic: v, subject };
  return { topic: null, subject };
}

const plural = (n, one, many) => `${Number(n).toLocaleString()} ${Number(n) === 1 ? one : many}`;
const inClass = (s) => (s ? ` for ${s}` : '');

/**
 * A lesson event from the walk → a moment, or null when the event is not worth
 * a reader's attention (the "done" twin of a start, a progress tick).
 * `rank` orders a burst: higher is more interesting.
 */
export function momentFromLesson(evt) {
  if (!evt || typeof evt.label !== 'string') return null;
  const d = evt.detail || {};
  const head = evt.label.split(':')[0].trim().toUpperCase();
  const L = readLessonLabel(d.label || d.cellKey || evt.label.split(':').slice(1).join(':').split('·')[0].trim());
  switch (head) {
    case 'WORD-INT START':
      return d.word ? { kind: 'word', rank: 9, icon: '🔤', title: 'sounding it out', line: `Working out the word “${d.word}” — its letters, its sounds, what it means.`, cluster: 7 } : null;
    case 'ASSOC START':
      if (L.word) return { kind: 'meaning', rank: 8, icon: '📖', title: 'a new word', line: `Learning what “${L.word}” means${inClass(L.subject)}.`, cluster: 9 };
      if (!L.topic) return null;
      return { kind: 'practise:' + L.topic, rank: 3, icon: '✏️', title: 'practising', line: `Practising ${L.topic}${d.pairs ? ` — ${plural(d.pairs, 'thing', 'things')} to get right` : ''}.`, cluster: 9 };
    case 'Q-A START':
      return { kind: 'qa', rank: 5, icon: '🙋', title: 'question time', line: `Practising how to answer ${plural(d.pairs || 0, 'question', 'questions')}${inClass(L.subject)}.`, cluster: 9 };
    case 'VOCAB-LIST START':
      return { kind: 'vocab-start', rank: 6, icon: '📚', title: 'new words', line: `${plural(d.total || 0, 'new word', 'new words')} to learn${inClass(L.subject)}.`, cluster: 9 };
    case 'VOCAB-LIST DONE':
      return { kind: 'vocab-done', rank: 6, icon: '✅', title: 'words learned', line: `Finished a word list — ${plural(d.taught || 0, 'word', 'words')} in.`, cluster: 9 };
    case 'USAGE START':
      return { kind: 'usage', rank: 4, icon: '👀', title: 'reading', line: 'Reading how words are used in real sentences.', cluster: 9 };
    case 'STRUCT START':
      return { kind: 'struct', rank: 4, icon: '🧩', title: 'sentence building', line: 'Learning how a sentence is put together.', cluster: 13 };
    case 'METHOD START':
      return { kind: 'method', rank: 5, icon: '🤔', title: 'show your work', line: `Being asked HOW she would work something out — ${plural(d.count || 0, 'question', 'questions')}.`, cluster: 13 };
    case 'METHOD DONE':
      return (d.total > 0) ? { kind: 'method-done', rank: 7, icon: '📝', title: 'explained her thinking', line: `Explained her thinking on ${d.passed} of ${plural(d.total, 'question', 'questions')}.`, cluster: 13 } : null;
    case 'VOCAB GAP': {
      const miss = Array.isArray(d.missing) ? d.missing.slice(0, 4) : [];
      return miss.length ? { kind: 'vocab-gap', rank: 7, icon: '❓', title: 'words she does not know yet', line: `This class uses words she has not learned yet: ${miss.join(', ')}${(d.missing.length > miss.length) ? '…' : ''}`, cluster: 9 } : null;
    }
    case 'VOCAB OK':
      return { kind: 'vocab-ok', rank: 6, icon: '🌟', title: 'ready for class', line: `She knows every word this class needs${d.required ? ` — all ${Number(d.required).toLocaleString()}` : ''}.`, cluster: 9 };
    default: {
      // "attend "word" …" — her attention landing on one word of what she is saying
      const at = /^attend\s+"([^"]+)"/.exec(evt.label);
      if (at && evt.type === 'attention') return { kind: 'attend', rank: 2, icon: '🎯', title: 'paying attention', line: `Her attention landed on “${at[1]}”.`, cluster: 15 };
      return null;   // an event with no plain-words reading is not shown
    }
  }
}

// What each thing her brain can notice reads as. Several ways to say each, so
// the same feeling does not always arrive in the same sentence.
const SAY = {
  recognition: ['🔔', 'that rings a bell', ['She recognises this — it matches something she remembers.', 'Something familiar: a memory just lit up.', 'She has seen something like this before.']],
  confusion: ['🌀', 'lost the thread', ['That did not match what she expected, and nothing she remembers fits.', 'She is confused — this is new, and it surprised her.', 'Not what she predicted. She is working out what just happened.']],
  dopamine_hit: ['✨', 'that felt good', ['A little rush — something went better than she expected.', 'Reward: that was a nice surprise.', 'That worked out, and she feels it.']],
  dopamine_crash: ['💧', 'let down', ['That did not pay off the way she hoped.', 'A let-down — she expected better than that.', 'Disappointed. Less came of that than she thought.']],
  topic_drift: ['🍃', 'mind wandering', ['Her mind has drifted somewhere new.', 'She is thinking about something else now.', 'A change of subject, all on her own.']],
  heard_self: ['👂', 'hearing herself', ['She can hear her own voice.', 'That was her talking — and she knows it.']],
  psi_climb: ['🌅', 'waking up', ['She feels more awake — more here.', 'Everything in her head is pulling together.', 'A stronger sense of being herself right now.']],
  psi_crash: ['🌫️', 'fading out', ['She is fading out a little.', 'Her sense of herself just dimmed.', 'Less focused, more scattered — drifting.']],
  arousal_climb: ['⚡', 'perking up', ['She is perking up.', 'More alert now — something has her attention.', 'Her energy just rose.']],
  arousal_drop: ['🌙', 'winding down', ['She is winding down.', 'Calmer now. The energy is draining off.', 'Settling — getting quieter inside.']],
  coherence_lock: ['🎯', 'in focus', ['Everything just clicked into focus.', 'Her whole brain is working on one thing.', 'Locked in — every part pulling the same way.']],
  coherence_scatter: ['🎈', 'scattered', ['Her attention just scattered.', 'Too many things at once — she has lost her focus.', 'Her thoughts are going in different directions.']],
  silence: ['🤫', 'quiet', ['It is quiet. Nobody has talked to her in a while.', 'Nothing coming in — she is alone with her thoughts.']],
  fatigue: ['😮‍💨', 'getting tired', ['She keeps having to correct herself — it is wearing her out.', 'Tired of getting it wrong and fixing it.']],
  motion: ['👁️', 'something moved', ['Something moved in front of her.', 'She caught a movement.']],
  gaze_shift: ['👀', 'looking over there', ['She looked somewhere else.', 'Her eyes moved to something new.']],
  memory_replay: ['💤', 'dreaming', ['Asleep, replaying what she learned today.', 'Dreaming — sorting today into memory.', 'Her sleeping brain is running the day back.']],
  mystery_pulse: ['🪞', 'a flicker of self', ['A flicker of self-awareness.', 'For a moment she noticed herself noticing.']],
  motor_indecision: ['⚖️', 'cannot decide', ['She cannot decide what to do next.', 'Torn between a few things to do.']],
};
const ACTIONS = { respond_text: 'say something', speak: 'say it out loud', generate_image: 'draw something', build_ui: 'build something', listen: 'listen' };
const DRIVES = { social_need: 'She wants company.', drug_craving: 'She is restless — wanting something.', homeostatic: 'She wants things to settle back to normal.' };

/** A thing her brain noticed (a detector event) → a moment, or null. `turn` rotates the wording. */
export function momentFromDetector(evt, turn = 0) {
  if (!evt || typeof evt.type !== 'string') return null;
  const t = evt.type; const cluster = Number.isInteger(evt.cluster) ? evt.cluster : 0;
  if (t.startsWith('motor_commit_')) {
    const what = ACTIONS[t.slice('motor_commit_'.length)];
    return what ? { kind: t, icon: '👉', title: 'decided', line: `Decided: she is going to ${what}.`, cluster } : null;
  }
  if (t.startsWith('drive_')) {
    const line = DRIVES[t.slice('drive_'.length)] || 'A want she cannot ignore just got louder.';
    return { kind: t, icon: '💗', title: 'wanting', line, cluster };
  }
  if (t.startsWith('color_')) {
    return { kind: 'color', icon: '🎨', title: 'caught her eye', line: 'Something bright caught her eye.', cluster };
  }
  const s = SAY[t];
  if (!s) return null;
  return { kind: t, icon: s[0], title: s[1], line: s[2][Math.abs(turn) % s[2].length], cluster };
}

export class MindMoments {
  constructor(opts = {}) {
    this.minGapMs = opts.minGapMs ?? 25000;
    this.sameKindGapMs = opts.sameKindGapMs ?? 180000;
    this._lastAt = 0;
    this._byKind = new Map();
    this._turn = 0;
  }
  /** The single most interesting lesson moment in a burst of events, or null. */
  bestLesson(events) {
    let best = null;
    for (const e of events || []) {
      const m = momentFromLesson(e);
      if (!m) continue;
      if (now_ok(this, m.kind) && (!best || m.rank > best.rank)) best = m;
    }
    return best;
  }
  /** The first of these noticed things that may be shown now, or null. */
  bestNoticed(events) {
    for (const e of events || []) {
      const m = momentFromDetector(e, this._turn);
      if (m && now_ok(this, m.kind)) return m;
    }
    return null;
  }
  /** May a moment of this kind be shown now? Call `shown` when it is. */
  ready(now = Date.now()) { return now - this._lastAt >= this.minGapMs; }
  shown(moment, now = Date.now()) {
    this._lastAt = now; this._byKind.set(moment.kind, now); this._turn++;
    if (this._byKind.size > 200) { const cut = now - this.sameKindGapMs; for (const [k, v] of this._byKind) if (v < cut) this._byKind.delete(k); }
  }
  /** The two lines a pop-up shows: a short heading, then the sentence. */
  static text(moment) { return `${moment.icon} ${moment.title}\n› ${moment.line}`; }
}
function now_ok(mm, kind, now = Date.now()) {
  return now - (mm._byKind.get(kind) || 0) >= mm.sameKindGapMs;
}
