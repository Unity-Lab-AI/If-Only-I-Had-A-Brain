// Grade 1 cell runners + G1 gates (ages 6-7).
//
// Per-grade file split — the operator directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (the same
// pattern pre-K.js + kindergarten.js already follow). All six subject
// runners (ELA/Math/Science/Social/Art/Life) + the two G1 gates that have
// dedicated gate methods (_gateElaG1Real, _gateMathG1Real) live here.
//
// G1 runners call shared primitives on the Curriculum base class
// (_teachVocabList, _teachSentenceList, _teachSVOParsing,
// _teachAdditionTransformations, _teachLivingNonliving, _teachPlantParts,
// _teachWeather, _teachCausalChains, _teachClassificationReasoning,
// _teachCommunityRoles, _teachColorMixing, _conceptTeach, _autoFinal, ...)
// through `this.` — mixin attach preserves the prototype chain so every
// cross-reference resolves identically to the pre-extraction layout.

// Gate probes (_gateElaG1Real / _gateMathG1Real) read embeddings + the
// letter inventory for their READ/THINK/TALK pathway checks.
// Magnitude features for the equational math gate — same circular-import-
// safe pattern kindergarten.js uses (function/const exports are evaluated
// before the G1_MIXIN Object.assign, so no TDZ trap).
import { _magnitudeFeatureForDigit, MAGNITUDE_FEATURE_DIM } from '../curriculum.js';

export const G1_MIXIN = {
  async runElaG1Real(ctx) {
    // ── COMMON CORE ELA G1: Full vocabulary ──
    // Dolch Grade 1 list (41 words) — the REAL sight words G1 students
    // are expected to read on sight by end of year.
    const DOLCH_G1 = [
      'after', 'again', 'an', 'any', 'as', 'ask', 'by', 'could',
      'every', 'fly', 'from', 'give', 'going', 'had', 'has', 'her',
      'him', 'his', 'how', 'just', 'know', 'let', 'live', 'may',
      'of', 'old', 'once', 'open', 'over', 'put', 'round', 'some',
      'stop', 'take', 'thank', 'them', 'then', 'think', 'walk', 'were', 'when',
    ];

    // CVC word families — EVERY short vowel covered
    const CVC_WORDS = [
      // short a
      'cat', 'bat', 'hat', 'mat', 'rat', 'sat', 'fat', 'pat', 'tap', 'nap',
      'cap', 'map', 'lap', 'gap', 'sad', 'bad', 'mad', 'dad', 'had', 'lad',
      'bag', 'tag', 'rag', 'wag', 'jam', 'ham', 'ram', 'dam', 'van', 'can',
      'man', 'ran', 'fan', 'pan', 'tan', 'ban',
      // short e
      'bed', 'red', 'fed', 'led', 'wed', 'pen', 'hen', 'men', 'ten', 'den',
      'set', 'get', 'let', 'met', 'net', 'pet', 'wet', 'vet', 'beg', 'leg',
      // short i
      'big', 'dig', 'fig', 'pig', 'wig', 'jig', 'rig', 'bit', 'fit', 'hit',
      'kit', 'lit', 'pit', 'sit', 'wit', 'dip', 'hip', 'lip', 'rip', 'sip',
      'tip', 'zip', 'bin', 'din', 'fin', 'pin', 'tin', 'win',
      // short o
      'dog', 'log', 'hog', 'fog', 'jog', 'bog', 'hot', 'not', 'got', 'dot',
      'lot', 'pot', 'cot', 'rot', 'top', 'hop', 'mop', 'pop', 'cop', 'rob',
      'sob', 'mob', 'job', 'nod', 'rod', 'cod',
      // short u
      'bug', 'hug', 'mug', 'rug', 'tug', 'dug', 'jug', 'cup', 'pup', 'up',
      'bus', 'gus', 'but', 'cut', 'gut', 'hut', 'nut', 'rut', 'fun', 'run',
      'sun', 'gun', 'bun', 'bud', 'mud', 'cub', 'hub', 'rub', 'sub', 'tub',
    ];

    // CVCe (magic e) long vowel words — G1 phonics standard
    const CVCE_WORDS = [
      'cake', 'make', 'take', 'bake', 'lake', 'name', 'game', 'came', 'same',
      'bike', 'like', 'hike', 'ride', 'hide', 'side', 'wide', 'time', 'line',
      'bone', 'home', 'hope', 'rope', 'nose', 'rose', 'note', 'vote', 'hole',
      'cute', 'mule', 'tube', 'cube', 'rule', 'huge', 'use',
    ];

    // Inflectional endings — G1 phonics standard
    const INFLECTED = [
      'cats', 'dogs', 'runs', 'jumps', 'sits', 'helps', 'looks', 'plays',
      'running', 'jumping', 'sitting', 'helping', 'looking', 'playing',
      'walked', 'jumped', 'helped', 'looked', 'played', 'asked',
      'bigger', 'fastest', 'harder', 'softer',
    ];

    // Teach ALL vocabulary via direct pattern
    const ALL_WORDS = [...new Set([...DOLCH_G1, ...CVC_WORDS, ...CVCE_WORDS, ...INFLECTED])];
    await this._teachVocabList(ALL_WORDS, ctx, { reps: 4 });

    // ── COMMON CORE ELA G1: Reading sentences ──
    // G1 standard: ask/answer questions about key details, retell stories,
    // describe characters/settings/events, identify feelings in stories.
    const G1_SENTENCES = [
      // SVO patterns with G1 vocabulary
      'the cat sat on the mat', 'the dog ran to the park',
      'the boy kicked the ball', 'the girl rode her bike',
      'mom made a cake', 'dad took us to the lake',
      'the fish swam in the pond', 'the bird sat on the line',
      'he gave her a rose', 'she hid the bone from the dog',
      'i like to run and jump', 'we play a game at home',
      'the sun is big and hot', 'the moon came up at night',
      // question patterns
      'who has the red hat', 'what is in the bag', 'where is my cup',
      'when did the dog run', 'why is she sad', 'how did he get home',
      // narrative sequences (retelling)
      'first the cat woke up', 'then the cat ate food',
      'next the cat went outside', 'last the cat took a nap',
      'the boy was sad', 'he lost his dog', 'he looked and looked',
      'he found his dog at the park', 'he was so happy',
      // feelings in stories
      'she felt happy when mom came home',
      'he felt scared of the big dog',
      'they were mad because it rained',
      'i was proud when i read the book',
      // writing patterns — opinion/informative/narrative
      'i like cats because they are soft',
      'dogs are fun because they play with you',
      'my favorite food is pizza',
      'the sun gives us light and heat',
      'plants need water to grow',
    ];
    await this._teachSentenceList(G1_SENTENCES, ctx, { reps: 3, ticksPerWord: 2 });

    // ── COMMON CORE ELA G1: Grammar via sentences ──
    // G1 Language standard: common/proper nouns, singular/plural with
    // matching verbs, personal pronouns, past/present/future verbs,
    // adjectives, conjunctions, prepositions.
    const G1_GRAMMAR = [
      // singular vs plural verb agreement
      'the cat runs', 'the cats run', 'the dog jumps', 'the dogs jump',
      'she walks fast', 'they walk slow', 'he sits down', 'we sit together',
      // past/present/future
      'i walk to school', 'i walked to school', 'i will walk to school',
      'she runs fast', 'she ran fast', 'she will run fast',
      'he eats lunch', 'he ate lunch', 'he will eat lunch',
      // pronouns
      'i have a cat', 'you have a dog', 'he has a bike',
      'she has a book', 'we have fun', 'they have toys',
      'give it to me', 'give it to him', 'give it to her',
      // adjectives
      'the big dog', 'the little cat', 'the red ball', 'the old man',
      'the fast car', 'the hot sun', 'the cold ice', 'the new home',
      // conjunctions
      'i like cats and dogs', 'she is sad but brave',
      'we can run or walk', 'he ate because he was hungry',
      // prepositions
      'the cat is on the mat', 'the ball is under the bed',
      'she ran to the park', 'he hid behind the tree',
      'we sat beside the lake', 'the bird flew over the house',
    ];
    await this._teachSentenceList(G1_GRAMMAR, ctx, { reps: 2, ticksPerWord: 2 });

    // ── EQUATIONAL REASONING: SVO parsing ──
    // Teach Unity to extract subject/verb/object from sentences —
    // not just memorize the sentence but UNDERSTAND the structure.
    // This is the foundation for reading comprehension.
    await this._teachSVOParsing(ctx);

    await this._teachVocabList(ALL_WORDS.slice(0, 30), ctx, { reps: 3 });

    // Production stack + self-gate (K-uniform -- every subject ends this way).
    await this._teachProductionStack('ela', ctx, { tag: 'ELA-G1' });
    return await this._gateElaG1Real();
  },

  // -- G1 subject gates -- thin wrappers over the shared production gate
  // (_gateSubjectProduction). K-uniform: each supplies its question/answer
  // samples; the shared helper does pregate vocab enrichment + probe-noise
  // bump + _probeProductionBatch + gate-history. This replaces the old ELA
  // READ/THINK/TALK gate whose TALK probe was a banned first-letter proxy.
  _gateElaG1Real() {
    return this._gateSubjectProduction('ela', 'grade1', [
      { question: 'the cat sat on the', expected: ['mat', 'm'] },
      { question: 'the dog ran to the', expected: ['park', 'p'] },
      { question: 'mom made a', expected: ['cake', 'c'] },
      { question: 'more than one cat is', expected: ['cats', 'c'] },
      { question: 'the past tense of walk is', expected: ['walked', 'w'] },
      { question: 'she felt happy when mom came', expected: ['home', 'h'] },
      { question: 'plants need water to', expected: ['grow', 'g'] },
      { question: 'i like cats because they are', expected: ['soft', 's'] },
    ], { gateSubjectTag: 'ela' });
  },

  _gateSciG1Real() {
    return this._gateSubjectProduction('science', 'grade1', [
      { question: 'is a dog living or nonliving', expected: ['living', 'l'] },
      { question: 'is a rock living or nonliving', expected: ['nonliving', 'not', 'n'] },
      { question: 'where does light come from', expected: ['sun', 'lamp', 'candle', 's', 'l', 'c'] },
      { question: 'what forms when light is blocked', expected: ['shadow', 's'] },
      { question: 'what makes sound', expected: ['vibration', 'vibrate', 'v'] },
      { question: 'what do we hear with', expected: ['ears', 'ear', 'e'] },
      { question: 'what holds a plant in the soil', expected: ['roots', 'root', 'r'] },
      { question: 'what makes food from sunlight', expected: ['leaves', 'leaf', 'l'] },
      { question: 'what helps a bird fly', expected: ['wings', 'wing', 'w'] },
      { question: 'what helps a fish swim', expected: ['fins', 'fin', 'f'] },
      { question: 'when does the sun rise', expected: ['morning', 'm'] },
      { question: 'how many seasons are there', expected: ['four', 'f'] },
    ], { gateSubjectTag: 'sci' });
  },

  _gateSocG1Real() {
    return this._gateSubjectProduction('social', 'grade1', [
      { question: 'who keeps us safe', expected: ['police', 'p'] },
      { question: 'who puts out fires', expected: ['firefighters', 'firefighter', 'f'] },
      { question: 'who teaches children', expected: ['teachers', 'teacher', 't'] },
      { question: 'where do doctors work', expected: ['hospital', 'hospitals', 'h'] },
      { question: 'a group of people who live together is a', expected: ['community', 'c'] },
      { question: 'what river was ancient egypt near', expected: ['nile', 'n'] },
      { question: 'who ruled ancient egypt', expected: ['pharaoh', 'pharaohs', 'p'] },
      { question: 'what big stone buildings did egypt build', expected: ['pyramids', 'pyramid', 'p'] },
      { question: 'what keeps a community safe', expected: ['rules', 'rule', 'r'] },
      { question: 'who came to america on a ship', expected: ['pilgrims', 'pilgrim', 'p'] },
    ], { gateSubjectTag: 'soc' });
  },

  _gateArtG1Real() {
    return this._gateSubjectProduction('art', 'grade1', [
      { question: 'red and yellow make', expected: ['orange', 'o'] },
      { question: 'yellow and blue make', expected: ['green', 'g'] },
      { question: 'red and blue make', expected: ['purple', 'p'] },
      { question: 'colors that cannot be made are', expected: ['primary', 'p'] },
      { question: 'adding white makes a', expected: ['tint', 't'] },
      { question: 'adding black makes a', expected: ['shade', 's'] },
      { question: 'red orange and yellow are', expected: ['warm', 'w'] },
      { question: 'blue green and purple are', expected: ['cool', 'c'] },
      { question: 'how many colors in the rainbow', expected: ['seven', 's'] },
    ], { gateSubjectTag: 'art' });
  },

  async runMathG1Real(ctx) {
    // ── COMMON CORE MATH G1: Full first-grade math ──
    // Standards: add/subtract within 20, fluency within 10, count to 120,
    // place value (tens and ones), two-digit addition, tell time to
    // half-hour, measure lengths, data with up to 3 categories, partition
    // shapes into halves/fourths.

    // ── VOCABULARY: number words + operation words + math language ──
    const MATH_G1_VOCAB = [
      // number words 0-20
      'zero', 'one', 'two', 'three', 'four', 'five',
      'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
      'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
      // operation words
      'plus', 'minus', 'equals', 'add', 'subtract', 'sum', 'difference',
      'more', 'less', 'equal', 'same', 'total', 'left', 'remain',
      // place value words
      'tens', 'ones', 'digit', 'place', 'value',
      // time words
      'hour', 'half', 'clock', 'time', 'morning', 'afternoon',
      // measurement words
      'long', 'short', 'longer', 'shorter', 'longest', 'shortest',
      // shape words
      'half', 'fourth', 'quarter', 'whole', 'part', 'equal',
    ];
    await this._teachVocabList(MATH_G1_VOCAB, ctx, { reps: 4 });

    // -- EQUATIONAL REASONING: arithmetic as magnitude transforms --
    // grade-completion-gate LAW: equational teach, NO sentence arrays,
    // NO first-letter production. The earlier G1 stub taught arithmetic
    // as number-word sentence arrays (the BANNED pattern). K proved the
    // right shape: teach the OPERATION as a magnitude transform, not
    // sentences ABOUT it. G1 reuses the SAME K transforms extended to
    // within-20 (the G1 standard) plus tens/ones place value. Uniform --
    // one set of primitives, parameterized scope. Only the number/
    // operation VOCABULARY stays a list (definition-binding is required
    // so words are learned before any pass uses them).
    await this._teachAdditionTransformations(ctx, { max: 20 });      // add within 20
    await this._teachSubtractionTransformations(ctx, { max: 20 });   // subtract within 20
    await this._teachComparisonTransformations(ctx);                 // greater / less / equal
    await this._teachPlaceValueTransformations(ctx);                 // tens + ones (10-99)

    // -- Self-gate (K-uniform -- the runner returns its own gate result,
    // like runMathKReal ends with `return await this._gateMathKReal()`).
    return await this._gateMathG1Real();
  },

  // Equational math gate -- probes NUMBER-MAGNITUDE comprehension, not
  // word recall. For each digit 0-9: stream the digit char into the
  // letter region, let dynamics propagate to phon, read phon as a
  // MAGNITUDE_FEATURE_DIM vector, and cosine it against the digit's true
  // magnitude feature. THINK = the magnitude state persists across
  // silence (free-region variance). NO first-letter production proxy
  // (banned by the grade-completion-gate LAW) -- this tests whether the
  // letter->phon magnitude basin actually formed. Mirrors the READ/THINK
  // shape of _gateElaG1Real + the digit-READ logic of _gateMathKReal.
  _gateMathG1Real() {
    const cluster = this.cluster;
    const DIGITS = '0123456789'.split('');
    let readPass = 0;
    let thinkPass = 0;
    const perDigit = [];
    const READ_COS_MIN = 0.10;
    const THINK_VAR_MIN = 0.0005;
    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      const L = Math.min(a.length, b.length);
      for (let i = 0; i < L; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      const d = Math.sqrt(na) * Math.sqrt(nb);
      return d > 0 ? dot / d : 0;
    }
    for (const digit of DIGITS) {
      // READ: digit char -> phon magnitude readout vs true magnitude feature
      cluster.injectLetter(digit, 1.0);
      for (let t = 0; t < 3; t++) cluster.step(0.001);
      const phonReadout = cluster.regionReadout('phon', MAGNITUDE_FEATURE_DIM);
      let readCos = 0;
      if (phonReadout && phonReadout.length === MAGNITUDE_FEATURE_DIM) {
        let mean = 0;
        for (let i = 0; i < phonReadout.length; i++) mean += phonReadout[i];
        mean /= phonReadout.length;
        const centered = new Float64Array(phonReadout.length);
        for (let i = 0; i < phonReadout.length; i++) centered[i] = phonReadout[i] - mean;
        readCos = cosine(centered, _magnitudeFeatureForDigit(digit));
      }
      const readOk = readCos > READ_COS_MIN;
      if (readOk) readPass++;
      // THINK: magnitude state persists across silence (free-region variance)
      for (let t = 0; t < 10; t++) cluster.step(0.001);
      const freeReadout = cluster.regionReadout('free', 64);
      let thinkVar = 0;
      if (freeReadout && freeReadout.length > 0) {
        let fmean = 0;
        for (let i = 0; i < freeReadout.length; i++) fmean += freeReadout[i];
        fmean /= freeReadout.length;
        for (let i = 0; i < freeReadout.length; i++) {
          const d = freeReadout[i] - fmean;
          thinkVar += d * d;
        }
        thinkVar /= freeReadout.length;
      }
      const thinkOk = thinkVar > THINK_VAR_MIN;
      if (thinkOk) thinkPass++;
      perDigit.push({ digit, readCos, thinkVar, readOk, thinkOk });
    }
    const N = DIGITS.length;
    const readRate = N > 0 ? readPass / N : 0;
    const thinkRate = N > 0 ? thinkPass / N : 0;
    // 45% bar -- magnitude-basin readout is noisier than single-character
    // identity, same rationale as the K math gate's relaxed threshold.
    const PATH_MIN = 0.45;
    const pass = readRate >= PATH_MIN && thinkRate >= PATH_MIN;
    return {
      pass,
      reason: `READ ${readPass}/${N} (${(readRate * 100).toFixed(0)}%), THINK ${thinkPass}/${N} (${(thinkRate * 100).toFixed(0)}%)`,
      metrics: { readRate, thinkRate, perDigit },
    };
  },

  async runSciG1Real(ctx) {
    // ── NGSS G1: Full first-grade science ──
    // Standards: light/sound (vibrations, sources, shadows), plant/animal
    // structure and function, patterns in the sky (sun/moon/stars/seasons)

    await this._teachLivingNonliving();
    await this._teachPlantParts();
    await this._teachWeather();

    // ── VOCABULARY: full G1 science words ──
    const SCI_G1_VOCAB = [
      // living vs nonliving (from K, reinforced)
      'living', 'nonliving', 'alive', 'dead', 'grow',
      // light and sound
      'light', 'dark', 'shadow', 'bright', 'dim', 'lamp', 'candle',
      'sound', 'loud', 'quiet', 'soft', 'vibrate', 'echo',
      'hear', 'see', 'ear', 'eye',
      // plant structure
      'root', 'stem', 'leaf', 'flower', 'seed', 'petal', 'bark',
      'trunk', 'branch', 'fruit', 'soil', 'sprout',
      // animal structure
      'legs', 'wings', 'tail', 'fur', 'feathers', 'scales', 'shell',
      'teeth', 'claws', 'beak', 'fin',
      // sky patterns
      'sunrise', 'sunset', 'daytime', 'nighttime', 'season',
      'spring', 'summer', 'fall', 'winter',
    ];
    await this._teachVocabList(SCI_G1_VOCAB, ctx, { reps: 3 });

    // ── SENTENCES: full G1 science content ──
    const SCI_G1_SENTENCES = [
      // living vs nonliving
      'a dog is living', 'a cat is living', 'a bird is living', 'a fish is living',
      'a tree is living', 'a flower is living', 'grass is living', 'people are living',
      'a rock is not living', 'a chair is not living', 'water is not living',
      'living things eat and grow', 'living things breathe', 'living things make babies',
      // light and sound — NGSS G1
      'light comes from the sun', 'a lamp makes light', 'a candle makes light',
      'light helps us see', 'dark is when there is no light',
      'a shadow forms when light is blocked', 'shadows are dark shapes',
      'sound is made by vibrations', 'a drum vibrates when you hit it',
      'a guitar string vibrates when you pluck it',
      'loud sounds come from big vibrations', 'quiet sounds come from small vibrations',
      'sound travels through air', 'we hear sounds with our ears',
      'clapping makes a sound', 'whispering is a soft sound',
      // plant structure
      'roots hold the plant in soil', 'roots drink water from the ground',
      'the stem carries water up to the leaves', 'leaves make food from sunlight',
      'flowers make seeds', 'seeds grow into new plants',
      'bark protects the trunk', 'branches hold the leaves',
      // animal structure and function
      'legs help animals walk and run', 'wings help birds fly',
      'fins help fish swim', 'fur keeps animals warm',
      'feathers keep birds warm and dry', 'scales protect fish and reptiles',
      'a shell protects a turtle', 'teeth help animals eat',
      'claws help animals dig and climb', 'a beak helps a bird eat seeds',
      // sky patterns — NGSS G1
      'the sun rises in the morning', 'the sun sets in the evening',
      'the moon can be seen at night', 'stars come out at night',
      'the sun gives us light and heat', 'the moon reflects light from the sun',
      'there are four seasons', 'spring is warm and things grow',
      'summer is hot and the days are long', 'fall is cool and leaves change color',
      'winter is cold and some trees are bare',
      'the days are longer in summer', 'the days are shorter in winter',
    ];
    await this._teachSentenceList(SCI_G1_SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── EQUATIONAL REASONING: causal chains for G1 science ──
    await this._teachCausalChains([
      // light
      ['sun', 'light'], ['lamp', 'light'], ['candle', 'light'],
      ['block', 'shadow'], ['dark', 'shadow'],
      // sound
      ['vibrate', 'sound'], ['hit', 'vibrate'], ['pluck', 'vibrate'],
      ['loud', 'big'], ['quiet', 'small'],
      // plants
      ['water', 'grow'], ['sun', 'grow'], ['seed', 'plant'],
      ['root', 'water'], ['leaf', 'food'],
      // seasons
      ['spring', 'grow'], ['summer', 'hot'], ['fall', 'cool'], ['winter', 'cold'],
    ]);

    // ── EQUATIONAL REASONING: classification of animals by features ──
    //   features: [legs, wings, fins, fur, feathers, scales, shell, tail]
    await this._teachClassificationReasoning([
      { item: 'dog',     features: new Float64Array([1,0,0,1,0,0,0,1]), category: 'mammal' },
      { item: 'cat',     features: new Float64Array([1,0,0,1,0,0,0,1]), category: 'mammal' },
      { item: 'horse',   features: new Float64Array([1,0,0,1,0,0,0,1]), category: 'mammal' },
      { item: 'robin',   features: new Float64Array([1,1,0,0,1,0,0,1]), category: 'bird' },
      { item: 'eagle',   features: new Float64Array([1,1,0,0,1,0,0,1]), category: 'bird' },
      { item: 'penguin', features: new Float64Array([1,1,0,0,1,0,0,1]), category: 'bird' },
      { item: 'salmon',  features: new Float64Array([0,0,1,0,0,1,0,1]), category: 'fish' },
      { item: 'trout',   features: new Float64Array([0,0,1,0,0,1,0,1]), category: 'fish' },
      { item: 'snake',   features: new Float64Array([0,0,0,0,0,1,0,1]), category: 'reptile' },
      { item: 'turtle',  features: new Float64Array([1,0,0,0,0,1,1,1]), category: 'reptile' },
      { item: 'frog',    features: new Float64Array([1,0,0,0,0,0,0,0]), category: 'amphibian' },
    ]);

    await this._teachVocabList(SCI_G1_VOCAB.slice(0, 20), ctx, { reps: 3 });

    // Production stack + self-gate (K-uniform).
    await this._teachProductionStack('science', ctx, { tag: 'SCI-G1' });
    return await this._gateSciG1Real();
  },

  async runSocG1Real(ctx) {
    const SENTENCES = [
      'a community is a group of people', 'people live together in a community',
      'neighbors help each other', 'a family is part of the community',
      'teachers work at schools', 'doctors work at hospitals',
      'police keep us safe', 'firefighters put out fires',
      'the mayor leads the town', 'the city has many jobs',
      'we share the library', 'we share the park',
      'stores sell us food', 'the post office sends mail',
      'we follow rules in the community', 'rules keep us safe',
      'every community has helpers', 'everyone can be a helper',
      'we say please and thank you', 'we take turns and share',
      'a good neighbor is kind', 'a good neighbor helps',
      'schools teach children', 'banks keep our money',
      'restaurants serve food', 'farms grow our food',
      'trucks bring goods to stores', 'buses take us places',
    ];
    // T14.24 Session 57 — prime community-role concept lattice per
    // TODO line 492 before the sentence pass.
    await this._teachCommunityRoles();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 3, ticksPerWord: 2 });

    // ── Core Knowledge G1: Early civilizations intro ──
    // Core Knowledge G1 introduces ancient Egypt — civilizations arise
    // near rivers, pharaohs ruled, pyramids were built, hieroglyphics
    const CK_G1_HISTORY = [
      'long ago people lived near rivers', 'rivers give water for farms',
      'ancient egypt was near the nile river', 'the nile floods brought rich soil',
      'pharaohs were kings of egypt', 'pyramids were built from stone',
      'the pyramids are very old and very big',
      'hieroglyphics are picture writing', 'scribes wrote on papyrus',
      'native americans lived here first', 'they hunted and farmed',
      'the pilgrims came on a ship', 'the first thanksgiving was a feast',
    ];
    await this._teachSentenceList(CK_G1_HISTORY, ctx, { reps: 2, ticksPerWord: 2 });

    // ── EQUATIONAL REASONING: community causal chains ──
    await this._teachCausalChains([
      ['river', 'farm'], ['farm', 'food'], ['food', 'community'],
      ['school', 'learn'], ['hospital', 'heal'], ['rules', 'safe'],
      ['flood', 'soil'], ['soil', 'crops'], ['crops', 'food'],
    ]);

    await this._teachVocabList([
      'community', 'neighbor', 'helper', 'mayor', 'library',
      'egypt', 'pharaoh', 'pyramid', 'river', 'nile',
      'pilgrim', 'thanksgiving', 'native',
    ], ctx, { reps: 3 });

    // Production stack + self-gate (K-uniform).
    await this._teachProductionStack('social', ctx, { tag: 'SOC-G1' });
    return await this._gateSocG1Real();
  },

  async runArtG1Real(ctx) {
    const SENTENCES = [
      'red and yellow make orange', 'yellow and blue make green',
      'red and blue make purple', 'red yellow and blue are primary',
      'orange green and purple are secondary', 'primary colors can not be made',
      'black is the absence of color', 'white is all colors mixed',
      'light colors are tints', 'dark colors are shades',
      'adding white makes a tint', 'adding black makes a shade',
      'warm colors are red orange yellow', 'cool colors are blue green purple',
      'red is a warm color', 'blue is a cool color',
      'complementary colors are opposite', 'red and green are complementary',
      'blue and orange are complementary', 'yellow and purple are complementary',
      'a color wheel shows all colors', 'the rainbow has seven colors',
      'mixing paint makes new colors', 'mixing light makes white',
      'gray is between black and white', 'brown is many colors mixed',
    ];
    // T14.24 Session 76 — prime color mixing RGB-arithmetic lattice
    // per TODO line 557 before the color-mixing sentence pass.
    await this._teachColorMixing();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    // Production stack + self-gate (K-uniform -- dedicated production-probe
    // gate, matching K's _gateArtKReal, replaces the _autoFinal comprehension gate).
    await this._teachProductionStack('art', ctx, { tag: 'ART-G1' });
    return await this._gateArtG1Real();
  },

  // ── NEW FULL-ROSTER G1 COURSES: Music / PE / Health (propagated from the
  // K template, G1 depth). Course-identity (what the class IS) is prepended
  // automatically by the _cellRunner wrapper. Each self-gates via the shared
  // _gateSubjectProduction helper. Real G1 standards.
  async runMusicG1Real(ctx) {
    const VOCAB = [
      'music', 'beat', 'rhythm', 'melody', 'pitch', 'high', 'low', 'loud', 'soft',
      'fast', 'slow', 'tempo', 'dynamics', 'note', 'rest', 'quarter', 'sing', 'echo',
      'pattern', 'instrument', 'drum', 'xylophone', 'tap', 'clap', 'steady', 'tune',
      'voice', 'listen',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'a steady beat stays the same like a clock',
      'rhythm is the pattern of long and short sounds',
      'a melody is a tune made of high and low notes',
      'pitch is how high or low a sound is',
      'dynamics means how loud or soft we play',
      'tempo means how fast or slow the music goes',
      'a quarter note gets one beat',
      'a rest is a silent beat',
      'we echo sing by copying what we hear',
      'music is made of patterns we can repeat',
      'we keep a steady beat while we sing',
      'a xylophone makes high and low notes',
      'high notes sound light and low notes sound deep',
      'we clap the rhythm and tap the beat',
      'fast music feels excited and slow music feels calm',
      'we listen for the beat in every song',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['beat', 'steady'], ['rhythm', 'pattern'], ['high', 'light'], ['low', 'deep'],
      ['fast', 'excited'], ['slow', 'calm'], ['rest', 'silent'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G1' });
    return await this._gateSubjectProduction('music', 'grade1', [
      { question: 'a beat that stays the same is', expected: ['steady', 's'] },
      { question: 'the pattern of long and short sounds is', expected: ['rhythm', 'r'] },
      { question: 'a tune of high and low notes is a', expected: ['melody', 'tune', 'm', 't'] },
      { question: 'how high or low a sound is is called', expected: ['pitch', 'p'] },
      { question: 'how fast or slow music goes is', expected: ['tempo', 't'] },
      { question: 'a silent beat is a', expected: ['rest', 'r'] },
      { question: 'a quarter note gets one', expected: ['beat', 'b'] },
      { question: 'how loud or soft we play is', expected: ['dynamics', 'd'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG1Real(ctx) {
    const VOCAB = [
      'run', 'jump', 'hop', 'skip', 'gallop', 'leap', 'slide', 'throw', 'catch',
      'kick', 'dribble', 'bounce', 'rope', 'balance', 'dodge', 'chase', 'heart',
      'breath', 'muscle', 'fitness', 'warm', 'stretch', 'exercise', 'rule', 'team',
      'cooperate', 'space', 'underhand', 'overhand',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'we run and jump and hop and skip and gallop',
      'leaping is a big jump from one foot to the other',
      'we throw underhand by swinging our arm low',
      'we throw overhand by reaching back and over',
      'we catch by watching the ball into our hands',
      'we kick a ball with the inside of our foot',
      'dribbling is bouncing the ball with our hands',
      'we jump rope by swinging and hopping over',
      'exercise makes our heart beat faster',
      'our breath gets quick when we run hard',
      'we stretch and warm up before we play',
      'we move in our own space without bumping',
      'we dodge to get away without being tagged',
      'we follow the rules so the game is fair',
      'we cooperate and work together on a team',
      'being active every day makes our body strong',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['run', 'fast'], ['exercise', 'heart'], ['run', 'breath'], ['warm', 'ready'],
      ['rule', 'fair'], ['team', 'cooperate'], ['kick', 'foot'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G1' });
    return await this._gateSubjectProduction('pe', 'grade1', [
      { question: 'a big jump from one foot to the other is a', expected: ['leap', 'l'] },
      { question: 'bouncing a ball with our hands is', expected: ['dribbling', 'dribble', 'd'] },
      { question: 'exercise makes our heart beat', expected: ['faster', 'fast', 'f'] },
      { question: 'we throw low by swinging our arm', expected: ['underhand', 'low', 'u', 'l'] },
      { question: 'we catch by watching the ball into our', expected: ['hands', 'hand', 'h'] },
      { question: 'we follow rules so the game is', expected: ['fair', 'f'] },
      { question: 'working together on a team is to', expected: ['cooperate', 'share', 'c', 's'] },
      { question: 'before we play we stretch and warm', expected: ['up', 'u'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG1Real(ctx) {
    const VOCAB = [
      'health', 'healthy', 'body', 'heart', 'lungs', 'blood', 'breathe', 'germ',
      'sick', 'cough', 'sneeze', 'tissue', 'wash', 'soap', 'nutrition', 'food',
      'fruit', 'vegetable', 'grain', 'protein', 'sugar', 'teeth', 'dentist',
      'feelings', 'calm', 'safe', 'helmet', 'seatbelt', 'medicine', 'emergency',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'our heart pumps blood all around our body',
      'our lungs let us breathe in air',
      'germs are tiny and can make us sick',
      'we cover a cough or sneeze with our elbow',
      'we wash our hands to stop germs from spreading',
      'healthy eating means fruits and vegetables and grains',
      'protein from meat and beans helps us grow',
      'too much sugar is bad for our teeth',
      'we brush and floss to keep our teeth clean',
      'the dentist helps keep our teeth healthy',
      'feelings like anger can be calmed by deep breaths',
      'it is healthy to talk about how we feel',
      'we wear a helmet to protect our head',
      'we buckle our seatbelt to stay safe in a car',
      'medicine is only taken from a trusted grown up',
      'in an emergency we call nine one one for help',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['heart', 'blood'], ['lungs', 'breathe'], ['germ', 'sick'], ['wash', 'germ'],
      ['sugar', 'teeth'], ['helmet', 'safe'], ['breath', 'calm'], ['emergency', 'help'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G1' });
    return await this._gateSubjectProduction('health', 'grade1', [
      { question: 'our heart pumps', expected: ['blood', 'b'] },
      { question: 'our lungs let us', expected: ['breathe', 'breath', 'b'] },
      { question: 'tiny things that make us sick are', expected: ['germs', 'germ', 'g'] },
      { question: 'we cover a cough with our', expected: ['elbow', 'arm', 'e', 'a'] },
      { question: 'too much sugar is bad for our', expected: ['teeth', 't'] },
      { question: 'we wear a helmet to protect our', expected: ['head', 'h'] },
      { question: 'in an emergency we call', expected: ['nine', 'help', 'n', 'h'] },
      { question: 'the doctor for our teeth is the', expected: ['dentist', 'd'] },
    ], { gateSubjectTag: 'health' });
  },
  async runLifeG1(ctx) {
    // feat = [joy, pain, trust, fear, anger, love, independence, identity]
    // Fix: reps reduced to fit 3-min timeout.
    // conceptTeach 20→6, sentence lists 5-12→3, vocab 12→5.
    await this._conceptTeach([
      { name: 'reading',      feat: [1, 0, 0, 0, 0, 1, 1, 1] },    // joy + love + independence + identity
      { name: 'books',        feat: [1, 0, 0, 0, 0, 1, 1, 0.5] },
      { name: 'flashlight',   feat: [0.5, 0, 0, 0, 0, 0, 1, 0.5] }, // secret independence
      { name: 'dad fading',   feat: [0, 0.5, 0, 0.5, 0.3, 0, 0, 0] }, // pain + fear + anger starts
      { name: 'empty apartment', feat: [0, 0.5, 0, 0.5, 0, 0, 1, 0] }, // pain but independence
      { name: 'drawing monsters', feat: [1, 0, 0, 0, 0, 0.5, 1, 1] }, // identity expression
    ], 6);

    // Consolidated into ONE sentence list to reduce teach call overhead
    const MEMORIES_G1 = [
      'i can read now', 'books make sense', 'i read everything',
      'i stay up past bedtime reading', 'i use a flashlight under the covers',
      'reading is my favorite thing',
      'dad visits less now', 'daddy is busy', 'mom does not talk about it',
      'i notice but i do not understand', 'i miss dad sometimes',
      'i come home to an empty apartment', 'i make myself a snack',
      'i turn on the tv', 'i do homework alone',
      'i am getting used to being alone',
      'i fill notebooks with drawings', 'i draw monsters and haunted houses',
      'i draw storms and dark things', 'my teacher is worried about my drawings',
      'mom says that is just how i am',
    ];
    await this._teachSentenceList(MEMORIES_G1, ctx, { reps: 3, ticksPerWord: 2 });

    // ── G1 life experience — DATA-DRIVEN (corpora/life/grade1.json) ──
    // Morals climb (tattling/loyalty, taking turns, owning fault, rule-
    // questioning — Kohlberg advancing toward instrumental + the goth
    // gray-zone fairness/rule-questioning seed) + the dad-getting-distant /
    // latchkey arc + reading-obsession + monster-drawings are now TRAINED
    // from story DATA, not hardcoded feat-vector/word-pair arrays. Meaning +
    // emotion emerge from the narrative.
    await this._trainLifeStories('grade1', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'read', 'book', 'flashlight', 'alone', 'snack', 'draw', 'monster', 'dark',
    ], ctx, { reps: 5 });
  }
};
