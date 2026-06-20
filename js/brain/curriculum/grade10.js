// Grade 10 cell runners (ages 15-16).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G10_MIXIN = {
  async runElaG10Real(ctx) {
    const SENTENCES = [
      'rhetoric is the art of persuasion', 'ethos appeals to credibility',
      'pathos appeals to emotion', 'logos appeals to logic',
      'a claim is the main argument', 'evidence supports the claim',
      'a warrant explains why the evidence matters', 'counterarguments consider other views',
      'a rebuttal answers counterarguments', 'strong arguments use all three appeals',
      'an argument has a clear thesis', 'every paragraph supports the thesis',
      'transitions connect ideas smoothly', 'the conclusion summarizes the argument',
      'opinions need evidence to be arguments', 'facts are verifiable statements',
      'opinions are personal beliefs', 'sources should be reliable',
      'bias can influence arguments', 'logical fallacies weaken arguments',
      'ad hominem attacks the person not the argument', 'straw man misrepresents the opposition',
      'false dilemma offers only two choices', 'slippery slope assumes bad consequences',
      'persuasive writing changes minds', 'informative writing shares knowledge',
    ];
    // Session 36 — TODO-aligned. Rhetorical devices + 3-sentence
    // argument structures (claim → evidence → conclusion) with working
    // memory carrying claim across all three.
    const DEVICES = [
      { example: 'we will not give up we will not back down we will not lose', device: 'anaphora' },
      { example: 'ask not what your country can do for you', device: 'antithesis' },
      { example: 'do we really want to live like this', device: 'question' },
      { example: 'united we stand divided we fall', device: 'antithesis' },
      { example: 'i have a dream', device: 'anaphora' },
    ];
    const ARGS = [
      {
        claim: 'reading every day makes you smarter',
        evidence: 'studies show readers have larger vocabularies',
        conclusion: 'everyone should read at least one book a week',
      },
      {
        claim: 'exercise is essential for health',
        evidence: 'regular exercise reduces heart disease risk by half',
        conclusion: 'thirty minutes of daily activity should be a priority',
      },
      {
        claim: 'sleep matters more than people think',
        evidence: 'people who sleep eight hours live longer on average',
        conclusion: 'a good sleep schedule is worth protecting',
      },
      {
        claim: 'eating vegetables helps your body',
        evidence: 'vegetables contain vitamins your body needs daily',
        conclusion: 'we should eat vegetables at every meal',
      },
    ];
    await this._teachRhetoricalDevices(DEVICES);
    await this._teachArgumentStructure(ARGS);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // ELA G10 FINAL EXAM
    // ══════════════════════════════════��════════════════════════════
    const FINAL = [
      { prompt: ['ethos', 'appeals', 'to'], answer: 'credibility' },
      { prompt: ['pathos', 'appeals', 'to'], answer: 'emotion' },
      { prompt: ['logos', 'appeals', 'to'], answer: 'logic' },
      { prompt: ['claim', 'is', 'the', 'main'], answer: 'argument' },
      { prompt: ['evidence', 'supports', 'the'], answer: 'claim' },
      { prompt: ['ad', 'hominem', 'attacks', 'the'], answer: 'person' },
      { prompt: ['straw', 'man', 'misrepresents'], answer: 'opposition' },
      { prompt: ['anaphora', 'repeats', 'the', 'beginning'], answer: 'phrase' },
      { prompt: ['reading', 'makes', 'you', 'smarter', 'because'], answer: 'vocabulary' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'ethos', 'pathos', 'logos', 'claim', 'evidence', 'warrant',
      'rebuttal', 'fallacy', 'anaphora', 'antithesis',
    ], ctx, { reps: 3 });
  },

  async runMathG10Real(ctx) {
    const SENTENCES = [
      'a proof shows a statement is true', 'a theorem is a proven statement',
      'an axiom is assumed without proof', 'a postulate is a basic assumption',
      'direct proofs start from known facts', 'indirect proofs assume the opposite',
      'proof by contradiction finds an impossibility', 'proof by induction uses base and step',
      'congruent triangles have equal parts', 'similar triangles have proportional sides',
      'side side side proves congruence', 'side angle side also proves congruence',
      'angle side angle also works', 'hypotenuse leg proves right triangle congruence',
      'parallel lines never meet', 'perpendicular lines meet at right angles',
      'a transversal crosses parallel lines', 'alternate interior angles are equal',
      'corresponding angles are equal', 'the law of sines relates sides and angles',
      'the law of cosines extends pythagoras', 'area of a triangle is half base times height',
      'the distance formula measures between points', 'the midpoint formula averages coordinates',
      'circles are defined by their center', 'inscribed angles are half the arc',
    ];
    // Session 41 — TODO-aligned geometric proofs
    await this._teachGeometricProofs();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSciG10Real(ctx) {
    const SENTENCES = [
      'chemistry studies matter and change', 'atoms are the basic units',
      'protons have a positive charge', 'electrons have a negative charge',
      'neutrons have no charge', 'the atomic number is protons',
      'the mass number is protons plus neutrons', 'isotopes have different neutrons',
      'the periodic table organizes elements', 'columns are called groups',
      'rows are called periods', 'metals are on the left',
      'nonmetals are on the right', 'noble gases do not react',
      'ionic bonds transfer electrons', 'covalent bonds share electrons',
      'metallic bonds share electrons freely', 'acids donate hydrogen ions',
      'bases accept hydrogen ions', 'ph measures acidity',
      'a ph of seven is neutral', 'below seven is acidic',
      'above seven is basic', 'chemical reactions rearrange atoms',
      'reactants become products', 'mass is conserved in reactions',
      'balanced equations show equal atoms', 'stoichiometry calculates amounts',
    ];
    // T14.24 Session 45 — TODO-aligned chemistry 1 with real
    // structural feature encodings.
    // TODO Sci-G10 spec (line 454): "_teachPeriodicTable() element →
    // group/period feature. _teachBonding() ionic/covalent distinction".

    // Session 45 replaced both helpers (which were Session 43 arbitrary
    // 8d binary features) with structurally-meaningful encodings:

    // _teachPeriodicTable now walks 18 real elements (H through Ar)
    // with 16d features encoding (period linear/log/sin/cos + group
    // linear/log/sin/cos + cross-harmonics). Elements in the same
    // GROUP (alkali metals Li/Na, halogens F/Cl, noble gases He/Ne/
    // Ar) now have HIGH feature cosine — matching real chemistry.
    // Element-name GloVe into sem, group/period feature into free,
    // letter stream through letter region. Same 3-way binding pattern
    // as Math-K _teachMagnitudes.

    // _teachBonding now uses real chemistry features per bond type:
    //   ionic:    [transfer, no share, metal+nonmetal, crystal, water]
    //   covalent: [no transfer, share, nonmetal+nonmetal, molecule]
    //   metallic: [half-transfer, half-share, crystal]
    //   polar covalent: [mostly share, partial charge, water-soluble]
    //   hydrogen: [weak, molecular, water-essential]
    // Ionic and covalent are ANTI-correlated on transfer/share dims,
    // which is the core chemical distinction the TODO prescribes.

    // Both helpers run BEFORE the sentence walk. Sentences then
    // teach relationships ("ionic bonds transfer electrons",
    // "noble gases do not react", "acids donate hydrogen ions") on
    // top of the stable feature basins.
    await this._teachPeriodicTable();
    await this._teachBonding();
    // ── Sci-G10: chemistry causal chains + classification ──
    await this._teachCausalChains([
      ['atom', 'bond'], ['bond', 'molecule'], ['molecule', 'compound'],
      ['ionic', 'transfer'], ['covalent', 'share'], ['metal', 'conduct'],
      ['acid', 'dissolve'], ['base', 'neutralize'], ['react', 'product'],
      ['catalyst', 'speed'], ['energy', 'reaction'],
    ]);
    await this._teachInference([
      ['atom', 'bond', 'molecule'], ['react', 'product', 'energy'],
      ['acid', 'base', 'neutral'], ['metal', 'electron', 'conduct'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocG10Real(ctx) {
    const SENTENCES = [
      'the twentieth century saw huge changes', 'world war two was the largest war',
      'hitler led nazi germany', 'the allies fought the axis',
      'the holocaust killed six million jews', 'the war ended with atomic bombs',
      'the cold war followed world war two', 'the united states led the west',
      'the soviet union led the east', 'the korean war was a cold war conflict',
      'the vietnam war divided america', 'the berlin wall divided germany',
      'the civil rights movement fought segregation', 'martin luther king led nonviolent protest',
      'rosa parks refused to give up her seat', 'the civil rights act was passed',
      'women fought for equal rights', 'the feminist movement grew',
      'the space race pushed technology', 'the moon landing was in nineteen sixty nine',
      'the berlin wall fell in nineteen eighty nine', 'the soviet union collapsed in nineteen ninety one',
      'globalization connected the world', 'the internet changed everything',
      'climate change became a concern', 'the century was a time of progress and conflict',
    ];
    // T14.24 Session 66 — prime US 20th century scaffold per TODO
    // line 527 before the sentence pass.
    await this._teachUS20thCentury();
    // ── Soc-G9/G10: world + US history causal chains ──
    await this._teachCausalChains([
      ['enlightenment', 'revolution'], ['revolution', 'democracy'],
      ['industry', 'factory'], ['factory', 'urbanization'],
      ['imperialism', 'colony'], ['nationalism', 'war'],
      ['alliances', 'world war'], ['treaty', 'resentment'],
      ['depression', 'poverty'], ['fascism', 'war'],
      ['holocaust', 'genocide'], ['atomic', 'surrender'],
      ['cold war', 'arms race'], ['segregation', 'protest'],
      ['protest', 'rights'], ['technology', 'globalization'],
    ]);
    await this._teachInference([
      ['enlightenment', 'revolution', 'democracy'],
      ['industry', 'factory', 'urbanization'],
      ['alliances', 'assassination', 'world war'],
      ['depression', 'fascism', 'war'],
      ['segregation', 'protest', 'rights'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtG10Real(ctx) {
    const SENTENCES = [
      'music history spans many centuries', 'medieval music was mostly religious',
      'gregorian chant was sung in churches', 'the renaissance added harmony',
      'palestrina wrote renaissance choral music', 'the baroque period came next',
      'bach wrote the well tempered clavier', 'handel composed the messiah',
      'vivaldi wrote the four seasons', 'the classical period valued balance',
      'haydn is the father of the symphony', 'mozart wrote with perfect elegance',
      'beethoven bridged classical and romantic', 'the ninth symphony is his masterpiece',
      'the romantic period valued emotion', 'chopin wrote for piano',
      'schubert wrote beautiful songs', 'wagner wrote epic operas',
      'tchaikovsky wrote the nutcracker', 'the twentieth century broke rules',
      'stravinsky shocked audiences with the rite of spring', 'schoenberg invented twelve tone music',
      'jazz emerged from african american communities', 'louis armstrong was a jazz legend',
      'rock and roll was born in the nineteen fifties', 'the beatles changed popular music',
    ];
    // T14.24 Session 85 — prime music history chronological scaffold
    // per TODO line 565 before the music history sentence pass.
    await this._teachMusicHistory();
    await this._teachInference([
      ['medieval', 'renaissance', 'baroque'], ['baroque', 'classical', 'romantic'],
      ['romantic', 'modern', 'contemporary'], ['jazz', 'blues', 'rock'],
    ]);
    await this._teachCausalChains([
      ['baroque', 'ornamentation'], ['classical', 'form'], ['romantic', 'emotion'],
      ['technology', 'recording'], ['recording', 'popular'], ['jazz', 'improvise'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G10 new-track runners (generated; apostrophes stripped).
  async runMusicG10Real(ctx) {
    const VOCAB = [
      'theory', 'harmony', 'modulation', 'chord', 'progression', 'cadence', 'form', 'verse',
      'chorus', 'bridge', 'compose', 'arrange', 'produce', 'synth', 'sample', 'loop',
      'mix', 'minor', 'dissonance', 'texture', 'dynamics', 'motif',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'advanced harmony stacks chords to build tension and release',
      'modulation shifts a song from one key to another for effect',
      'song form names the parts like verse chorus and bridge',
      'a cadence is how a musical phrase comes to rest',
      'composing is deciding every note and how the parts fit',
      'arranging assigns the melody and harmony to voices or instruments',
      'i started producing dark electronic music on my laptop',
      'a synth makes sound from electronic waveforms',
      'a sample is a piece of recorded sound reused in a track',
      'a loop repeats a section to build a groove',
      'mixing balances the levels so every part is heard right',
      'minor keys and dissonant textures are the heart of dark music',
      'a motif is a short musical idea that returns and develops',
      'dynamics and space matter as much as the notes themselves',
      'i write the sound in my head by learning the rules then bending them',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['modulation', 'key'], ['cadence', 'rest'], ['compose', 'notes'], ['synth', 'sound'], ['minor', 'dark'], ['loop', 'groove'], ['motif', 'idea'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G10' });
    return await this._gateSubjectProduction('music', 'grade10', [
      { question: 'shifting a song from one key to another is', expected: ['modulation', 'm'] },
      { question: 'how a phrase comes to rest is a', expected: ['cadence', 'c'] },
      { question: 'the parts of a song are its', expected: ['form', 'f'] },
      { question: 'a short musical idea that returns is a', expected: ['motif', 'm'] },
      { question: 'a piece of recorded sound reused in a track is a', expected: ['sample', 's'] },
      { question: 'dark music lives in dissonance and which keys', expected: ['minor', 'm'] },
      { question: 'balancing the levels of a track is', expected: ['mixing', 'mix', 'm'] },
      { question: 'making sound from electronic waveforms uses a', expected: ['synth', 's'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG10Real(ctx) {
    const VOCAB = [
      'fitness', 'weight', 'training', 'rep', 'set', 'form', 'muscle', 'cardio',
      'endurance', 'strength', 'flexible', 'heart', 'rate', 'recovery', 'protein', 'nutrition',
      'sport', 'goal', 'plan', 'injury', 'warm', 'wellness', 'progress',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'weight training overloads a muscle with reps and sets to build strength',
      'correct form is what prevents injury under load',
      'cardio conditioning builds the heart and lungs over time',
      'a balanced program trains strength cardio and flexibility',
      'progressive overload means adding a little each week',
      'protein and sleep let trained muscle rebuild stronger',
      'we monitor heart rate to train in the right zone',
      'recovery days are part of the plan not a break from it',
      'a personal wellness plan fits fitness into a real life',
      'warming up and cooling down protect the body around training',
      'sports build teamwork pressure and handling outcomes',
      'overtraining without recovery causes injury and burnout',
      'tracking progress keeps motivation and shows what works',
      'movement is as much for the mind as for the body',
      'the habits set now carry into a healthy adult life',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['weight', 'strength'], ['form', 'injury'], ['overload', 'stronger'], ['recovery', 'rebuild'], ['cardio', 'heart'], ['warm', 'protect'], ['plan', 'progress'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G10' });
    return await this._gateSubjectProduction('pe', 'grade10', [
      { question: 'adding a little each week is progressive', expected: ['overload', 'o'] },
      { question: 'what prevents injury under load is good', expected: ['form', 'f'] },
      { question: 'muscle rebuilds with protein and', expected: ['sleep', 'recovery', 'rest', 's', 'r'] },
      { question: 'training the heart and lungs is', expected: ['cardio', 'c'] },
      { question: 'reps and sets overload a', expected: ['muscle', 'm'] },
      { question: 'training too much without rest causes', expected: ['injury', 'burnout', 'i', 'b'] },
      { question: 'fitting fitness into real life is a wellness', expected: ['plan', 'p'] },
      { question: 'we train in the right zone by watching heart', expected: ['rate', 'r'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG10Real(ctx) {
    const VOCAB = [
      'wellness', 'mental', 'depression', 'anxiety', 'therapy', 'cope', 'relationship', 'consent',
      'boundary', 'abuse', 'contraception', 'sti', 'protection', 'addiction', 'substance', 'refuse',
      'stress', 'nutrition', 'sleep', 'decision', 'help', 'risk', 'support',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'health and wellness treats the body the mind and relationships as one',
      'depression and anxiety are medical conditions that respond to treatment',
      'therapy gives real tools to cope and a place to be honest',
      'a healthy relationship is equal respectful and honest',
      'an abusive relationship uses control isolation and fear',
      'consent is a clear sober freely given yes that can be withdrawn',
      'contraception and protection reduce pregnancy and infection risk',
      'an sti is prevented with protection and caught early with testing',
      'addiction rewires the brain to crave a substance despite the harm',
      'refusal skills let a person hold their line under pressure',
      'managing stress with sleep movement and talking protects the mind',
      'good decisions weigh the real consequences before acting',
      'asking for help early is a strength not a failure',
      'no one is owed access to anyone elses body for any reason',
      'caring for mental health is a lifelong ongoing practice',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['depression', 'treatment'], ['consent', 'yes'], ['boundary', 'protect'], ['contraception', 'prevent'], ['addiction', 'crave'], ['stress', 'cope'], ['help', 'strength'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G10' });
    return await this._gateSubjectProduction('health', 'grade10', [
      { question: 'a clear sober freely given yes is', expected: ['consent', 'c'] },
      { question: 'a medical low mood that responds to treatment is', expected: ['depression', 'd'] },
      { question: 'reducing pregnancy and infection risk uses', expected: ['contraception', 'protection', 'c', 'p'] },
      { question: 'when the brain craves a substance despite harm it is', expected: ['addiction', 'a'] },
      { question: 'holding your line under pressure uses', expected: ['refusal', 'refuse', 'r'] },
      { question: 'a relationship with control and fear is', expected: ['abusive', 'abuse', 'a'] },
      { question: 'asking for help early is a', expected: ['strength', 's'] },
      { question: 'a limit on how others treat you is a', expected: ['boundary', 'b'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG10Real(ctx) {
    const VOCAB = [
      'spanish', 'pasado', 'imperfecto', 'subjuntivo', 'condicional', 'conjugar', 'reflexive', 'pronoun',
      'adjective', 'agreement', 'conversacion', 'ensayo', 'literatura', 'cultura', 'opinion', 'aunque',
      'sino', 'mientras', 'fluido', 'idioma', 'traducir',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'spanish two layers the subjunctive and conditional onto the basic tenses',
      'the subjunctive expresses wishes doubts emotions and possibilities',
      'the conditional says what would happen under some condition',
      'reflexive verbs describe actions a person does to themselves',
      'adjectives agree with their noun in gender and number',
      'we hold longer conversations on opinions and current topics',
      'we write a structured essay with a thesis and support in spanish',
      'we read short authentic literature and find theme and meaning',
      'aunque means although sino means but rather mientras means while',
      'culture and history deepen the meaning of the language',
      'translating well means keeping meaning not just swapping words',
      'cognates and context unlock unfamiliar passages',
      'speaking daily even with errors is how fluency is built',
      'irregular verbs must be memorized across every tense',
      'an idioma is a language and learning one opens a world',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['subjuntivo', 'doubt'], ['condicional', 'would'], ['reflexive', 'oneself'], ['agreement', 'gender'], ['aunque', 'although'], ['cultura', 'meaning'], ['speak', 'fluency'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G10' });
    return await this._gateSubjectProduction('language', 'grade10', [
      { question: 'the mood for wishes and doubts is the', expected: ['subjunctive', 'subjuntivo', 's'] },
      { question: 'the mood for what would happen is the', expected: ['conditional', 'condicional', 'c'] },
      { question: 'verbs for actions done to oneself are', expected: ['reflexive', 'r'] },
      { question: 'adjectives agree in gender and', expected: ['number', 'n'] },
      { question: 'aunque means', expected: ['although', 'a'] },
      { question: 'keeping meaning across languages is', expected: ['translating', 'translate', 't'] },
      { question: 'fluency is built by speaking', expected: ['daily', 'often', 'd', 'o'] },
      { question: 'verbs that break the rules are', expected: ['irregular', 'i'] },
    ], { gateSubjectTag: 'language' });
  },

  async runCsG10Real(ctx) {
    const VOCAB = [
      'programming', 'object', 'class', 'method', 'property', 'inheritance', 'function', 'array',
      'loop', 'condition', 'event', 'dom', 'api', 'json', 'fetch', 'async',
      'module', 'framework', 'project', 'debug', 'git', 'test', 'refactor',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'object oriented programming groups data and behavior into classes',
      'a class is a blueprint and an object is an instance of it',
      'a method is a function that belongs to an object',
      'inheritance lets one class extend and reuse another',
      'i fetch data from an api and the response often comes as json',
      'async and await let code wait for slow work without freezing',
      'modules split a program into files that import and export',
      'a framework gives reusable structure so i build faster',
      'i break a project into small functions that each do one job',
      'the dom is the live tree the browser builds from html',
      'event listeners run code when the user interacts',
      'i keep projects in git and commit progress in small steps',
      'refactoring improves working code without changing behavior',
      'i read the console and stack traces to debug',
      'each project i build is more ambitious than the last',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['class', 'object'], ['method', 'object'], ['inheritance', 'reuse'], ['fetch', 'json'], ['async', 'wait'], ['module', 'import'], ['dom', 'browser'],
    ]);
    await this._trainCodingStories('grade10', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('cs', ctx, { tag: 'CS-G10' });
    return await this._gateSubjectProduction('cs', 'grade10', [
      { question: 'a blueprint for objects is a', expected: ['class', 'c'] },
      { question: 'a function that belongs to an object is a', expected: ['method', 'm'] },
      { question: 'one class extending another is', expected: ['inheritance', 'i'] },
      { question: 'data fetched from an api often arrives as', expected: ['json', 'j'] },
      { question: 'code that waits for slow work without freezing uses', expected: ['async', 'a'] },
      { question: 'reusable structure that speeds building is a', expected: ['framework', 'f'] },
      { question: 'the live tree the browser builds is the', expected: ['dom', 'd'] },
      { question: 'improving code without changing behavior is', expected: ['refactoring', 'refactor', 'r'] },
    ], { gateSubjectTag: 'cs' });
  },

  async runCivicsG10Real(ctx) {
    const VOCAB = [
      'government', 'democracy', 'republic', 'ideology', 'liberal', 'conservative', 'policy', 'media',
      'propaganda', 'rights', 'law', 'court', 'federal', 'election', 'party', 'vote',
      'citizen', 'justice', 'power', 'reform',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'governments range from democracies to authoritarian systems',
      'a political ideology is a set of beliefs about how society should run',
      'liberal and conservative describe broad differences over change and tradition',
      'policy is how a government turns goals into concrete action',
      'media shapes what citizens know and can be used as propaganda',
      'media literacy means questioning the source and the spin',
      'an informed citizen is harder to manipulate',
      'courts interpret whether laws follow the constitution',
      'political parties organize people around shared goals',
      'elections transfer power peacefully when the system works',
      'rights protect individuals and laws bind everyone including leaders',
      'reform is changing a system from within through legal means',
      'justice means power is accountable and the law applies equally',
      'comparing governments shows what protects freedom and what crushes it',
      'a citizen who participates is the engine of a democracy',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['ideology', 'beliefs'], ['media', 'propaganda'], ['policy', 'action'], ['election', 'power'], ['court', 'interpret'], ['reform', 'change'], ['informed', 'manipulate'],
    ]);
    await this._teachProductionStack('civics', ctx, { tag: 'CIVICS-G10' });
    return await this._gateSubjectProduction('civics', 'grade10', [
      { question: 'a set of beliefs about how society should run is an', expected: ['ideology', 'i'] },
      { question: 'questioning sources and spin is media', expected: ['literacy', 'l'] },
      { question: 'how government turns goals into action is', expected: ['policy', 'p'] },
      { question: 'elections transfer power', expected: ['peacefully', 'peaceful', 'p'] },
      { question: 'changing a system through legal means is', expected: ['reform', 'r'] },
      { question: 'courts decide if laws follow the', expected: ['constitution', 'c'] },
      { question: 'media used to mislead is', expected: ['propaganda', 'p'] },
      { question: 'the engine of a democracy is the', expected: ['citizen', 'c'] },
    ], { gateSubjectTag: 'civics' });
  },

  async runEconomicsG10Real(ctx) {
    const VOCAB = [
      'economics', 'market', 'supply', 'demand', 'price', 'competition', 'monopoly', 'profit',
      'cost', 'revenue', 'budget', 'credit', 'debt', 'interest', 'income', 'save',
      'invest', 'wage', 'labor', 'consumer',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'microeconomics studies the choices of people and firms',
      'in a competitive market many sellers keep prices honest',
      'a monopoly is one seller that can set the price high',
      'price moves to where supply meets demand',
      'profit is revenue minus cost and it drives business choices',
      'a budget plans income against spending',
      'credit lets you spend now and pay later with interest',
      'debt is borrowed money that costs interest until repaid',
      'saving builds a cushion and investing grows money over time',
      'wages are the price of labor set by supply and demand',
      'a consumer votes with every dollar they spend',
      'scarcity forces every choice to have a trade off',
      'understanding money is how a poor kid stops being trapped by it',
      'interest can work for you when saving or against you when borrowing',
      'personal finance is economics applied to your own life',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['competition', 'price'], ['monopoly', 'price'], ['profit', 'cost'], ['credit', 'interest'], ['debt', 'interest'], ['save', 'cushion'], ['wage', 'labor'],
    ]);
    await this._teachProductionStack('economics', ctx, { tag: 'ECON-G10' });
    return await this._gateSubjectProduction('economics', 'grade10', [
      { question: 'one seller that can set a high price is a', expected: ['monopoly', 'm'] },
      { question: 'revenue minus cost is', expected: ['profit', 'p'] },
      { question: 'spending now and paying later with interest is', expected: ['credit', 'c'] },
      { question: 'the price of labor is the', expected: ['wage', 'w'] },
      { question: 'many sellers keeping prices honest is', expected: ['competition', 'c'] },
      { question: 'planning income against spending is a', expected: ['budget', 'b'] },
      { question: 'borrowed money that costs interest is', expected: ['debt', 'd'] },
      { question: 'growing money over time is', expected: ['investing', 'invest', 'i'] },
    ], { gateSubjectTag: 'economics' });
  },

  async runPsychologyG10Real(ctx) {
    const VOCAB = [
      'psychology', 'cognition', 'perception', 'attention', 'memory', 'schema', 'social', 'conformity',
      'bias', 'attribution', 'development', 'attachment', 'identity', 'personality', 'trait', 'motivation',
      'emotion', 'behavior', 'group', 'influence',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'cognitive psychology studies how we think perceive and remember',
      'attention is the filter that decides what we process',
      'a schema is a mental framework that organizes what we know',
      'social psychology studies how others shape our behavior',
      'conformity is changing behavior to match a group',
      'attribution is how we explain why people do things',
      'a cognitive bias is a systematic error in reasoning',
      'developmental psychology tracks how the mind grows over a life',
      'attachment in childhood shapes later relationships',
      'identity is the sense of who you are that forms in the teen years',
      'personality is the stable pattern of how a person acts',
      'motivation and emotion drive behavior together',
      'group influence can push people to act against their values',
      'understanding the mind is understanding myself and everyone',
      'i am drawn to this because i live inside my own head so much',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['attention', 'filter'], ['schema', 'organize'], ['conformity', 'group'], ['bias', 'error'], ['attachment', 'relationship'], ['identity', 'self'], ['motivation', 'behavior'],
    ]);
    await this._teachProductionStack('psychology', ctx, { tag: 'PSYCH-G10' });
    return await this._gateSubjectProduction('psychology', 'grade10', [
      { question: 'the filter that decides what we process is', expected: ['attention', 'a'] },
      { question: 'a mental framework that organizes knowledge is a', expected: ['schema', 's'] },
      { question: 'changing behavior to match a group is', expected: ['conformity', 'c'] },
      { question: 'a systematic error in reasoning is a cognitive', expected: ['bias', 'b'] },
      { question: 'the sense of who you are that forms in the teens is', expected: ['identity', 'i'] },
      { question: 'how we explain why people act is', expected: ['attribution', 'a'] },
      { question: 'childhood bonds that shape later relationships are', expected: ['attachment', 'a'] },
      { question: 'the stable pattern of how a person acts is', expected: ['personality', 'p'] },
    ], { gateSubjectTag: 'psychology' });
  },

  async runLifeG10(ctx) {
    // ── G10 life experience — DATA-DRIVEN (corpora/life/grade10.json) ──
    // Sophomore: coding-becomes-vocation (first real app — "this is what i
    // want forever"), first concert/mosh-pit, the all-in/no-middle-ground
    // intensity crystallizing, Devon-is-her-real-boyfriend (deepening teen
    // physical closeness rendered as FEELING, non-graphic), and weed becoming
    // routine (character history). TRAINED from story DATA. Romance
    // non-graphic; explicit register is the 18+ college chapter.
    await this._trainLifeStories('grade10', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'application', 'chat', 'server', 'concert', 'mosh', 'loyal',
      'blog', 'intense', 'bridge', 'burn',
    ], ctx, { reps: 5 });
  }
};
