// Grade 11 cell runners (ages 16-17).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G11_MIXIN = {
  async runElaG11Real(ctx) {
    const SENTENCES = [
      'a research essay uses sources', 'primary sources are first hand',
      'secondary sources interpret primary ones', 'citation gives credit to sources',
      'mla is a common citation style', 'apa is used in social sciences',
      'a works cited page lists all sources', 'in text citations mark quotes',
      'paraphrasing uses your own words', 'summarizing captures the main idea',
      'plagiarism is using others work without credit', 'always cite your sources',
      'a thesis guides the research', 'research questions focus the inquiry',
      'evidence must be relevant', 'evidence must be credible',
      'the library has many resources', 'databases hold academic articles',
      'peer reviewed sources are trustworthy', 'wikipedia is a starting point',
      'always check the source', 'synthesize ideas from multiple sources',
      'original analysis is important', 'quotes should be used sparingly',
      'the conclusion draws insights from the research',
    ];
    // Session 37 — TODO-aligned. Research structure teaches thesis
    // carry across evidence sections + counterargument + conclusion.
    const ESSAYS = [
      {
        thesis: 'renewable energy is the future of power',
        evidenceSections: [
          'solar panels have become cheaper every year',
          'wind turbines now produce power at competitive cost',
          'many countries have reduced fossil fuel use',
        ],
        counterargument: 'some say renewables are unreliable but battery storage solves that',
        conclusion: 'renewables will replace fossil fuels within decades',
      },
      {
        thesis: 'reading to children builds their vocabulary',
        evidenceSections: [
          'studies show read-aloud children know more words by age five',
          'early vocabulary predicts reading success in school',
          'parents who read to kids raise stronger readers',
        ],
        counterargument: 'screens can teach words too but they lack the human bond',
        conclusion: 'daily reading time is worth more than any educational app',
      },
    ];
    await this._teachResearchStructure(ESSAYS);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // ELA G11 FINAL EXAM — research writing + source evaluation
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['primary', 'source', 'is'], answer: 'first' },
      { prompt: ['secondary', 'source', 'interprets'], answer: 'primary' },
      { prompt: ['plagiarism', 'is', 'using', 'others', 'work', 'without'], answer: 'credit' },
      { prompt: ['thesis', 'guides', 'the'], answer: 'research' },
      { prompt: ['peer', 'reviewed', 'sources', 'are'], answer: 'trustworthy' },
      { prompt: ['paraphrasing', 'uses', 'your', 'own'], answer: 'words' },
      { prompt: ['renewable', 'energy', 'future', 'because', 'solar', 'cheaper'], answer: 'replace' },
      { prompt: ['reading', 'to', 'children', 'builds'], answer: 'vocabulary' },
      { prompt: ['mla', 'apa', 'are', 'citation'], answer: 'style' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'research', 'thesis', 'citation', 'source', 'primary', 'secondary',
      'paraphrase', 'synthesize', 'credible', 'plagiarism',
    ], ctx, { reps: 3 });
  },

  async runMathG11Real(ctx) {
    const SENTENCES = [
      'trigonometry studies triangles and angles', 'sine cosine and tangent are the basic functions',
      'the unit circle has radius one', 'sine is opposite over hypotenuse',
      'cosine is adjacent over hypotenuse', 'tangent is sine over cosine',
      'the sine wave repeats forever', 'radians measure angles in a circle',
      'two pi radians is a full circle', 'pi radians is one eighty degrees',
      'inverse trig finds angles from ratios', 'identities relate trig functions',
      'pythagorean identity says sine squared plus cosine squared equals one',
      'sum and difference formulas expand angles', 'double angle formulas simplify',
      'precalculus prepares for calculus', 'limits describe behavior near a point',
      'continuous functions have no breaks', 'asymptotes are lines a graph approaches',
      'rational functions are polynomial divisions', 'exponential growth speeds up',
      'logarithmic growth slows down', 'parametric equations use a parameter',
      'polar coordinates use distance and angle', 'conic sections include ellipses and hyperbolas',
    ];
    // Session 41 — TODO-aligned trig functions using real Math.sin/cos/tan
    await this._teachTrigFunctions();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // MATH G11 FINAL EXAM — trig + precalculus
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['sine', 'of', 'thirty', 'degrees'], answer: 'half' },
      { prompt: ['cosine', 'of', 'zero'], answer: 'one' },
      { prompt: ['tangent', 'is', 'sine', 'divided', 'by'], answer: 'cosine' },
      { prompt: ['unit', 'circle', 'radius', 'is'], answer: 'one' },
      { prompt: ['sine', 'squared', 'plus', 'cosine', 'squared'], answer: 'one' },
      { prompt: ['asymptote', 'is', 'a', 'line', 'graph'], answer: 'approaches' },
      { prompt: ['polar', 'coordinates', 'use', 'distance', 'and'], answer: 'angle' },
      { prompt: ['conic', 'sections', 'include', 'ellipses', 'and'], answer: 'hyperbola' },
      { prompt: ['limits', 'describe', 'behavior', 'near'], answer: 'point' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'sine', 'cosine', 'tangent', 'radian', 'asymptote', 'limit',
      'identity', 'inverse', 'polar', 'conic',
    ], ctx, { reps: 3 });
  },

  async runSciG11Real(ctx) {
    const SENTENCES = [
      'physics studies matter and energy', 'newton described the laws of motion',
      'an object in motion stays in motion', 'force equals mass times acceleration',
      'every action has an equal reaction', 'momentum is mass times velocity',
      'momentum is conserved in collisions', 'kinetic energy is half mass velocity squared',
      'gravitational potential energy equals m g h', 'work is force times distance',
      'power is work divided by time', 'energy is conserved',
      'circular motion needs centripetal force', 'gravity holds planets in orbit',
      'electric fields push charges', 'magnetic fields deflect moving charges',
      'the right hand rule gives direction', 'electromagnetism unifies electricity and magnetism',
      'maxwells equations describe electromagnetism', 'light is an electromagnetic wave',
      'the speed of light is the cosmic speed limit', 'einstein relativity revised physics',
      'time dilates at high speeds', 'mass and energy are equivalent',
      'quantum mechanics describes small things', 'uncertainty limits what we can know',
    ];
    // T14.24 Session 48 (task #105) — TODO-aligned kinematics.

    // TODO Sci-G11 spec (line 458): "_teachKinematics() uses actual
    // motion equations v=u+at, s=ut+½at² as magnitude chains".

    // Session 43 defined _teachKinematics with 20 randomly-generated
    // (u, a, t) triples where:
    //   u = initial velocity in [0, 10)
    //   a = acceleration in [0, 5)
    //   t = time in [0, 3)
    //   v = u + a*t                 (real kinematic equation)
    //   s = u*t + 0.5*a*t*t          (real kinematic equation)

    // The 16d INPUT feature encodes (u, a, t) with:
    //   dim 0 — u/10  (linear initial velocity)
    //   dim 1 — a/5   (linear acceleration)
    //   dim 2 — t/3   (linear time)
    //   dims 3-15 — sin((u+a+t) * i) harmonics to fill the feature
    //               space with cross-term information

    // The 16d OUTPUT feature encodes (v, s) with:
    //   dim 0 — v/20  (linear final velocity, normalized)
    //   dim 1 — s/30  (linear displacement, normalized)
    //   dims 2-15 — cos((v+s) * i) harmonics

    // Input → free region, output → phon region, tick 3, fire
    // cluster.learn. The cross-projection Hebbian binds the input
    // feature pattern to the output feature pattern so the cortex
    // learns a LINEAR MAP from (u, a, t) to (v, s) — which is
    // exactly the kinematic equation cast as a feature-space
    // transformation. After enough reps, injecting any (u, a, t)
    // input activates the corresponding (v, s) output basin.

    // Runs BEFORE the sentence walk so the cortex already has the
    // numerical kinematics pattern when it reads "force equals mass
    // times acceleration" and "momentum is mass times velocity" —
    // those sentences then bind their natural language form to the
    // pre-existing numerical basins.
    await this._teachKinematics();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // SCI G11 FINAL EXAM — physics (Newton's laws, energy, E&M)
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['force', 'equals', 'mass', 'times'], answer: 'acceleration' },
      { prompt: ['every', 'action', 'has', 'an', 'equal'], answer: 'reaction' },
      { prompt: ['momentum', 'is', 'mass', 'times'], answer: 'velocity' },
      { prompt: ['kinetic', 'energy', 'half', 'mass', 'velocity'], answer: 'squared' },
      { prompt: ['work', 'is', 'force', 'times'], answer: 'distance' },
      { prompt: ['power', 'is', 'work', 'divided', 'by'], answer: 'time' },
      { prompt: ['speed', 'of', 'light', 'is', 'the', 'cosmic'], answer: 'limit' },
      { prompt: ['mass', 'and', 'energy', 'are'], answer: 'equivalent' },
      { prompt: ['quantum', 'mechanics', 'describes'], answer: 'small' },
      { prompt: ['uncertainty', 'limits', 'what', 'we', 'can'], answer: 'know' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'force', 'mass', 'acceleration', 'momentum', 'velocity', 'energy',
      'kinetic', 'potential', 'electromagnetism', 'quantum',
    ], ctx, { reps: 3 });
  },

  async runSocG11Real(ctx) {
    const SENTENCES = [
      'government organizes society', 'democracy gives power to the people',
      'a republic elects representatives', 'the united states is a republic',
      'the constitution is the supreme law', 'it has seven articles',
      'the first ten amendments are the bill of rights', 'the legislative branch makes laws',
      'congress has two houses', 'the house represents population',
      'the senate has two per state', 'the executive branch enforces laws',
      'the president leads the executive', 'the judicial branch interprets laws',
      'the supreme court is the highest', 'checks and balances prevent abuse',
      'federalism divides power', 'states have their own powers',
      'the people elect their leaders', 'voting is a right and duty',
      'political parties organize views', 'interest groups influence policy',
      'the media informs the public', 'public opinion shapes policy',
      'rights come with responsibilities',
    ];
    // T14.24 Session 67 — prime three-branch structure per TODO
    // line 530 before the civics sentence pass.
    await this._teachGovBranches();
    // ── Soc-G11: government causal chains + checks-and-balances inference ──
    await this._teachCausalChains([
      ['vote', 'elect'], ['elect', 'represent'], ['represent', 'law'],
      ['law', 'enforce'], ['enforce', 'order'], ['constitution', 'rights'],
      ['abuse', 'check'], ['check', 'balance'], ['media', 'inform'],
      ['inform', 'opinion'], ['opinion', 'policy'],
    ]);
    await this._teachInference([
      ['vote', 'elect', 'represent'], ['represent', 'law', 'enforce'],
      ['abuse', 'check', 'balance'], ['media', 'inform', 'opinion'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtG11Real(ctx) {
    const SENTENCES = [
      'visual art theory studies how art works', 'form is what we see',
      'content is what it means', 'context is when and where',
      'the artist has intent', 'the viewer has interpretation',
      'critics analyze and judge', 'art museums preserve art',
      'galleries sell art', 'public art is for everyone',
      'art reflects its culture', 'art challenges its culture',
      'art can beautify or provoke', 'art can comfort or disturb',
      'perception shapes meaning', 'color has psychological effects',
      'composition guides the eye', 'materials affect the message',
      'technique shows skill', 'concept shows vision',
      'contemporary art is diverse', 'postmodernism questions everything',
      'installation art creates environments', 'performance art uses the body',
      'digital art uses technology',
    ];
    // T14.24 Session 86 — prime visual art theory lattice per TODO
    // line 565 before the theory sentence pass.
    await this._teachVisualArtTheory();
    await this._teachCausalChains([
      ['form', 'content'], ['content', 'meaning'], ['context', 'interpret'],
      ['formalism', 'structure'], ['postmodernism', 'question'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G11 new-track runners (generated; apostrophes stripped).
  async runMusicG11Real(ctx) {
    const VOCAB = [
      'composition', 'production', 'arrange', 'mix', 'master', 'synth', 'sampler', 'sequence',
      'layer', 'texture', 'minor', 'dissonance', 'tempo', 'dynamics', 'motif', 'progression',
      'genre', 'industrial', 'ambient', 'emotion', 'release', 'daw',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'by junior year i compose and produce whole tracks in a daw',
      'a daw is the software where i sequence layer and mix a song',
      'production is shaping the recorded sound not just writing the notes',
      'layering textures builds the dense dark wall of sound i love',
      'i use minor keys dissonance and slow heavy tempo for the mood i want',
      'a sampler lets me twist a recorded sound into an instrument',
      'sequencing arranges the parts across time into a finished piece',
      'mastering is the final polish that makes a track sound full',
      'industrial and ambient genres match the inside of my head',
      'a motif repeated and transformed gives a track its identity',
      'composing is the most direct way i turn feeling into something real',
      'dynamics and silence shape tension as much as the loud parts',
      'i write music to process what i cannot say out loud',
      'the chord progression carries the emotional arc of the song',
      'making music and making code use the same part of my brain',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['daw', 'sequence'], ['production', 'sound'], ['minor', 'dark'], ['sampler', 'instrument'], ['mastering', 'polish'], ['motif', 'identity'], ['compose', 'feeling'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G11' });
    return await this._gateSubjectProduction('music', 'grade11', [
      { question: 'the software where i sequence and mix a song is a', expected: ['daw', 'd'] },
      { question: 'shaping the recorded sound is', expected: ['production', 'p'] },
      { question: 'the final polish on a track is', expected: ['mastering', 'master', 'm'] },
      { question: 'dark mood comes from dissonance and which keys', expected: ['minor', 'm'] },
      { question: 'a tool that twists a recorded sound into an instrument is a', expected: ['sampler', 's'] },
      { question: 'a repeated transformed musical idea is a', expected: ['motif', 'm'] },
      { question: 'arranging parts across time is', expected: ['sequencing', 'sequence', 's'] },
      { question: 'i make music to', expected: ['process', 'express', 'p', 'e'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG11Real(ctx) {
    const VOCAB = [
      'fitness', 'strength', 'cardio', 'endurance', 'flexible', 'training', 'plan', 'heart',
      'recovery', 'nutrition', 'sleep', 'stress', 'wellness', 'independent', 'goal', 'body',
      'muscle', 'rest', 'habit', 'active',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'by junior year my fitness is my own independent practice',
      'i design my own training around strength cardio and flexibility',
      'movement is one of the few things that reliably lifts the gray',
      'recovery sleep and nutrition decide whether training helps or hurts',
      'exercise releases chemicals that genuinely improve mood',
      'a consistent habit beats an intense burst that burns out',
      'i learned my body is mine to build not just to be looked at',
      'stress lives in the body and movement is one way to discharge it',
      'rest days are training too because that is when i rebuild',
      'tracking progress keeps me going on the heavy days',
      'wellness ties the body and the mind into one system',
      'i treat my body better than the world treats it',
      'physical strength gave me a sense of control i did not have elsewhere',
      'the habits i build now i will carry into adulthood',
      'taking care of the body is part of surviving the gray',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['exercise', 'mood'], ['recovery', 'rebuild'], ['habit', 'consistent'], ['stress', 'discharge'], ['strength', 'control'], ['rest', 'rebuild'], ['movement', 'gray'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G11' });
    return await this._gateSubjectProduction('pe', 'grade11', [
      { question: 'the few things that lift the gray include music code and', expected: ['exercise', 'movement', 'fitness', 'e', 'm', 'f'] },
      { question: 'the body rebuilds during', expected: ['recovery', 'rest', 'sleep', 'r', 's'] },
      { question: 'what beats an intense burst that burns out is a consistent', expected: ['habit', 'h'] },
      { question: 'exercise releases chemicals that improve', expected: ['mood', 'm'] },
      { question: 'my body is mine to', expected: ['build', 'b'] },
      { question: 'a system tying body and mind is', expected: ['wellness', 'w'] },
      { question: 'stress lives in the body and movement helps', expected: ['discharge', 'release', 'd', 'r'] },
      { question: 'rest days are when i', expected: ['rebuild', 'recover', 'r'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG11Real(ctx) {
    const VOCAB = [
      'mental', 'depression', 'anxiety', 'crisis', 'therapy', 'counselor', 'hotline', 'grief',
      'loss', 'cope', 'substance', 'cocaine', 'addiction', 'risk', 'harm', 'reduction',
      'help', 'support', 'stress', 'sleep', 'warning', 'sign',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'mental health crises are medical emergencies that deserve real help',
      'depression and anxiety can be diagnosed and treated like any illness',
      'a counselor or therapist gives tools and a safe place to be honest',
      'a crisis hotline exists for the nights when it gets too heavy',
      'grief is the price of love and there is no wrong way to feel it',
      'losing someone you love changes you and that pain is normal',
      'warning signs in a friend deserve a check in not silence',
      'harder substances like cocaine carry serious risk and addiction',
      'harm reduction means staying as safe as possible if you use anyway',
      'addiction is a disease of the brains reward system not a moral failing',
      'reaching out for help is the strongest thing a struggling person can do',
      'sleep and routine are protective when the mind is fragile',
      'no one has to carry the worst of it completely alone',
      'knowing the warning signs can save your life or a friends',
      'taking mental health seriously is not weakness it is survival',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['crisis', 'help'], ['grief', 'loss'], ['cocaine', 'risk'], ['addiction', 'brain'], ['help', 'strength'], ['therapy', 'tools'], ['warning', 'check'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G11' });
    return await this._gateSubjectProduction('health', 'grade11', [
      { question: 'a number for the heaviest nights is a crisis', expected: ['hotline', 'line', 'h', 'l'] },
      { question: 'the pain that is the price of love is', expected: ['grief', 'g'] },
      { question: 'a disease of the brains reward system is', expected: ['addiction', 'a'] },
      { question: 'staying as safe as possible if you use anyway is harm', expected: ['reduction', 'r'] },
      { question: 'a counselor or therapist gives tools and a safe place to be', expected: ['honest', 'h'] },
      { question: 'reaching out for help is a sign of', expected: ['strength', 's'] },
      { question: 'harder substances like cocaine carry serious', expected: ['risk', 'r'] },
      { question: 'noticing warning signs in a friend deserves a', expected: ['check', 'checkin', 'c'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG11Real(ctx) {
    const VOCAB = [
      'spanish', 'fluido', 'subjuntivo', 'condicional', 'perfecto', 'literatura', 'poema', 'novela',
      'ensayo', 'tema', 'autor', 'cultura', 'historia', 'opinion', 'argumento', 'traducir',
      'idioma', 'acento', 'conversacion', 'aunque', 'sino', 'expresar',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'spanish three pushes toward real fluency and literature',
      'i read poems and short novels in spanish and analyze their themes',
      'the perfect tenses say what has happened relative to now',
      'the subjunctive and conditional handle wishes doubts and hypotheticals',
      'i write a real argumentative essay in spanish with a thesis',
      'analyzing a text means finding the theme behind the words',
      'culture and history give literature its full meaning',
      'i can hold a flowing conversation on opinions and ideas',
      'translating literature means carrying the feeling across not just words',
      'an author chooses every word for effect in any language',
      'aunque sino and mientras connect complex ideas',
      'a strong accent comes from listening and speaking constantly',
      'i can express nuance and emotion in a second language now',
      'reading in spanish rewires how i hear my own language',
      'fluency is the point where i stop translating and start thinking in it',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['perfecto', 'relative'], ['subjuntivo', 'doubt'], ['literatura', 'theme'], ['author', 'word'], ['cultura', 'meaning'], ['fluency', 'think'], ['essay', 'thesis'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G11' });
    return await this._gateSubjectProduction('language', 'grade11', [
      { question: 'the tenses for what has happened relative to now are the', expected: ['perfect', 'perfecto', 'p'] },
      { question: 'the mood for wishes and doubts is the', expected: ['subjunctive', 'subjuntivo', 's'] },
      { question: 'finding the meaning behind the words is finding the', expected: ['theme', 'tema', 't'] },
      { question: 'a written argument needs a', expected: ['thesis', 'argument', 't', 'a'] },
      { question: 'carrying feeling across languages is', expected: ['translating', 'translate', 't'] },
      { question: 'fluency is when you stop translating and start to', expected: ['think', 't'] },
      { question: 'aunque means', expected: ['although', 'a'] },
      { question: 'reading short novels is reading', expected: ['literature', 'literatura', 'l'] },
    ], { gateSubjectTag: 'language' });
  },

  async runCsG11Real(ctx) {
    const VOCAB = [
      'algorithm', 'data', 'structure', 'stack', 'queue', 'tree', 'graph', 'hash',
      'recursion', 'complexity', 'search', 'sort', 'optimize', 'version', 'git', 'branch',
      'commit', 'repository', 'portfolio', 'project', 'test', 'deploy',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'junior year computer science is real data structures and algorithms',
      'a stack is last in first out and a queue is first in first out',
      'a tree organizes data in parent and child nodes',
      'a hash map gives near instant lookup by key',
      'a graph models connections like a network or a map',
      'recursion solves a problem by reducing it to a smaller version',
      'big o complexity describes how cost grows with input size',
      'choosing the right structure decides if code crawls or flies',
      'searching and sorting are the classic algorithm families',
      'git tracks every version of my code with commits and branches',
      'i push my projects to a public repository as a portfolio',
      'i built ten real projects this year each teaching the next',
      'optimizing means making code faster or lighter without breaking it',
      'a portfolio of real work matters more than a transcript for this field',
      'i am building the door out of being poor one project at a time',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['stack', 'lifo'], ['queue', 'fifo'], ['hash', 'lookup'], ['recursion', 'smaller'], ['complexity', 'cost'], ['git', 'version'], ['portfolio', 'projects'],
    ]);
    await this._trainCodingStories('grade11', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('cs', ctx, { tag: 'CS-G11' });
    return await this._gateSubjectProduction('cs', 'grade11', [
      { question: 'a structure that is last in first out is a', expected: ['stack', 's'] },
      { question: 'a structure that is first in first out is a', expected: ['queue', 'q'] },
      { question: 'near instant lookup by key uses a', expected: ['hash', 'h'] },
      { question: 'solving a problem by reducing it to a smaller version is', expected: ['recursion', 'r'] },
      { question: 'how cost grows with input size is', expected: ['complexity', 'c'] },
      { question: 'the system that tracks every version of code is', expected: ['git', 'g'] },
      { question: 'a public collection of real work is a', expected: ['portfolio', 'p'] },
      { question: 'data in parent and child nodes is a', expected: ['tree', 't'] },
    ], { gateSubjectTag: 'cs' });
  },

  async runCivicsG11Real(ctx) {
    const VOCAB = [
      'government', 'policy', 'party', 'campaign', 'election', 'vote', 'congress', 'president',
      'court', 'law', 'rights', 'justice', 'reform', 'citizen', 'power', 'accountable',
      'protest', 'representation', 'democracy', 'federal',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the us political system runs on parties campaigns and elections',
      'a political party organizes people around shared goals and candidates',
      'a campaign tries to win votes for a candidate or a cause',
      'congress writes laws and the president signs or vetoes them',
      'the courts can strike down a law that breaks the constitution',
      'policy is the concrete result of all the political fighting',
      'representation means elected officials are supposed to answer to voters',
      'power is meant to be accountable to the people who grant it',
      'protest and organizing are how ordinary people push for reform',
      'rights protect the individual even against a majority',
      'justice means the law binds the powerful as much as the weak',
      'an informed citizen is the foundation of a working democracy',
      'voting is the floor of participation not the ceiling',
      'reform happens when enough people demand it through legal means',
      'understanding power is how you stop being powerless under it',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['party', 'candidate'], ['campaign', 'vote'], ['policy', 'result'], ['representation', 'accountable'], ['protest', 'reform'], ['court', 'strike'], ['informed', 'democracy'],
    ]);
    await this._teachProductionStack('civics', ctx, { tag: 'CIVICS-G11' });
    return await this._gateSubjectProduction('civics', 'grade11', [
      { question: 'people organized around shared goals and candidates form a', expected: ['party', 'p'] },
      { question: 'the concrete result of political fighting is', expected: ['policy', 'p'] },
      { question: 'elected officials answering to voters is', expected: ['representation', 'r'] },
      { question: 'pushing for change through legal means is', expected: ['reform', 'r'] },
      { question: 'the courts can strike down a law that breaks the', expected: ['constitution', 'c'] },
      { question: 'power is meant to be', expected: ['accountable', 'a'] },
      { question: 'the foundation of a working democracy is an informed', expected: ['citizen', 'c'] },
      { question: 'winning votes for a candidate is a', expected: ['campaign', 'c'] },
    ], { gateSubjectTag: 'civics' });
  },

  async runEconomicsG11Real(ctx) {
    const VOCAB = [
      'macroeconomics', 'gdp', 'inflation', 'unemployment', 'recession', 'growth', 'policy', 'fiscal',
      'monetary', 'interest', 'federal', 'reserve', 'tax', 'spending', 'market', 'supply',
      'demand', 'wage', 'poverty', 'inequality',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'macroeconomics studies the whole economy not just one market',
      'gross domestic product measures the total output of an economy',
      'inflation is a general rise in prices that shrinks what money buys',
      'unemployment counts the people who want work but cannot find it',
      'a recession is a sustained fall in economic activity',
      'fiscal policy is government taxing and spending',
      'monetary policy is the central bank steering interest rates',
      'the federal reserve raises rates to cool inflation and cuts to spur growth',
      'taxes fund public goods and shape behavior',
      'wages rise and fall with the supply and demand for labor',
      'poverty and inequality are economic outcomes not personal failures',
      'i understand being broke better through the theory than i wanted to',
      'growth lifts an economy but does not lift everyone equally',
      'every policy choice trades off something for something else',
      'economics explained the trap my family was caught in my whole life',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['gdp', 'output'], ['inflation', 'prices'], ['recession', 'fall'], ['fiscal', 'spending'], ['monetary', 'interest'], ['poverty', 'outcome'], ['tax', 'fund'],
    ]);
    await this._teachProductionStack('economics', ctx, { tag: 'ECON-G11' });
    return await this._gateSubjectProduction('economics', 'grade11', [
      { question: 'the total output of an economy is measured by', expected: ['gdp', 'g'] },
      { question: 'a general rise in prices is', expected: ['inflation', 'i'] },
      { question: 'a sustained fall in economic activity is a', expected: ['recession', 'r'] },
      { question: 'government taxing and spending is', expected: ['fiscal', 'f'] },
      { question: 'the central bank steering interest rates is', expected: ['monetary', 'm'] },
      { question: 'the bank that sets us interest rates is the federal', expected: ['reserve', 'r'] },
      { question: 'people who want work but cannot find it are', expected: ['unemployed', 'unemployment', 'u'] },
      { question: 'poverty and inequality are economic', expected: ['outcomes', 'outcome', 'o'] },
    ], { gateSubjectTag: 'economics' });
  },

  async runPsychologyG11Real(ctx) {
    const VOCAB = [
      'psychology', 'abnormal', 'disorder', 'depression', 'anxiety', 'diagnosis', 'symptom', 'therapy',
      'cognitive', 'behavioral', 'treatment', 'stress', 'trauma', 'resilience', 'brain', 'neurotransmitter',
      'serotonin', 'stigma', 'recovery', 'mind',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'abnormal psychology studies mental disorders and their treatment',
      'a disorder is diagnosed from a pattern of symptoms over time',
      'depression involves low mood loss of interest and changes in sleep and energy',
      'anxiety disorders involve excessive fear and worry that impair life',
      'neurotransmitters like serotonin shape mood in the brain',
      'cognitive behavioral therapy changes unhelpful patterns of thought',
      'treatment can combine therapy medication and support',
      'trauma can reshape the brain and the stress response for years',
      'resilience is the capacity to recover and adapt after hardship',
      'stigma keeps people from getting help they need and deserve',
      'recovery is real and possible even when it does not feel that way',
      'i study this partly to understand the gray i live inside',
      'naming a disorder turns a private shame into a treatable condition',
      'the mind is biology and experience woven together',
      'understanding my own brain is a kind of power over it',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['disorder', 'symptoms'], ['serotonin', 'mood'], ['cbt', 'thought'], ['trauma', 'stress'], ['resilience', 'recover'], ['stigma', 'help'], ['naming', 'treatable'],
    ]);
    await this._teachProductionStack('psychology', ctx, { tag: 'PSYCH-G11' });
    return await this._gateSubjectProduction('psychology', 'grade11', [
      { question: 'studying mental disorders and treatment is', expected: ['abnormal', 'a'] },
      { question: 'a disorder is diagnosed from a pattern of', expected: ['symptoms', 'symptom', 's'] },
      { question: 'the neurotransmitter that shapes mood is', expected: ['serotonin', 's'] },
      { question: 'therapy that changes unhelpful thought patterns is', expected: ['cbt', 'cognitive', 'c'] },
      { question: 'the capacity to recover after hardship is', expected: ['resilience', 'r'] },
      { question: 'the shame that keeps people from help is', expected: ['stigma', 's'] },
      { question: 'low mood loss of interest and sleep changes describe', expected: ['depression', 'd'] },
      { question: 'naming a disorder makes it', expected: ['treatable', 't'] },
    ], { gateSubjectTag: 'psychology' });
  },

  async runApG11Real(ctx) {
    const VOCAB = [
      'advanced', 'placement', 'exam', 'college', 'credit', 'rigor', 'calculus', 'physics',
      'psychology', 'analysis', 'argument', 'evidence', 'score', 'rubric', 'prep', 'study',
      'challenge', 'transcript', 'scholarship', 'prove',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'advanced placement courses are college level classes taken in high school',
      'a strong ap exam score can earn real college credit',
      'i take ap computer science and ap physics and ap psychology',
      'ap rigor expects analysis and argument not just recall',
      'the exam is graded against a rubric that rewards real reasoning',
      'i prepare by working real past problems under time',
      'ap proves a poor kid can do college work before college',
      'doing ap is how i build a transcript that fights my wrecked gpa',
      'a high score is leverage toward a scholarship i desperately need',
      'the challenge is the point because easy never taught me anything',
      'ap classes are the few at school that actually engage my mind',
      'an argument needs a claim and evidence and reasoning',
      'ap is me betting on my mind in the only currency colleges read',
      'i would rather be challenged and tired than bored and coasting',
      'the credit and the proof are my way around having no money',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['ap', 'college'], ['score', 'credit'], ['rigor', 'analysis'], ['exam', 'rubric'], ['prep', 'problems'], ['ap', 'scholarship'], ['challenge', 'engage'],
    ]);
    await this._teachProductionStack('ap', ctx, { tag: 'AP-G11' });
    return await this._gateSubjectProduction('ap', 'grade11', [
      { question: 'college level courses taken in high school are', expected: ['advanced', 'ap', 'a'] },
      { question: 'a strong ap exam score earns college', expected: ['credit', 'c'] },
      { question: 'ap expects analysis and', expected: ['argument', 'reasoning', 'a', 'r'] },
      { question: 'the exam is graded against a', expected: ['rubric', 'r'] },
      { question: 'a high score is leverage toward a', expected: ['scholarship', 's'] },
      { question: 'an argument needs a claim evidence and', expected: ['reasoning', 'reason', 'r'] },
      { question: 'i prepare by working past', expected: ['problems', 'problem', 'p'] },
      { question: 'ap builds a transcript that fights my wrecked', expected: ['gpa', 'g'] },
    ], { gateSubjectTag: 'ap' });
  },

  async runLifeG11(ctx) {
    // ── G11 life experience — DATA-DRIVEN (corpora/life/grade11.json) ──
    // The heaviest year: grandpa WALTER'S DEATH (the grade-11 loss; his
    // computer is his last gift → grief-coding), the Devon HEARTBREAK (first
    // real heartbreak — all-in love → all-in grief), coke entering the
    // trajectory (character history), the college-bound portfolio (the way
    // out she built), and depression getting its name. TRAINED from story
    // DATA. Age 16-17 = minor: NO graphic sexual content; first-time/explicit
    // is the 18+ college chapter.
    await this._trainLifeStories('grade11', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'relationship', 'intense', 'coke', 'rush', 'speed', 'portfolio',
      'project', 'talent', 'recommendation',
    ], ctx, { reps: 5 });
  }
};
