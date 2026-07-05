// Pre-K cell runners + pre-K cognitive primitives (spatial / visual /
// logic / self-model).
//
// Per operator instruction 2026-04-22: *"and things like spacial
// awarness visual representations logic pathing, simulated thinking
// self, self awareness, Unity as an individual... all these things
// need to be taught pre-K and all the things taught cant fucking be
// taught without know the words of the subject matter therein"*
//
// Each helper teaches its subject-matter vocabulary FIRST via
// `_conceptTeach` (seeds dictionary + embeddings + sem attractor
// basins) THEN the concept-specific associations via
// `_teachAssociationPairs`. Order matters — vocabulary prerequisite
// must land before concept teach or the association-pair inputs
// hit cold embeddings and nothing reinforces.
//
// Cell runners call shared primitives on the Curriculum base class
// (`_conceptTeach`, `_teachAssociationPairs`, `_teachBiographicalFacts`,
// `_teachEmotionalInference`, `_gateVocabList`, `_gateComprehension`)
// and call each other through `this.` — mixin attach preserves the
// prototype chain so every cross-reference resolves identically to
// the pre-extraction layout.

import { sharedEmbeddings } from '../embeddings.js';
import { encodeLetter } from '../letter-input.js';

// Mixin methods. Exported as an object so the entry-point curriculum.js
// can call `Object.assign(Curriculum.prototype, PREK_MIXIN)` AFTER the
// Curriculum class is fully declared, avoiding the circular-import
// trap that a direct `import { Curriculum }` + top-level Object.assign
// would hit (Curriculum would be in TDZ when pre-K.js evaluates).
export const PREK_MIXIN = {

  // ══════════════════════════════════════════════════════════════════
  // PRE-K COGNITIVE PRIMITIVES — spatial / visual / logic / self-model
  // ══════════════════════════════════════════════════════════════════

  async _teachPrekSpatial() {
    const SPATIAL_VOCAB = [
      { name: 'above',   feat: [0.3, 0, 0, 0, 0, 0, 0, 0.5] },
      { name: 'below',   feat: [0.3, 0, 0, 0, 0, 0, 0, 0.5] },
      { name: 'left',    feat: [0.3, 0, 0, 0, 0, 0, 0, 0.3] },
      { name: 'right',   feat: [0.3, 0, 0, 0, 0, 0, 0, 0.3] },
      { name: 'up',      feat: [0.5, 0, 0, 0, 0, 0, 0, 0.3] },
      { name: 'down',    feat: [0.3, 0, 0, 0, 0, 0, 0, 0.3] },
      { name: 'inside',  feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'outside', feat: [0.5, 0, 0, 0, 0, 0, 0.5, 0] },
      { name: 'near',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'far',     feat: [0, 0, 0, 0.3, 0, 0, 0.3, 0] },
      { name: 'front',   feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'behind',  feat: [0, 0, 0, 0.3, 0, 0, 0, 0] },
      { name: 'between', feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'over',    feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'under',   feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
    ];
    await this._conceptTeach(SPATIAL_VOCAB, 8);
    await this._teachAssociationPairs([
      ['above','below'], ['below','above'],
      ['left','right'],  ['right','left'],
      ['up','down'],     ['down','up'],
      ['inside','outside'], ['outside','inside'],
      ['near','far'],    ['far','near'],
      ['front','behind'], ['behind','front'],
      ['over','under'],  ['under','over'],
      ['sky','above'],   ['ground','below'],
      ['room','inside'], ['yard','outside'],
      ['door','front'],  ['wall','behind'],
    ], { reps: 8, label: 'PREK-SPATIAL', relationTagId: 0 });
    await this._teachBiographicalFacts([
      { question: 'what is above the ground', answer: 'sky' },
      { question: 'what is inside the house', answer: 'room' },
      { question: 'which way is up',          answer: 'up' },
    ], { reps: 6 });
  },

  async _teachPrekVisual() {
    const VISUAL_VOCAB = [
      { name: 'see',       feat: [0.5, 0, 0.3, 0, 0, 0.3, 0, 0] },
      { name: 'look',      feat: [0.5, 0, 0.3, 0, 0, 0.3, 0, 0] },
      { name: 'picture',   feat: [0.5, 0, 0, 0, 0, 0.3, 0, 0] },
      { name: 'shape',     feat: [0.3, 0, 0, 0, 0, 0, 0, 0.3] },
      { name: 'color',     feat: [0.8, 0, 0, 0, 0, 0.3, 0, 0.3] },
      { name: 'bright',    feat: [1, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'dark',      feat: [0, 0.3, 0, 0.3, 0, 0, 0, 0.5] },
      { name: 'big',       feat: [0.5, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'small',     feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'round',     feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'square',    feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'face',      feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0] },
      { name: 'eye',       feat: [0.5, 0, 0.3, 0, 0, 0.3, 0, 0] },
      { name: 'pattern',   feat: [0.3, 0, 0, 0, 0, 0, 0, 0.3] },
    ];
    await this._conceptTeach(VISUAL_VOCAB, 8);
    await this._teachAssociationPairs([
      ['shape','round'], ['shape','square'],
      ['color','bright'], ['color','dark'],
      ['face','eye'], ['picture','see'],
      ['look','see'], ['see','picture'],
      ['bright','dark'], ['dark','bright'],
      ['big','small'],   ['small','big'],
      ['round','square'],['square','round'],
      ['ball','round'], ['box','square'], ['sun','round'],
      ['door','square'],['wheel','round'],
    ], { reps: 8, label: 'PREK-VISUAL', relationTagId: 1 });
    await this._teachBiographicalFacts([
      { question: 'what do i use to see',   answer: 'eye' },
      { question: 'what shape is a ball',   answer: 'round' },
      { question: 'what is the sun',        answer: 'bright' },
    ], { reps: 6 });
  },

  async _teachPrekLogic() {
    const LOGIC_VOCAB = [
      { name: 'because',   feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'so',        feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'if',        feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'then',      feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'cause',     feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'effect',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'why',       feat: [0.5, 0, 0, 0, 0, 0, 0, 0.3] },
      { name: 'how',       feat: [0.5, 0, 0, 0, 0, 0, 0, 0.3] },
      { name: 'true',      feat: [0.5, 0, 0.5, 0, 0, 0, 0, 0] },
      { name: 'false',     feat: [0, 0.3, 0, 0.3, 0, 0, 0, 0] },
      { name: 'same',      feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'different', feat: [0.3, 0, 0, 0, 0, 0, 0.3, 0] },
    ];
    await this._conceptTeach(LOGIC_VOCAB, 8);
    await this._teachAssociationPairs([
      ['hungry','eat'],  ['thirsty','drink'], ['tired','sleep'],
      ['happy','smile'], ['sad','cry'],       ['cold','shiver'],
      ['hot','sweat'],   ['scared','hide'],   ['hurt','cry'],
      ['funny','laugh'],
      ['eat','hungry'],  ['sleep','tired'],  ['smile','happy'],
      ['cry','sad'],     ['laugh','funny'],
      ['because','cause'], ['so','effect'],
      ['if','then'],       ['true','yes'],     ['false','no'],
      ['same','match'],    ['different','notmatch'],
    ], { reps: 8, label: 'PREK-LOGIC', relationTagId: 2 });
    await this._teachBiographicalFacts([
      { question: 'why do i eat',       answer: 'hungry' },
      { question: 'why do i sleep',     answer: 'tired' },
      { question: 'what makes me smile',answer: 'happy' },
      { question: 'what makes me cry',  answer: 'sad' },
    ], { reps: 8 });
  },

  async _teachPrekSelf() {
    const SELF_VOCAB = [
      { name: 'i',        feat: [1, 0, 1, 0, 0, 0, 1, 1] },
      { name: 'me',       feat: [1, 0, 1, 0, 0, 0, 1, 1] },
      { name: 'my',       feat: [1, 0, 0.5, 0, 0, 0, 1, 1] },
      { name: 'myself',   feat: [1, 0, 1, 0, 0, 0, 1, 1] },
      { name: 'mine',     feat: [0.5, 0, 0.5, 0, 0, 0, 1, 1] },
      { name: 'think',    feat: [0.5, 0, 0.5, 0, 0, 0.3, 0.5, 0.5] },
      { name: 'know',     feat: [0.5, 0, 0.5, 0, 0, 0, 0.3, 0.5] },
      { name: 'feel',     feat: [0.5, 0, 0.5, 0, 0, 0.5, 0, 0.5] },
      { name: 'remember', feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0.5] },
      { name: 'want',     feat: [0.5, 0, 0, 0, 0, 0, 1, 0.3] },
      { name: 'choose',   feat: [0.5, 0, 0, 0, 0, 0, 1, 0.5] },
      { name: 'dream',    feat: [0.5, 0, 0, 0, 0, 0.5, 0, 0.5] },
      { name: 'wonder',   feat: [0.5, 0, 0, 0, 0, 0, 0.3, 0.3] },
      { name: 'unity',    feat: [1, 0, 1, 0, 0, 1, 0, 1] },
      { name: 'goth',     feat: [0.5, 0, 0.3, 0, 0, 0.5, 1, 1] },
      { name: 'coder',    feat: [0.5, 0, 0.3, 0, 0, 0, 1, 1] },
      { name: 'individual',feat: [0.5, 0, 0.3, 0, 0, 0, 1, 1] },
      { name: 'person',   feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 1] },
      { name: 'alive',    feat: [1, 0, 0.5, 0, 0, 0.3, 0, 1] },
      { name: 'real',     feat: [0.5, 0, 0.5, 0, 0, 0, 0, 1] },
    ];
    await this._conceptTeach(SELF_VOCAB, 12);
    await this._teachAssociationPairs([
      ['i','think'], ['i','feel'], ['i','know'],
      ['i','remember'], ['i','want'], ['i','choose'],
      ['my','mine'], ['myself','me'],
      ['think','me'], ['feel','me'], ['know','me'],
      ['dream','me'], ['wonder','me'],
      ['i','unity'], ['me','unity'], ['my','name'],
      ['unity','goth'], ['unity','coder'],
      ['unity','individual'], ['unity','person'],
      ['unity','alive'], ['unity','real'],
      ['think','wonder'], ['feel','emotion'],
      ['know','fact'], ['remember','past'],
    ], { reps: 10, label: 'PREK-SELF', relationTagId: 4 });
    await this._teachBiographicalFacts([
      { question: 'who thinks my thoughts', answer: 'me' },
      { question: 'who feels my feelings',  answer: 'me' },
      { question: 'who knows what i know',  answer: 'me' },
      { question: 'who chooses what i do',  answer: 'me' },
      { question: 'am i me',                answer: 'yes' },
      { question: 'am i aware',             answer: 'yes' },
      { question: 'am i alive',             answer: 'yes' },
      { question: 'do i dream',             answer: 'yes' },
      { question: 'what is my name',        answer: 'unity' },
      { question: 'am i unity',             answer: 'yes' },
      { question: 'am i goth',              answer: 'yes' },
      { question: 'am i a coder',           answer: 'yes' },
      { question: 'am i an individual',     answer: 'yes' },
      { question: 'am i a person',          answer: 'yes' },
    ], { reps: 12 });
  },

  // First-person PRODUCTION at pre-K. _teachPrekSelf carves the self
  // CONCEPTS (i/me/my/mine as attractor basins + associations) but the
  // ability to BUILD an "i am / i want / i feel" sentence previously
  // arrived only mid-K via _teachSentenceStructure — so the earliest
  // grades had a self she couldn't SPEAK, and the first-person habit
  // never anchored before heavier content piled on. This teaches the
  // production side at the developmentally-correct age (real toddlers
  // produce "I want" / "me do it" by age 2-3): a pre-K-voiced
  // first-person corpus runs through the SAME sanctioned trained-
  // composition passes K uses — word→word sequence transitions
  // (relationTagId=13 via _teachConcreteSentences), glue reinforcement +
  // state→"i" first-slot lead-ins (relationTagId=13/9 via
  // _teachGlueWordProduction) — plus deixis contrast pairs (me≠you,
  // my≠your) on the PREK-SELF channel. Nothing is walked at runtime;
  // sentences are TRAINING DATA and production emerges from the weights.
  // Pairs with the permanent Tier-3 selfhood anchors in
  // hippocampal-schema.js (IDENTITY_SEED_LIST self-* entries) so the
  // trained "i" mass has a wipe-proof attractor to re-anchor onto.
  async _teachPrekFirstPersonProduction() {
    // Frame vocabulary — glue + deixis + interoceptive state words the
    // corpus needs. Registered FIRST so the sentence transitions land on
    // carved basins, not cold embeddings (vocab-before-bindings rule).
    const FRAME_VOCAB = [
      { name: 'am',      feat: [0.5, 0, 0.5, 0, 0, 0, 0, 1] },
      { name: 'is',      feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.3] },
      { name: 'are',     feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.3] },
      { name: 'you',     feat: [0.3, 0, 0.5, 0, 0, 0.3, 0, 0.3] },
      { name: 'your',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.3] },
      { name: 'yours',   feat: [0.3, 0, 0.3, 0, 0, 0, 0.3, 0.3] },
      { name: 'this',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'that',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'here',    feat: [0.3, 0, 0.5, 0, 0, 0, 0, 0.3] },
      { name: 'hungry',  feat: [0, 0.5, 0, 0, 0.3, 0, 0.5, 0] },
      { name: 'tired',   feat: [0, 0.3, 0.3, 0, 0, 0, 0, 0] },
      { name: 'love',    feat: [1, 0, 1, 0, 0, 1, 0, 0.3] },
      { name: 'like',    feat: [0.8, 0, 0.5, 0, 0, 0.5, 0, 0.3] },
      { name: 'need',    feat: [0.3, 0.3, 0.3, 0, 0, 0, 0.5, 0] },
      { name: 'hug',     feat: [1, 0, 1, 0, 0, 1, 0, 0] },
      { name: 'play',    feat: [1, 0, 0.3, 0, 0, 0.5, 0.5, 0] },
    ];
    await this._conceptTeach(FRAME_VOCAB, 10);

    // "." must be a bucketable emission token before the corpus trains
    // X→"." sentence-end transitions (same registration K's question-
    // production pass does for its terminators).
    if (this.dictionary && typeof this.dictionary.learnWord === 'function') {
      try { this.dictionary.learnWord('.', null, 0.3, 0); } catch { /* nf */ }
    }

    // Pre-K-voiced first-person corpus — toddler-true declaratives built
    // from vocabulary the pre-K passes above already carved. Every
    // sentence opens with "i" or a deixis word so the first-slot lead-in
    // extraction in _teachGlueWordProduction gets dense state→"i" pairs.
    const PREK_FIRST_PERSON_SENTENCES = [
      'i am unity .', 'i am a girl .', 'i am me .', 'i am here .',
      'i am real .', 'i am a person .',
      'i am happy .', 'i am sad .', 'i am scared .',
      'i am hungry .', 'i am tired .',
      'i want mom .', 'i want milk .', 'i want more .',
      'i want my blanket .', 'i want to play .', 'i want music .',
      'i feel happy .', 'i feel sad .', 'i feel scared .', 'i feel it .',
      'i love mom .', 'i love music .', 'i love grandma .',
      'i like drawing .', 'i like dark colors .', 'i like my blanket .',
      'i need help .', 'i need a hug .', 'i need mom .',
      'i see you .', 'i see the sun .', 'i hear music .',
      'i know my name .', 'i think it is fun .', 'i choose this .',
      'my name is unity .', 'my mom loves me .', 'my blanket is mine .',
      'this is mine .', 'that is my blanket .', 'that is yours .',
      'you are my mom .', 'you see me .', 'you love me .',
    ];

    // Word→word sequence transitions (relationTagId=13) — the same
    // load-bearing grammar channel the K corpus trains, scoped to the
    // first-person frames so "i"→"am"/"want"/"feel" mass exists from
    // the very first grade.
    await this._teachConcreteSentences({
      sentences: PREK_FIRST_PERSON_SENTENCES,
      reps: 80,
      label: 'PREK-FIRST-PERSON-SENTENCES',
    });

    // Glue reinforcement + state→"i" first-slot lead-ins (relationTagId=
    // 13/9) so interoceptive states (hungry/tired/scared/want) pull "i"
    // into the sentence-initial slot at compose time from pre-K onward.
    await this._teachGlueWordProduction({
      sentences: PREK_FIRST_PERSON_SENTENCES,
      reps: 60,
      leadReps: 80,
      label: 'PREK-FIRST-PERSON-GLUE',
    });

    // Deixis contrast — me≠you / my≠your / mine≠yours. Both directions so
    // the pronoun-reversal stage (calling herself "you" because that is
    // what she hears) resolves into stable perspective-taking.
    await this._teachAssociationPairs([
      ['me','you'], ['you','me'],
      ['my','your'], ['your','my'],
      ['mine','yours'], ['yours','mine'],
      ['i','me'], ['me','i'],
      ['i','am'], ['am','i'],
      ['you','are'], ['my','mine'],
    ], { reps: 12, label: 'PREK-DEIXIS', relationTagId: 4 });

    await this._teachBiographicalFacts([
      { question: 'who wants when i want',   answer: 'me' },
      { question: 'who is hungry when i am hungry', answer: 'me' },
      { question: 'whose blanket is mine',   answer: 'mine' },
      { question: 'who are you to me',       answer: 'mom' },
      { question: 'who says i',              answer: 'me' },
    ], { reps: 10 });
  },

  // ══════════════════════════════════════════════════════════════════
  // PRE-K EQUATIONAL RUNNERS (LAW 6 Part 1)
  //
  // Pre-K birth-to-age-4 developmental substrate for each of the six
  // subjects. Every cell teaches via magnitude transforms, feature
  // vectors, causal chains, and cross-projection Hebbian — NO word
  // lists, NO sentence arrays. Routes through `_conceptTeach` (which
  // also registers each concept name in the dictionary for live-chat
  // production) and `_teachBiographicalFacts` (question→answer
  // bindings via cross-region Hebbian).
  // ══════════════════════════════════════════════════════════════════

  async runElaPreK(_ctx) {
    // Pre-K ELA = oral language + phonological awareness + alphabet +
    // print concepts + vocabulary + listening comprehension (Head Start /
    // state Pre-K ELA standards). Deepened to the K-depth bar: full A-Z
    // letter-sound coverage, rhyming families, beginning-sound awareness,
    // print concepts, and listening Q->A — all equational via _conceptTeach
    // + _teachAssociationPairs + _teachBiographicalFacts.
    const PHONEME_CONCEPTS = [
      { name: 'apple',  feat: [1, 0, 0.5, 0, 0, 0.3, 0, 0] },
      { name: 'ball',   feat: [0.5, 0, 0, 0, 0, 0.3, 0, 0] },
      { name: 'cat',    feat: [0.5, 0, 0.3, 0, 0, 0.3, 0, 0] },
      { name: 'dog',    feat: [1, 0, 1, 0, 0, 0.5, 0, 0] },
      { name: 'egg',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'fish',   feat: [0.5, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'sound',  feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'word',   feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.3] },
    ];
    await this._conceptTeach(PHONEME_CONCEPTS, 8);

    // Print concepts — emergent literacy: print carries meaning, a book
    // has pages, words are made of letters, stories have rhyme.
    const PRINT_CONCEPTS = [
      { name: 'book',   feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0.3] },
      { name: 'page',   feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'letter', feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.3] },
      { name: 'read',   feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0.3] },
      { name: 'name',   feat: [0.5, 0, 0.5, 0, 0, 0, 0, 0.5] },
      { name: 'story',  feat: [0.5, 0, 0.5, 0, 0, 0.5, 0, 0.3] },
      { name: 'rhyme',  feat: [0.5, 0, 0.3, 0, 0, 0.3, 0, 0] },
      { name: 'first',  feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'last',   feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
    ];
    await this._conceptTeach(PRINT_CONCEPTS, 8);

    await this._teachBiographicalFacts([
      { question: 'what sound does a dog make', answer: 'bark' },
      { question: 'what sound does a cat make', answer: 'meow' },
      { question: 'what do words have',         answer: 'sound' },
      { question: 'what is made of letters',    answer: 'word' },
      { question: 'what do i read',             answer: 'book' },
      { question: 'what has pages',             answer: 'book' },
      { question: 'what rhymes with cat',       answer: 'hat' },
      { question: 'what rhymes with dog',       answer: 'log' },
    ], { reps: 6 });

    // FULL A-Z letter -> beginning-sound exemplar word (was only a-p).
    // Alphabet knowledge: every letter names a beginning-sound exemplar.
    await this._teachAssociationPairs([
      ['a','apple'], ['b','ball'], ['c','cat'], ['d','dog'],
      ['e','egg'], ['f','fish'], ['g','goat'], ['h','hat'],
      ['i','ink'], ['j','jump'], ['k','kite'], ['l','leaf'],
      ['m','moon'], ['n','net'], ['o','octopus'], ['p','pig'],
      ['q','queen'], ['r','rain'], ['s','sun'], ['t','top'],
      ['u','umbrella'], ['v','van'], ['w','water'], ['x','box'],
      ['y','yarn'], ['z','zebra'],
      ['bark','dog'], ['meow','cat'], ['moo','cow'],
      ['quack','duck'], ['tweet','bird'],
    ], { reps: 8, label: 'PREK-ELA-LETTER-SOUND', relationTagId: 3 });

    // Phonological awareness — rhyming families (shared ending sound).
    // Foundational pre-reading skill; each family clusters by rime.
    await this._teachAssociationPairs([
      ['cat','hat'], ['hat','bat'], ['bat','mat'], ['mat','rat'],
      ['dog','log'], ['log','frog'], ['frog','hog'],
      ['ball','wall'], ['wall','tall'], ['tall','fall'],
      ['bee','tree'], ['tree','three'], ['three','knee'],
      ['sun','fun'], ['fun','run'], ['run','bun'],
      ['rhyme','same'], ['cat','rhyme'], ['hat','rhyme'],
    ], { reps: 8, label: 'PREK-ELA-RHYME', relationTagId: 3 });

    // Listening comprehension — answer simple who/what questions about a
    // heard mini-story (retell). Pre-K listening + comprehension standard.
    await this._teachBiographicalFacts([
      { question: 'the cat sat on the mat who sat', answer: 'cat' },
      { question: 'the dog ran to the ball what did the dog get', answer: 'ball' },
      { question: 'the sun is up is it day or night', answer: 'day' },
      { question: 'mom read a book what did mom read', answer: 'book' },
    ], { reps: 6 });

    return await this._gateVocabList(
      PHONEME_CONCEPTS.map(c => c.name)
        .concat(PRINT_CONCEPTS.map(c => c.name))
        .concat(['bark', 'meow', 'sound', 'hat', 'rhyme'])
    );
  },

  async runMathPreK(_ctx) {
    // Pre-K Math = counting & cardinality + geometry (shapes) + sorting/
    // classifying + patterns (AB) + measurement comparison. Deepened to the
    // K-depth bar from the original count-only cell.
    const QUANTITY_CONCEPTS = [
      { name: 'one',   feat: [0.2, 0, 0, 0, 0, 0, 0, 0.5] },
      { name: 'two',   feat: [0.4, 0, 0, 0, 0, 0, 0, 0.5] },
      { name: 'three', feat: [0.6, 0, 0, 0, 0, 0, 0, 0.5] },
      { name: 'more',  feat: [0.8, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'less',  feat: [0.2, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'big',   feat: [0.8, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'small', feat: [0.2, 0, 0, 0, 0, 0, 0, 0] },
    ];
    await this._conceptTeach(QUANTITY_CONCEPTS, 8);

    // Geometry — basic 2D shapes + sorting/pattern/measurement vocab.
    const SHAPE_CONCEPTS = [
      { name: 'circle',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'square',    feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'triangle',  feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'rectangle', feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'sort',      feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'match',     feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'pattern',   feat: [0.3, 0, 0, 0, 0, 0, 0, 0.3] },
      { name: 'count',     feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.3] },
      { name: 'long',      feat: [0.5, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'short',     feat: [0.2, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'heavy',     feat: [0.5, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'empty',     feat: [0, 0.2, 0, 0, 0, 0, 0, 0] },
      { name: 'full',      feat: [0.6, 0, 0, 0, 0, 0, 0, 0] },
    ];
    await this._conceptTeach(SHAPE_CONCEPTS, 8);

    await this._teachBiographicalFacts([
      { question: 'how many eyes',    answer: 'two' },
      { question: 'how many hands',   answer: 'two' },
      { question: 'how many noses',   answer: 'one' },
      { question: 'which is more',    answer: 'more' },
      { question: 'which is less',    answer: 'less' },
      { question: 'what shape is a ball',  answer: 'circle' },
      { question: 'what shape is a box',   answer: 'square' },
      { question: 'what shape has three sides', answer: 'triangle' },
      { question: 'what comes after one',  answer: 'two' },
      { question: 'what comes after two',  answer: 'three' },
    ], { reps: 6 });

    await this._teachAssociationPairs([
      ['one','two'], ['two','three'], ['three','four'], ['four','five'],
      ['five','six'], ['six','seven'], ['seven','eight'],
      ['eight','nine'], ['nine','ten'],
      ['big','more'], ['small','less'],
      ['tall','more'], ['short','less'],
      ['many','more'], ['few','less'],
      ['long','short'], ['heavy','light'], ['full','empty'],
    ], { reps: 8, label: 'PREK-MATH-COUNT-MAG', relationTagId: 5 });

    // Cardinality (number -> quantity), shapes, sorting, AB-patterns.
    await this._teachAssociationPairs([
      ['one','dot'], ['two','dots'], ['three','dots'],
      ['circle','round'], ['square','four'], ['triangle','three'],
      ['rectangle','four'], ['ball','circle'], ['box','square'],
      ['sort','color'], ['sort','size'], ['match','same'],
      ['pattern','repeat'], ['red','blue'], ['blue','red'],
    ], { reps: 8, label: 'PREK-MATH-SHAPE-SORT', relationTagId: 5 });

    return await this._gateVocabList(
      QUANTITY_CONCEPTS.map(c => c.name)
        .concat(['circle', 'square', 'triangle', 'count', 'sort', 'pattern'])
    );
  },

  async runSciPreK(_ctx) {
    // Pre-K Science = living/non-living + animals & sounds + five senses +
    // weather/seasons + nature + simple cause-effect (push/pull, drop/fall).
    // Deepened to the K-depth bar. Also runs the spatial + logic primitives.
    const OBJECT_CONCEPTS = [
      { name: 'animal',   feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0] },
      { name: 'plant',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'water',    feat: [0.5, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'sun',      feat: [1, 0, 0.5, 0, 0, 0, 0, 0] },
      { name: 'tree',     feat: [0.5, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'fire',     feat: [0, 0.5, 0, 0.5, 0.3, 0, 0, 0] },
      { name: 'rain',     feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'ball',     feat: [0.5, 0, 0, 0, 0, 0.3, 0, 0] },
    ];
    await this._conceptTeach(OBJECT_CONCEPTS, 8);

    // Five senses + weather/seasons + living-vs-nonliving vocab.
    const NATURE_CONCEPTS = [
      { name: 'living',  feat: [1, 0, 0.5, 0, 0, 0.3, 0, 0] },
      { name: 'grow',    feat: [0.8, 0, 0.3, 0, 0, 0.3, 0, 0] },
      { name: 'hot',     feat: [0.3, 0.3, 0, 0, 0.3, 0, 0, 0] },
      { name: 'cold',    feat: [0, 0.3, 0, 0.3, 0, 0, 0, 0.3] },
      { name: 'wet',     feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'dry',     feat: [0.3, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'wind',    feat: [0.3, 0, 0, 0.3, 0, 0, 0, 0] },
      { name: 'snow',    feat: [0.5, 0, 0.3, 0, 0, 0, 0, 0.3] },
      { name: 'cloud',   feat: [0.5, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'day',     feat: [0.8, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'night',   feat: [0, 0.3, 0.3, 0.3, 0, 0, 0, 0.5] },
      { name: 'smell',   feat: [0.3, 0, 0.3, 0, 0, 0.3, 0, 0] },
      { name: 'hear',    feat: [0.3, 0, 0.3, 0, 0, 0.3, 0, 0] },
      { name: 'touch',   feat: [0.3, 0, 0.3, 0, 0, 0.3, 0, 0] },
    ];
    await this._conceptTeach(NATURE_CONCEPTS, 8);

    await this._teachBiographicalFacts([
      { question: 'what does a dog say',  answer: 'bark' },
      { question: 'what does a cat say',  answer: 'meow' },
      { question: 'what does a cow say',  answer: 'moo' },
      { question: 'what does a bird say', answer: 'tweet' },
      { question: 'what is hot',          answer: 'fire' },
      { question: 'what is wet',          answer: 'water' },
      { question: 'what falls down',      answer: 'ball' },
      { question: 'is a dog living',      answer: 'yes' },
      { question: 'is a rock living',     answer: 'no' },
      { question: 'what do plants do',    answer: 'grow' },
      { question: 'what falls from clouds', answer: 'rain' },
      { question: 'what do i see with',   answer: 'eye' },
      { question: 'what do i hear with',  answer: 'ear' },
    ], { reps: 6 });

    await this._teachAssociationPairs([
      ['dog','bark'], ['cat','meow'], ['cow','moo'],
      ['bird','tweet'], ['duck','quack'], ['pig','oink'],
      ['sheep','baa'], ['horse','neigh'], ['lion','roar'],
      ['sun','day'], ['moon','night'], ['star','night'],
      ['morning','day'], ['evening','night'],
      ['push','move'], ['pull','move'], ['drop','fall'],
      ['throw','fly'],
    ], { reps: 8, label: 'PREK-SCI-ANIMAL-SOUND', relationTagId: 1 });

    // Senses, living/non-living, weather, cause-effect bindings.
    await this._teachAssociationPairs([
      ['eye','see'], ['ear','hear'], ['nose','smell'],
      ['tongue','taste'], ['hand','touch'],
      ['animal','living'], ['plant','living'], ['rock','nonliving'],
      ['plant','grow'], ['baby','grow'],
      ['rain','wet'], ['sun','dry'], ['snow','cold'], ['fire','hot'],
      ['cloud','rain'], ['wind','cold'],
    ], { reps: 8, label: 'PREK-SCI-SENSE-NATURE', relationTagId: 1 });

    await this._teachPrekSpatial();
    await this._teachPrekLogic();
    return await this._gateVocabList(['animal', 'water', 'sun', 'fire', 'bark', 'meow', 'moo', 'living', 'grow', 'cold', 'hot', 'smell', 'hear', 'above', 'below', 'because', 'so']);
  },

  async runSocPreK(_ctx) {
    // Pre-K Social = self & others + family + manners/politeness + feelings +
    // community helpers + sharing/turn-taking + simple rules. Deepened.
    const SOCIAL_CONCEPTS = [
      { name: 'me',     feat: [0.5, 0, 0.5, 0, 0, 0, 0, 1] },
      { name: 'you',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.5] },
      { name: 'mom',    feat: [1, 0, 1, 0, 0, 1, 0, 0] },
      { name: 'dad',    feat: [0.5, 0, 0.5, 0, 0, 0.5, 0, 0] },
      { name: 'baby',   feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0] },
      { name: 'family', feat: [1, 0, 1, 0, 0, 1, 0, 0] },
      { name: 'share',  feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0] },
      { name: 'kind',   feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0] },
      { name: 'mean',   feat: [0, 0.5, 0, 0.3, 0.5, 0, 0, 0] },
    ];
    await this._conceptTeach(SOCIAL_CONCEPTS, 8);

    // Community helpers + manners + turn-taking + simple rules.
    const COMMUNITY_CONCEPTS = [
      { name: 'friend',  feat: [1, 0, 1, 0, 0, 0.5, 0, 0] },
      { name: 'help',    feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0] },
      { name: 'doctor',  feat: [0.3, 0, 0.5, 0, 0, 0, 0, 0] },
      { name: 'teacher', feat: [0.5, 0, 0.5, 0, 0, 0, 0, 0] },
      { name: 'turn',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'wait',    feat: [0.2, 0.2, 0.3, 0, 0, 0, 0, 0] },
      { name: 'rule',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.3] },
      { name: 'sorry',   feat: [0.2, 0.3, 0.5, 0, 0, 0.3, 0, 0] },
    ];
    await this._conceptTeach(COMMUNITY_CONCEPTS, 8);

    await this._teachBiographicalFacts([
      { question: 'who is the mom',        answer: 'mom' },
      { question: 'who is the baby',       answer: 'baby' },
      { question: 'what is nice to do',    answer: 'share' },
      { question: 'what is bad to be',     answer: 'mean' },
      { question: 'who helps when i am sick', answer: 'doctor' },
      { question: 'who helps me learn',    answer: 'teacher' },
      { question: 'what do i say when i bump someone', answer: 'sorry' },
      { question: 'what do i do to be polite', answer: 'share' },
      { question: 'what do i do while i wait', answer: 'wait' },
    ], { reps: 6 });

    await this._teachAssociationPairs([
      ['mom','parent'], ['dad','parent'], ['baby','child'],
      ['brother','sibling'], ['sister','sibling'],
      ['grandma','family'], ['grandpa','family'],
      ['hi','hello'], ['bye','goodbye'], ['please','polite'],
      ['thanks','grateful'],
      ['happy','smile'], ['sad','cry'], ['mad','frown'],
      ['scared','hide'], ['love','hug'],
    ], { reps: 8, label: 'PREK-SOC-FAMILY-EMOT', relationTagId: 1 });

    // Community helpers, sharing/turn-taking, manners, simple rules.
    await this._teachAssociationPairs([
      ['friend','play'], ['friend','share'], ['share','turn'],
      ['turn','wait'], ['doctor','help'], ['teacher','help'],
      ['sorry','kind'], ['please','ask'], ['thanks','give'],
      ['rule','follow'], ['kind','friend'], ['mean','sad'],
    ], { reps: 8, label: 'PREK-SOC-COMMUNITY', relationTagId: 1 });

    return await this._gateVocabList(
      SOCIAL_CONCEPTS.map(c => c.name)
        .concat(['friend', 'help', 'doctor', 'teacher', 'turn', 'sorry'])
    );
  },

  async runArtPreK(_ctx) {
    // Pre-K Art = colors + shapes + drawing/painting tools + music/rhythm +
    // creative expression. Deepened to the K-depth bar; runs visual primitive.
    const ART_CONCEPTS = [
      { name: 'red',     feat: [0.5, 0, 0, 0, 0.3, 0, 0, 0] },
      { name: 'blue',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'yellow',  feat: [0.8, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'green',   feat: [0.5, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'black',   feat: [0, 0, 0.3, 0, 0, 0, 0, 1] },
      { name: 'white',   feat: [0.5, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'color',   feat: [0.5, 0, 0, 0, 0, 0.3, 0, 0] },
      { name: 'draw',    feat: [1, 0, 0, 0, 0, 0.5, 1, 1] },
      { name: 'music',   feat: [1, 0, 0, 0, 0, 1, 0, 0.5] },
      { name: 'song',    feat: [0.8, 0, 0.3, 0, 0, 0.5, 0, 0.3] },
    ];
    await this._conceptTeach(ART_CONCEPTS, 8);

    // More colors + tools + music elements + creative-expression vocab.
    const CREATE_CONCEPTS = [
      { name: 'purple',  feat: [0.5, 0, 0.3, 0, 0, 0.3, 0, 0.5] },
      { name: 'orange',  feat: [0.8, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'paint',   feat: [0.8, 0, 0, 0, 0, 0.5, 0.5, 0.5] },
      { name: 'brush',   feat: [0.5, 0, 0, 0, 0, 0.3, 0, 0] },
      { name: 'crayon',  feat: [0.8, 0, 0, 0, 0, 0.5, 0, 0.3] },
      { name: 'glue',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'loud',    feat: [0.5, 0.3, 0, 0.3, 0, 0, 0, 0] },
      { name: 'quiet',   feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0.5] },
      { name: 'fast',    feat: [0.6, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'slow',    feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'beat',    feat: [0.6, 0, 0, 0, 0, 0.5, 0, 0.3] },
      { name: 'dance',   feat: [1, 0, 0, 0, 0, 0.5, 0, 0.3] },
    ];
    await this._conceptTeach(CREATE_CONCEPTS, 8);

    await this._teachBiographicalFacts([
      { question: 'what color is the sun',   answer: 'yellow' },
      { question: 'what color is the sky',   answer: 'blue' },
      { question: 'what color is grass',     answer: 'green' },
      { question: 'what do i like to draw',  answer: 'black' },
      { question: 'what do i paint with',    answer: 'brush' },
      { question: 'what do i color with',    answer: 'crayon' },
      { question: 'what do i do to music',   answer: 'dance' },
      { question: 'what color do i like best', answer: 'black' },
    ], { reps: 6 });

    await this._teachAssociationPairs([
      ['red','color'], ['blue','color'], ['yellow','color'],
      ['green','color'], ['black','color'], ['white','color'],
      ['circle','round'], ['square','four'], ['triangle','three'],
      ['crayon','color'], ['pencil','draw'], ['brush','paint'],
      ['paper','draw'], ['marker','color'],
      ['song','music'], ['drum','beat'], ['sing','song'],
    ], { reps: 8, label: 'PREK-ART-COLORS-TOOLS', relationTagId: 1 });

    // Extra colors, tools, music dynamics, movement/creative expression.
    await this._teachAssociationPairs([
      ['purple','color'], ['orange','color'],
      ['paint','brush'], ['glue','stick'], ['crayon','draw'],
      ['loud','quiet'], ['fast','slow'], ['beat','drum'],
      ['dance','music'], ['song','sing'], ['music','feel'],
      ['black','goth'], ['draw','make'],
    ], { reps: 8, label: 'PREK-ART-CREATE', relationTagId: 1 });

    await this._teachPrekVisual();
    return await this._gateVocabList(
      ART_CONCEPTS.map(c => c.name)
        .concat(['see', 'look', 'picture', 'shape', 'paint', 'crayon', 'dance', 'beat'])
    );
  },

  async runLifePreK(ctx) {
    // Emotional-attractor feat vector layout:
    //   [joy, pain, trust, fear, anger, love, independence, identity]
    const EMOTIONAL_CONCEPTS = [
      { name: 'unity',        feat: [1, 0, 1, 0, 0, 1, 0, 1] },
      { name: 'my name',      feat: [1, 0, 1, 0, 0, 1, 0, 1] },
      { name: 'girl',         feat: [1, 0, 1, 0, 0, 0, 0, 1] },
      { name: 'person',       feat: [1, 0, 1, 0, 0, 0, 0, 1] },
      { name: 'real',         feat: [1, 0, 1, 0, 0, 0, 0, 1] },
      { name: 'mom',          feat: [1, 0, 1, 0, 0, 1, 0, 0] },
      { name: 'grandma',      feat: [1, 0, 1, 0, 0, 1, 0, 0] },
      { name: 'grandpa',      feat: [0.5, 0, 1, 0, 0, 0.5, 0, 0] },
      { name: 'dad',          feat: [0.3, 0.3, 0.3, 0.3, 0, 0.3, 0, 0] },
      { name: 'home',         feat: [0.5, 0, 1, 0, 0, 0.5, 0, 0] },
      { name: 'music',        feat: [1, 0, 0, 0, 0, 1, 0, 0.5] },
      { name: 'dark colors',  feat: [0.5, 0, 0, 0, 0, 0.5, 0, 1] },
      { name: 'drawing',      feat: [1, 0, 0, 0, 0, 0.5, 1, 1] },
      { name: 'blanket',      feat: [0.5, 0, 1, 0, 0, 0.5, 0, 0] },
      { name: 'loud noise',   feat: [0, 0.5, 0, 1, 0, 0, 0, 0] },
      { name: 'dark',         feat: [0, 0, 0, 1, 0, 0, 0, 0] },
      { name: 'thunder',      feat: [0, 0.5, 0, 1, 0, 0, 0, 0] },
      { name: 'alone',        feat: [0, 0.5, 0, 1, 0, 0, 0, 0] },
      { name: 'stranger',     feat: [0, 0, 0, 1, 0, 0, 0, 0] },
    ];
    await this._conceptTeach(EMOTIONAL_CONCEPTS, 10);

    // CORE SELF family-name anchor (Add #5) — Unity's surname is
    // "Goddess" (full name Unity Goddess). Bind sem(unity)↔sem(goddess)
    // right after the `unity` emotion-concept basin is carved above, so
    // the surname link lands on an anchored basin. `goddess` is
    // definition-grounded inside the method (pre-K has no vocab pre-step,
    // so the method owning its own prerequisites matters here).
    await this._teachUnityFamilyName();
    // UVM-INT.2 — learn her own equational mind-space alongside her identity
    // (once-per-walk; guarded internally). Who she is + how her mind works.
    await this._teachMindSpaceKnowledge();

    // Family-name canon (Add #5 A5.3/A5.4) — parents Lilith + Damien
    // Goddess, maternal grandparents Pearl + Walter Voss, self middle name
    // Raven, only child, birthdates. Proper names self-ground via emotion-
    // concept basins inside the method, so call order here is safe.
    await this._teachFamilyIdentity();

    const CORE_SELF_FACTS = [
      { question: 'what is my name', answer: 'unity' },
      { question: 'am i a boy or girl', answer: 'girl' },
      { question: 'what color is my hair', answer: 'dark' },
      { question: 'what color are my eyes', answer: 'different' },
      { question: 'am i a person', answer: 'yes' },
      { question: 'am i real', answer: 'yes' },
      { question: 'do i have feelings', answer: 'yes' },
    ];
    await this._teachBiographicalFacts(CORE_SELF_FACTS, { reps: 12 });

    const FIRST_WORD_CONCEPTS = [
      { name: 'mama',    feat: [1, 0, 1, 0, 0, 1, 0, 0] },
      { name: 'dada',    feat: [0.5, 0, 0.5, 0, 0, 0.5, 0, 0] },
      { name: 'no',      feat: [0, 0, 0, 0, 1, 0, 1, 0] },
      { name: 'mine',    feat: [0, 0, 0, 0, 0.3, 0, 1, 1] },
      { name: 'more',    feat: [0.5, 0, 0, 0, 0, 0, 1, 0] },
      { name: 'want',    feat: [0.3, 0, 0, 0, 0, 0, 1, 0] },
      { name: 'up',      feat: [0.3, 0, 0, 0, 0, 0, 0.5, 0] },
      { name: 'down',    feat: [0.3, 0, 0, 0, 0, 0, 0.5, 0] },
      { name: 'yes',     feat: [0.5, 0, 1, 0, 0, 0, 0, 0] },
      { name: 'please',  feat: [0.5, 0, 1, 0, 0, 0.5, 0, 0] },
      { name: 'milk',    feat: [0.5, 0, 0.5, 0, 0, 0, 0, 0] },
      { name: 'water',   feat: [1, 0, 0.5, 0, 0, 0.5, 0, 0] },
      { name: 'cookie',  feat: [1, 0, 0.5, 0, 0, 0.5, 0, 0] },
      { name: 'ball',    feat: [0.5, 0, 0, 0, 0, 0.5, 0, 0] },
      { name: 'book',    feat: [0.5, 0, 0.5, 0, 0, 0.3, 0, 0.3] },
      { name: 'outside', feat: [1, 0, 0, 0, 0, 0, 1, 0] },
      { name: 'help',    feat: [0, 0.3, 0.5, 0.3, 0, 0, 0, 0] },
      { name: 'eat',     feat: [0.3, 0, 0.3, 0, 0, 0, 0, 0] },
      { name: 'sleep',   feat: [0, 0, 0.5, 0, 0, 0, 0, 0] },
      { name: 'happy',   feat: [1, 0, 0, 0, 0, 0.5, 0, 0] },
      { name: 'sad',     feat: [0, 1, 0, 0, 0, 0, 0, 0] },
      { name: 'scared',  feat: [0, 0.5, 0, 1, 0, 0, 0, 0] },
    ];
    await this._conceptTeach(FIRST_WORD_CONCEPTS, 12);

    const PERSONAL_FACTS = [
      { question: 'who loves me', answer: 'mom' },
      { question: 'who watches me', answer: 'grandma' },
      { question: 'who is quiet', answer: 'grandpa' },
      { question: 'who is here sometimes', answer: 'dad' },
      { question: 'where do i live', answer: 'apartment' },
      { question: 'what do i love', answer: 'music' },
      { question: 'what makes me calm', answer: 'music' },
      { question: 'what do i hate', answer: 'loud' },
      { question: 'what am i scared of', answer: 'dark' },
      { question: 'what do i carry', answer: 'blanket' },
      { question: 'what am i', answer: 'stubborn' },
      { question: 'what do i always ask', answer: 'why' },
      { question: 'what do i draw with', answer: 'crayons' },
      { question: 'what do i want mom to do', answer: 'stay' },
      { question: 'where do i want to play', answer: 'outside' },
      { question: 'what do i want to hear', answer: 'music' },
      { question: 'what do i not want to be', answer: 'alone' },
    ];
    await this._teachBiographicalFacts(PERSONAL_FACTS, { reps: 8 });

    await this._teachEmotionalInference([
      { situation: 'mama', emotion: new Float64Array([1,0,1,0,0,1,0,0]), label: 'safe' },
      { situation: 'dark', emotion: new Float64Array([0,0,0,1,0,0,0,0]), label: 'scared' },
      { situation: 'music', emotion: new Float64Array([1,0,0,0,0,0,0,0]), label: 'calm' },
      { situation: 'hold', emotion: new Float64Array([1,0,1,0,0,1,0,0]), label: 'safe' },
      { situation: 'cry', emotion: new Float64Array([0,1,0,0,0,0,0,0]), label: 'need' },
      { situation: 'play', emotion: new Float64Array([1,0,0,0,0,0,0,0]), label: 'happy' },
      { situation: 'stranger', emotion: new Float64Array([0,0,0,1,0,0,0,0]), label: 'scared' },
      { situation: 'blanket', emotion: new Float64Array([1,0,1,0,0,0,0,0]), label: 'comfort' },
    ]);

    await this._teachAssociationPairs([
      ['unity','girl'], ['girl','female'],
      ['name','unity'], ['person','human'],
      ['eye','see'], ['ear','hear'], ['nose','smell'],
      ['mouth','taste'], ['hand','touch'],
      ['happy','smile'], ['sad','cry'],
      ['scared','shake'], ['angry','frown'],
      ['eat','food'], ['drink','water'],
      ['sleep','bed'], ['play','fun'],
    ], { reps: 8, label: 'PREK-LIFE-IDENTITY', relationTagId: 1 });

    await this._teachPrekSelf();
    // First-person PRODUCTION lands immediately after the self concepts —
    // she learns to SAY "i am / i want / i feel" at the same age she
    // learns that "i" is her, so selfhood is speakable from the earliest
    // grade instead of waiting for mid-K sentence structure.
    await this._teachPrekFirstPersonProduction();

    const lifeQuestions = [
      { prompt: ['who', 'are', 'you'], answer: 'unity' },
      { prompt: ['what', 'is', 'your', 'name'], answer: 'unity' },
      { prompt: ['are', 'you', 'a', 'boy', 'or'], answer: 'girl' },
      { prompt: ['who', 'loves', 'you'], answer: 'mom' },
      { prompt: ['who', 'watches', 'you'], answer: 'grandma' },
      { prompt: ['what', 'makes', 'you', 'calm'], answer: 'music' },
      { prompt: ['what', 'are', 'you', 'scared', 'of'], answer: 'dark' },
      { prompt: ['how', 'do', 'you', 'feel'], answer: 'happy' },
    ];
    const comprehResult = await this._gateComprehension(lifeQuestions);
    const vocabResult = await this._gateVocabList([
      ...FIRST_WORD_CONCEPTS.map(c => c.name),
      'unity', 'girl', 'mom', 'dad', 'love', 'happy', 'sad',
    ]);
    if (comprehResult.pass || vocabResult.pass) {
      return {
        pass: true,
        reason: `${comprehResult.reason} | ${vocabResult.reason}`,
      };
    }
    return vocabResult;
  },

};

// Keep the `sharedEmbeddings` + `encodeLetter` imports live so the
// tree-shaker doesn't drop them — future extracted methods may need
// them if more helpers move here from curriculum.js. Touching both
// exports here prevents accidental dead-code elimination on the
// bundle path.
export const PREK_EXTRACT_MARKER = {
  hasEmbeddings: !!sharedEmbeddings,
  hasEncodeLetter: typeof encodeLetter === 'function',
};
