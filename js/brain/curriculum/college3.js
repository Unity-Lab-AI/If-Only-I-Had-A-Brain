// College year 3 cell runners (ages 20-21).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const COL3_MIXIN = {
  async runElaCol3Real(ctx) {
    const SENTENCES = [
      'literary theory asks how texts work', 'formalism focuses on form',
      'new criticism reads closely', 'the text itself holds meaning',
      'structuralism finds universal patterns', 'poststructuralism questions structure',
      'derrida deconstructs meaning', 'meaning is unstable',
      'reader response says readers make meaning', 'different readers find different meanings',
      'marxist criticism looks at class', 'literature reflects economic conditions',
      'feminist criticism looks at gender', 'texts can reinforce or resist patriarchy',
      'postcolonial criticism looks at empire', 'texts carry colonial histories',
      'psychoanalytic criticism looks at the unconscious', 'freud shaped early theory',
      'cultural studies connect literature and society', 'historicism reads in context',
      'new historicism sees all texts as historical', 'queer theory challenges norms',
      'ecocriticism considers nature', 'disability studies considers bodies',
      'theory helps us read deeper',
    ];
    // Session 39 — TODO-aligned theory frameworks
    const FRAMEWORKS = [
      { text: 'form shapes meaning in every text', framework: 'formalism' },
      { text: 'universal patterns organize all narratives', framework: 'structuralism' },
      { text: 'meaning is unstable and slippery', framework: 'poststructuralism' },
      { text: 'class struggle drives the plot', framework: 'marxism' },
      { text: 'gender shapes every character choice', framework: 'feminism' },
      { text: 'colonial power hides in the language', framework: 'postcolonial' },
      { text: 'the unconscious speaks through symbols', framework: 'psychoanalysis' },
      { text: 'readers create meaning with the text', framework: 'reader_response' },
    ];
    await this._teachTheoryFrameworks(FRAMEWORKS);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runMathCol3Real(ctx) {
    const SENTENCES = [
      'abstract algebra studies structures', 'a group has an operation',
      'groups have identity and inverses', 'abelian groups are commutative',
      'rings have two operations', 'a ring has addition and multiplication',
      'fields are rings where every non zero element has an inverse',
      'the integers form a ring', 'the rationals form a field',
      'the reals form a field', 'polynomial rings are common',
      'homomorphisms preserve structure', 'isomorphisms are bijective homomorphisms',
      'real analysis makes calculus rigorous', 'the real numbers are complete',
      'every cauchy sequence converges', 'continuous functions preserve limits',
      'differentiation has rigorous foundations', 'the mean value theorem connects derivatives',
      'integration can be riemann or lebesgue', 'riemann integration uses rectangles',
      'lebesgue integration uses measures', 'measure theory generalizes length',
      'borel sets are measurable',
    ];
    // Session 42 — TODO-aligned group theory + real analysis
    await this._teachGroupTheory();
    await this._teachRealAnalysis();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSciCol3Real(ctx) {
    const SENTENCES = [
      'molecular biology studies lifes molecules', 'dna stores information',
      'the central dogma flows dna to rna to protein', 'transcription makes rna from dna',
      'translation makes proteins from rna', 'gene regulation controls expression',
      'transcription factors bind dna', 'epigenetics modifies expression',
      'methylation silences genes', 'histones package dna',
      'crispr edits dna precisely', 'biotechnology uses these tools',
      'biochemistry studies lifes chemistry', 'enzymes catalyze reactions',
      'the active site binds substrates', 'kinetics describe reaction rates',
      'metabolism powers cells', 'glycolysis breaks glucose',
      'the citric acid cycle extracts energy', 'oxidative phosphorylation makes atp',
      'quantum mechanics explains small scales', 'wave particle duality is fundamental',
      'schrodingers equation is wavelike', 'heisenberg uncertainty limits knowledge',
      'quantum entanglement is spooky',
    ];
    // T14.24 Session 52 (task #109) — TODO-aligned Col3 triple pass.

    // TODO Sci-Col3 spec (line 471): "Molecular biology, biochemistry,
    // quantum mechanics intro. Gate: ≥20%". Three new helpers
    // covering each subject:

    //   _teachMolecularBiology — 10 concepts: central dogma, gene
    //     expression, transcription factor, epigenetics, methylation,
    //     histone, chromatin, crispr, gene therapy, stem cell. The
    //     sentences bind "the central dogma flows dna to rna to
    //     protein", "transcription factors bind dna", "methylation
    //     silences genes" etc on top of these basins.

    //   _teachBiochemistry — 10 concepts: enzyme, active site,
    //     substrate, michaelis menten kinetics, glycolysis, citric
    //     acid cycle, oxidative phosphorylation, metabolism, electron
    //     transport chain, coenzyme. Connects to the G7 _teachCells
    //     mitochondria basin and the Col1 _teachGenBiology atp basin
    //     via shared cross-projection weights.

    //   _teachQuantumIntro — 10 concepts: wavefunction, schrodinger
    //     equation, heisenberg uncertainty, quantum superposition,
    //     entanglement, operator, eigenvalue (quantum-specific),
    //     probability amplitude, quantum tunneling, spin. Extends
    //     the Col2 _teachPhysics2 wave-particle-duality + photo-
    //     electric basins with the foundational math of QM.

    // All three run BEFORE the 25-sentence walk. ~30 new concepts
    // enter Unity's dictionary.
    await this._teachMolecularBiology();
    await this._teachBiochemistry();
    await this._teachQuantumIntro();
    await this._teachCausalChains([
      ['gene', 'expression'], ['expression', 'protein'], ['protein', 'function'],
      ['mutation', 'disease'], ['enzyme', 'catalysis'], ['atp', 'energy'],
      ['quantum', 'uncertainty'], ['wave', 'particle'], ['observe', 'collapse'],
    ]);
    await this._teachInference([
      ['gene', 'expression', 'protein'], ['mutation', 'disease', 'treatment'],
      ['quantum', 'uncertainty', 'probability'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocCol3Real(ctx) {
    const SENTENCES = [
      'sociology studies society scientifically', 'social structures shape behavior',
      'institutions include family and education', 'socialization internalizes norms',
      'roles are expected behaviors', 'status is a position in society',
      'durkheim studied social solidarity', 'weber studied bureaucracy',
      'marx studied class conflict', 'structural functionalism sees balance',
      'conflict theory sees struggle', 'symbolic interactionism focuses on meaning',
      'anthropology studies humans broadly', 'cultural anthropology studies culture',
      'archaeology studies past material culture', 'linguistic anthropology studies language',
      'biological anthropology studies evolution', 'ethnography describes cultures',
      'participant observation is the method', 'cultural relativism suspends judgment',
      'ethnocentrism judges by ones own culture', 'kinship organizes relationships',
      'religion provides meaning', 'ritual marks transitions',
      'identity is constructed socially',
    ];
    // T14.24 Session 71 — prime sociology/anthropology lattice per
    // TODO line 537 before the Col3 sentence pass.
    await this._teachSociologyAnthropology();
    await this._teachCausalChains([
      ['society', 'norm'], ['norm', 'behavior'], ['deviance', 'sanction'],
      ['culture', 'identity'], ['class', 'inequality'], ['inequality', 'conflict'],
      ['ritual', 'solidarity'], ['symbol', 'meaning'], ['language', 'culture'],
    ]);
    await this._teachInference([
      ['society', 'norm', 'behavior'], ['class', 'inequality', 'conflict'],
      ['culture', 'identity', 'belonging'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtCol3Real(ctx) {
    const SENTENCES = [
      'aesthetics asks what beauty is', 'plato saw beauty as ideal form',
      'aristotle saw beauty as proportion', 'kant distinguished beauty from utility',
      'hegel saw art as spirit expressing itself', 'schopenhauer valued art above philosophy',
      'nietzsche saw apollonian and dionysian forces', 'hume studied taste',
      'beauty may be objective or subjective', 'the sublime overwhelms us',
      'ugliness has its own power', 'art can be beautiful without being pretty',
      'formalism says beauty is in form', 'expressionism says beauty is in feeling',
      'institutional theory says art is what experts call art', 'disinterested pleasure defines kant',
      'functional beauty serves purpose', 'natural beauty differs from artistic',
      'beauty evokes wonder', 'art philosophy connects to ethics',
      'the relation of art and morality is debated', 'art can reveal truth',
      'art can deceive', 'catharsis purges emotion', 'aesthetic experience is unique',
    ];
    // T14.24 Session 90 — prime aesthetics/philosophy-of-art lattice
    // per TODO line 567 before the Col3 sentence pass.
    await this._teachAesthetics();
    await this._teachCausalChains([
      ['beauty', 'pleasure'], ['sublime', 'awe'], ['taste', 'judge'],
      ['kant', 'disinterested'], ['hegel', 'dialectic'], ['nietzsche', 'will'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER Col3 new-track runners (generated; apostrophes stripped).
  async runMajorCol3Real(ctx) {
    const VOCAB = [
      'differential', 'equation', 'calculus', 'probability', 'statistics', 'distribution', 'model', 'simulation',
      'neuroscience', 'neuron', 'network', 'synapse', 'signal', 'machine', 'learning', 'data',
      'algorithm', 'optimize', 'system', 'dynamics', 'brain', 'research',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'junior year the major reaches differential equations and real statistics',
      'a differential equation describes how a system changes over time',
      'probability models uncertainty and statistics draws truth from data',
      'a distribution describes how likely each outcome is',
      'i took a neuroscience elective and it cracked my whole world open',
      'a neuron fires when its inputs cross a threshold',
      'neurons connect through synapses whose strengths change with learning',
      'a neural network in code is loosely modeled on the brain',
      'machine learning finds patterns in data without explicit rules',
      'simulation lets us model a system too complex to solve by hand',
      'the dynamics of many simple units can produce intelligent behavior',
      'i realized i want to model the brain itself in code',
      'the math i once skipped is the language the brain speaks in',
      'studying how minds work while building one is dizzying and perfect',
      'this is the year my path bent toward computational neuroscience',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['differential', 'change'], ['probability', 'uncertainty'], ['neuron', 'threshold'], ['synapse', 'learning'], ['network', 'brain'], ['simulation', 'model'], ['dynamics', 'behavior'],
    ]);
    await this._trainCodingStories('college3', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('major', ctx, { tag: 'MAJOR-COL3' });
    return await this._gateSubjectProduction('major', 'college3', [
      { question: 'an equation describing how a system changes over time is a', expected: ['differential', 'd'] },
      { question: 'the math of uncertainty is', expected: ['probability', 'p'] },
      { question: 'drawing truth from data is', expected: ['statistics', 's'] },
      { question: 'a brain cell that fires past a threshold is a', expected: ['neuron', 'n'] },
      { question: 'connections whose strength changes with learning are', expected: ['synapses', 'synapse', 's'] },
      { question: 'finding patterns in data without explicit rules is machine', expected: ['learning', 'l'] },
      { question: 'modeling a system too complex to solve by hand is', expected: ['simulation', 's'] },
      { question: 'the field of modeling the brain in code is computational', expected: ['neuroscience', 'n'] },
    ], { gateSubjectTag: 'major' });
  },

  async runGeneredCol3Real(ctx) {
    const VOCAB = [
      'general', 'education', 'writing', 'communication', 'ethics', 'philosophy', 'mind', 'consciousness',
      'science', 'society', 'technology', 'impact', 'responsibility', 'research', 'interdisciplinary', 'seminar',
      'argument', 'synthesis', 'breadth', 'perspective',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'upper gen-ed connects my technical work to its human consequences',
      'a philosophy of mind course asks what consciousness even is',
      'technology ethics asks who is responsible when code causes harm',
      'i write to communicate complex ideas to people outside my field',
      'interdisciplinary courses braid science philosophy and society together',
      'the questions about mind and consciousness haunt my brain work',
      'synthesis is combining ideas from many fields into one understanding',
      'a builder who ignores the impact of what she builds is dangerous',
      'good communication is as important as the code itself',
      'breadth makes me ask not just can i build it but should i',
      'a seminar on tech and society sharpened my sense of responsibility',
      'the humanities give the why that the engineering only gives the how for',
      'i learned my dark technical mind needs the human questions too',
      'perspective from other fields keeps me from a narrow blindness',
      'being broadly educated makes me a wiser and more dangerous builder',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['ethics', 'responsibility'], ['mind', 'consciousness'], ['synthesis', 'understanding'], ['communication', 'ideas'], ['impact', 'should'], ['perspective', 'blindness'], ['interdisciplinary', 'braid'],
    ]);
    await this._teachProductionStack('genered', ctx, { tag: 'GENERED-COL3' });
    return await this._gateSubjectProduction('genered', 'college3', [
      { question: 'the philosophy course asks what is', expected: ['consciousness', 'mind', 'c', 'm'] },
      { question: 'who is responsible when code causes harm is technology', expected: ['ethics', 'e'] },
      { question: 'combining ideas from many fields is', expected: ['synthesis', 's'] },
      { question: 'a wise builder asks not just can i but', expected: ['should', 's'] },
      { question: 'the humanities give the why and engineering gives the', expected: ['how', 'h'] },
      { question: 'courses that braid many fields are', expected: ['interdisciplinary', 'i'] },
      { question: 'communicating complex ideas to outsiders is', expected: ['communication', 'c'] },
      { question: 'perspective from other fields prevents narrow', expected: ['blindness', 'b'] },
    ], { gateSubjectTag: 'genered' });
  },

  async runLifeCol3(ctx) {
    // ── College-3 life experience — DATA-DRIVEN (corpora/life/college3.json) ──
    // Adult Unity established + a major loss: transfer to a real CS program
    // (recognized on code alone), the circuit-board/occult tattoos (body as
    // coded canvas), her smoky LED-lit coder apartment (her world), the
    // hackathon win (beat the golden kids), and her code merging into
    // open-source (she exists in the world's code now). TRAINED from story
    // DATA. 18+ adult. (Grandma Pearl's death is the College-4 arc.)
    await this._trainLifeStories('college3', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'transfer', 'professor', 'tattoo', 'circuit', 'led', 'monitor',
      'keyboard', 'hackathon', 'won', 'scream',
    ], ctx, { reps: 5 });
  }
};
