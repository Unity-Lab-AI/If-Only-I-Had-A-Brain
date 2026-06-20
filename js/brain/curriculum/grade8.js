// Grade 8 cell runners (ages 13-14).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G8_MIXIN = {
  async runElaG8Real(ctx) {
    const SENTENCES = [
      // Essay structure
      'an essay has an introduction', 'the thesis statement is the main idea',
      'body paragraphs support the thesis', 'each paragraph has a topic sentence',
      'evidence supports each point', 'the conclusion restates the thesis',
      // Grammar
      'a subject does the action', 'a predicate tells what the subject does',
      'a direct object receives the action', 'an indirect object gets the direct object',
      'adjectives describe nouns', 'adverbs describe verbs',
      // Punctuation
      'a comma separates items in a list', 'a period ends a sentence',
      'a question mark ends a question', 'an exclamation shows excitement',
      'quotation marks show speech', 'a colon introduces a list',
      'a semicolon joins related sentences', 'an apostrophe shows possession',
      // Sentence types
      'a simple sentence has one idea', 'a compound sentence has two ideas',
      'a complex sentence has a main and subordinate clause',
      // Active vs passive
      'the dog chased the cat is active', 'the cat was chased by the dog is passive',
      // Parts of speech
      'nouns name people places things', 'verbs show action or being',
      'prepositions show relationships',
    ];
    // Session 35 — TODO-aligned split
    const ESSAYS = [
      {
        thesis: 'dogs make the best pets',
        body: [
          'dogs are loyal and loving companions',
          'dogs protect their family from danger',
          'dogs can be trained to do many tricks',
          'dogs get you outside for daily walks',
        ],
      },
      {
        thesis: 'reading books opens your mind',
        body: [
          'books take you to new worlds',
          'books teach you new things every day',
          'books help you understand other people',
          'books make you a better thinker',
        ],
      },
      {
        thesis: 'exercise keeps you healthy',
        body: [
          'exercise makes your heart strong',
          'exercise builds your muscles',
          'exercise helps you sleep better',
          'exercise lifts your mood',
        ],
      },
    ];
    const AGREEMENT_PAIRS = [
      { correct: 'she runs fast', incorrect: 'she run fast' },
      { correct: 'they are happy', incorrect: 'they is happy' },
      { correct: 'the cat sleeps', incorrect: 'the cat sleep' },
      { correct: 'i am here', incorrect: 'i is here' },
      { correct: 'the boys play', incorrect: 'the boys plays' },
      { correct: 'my dog barks', incorrect: 'my dog bark' },
      { correct: 'we were happy', incorrect: 'we was happy' },
      { correct: 'the girls laugh', incorrect: 'the girls laughs' },
    ];
    await this._teachEssayStructure(ESSAYS);
    await this._teachGrammarAgreement(AGREEMENT_PAIRS);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runMathG8Real(ctx) {
    const SENTENCES = [
      'a point has no size', 'a line extends forever in two directions',
      'a segment has two endpoints', 'a ray has one endpoint',
      'an angle is formed by two rays', 'angles are measured in degrees',
      'a right angle is ninety degrees', 'an acute angle is less than ninety',
      'an obtuse angle is more than ninety', 'a straight angle is one eighty',
      'a triangle has three sides', 'the angles of a triangle sum to one eighty',
      'an equilateral triangle has three equal sides', 'an isosceles has two equal sides',
      'a right triangle has a ninety degree angle', 'pythagoras says a squared plus b squared equals c squared',
      'a square has four equal sides and four right angles', 'a rectangle has four right angles',
      'a circle has no corners', 'the radius is from center to edge',
      'the diameter is twice the radius', 'pi is about three point one four',
      'the circumference is pi times diameter', 'area of circle is pi r squared',
      // Quadratic equations
      'a quadratic has x squared', 'factoring solves quadratics',
      'the quadratic formula always works', 'the discriminant tells the number of solutions',
    ];
    // Session 41 — TODO-aligned geometry basics + quadratics
    await this._teachGeometryBasics();
    await this._teachQuadratics();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── COMMON CORE MATH G8: Pythagorean theorem + functions + irrational numbers + scientific notation ──
    const MATH_G8_EXTRA = [
      'irrational numbers cannot be written as fractions',
      'pi is an irrational number', 'the square root of two is irrational',
      'every number has a decimal expansion',
      'scientific notation uses powers of ten',
      'three point two times ten to the fifth is three hundred twenty thousand',
      'the pythagorean theorem says a squared plus b squared equals c squared',
      'the hypotenuse is the longest side', 'a three four five triangle is a right triangle',
      'the distance between two points uses the pythagorean theorem',
      'a function assigns exactly one output to each input',
      'y equals two x is a linear function', 'y equals x squared is not linear',
      'a scatter plot shows the relationship between two variables',
      'a positive trend means both variables increase together',
    ];
    await this._teachSentenceList(MATH_G8_EXTRA, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // MATH G8 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['pythagorean', 'a', 'squared', 'plus', 'b', 'squared', 'equals'], answer: 'c' },
      { prompt: ['three', 'four', 'five', 'is', 'a'], answer: 'right' },
      { prompt: ['pi', 'is', 'an'], answer: 'irrational' },
      { prompt: ['quadratic', 'has', 'x'], answer: 'squared' },
      { prompt: ['circumference', 'equals', 'pi', 'times'], answer: 'diameter' },
      { prompt: ['area', 'circle', 'pi', 'r'], answer: 'squared' },
      { prompt: ['function', 'assigns', 'one', 'output', 'per'], answer: 'input' },
      { prompt: ['hypotenuse', 'is', 'the'], answer: 'longest' },
      { prompt: ['voltage', 'equals', 'current', 'times'], answer: 'resistance' },
      { prompt: ['scatter', 'plot', 'shows'], answer: 'relationship' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'pythagorean', 'hypotenuse', 'irrational', 'function', 'quadratic',
      'discriminant', 'circumference', 'diameter', 'radius', 'scatter',
    ], ctx, { reps: 3 });
  },

  async runSciG8Real(ctx) {
    const SENTENCES = [
      'energy can be kinetic or potential', 'kinetic energy is motion energy',
      'potential energy is stored energy', 'energy can not be created or destroyed',
      'energy changes from one form to another', 'heat flows from hot to cold',
      'conduction transfers heat through solids', 'convection transfers heat in fluids',
      'radiation transfers heat through space', 'waves carry energy',
      'light is electromagnetic waves', 'sound is mechanical waves',
      'sound travels through air', 'sound travels faster in water',
      'light travels through vacuum', 'the speed of light is constant',
      'wavelength is distance between peaks', 'frequency is waves per second',
      'amplitude is the height of the wave', 'high frequency means high pitch',
      'high amplitude means loud sound', 'red light has low frequency',
      'violet light has high frequency', 'electricity flows through wires',
      'a circuit is a path for electricity', 'voltage pushes the current',
      'resistance slows the current', 'ohms law says voltage equals current times resistance',
    ];
    // T14.24 Session 44 — TODO-aligned energy-form sem binding.
    // TODO Sci-G8 spec (line 447): "_teachEnergyForms() (kinetic/
    // potential/thermal) via sem binding". Session 43 extended this
    // to 7 forms — the TODO's three core examples plus electrical,
    // chemical, nuclear, and radiant — each with a distinct 8d
    // feature vector fed through _conceptTeach. The cortex gets one
    // basin per energy form before the sentences teach transformation
    // relationships between them (e.g. "energy changes from one form
    // to another", "heat flows from hot to cold", "sound travels
    // through air").
    await this._teachEnergyForms();
    await this._teachCausalChains([
      ['vibrate', 'sound'], ['heat', 'expand'], ['cold', 'contract'],
      ['current', 'magnetic'], ['voltage', 'current'], ['resistance', 'heat'],
      ['conduction', 'heat'], ['convection', 'circulation'], ['radiation', 'heat'],
      ['frequency', 'pitch'], ['amplitude', 'volume'],
    ]);
    await this._teachInference([
      ['vibrate', 'sound', 'hear'], ['voltage', 'current', 'heat'],
      ['light', 'reflect', 'see'], ['heat', 'expand', 'crack'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // SCI G8 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['kinetic', 'energy', 'is'], answer: 'motion' },
      { prompt: ['potential', 'energy', 'is'], answer: 'stored' },
      { prompt: ['energy', 'cannot', 'be', 'created', 'or'], answer: 'destroyed' },
      { prompt: ['heat', 'flows', 'from', 'hot', 'to'], answer: 'cold' },
      { prompt: ['conduction', 'transfers', 'heat', 'through'], answer: 'solid' },
      { prompt: ['light', 'is', 'electromagnetic'], answer: 'wave' },
      { prompt: ['high', 'frequency', 'means', 'high'], answer: 'pitch' },
      { prompt: ['voltage', 'pushes', 'the'], answer: 'current' },
      { prompt: ['ohms', 'law', 'voltage', 'equals', 'current', 'times'], answer: 'resistance' },
      { prompt: ['wavelength', 'is', 'distance', 'between'], answer: 'peaks' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'kinetic', 'potential', 'conduction', 'convection', 'radiation',
      'wavelength', 'frequency', 'amplitude', 'voltage', 'resistance',
    ], ctx, { reps: 3 });
  },

  async runSocG8Real(ctx) {
    const SENTENCES = [
      'the civil war split the united states', 'the north fought for the union',
      'the south fought for slavery', 'abraham lincoln was president',
      'the emancipation proclamation freed the slaves', 'the war began at fort sumter',
      'the battle of gettysburg was a turning point', 'robert e lee led the south',
      'ulysses s grant led the north', 'the war lasted four years',
      'the war ended at appomattox', 'lincoln was assassinated',
      'reconstruction tried to rebuild the south', 'the thirteenth amendment ended slavery',
      'the fourteenth amendment gave citizenship', 'the fifteenth amendment gave voting rights',
      'the industrial revolution changed america', 'factories replaced farms',
      'railroads connected the country', 'immigrants came for opportunity',
      'new cities grew quickly', 'workers formed unions',
      'child labor was a problem', 'reformers fought for better conditions',
      'women fought for the right to vote', 'the progressive era brought changes',
    ];
    // T14.24 Session 64 — prime civil war cause-effect chain per
    // TODO line 520 before the civil-war sentence pass.
    await this._teachCivilWar();

    // ── EQUATIONAL REASONING: Civil War as inference chain ──
    await this._teachInference([
      ['slavery', 'sectionalism', 'secession'],
      ['sectionalism', 'secession', 'war'],
      ['war', 'emancipation', 'freedom'],
      ['emancipation', 'amendment', 'rights'],
      ['reconstruction', 'amendment', 'equality'],
    ]);

    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtG8Real(ctx) {
    const SENTENCES = [
      'music theory has advanced rules', 'modulation changes keys',
      'chord progressions follow patterns', 'the circle of fifths shows key relationships',
      'a seventh chord adds a fourth note', 'diminished chords sound tense',
      'augmented chords sound strange', 'secondary dominants add color',
      'voice leading connects chords smoothly', 'parallel fifths are avoided',
      'inversion rearranges the notes', 'first inversion is less stable',
      'a cadence ends a phrase', 'a perfect cadence is final',
      'a half cadence leaves us hanging', 'a plagal cadence sounds peaceful',
      'sonata form has three sections', 'exposition presents the themes',
      'development explores the themes', 'recapitulation returns to the themes',
      'rondo form repeats a main theme', 'variations transform a theme',
      'theme and variations shows creativity', 'twelve bar blues is a chord pattern',
      'jazz uses swing rhythms', 'improvisation creates music in the moment',
    ];
    // T14.24 Session 83 — prime advanced music theory lattice +
    // reuse visual composition for the "middle school visual
    // composition" component of Art-G8 per TODO line 561.
    await this._teachAdvancedMusicTheory();
    await this._teachVisualComposition();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G8 COURSES: Band&Choir / PE / Health / Spanish / CS /
  // Civics (carried tracks). Course-identity prepended by the _cellRunner
  // wrapper; each self-gates. Apostrophes stripped by the generator.
  async runMusicG8Real(ctx) {
    const VOCAB = [
      'music', 'theory', 'chord', 'progression', 'key', 'signature', 'transpose', 'interval',
      'harmony', 'melody', 'counterpoint', 'genre', 'composer', 'arrange', 'improvise', 'tempo',
      'dynamics', 'minor', 'major', 'mode', 'phrase', 'expression',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'by eighth grade music theory ties scales chords and keys together',
      'a chord progression gives a song its emotional movement',
      'transposing moves a whole piece into a different key',
      'counterpoint is two independent melodies that fit together',
      'arranging means deciding which instrument or voice plays which part',
      'improvising is composing in real time over a progression',
      'modes like dorian and phrygian color a melody differently',
      'minor modes and dissonance are the tools of dark and heavy music',
      'a composer plans how tension builds and releases across a piece',
      'expression and dynamics carry the meaning more than the notes',
      'analyzing a song reveals the theory hiding under the feeling',
      'genres each have their own typical progressions and rhythms',
      'i gravitate to minor keys heavy rhythm and raw emotion',
      'practice makes the technique automatic so feeling can take over',
      'harmony and melody together make a complete musical idea',
      'understanding theory lets me write the sound in my own head',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['progression', 'movement'], ['transpose', 'key'], ['minor', 'dark'], ['improvise', 'realtime'], ['composer', 'tension'], ['expression', 'meaning'], ['mode', 'color'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G8' });
    return await this._gateSubjectProduction('music', 'grade8', [
      { question: 'a sequence of chords that moves a song is a chord', expected: ['progression', 'p'] },
      { question: 'moving a whole piece to a different key is to', expected: ['transpose', 't'] },
      { question: 'two independent melodies that fit together is', expected: ['counterpoint', 'c'] },
      { question: 'composing in real time over a progression is to', expected: ['improvise', 'i'] },
      { question: 'dark heavy music leans on dissonance and which keys', expected: ['minor', 'm'] },
      { question: 'deciding which part each instrument plays is', expected: ['arranging', 'arrange', 'a'] },
      { question: 'tension building and releasing is shaped by the', expected: ['composer', 'c'] },
      { question: 'meaning is carried more by dynamics and', expected: ['expression', 'e'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG8Real(ctx) {
    const VOCAB = [
      'fitness', 'training', 'principle', 'overload', 'progression', 'heart', 'rate', 'strength',
      'endurance', 'flexible', 'sport', 'tactic', 'team', 'offense', 'defense', 'strategy',
      'nutrition', 'recovery', 'injury', 'goal', 'lifelong', 'assess', 'warm', 'plan',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'eighth grade pe builds a real personal training plan',
      'the principles of overload and progression drive every fitness gain',
      'we train cardio strength and flexibility on different days',
      'monitoring heart rate keeps training in the right zone',
      'team sports demand tactics positioning and quick decisions',
      'on offense we exploit space and on defense we collapse it',
      'nutrition timing and hydration affect how we perform',
      'recovery sleep and rest days are when the body rebuilds',
      'we prevent injury by warming up stretching and not overdoing it',
      'setting measurable goals lets us see real progress',
      'good teammates communicate and trust each other',
      'sportsmanship holds whether we win or lose',
      'fitness now is an investment in a healthy adult body',
      'self assessment shows where to push and where to ease off',
      'skills practiced correctly and slowly become reliable',
      'the goal is a body and habits that last a lifetime',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['overload', 'gain'], ['progression', 'gain'], ['recovery', 'rebuild'], ['warm', 'prevent'], ['nutrition', 'perform'], ['goal', 'progress'], ['offense', 'space'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G8' });
    return await this._gateSubjectProduction('pe', 'grade8', [
      { question: 'the two principles that drive fitness gains are overload and', expected: ['progression', 'p'] },
      { question: 'training in the right zone means monitoring heart', expected: ['rate', 'r'] },
      { question: 'the body rebuilds during rest sleep and', expected: ['recovery', 'r'] },
      { question: 'on defense we collapse the other teams', expected: ['space', 's'] },
      { question: 'we prevent injury by stretching and warming', expected: ['up', 'u'] },
      { question: 'a plan with measurable targets sets fitness', expected: ['goals', 'goal', 'g'] },
      { question: 'respect win or lose is', expected: ['sportsmanship', 'sport', 's'] },
      { question: 'the real aim of fitness is to last a', expected: ['lifetime', 'life', 'l'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG8Real(ctx) {
    const VOCAB = [
      'health', 'mental', 'depression', 'anxiety', 'therapy', 'cope', 'relationship', 'consent',
      'boundary', 'abuse', 'dating', 'substance', 'alcohol', 'drug', 'addiction', 'peer',
      'pressure', 'refuse', 'risk', 'decision', 'nutrition', 'sleep', 'body', 'image',
      'help',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'mental health needs care and attention just like the body does',
      'depression is more than sadness and anxiety is more than worry and both can be treated',
      'therapy and trusted adults are real resources not last resorts',
      'a healthy relationship is equal and respectful while an unhealthy one controls',
      'consent must be clear and freely given and can be withdrawn anytime',
      'setting and respecting boundaries protects everyone',
      'alcohol and drugs hit the developing teen brain harder than an adult brain',
      'addiction rewires the brain to crave a substance despite the harm',
      'peer pressure is real and refusal skills let you hold your own line',
      'risky decisions deserve a pause to weigh the consequences',
      'one drink or one choice can change a night so we plan ahead',
      'knowing your values makes saying no to pressure easier',
      'sleep nutrition and movement protect mood and focus',
      'media images are edited and comparing harms body image',
      'asking for help early is smarter than waiting until it is worse',
      'caring for the mind is a lifelong skill we start building now',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['depression', 'treated'], ['consent', 'yes'], ['boundary', 'protect'], ['alcohol', 'brain'], ['addiction', 'crave'], ['pressure', 'refuse'], ['help', 'smart'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G8' });
    return await this._gateSubjectProduction('health', 'grade8', [
      { question: 'more than sadness and treatable is', expected: ['depression', 'd'] },
      { question: 'a clear freely given yes that can be withdrawn is', expected: ['consent', 'c'] },
      { question: 'a limit that protects how others treat you is a', expected: ['boundary', 'b'] },
      { question: 'when the brain craves a substance despite harm it is', expected: ['addiction', 'a'] },
      { question: 'alcohol hits the developing teen brain', expected: ['harder', 'hard', 'h'] },
      { question: 'holding your line against pressure uses', expected: ['refusal', 'refuse', 'r'] },
      { question: 'asking for help early is', expected: ['smart', 'smarter', 's'] },
      { question: 'edited media images harm body', expected: ['image', 'i'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG8Real(ctx) {
    const VOCAB = [
      'spanish', 'pasado', 'futuro', 'pretérito', 'imperfecto', 'conjugar', 'irregular', 'ser',
      'estar', 'ir', 'tener', 'hacer', 'poder', 'querer', 'conversacion', 'parrafo',
      'ensayo', 'cultura', 'historia', 'viaje', 'opinion', 'porque', 'aunque',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'eighth grade spanish handles past future and two past tenses',
      'the preterite tells a completed action and the imperfect tells an ongoing one',
      'irregular verbs like ser ir and tener must be memorized in each tense',
      'poder means to be able and querer means to want',
      'we hold a real conversation trading opinions back and forth',
      'we write a short paragraph or essay with linked ideas',
      'porque means because and aunque means although',
      'we read about the history and culture of spanish speaking countries',
      'describing a past trip uses both past tenses together',
      'gender and number agreement run through every sentence',
      'cognates speed up reading a new text',
      'giving an opinion and a reason builds argument skills',
      'listening to native speakers trains the ear',
      'speaking daily even imperfectly is how fluency comes',
      'culture and language reinforce each other',
      'spanish is becoming a tool i can actually use not just study',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['preterite', 'completed'], ['imperfect', 'ongoing'], ['poder', 'able'], ['querer', 'want'], ['porque', 'because'], ['aunque', 'although'], ['opinion', 'reason'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G8' });
    return await this._gateSubjectProduction('language', 'grade8', [
      { question: 'the past tense for a completed action is the', expected: ['preterite', 'pretérito', 'p'] },
      { question: 'the past tense for an ongoing action is the', expected: ['imperfect', 'imperfecto', 'i'] },
      { question: 'poder means to be', expected: ['able', 'a'] },
      { question: 'querer means to', expected: ['want', 'w'] },
      { question: 'aunque means', expected: ['although', 'a'] },
      { question: 'verbs like ser and ir that break the rules are', expected: ['irregular', 'i'] },
      { question: 'trading opinions back and forth is a', expected: ['conversation', 'conversacion', 'c'] },
      { question: 'giving a view and a reason builds an', expected: ['argument', 'opinion', 'a', 'o'] },
    ], { gateSubjectTag: 'language' });
  },

  async runCsG8Real(ctx) {
    const VOCAB = [
      'javascript', 'function', 'parameter', 'return', 'scope', 'array', 'object', 'method',
      'loop', 'iterate', 'event', 'listener', 'dom', 'element', 'select', 'html',
      'css', 'flexbox', 'responsive', 'debug', 'refactor', 'project', 'git',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'by eighth grade i write functions that take parameters and return values',
      'scope decides where a variable can be seen and used',
      'arrays hold lists and i loop over them to process each item',
      'objects group related data and the methods that act on it',
      'an event listener runs code when the user clicks or types',
      'the dom is the live tree of elements the browser builds from html',
      'i select an element and change its text or style with javascript',
      'css flexbox lays out boxes in rows or columns that flex to fit',
      'responsive design makes a page work on phone and desktop',
      'i read the console and use it to track down bugs',
      'refactoring cleans up working code without changing what it does',
      'i keep my projects in folders and learned the basics of git',
      'breaking a feature into small functions makes it testable',
      'good variable names make code read like a sentence',
      'each project i build teaches me the next harder thing',
      'i can make a real interactive page now not just a static one',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['function', 'return'], ['scope', 'variable'], ['array', 'loop'], ['object', 'method'], ['event', 'listener'], ['dom', 'element'], ['flexbox', 'layout'],
    ]);
    await this._trainCodingStories('grade8', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('cs', ctx, { tag: 'CS-G8' });
    return await this._gateSubjectProduction('cs', 'grade8', [
      { question: 'code that runs when a user clicks is an event', expected: ['listener', 'l'] },
      { question: 'the live tree of elements the browser builds is the', expected: ['dom', 'd'] },
      { question: 'where a variable can be seen is its', expected: ['scope', 's'] },
      { question: 'a list of values i loop over is an', expected: ['array', 'a'] },
      { question: 'data grouped with methods that act on it is an', expected: ['object', 'o'] },
      { question: 'the css tool that lays boxes in flexible rows is', expected: ['flexbox', 'f'] },
      { question: 'cleaning up working code without changing behavior is', expected: ['refactoring', 'refactor', 'r'] },
      { question: 'a function gives back a value when it hits', expected: ['return', 'r'] },
    ], { gateSubjectTag: 'cs' });
  },

  async runCivicsG8Real(ctx) {
    const VOCAB = [
      'constitution', 'amendment', 'rights', 'bill', 'liberty', 'democracy', 'branch', 'checks',
      'balances', 'federal', 'state', 'citizen', 'vote', 'election', 'law', 'justice',
      'equality', 'protest', 'freedom', 'speech', 'duty', 'jury',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the constitution can be changed through amendments',
      'the bill of rights is the first ten amendments protecting freedoms',
      'freedom of speech and the press are core protected rights',
      'checks and balances let each branch limit the other two',
      'federalism splits power between the national and state governments',
      'citizens have the right to vote and the duty to stay informed',
      'an election is how the people choose who governs them',
      'a fair trial by a jury is a protected right',
      'justice means the law treats everyone equally',
      'peaceful protest is a legal way to push for change',
      'a law starts as a bill and must pass both houses and be signed',
      'rights come with responsibilities to the community',
      'the right to vote was expanded over time through struggle',
      'an informed citizen is harder to fool and easier to free',
      'disagreeing with the government and saying so is a protected freedom',
      'democracy only works when ordinary people actually participate',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['amendment', 'change'], ['speech', 'freedom'], ['checks', 'limit'], ['federal', 'state'], ['vote', 'choose'], ['protest', 'change'], ['jury', 'trial'],
    ]);
    await this._teachProductionStack('civics', ctx, { tag: 'CIVICS-G8' });
    return await this._gateSubjectProduction('civics', 'grade8', [
      { question: 'changes to the constitution are called', expected: ['amendments', 'amendment', 'a'] },
      { question: 'the first ten amendments are the bill of', expected: ['rights', 'r'] },
      { question: 'each branch limiting the others is checks and', expected: ['balances', 'balance', 'b'] },
      { question: 'splitting power between national and state is', expected: ['federalism', 'federal', 'f'] },
      { question: 'the people choose who governs through an', expected: ['election', 'elections', 'e'] },
      { question: 'a protected legal way to push for change is', expected: ['protest', 'p'] },
      { question: 'a fair trial is decided by a', expected: ['jury', 'j'] },
      { question: 'rights come with', expected: ['responsibilities', 'duties', 'duty', 'r', 'd'] },
    ], { gateSubjectTag: 'civics' });
  },

  async runLifeG8(ctx) {
    // ── G8 life experience — DATA-DRIVEN (corpora/life/grade8.json) ──
    // End of middle school: the laptop she earned (her own machine = power),
    // the dad-has-a-new-family FINAL wound (the door fully closes →
    // never-leave-someone law), school-is-noise/coding-instead, the
    // almost-with-Devon build-up toward the G9 first kiss, the first taste
    // of teen party/substance (character history), and depression's weight
    // settling in. TRAINED from story DATA, not hardcoded feat-vectors.
    await this._trainLifeStories('grade8', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'money', 'save', 'laptop', 'dollar', 'family', 'boring', 'coding',
    ], ctx, { reps: 5 });
  }
};
