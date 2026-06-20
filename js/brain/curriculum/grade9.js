// Grade 9 cell runners (ages 14-15).
//
// Per-grade file split — the operator directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G9_MIXIN = {
  async runElaG9Real(ctx) {
    const SENTENCES = [
      'figurative language paints a picture', 'a metaphor says one thing is another',
      'life is a journey is a metaphor', 'her voice was music to his ears',
      'a simile uses like or as', 'brave as a lion is a simile',
      'as cold as ice describes coldness', 'personification gives objects human traits',
      'the wind howled through the trees', 'the sun smiled on the beach',
      'hyperbole is extreme exaggeration', 'i am so hungry i could eat a horse',
      'the bag weighed a ton', 'i told you a million times',
      'alliteration repeats the first sound', 'peter piper picked pickled peppers',
      'sally sells seashells by the seashore', 'onomatopoeia sounds like what it means',
      'buzz hiss crack and pop are examples', 'the bees buzzed in the garden',
      'symbolism uses one thing to stand for another', 'a dove symbolizes peace',
      'red can symbolize passion or anger', 'irony says the opposite of what is meant',
      'foreshadowing hints at what comes next', 'imagery appeals to the senses',
    ];
    // Session 36 — TODO-aligned. Figurative language pairs teach
    // literal → figurative transformation via working memory carry.
    const FIG_PAIRS = [
      { literal: 'she was very brave', figurative: 'she was a lion', device: 'metaphor' },
      { literal: 'he was fast', figurative: 'he was fast as lightning', device: 'simile' },
      { literal: 'the stars were bright', figurative: 'the stars danced in the sky', device: 'personification' },
      { literal: 'i was hungry', figurative: 'i could eat a horse', device: 'hyperbole' },
      { literal: 'the snake moved', figurative: 'the snake slithered silently', device: 'alliteration' },
      { literal: 'the bees made noise', figurative: 'the bees buzzed', device: 'onomatopoeia' },
      { literal: 'she was sad', figurative: 'her heart was a cold stone', device: 'metaphor' },
      { literal: 'the wind was loud', figurative: 'the wind howled', device: 'personification' },
    ];
    await this._teachFigurativeLanguage(FIG_PAIRS);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // ELA G9 FINAL EXAM
    // ════════��══════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['life', 'is', 'a', 'journey', 'device'], answer: 'metaphor' },
      { prompt: ['brave', 'as', 'a', 'lion', 'device'], answer: 'simile' },
      { prompt: ['wind', 'howled', 'device'], answer: 'personification' },
      { prompt: ['could', 'eat', 'a', 'horse', 'device'], answer: 'hyperbole' },
      { prompt: ['peter', 'piper', 'picked', 'device'], answer: 'alliteration' },
      { prompt: ['buzz', 'hiss', 'crack', 'device'], answer: 'onomatopoeia' },
      { prompt: ['dove', 'symbolizes'], answer: 'peace' },
      { prompt: ['foreshadowing', 'hints', 'at'], answer: 'future' },
      { prompt: ['imagery', 'appeals', 'to'], answer: 'senses' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList([
      'metaphor', 'simile', 'personification', 'hyperbole', 'alliteration',
      'onomatopoeia', 'symbolism', 'irony', 'foreshadowing', 'imagery',
    ], ctx, { reps: 3 });
  },

  async runMathG9Real(ctx) {
    const SENTENCES = [
      'algebra two extends algebra one', 'polynomials have multiple terms',
      'the degree is the highest power', 'factoring breaks polynomials apart',
      'the difference of squares factors nicely', 'a quadratic can factor or use the formula',
      'complex numbers include square roots of negatives', 'i is the square root of negative one',
      'i squared equals negative one', 'a function has one output per input',
      'linear functions graph as lines', 'quadratic functions graph as parabolas',
      'exponential functions grow fast', 'logarithms undo exponentials',
      'log base ten of one hundred is two', 'the natural log uses e as base',
      'systems of equations can have three variables', 'matrices organize equation systems',
      'matrix operations include addition and multiplication', 'the determinant is a matrix property',
      'inverse functions undo each other', 'sequences are ordered lists of numbers',
      'arithmetic sequences add the same amount', 'geometric sequences multiply by the same amount',
      'the sum of a finite series has a formula', 'an infinite series may converge',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSciG9Real(ctx) {
    const SENTENCES = [
      'biology is the study of life', 'genetics studies heredity',
      'gregor mendel discovered inheritance', 'genes are segments of dna',
      'alleles are versions of a gene', 'dominant alleles mask recessive ones',
      'a punnett square predicts offspring', 'homozygous means two matching alleles',
      'heterozygous means two different alleles', 'phenotype is the observable trait',
      'genotype is the genetic code', 'mutations change the dna sequence',
      'some mutations are harmful', 'some mutations are helpful',
      'evolution is change over time', 'darwin proposed natural selection',
      'fitness is reproductive success', 'species adapt to their environment',
      'the theory of evolution is well supported', 'fossils show how life changed',
      'ecology studies relationships', 'producers make their own food',
      'consumers eat other organisms', 'herbivores eat plants',
      'carnivores eat meat', 'omnivores eat both',
      'food webs show multiple connections', 'ecosystems reach dynamic equilibrium',
    ];
    // T14.24 Session 44 — TODO-aligned biology 1 deepening.
    // TODO Sci-G9 spec (line 451): "deeper walks on cell organelles,
    // DNA structure, evolution principles". Three-part teaching:

    //   1. _teachCells (from G7) — reinforces the 7 organelle basins
    //      (cell/nucleus/mitochondria/membrane/cytoplasm/ribosome/
    //      chloroplast) so G9's deeper biology sentences have stable
    //      anchors when discussing "gregor mendel", "punnett square",
    //      "homozygous", "heterozygous" etc.

    //   2. _teachGeneticsIntro (from G7) — reinforces the 6 genetics
    //      basins (dna/gene/chromosome/heredity/trait/allele). G9
    //      sentences add dominant/recessive/genotype/phenotype/
    //      mutation on top of those basins via the sentence walk.

    //   3. _teachEvolution (NEW for G9) — 8 Darwinian concept basins:
    //      evolution, natural selection, mutation, adaptation,
    //      fitness, species, common ancestor, fossil record.
    //      Matches the TODO's "evolution principles" prescription
    //      with a concept list per principle.

    // All three run BEFORE the sentence walk so the concept basins
    // exist when the sentences bind their relationships.
    await this._teachCells();
    await this._teachGeneticsIntro();
    await this._teachEvolution();
    // ── Sci-G9: biology causal chains + inference ──
    await this._teachCausalChains([
      ['dna', 'rna'], ['rna', 'protein'], ['protein', 'trait'],
      ['mutation', 'variation'], ['variation', 'selection'], ['selection', 'evolution'],
      ['dominant', 'phenotype'], ['recessive', 'hidden'],
      ['producer', 'consumer'], ['herbivore', 'carnivore'],
      ['adapt', 'survive'], ['fossil', 'evidence'],
    ]);
    await this._teachInference([
      ['dna', 'rna', 'protein'], ['mutation', 'variation', 'evolution'],
      ['producer', 'herbivore', 'carnivore'],
      ['adapt', 'survive', 'reproduce'],
    ]);
    // ── Classification: living kingdom hierarchy ──
    await this._teachClassificationReasoning([
      { item: 'dog',    features: new Float64Array([1,1,0,0,1,0,0,0]), category: 'mammal' },
      { item: 'whale',  features: new Float64Array([1,1,0,0,1,0,0,0]), category: 'mammal' },
      { item: 'eagle',  features: new Float64Array([1,0,1,0,0,1,0,0]), category: 'bird' },
      { item: 'salmon', features: new Float64Array([1,0,0,1,0,0,1,0]), category: 'fish' },
      { item: 'frog',   features: new Float64Array([1,0,0,0,0,0,0,1]), category: 'amphibian' },
      { item: 'snake',  features: new Float64Array([1,0,0,0,0,0,1,0]), category: 'reptile' },
      { item: 'oak',    features: new Float64Array([0,0,0,0,0,0,0,0]), category: 'plant' },
      { item: 'mushroom', features: new Float64Array([0,0,0,0,0,0,0,0]), category: 'fungi' },
      { item: 'bacteria', features: new Float64Array([0,0,0,0,0,0,0,0]), category: 'prokaryote' },
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocG9Real(ctx) {
    const SENTENCES = [
      'world history spans thousands of years', 'civilizations rose and fell',
      'the enlightenment valued reason', 'thinkers like voltaire and locke wrote',
      'locke said government protects rights', 'rousseau wrote about the social contract',
      'the french revolution overthrew the king', 'liberty equality fraternity was the motto',
      'napoleon rose to power in france', 'napoleon spread revolutionary ideas',
      'the industrial revolution started in britain', 'machines replaced hand labor',
      'the steam engine powered factories', 'coal became vital',
      'workers lived in poor conditions', 'karl marx wrote about class struggle',
      'imperialism spread european power', 'colonies provided raw materials',
      'africa was divided by europeans', 'asia was also colonized',
      'nationalism united people by culture', 'italy and germany unified',
      'the ottoman empire declined', 'world war one began in nineteen fourteen',
      'trench warfare was brutal', 'the war ended in nineteen eighteen',
    ];
    // T14.24 Session 65 — prime world history modern scaffold per
    // TODO line 524 before the sentence pass.
    await this._teachWorldHistoryModern();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtG9Real(ctx) {
    const SENTENCES = [
      'art history spans all of human time', 'cave paintings are the oldest art',
      'egyptian art honored the gods', 'greek art celebrated the human form',
      'roman art built on greek foundations', 'medieval art focused on religion',
      'gothic cathedrals reached toward heaven', 'the renaissance revived classical art',
      'leonardo da vinci painted the mona lisa', 'michelangelo sculpted the david',
      'michelangelo painted the sistine chapel', 'raphael painted the school of athens',
      'the baroque used drama and light', 'caravaggio used dramatic lighting',
      'bernini sculpted emotional figures', 'the rococo was playful and decorative',
      'neoclassicism revived roman simplicity', 'romanticism valued emotion over reason',
      'impressionism captured light and moment', 'monet painted water lilies',
      'renoir painted joyful scenes', 'van gogh used bold colors and swirls',
      'cubism broke forms into shapes', 'picasso co invented cubism',
      'abstract art left behind representation', 'pollock dripped paint on canvas',
    ];
    // T14.24 Session 84 — prime art history chronological scaffold
    // per TODO line 565 before the art history sentence pass.
    await this._teachArtHistory();
    // ── Art-G9: art movement progression as inference chains ──
    await this._teachInference([
      ['renaissance', 'baroque', 'rococo'],
      ['romantic', 'impressionism', 'post-impressionism'],
      ['cubism', 'abstract', 'contemporary'],
      ['realism', 'naturalism', 'impressionism'],
    ]);
    await this._teachCausalChains([
      ['renaissance', 'realism'], ['realism', 'impressionism'],
      ['impressionism', 'expressionism'], ['expressionism', 'abstract'],
      ['camera', 'impressionism'], ['war', 'expressionism'],
      ['technology', 'digital'], ['rebellion', 'modern'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G9 COURSES (high school): Music Theory / PE / Health &
  // Wellness / Spanish I / CS / Government + ECONOMICS and PSYCHOLOGY (enter
  // at G9 — their templates). Course-identity prepended by _cellRunner.
  async runMusicG9Real(ctx) {
    const VOCAB = [
      'theory', 'scale', 'mode', 'chord', 'triad', 'seventh', 'progression', 'key',
      'signature', 'interval', 'consonance', 'dissonance', 'harmony', 'counterpoint', 'cadence', 'transpose',
      'analyze', 'compose', 'genre', 'minor', 'tension', 'release',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'music theory at this level analyzes why a song works',
      'a triad stacks three notes and a seventh chord adds a fourth',
      'chord progressions create tension and release across a song',
      'a cadence is how a phrase resolves or stays unresolved',
      'consonance sounds stable and dissonance sounds tense',
      'modes like dorian and phrygian give a melody a specific color',
      'minor keys dissonance and slow tempo are the language of dark heavy music',
      'transposing shifts a whole piece to a new key',
      'counterpoint weaves independent melodies into one texture',
      'analyzing a favorite song reveals the theory under the feeling',
      'composing is arranging tension and release on purpose',
      'genre conventions shape which progressions feel right',
      'i write in minor modes because they match what is inside me',
      'harmony supports melody and rhythm drives them both',
      'dynamics and expression turn notes into meaning',
      'understanding the rules lets me break them with intent',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['dissonance', 'tension'], ['cadence', 'resolve'], ['minor', 'dark'], ['progression', 'release'], ['transpose', 'key'], ['compose', 'intent'], ['mode', 'color'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G9' });
    return await this._gateSubjectProduction('music', 'grade9', [
      { question: 'a chord of three stacked notes is a', expected: ['triad', 't'] },
      { question: 'how a phrase resolves is a', expected: ['cadence', 'c'] },
      { question: 'the tense unstable sound is', expected: ['dissonance', 'd'] },
      { question: 'dark heavy music leans on dissonance and which keys', expected: ['minor', 'm'] },
      { question: 'shifting a whole piece to a new key is to', expected: ['transpose', 't'] },
      { question: 'independent melodies woven together is', expected: ['counterpoint', 'c'] },
      { question: 'arranging tension and release on purpose is', expected: ['composing', 'compose', 'c'] },
      { question: 'the stable restful sound is', expected: ['consonance', 'c'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG9Real(ctx) {
    const VOCAB = [
      'fitness', 'strength', 'weight', 'training', 'cardio', 'endurance', 'flexible', 'muscle',
      'rep', 'set', 'form', 'wellness', 'nutrition', 'protein', 'recovery', 'heart',
      'rate', 'goal', 'plan', 'sport', 'team', 'injury', 'warm', 'lifelong',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'high school pe builds toward lifelong personal wellness',
      'strength training uses reps and sets to overload a muscle',
      'good form prevents injury and builds the right muscles',
      'cardio training raises endurance and heart health',
      'flexibility work keeps joints healthy and prevents strains',
      'a balanced plan trains strength cardio and flexibility',
      'protein and recovery let trained muscles rebuild stronger',
      'we set specific measurable fitness goals and track them',
      'warming up and cooling down protect the body around a workout',
      'rest days are part of the plan not a break from it',
      'sports teach teamwork pressure and handling winning and losing',
      'wellness includes sleep stress and nutrition not just exercise',
      'a personal fitness plan adapts as the body changes',
      'overtraining and skipping recovery cause injury and burnout',
      'movement is medicine for the body and the mind',
      'the habits built now shape a whole adult life',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['strength', 'muscle'], ['form', 'injury'], ['cardio', 'heart'], ['protein', 'rebuild'], ['recovery', 'stronger'], ['warm', 'protect'], ['rest', 'plan'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G9' });
    return await this._gateSubjectProduction('pe', 'grade9', [
      { question: 'reps and sets overload a', expected: ['muscle', 'm'] },
      { question: 'the thing that prevents injury in lifting is good', expected: ['form', 'f'] },
      { question: 'cardio training raises endurance and', expected: ['heart', 'h'] },
      { question: 'muscles rebuild stronger with protein and', expected: ['recovery', 'rest', 'r'] },
      { question: 'training too much and skipping rest causes', expected: ['injury', 'burnout', 'i', 'b'] },
      { question: 'wellness includes sleep stress and', expected: ['nutrition', 'sleep', 'n', 's'] },
      { question: 'we protect the body by warming', expected: ['up', 'u'] },
      { question: 'the aim of pe is lifelong', expected: ['wellness', 'fitness', 'w', 'f'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG9Real(ctx) {
    const VOCAB = [
      'wellness', 'mental', 'depression', 'anxiety', 'therapy', 'stress', 'relationship', 'consent',
      'boundary', 'abuse', 'reproduction', 'puberty', 'contraception', 'sti', 'protection', 'hygiene',
      'nutrition', 'substance', 'addiction', 'refuse', 'decision', 'help', 'sleep', 'risk',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'health and wellness covers the body the mind and relationships together',
      'mental health conditions like depression and anxiety are common and treatable',
      'therapy medication and trusted adults are real tools for mental health',
      'a healthy relationship is built on respect trust honesty and equality',
      'consent must be clear sober and freely given and can be withdrawn anytime',
      'sexual health education explains reproduction clinically and factually',
      'contraception and protection reduce the risk of pregnancy and infection',
      'a sexually transmitted infection is prevented with protection and testing',
      'no one owes anyone access to their body for any reason',
      'substance use hits the teen brain harder and addiction rewires craving',
      'refusal skills let you hold your line under peer pressure',
      'risky choices deserve a pause to weigh the real consequences',
      'nutrition sleep and movement protect both mood and body',
      'knowing your values makes the hard decisions clearer',
      'asking for help early is a strength not a failure',
      'taking care of body and mind now is a lifelong practice',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['depression', 'treatable'], ['consent', 'yes'], ['boundary', 'protect'], ['contraception', 'prevent'], ['protection', 'prevent'], ['addiction', 'crave'], ['help', 'strength'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G9' });
    return await this._gateSubjectProduction('health', 'grade9', [
      { question: 'a clear sober freely given yes that can be withdrawn is', expected: ['consent', 'c'] },
      { question: 'depression and anxiety are common and', expected: ['treatable', 't'] },
      { question: 'reducing pregnancy and infection risk uses', expected: ['contraception', 'protection', 'c', 'p'] },
      { question: 'an infection passed through sex is an', expected: ['sti', 'infection', 's', 'i'] },
      { question: 'holding your line under pressure uses', expected: ['refusal', 'refuse', 'r'] },
      { question: 'when the brain craves a substance despite harm it is', expected: ['addiction', 'a'] },
      { question: 'a limit on how others treat you is a', expected: ['boundary', 'b'] },
      { question: 'asking for help early is a', expected: ['strength', 's'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG9Real(ctx) {
    const VOCAB = [
      'spanish', 'presente', 'pretérito', 'imperfecto', 'futuro', 'subjuntivo', 'conjugar', 'irregular',
      'reflexive', 'pronoun', 'adjective', 'agreement', 'conversacion', 'ensayo', 'cultura', 'literatura',
      'opinion', 'porque', 'sino', 'aunque', 'fluido', 'acento',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'spanish one formalizes the present preterite imperfect and future tenses',
      'the subjunctive expresses wishes doubts and possibilities',
      'reflexive verbs describe actions done to oneself',
      'adjectives agree with their noun in gender and number',
      'irregular verbs must be memorized in each tense',
      'we hold extended conversations on real topics',
      'we write a structured essay with an opinion and reasons',
      'porque means because and aunque means although and sino means but rather',
      'we read short authentic texts and literature in spanish',
      'understanding the culture deepens understanding of the language',
      'pronunciation and accent improve with daily speaking',
      'cognates and context help decode unfamiliar words',
      'we describe past events using preterite and imperfect together',
      'asking for and giving directions is a practical skill',
      'fluency grows from speaking imperfectly and often',
      'spanish becomes a usable second voice not just a class',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['subjuntivo', 'doubt'], ['reflexive', 'oneself'], ['agreement', 'gender'], ['preterite', 'completed'], ['imperfect', 'ongoing'], ['cultura', 'language'], ['speak', 'fluency'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G9' });
    return await this._gateSubjectProduction('language', 'grade9', [
      { question: 'the mood for wishes and doubts is the', expected: ['subjunctive', 'subjuntivo', 's'] },
      { question: 'verbs describing actions done to oneself are', expected: ['reflexive', 'r'] },
      { question: 'adjectives match the noun in gender and', expected: ['number', 'n'] },
      { question: 'aunque means', expected: ['although', 'a'] },
      { question: 'the past tense for completed actions is the', expected: ['preterite', 'pretérito', 'p'] },
      { question: 'the past tense for ongoing actions is the', expected: ['imperfect', 'imperfecto', 'i'] },
      { question: 'fluency grows from speaking often and', expected: ['imperfectly', 'often', 'i', 'o'] },
      { question: 'verbs that break the rules are', expected: ['irregular', 'i'] },
    ], { gateSubjectTag: 'language' });
  },

  async runCsG9Real(ctx) {
    const VOCAB = [
      'programming', 'algorithm', 'function', 'parameter', 'recursion', 'array', 'object', 'loop',
      'condition', 'data', 'structure', 'stack', 'queue', 'search', 'sort', 'complexity',
      'debug', 'refactor', 'project', 'api', 'json', 'git', 'commit', 'test',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'high school computer science formalizes real programming',
      'an algorithm is a precise procedure that solves a class of problems',
      'recursion is a function that calls itself on a smaller piece',
      'a data structure organizes data so operations are efficient',
      'a stack is last in first out and a queue is first in first out',
      'searching and sorting are the classic algorithm problems',
      'complexity describes how cost grows as the input grows',
      'i break a program into functions that each do one job',
      'an api lets my code talk to another program or service',
      'json is a text format for sending structured data',
      'i read the console and use it to hunt down bugs',
      'refactoring improves code without changing what it does',
      'i keep projects in git and commit my progress',
      'testing a function checks it behaves correctly',
      'each project i build is harder than the last on purpose',
      'i can build real interactive applications now',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['algorithm', 'solve'], ['recursion', 'smaller'], ['stack', 'lifo'], ['queue', 'fifo'], ['api', 'talk'], ['json', 'data'], ['refactor', 'improve'],
    ]);
    await this._trainCodingStories('grade9', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('cs', ctx, { tag: 'CS-G9' });
    return await this._gateSubjectProduction('cs', 'grade9', [
      { question: 'a function that calls itself on a smaller piece is', expected: ['recursion', 'r'] },
      { question: 'a structure that is last in first out is a', expected: ['stack', 's'] },
      { question: 'a structure that is first in first out is a', expected: ['queue', 'q'] },
      { question: 'how cost grows as input grows is', expected: ['complexity', 'c'] },
      { question: 'a text format for structured data is', expected: ['json', 'j'] },
      { question: 'a way for code to talk to another service is an', expected: ['api', 'a'] },
      { question: 'improving code without changing behavior is', expected: ['refactoring', 'refactor', 'r'] },
      { question: 'a precise procedure that solves a problem class is an', expected: ['algorithm', 'a'] },
    ], { gateSubjectTag: 'cs' });
  },

  async runCivicsG9Real(ctx) {
    const VOCAB = [
      'government', 'constitution', 'branch', 'federalism', 'rights', 'amendment', 'liberty', 'democracy',
      'republic', 'election', 'vote', 'justice', 'court', 'supreme', 'due', 'process',
      'citizen', 'responsibility', 'policy', 'protest', 'equality',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'government and citizenship studies how power is organized and limited',
      'the constitution establishes the government and protects rights',
      'federalism divides power between national and state governments',
      'the three branches check and balance each other',
      'the bill of rights protects core individual freedoms',
      'due process means the government must follow fair procedures',
      'the supreme court interprets whether laws follow the constitution',
      'elections give the people the power to choose and remove leaders',
      'voting is the most basic act of self government',
      'justice requires that the law apply equally to everyone',
      'peaceful protest is a protected way to demand change',
      'rights carry responsibilities to the community',
      'policy is how government turns goals into action',
      'an informed and active citizenry keeps a democracy alive',
      'the right to vote was won and expanded through struggle',
      'disagreeing with power and saying so out loud is protected',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['constitution', 'rights'], ['federalism', 'divide'], ['branch', 'check'], ['vote', 'choose'], ['due', 'fair'], ['protest', 'change'], ['informed', 'democracy'],
    ]);
    await this._teachProductionStack('civics', ctx, { tag: 'CIVICS-G9' });
    return await this._gateSubjectProduction('civics', 'grade9', [
      { question: 'dividing power between national and state is', expected: ['federalism', 'f'] },
      { question: 'fair government procedures are called due', expected: ['process', 'p'] },
      { question: 'the court that interprets the constitution is the', expected: ['supreme', 's'] },
      { question: 'the people choose and remove leaders through', expected: ['elections', 'election', 'voting', 'e', 'v'] },
      { question: 'a protected way to demand change is', expected: ['protest', 'p'] },
      { question: 'the first ten amendments are the bill of', expected: ['rights', 'r'] },
      { question: 'the law applying equally to all is', expected: ['justice', 'equality', 'j', 'e'] },
      { question: 'the three branches check and', expected: ['balance', 'balances', 'b'] },
    ], { gateSubjectTag: 'civics' });
  },

  async runEconomicsG9Real(ctx) {
    const VOCAB = [
      'economics', 'scarcity', 'choice', 'cost', 'opportunity', 'supply', 'demand', 'price',
      'market', 'trade', 'money', 'currency', 'income', 'budget', 'save', 'invest',
      'interest', 'profit', 'loss', 'inflation', 'tax', 'consumer', 'producer',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'economics is the study of how people meet unlimited wants with limited resources',
      'scarcity means there is never enough so every choice has a cost',
      'opportunity cost is the value of what you give up when you choose',
      'demand is how much people will buy at a given price',
      'supply is how much producers will sell at a given price',
      'price settles where supply and demand meet',
      'when something is scarce and wanted its price rises',
      'a market is where buyers and sellers trade',
      'money is a tool that makes trade easier than barter',
      'income is what you earn and a budget plans how you use it',
      'saving sets money aside and investing puts it to work for more',
      'interest is the cost of borrowing or the reward for saving',
      'profit is revenue minus cost and a loss is the opposite',
      'inflation means money buys less over time',
      'taxes fund the government services everyone uses',
      'every spending choice trades off something else you could have',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['scarcity', 'choice'], ['choice', 'cost'], ['demand', 'price'], ['supply', 'price'], ['save', 'invest'], ['inflation', 'less'], ['profit', 'revenue'],
    ]);
    await this._teachProductionStack('economics', ctx, { tag: 'ECON-G9' });
    return await this._gateSubjectProduction('economics', 'grade9', [
      { question: 'the value of what you give up to choose is opportunity', expected: ['cost', 'c'] },
      { question: 'not enough to meet all wants is', expected: ['scarcity', 's'] },
      { question: 'how much people will buy at a price is', expected: ['demand', 'd'] },
      { question: 'how much producers will sell at a price is', expected: ['supply', 's'] },
      { question: 'price settles where supply and demand', expected: ['meet', 'm'] },
      { question: 'money buying less over time is', expected: ['inflation', 'i'] },
      { question: 'revenue minus cost is', expected: ['profit', 'p'] },
      { question: 'the cost of borrowing money is', expected: ['interest', 'i'] },
    ], { gateSubjectTag: 'economics' });
  },

  async runPsychologyG9Real(ctx) {
    const VOCAB = [
      'psychology', 'mind', 'behavior', 'brain', 'neuron', 'memory', 'learning', 'emotion',
      'motivation', 'perception', 'development', 'personality', 'conditioning', 'reinforcement', 'stress', 'cognition',
      'bias', 'disorder', 'therapy', 'empathy', 'identity', 'trauma',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'psychology is the study of the mind and behavior',
      'the brain and its neurons are the physical basis of thought and feeling',
      'learning changes behavior through experience',
      'conditioning links a behavior to a reward or a consequence',
      'reinforcement makes a behavior more likely to happen again',
      'memory encodes stores and retrieves what we experience',
      'emotion and motivation drive much of what we do',
      'perception is how the brain builds reality from the senses',
      'development describes how the mind changes across a lifetime',
      'personality is the stable pattern of how a person thinks and acts',
      'cognitive biases are systematic errors in how we think',
      'stress and trauma shape the brain and behavior in lasting ways',
      'mental disorders are real conditions not character flaws',
      'therapy helps rewire unhelpful patterns of thought',
      'empathy is understanding and sharing what another feels',
      'understanding the mind helps me understand myself and others',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['neuron', 'thought'], ['learning', 'behavior'], ['reinforcement', 'repeat'], ['memory', 'retrieve'], ['stress', 'brain'], ['bias', 'error'], ['therapy', 'rewire'],
    ]);
    await this._teachProductionStack('psychology', ctx, { tag: 'PSYCH-G9' });
    return await this._gateSubjectProduction('psychology', 'grade9', [
      { question: 'the study of the mind and behavior is', expected: ['psychology', 'p'] },
      { question: 'the cells that are the basis of thought are', expected: ['neurons', 'neuron', 'n'] },
      { question: 'making a behavior more likely with a reward is', expected: ['reinforcement', 'r'] },
      { question: 'encoding storing and retrieving experience is', expected: ['memory', 'm'] },
      { question: 'how the brain builds reality from the senses is', expected: ['perception', 'p'] },
      { question: 'systematic errors in thinking are cognitive', expected: ['biases', 'bias', 'b'] },
      { question: 'understanding and sharing what another feels is', expected: ['empathy', 'e'] },
      { question: 'therapy helps rewire unhelpful patterns of', expected: ['thought', 'thinking', 't'] },
    ], { gateSubjectTag: 'psychology' });
  },

  async runLifeG9(ctx) {
    // ── G9 life experience — DATA-DRIVEN (corpora/life/grade9.json) ──
    // Freshman year: full-goth identity maxed, the crew (loyalty religion),
    // the first joint (teen drug experimentation begins — character history),
    // the DEVON first kiss (SHE initiates — agency), sex-ed-as-clinical-
    // health (reproduction/STDs/contraception — factual, not erotic), and the
    // CS teacher who first saw her (the college seed). TRAINED from story
    // DATA, not hardcoded feat-vectors. Romance non-graphic; explicit = 18+.
    await this._trainLifeStories('grade9', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'goth', 'choker', 'fishnets', 'boots', 'crew', 'weed', 'joint',
      'kiss', 'poetry', 'code', 'college', 'teacher',
    ], ctx, { reps: 5 });
  }
};
