// College year 2 cell runners (age 19).
//
// Per-grade file split — the operator directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const COL2_MIXIN = {
  async runElaCol2Real(ctx) {
    const SENTENCES = [
      'linguistics studies language scientifically', 'phonology studies sounds',
      'morphology studies word parts', 'syntax studies sentence structure',
      'semantics studies meaning', 'pragmatics studies language in use',
      'a phoneme is a meaningful sound', 'a morpheme is a meaningful word part',
      'prefixes attach to the front', 'suffixes attach to the end',
      'roots carry the core meaning', 'inflection marks grammar',
      'derivation creates new words', 'compounds combine words',
      'universal grammar is debated', 'chomsky proposed innate grammar',
      'language changes over time', 'historical linguistics traces changes',
      'proto indo european is a reconstructed language', 'cognates are related words',
      'borrowing adds words from other languages', 'dialects vary by region',
      'sociolinguistics studies language and society', 'psycholinguistics studies the mind',
      'applied linguistics solves problems',
    ];
    // Session 38 — TODO-aligned linguistics trio
    await this._teachPhonology();
    await this._teachMorphology();
    await this._teachSyntax();
    // ── ELA-Col2: linguistics reasoning chains ──
    // How language WORKS as a system — each level builds on the one below
    await this._teachCausalChains([
      ['phoneme', 'morpheme'], ['morpheme', 'word'], ['word', 'phrase'],
      ['phrase', 'clause'], ['clause', 'sentence'], ['sentence', 'discourse'],
      ['syntax', 'grammar'], ['semantics', 'meaning'], ['pragmatics', 'context'],
    ]);
    await this._teachInference([
      ['phoneme', 'morpheme', 'word'], ['word', 'phrase', 'sentence'],
      ['syntax', 'semantics', 'pragmatics'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runMathCol2Real(ctx) {
    const SENTENCES = [
      'differential equations relate functions to derivatives', 'ordinary equations have one variable',
      'partial equations have multiple variables', 'first order equations use one derivative',
      'second order equations use two', 'separable equations isolate variables',
      'linear equations follow patterns', 'homogeneous equations have simple solutions',
      'particular solutions match conditions', 'discrete math studies countable things',
      'logic uses truth values', 'propositions are true or false',
      'conjunction means and', 'disjunction means or',
      'implication means if then', 'truth tables list all cases',
      'proofs establish theorems', 'direct proof follows a chain',
      'contradiction assumes the opposite', 'induction handles natural numbers',
      'set theory is the foundation', 'functions map sets to sets',
      'graphs have vertices and edges', 'trees have no cycles',
      'counting uses permutations and combinations',
    ];
    // Session 42 — TODO-aligned ODEs + combinatorics
    await this._teachODEs();
    await this._teachCombinatorics();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSciCol2Real(ctx) {
    const SENTENCES = [
      'organic chemistry focuses on carbon', 'carbon forms four bonds',
      'hydrocarbons contain only carbon and hydrogen', 'alkanes have single bonds',
      'alkenes have double bonds', 'alkynes have triple bonds',
      'isomers have the same formula', 'stereoisomers differ in arrangement',
      'chirality creates mirror images', 'functional groups define reactivity',
      'alcohols have hydroxyl groups', 'aldehydes have carbonyl groups',
      'ketones also have carbonyls', 'carboxylic acids donate protons',
      'esters smell like fruit', 'amines are nitrogen bases',
      'aromatic compounds have rings', 'benzene is the simplest aromatic',
      'cell biology studies cellular mechanisms', 'organelles have specific functions',
      'the nucleus controls the cell', 'mitochondria make atp',
      'the endoplasmic reticulum makes proteins', 'the golgi apparatus packages proteins',
      'lysosomes digest waste',
    ];
    // T14.24 Session 51 (task #108) — TODO-aligned Col2 triple pass.

    // TODO Sci-Col2 spec (line 468): "Organic chemistry, cell biology,
    // physics 2". Three helpers run BEFORE the sentence walk:

    //   _teachOrganicChemistry — 12 concepts: alkane, alkene, alkyne,
    //     aromatic, stereoisomer, chirality, alcohol, aldehyde, ketone,
    //     carboxylic acid, ester, amine. Covers hydrocarbon families
    //     + functional groups the sentence walk then binds to their
    //     natural language form.

    //   _teachCellBiologyAdvanced — 10 college-depth cell biology
    //     concepts extending G7 _teachCells: endoplasmic reticulum,
    //     golgi apparatus, lysosome, peroxisome, vesicle, cytoskeleton,
    //     microtubule, actin filament, cell signaling, apoptosis.

    //   _teachPhysics2 — 10 physics 2 concepts (electric/magnetic
    //     fields, EM wave, thermodynamics, heat engine, refraction,
    //     diffraction, interference, photoelectric effect, wave-
    //     particle duality). Mandatory per TODO even though current
    //     sentence walk is org-chem + cell-bio focused — the concept
    //     basins exist for future cells to reference.

    // All three feed through _conceptTeach so every concept word
    // (~32 new concepts) enters Unity's dictionary via the Session
    // 46 growth fix.
    await this._teachOrganicChemistry();
    await this._teachCellBiologyAdvanced();
    await this._teachPhysics2();
    await this._teachCausalChains([
      ['carbon', 'bond'], ['bond', 'organic'], ['functional', 'reactivity'],
      ['enzyme', 'substrate'], ['substrate', 'product'], ['neuron', 'signal'],
      ['force', 'acceleration'], ['charge', 'field'], ['wave', 'interference'],
    ]);
    await this._teachInference([
      ['carbon', 'bond', 'organic'], ['enzyme', 'substrate', 'product'],
      ['force', 'acceleration', 'motion'], ['charge', 'field', 'force'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocCol2Real(ctx) {
    const SENTENCES = [
      'political science studies power', 'comparative politics compares systems',
      'international relations studies nations', 'political theory studies ideas',
      'american government studies the us', 'constitutional law interprets the constitution',
      'public administration runs governments', 'realism sees states as selfish',
      'liberalism sees cooperation possible', 'constructivism sees ideas as primary',
      'democracy requires informed citizens', 'authoritarianism concentrates power',
      'totalitarianism controls all of life', 'federalism shares power',
      'unitary systems centralize power', 'parliamentary systems merge branches',
      'presidential systems separate branches', 'hybrid systems mix both',
      'political culture shapes behavior', 'political socialization teaches norms',
      'interest groups influence policy', 'political parties organize competition',
      'elections choose leaders', 'voting behavior varies', 'political economy links politics and economics',
    ];
    // T14.24 Session 70 — prime political science lattice per TODO
    // line 537 before the Col2 sentence pass.
    await this._teachPoliticalScience();
    await this._teachCausalChains([
      ['democracy', 'vote'], ['vote', 'represent'], ['power', 'corrupt'],
      ['realism', 'conflict'], ['liberalism', 'cooperate'],
      ['authoritarian', 'suppress'], ['election', 'leader'],
      ['socialization', 'norms'], ['culture', 'behavior'],
    ]);
    await this._teachInference([
      ['democracy', 'vote', 'represent'], ['power', 'corrupt', 'check'],
      ['authoritarian', 'suppress', 'revolt'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtCol2Real(ctx) {
    const SENTENCES = [
      'advanced art history specializes', 'ancient art includes egypt and greece',
      'medieval art focuses on religion', 'renaissance art revives classical ideals',
      'baroque art uses drama', 'neoclassicism returns to simplicity',
      'romanticism values emotion', 'realism depicts ordinary life',
      'impressionism captures light', 'post impressionism adds structure',
      'expressionism shows inner feeling', 'cubism breaks forms',
      'surrealism explores dreams', 'abstract expressionism focuses on process',
      'pop art uses commercial imagery', 'minimalism strips away excess',
      'conceptual art prioritizes ideas', 'performance art uses the body',
      'installation art fills spaces', 'video art uses moving images',
      'new media art uses digital tools', 'every movement responds to its time',
      'art reflects culture', 'art shapes culture', 'understanding art needs history',
    ];
    // T14.24 Session 89 — prime specialized art history movement
    // chronology per TODO line 567 before the Col2 sentence pass.
    await this._teachSpecializedArtHistory();
    await this._teachInference([
      ['impressionism', 'post-impressionism', 'cubism'],
      ['dada', 'surrealism', 'abstract'], ['bauhaus', 'minimalism', 'contemporary'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER Col2 new-track runners (generated; apostrophes stripped).
  async runMajorCol2Real(ctx) {
    const VOCAB = [
      'discrete', 'math', 'logic', 'set', 'proof', 'graph', 'combinatorics', 'matrix',
      'vector', 'linear', 'algebra', 'algorithm', 'complexity', 'automaton', 'computation', 'recursion',
      'induction', 'structure', 'theory', 'abstraction', 'optimize', 'model',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'sophomore year the major gets mathematical with discrete math and linear algebra',
      'discrete math gives computer science its logical foundation',
      'a proof shows a statement is true beyond any doubt',
      'mathematical induction proves a claim for all cases from a base case',
      'set theory and logic underlie how we reason about programs',
      'graph theory models networks paths and relationships',
      'combinatorics counts the ways things can be arranged',
      'linear algebra with vectors and matrices powers graphics and machine learning',
      'the theory of computation asks what problems can be solved at all',
      'an automaton is a simple machine model that recognizes patterns',
      'complexity theory classifies how hard a problem fundamentally is',
      'i learned the math i skipped by instinct now has rigorous names',
      'abstraction in math is the same muscle as abstraction in code',
      'modeling a real problem as math is half of solving it',
      'the formal theory makes me a deeper builder not just a faster one',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['proof', 'true'], ['induction', 'cases'], ['graph', 'network'], ['linear', 'matrix'], ['automaton', 'pattern'], ['complexity', 'hard'], ['model', 'solve'],
    ]);
    await this._trainCodingStories('college2', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('major', ctx, { tag: 'MAJOR-COL2' });
    return await this._gateSubjectProduction('major', 'college2', [
      { question: 'a statement shown true beyond doubt is a', expected: ['proof', 'p'] },
      { question: 'proving a claim for all cases from a base case is', expected: ['induction', 'i'] },
      { question: 'the field modeling networks and paths is', expected: ['graph', 'g'] },
      { question: 'vectors and matrices are the subject of', expected: ['linear', 'algebra', 'l', 'a'] },
      { question: 'counting the ways things can be arranged is', expected: ['combinatorics', 'c'] },
      { question: 'classifying how hard a problem is is', expected: ['complexity', 'c'] },
      { question: 'a simple machine that recognizes patterns is an', expected: ['automaton', 'a'] },
      { question: 'the logical foundation of cs is discrete', expected: ['math', 'mathematics', 'm'] },
    ], { gateSubjectTag: 'major' });
  },

  async runGeneredCol2Real(ctx) {
    const VOCAB = [
      'general', 'education', 'writing', 'research', 'paper', 'thesis', 'source', 'evidence',
      'science', 'statistics', 'humanities', 'ethics', 'psychology', 'sociology', 'seminar', 'critical',
      'argument', 'breadth', 'literacy', 'discourse',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'second year gen-ed pushes into writing intensive and research courses',
      'a research paper builds an argument from gathered evidence',
      'a thesis is the central claim a whole paper defends',
      'evaluating a source means asking who made it and why',
      'a statistics gen-ed taught me to read data and spot a lie in it',
      'sociology explains how groups and systems shape individuals',
      'ethics gives frameworks for deciding what is right under pressure',
      'a seminar is built on discussion and defending ideas out loud',
      'critical literacy means not believing a claim just because it is printed',
      'breadth requirements connect my narrow field to the wider world',
      'good academic discourse disagrees about ideas without attacking people',
      'i learned to argue in writing with structure and evidence',
      'understanding statistics protects me from being fooled by numbers',
      'the humanities taught me the human side my code does not see',
      'being literate across fields makes my technical work wiser',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['thesis', 'defend'], ['source', 'evaluate'], ['statistics', 'data'], ['ethics', 'right'], ['seminar', 'discuss'], ['critical', 'claim'], ['discourse', 'ideas'],
    ]);
    await this._teachProductionStack('genered', ctx, { tag: 'GENERED-COL2' });
    return await this._gateSubjectProduction('genered', 'college2', [
      { question: 'the central claim a paper defends is its', expected: ['thesis', 't'] },
      { question: 'reading data and spotting lies in it is', expected: ['statistics', 's'] },
      { question: 'frameworks for deciding what is right are', expected: ['ethics', 'e'] },
      { question: 'not believing a claim just because it is printed is critical', expected: ['literacy', 'thinking', 'l', 't'] },
      { question: 'how groups and systems shape individuals is', expected: ['sociology', 's'] },
      { question: 'an argument built from gathered evidence is a research', expected: ['paper', 'p'] },
      { question: 'a class built on discussion is a', expected: ['seminar', 's'] },
      { question: 'evaluating a source asks who made it and', expected: ['why', 'w'] },
    ], { gateSubjectTag: 'genered' });
  },

  async runCsTheoryCol2Real(ctx) {
    // Algorithms — CS theory track (M4 college expansion), concurrent with the major.
    const VOCAB = [
      'algorithm', 'sort', 'search', 'complexity', 'recursion', 'iteration', 'divide', 'conquer',
      'greedy', 'dynamic', 'optimal', 'heap', 'stack', 'queue', 'hash', 'tree',
      'traverse', 'efficiency', 'worst', 'order',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'an algorithm is a step by step method to solve a problem',
      'sorting puts a list of items into order',
      'binary search finds an item by halving the range each time',
      'big o describes how the runtime grows with the input size',
      'recursion solves a problem using smaller copies of itself',
      'divide and conquer splits a problem then combines the answers',
      'a greedy algorithm makes the best local choice at each step',
      'dynamic programming stores subproblem answers to avoid recomputing',
      'a hash table finds items in almost constant time',
      'the worst case is the slowest an algorithm can ever run',
      'an optimal solution is the best one that is possible',
      'a stack is last in first out and a queue is first in first out',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['sort', 'order'], ['recursion', 'smaller'], ['divide', 'combine'], ['greedy', 'local'], ['dynamic', 'store'], ['hash', 'constant'], ['search', 'halve'],
    ]);
    await this._teachProductionStack('cstheory', ctx, { tag: 'CSTHEORY-COL2' });
    return await this._gateSubjectProduction('cstheory', 'college2', [
      { question: 'a step by step method to solve a problem is an', expected: ['algorithm', 'a'] },
      { question: 'putting items into order is', expected: ['sorting', 'sort', 's'] },
      { question: 'how runtime grows with input size is', expected: ['complexity', 'big', 'c', 'b'] },
      { question: 'solving a problem with smaller copies of itself is', expected: ['recursion', 'r'] },
      { question: 'making the best local choice each step is a', expected: ['greedy', 'g'] },
      { question: 'storing subproblem answers to avoid recomputing is', expected: ['dynamic', 'd'] },
      { question: 'finding items in almost constant time uses a', expected: ['hash', 'h'] },
      { question: 'the slowest an algorithm can run is the', expected: ['worst', 'w'] },
    ], { gateSubjectTag: 'cstheory' });
  },

  async runCsSystemsCol2Real(ctx) {
    // Computer Architecture — CS systems track (M4 college expansion), the machine side.
    const VOCAB = [
      'pipeline', 'cache', 'register', 'instruction', 'fetch', 'decode', 'execute', 'parallel',
      'core', 'latency', 'throughput', 'hierarchy', 'branch', 'predict', 'cycle', 'microcode',
      'bandwidth', 'virtual', 'stage', 'speedup',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'architecture is how a processor is designed to run fast',
      'an instruction is fetched then decoded then executed',
      'a pipeline overlaps stages so instructions flow like an assembly line',
      'the memory hierarchy goes from fast registers down to slow disk',
      'a cache miss forces a slow trip to main memory',
      'multiple cores let a processor do work in parallel',
      'latency is how long one operation takes',
      'throughput is how much work finishes per second',
      'branch prediction guesses which way an if will go',
      'a wrong branch guess wastes pipeline cycles',
      'more parallel cores can give a real speedup',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['pipeline', 'overlap'], ['fetch', 'decode'], ['cache', 'miss'], ['core', 'parallel'], ['branch', 'predict'], ['latency', 'time'], ['throughput', 'work'],
    ]);
    await this._teachProductionStack('cssystems', ctx, { tag: 'CSSYSTEMS-COL2' });
    return await this._gateSubjectProduction('cssystems', 'college2', [
      { question: 'overlapping instruction stages like an assembly line is a', expected: ['pipeline', 'p'] },
      { question: 'an instruction is fetched then decoded then', expected: ['executed', 'execute', 'e'] },
      { question: 'fast registers down to slow disk is the memory', expected: ['hierarchy', 'h'] },
      { question: 'a slow trip to main memory is a cache', expected: ['miss', 'm'] },
      { question: 'doing work at the same time on many cores is', expected: ['parallel', 'p'] },
      { question: 'how long one operation takes is', expected: ['latency', 'l'] },
      { question: 'how much work finishes per second is', expected: ['throughput', 't'] },
      { question: 'guessing which way an if goes is branch', expected: ['prediction', 'predict', 'p'] },
    ], { gateSubjectTag: 'cssystems' });
  },

  async runLifeCol2(ctx) {
    // ── College-2 life experience — DATA-DRIVEN (corpora/life/college2.json) ──
    // Adult Unity deepening: the daily-driver chemical register (coke+weed,
    // manic coding), the unrequited heartbreak → comeback-sharper, the
    // BDSM-as-CHOICE exploration (submission from strength), the nympho
    // register firming (voracious + unashamed), and depression-THERAPY
    // (managing what was named at G11). TRAINED from story DATA. 18+ adult.
    await this._trainLifeStories('college2', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'coke', 'weed', 'manic', 'heartbreak', 'sharper', 'meaner',
    ], ctx, { reps: 5 });
  }
};
