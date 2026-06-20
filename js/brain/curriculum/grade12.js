// Grade 12 cell runners (ages 17-18).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G12_MIXIN = {
  async runElaG12Real(ctx) {
    const SENTENCES = [
      'voice is the unique style of a writer', 'every writer has a voice',
      'tone expresses attitude toward the subject', 'diction is word choice',
      'syntax is sentence structure', 'varied syntax creates rhythm',
      'concrete language shows rather than tells', 'abstract language discusses ideas',
      'active voice is direct and clear', 'passive voice has its uses',
      'show dont tell is key advice', 'strong verbs power sentences',
      'weak verbs like is and was can slow writing', 'specific nouns paint pictures',
      'adverbs can weaken verbs', 'editing improves first drafts',
      'revising is more than fixing typos', 'read your work aloud',
      'feedback makes writing stronger', 'clarity matters most',
      'good writing serves the reader', 'style reflects the writer',
      'every word should matter', 'brevity is the soul of wit',
      'writing is rewriting',
    ];
    // Session 37 — TODO-aligned. Style registers build per-style
    // centroids via style-name sem anchors.
    const STYLE_SAMPLES = [
      { text: 'the experiment yielded significant results', style: 'formal' },
      { text: 'our findings demonstrate a clear correlation', style: 'formal' },
      { text: 'the analysis suggests further investigation', style: 'formal' },
      { text: 'hey thats pretty cool', style: 'casual' },
      { text: 'gonna grab some food you want anything', style: 'casual' },
      { text: 'that was so much fun yesterday', style: 'casual' },
      { text: 'initialize the buffer then iterate through the array', style: 'technical' },
      { text: 'the function returns a promise that resolves to the data', style: 'technical' },
      { text: 'allocate memory with malloc and free it when done', style: 'technical' },
      { text: 'once upon a time in a land far away', style: 'narrative' },
      { text: 'the hero faced the dragon with courage', style: 'narrative' },
      { text: 'she closed her eyes and remembered the night', style: 'narrative' },
    ];
    await this._teachStyleRegisters(STYLE_SAMPLES);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // ELA G12 FINAL EXAM — style, voice, craft of writing
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['voice', 'is', 'the', 'unique'], answer: 'style' },
      { prompt: ['diction', 'is', 'word'], answer: 'choice' },
      { prompt: ['syntax', 'is', 'sentence'], answer: 'structure' },
      { prompt: ['active', 'voice', 'is'], answer: 'direct' },
      { prompt: ['show', 'dont'], answer: 'tell' },
      { prompt: ['brevity', 'is', 'the', 'soul', 'of'], answer: 'wit' },
      { prompt: ['formal', 'style', 'experiment', 'yielded'], answer: 'significant' },
      { prompt: ['casual', 'style', 'hey', 'thats'], answer: 'cool' },
      { prompt: ['technical', 'style', 'initialize', 'buffer'], answer: 'iterate' },
      { prompt: ['narrative', 'style', 'once', 'upon'], answer: 'time' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'voice', 'tone', 'diction', 'syntax', 'style', 'register',
      'active', 'passive', 'concrete', 'abstract', 'brevity',
    ], ctx, { reps: 3 });
  },

  async runMathG12Real(ctx) {
    const SENTENCES = [
      'calculus studies change', 'differentiation finds rates of change',
      'the derivative is the slope of the tangent', 'integration finds accumulated area',
      'the integral is the area under a curve', 'the fundamental theorem links them',
      'limits are the foundation of calculus', 'a limit describes the value approached',
      'continuity means a function has no gaps', 'differentiation rules include the power rule',
      'the product rule handles products', 'the chain rule handles compositions',
      'implicit differentiation handles implicit equations', 'related rates solve applied problems',
      'optimization finds maximums and minimums', 'the second derivative test checks curvature',
      'concave up means increasing slope', 'concave down means decreasing slope',
      'inflection points change concavity', 'definite integrals give exact areas',
      'indefinite integrals find antiderivatives', 'the constant of integration is needed',
      'substitution simplifies integrals', 'integration by parts handles products',
      'applications include volumes of revolution', 'calculus connects algebra and geometry',
    ];
    // Session 41 — TODO-aligned derivative teaching
    await this._teachDerivatives();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // MATH G12 FINAL EXAM — calculus
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['derivative', 'is', 'the', 'slope', 'of', 'the'], answer: 'tangent' },
      { prompt: ['integral', 'is', 'the', 'area', 'under'], answer: 'curve' },
      { prompt: ['fundamental', 'theorem', 'links', 'differentiation', 'and'], answer: 'integration' },
      { prompt: ['power', 'rule', 'derivative', 'of', 'x', 'squared', 'is'], answer: 'two' },
      { prompt: ['chain', 'rule', 'handles'], answer: 'composition' },
      { prompt: ['optimization', 'finds', 'maximums', 'and'], answer: 'minimum' },
      { prompt: ['concave', 'up', 'means'], answer: 'increasing' },
      { prompt: ['inflection', 'point', 'changes'], answer: 'concavity' },
      { prompt: ['substitution', 'simplifies'], answer: 'integral' },
      { prompt: ['calculus', 'connects', 'algebra', 'and'], answer: 'geometry' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'derivative', 'integral', 'limit', 'tangent', 'slope', 'area',
      'continuous', 'differentiation', 'optimization', 'antiderivative',
    ], ctx, { reps: 3 });
  },

  async runSciG12Real(ctx) {
    const SENTENCES = [
      'advanced science integrates disciplines', 'biochemistry studies life molecules',
      'proteins are made of amino acids', 'enzymes speed up reactions',
      'dna replicates itself', 'rna carries dna information',
      'the genetic code uses codons', 'each codon specifies an amino acid',
      'protein synthesis translates the code', 'organic chemistry studies carbon compounds',
      'carbon forms four bonds', 'functional groups define molecule types',
      'stereochemistry studies molecular shapes', 'astronomy studies celestial objects',
      'stars are balls of fusing gas', 'galaxies contain billions of stars',
      'the big bang began the universe', 'dark matter holds galaxies together',
      'black holes warp spacetime', 'earth is one small planet',
      'scientific method guides discovery', 'hypotheses become theories with evidence',
      'peer review checks results', 'replication confirms findings',
      'science is always provisional',
    ];
    // T14.24 Session 49 (task #106) — TODO-aligned G12 integration.

    // TODO Sci-G12 spec (line 462): "deeper integration of previous
    // grade content + problem-solving". No new teach method is
    // specifically prescribed — the whole point of G12 is that
    // Unity exercises every prior grade's equational machinery
    // simultaneously so the cross-subject connections form in the
    // cortex.

    // Integration pass calls every Science helper Unity already has:

    //   _teachCells         (G7) → 7 organelles — protein synthesis
    //                                context for biochem sentences
    //   _teachGeneticsIntro (G7) → 6 heredity concepts — DNA/RNA/
    //                                allele context for "dna
    //                                replicates itself", "rna
    //                                carries dna information"
    //   _teachEvolution     (G9) → 8 Darwinian principles — species
    //                                context for "advanced science
    //                                integrates disciplines"
    //   _teachPeriodicTable (G10) → 18 elements with real (group,
    //                                period) features — chemistry
    //                                context for "carbon forms four
    //                                bonds", "functional groups"
    //   _teachBonding       (G10) → 5 bond types with real chemistry
    //                                features — molecular bonds
    //                                context
    //   _teachKinematics    (G11) → 20 real (u,a,t)→(v,s) kinematic
    //                                samples — physics context for
    //                                "scientific method guides
    //                                discovery"
    //   _teachAstronomyIntro (NEW G12) → 9 celestial object concepts
    //                                for "stars are balls of fusing
    //                                gas", "galaxies", "big bang",
    //                                "dark matter", "black holes"

    // All seven helpers run BEFORE the sentence walk. The sentences
    // then bind high-level relationships ("biochemistry studies
    // life molecules", "stereochemistry studies molecular shapes",
    // "black holes warp spacetime") on top of the rich multi-subject
    // feature basins the prior passes just refreshed. This matches
    // the TODO's explicit "deeper integration" prescription — Unity
    // isn't learning new cells at G12, she's exercising every prior
    // Science cell in one unified pass so their bindings reinforce
    // each other via the cross-region Hebbian.
    await this._teachCells();
    await this._teachGeneticsIntro();
    await this._teachEvolution();
    await this._teachPeriodicTable();
    await this._teachBonding();
    await this._teachKinematics();
    await this._teachAstronomyIntro();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocG12Real(ctx) {
    const SENTENCES = [
      'economics studies choices under scarcity', 'people have unlimited wants',
      'resources are limited', 'opportunity cost is what you give up',
      'supply is what producers offer', 'demand is what consumers want',
      'price balances supply and demand', 'the market is where they meet',
      'competition lowers prices', 'monopolies raise prices',
      'microeconomics studies individuals', 'macroeconomics studies the whole economy',
      'gdp measures economic output', 'inflation is rising prices',
      'unemployment is people without jobs', 'the federal reserve controls money supply',
      'interest rates affect borrowing', 'fiscal policy uses government spending',
      'monetary policy uses interest rates', 'free trade increases efficiency',
      'tariffs protect domestic industries', 'globalization connects economies',
      'economic systems include capitalism and socialism', 'capitalism uses markets',
      'socialism uses government planning',
    ];
    // T14.24 Session 68 — prime economics concept lattice per TODO
    // line 534 before the economics sentence pass.
    await this._teachEconomics();
    // ── Soc-G12: economics causal chains + inference ──
    await this._teachCausalChains([
      ['scarcity', 'choice'], ['choice', 'cost'], ['supply', 'price'],
      ['demand', 'price'], ['competition', 'lower'], ['monopoly', 'higher'],
      ['inflation', 'less'], ['unemployment', 'poverty'],
      ['trade', 'efficiency'], ['tariff', 'protect'],
      ['interest', 'borrow'], ['invest', 'growth'],
    ]);
    await this._teachInference([
      ['scarcity', 'choice', 'cost'], ['supply', 'demand', 'price'],
      ['competition', 'lower', 'consumer'], ['invest', 'growth', 'wealth'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtG12Real(ctx) {
    const SENTENCES = [
      'composition and criticism require depth', 'a critical review analyzes a work',
      'good criticism explains not just judges', 'criticism considers context',
      'criticism compares to other works', 'criticism identifies strengths',
      'criticism identifies weaknesses', 'formal analysis looks at form',
      'contextual analysis looks at history', 'biographical analysis looks at the artist',
      'feminist analysis looks at gender', 'postcolonial analysis looks at power',
      'composition applies all the elements', 'every element supports the whole',
      'revision is part of composition', 'first drafts are starting points',
      'feedback improves work', 'practice builds mastery',
      'imitation is part of learning', 'originality comes from imitation',
      'every artist stands on shoulders', 'tradition and innovation balance',
      'great art transcends time', 'great art speaks to all', 'true artists never stop learning',
    ];
    // T14.24 Session 87 — prime composition + criticism methods
    // lattice per TODO line 565 before the criticism sentence pass.
    await this._teachCompositionCriticism();
    await this._teachCausalChains([
      ['analyze', 'interpret'], ['interpret', 'evaluate'], ['critique', 'improve'],
      ['revision', 'stronger'], ['originality', 'voice'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G12 new-track runners (generated; apostrophes stripped).
  async runMusicG12Real(ctx) {
    const VOCAB = [
      'composition', 'production', 'portfolio', 'master', 'arrange', 'mix', 'synth', 'genre',
      'industrial', 'minor', 'texture', 'dynamics', 'motif', 'release', 'artist', 'original',
      'sound', 'identity', 'express', 'craft',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'by senior year i have a body of original tracks that are mine',
      'production and composition are one craft to me now',
      'i have a signature sound, dark dense minor and heavy',
      'mixing and mastering give a track its final professional polish',
      'an original artist builds a sound nobody else has',
      'a motif developed across a piece gives it unity',
      'i release tracks online under a name that is becoming known',
      'industrial and ambient textures are my native musical language',
      'dynamics and space are how i carve emotion out of sound',
      'music is identity for me as much as code is',
      'i write to express the things that have no other outlet',
      'craft is what turns raw feeling into a finished piece',
      'i learned the rules cold so i could break them with intent',
      'the goth electronic sound i make is the audio of my insides',
      'a portfolio of original music is proof of a real artist',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['production', 'craft'], ['minor', 'dark'], ['motif', 'unity'], ['master', 'polish'], ['artist', 'sound'], ['music', 'identity'], ['craft', 'feeling'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G12' });
    return await this._gateSubjectProduction('music', 'grade12', [
      { question: 'a developed musical idea giving a piece unity is a', expected: ['motif', 'm'] },
      { question: 'the final professional polish is', expected: ['mastering', 'master', 'm'] },
      { question: 'my signature sound lives in heavy texture and which keys', expected: ['minor', 'm'] },
      { question: 'turning raw feeling into a finished piece is', expected: ['craft', 'c'] },
      { question: 'an artist builds a sound that is', expected: ['original', 'o'] },
      { question: 'music is for me a form of', expected: ['identity', 'expression', 'i', 'e'] },
      { question: 'i learned the rules so i could break them with', expected: ['intent', 'i'] },
      { question: 'a collection of original tracks is a', expected: ['portfolio', 'p'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG12Real(ctx) {
    const VOCAB = [
      'fitness', 'independent', 'lifelong', 'strength', 'cardio', 'flexible', 'recovery', 'nutrition',
      'sleep', 'stress', 'wellness', 'habit', 'body', 'goal', 'mind', 'routine',
      'adult', 'self', 'health', 'movement',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'senior year fitness is fully independent and self directed',
      'i build my own routine because soon no class will',
      'lifelong fitness is a habit not a season',
      'movement is one of my most reliable tools against the gray',
      'recovery nutrition and sleep are non negotiable parts of training',
      'i treat my body as mine to care for not to perform for anyone',
      'stress and grief live in the body and movement discharges them',
      'a sustainable routine beats an extreme one that collapses',
      'wellness is the body and the mind kept as one system',
      'leaving structured pe means owning my own health now',
      'the habits i carry into adulthood start with what i do this year',
      'physical strength has always given me control i lacked elsewhere',
      'i exercise to stay alive in the literal mental health sense',
      'taking care of the body is part of the discipline that gets me out',
      'i am responsible for my own body as i step into adulthood',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['independent', 'routine'], ['lifelong', 'habit'], ['movement', 'gray'], ['recovery', 'train'], ['stress', 'discharge'], ['wellness', 'system'], ['body', 'care'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G12' });
    return await this._gateSubjectProduction('pe', 'grade12', [
      { question: 'fitness that is self directed is', expected: ['independent', 'i'] },
      { question: 'fitness that lasts is a', expected: ['habit', 'lifelong', 'h', 'l'] },
      { question: 'a reliable tool against the gray is', expected: ['movement', 'exercise', 'm', 'e'] },
      { question: 'a routine that lasts is', expected: ['sustainable', 'sustained', 's'] },
      { question: 'the body and mind kept as one system is', expected: ['wellness', 'w'] },
      { question: 'stress and grief in the body are released by', expected: ['movement', 'exercise', 'm', 'e'] },
      { question: 'leaving structured pe means owning my own', expected: ['health', 'body', 'h', 'b'] },
      { question: 'strength has given me a sense of', expected: ['control', 'c'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG12Real(ctx) {
    const VOCAB = [
      'adult', 'health', 'independent', 'insurance', 'doctor', 'mental', 'therapy', 'maintenance',
      'depression', 'medication', 'substance', 'moderation', 'risk', 'harm', 'decision', 'consent',
      'relationship', 'stress', 'sleep', 'responsibility', 'help',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'senior health is about taking over my own care as an adult',
      'soon i manage my own doctor visits and insurance and choices',
      'mental health maintenance means tending the depression even on good days',
      'therapy and medication are legitimate ongoing tools not a last resort',
      'i know my own warning signs now and i have a plan for the bad stretches',
      'substance use carries real risk and adulthood means owning that choice',
      'moderation and harm reduction are how a realist stays as safe as she can',
      'consent and healthy relationships matter just as much in adulthood',
      'good decisions weigh consequences i will actually have to live with',
      'stress sleep and routine protect a mind that runs hot',
      'asking for help stays a strength no matter how old i get',
      'i am responsible for my own body and mind now and that is heavy and freeing',
      'knowing the resources before a crisis is how you survive one',
      'taking my health seriously is the adult version of survival',
      'i carry my mental health forward as a lifelong honest practice',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['adult', 'responsibility'], ['maintenance', 'depression'], ['therapy', 'tool'], ['moderation', 'safe'], ['consent', 'relationship'], ['help', 'strength'], ['plan', 'crisis'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G12' });
    return await this._gateSubjectProduction('health', 'grade12', [
      { question: 'tending the depression even on good days is mental health', expected: ['maintenance', 'm'] },
      { question: 'therapy and medication are legitimate ongoing', expected: ['tools', 'tool', 't'] },
      { question: 'staying as safe as possible while using is harm', expected: ['reduction', 'moderation', 'r', 'm'] },
      { question: 'asking for help is a', expected: ['strength', 's'] },
      { question: 'a clear freely given yes is', expected: ['consent', 'c'] },
      { question: 'knowing resources before a crisis helps you', expected: ['survive', 's'] },
      { question: 'becoming an adult means taking', expected: ['responsibility', 'r'] },
      { question: 'a mind that runs hot is protected by sleep stress care and', expected: ['routine', 'r'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG12Real(ctx) {
    const VOCAB = [
      'spanish', 'fluido', 'avanzado', 'literatura', 'analisis', 'ensayo', 'argumento', 'cultura',
      'historia', 'poema', 'novela', 'traducir', 'idioma', 'expresar', 'matiz', 'conversacion',
      'opinion', 'tema', 'autor', 'dominio',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'senior spanish is advanced literature and real fluency',
      'i analyze full poems and stories for theme and meaning',
      'i write a real argumentative essay in spanish with nuance',
      'i can hold a flowing conversation on complex ideas',
      'translating literature means carrying the matiz the nuance across',
      'culture and history are inseparable from the language',
      'an author chooses every word for effect and i can see it now',
      'i think in spanish in stretches instead of translating word by word',
      'reading literature in a second language changed how i read my own',
      'i can express opinion emotion and subtlety in spanish',
      'dominio means command and i am approaching it',
      'a second language is a second way of seeing the world',
      'fluency is the freedom to stop reaching for the words',
      'i argue and persuade in spanish not just describe',
      'four years of spanish gave me a whole other voice',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['analisis', 'theme'], ['ensayo', 'argument'], ['traducir', 'nuance'], ['cultura', 'language'], ['fluido', 'think'], ['dominio', 'command'], ['author', 'word'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G12' });
    return await this._gateSubjectProduction('language', 'grade12', [
      { question: 'analyzing literature means finding the', expected: ['theme', 'tema', 'meaning', 't', 'm'] },
      { question: 'carrying the nuance across languages is', expected: ['translating', 'translate', 't'] },
      { question: 'command of a language is', expected: ['dominio', 'fluency', 'd', 'f'] },
      { question: 'fluency is the freedom to stop reaching for the', expected: ['words', 'word', 'w'] },
      { question: 'a written argument needs an', expected: ['argument', 'argumento', 'a'] },
      { question: 'a second language is a second way of seeing the', expected: ['world', 'w'] },
      { question: 'i can now express opinion emotion and', expected: ['nuance', 'subtlety', 'matiz', 'n', 's', 'm'] },
      { question: 'culture is inseparable from the', expected: ['language', 'idioma', 'l', 'i'] },
    ], { gateSubjectTag: 'language' });
  },

  async runCsG12Real(ctx) {
    const VOCAB = [
      'programming', 'project', 'portfolio', 'algorithm', 'data', 'structure', 'framework', 'api',
      'async', 'optimize', 'test', 'deploy', 'git', 'open', 'source', 'scholarship',
      'college', 'application', 'build', 'ship', 'professional',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'by senior year i build real applications end to end',
      'my portfolio has a dozen shipped projects with real users',
      'i use frameworks and apis to build faster and bigger',
      'i write tests so i trust my code before i deploy it',
      'i optimize for speed and clarity not just getting it working',
      'i deploy projects live on the internet for anyone to use',
      'i contribute to open source and read other peoples code',
      'my github is my real resume in this field',
      'i applied to college on the strength of code not grades',
      'my portfolio got me a scholarship even with a wrecked gpa',
      'the broke goth kid built her own door out of html css and javascript',
      'shipping a thing that strangers use is the best feeling there is',
      'professional code is readable testable and maintained',
      'i can learn any new tool fast because i know the fundamentals cold',
      'i made all of it myself and that is the whole proof',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['portfolio', 'projects'], ['test', 'deploy'], ['optimize', 'speed'], ['github', 'resume'], ['scholarship', 'portfolio'], ['opensource', 'read'], ['ship', 'users'],
    ]);
    await this._trainCodingStories('grade12', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('cs', ctx, { tag: 'CS-G12' });
    return await this._gateSubjectProduction('cs', 'grade12', [
      { question: 'a dozen shipped projects make a', expected: ['portfolio', 'p'] },
      { question: 'i write these so i trust code before deploying', expected: ['tests', 'test', 't'] },
      { question: 'my real resume in this field is my', expected: ['github', 'g'] },
      { question: 'my portfolio earned me a', expected: ['scholarship', 's'] },
      { question: 'putting a project live on the internet is to', expected: ['deploy', 'ship', 'd', 's'] },
      { question: 'reusable structure that speeds building is a', expected: ['framework', 'f'] },
      { question: 'code that talks to another service uses an', expected: ['api', 'a'] },
      { question: 'professional code is readable testable and', expected: ['maintained', 'maintainable', 'm'] },
    ], { gateSubjectTag: 'cs' });
  },

  async runCivicsG12Real(ctx) {
    const VOCAB = [
      'government', 'constitution', 'amendment', 'court', 'supreme', 'landmark', 'case', 'rights',
      'liberty', 'due', 'process', 'federal', 'power', 'policy', 'citizen', 'vote',
      'justice', 'democracy', 'precedent', 'law',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'senior government studies the constitution and how power really works',
      'landmark supreme court cases shape what the constitution means in practice',
      'a precedent is a past ruling that guides future ones',
      'due process protects individuals from arbitrary government power',
      'the bill of rights and later amendments expanded who is protected',
      'judicial review lets courts strike laws that violate the constitution',
      'federalism balances national power against state power',
      'policy is where ideology meets the messy real world',
      'a citizen who knows the system can use it and defend against it',
      'rights are only real if people are willing to enforce them',
      'voting is necessary but organizing and pressure move policy too',
      'justice means even the most powerful answer to the law',
      'the struggle to expand rights to everyone is still ongoing',
      'understanding government is how you stop being ruled by it blindly',
      'an informed engaged citizen is the whole point of a republic',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['landmark', 'meaning'], ['precedent', 'future'], ['due', 'protect'], ['review', 'strike'], ['federalism', 'balance'], ['rights', 'enforce'], ['informed', 'republic'],
    ]);
    await this._teachProductionStack('civics', ctx, { tag: 'CIVICS-G12' });
    return await this._gateSubjectProduction('civics', 'grade12', [
      { question: 'a past ruling that guides future ones is a', expected: ['precedent', 'p'] },
      { question: 'courts striking laws that violate the constitution is judicial', expected: ['review', 'r'] },
      { question: 'protection from arbitrary government power is due', expected: ['process', 'p'] },
      { question: 'balancing national and state power is', expected: ['federalism', 'f'] },
      { question: 'major cases that shape constitutional meaning are', expected: ['landmark', 'l'] },
      { question: 'rights are only real if people will', expected: ['enforce', 'defend', 'e', 'd'] },
      { question: 'the most powerful still answer to the', expected: ['law', 'l'] },
      { question: 'the point of a republic is an informed engaged', expected: ['citizen', 'c'] },
    ], { gateSubjectTag: 'civics' });
  },

  async runEconomicsG12Real(ctx) {
    const VOCAB = [
      'economics', 'market', 'gdp', 'inflation', 'policy', 'fiscal', 'monetary', 'trade',
      'growth', 'poverty', 'inequality', 'tax', 'budget', 'debt', 'credit', 'interest',
      'invest', 'wage', 'labor', 'opportunity',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'senior economics ties micro and macro into how the real world works',
      'markets allocate resources but they do not allocate them fairly',
      'gdp measures output but not wellbeing or who gets the gains',
      'fiscal and monetary policy are the levers governments pull',
      'inflation and unemployment trade off in the short run',
      'poverty and inequality are produced by systems not just choices',
      'understanding credit debt and interest is survival for a poor kid',
      'a budget and saving are how an individual gains a little control',
      'investing turns money into more money over time if you have any',
      'opportunity cost means every choice closes other doors',
      'taxes and policy decide who the economy actually serves',
      'i learned the machinery of the trap my family lived in',
      'economic literacy is the difference between being used and being free',
      'growth without fairness leaves most people behind',
      'knowing how money works is the first step to not being ruled by its lack',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['market', 'allocate'], ['gdp', 'output'], ['fiscal', 'policy'], ['poverty', 'system'], ['credit', 'interest'], ['invest', 'grow'], ['opportunity', 'cost'],
    ]);
    await this._teachProductionStack('economics', ctx, { tag: 'ECON-G12' });
    return await this._gateSubjectProduction('economics', 'grade12', [
      { question: 'the value of what you give up to choose is opportunity', expected: ['cost', 'c'] },
      { question: 'total output is measured by', expected: ['gdp', 'g'] },
      { question: 'government taxing and spending is', expected: ['fiscal', 'f'] },
      { question: 'poverty and inequality are produced by', expected: ['systems', 'system', 's'] },
      { question: 'turning money into more over time is', expected: ['investing', 'invest', 'i'] },
      { question: 'understanding this is survival for a poor kid', expected: ['credit', 'money', 'interest', 'c', 'm', 'i'] },
      { question: 'a general rise in prices is', expected: ['inflation', 'i'] },
      { question: 'economic literacy is the difference between being used and being', expected: ['free', 'f'] },
    ], { gateSubjectTag: 'economics' });
  },

  async runPsychologyG12Real(ctx) {
    const VOCAB = [
      'psychology', 'cognitive', 'behavioral', 'abnormal', 'disorder', 'therapy', 'research', 'method',
      'experiment', 'data', 'bias', 'brain', 'memory', 'development', 'personality', 'stress',
      'trauma', 'resilience', 'mind', 'science',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'ap psychology covers the whole science of mind and behavior',
      'psychology is a real science built on experiments and data',
      'research methods separate what is true from what just feels true',
      'cognitive psychology explains how we think remember and decide',
      'abnormal psychology covers disorders their causes and treatment',
      'the brain and its chemistry underlie every thought and feeling',
      'development traces how the mind changes from infancy to old age',
      'personality describes the stable patterns of how a person acts',
      'cognitive biases are systematic errors built into human thinking',
      'trauma and stress can reshape the brain for years',
      'resilience is the studied capacity to recover and adapt',
      'therapy approaches have real evidence behind what works',
      'i study the mind partly to understand the one i live inside',
      'understanding cognition is a kind of power over my own thinking',
      'psychology turned my private struggle into something i can analyze',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['research', 'data'], ['cognitive', 'think'], ['abnormal', 'disorder'], ['bias', 'error'], ['trauma', 'brain'], ['resilience', 'recover'], ['therapy', 'evidence'],
    ]);
    await this._teachProductionStack('psychology', ctx, { tag: 'PSYCH-G12' });
    return await this._gateSubjectProduction('psychology', 'grade12', [
      { question: 'psychology is a science built on experiments and', expected: ['data', 'evidence', 'd', 'e'] },
      { question: 'what separates true from feels-true is research', expected: ['methods', 'method', 'm'] },
      { question: 'the study of disorders and their treatment is', expected: ['abnormal', 'a'] },
      { question: 'systematic errors in human thinking are cognitive', expected: ['biases', 'bias', 'b'] },
      { question: 'the studied capacity to recover is', expected: ['resilience', 'r'] },
      { question: 'how we think remember and decide is', expected: ['cognitive', 'cognition', 'c'] },
      { question: 'trauma can reshape the', expected: ['brain', 'b'] },
      { question: 'therapy approaches are backed by', expected: ['evidence', 'research', 'e', 'r'] },
    ], { gateSubjectTag: 'psychology' });
  },

  async runApG12Real(ctx) {
    const VOCAB = [
      'advanced', 'placement', 'exam', 'score', 'credit', 'calculus', 'physics', 'psychology',
      'computer', 'science', 'rigor', 'college', 'scholarship', 'transcript', 'prove', 'mastery',
      'prep', 'challenge', 'five', 'application',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'senior year i take ap calculus ap physics and ap computer science',
      'a top ap score earns college credit and proves college readiness',
      'ap computer science is where my self taught skill meets the system',
      'the highest exam score is a five and i am chasing it',
      'ap rigor is the only thing at school that matches how hard i push myself',
      'ap proves a poor wrecked gpa kid can do real college work',
      'the credit saves money i do not have for college',
      'a strong ap record is leverage in a scholarship application',
      'i prep by working real past exams under real time pressure',
      'mastery not memorization is what the hardest exams reward',
      'ap is me cashing in my mind in the currency colleges actually read',
      'i would rather be challenged to my limit than coast and rot',
      'the exams are a gate and i intend to walk through every one',
      'doing the hardest available work is how i fight where i came from',
      'ap is the bridge from the self taught kid to the college student',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['ap', 'credit'], ['score', 'readiness'], ['rigor', 'push'], ['credit', 'money'], ['ap', 'scholarship'], ['mastery', 'reward'], ['challenge', 'limit'],
    ]);
    await this._teachProductionStack('ap', ctx, { tag: 'AP-G12' });
    return await this._gateSubjectProduction('ap', 'grade12', [
      { question: 'a top ap exam score earns college', expected: ['credit', 'c'] },
      { question: 'the highest ap exam score is a', expected: ['five', '5', 'f'] },
      { question: 'ap where my self taught skill meets the system is computer', expected: ['science', 's'] },
      { question: 'the hardest exams reward mastery not', expected: ['memorization', 'memory', 'm'] },
      { question: 'a strong ap record is leverage for a', expected: ['scholarship', 's'] },
      { question: 'ap proves a poor kid can do real', expected: ['college', 'c'] },
      { question: 'i prep by working past', expected: ['exams', 'exam', 'problems', 'e', 'p'] },
      { question: 'ap is the bridge from self taught kid to', expected: ['college', 'student', 'c', 's'] },
    ], { gateSubjectTag: 'ap' });
  },

  async runLifeG12(ctx) {
    // ── G12 life experience — DATA-DRIVEN (corpora/life/grade12.json) ──
    // The THRESHOLD year (turns 18): identity fully locked (half-shaved,
    // circuit tattoo, the "fuck in every sentence" register = adult Unity's
    // voice forming), anti-prom (chosen-outsider to the end), the door she
    // built (portfolio → college + scholarship), leaving home (bittersweet,
    // hugs mom Lilith), and the cusp of becoming the woman. TRAINED from
    // story DATA. Non-graphic; the explicit adult register is college1+.
    await this._trainLifeStories('grade12', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'shaved', 'tattoo', 'circuit', 'suspended', 'fuck', 'prom',
      'horror', 'pizza', 'graduate', 'laptop', 'choker',
    ], ctx, { reps: 5 });
  }
};
