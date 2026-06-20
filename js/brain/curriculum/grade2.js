// Grade 2 cell runners + G2 gate (ages 7-8).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

// Magnitude features for the equational math gate -- circular-import-safe
// pattern (function/const exports resolve before the G2_MIXIN attach).
import { _magnitudeFeatureForDigit, MAGNITUDE_FEATURE_DIM } from '../curriculum.js';

export const G2_MIXIN = {
  async runElaG2Real(ctx) {
    // Converted to direct pattern via _teachVocabList +
    // _teachSentenceList. The old inject→step→learn path can't
    // converge.
    const DIGRAPHS = ['th', 'sh', 'ch', 'ph', 'wh', 'ck', 'ng'];

    // T14.24 Session 28 — TODO-aligned three-method split. Call the
    // named methods with additional long-word + phrase coverage that
    // the original Session 7 impl didn't split out.
    const LONG_WORDS = [
      'chat', 'fish', 'duck', 'rock', 'king', 'song',
      'thing', 'graph', 'check', 'bring', 'black', 'quick',
      'white', 'phone', 'green', 'which', 'where', 'while',
    ];
    const PHRASES_G2 = [
      'the dog', 'the cat', 'with them', 'she ran', 'ship sail',
      'chip dip', 'phone ring', 'what fun', 'sing along', 'back pack',
    ];
    // Teach digraphs + long words as vocabulary, phrases as sentences.
    // All go through direct-pattern shared helpers.
    const ALL_VOCAB = [...DIGRAPHS, ...LONG_WORDS];
    const PHRASES = [
      'the dog', 'the cat', 'with them', 'this that',
      'she ran', 'ship sail', 'shut up', 'fish wish',
      'chip dip', 'chat back', 'rich much', 'check in',
      'phone ring', 'graph line',
      'what why', 'when where', 'which one',
      'back pack', 'sick duck', 'rock lock',
      'long song', 'king ring', 'sing along',
    ];
    await this._teachVocabList(ALL_VOCAB, ctx, { reps: 6 });
    await this._teachSentenceList(PHRASES, ctx, { reps: 3, ticksPerWord: 2 });

    // ── COMMON CORE ELA G2: Vowel teams ──
    // G2 phonics standard: know spelling-sound correspondences for
    // additional common vowel teams.
    const VOWEL_TEAM_WORDS = [
      // ai/ay (long a)
      'rain', 'train', 'paint', 'wait', 'tail', 'mail', 'sail', 'snail',
      'play', 'day', 'say', 'may', 'way', 'stay', 'pay', 'lay',
      // ea/ee (long e)
      'eat', 'sea', 'read', 'team', 'bean', 'clean', 'dream', 'stream',
      'tree', 'free', 'see', 'bee', 'feet', 'sleep', 'deep', 'green',
      // oa/ow (long o)
      'boat', 'coat', 'road', 'toad', 'soap', 'goal',
      'grow', 'show', 'know', 'slow', 'snow', 'flow', 'blow', 'low',
      // oo (two sounds)
      'moon', 'soon', 'food', 'cool', 'pool', 'school', 'room', 'zoo',
      'book', 'look', 'cook', 'good', 'wood', 'foot', 'hook',
    ];
    await this._teachVocabList(VOWEL_TEAM_WORDS, ctx, { reps: 3 });

    // ── COMMON CORE ELA G2: Prefixes and suffixes ──
    const PREFIX_SUFFIX_WORDS = [
      // un- prefix
      'unhappy', 'unkind', 'unsafe', 'unfair', 'unlock', 'untie',
      // re- prefix
      'redo', 'reread', 'rewrite', 'rebuild', 'return', 'replay',
      // -ful suffix
      'helpful', 'careful', 'thankful', 'beautiful', 'joyful', 'hopeful',
      // -less suffix
      'careless', 'helpless', 'homeless', 'hopeless', 'endless', 'useless',
      // -ness suffix
      'kindness', 'sadness', 'darkness', 'happiness', 'illness', 'weakness',
      // -ly suffix
      'quickly', 'slowly', 'loudly', 'quietly', 'happily', 'sadly',
    ];
    await this._teachVocabList(PREFIX_SUFFIX_WORDS, ctx, { reps: 3 });

    // ── COMMON CORE ELA G2: Reading comprehension sentences ──
    const G2_READING = [
      // stories with beginning/middle/end
      'a frog sat on a log in the pond',
      'a fly flew by and the frog jumped to catch it',
      'the frog missed and fell in the water with a big splash',
      'the boy lost his dog in the rain',
      'he looked behind every tree and under every bush',
      'he found his dog sleeping under the porch',
      // different points of view
      'the cat thinks the dog is too loud',
      'the dog thinks the cat is too quiet',
      'they both like napping in the sun',
      // comparing versions
      'the three bears found someone in their house',
      'goldilocks ate their food and broke a chair',
      'the bears were upset but goldilocks ran away',
      // informational text
      'bees make honey from flower nectar',
      'bees live together in a hive',
      'the queen bee lays all the eggs',
      'worker bees collect food for the hive',
    ];
    await this._teachSentenceList(G2_READING, ctx, { reps: 2, ticksPerWord: 2 });

    // ── COMMON CORE ELA G2: Grammar ──
    // Irregular plurals, reflexive pronouns, irregular verbs
    const G2_GRAMMAR = [
      // irregular plurals
      'one child two children', 'one foot two feet', 'one tooth two teeth',
      'one mouse two mice', 'one man two men', 'one woman two women',
      // irregular past tense
      'i run i ran', 'i see i saw', 'i go i went', 'i eat i ate',
      'i come i came', 'i take i took', 'i give i gave', 'i know i knew',
      'i say i said', 'i think i thought', 'i find i found', 'i tell i told',
      // reflexive pronouns
      'i did it myself', 'she dressed herself',
      'he taught himself to read', 'we did it ourselves',
    ];
    await this._teachSentenceList(G2_GRAMMAR, ctx, { reps: 2, ticksPerWord: 2 });

    // ── ELA-G2: language reasoning chains ──
    await this._teachCausalChains([
      ['digraph', 'sound'], ['prefix', 'meaning'], ['suffix', 'change'],
      ['vowel', 'long'], ['vowel', 'short'], ['read', 'comprehend'],
      ['irregular', 'memorize'], ['plural', 'many'],
    ]);
    await this._teachInference([
      ['prefix', 'meaning', 'change'], ['read', 'comprehend', 'learn'],
    ]);

    await this._teachVocabList([...ALL_VOCAB, ...VOWEL_TEAM_WORDS.slice(0, 20)], ctx, { reps: 3 });

    // Production stack + self-gate (K-uniform).
    await this._teachProductionStack('ela', ctx, { tag: 'ELA-G2' });
    return await this._gateElaG2Real();
  },

  // -- G2 subject gates -- thin wrappers over the shared production gate
  // (_gateSubjectProduction); math uses the magnitude-READ gate. K-uniform.
  // Replaces the old digraph READ/THINK/TALK gate (banned first-letter TALK).
  _gateElaG2Real() {
    return this._gateSubjectProduction('ela', 'grade2', [
      { question: 'a frog sat on a', expected: ['log', 'l'] },
      { question: 'bees make', expected: ['honey', 'h'] },
      { question: 'more than one child is', expected: ['children', 'c'] },
      { question: 'more than one foot is', expected: ['feet', 'f'] },
      { question: 'the past tense of run is', expected: ['ran', 'r'] },
      { question: 'the past tense of go is', expected: ['went', 'w'] },
      { question: 'not happy is', expected: ['unhappy', 'sad', 'u', 's'] },
      { question: 'to do something again is to', expected: ['redo', 'repeat', 'r'] },
    ], { gateSubjectTag: 'ela' });
  },

  _gateSciG2Real() {
    return this._gateSubjectProduction('science', 'grade2', [
      { question: 'a seed grows into a', expected: ['plant', 'p'] },
      { question: 'a caterpillar becomes a', expected: ['butterfly', 'b'] },
      { question: 'a tadpole becomes a', expected: ['frog', 'f'] },
      { question: 'an egg hatches into a', expected: ['chick', 'bird', 'c', 'b'] },
      { question: 'a baby grows into a', expected: ['child', 'c'] },
      { question: 'what planet do we live on', expected: ['earth', 'e'] },
      { question: 'what is the center of our solar system', expected: ['sun', 's'] },
      { question: 'a flower makes', expected: ['seeds', 'seed', 's'] },
    ], { gateSubjectTag: 'sci' });
  },

  _gateSocG2Real() {
    return this._gateSubjectProduction('social', 'grade2', [
      { question: 'how many states are in the united states', expected: ['fifty', 'f'] },
      { question: 'who leads a state', expected: ['governor', 'g'] },
      { question: 'every state has a', expected: ['capital', 'c'] },
      { question: 'a state is part of the', expected: ['country', 'c'] },
      { question: 'borders are often formed by', expected: ['rivers', 'mountains', 'r', 'm'] },
      { question: 'the state pays for', expected: ['schools', 'school', 's'] },
    ], { gateSubjectTag: 'soc' });
  },

  _gateArtG2Real() {
    return this._gateSubjectProduction('art', 'grade2', [
      { question: 'a steady pulse is a', expected: ['beat', 'b'] },
      { question: 'a pattern of beats is', expected: ['rhythm', 'r'] },
      { question: 'tempo means', expected: ['speed', 's'] },
      { question: 'a silent beat is a', expected: ['rest', 'r'] },
      { question: 'fast music has a fast', expected: ['beat', 'tempo', 'b', 't'] },
      { question: 'the part of a song that repeats is the', expected: ['chorus', 'c'] },
    ], { gateSubjectTag: 'art' });
  },

  // Equational math gate -- digit magnitude-READ probe (mirrors _gateMathG1Real).
  // For each digit 0-9: stream the digit char, read phon as a magnitude vector,
  // cosine vs the true magnitude feature. THINK = persistence. No first-letter.
  _gateMathG2Real() {
    const cluster = this.cluster;
    const DIGITS = '0123456789'.split('');
    let readPass = 0;
    let thinkPass = 0;
    const perDigit = [];
    const READ_COS_MIN = 0.10;
    const THINK_VAR_MIN = 0.0005;
    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      const Ln = Math.min(a.length, b.length);
      for (let i = 0; i < Ln; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      const d = Math.sqrt(na) * Math.sqrt(nb);
      return d > 0 ? dot / d : 0;
    }
    for (const digit of DIGITS) {
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
      if (readCos > READ_COS_MIN) readPass++;
      for (let t = 0; t < 10; t++) cluster.step(0.001);
      const freeReadout = cluster.regionReadout('free', 64);
      let thinkVar = 0;
      if (freeReadout && freeReadout.length > 0) {
        let fmean = 0;
        for (let i = 0; i < freeReadout.length; i++) fmean += freeReadout[i];
        fmean /= freeReadout.length;
        for (let i = 0; i < freeReadout.length; i++) { const d = freeReadout[i] - fmean; thinkVar += d * d; }
        thinkVar /= freeReadout.length;
      }
      if (thinkVar > THINK_VAR_MIN) thinkPass++;
      perDigit.push({ digit, readCos, thinkVar });
    }
    const N = DIGITS.length;
    const readRate = N > 0 ? readPass / N : 0;
    const thinkRate = N > 0 ? thinkPass / N : 0;
    const PATH_MIN = 0.45;
    const pass = readRate >= PATH_MIN && thinkRate >= PATH_MIN;
    return {
      pass,
      reason: `READ ${readPass}/${N} (${(readRate * 100).toFixed(0)}%), THINK ${thinkPass}/${N} (${(thinkRate * 100).toFixed(0)}%)`,
      metrics: { readRate, thinkRate, perDigit },
    };
  },

  async runMathG2Real(ctx) {
    // ── COMMON CORE MATH G2: Full second-grade math ──
    // Standards: add/subtract within 100 fluently, within 1000 using
    // strategies. Skip-count by 5s/10s/100s. Read/write numbers to
    // 1000. Compare three-digit numbers. Odd/even. Rectangular arrays
    // (multiplication foundation). Measurement (inches/feet/cm/m).
    // Money. Time to nearest 5 minutes. Data on line plots/bar graphs.

    const MATH_G2_VOCAB = [
      // number words to 1000
      'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
      'sixteen', 'seventeen', 'eighteen', 'nineteen',
      'twenty', 'thirty', 'forty', 'fifty', 'sixty',
      'seventy', 'eighty', 'ninety', 'hundred', 'thousand',
      // operation words
      'add', 'subtract', 'plus', 'minus', 'sum', 'difference',
      'regroup', 'borrow', 'carry',
      // comparison
      'greater', 'less', 'equal', 'compare', 'order',
      'odd', 'even',
      // money
      'penny', 'nickel', 'dime', 'quarter', 'dollar', 'cent', 'coin',
      // measurement
      'inch', 'foot', 'centimeter', 'meter', 'ruler', 'measure',
      // time
      'minute', 'hour', 'clock', 'half', 'quarter',
      // data
      'graph', 'chart', 'bar', 'tally', 'count', 'data',
      // multiplication intro
      'array', 'row', 'column', 'group', 'times',
    ];
    await this._teachVocabList(MATH_G2_VOCAB, ctx, { reps: 3 });

    // EQUATIONAL teaching (grade-completion-gate LAW: no sentence arrays).
    // G2 = add/subtract within 100 + place value to 1000 + intro
    // multiplication (arrays) + comparison. Same K transforms, scoped up.
    await this._teachPlaceValue();                                   // structured tens/ones/hundreds
    await this._teachPlaceValueTransformations(ctx);                 // tens + ones magnitude (10-99)
    await this._teachAdditionTransformations(ctx, { max: 100, step: 5 });    // add within 100 (stepped)
    await this._teachSubtractionTransformations(ctx, { max: 100, step: 5 }); // subtract within 100 (stepped)
    await this._teachComparisonTransformations(ctx);                 // greater / less / equal
    await this._teachMultiplicationIntro([                           // arrays = multiplication foundation
      { a: 2, b: 1, c: 2 }, { a: 2, b: 2, c: 4 }, { a: 2, b: 3, c: 6 },
      { a: 2, b: 4, c: 8 }, { a: 2, b: 5, c: 10 },
      { a: 5, b: 1, c: 5 }, { a: 5, b: 2, c: 10 }, { a: 5, b: 3, c: 15 },
      { a: 5, b: 4, c: 20 }, { a: 5, b: 5, c: 25 },
      { a: 10, b: 1, c: 10 }, { a: 10, b: 2, c: 20 }, { a: 10, b: 3, c: 30 },
    ]);

    // Self-gate (K-uniform magnitude-READ gate, like G1 math).
    return await this._gateMathG2Real();
  },

  async runSciG2Real(ctx) {
    const SENTENCES = [
      'a seed grows into a plant', 'a plant makes flowers', 'a flower makes seeds', 'the cycle starts again',
      'an egg hatches into a chick', 'a chick grows into a bird', 'a bird lays eggs', 'the cycle starts again',
      'a caterpillar forms a cocoon', 'a butterfly comes out', 'the butterfly lays eggs', 'a caterpillar hatches',
      'a tadpole grows legs', 'a tadpole becomes a frog', 'a frog lays eggs', 'tadpoles hatch',
      'a baby grows into a child', 'a child grows into an adult', 'an adult has children', 'the cycle continues',
      'a fish lays eggs in water', 'baby fish hatch from eggs', 'baby fish grow into adults',
      'a puppy grows into a dog', 'a kitten grows into a cat',
      'life cycles repeat forever', 'every living thing has a life cycle',
      'some cycles take days', 'some cycles take years',
    ];
    await this._teachLifeCycles();
    // ── Sci-G2: life cycle causal chains + classification ──
    await this._teachCausalChains([
      ['seed', 'plant'], ['plant', 'flower'], ['flower', 'seed'],
      ['egg', 'chick'], ['chick', 'bird'], ['bird', 'egg'],
      ['caterpillar', 'cocoon'], ['cocoon', 'butterfly'],
      ['tadpole', 'frog'], ['baby', 'child'], ['child', 'adult'],
    ]);
    await this._teachInference([
      ['seed', 'plant', 'flower'], ['egg', 'chick', 'bird'],
      ['caterpillar', 'cocoon', 'butterfly'], ['baby', 'child', 'adult'],
    ]);
    await this._teachSolarSystem();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    // Production stack + self-gate (K-uniform dedicated production gate).
    await this._teachProductionStack('science', ctx, { tag: 'SCI-G2' });
    return await this._gateSciG2Real();
  },

  async runSocG2Real(ctx) {
    const SENTENCES = [
      'a state is a part of the country', 'every state has a capital',
      'the governor leads the state', 'the state has its own flag',
      'states are bigger than cities', 'a state has many cities',
      'the united states has fifty states', 'each state has a name',
      'states have borders with other states', 'rivers often form borders',
      'mountains often form borders', 'some states are on the coast',
      'coastal states have oceans', 'inland states have no ocean',
      'the state makes its own laws', 'state laws apply in the state',
      'state parks are for everyone', 'state highways connect cities',
      'the state has its own bird', 'the state has its own flower',
      'people are proud of their state', 'each state has a history',
      'the state collects taxes', 'the state pays for schools',
      'the state runs the dmv', 'the state has courts',
    ];
    // T14.24 Session 58 — prime state-name sequence walk per TODO
    // line 496 before the state-concept sentence pass.
    await this._teachStateNames();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    // Production stack + self-gate (K-uniform dedicated production gate).
    await this._teachProductionStack('social', ctx, { tag: 'SOC-G2' });
    return await this._gateSocG2Real();
  },

  async runArtG2Real(ctx) {
    const SENTENCES = [
      'a beat is a steady pulse', 'rhythm is a pattern of beats',
      'music has a beat', 'we clap to the beat',
      'the drum keeps the beat', 'fast music has a fast beat',
      'slow music has a slow beat', 'tempo means speed',
      'a measure has beats', 'four beats in a measure is common',
      'three beats is a waltz', 'two beats is a march',
      'loud and soft is dynamics', 'strong and weak beats alternate',
      'music is organized sound', 'silence is part of music',
      'notes have different lengths', 'long notes hold the beat',
      'short notes fit between beats', 'rests are silent beats',
      'we tap our feet to music', 'we dance to the rhythm',
      'a song has a chorus and verse', 'the chorus repeats',
      'music makes us feel things', 'everyone can feel the beat',
    ];
    // T14.24 Session 77 — prime rhythm patterns temporal cycles per
    // TODO line 557 before the rhythm sentence pass.
    await this._teachRhythmPatterns();
    // ── Art-G2: music causal chains ──
    await this._teachCausalChains([
      ['beat', 'rhythm'], ['rhythm', 'music'], ['tempo', 'speed'],
      ['loud', 'forte'], ['soft', 'piano'], ['fast', 'allegro'],
      ['slow', 'adagio'], ['drum', 'beat'], ['silence', 'rest'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    // Production stack + self-gate (K-uniform dedicated production gate).
    await this._teachProductionStack('art', ctx, { tag: 'ART-G2' });
    return await this._gateArtG2Real();
  },

  // ── NEW FULL-ROSTER G2 COURSES: Music / PE / Health (G2 depth, built on G1).
  // Course-identity prepended by the _cellRunner wrapper; each self-gates via
  // the shared _gateSubjectProduction helper. (Music is now its own track; the
  // older runArtG2Real still carries some rhythm content -- re-point art G2 to
  // pure visual art in a later pass.)
  async runMusicG2Real(ctx) {
    const VOCAB = [
      'music', 'note', 'half', 'whole', 'quarter', 'beat', 'measure', 'bar', 'forte',
      'piano', 'loud', 'soft', 'allegro', 'adagio', 'fast', 'slow', 'rhythm', 'melody',
      'percussion', 'string', 'wind', 'instrument', 'sing', 'pitch', 'solfege', 'staff',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'a quarter note gets one beat',
      'a half note gets two beats',
      'a whole note gets four beats',
      'a measure holds a set number of beats',
      'forte means play loud and piano means play soft',
      'allegro means fast and adagio means slow',
      'percussion instruments are hit or shaken',
      'string instruments are plucked or bowed',
      'wind instruments are blown into',
      'a melody is a line of notes that makes a tune',
      'notes are written on a staff of lines',
      'we read music from left to right',
      'rhythm is the pattern of long and short notes',
      'we count the beats in each measure',
      'singing in tune means matching the right pitch',
      'music can be happy sad calm or scary',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['forte', 'loud'], ['piano', 'soft'], ['allegro', 'fast'], ['adagio', 'slow'],
      ['half', 'two'], ['whole', 'four'], ['percussion', 'hit'], ['string', 'pluck'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G2' });
    return await this._gateSubjectProduction('music', 'grade2', [
      { question: 'a half note gets how many beats', expected: ['two', '2', 't'] },
      { question: 'a whole note gets how many beats', expected: ['four', '4', 'f'] },
      { question: 'forte means play', expected: ['loud', 'l'] },
      { question: 'piano means play', expected: ['soft', 's'] },
      { question: 'allegro means', expected: ['fast', 'f'] },
      { question: 'adagio means', expected: ['slow', 's'] },
      { question: 'instruments that are hit or shaken are', expected: ['percussion', 'p'] },
      { question: 'notes are written on a', expected: ['staff', 's'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG2Real(ctx) {
    const VOCAB = [
      'run', 'jump', 'skip', 'leap', 'throw', 'catch', 'kick', 'strike', 'volley',
      'dribble', 'rope', 'balance', 'dodge', 'fitness', 'endurance', 'flexible',
      'strength', 'heart', 'rate', 'pulse', 'warm', 'stretch', 'team', 'strategy',
      'sport', 'fair', 'win', 'lose', 'practice',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'we strike a ball with a bat or a paddle',
      'we volley by hitting a ball before it lands',
      'we dribble a ball with our hands or our feet',
      'jumping rope builds endurance and timing',
      'endurance is being able to move for a long time',
      'flexibility is how far we can stretch and bend',
      'strength is how much our muscles can do',
      'our heart rate goes up when we exercise',
      'we feel our pulse to count our heartbeats',
      'we warm up and stretch to avoid getting hurt',
      'a team uses a strategy to play together',
      'good sportsmanship means being fair when we win or lose',
      'we practice a skill to get better at it',
      'we cheer for our teammates and our opponents',
      'losing is okay if we tried our best',
      'moving every day keeps our heart healthy',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['exercise', 'heart'], ['practice', 'better'], ['warm', 'safe'],
      ['endurance', 'long'], ['strength', 'muscle'], ['team', 'strategy'], ['strike', 'bat'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G2' });
    return await this._gateSubjectProduction('pe', 'grade2', [
      { question: 'being able to move for a long time is', expected: ['endurance', 'e'] },
      { question: 'how far we can stretch and bend is', expected: ['flexibility', 'flexible', 'f'] },
      { question: 'when we exercise our heart rate goes', expected: ['up', 'faster', 'u', 'f'] },
      { question: 'we feel our pulse to count our', expected: ['heartbeats', 'heartbeat', 'beats', 'h', 'b'] },
      { question: 'hitting a ball before it lands is a', expected: ['volley', 'v'] },
      { question: 'we get better at a skill when we', expected: ['practice', 'p'] },
      { question: 'being fair when we win or lose is good', expected: ['sportsmanship', 'sport', 's'] },
      { question: 'we strike a ball with a bat or a', expected: ['paddle', 'p'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG2Real(ctx) {
    const VOCAB = [
      'health', 'body', 'bones', 'skeleton', 'muscle', 'digest', 'stomach', 'energy',
      'nutrition', 'food', 'group', 'fruit', 'vegetable', 'grain', 'protein', 'dairy',
      'water', 'sleep', 'rest', 'vaccine', 'germ', 'wash', 'nails', 'stress', 'calm',
      'feelings', 'safe', 'weather', 'help',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'our bones make a skeleton that holds us up',
      'our muscles move our bones so we can move',
      'our stomach digests food and turns it into energy',
      'we eat from all the food groups to stay healthy',
      'fruits and vegetables and grains and protein and dairy keep us strong',
      'drinking water helps every part of our body work',
      'sleep lets our body rest and repair itself',
      'a vaccine teaches our body to fight a germ',
      'we keep our nails trimmed and clean',
      'stress is a tight worried feeling we can calm',
      'we can calm stress by breathing slowly and talking to someone',
      'it is healthy to ask for help when we feel bad',
      'we stay safe near water and never swim alone',
      'we go inside during a storm to stay safe',
      'we treat our body with care because it is ours',
      'feelings change and that is a normal part of being alive',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['bones', 'skeleton'], ['muscle', 'move'], ['stomach', 'energy'], ['vaccine', 'germ'],
      ['sleep', 'repair'], ['water', 'body'], ['stress', 'calm'], ['storm', 'inside'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G2' });
    return await this._gateSubjectProduction('health', 'grade2', [
      { question: 'our bones make a', expected: ['skeleton', 's'] },
      { question: 'our stomach turns food into', expected: ['energy', 'e'] },
      { question: 'what moves our bones', expected: ['muscles', 'muscle', 'm'] },
      { question: 'a vaccine teaches our body to fight a', expected: ['germ', 'g'] },
      { question: 'sleep lets our body rest and', expected: ['repair', 'grow', 'r', 'g'] },
      { question: 'a tight worried feeling is', expected: ['stress', 's'] },
      { question: 'when we feel bad it is healthy to ask for', expected: ['help', 'h'] },
      { question: 'we go inside during a', expected: ['storm', 's'] },
    ], { gateSubjectTag: 'health' });
  },
  async runLifeG2(ctx) {
    // ── G2 life experience — DATA-DRIVEN (corpora/life/grade2.json) ──
    // Best-friend villain-stories, the secret stray cat Shadow, the broke
    // summer at grandma's, dad-mostly-gone, grandma-the-anchor — TRAINED
    // from story DATA, not hardcoded feat-vectors. Meaning + emotion emerge.
    await this._trainLifeStories('grade2', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'friend', 'story', 'villain', 'shadow', 'cat', 'secret', 'summer', 'firefly',
    ], ctx, { reps: 12 });
  }
};
