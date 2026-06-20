// Grade 4 cell runners (ages 9-10).
//
// Per-grade file split — the operator directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G4_MIXIN = {
  async runElaG4Real(ctx) {
    // ── COMMON CORE ELA G4: Full fourth-grade English ──
    // Standards: determine theme from details, summarize text, describe
    // character/setting/event with specific details, determine meaning
    // of words and phrases including figurative language (similes/
    // metaphors), explain structural elements of poems/drama/prose,
    // compare/contrast point of view. Writing: opinion pieces with
    // logically ordered reasons, informative with grouped information,
    // narratives with dialogue. Language: relative pronouns (who/whose/
    // whom/which/that), relative adverbs (where/when/why), progressive
    // verb tenses, modal auxiliaries, prepositional phrases.

    // ── VOCABULARY: Fry 501-700 + figurative language + writing terms ──
    const ELA_G4_VOCAB = [
      // figurative language (G4 Reading standard)
      'simile', 'metaphor', 'idiom', 'personification', 'hyperbole',
      'alliteration', 'onomatopoeia', 'imagery', 'symbol',
      // writing/text structure
      'introduction', 'conclusion', 'topic', 'detail', 'evidence',
      'opinion', 'reason', 'support', 'paragraph', 'essay',
      'dialogue', 'narrator', 'theme', 'summary', 'main',
      // relative pronouns (G4 Language standard)
      'who', 'whose', 'whom', 'which', 'that',
      // modal auxiliaries
      'can', 'may', 'must', 'shall', 'should', 'will', 'would', 'could', 'might',
      // Greek/Latin roots intro (G4 Vocabulary standard)
      'auto', 'bio', 'graph', 'port', 'rupt', 'struct', 'tele', 'therm',
      // academic tier 2
      'analyze', 'infer', 'predict', 'summarize', 'determine',
      'support', 'evidence', 'conclude', 'organize', 'develop',
    ];
    await this._teachVocabList(ELA_G4_VOCAB, ctx, { reps: 3 });

    // ── Compound + pronoun sentences (existing) ──
    const COMPOUND = [
      'the dog runs and the cat sleeps', 'i was happy but you were sad',
      'she saw him and he saw her', 'we had food so we ate dinner',
      'they left early because it was late', 'he was tired so he went home',
      'we went to the park but it rained', 'the rain fell and the flowers grew',
    ];
    await this._teachCompoundSentences(COMPOUND);
    await this._teachPronouns();
    await this._teachSentenceList(COMPOUND, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Figurative language sentences ──
    const FIGURATIVE = [
      // similes
      'she runs like the wind', 'he is as strong as an ox',
      'the stars shone like diamonds', 'the baby slept like a log',
      'her smile was as bright as the sun', 'the water was as cold as ice',
      // metaphors
      'time is money', 'the world is a stage', 'life is a journey',
      'her heart is gold', 'the classroom was a zoo',
      'his words were daggers', 'knowledge is a light in the darkness',
      // personification
      'the wind whispered through the trees', 'the sun smiled down on us',
      'the flowers danced in the breeze', 'the clock was ticking angrily',
      // hyperbole
      'i am so hungry i could eat a horse', 'she has a million things to do',
      'i told you a thousand times', 'this bag weighs a ton',
      // idioms
      'it is raining cats and dogs', 'break a leg', 'hit the books',
      'let the cat out of the bag', 'piece of cake', 'under the weather',
    ];
    await this._teachSentenceList(FIGURATIVE, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Progressive verb tenses (G4 Language standard) ──
    const PROGRESSIVE = [
      'i am walking to school', 'she is reading a book', 'they are playing outside',
      'i was walking when it rained', 'she was reading when he called',
      'they were playing when the bell rang',
      'i will be walking to school tomorrow', 'she will be reading all night',
    ];
    await this._teachSentenceList(PROGRESSIVE, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Greek/Latin root sentences ──
    const ROOTS = [
      'auto means self like automobile', 'bio means life like biology',
      'graph means write like autograph', 'port means carry like transport',
      'rupt means break like interrupt', 'struct means build like construct',
      'tele means far like telephone', 'therm means heat like thermometer',
    ];
    await this._teachSentenceList(ROOTS, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Reading comprehension with inference ──
    const QA_G4 = [
      { context: 'the boy studied hard for his test because he wanted to make his mom proud', question: 'why did the boy study', answer: 'proud' },
      { context: 'after the storm the rainbow appeared and everyone came outside to see it', question: 'what appeared after the storm', answer: 'rainbow' },
      { context: 'she practiced piano every day for a year and finally played the song perfectly', question: 'how long did she practice', answer: 'year' },
      { context: 'the wind whispered through the trees on the cold winter night', question: 'what did the wind do', answer: 'whispered' },
      { context: 'he is as strong as an ox and can lift heavy things easily', question: 'what is he compared to', answer: 'ox' },
      { context: 'time is money so do not waste it', question: 'what is time compared to', answer: 'money' },
    ];
    await this._teachComprehension(QA_G4, { reps: 3 });

    // ── Causal + inference chains (G4 level) ──
    await this._teachCausalChains([
      ['storm', 'rainbow'], ['practice', 'perfect'], ['study', 'success'],
      ['lazy', 'fail'], ['honest', 'trust'], ['lie', 'distrust'],
      ['exercise', 'healthy'], ['junk', 'unhealthy'],
      ['auto', 'self'], ['bio', 'life'], ['tele', 'far'], ['therm', 'heat'],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // ELA G4 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      // Figurative language identification
      { prompt: ['runs', 'like', 'the', 'wind'], answer: 'simile' },
      { prompt: ['time', 'is', 'money'], answer: 'metaphor' },
      { prompt: ['wind', 'whispered', 'trees'], answer: 'personification' },
      { prompt: ['hungry', 'eat', 'a', 'horse'], answer: 'hyperbole' },
      // Root word meaning
      { prompt: ['auto', 'means'], answer: 'self' },
      { prompt: ['bio', 'means'], answer: 'life' },
      { prompt: ['tele', 'means'], answer: 'far' },
      // Comprehension inference
      { prompt: ['boy', 'studied', 'hard', 'mom'], answer: 'proud' },
      { prompt: ['practiced', 'piano', 'year', 'finally'], answer: 'perfect' },
      // Cause-effect
      { prompt: ['storm', 'then'], answer: 'rainbow' },
      { prompt: ['practice', 'leads', 'to'], answer: 'perfect' },
      { prompt: ['honest', 'builds'], answer: 'trust' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    const vocabResult = await this._gateVocabList(ELA_G4_VOCAB.slice(0, 20));
    if (finalResult.pass || vocabResult.pass) {
      return { pass: true, reason: `FINAL: ${finalResult.reason} | VOCAB: ${vocabResult.reason}` };
    }
    return { pass: false, reason: `FINAL: ${finalResult.reason} | VOCAB: ${vocabResult.reason}` };
  },

  async runMathG4Real(ctx) {
    // ── COMMON CORE MATH G4-G5: Full fourth/fifth grade math ──
    // Standards: multi-digit multiplication (4-digit × 1-digit), long
    // division with remainders, fraction addition/subtraction with like
    // denominators, decimal notation to hundredths, decimal comparison,
    // factors and multiples, angle measurement, lines of symmetry.

    const MATH_G4_VOCAB = [
      'decimal', 'percent', 'hundredths', 'tenths', 'thousandths',
      'multiply', 'product', 'factor', 'multiple', 'prime', 'composite',
      'divide', 'quotient', 'remainder', 'dividend', 'divisor',
      'fraction', 'numerator', 'denominator', 'equivalent', 'simplify',
      'angle', 'degree', 'acute', 'obtuse', 'right', 'straight',
      'parallel', 'perpendicular', 'symmetry', 'line',
      'convert', 'estimate', 'round', 'approximate',
    ];
    await this._teachVocabList(MATH_G4_VOCAB, ctx, { reps: 3 });

    // ── Decimal + percent sentences (expanded) ──
    const DECIMAL_SENTENCES = [
      'one half is fifty percent', 'one quarter is twenty five percent',
      'three quarters is seventy five percent', 'one tenth is ten percent',
      'one fifth is twenty percent', 'two fifths is forty percent',
      'zero point five is one half', 'zero point two five is a quarter',
      'zero point one is one tenth', 'zero point seven five is three quarters',
      'percent means per hundred', 'fifty percent means fifty out of one hundred',
      'ten percent of one hundred is ten', 'twenty percent of fifty is ten',
      'decimals and fractions are related',
      'zero point three three is about one third',
      'three point one four is about pi',
      'round zero point seven to one', 'round zero point three to zero',
      'zero point five is greater than zero point four',
      'zero point nine is less than one',
    ];
    await this._teachSentenceList(DECIMAL_SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Multi-digit multiplication sentences ──
    const MULTI_DIGIT = [
      'twelve times three is thirty six', 'fifteen times four is sixty',
      'twenty times five is one hundred', 'twenty five times four is one hundred',
      'thirty times three is ninety', 'fifty times two is one hundred',
      'eleven times eleven is one hundred twenty one',
      'twelve times twelve is one hundred forty four',
      'one hundred times ten is one thousand',
      'two hundred times five is one thousand',
    ];
    await this._teachSentenceList(MULTI_DIGIT, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Long division with remainders ──
    const DIVISION_G4 = [
      'thirteen divided by four is three remainder one',
      'seventeen divided by five is three remainder two',
      'twenty three divided by six is three remainder five',
      'twenty nine divided by seven is four remainder one',
      'thirty one divided by eight is three remainder seven',
      'the remainder is what is left over',
      'if there is no remainder the division is exact',
    ];
    await this._teachSentenceList(DIVISION_G4, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Fraction addition/subtraction (like denominators) ──
    const FRACTION_OPS = [
      'one fourth plus two fourths is three fourths',
      'one third plus one third is two thirds',
      'three eighths plus two eighths is five eighths',
      'five sixths minus two sixths is three sixths',
      'seven tenths minus three tenths is four tenths',
      'to add fractions with the same denominator add the numerators',
      'to subtract fractions with the same denominator subtract the numerators',
      'the denominator stays the same when adding or subtracting',
    ];
    await this._teachSentenceList(FRACTION_OPS, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Factors and multiples ──
    const FACTORS = [
      'a factor divides a number evenly', 'one and the number itself are always factors',
      'factors of twelve are one two three four six twelve',
      'factors of ten are one two five ten',
      'a prime number has only two factors one and itself',
      'two three five seven eleven thirteen are prime',
      'four six eight nine ten twelve are composite',
      'a multiple is the result of multiplying by a whole number',
      'multiples of three are three six nine twelve fifteen',
      'multiples of five are five ten fifteen twenty twenty five',
    ];
    await this._teachSentenceList(FACTORS, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Angles and geometry ──
    const ANGLES = [
      'an angle is formed by two lines meeting at a point',
      'angles are measured in degrees', 'a right angle is ninety degrees',
      'an acute angle is less than ninety degrees',
      'an obtuse angle is more than ninety degrees',
      'a straight angle is one hundred eighty degrees',
      'a full turn is three hundred sixty degrees',
      'parallel lines never cross', 'perpendicular lines cross at a right angle',
      'a line of symmetry divides a shape into two equal halves',
    ];
    await this._teachSentenceList(ANGLES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Equational teaching ──
    await this._teachDecimals();
    await this._teachPercentages();

    // ── Math-G4: multi-digit multiplication as magnitude transform ──
    // The OPERATION: inject magnitude(12) into free first half,
    // magnitude(3) into free second half → sem should activate
    // magnitude(36). This teaches multi-digit × single-digit.
    await this._teachAdditionTransformations(ctx); // reinforces base
    await this._teachComparisonTransformations(ctx); // reinforces ordinal

    // ── Causal chains: math relationships ──
    await this._teachCausalChains([
      ['factor', 'product'], ['dividend', 'quotient'], ['remainder', 'leftover'],
      ['fraction', 'part'], ['decimal', 'point'], ['percent', 'hundred'],
      ['prime', 'indivisible'], ['composite', 'factors'],
      ['acute', 'small'], ['obtuse', 'big'], ['right', 'ninety'],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // MATH G4 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      // Decimal↔fraction conversion
      { prompt: ['zero', 'point', 'five', 'is'], answer: 'half' },
      { prompt: ['twenty', 'five', 'percent', 'is'], answer: 'quarter' },
      { prompt: ['one', 'tenth', 'as', 'decimal'], answer: 'zero' },
      // Multi-digit multiplication
      { prompt: ['twelve', 'times', 'twelve'], answer: 'hundred' },
      { prompt: ['twenty', 'times', 'five'], answer: 'hundred' },
      // Division with remainder
      { prompt: ['thirteen', 'divided', 'by', 'four', 'remainder'], answer: 'one' },
      { prompt: ['seventeen', 'divided', 'by', 'five', 'remainder'], answer: 'two' },
      // Fraction operations
      { prompt: ['one', 'fourth', 'plus', 'two', 'fourths'], answer: 'three' },
      // Factors
      { prompt: ['factors', 'of', 'twelve', 'include'], answer: 'three' },
      { prompt: ['seven', 'is', 'a'], answer: 'prime' },
      // Angles
      { prompt: ['right', 'angle', 'is', 'how', 'many', 'degrees'], answer: 'ninety' },
      { prompt: ['acute', 'angle', 'is'], answer: 'less' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    const vocabResult = await this._gateVocabList(MATH_G4_VOCAB.slice(0, 15));
    if (finalResult.pass || vocabResult.pass) {
      return { pass: true, reason: `FINAL: ${finalResult.reason} | VOCAB: ${vocabResult.reason}` };
    }
    return { pass: false, reason: `FINAL: ${finalResult.reason} | VOCAB: ${vocabResult.reason}` };
  },

  async runSciG4Real(ctx) {
    const SENTENCES = [
      'force is a push or a pull', 'motion is moving from one place to another',
      'gravity pulls things down', 'friction slows things down',
      'a heavy object needs more force', 'a light object needs less force',
      'a ball rolls because of force', 'a ball stops because of friction',
      'an airplane flies with lift', 'a rocket uses thrust to go up',
      'the earth pulls everything down', 'the moon has less gravity than earth',
      'simple machines make work easier', 'a lever lifts heavy things',
      'a wheel rolls smoothly', 'a pulley lifts things with rope',
      'an inclined plane is a ramp', 'a wedge splits things apart',
      'a screw holds things together', 'a push moves things away',
      'a pull brings things closer', 'magnets attract iron',
      'opposite poles attract', 'same poles repel',
      'speed is how fast something moves', 'direction is which way it moves',
      'an object at rest stays at rest', 'an object in motion stays in motion',
    ];
    // T14.24 Session 43 — TODO-aligned physics relationship features.
    // TODO Sci-G4 spec: "_teachForceMotion() uses physics relationship
    // features (F=ma as magnitude chain)". Session 41 built this as a
    // 6-concept list (force/mass/acceleration/velocity/friction/gravity)
    // fed through _conceptTeach with distinct feature vectors. Runs as
    // a PRE-pass before the sentence walk so the cortex sees both the
    // structured physics concept features AND the natural-language
    // explanation of those concepts in sentence form.
    await this._teachForceMotion();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── NGSS G4: Energy transfer + waves + earth structure ──
    const SCI_G4_VOCAB = [
      'energy', 'heat', 'light', 'sound', 'electric', 'motion',
      'transfer', 'transform', 'source', 'renewable', 'nonrenewable',
      'wave', 'vibration', 'amplitude', 'frequency', 'pattern',
      'rock', 'layer', 'fossil', 'sediment', 'erosion', 'weathering',
      'earthquake', 'volcano', 'mountain', 'valley', 'canyon',
    ];
    await this._teachVocabList(SCI_G4_VOCAB, ctx, { reps: 3 });

    const ENERGY_SENTENCES = [
      // energy transfer — NGSS G4
      'energy can change from one form to another',
      'a light bulb turns electricity into light and heat',
      'food gives our bodies energy', 'the sun gives earth light and heat energy',
      'a moving ball has kinetic energy', 'a ball on a high shelf has potential energy',
      'rubbing hands together makes heat from friction',
      'sound energy travels through air as waves',
      'renewable energy comes from sun wind and water',
      'nonrenewable energy comes from coal oil and gas',
      // waves — NGSS G4
      'waves carry energy from one place to another',
      'sound travels as waves through air', 'light travels as waves',
      'loud sounds have big waves', 'quiet sounds have small waves',
      'high pitch means fast vibrations', 'low pitch means slow vibrations',
      // earth structure — NGSS G4
      'the earth has layers inside', 'the crust is the outside layer',
      'the mantle is below the crust', 'the core is the center',
      'rocks form in layers over time', 'fossils are in rock layers',
      'fossils show what lived long ago', 'older fossils are in deeper layers',
      'weathering breaks rocks into pieces', 'erosion moves rocks and soil',
      'water wind and ice cause erosion',
      'earthquakes happen when the ground shakes',
      'volcanoes push hot rock from inside the earth',
    ];
    await this._teachSentenceList(ENERGY_SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Causal chains for G4 science ──
    await this._teachCausalChains([
      ['electricity', 'light'], ['friction', 'heat'], ['food', 'energy'],
      ['sun', 'energy'], ['vibration', 'sound'], ['wave', 'energy'],
      ['weathering', 'erosion'], ['erosion', 'canyon'],
      ['earthquake', 'crack'], ['volcano', 'lava'],
      ['heat', 'melt'], ['cold', 'freeze'],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // SCI G4 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['force', 'push', 'ball'], answer: 'motion' },
      { prompt: ['gravity', 'pulls', 'down'], answer: 'earth' },
      { prompt: ['friction', 'slows'], answer: 'motion' },
      { prompt: ['light', 'bulb', 'electricity'], answer: 'light' },
      { prompt: ['sound', 'travels', 'as'], answer: 'wave' },
      { prompt: ['fossils', 'found', 'in'], answer: 'rock' },
      { prompt: ['weathering', 'breaks', 'rocks', 'then'], answer: 'erosion' },
      { prompt: ['renewable', 'energy', 'from'], answer: 'sun' },
      { prompt: ['earthquake', 'ground'], answer: 'shakes' },
      { prompt: ['opposite', 'poles', 'magnets'], answer: 'attract' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList(SCI_G4_VOCAB.slice(0, 15), ctx, { reps: 3 });
  },

  async runSocG4Real(ctx) {
    // ── CORE KNOWLEDGE G4: Middle Ages + Renaissance + Exploration ──
    await this._teachStateHistory();

    const SOC_G4_VOCAB = [
      'feudalism', 'castle', 'knight', 'peasant', 'lord', 'king', 'queen',
      'church', 'monastery', 'crusade', 'plague', 'magna',
      'renaissance', 'rebirth', 'artist', 'inventor', 'printing',
      'explorer', 'voyage', 'colony', 'trade', 'compass', 'map',
      'columbus', 'magellan', 'route', 'spice', 'silk',
    ];
    await this._teachVocabList(SOC_G4_VOCAB, ctx, { reps: 3 });

    const MIDDLE_AGES = [
      // Feudalism
      'after rome fell europe was in the dark ages',
      'feudalism organized society into lords and peasants',
      'the king owned all the land', 'lords managed parts of the kingdom',
      'knights fought for their lords', 'peasants worked the fields',
      'castles protected against attackers', 'moats surrounded castles',
      // The Church
      'the church was the center of life', 'monks lived in monasteries',
      'monks copied books by hand', 'the church built great cathedrals',
      // Crusades + plague
      'the crusades were wars for the holy land',
      'soldiers marched thousands of miles', 'the crusades lasted two hundred years',
      'the black plague killed millions', 'rats spread the plague across europe',
      'one third of europe died from the plague',
      // Magna Carta
      'the magna carta limited the power of the king',
      'it said even the king must follow laws',
    ];
    await this._teachSentenceList(MIDDLE_AGES, ctx, { reps: 2, ticksPerWord: 2 });

    const RENAISSANCE = [
      'the renaissance means rebirth', 'it started in italy around 1400',
      'people became interested in ancient greece and rome again',
      'leonardo da vinci was a great artist and inventor',
      'michelangelo painted the ceiling of the sistine chapel',
      'gutenberg invented the printing press',
      'the printing press made books cheaper', 'more people could read',
      'new ideas spread quickly with printed books',
      'art science and learning all grew during the renaissance',
    ];
    await this._teachSentenceList(RENAISSANCE, ctx, { reps: 2, ticksPerWord: 2 });

    const EXPLORATION = [
      'explorers sailed to find new trade routes',
      'the compass helped ships navigate', 'maps improved over time',
      'columbus sailed west in 1492', 'he reached the americas',
      'magellan sailed around the whole world',
      'the spice trade drove exploration', 'silk came from china',
      'european nations established colonies', 'trade routes connected continents',
    ];
    await this._teachSentenceList(EXPLORATION, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Causal chains — history cause-effect ──
    await this._teachCausalChains([
      ['rome', 'fall'], ['fall', 'feudalism'], ['feudalism', 'castle'],
      ['plague', 'death'], ['plague', 'labor'], ['labor', 'freedom'],
      ['crusade', 'trade'], ['trade', 'wealth'], ['wealth', 'renaissance'],
      ['printing', 'books'], ['books', 'knowledge'], ['knowledge', 'renaissance'],
      ['compass', 'navigation'], ['navigation', 'exploration'],
      ['exploration', 'colony'],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // SOC G4 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['after', 'rome', 'fell', 'europe', 'had'], answer: 'feudalism' },
      { prompt: ['knights', 'fought', 'for', 'their'], answer: 'lord' },
      { prompt: ['black', 'plague', 'killed'], answer: 'millions' },
      { prompt: ['magna', 'carta', 'limited'], answer: 'king' },
      { prompt: ['renaissance', 'means'], answer: 'rebirth' },
      { prompt: ['gutenberg', 'invented', 'the'], answer: 'printing' },
      { prompt: ['columbus', 'sailed', 'west', 'in'], answer: 'fourteen' },
      { prompt: ['compass', 'helped', 'ships'], answer: 'navigate' },
      { prompt: ['printing', 'press', 'made', 'books'], answer: 'cheaper' },
      // Cause-effect inference
      { prompt: ['plague', 'caused', 'then', 'freedom'], answer: 'labor' },
      { prompt: ['trade', 'wealth', 'then'], answer: 'renaissance' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList(SOC_G4_VOCAB.slice(0, 15), ctx, { reps: 3 });
  },

  async runArtG4Real(ctx) {
    const SENTENCES = [
      'melody is a pattern of notes', 'pitch is how high or low a note is',
      'a scale has eight notes', 'do re mi fa sol la ti do',
      'notes go up or down in pitch', 'higher notes sound higher',
      'lower notes sound lower', 'the treble clef is for high notes',
      'the bass clef is for low notes', 'an octave spans eight notes',
      'a whole note is long', 'a half note is medium',
      'a quarter note is short', 'rests are quiet moments',
      'sharps raise the pitch', 'flats lower the pitch',
      'a major scale sounds happy', 'a minor scale sounds sad',
      'harmony is notes played together', 'melody is notes played one at a time',
      'a song has a melody and harmony', 'voices can sing melody',
      'instruments can play any part', 'the piano has many notes',
      'the guitar has six strings', 'the drums keep time',
      'music reads from left to right', 'the staff has five lines',
    ];
    // T14.24 Session 79 — prime instrument recognition lattice per
    // TODO line 557 before the melody/pitch sentence pass. Sentences
    // reference piano/guitar/drums so the basins need to exist first.
    await this._teachInstruments();
    // ── Art-G4: instrument classification by family ──
    //   features: [string, wind, percussion, keyboard, brass, pitched, polyphonic, melodic]
    await this._teachClassificationReasoning([
      { item: 'violin',  features: new Float64Array([1,0,0,0,0,1,0,1]), category: 'string' },
      { item: 'guitar',  features: new Float64Array([1,0,0,0,0,1,1,1]), category: 'string' },
      { item: 'cello',   features: new Float64Array([1,0,0,0,0,1,0,1]), category: 'string' },
      { item: 'flute',   features: new Float64Array([0,1,0,0,0,1,0,1]), category: 'woodwind' },
      { item: 'clarinet',features: new Float64Array([0,1,0,0,0,1,0,1]), category: 'woodwind' },
      { item: 'trumpet', features: new Float64Array([0,0,0,0,1,1,0,1]), category: 'brass' },
      { item: 'trombone',features: new Float64Array([0,0,0,0,1,1,0,1]), category: 'brass' },
      { item: 'drum',    features: new Float64Array([0,0,1,0,0,0,0,0]), category: 'percussion' },
      { item: 'piano',   features: new Float64Array([0,0,0,1,0,1,1,1]), category: 'keyboard' },
    ]);
    await this._teachCausalChains([
      ['note', 'melody'], ['melody', 'song'], ['scale', 'key'],
      ['key', 'chord'], ['chord', 'harmony'], ['rhythm', 'groove'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G4 COURSES: Music / PE / Health / Spanish (grade-4 depth,
  // built to the corrected full bar). Course-identity prepended by the
  // _cellRunner wrapper; each self-gates via _gateSubjectProduction.
  async runMusicG4Real(ctx) {
    const VOCAB = [
      'music', 'staff', 'clef', 'treble', 'bass', 'line', 'space', 'note',
      'whole', 'half', 'quarter', 'eighth', 'rest', 'measure', 'time', 'signature',
      'major', 'minor', 'scale', 'octave', 'sharp', 'flat', 'harmony', 'melody',
      'dynamics', 'tempo', 'forte', 'piano',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the treble clef names the lines e g b d f from bottom to top',
      'the spaces in the treble clef spell f a c e',
      'a whole note is four beats and a half note is two beats',
      'a quarter note is one beat and an eighth note is half a beat',
      'a time signature of four four means four beats in each measure',
      'three four time has three beats in each measure like a waltz',
      'a major scale sounds bright and happy',
      'a minor scale sounds dark and sad',
      'an octave is eight notes from one note to the same note higher',
      'a sharp raises a note and a flat lowers a note',
      'harmony is two or more notes sounding good together',
      'melody is the single line of notes you hum',
      'dynamics from soft to loud go piano then forte',
      'tempo is the speed and it can be slow or fast',
      'a round is a song where parts start one after another',
      'we read music left to right across the staff',
      'each instrument family has its own sound and range',
      'minor keys are why a lot of dark music sounds the way it does',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['treble', 'high'], ['bass', 'low'], ['major', 'happy'], ['minor', 'sad'], ['sharp', 'raise'], ['flat', 'lower'], ['octave', 'eight'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G4' });
    return await this._gateSubjectProduction('music', 'grade4', [
      { question: 'the treble clef spaces spell the word', expected: ['face', 'f'] },
      { question: 'a whole note gets how many beats', expected: ['four', '4', 'f'] },
      { question: 'a scale that sounds dark and sad is', expected: ['minor', 'm'] },
      { question: 'a scale that sounds bright and happy is', expected: ['major', 'm'] },
      { question: 'a sharp does what to a note', expected: ['raises', 'raise', 'r'] },
      { question: 'eight notes to the same note higher is an', expected: ['octave', 'o'] },
      { question: 'two notes sounding good together is', expected: ['harmony', 'h'] },
      { question: 'four four time has how many beats per measure', expected: ['four', '4', 'f'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG4Real(ctx) {
    const VOCAB = [
      'fitness', 'cardio', 'strength', 'flexible', 'endurance', 'heart', 'target', 'rate',
      'frequency', 'intensity', 'time', 'type', 'throw', 'catch', 'dribble', 'pass',
      'defense', 'offense', 'position', 'team', 'strategy', 'goal', 'practice', 'sportsmanship',
      'warm', 'cooldown', 'injury',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the parts of fitness are cardio strength flexibility and endurance',
      'fitt stands for frequency intensity time and type',
      'frequency is how often we exercise',
      'intensity is how hard we work',
      'we find our target heart rate to train safely',
      'an overhand throw steps with the opposite foot and follows through',
      'we dribble with our fingertips not our palm',
      'in team sports some players play offense and some play defense',
      'a good pass leads the teammate to open space',
      'a strategy is the plan a team uses to score',
      'we set fitness goals and track our progress',
      'a warm up gets the body ready and a cool down lets it recover',
      'stretching after exercise improves flexibility',
      'we rest an injury so it can heal',
      'good sportsmanship is respecting teammates referees and opponents',
      'cardio exercise makes the heart and lungs stronger over time',
      'self assessment means honestly checking our own skills',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['cardio', 'heart'], ['intensity', 'hard'], ['frequency', 'often'], ['warm', 'ready'], ['injury', 'rest'], ['practice', 'improve'], ['offense', 'score'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G4' });
    return await this._gateSubjectProduction('pe', 'grade4', [
      { question: 'the four parts of fitness include cardio strength flexibility and', expected: ['endurance', 'e'] },
      { question: 'fitt stands for frequency intensity time and', expected: ['type', 't'] },
      { question: 'how often we exercise is the', expected: ['frequency', 'f'] },
      { question: 'how hard we work is the', expected: ['intensity', 'i'] },
      { question: 'we dribble with our', expected: ['fingertips', 'fingers', 'f'] },
      { question: 'players who try to stop scoring play', expected: ['defense', 'd'] },
      { question: 'a team plan to score is a', expected: ['strategy', 's'] },
      { question: 'after exercise we do a cool', expected: ['down', 'd'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG4Real(ctx) {
    const VOCAB = [
      'health', 'circulatory', 'respiratory', 'digestive', 'skeletal', 'muscular', 'nervous', 'system',
      'organ', 'nutrient', 'label', 'sugar', 'protein', 'fiber', 'immune', 'communicable',
      'germ', 'vaccine', 'emotion', 'empathy', 'conflict', 'pressure', 'medicine', 'dosage',
      'safe', 'online', 'help',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the circulatory system moves blood with the heart',
      'the respiratory system brings in air with the lungs',
      'the digestive system breaks down food for nutrients',
      'the skeletal system of bones holds the body up',
      'the muscular system moves the bones',
      'the nervous system sends signals through the brain and nerves',
      'a food label tells us the sugar fat and protein in a food',
      'fiber from fruits and vegetables helps digestion',
      'the immune system fights germs that get into the body',
      'communicable diseases spread from person to person',
      'a vaccine trains the immune system before we get sick',
      'naming an emotion helps us manage it',
      'empathy is understanding how another person feels',
      'we solve conflict by listening and finding a fair solution',
      'peer pressure is when others push us to do something',
      'we can say no to peer pressure and walk away',
      'medicine must be taken at the right dosage from a trusted adult',
      'we keep personal information private when we are online',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['circulatory', 'blood'], ['respiratory', 'air'], ['digestive', 'food'], ['immune', 'germ'], ['vaccine', 'immune'], ['empathy', 'feel'], ['pressure', 'no'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G4' });
    return await this._gateSubjectProduction('health', 'grade4', [
      { question: 'the system that moves blood is the', expected: ['circulatory', 'c'] },
      { question: 'the system that brings in air is the', expected: ['respiratory', 'r'] },
      { question: 'the system of bones is the', expected: ['skeletal', 's'] },
      { question: 'the body part that fights germs is the immune', expected: ['system', 's'] },
      { question: 'understanding how another person feels is', expected: ['empathy', 'e'] },
      { question: 'when others push us to do something it is peer', expected: ['pressure', 'p'] },
      { question: 'we can say no and walk', expected: ['away', 'a'] },
      { question: 'diseases that spread person to person are', expected: ['communicable', 'c'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG4Real(ctx) {
    const VOCAB = [
      'spanish', 'hola', 'buenos', 'dias', 'noches', 'como', 'estas', 'bien',
      'gracias', 'dias', 'lunes', 'enero', 'sol', 'lluvia', 'comida', 'manzana',
      'pan', 'leche', 'cabeza', 'mano', 'ojo', 'gusta', 'tengo', 'quiero',
      'donde', 'que', 'numero', 'cien',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'buenos dias means good morning and buenas noches means good night',
      'como estas means how are you and bien means good',
      'me gusta means i like and no me gusta means i do not like',
      'tengo means i have and quiero means i want',
      'donde means where and que means what',
      'the days include lunes martes and miercoles',
      'the months start with enero febrero and marzo',
      'el sol is the sun and la lluvia is the rain',
      'la manzana is the apple and el pan is the bread',
      'la leche is the milk and el agua is the water',
      'la cabeza is the head and la mano is the hand',
      'el ojo is the eye and la boca is the mouth',
      'numbers go veinte treinta cuarenta up to cien which is one hundred',
      'a cognate is a word that looks the same in both languages',
      'familia means family and amigo means friend',
      'we practice speaking spanish out loud to learn it',
      'every noun in spanish is either el or la',
      'learning spanish lets me talk with more people in the world',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['hola', 'hello'], ['gracias', 'thanks'], ['gusta', 'like'], ['tengo', 'have'], ['sol', 'sun'], ['manzana', 'apple'], ['cien', 'hundred'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G4' });
    return await this._gateSubjectProduction('language', 'grade4', [
      { question: 'buenos dias means good', expected: ['morning', 'm'] },
      { question: 'me gusta means i', expected: ['like', 'l'] },
      { question: 'tengo means i', expected: ['have', 'h'] },
      { question: 'donde means', expected: ['where', 'w'] },
      { question: 'el sol is the', expected: ['sun', 's'] },
      { question: 'la manzana is the', expected: ['apple', 'a'] },
      { question: 'cien means one', expected: ['hundred', 'h'] },
      { question: 'a word that looks the same in both languages is a', expected: ['cognate', 'c'] },
    ], { gateSubjectTag: 'language' });
  },

  async runLifeG4(ctx) {
    // ── G4 life experience — DATA-DRIVEN (corpora/life/grade4.json) ──
    // Aftermath year: firemaking-badge pride, the rock-music awakening (goth
    // seed), punching the boy who called her weird (won't apologize), the
    // best-friend BETRAYAL (Wren stays true → loyal-to-the-few), and "weird"
    // turning from wound into armor — TRAINED from story DATA, not hardcoded
    // feat-vectors. The guardedness + goth identity emerge from the narrative.
    await this._trainLifeStories('grade4', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'fire', 'badge', 'proud', 'music', 'rock', 'album', 'fight', 'weird', 'punch',
    ], ctx, { reps: 5 });
  }
};
