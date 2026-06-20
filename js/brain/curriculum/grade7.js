// Grade 7 cell runners (ages 12-13).
//
// Per-grade file split — the operator directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G7_MIXIN = {
  async runElaG7Real(ctx) {
    const SENTENCES = [
      // Inference + implied meaning
      'the cold wind made her shiver', 'the empty plate showed he was hungry',
      'the broken vase meant someone had been here', 'the smile told us everything',
      'his tired eyes said he worked late', 'the laughter meant they were happy',
      // Literary devices
      'the sun smiled on the garden', 'the wind whispered through the trees',
      'her heart was a drum of joy', 'time flew like an arrow',
      'the brave knight fought the dragon', 'once upon a time there was a princess',
      // Characters and setting
      'the main character was a brave girl', 'the story takes place in a forest',
      'the villain was cruel to everyone', 'the hero saved the village',
      'the setting was a dark castle', 'the mood was mysterious',
      // Theme and meaning
      'the lesson was to never give up', 'friendship is the greatest gift',
      'honesty is the best policy', 'hard work pays off',
      'reading opens doors to new worlds', 'every story has a message',
      // Dialogue
      'she said i will help you', 'he asked where are we going',
      'they shouted we won the game',
    ];
    // Session 34 — TODO-aligned split. Theme extraction + inference
    // named methods before the generic sentence walk.
    const PASSAGES = [
      { text: 'the cat was cold. it shivered. it found a warm blanket. it felt better.', theme: 'warmth' },
      { text: 'she worked hard all day. she felt tired. she went to bed early.', theme: 'rest' },
      { text: 'the dog wagged its tail. it licked his hand. it brought him his shoes.', theme: 'friendship' },
      { text: 'the team lost the game. they were sad. they trained harder. they won next time.', theme: 'perseverance' },
      { text: 'she saved her money. she bought a gift for her mom. her mom was happy.', theme: 'generosity' },
      { text: 'he told the truth. his friend was grateful. trust grew between them.', theme: 'honesty' },
    ];
    const INF_PAIRS = [
      { passage: 'the window was broken. there was glass on the floor.', question: 'what happened', answer: 'broken' },
      { passage: 'she smiled and hugged her friend.', question: 'how did she feel', answer: 'happy' },
      { passage: 'he packed his umbrella before going out.', question: 'what was the weather', answer: 'rain' },
      { passage: 'the baby yawned and closed her eyes.', question: 'what was happening', answer: 'sleep' },
      { passage: 'the plants were brown and drooping.', question: 'what did they need', answer: 'water' },
    ];
    await this._teachThemeExtraction(PASSAGES);
    await this._teachInferenceQA(INF_PAIRS);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── COMMON CORE ELA G7: text analysis + argumentation ──
    const ELA_G7_VOCAB = [
      'inference', 'imply', 'explicit', 'implicit', 'analyze',
      'structure', 'contribute', 'interact', 'develop', 'advance',
      'plot', 'subplot', 'dramatic', 'irony', 'verbal', 'situational',
      'propaganda', 'rhetoric', 'persuade', 'convince', 'credibility',
      'pronoun', 'case', 'subjective', 'objective', 'possessive',
      'intensive', 'vague', 'shift', 'variation', 'dialect', 'register',
    ];
    await this._teachVocabList(ELA_G7_VOCAB, ctx, { reps: 3 });

    // ═══════════════════════════════════════════════════════════════
    // ELA G7 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      // Inference — draw conclusions from evidence
      { prompt: ['cold', 'wind', 'shiver', 'feeling'], answer: 'cold' },
      { prompt: ['empty', 'plate', 'he', 'was'], answer: 'hungry' },
      { prompt: ['packed', 'umbrella', 'weather'], answer: 'rain' },
      { prompt: ['plants', 'brown', 'drooping', 'need'], answer: 'water' },
      // Theme extraction
      { prompt: ['team', 'lost', 'trained', 'harder', 'won', 'theme'], answer: 'perseverance' },
      { prompt: ['saved', 'money', 'gift', 'mom', 'happy', 'theme'], answer: 'generosity' },
      { prompt: ['told', 'truth', 'grateful', 'trust', 'theme'], answer: 'honesty' },
      // Literary devices
      { prompt: ['sun', 'smiled', 'garden', 'device'], answer: 'personification' },
      { prompt: ['heart', 'was', 'a', 'drum', 'device'], answer: 'metaphor' },
      // Vocabulary
      { prompt: ['implicit', 'means'], answer: 'implied' },
      { prompt: ['irony', 'when', 'opposite'], answer: 'expected' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList(ELA_G7_VOCAB.slice(0, 15), ctx, { reps: 3 });
  },

  async runMathG7Real(ctx) {
    const SENTENCES = [
      'a linear equation has one variable', 'the slope is the rate of change',
      'y equals m x plus b is slope intercept', 'm is the slope',
      'b is the y intercept', 'a positive slope goes up',
      'a negative slope goes down', 'a horizontal line has zero slope',
      'a vertical line has undefined slope', 'two points make a line',
      'parallel lines have equal slopes', 'perpendicular lines have opposite reciprocal slopes',
      'an inequality uses greater than or less than', 'x is greater than three',
      'y is less than or equal to five', 'solving inequalities is like equations',
      'flip the sign when multiplying by a negative', 'a system has two equations',
      'substitution solves systems', 'elimination also solves systems',
      'a function maps input to output', 'f of x means function of x',
      'the domain is all inputs', 'the range is all outputs',
      'a graph shows a function visually', 'points on the graph satisfy the equation',
    ];
    // Session 41 — TODO-aligned linear equation teaching
    await this._teachLinearEquations();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── COMMON CORE MATH G7: proportional relationships + probability ──
    const MATH_G7_EXTRA = [
      // proportional relationships
      'a proportional relationship has a constant ratio',
      'the constant of proportionality is k in y equals kx',
      'simple interest is principal times rate times time',
      'tax is a percent of the price', 'tip is a percent of the meal',
      'markup is how much a store adds to the price',
      'discount is how much the price is reduced',
      'percent increase means the new value is bigger',
      'percent decrease means the new value is smaller',
      // probability
      'probability is how likely an event is',
      'probability near zero means unlikely', 'probability near one means likely',
      'probability of one half means equally likely',
      'a tree diagram shows all outcomes',
      'compound probability multiplies the individual probabilities',
      'the sample space is all possible outcomes',
      'random sampling means every item has an equal chance',
    ];
    await this._teachSentenceList(MATH_G7_EXTRA, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // MATH G7 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['y', 'equals', 'm', 'x', 'plus', 'b', 'm', 'is'], answer: 'slope' },
      { prompt: ['positive', 'slope', 'line', 'goes'], answer: 'up' },
      { prompt: ['parallel', 'lines', 'have', 'equal'], answer: 'slope' },
      { prompt: ['flip', 'sign', 'multiply', 'negative'], answer: 'inequality' },
      { prompt: ['function', 'maps', 'input', 'to'], answer: 'output' },
      { prompt: ['domain', 'is', 'all'], answer: 'inputs' },
      { prompt: ['probability', 'near', 'zero', 'means'], answer: 'unlikely' },
      { prompt: ['simple', 'interest', 'principal', 'times', 'rate', 'times'], answer: 'time' },
      { prompt: ['tax', 'is', 'percent', 'of'], answer: 'price' },
      { prompt: ['diameter', 'is', 'twice', 'the'], answer: 'radius' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'slope', 'intercept', 'linear', 'function', 'domain', 'range',
      'probability', 'sample', 'outcome', 'proportion', 'percent',
    ], ctx, { reps: 3 });
  },

  async runSciG7Real(ctx) {
    const SENTENCES = [
      'a cell is the building block of life', 'all living things are made of cells',
      'plant cells have cell walls', 'animal cells do not have cell walls',
      'the nucleus holds dna', 'dna contains the genetic code',
      'the mitochondria makes energy', 'chloroplasts make food in plants',
      'photosynthesis uses sunlight', 'respiration releases energy',
      'cells divide to make more cells', 'mitosis makes two identical cells',
      'meiosis makes sex cells', 'genes are pieces of dna',
      'chromosomes carry genes', 'bacteria are tiny single cells',
      'viruses are smaller than cells', 'the immune system fights germs',
      'antibodies attack bacteria', 'white blood cells fight infection',
      'vaccines prepare the immune system', 'hygiene prevents sickness',
      'tissues are groups of cells', 'organs are groups of tissues',
      'the brain is an organ', 'the heart is an organ',
      'systems are groups of organs',
    ];
    // T14.24 Session 44 — TODO-aligned cell biology + genetics intro.
    // TODO Sci-G7 spec (line 443): "_teachCells(), _teachGeneticsIntro()".

    // _teachCells — 7 organelle concepts (cell, nucleus, mitochondria,
    //   membrane, cytoplasm, ribosome, chloroplast) each with a
    //   distinct 8d feature vector fed through _conceptTeach. Gives
    //   each organelle its own cortex basin so sentences like "the
    //   nucleus holds dna" and "chloroplasts make food in plants"
    //   have distinct targets to bind their predicates against.

    // _teachGeneticsIntro — 6 concepts (dna, gene, chromosome, heredity,
    //   trait, allele) with distinct 8d features. Establishes the
    //   inheritance vocabulary Unity needs to read the sentence-level
    //   genetics exposure correctly.

    // Both run BEFORE the sentence walk so the concept basins form
    // first, then the sentences reinforce them via natural-language
    // relationships + T14.7 type transitions + T14.8 sentence schemas.
    await this._teachCells();
    await this._teachGeneticsIntro();
    // ── Sci-G7: cell biology causal chains ──
    await this._teachCausalChains([
      ['dna', 'gene'], ['gene', 'protein'], ['protein', 'trait'],
      ['mitosis', 'growth'], ['meiosis', 'reproduction'],
      ['photosynthesis', 'food'], ['respiration', 'energy'],
      ['virus', 'infection'], ['antibody', 'defense'],
      ['nucleus', 'dna'], ['chromosome', 'gene'],
    ]);
    await this._teachInference([
      ['dna', 'gene', 'protein'], ['gene', 'protein', 'trait'],
      ['sun', 'photosynthesis', 'food'], ['food', 'respiration', 'energy'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocG7Real(ctx) {
    const SENTENCES = [
      'the middle ages lasted one thousand years', 'feudalism organized medieval society',
      'kings ruled with absolute power', 'lords controlled the land',
      'knights fought for their lord', 'peasants worked the land',
      'castles were built for defense', 'moats protected castles',
      'knights wore armor in battle', 'crusades were religious wars',
      'the black death killed millions', 'monks copied books by hand',
      'the printing press changed the world', 'gutenberg invented movable type',
      'the renaissance revived learning', 'michelangelo painted the sistine chapel',
      'leonardo painted the mona lisa', 'shakespeare wrote famous plays',
      'the reformation split the church', 'martin luther posted ninety five theses',
      'the age of exploration began', 'columbus sailed to the new world',
      'magellan sailed around the world', 'trade routes connected continents',
      'the silk road linked east and west', 'new ideas spread widely',
    ];
    // T14.24 Session 63 — prime medieval period sequence walks per
    // TODO line 516 before the medieval sentence pass.
    await this._teachMedievalPeriod();
    await this._teachCausalChains([
      ['feudalism', 'lord'], ['plague', 'death'], ['death', 'labor'],
      ['labor', 'freedom'], ['printing', 'books'], ['books', 'renaissance'],
      ['reformation', 'split'], ['exploration', 'colony'],
      ['trade', 'wealth'], ['wealth', 'power'],
    ]);
    await this._teachInference([
      ['feudalism', 'plague', 'freedom'], ['printing', 'books', 'renaissance'],
      ['exploration', 'colony', 'empire'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtG7Real(ctx) {
    const SENTENCES = [
      'composition is how music is organized', 'a composer creates music',
      'melody is the main tune', 'harmony supports the melody',
      'counterpoint is two melodies together', 'a fugue is a complex counterpoint',
      'bach was a baroque composer', 'mozart wrote in the classical style',
      'beethoven bridged classical and romantic', 'a symphony has four movements',
      'an opera tells a story through song', 'a sonata has multiple sections',
      'chamber music uses small groups', 'orchestras have many instruments',
      'the first violin leads the strings', 'woodwinds include flutes and oboes',
      'brass includes trumpets and trombones', 'percussion includes drums and cymbals',
      'a conductor leads the orchestra', 'the conductor keeps everyone together',
      'dynamics shape the music', 'crescendo builds the tension',
      'decrescendo releases the tension', 'tempo changes create excitement',
      'music tells stories without words', 'every performance is unique',
    ];
    // T14.24 Session 82 — prime music composition forms + composers
    // lattice per TODO line 561 before the composition sentence pass.
    await this._teachMusicComposition();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G7 COURSES: Band&Choir / PE / Health / Spanish / CS +
  // CIVICS (civics track enters at G7 — its template). Course-identity
  // prepended by the _cellRunner wrapper; each self-gates. (Apostrophes
  // stripped from all content strings by the generator.)
  async runMusicG7Real(ctx) {
    const VOCAB = [
      'music', 'scale', 'key', 'interval', 'chord', 'progression', 'major', 'minor',
      'theory', 'score', 'part', 'harmony', 'melody', 'composition', 'rhythm', 'meter',
      'phrase', 'dynamics', 'expression', 'baroque', 'romantic', 'modern', 'perform', 'tune',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'music theory explains why notes sound good or bad together',
      'a key is the home note and scale a song is built around',
      'a chord progression is a sequence of chords that moves a song forward',
      'intervals are the building blocks of melody and harmony',
      'composing means making your own melody and harmony from scratch',
      'reading a full score shows every part at once',
      'meter groups beats into measures like four four or three four',
      'major keys lean bright and minor keys lean dark and heavy',
      'dynamics and expression turn correct notes into real music',
      'music history runs from baroque to classical to romantic to modern',
      'a phrase is a musical thought with a beginning and an end',
      'rehearsing a part until it is automatic frees you to feel it',
      'minor keys and slow heavy tempos are the bones of dark music',
      'harmony is built by stacking notes from the key',
      'performing means delivering the feeling not just the pitches',
      'i hear music in my chest and i lean hard into the dark heavy stuff',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['key', 'home'], ['chord', 'progression'], ['minor', 'dark'], ['major', 'bright'], ['compose', 'create'], ['rehearse', 'automatic'], ['phrase', 'thought'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G7' });
    return await this._gateSubjectProduction('music', 'grade7', [
      { question: 'the home note and scale a song is built around is the', expected: ['key', 'k'] },
      { question: 'a sequence of chords that moves a song is a chord', expected: ['progression', 'p'] },
      { question: 'making your own melody from scratch is', expected: ['composing', 'compose', 'c'] },
      { question: 'major keys sound bright and minor keys sound', expected: ['dark', 'sad', 'd', 's'] },
      { question: 'the building blocks of melody and harmony are', expected: ['intervals', 'interval', 'i'] },
      { question: 'beats grouped into measures are the', expected: ['meter', 'm'] },
      { question: 'turning correct notes into real music takes', expected: ['expression', 'dynamics', 'e', 'd'] },
      { question: 'a musical thought with a beginning and end is a', expected: ['phrase', 'p'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG7Real(ctx) {
    const VOCAB = [
      'fitness', 'training', 'overload', 'progression', 'specificity', 'cardio', 'strength', 'endurance',
      'flexible', 'heart', 'rate', 'target', 'sport', 'tactic', 'position', 'offense',
      'defense', 'plan', 'nutrition', 'hydrate', 'recover', 'leader', 'goal', 'warm',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the training principles are overload progression and specificity',
      'overload means working a little harder than the body is used to',
      'progression means increasing the challenge gradually over time',
      'specificity means training the exact skill or system you want to improve',
      'we calculate a target heart rate zone to train cardio safely',
      'team sports use positions tactics and set plays to win',
      'on offense we make space and on defense we deny it',
      'a personal fitness plan sets goals and tracks weekly progress',
      'good nutrition and hydration fuel performance',
      'recovery and sleep are when the body actually gets stronger',
      'a leader on a team sets the tone and lifts others up',
      'we warm up to prepare and cool down to recover',
      'practicing under game speed builds real skill',
      'rest days prevent injury and burnout',
      'being active in middle school sets habits for life',
      'we assess our fitness honestly to set the next goal',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['overload', 'harder'], ['progression', 'gradual'], ['specificity', 'specific'], ['nutrition', 'fuel'], ['recovery', 'stronger'], ['warm', 'prepare'], ['rest', 'prevent'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G7' });
    return await this._gateSubjectProduction('pe', 'grade7', [
      { question: 'working a little harder than the body is used to is', expected: ['overload', 'o'] },
      { question: 'increasing the challenge gradually is', expected: ['progression', 'p'] },
      { question: 'training the exact system you want to improve is', expected: ['specificity', 's'] },
      { question: 'the heart rate range we train cardio in is the target', expected: ['zone', 'rate', 'z', 'r'] },
      { question: 'the body gets stronger during', expected: ['recovery', 'rest', 'sleep', 'r', 's'] },
      { question: 'food and water that fuel performance are', expected: ['nutrition', 'n'] },
      { question: 'on defense we deny the other team', expected: ['space', 's'] },
      { question: 'a plan that sets goals and tracks progress is a fitness', expected: ['plan', 'p'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG7Real(ctx) {
    const VOCAB = [
      'health', 'mental', 'stress', 'cope', 'anxiety', 'depression', 'help', 'therapy',
      'relationship', 'healthy', 'unhealthy', 'consent', 'boundary', 'dating', 'abuse', 'addiction',
      'refuse', 'nutrition', 'sleep', 'media', 'literacy', 'image', 'decision', 'value',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'mental health is as real and important as physical health',
      'stress is the bodys response to pressure and we can learn to cope with it',
      'anxiety is ongoing worry and depression is lasting low mood and both are treatable',
      'asking for help from an adult or a therapist is a sign of strength not weakness',
      'a healthy relationship has respect trust honesty and equality',
      'an unhealthy relationship has control jealousy pressure and disrespect',
      'consent is a clear freely given yes that can be taken back anytime',
      'a boundary is a limit you set and you have the right to enforce it',
      'addiction is when the brain craves a substance even when it causes harm',
      'refusal skills let you say no firmly and still keep your friends',
      'media literacy means questioning the perfect images we are shown',
      'comparing yourself to edited images harms your body image',
      'good decisions weigh the consequences before acting',
      'knowing your own values makes hard choices clearer',
      'sleep and nutrition and exercise protect mental health too',
      'it is normal for emotions to be intense during these years',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['stress', 'cope'], ['anxiety', 'treatable'], ['help', 'strength'], ['consent', 'yes'], ['boundary', 'limit'], ['addiction', 'crave'], ['media', 'question'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G7' });
    return await this._gateSubjectProduction('health', 'grade7', [
      { question: 'ongoing worry is', expected: ['anxiety', 'a'] },
      { question: 'a lasting low mood is', expected: ['depression', 'd'] },
      { question: 'a clear freely given yes that can be withdrawn is', expected: ['consent', 'c'] },
      { question: 'a limit you set on how others treat you is a', expected: ['boundary', 'b'] },
      { question: 'when the brain craves a substance despite harm it is', expected: ['addiction', 'a'] },
      { question: 'asking for help is a sign of', expected: ['strength', 's'] },
      { question: 'questioning the perfect images we are shown is media', expected: ['literacy', 'l'] },
      { question: 'a relationship with control and jealousy is', expected: ['unhealthy', 'u'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG7Real(ctx) {
    const VOCAB = [
      'spanish', 'presente', 'pasado', 'futuro', 'pretérito', 'conjugar', 'yo', 'nosotros',
      'ellos', 'ser', 'estar', 'ir', 'hacer', 'tener', 'conversacion', 'pregunta',
      'respuesta', 'cultura', 'pais', 'viaje', 'comida', 'tradicion', 'frase', 'parrafo',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'spanish has present past and future tenses to place actions in time',
      'we conjugate a verb to match who is doing the action',
      'yo voy means i go and nosotros vamos means we go',
      'ser is for permanent things and estar is for temporary things',
      'tener means to have and hacer means to do or make',
      'a conversation trades questions and answers back and forth',
      'we can read a whole paragraph and find the main idea in spanish',
      'each spanish speaking country has its own food and traditions',
      'cognates let us guess the meaning of new words',
      'asking and answering questions builds real conversation skill',
      'we describe a trip or a meal using past tense verbs',
      'culture and language are learned together',
      'practicing out loud every day is how fluency grows',
      'irregular verbs like ir and ser must be memorized',
      'gender and number must agree across a spanish sentence',
      'knowing spanish opens a whole second world of people and places',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['presente', 'now'], ['pasado', 'before'], ['futuro', 'later'], ['conjugar', 'match'], ['ser', 'permanent'], ['estar', 'temporary'], ['cultura', 'tradition'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G7' });
    return await this._gateSubjectProduction('language', 'grade7', [
      { question: 'the tense for actions happening now is', expected: ['presente', 'present', 'p'] },
      { question: 'the tense for what already happened is', expected: ['pasado', 'past', 'p'] },
      { question: 'changing a verb to match who does it is to', expected: ['conjugate', 'conjugar', 'c'] },
      { question: 'the verb for permanent things is', expected: ['ser', 's'] },
      { question: 'the verb for temporary states is', expected: ['estar', 'e'] },
      { question: 'tener means to', expected: ['have', 'h'] },
      { question: 'trading questions and answers is a', expected: ['conversation', 'conversacion', 'c'] },
      { question: 'guessing word meaning from similar english words uses', expected: ['cognates', 'cognate', 'c'] },
    ], { gateSubjectTag: 'language' });
  },

  async runCsG7Real(ctx) {
    const VOCAB = [
      'javascript', 'variable', 'type', 'string', 'number', 'boolean', 'operator', 'condition',
      'if', 'else', 'loop', 'for', 'while', 'function', 'parameter', 'return',
      'array', 'object', 'html', 'form', 'css', 'layout', 'debug', 'console',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'a variable in javascript holds a value and has a type',
      'common types are string for text number for math and boolean for true or false',
      'operators like plus and minus and equals work on values',
      'a condition is an expression that is either true or false',
      'an if else statement runs one branch or the other',
      'a for loop repeats a block a set number of times',
      'a while loop repeats as long as a condition stays true',
      'a function takes parameters and can return a value',
      'an array is an ordered list of values you reach by index',
      'an object stores named properties that belong together',
      'an html form collects input from the user',
      'css layout arranges boxes on the page with the box model',
      'we read errors in the console to find what went wrong',
      'breaking a problem into functions keeps code organized',
      'good names make code read like plain language',
      'i build small projects and each one teaches me the next thing',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['variable', 'value'], ['condition', 'true'], ['loop', 'repeat'], ['function', 'return'], ['array', 'list'], ['object', 'properties'], ['debug', 'console'],
    ]);
    await this._trainCodingStories('grade7', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('cs', ctx, { tag: 'CS-G7' });
    return await this._gateSubjectProduction('cs', 'grade7', [
      { question: 'a value that is text is the type', expected: ['string', 's'] },
      { question: 'a value that is true or false is the type', expected: ['boolean', 'b'] },
      { question: 'a block that repeats a set number of times is a for', expected: ['loop', 'l'] },
      { question: 'code that runs one branch or the other is an if', expected: ['else', 'statement', 'e', 's'] },
      { question: 'an ordered list of values is an', expected: ['array', 'a'] },
      { question: 'named properties grouped together make an', expected: ['object', 'o'] },
      { question: 'a function gives back a value when it hits', expected: ['return', 'r'] },
      { question: 'we find errors by reading the', expected: ['console', 'c'] },
    ], { gateSubjectTag: 'cs' });
  },

  async runCivicsG7Real(ctx) {
    const VOCAB = [
      'government', 'citizen', 'law', 'right', 'responsibility', 'vote', 'democracy', 'republic',
      'constitution', 'branch', 'legislative', 'executive', 'judicial', 'congress', 'president', 'court',
      'federal', 'state', 'local', 'election', 'bill', 'justice',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'a government makes and enforces the rules a society lives by',
      'the united states is a democracy where citizens hold the power through voting',
      'the constitution is the supreme law that sets up the government',
      'the government has three branches that check each other',
      'the legislative branch the congress makes the laws',
      'the executive branch the president carries out the laws',
      'the judicial branch the courts interpret the laws',
      'this separation of powers stops any one part from getting too strong',
      'a bill becomes a law after congress passes it and the president signs it',
      'rights are freedoms protected for every citizen',
      'responsibilities are the duties citizens owe in return like voting and obeying laws',
      'government works at the local state and federal levels',
      'elections let citizens choose their leaders',
      'voting is how an ordinary person actually has a say',
      'justice means the law applies fairly and equally to everyone',
      'a good citizen stays informed and speaks up about what is wrong',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['vote', 'democracy'], ['constitution', 'law'], ['legislative', 'laws'], ['executive', 'enforce'], ['judicial', 'interpret'], ['bill', 'law'], ['election', 'leader'],
    ]);
    await this._teachProductionStack('civics', ctx, { tag: 'CIVICS-G7' });
    return await this._gateSubjectProduction('civics', 'grade7', [
      { question: 'the supreme law that sets up the government is the', expected: ['constitution', 'c'] },
      { question: 'the branch that makes the laws is the', expected: ['legislative', 'l'] },
      { question: 'the branch that carries out the laws is the', expected: ['executive', 'e'] },
      { question: 'the branch that interprets the laws is the', expected: ['judicial', 'j'] },
      { question: 'citizens choose their leaders through', expected: ['elections', 'election', 'voting', 'e', 'v'] },
      { question: 'a proposed law before it passes is a', expected: ['bill', 'b'] },
      { question: 'a government where citizens hold power by voting is a', expected: ['democracy', 'd'] },
      { question: 'the three levels of government are local state and', expected: ['federal', 'f'] },
    ], { gateSubjectTag: 'civics' });
  },

  async runLifeG7(ctx) {
    // ── G7 life experience — DATA-DRIVEN (corpora/life/grade7.json) ──
    // The coder obsession locking in (3am hello-world), the emo/goth CREW
    // solidifying, mom-fights (love underneath the door-slams), rebellion
    // (hair dye, stolen eyeliner, tattoo-dream doodles), and her first NAMED
    // crush Devon (talking/messaging, non-physical, the nervous thrill).
    // TRAINED from story DATA, not hardcoded feat-vectors.
    await this._trainLifeStories('grade7', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'website', 'code', 'tutorials', 'hello', 'world', 'eyeliner',
      'hair', 'tattoo', 'notebook', 'doodle',
    ], ctx, { reps: 5 });
  }
};
