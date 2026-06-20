// Graduate-school cell runners (ages 23-24).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const GRAD_MIXIN = {
  async runElaGradReal(ctx) {
    const SENTENCES = [
      'semiotics studies signs and meaning', 'a sign has a signifier and signified',
      'saussure founded semiotics', 'peirce developed triadic semiotics',
      'icons resemble what they represent', 'indexes connect physically',
      'symbols are arbitrary and conventional', 'culture is a web of signs',
      'discourse analysis studies language in use', 'conversation has rules',
      'turn taking organizes speech', 'speech acts do things with words',
      'performative utterances create reality', 'felicity conditions must hold',
      'critical discourse analysis reveals power', 'foucault saw discourse as power',
      'genre shapes meaning', 'intertextuality connects texts',
      'narrative structures our understanding', 'metaphor shapes thought',
      'lakoff showed metaphors we live by', 'frames define situations',
      'positioning locates speakers', 'identity emerges in discourse',
      'graduate writing integrates all these',
    ];
    // Session 39 — TODO-aligned semiotics triads
    const TRIADS = [
      { sign: 'dove', signifier: 'bird', signified: 'peace' },
      { sign: 'rose', signifier: 'flower', signified: 'love' },
      { sign: 'cross', signifier: 'shape', signified: 'faith' },
      { sign: 'crown', signifier: 'object', signified: 'royalty' },
      { sign: 'heart', signifier: 'symbol', signified: 'affection' },
      { sign: 'flag', signifier: 'cloth', signified: 'nation' },
      { sign: 'owl', signifier: 'bird', signified: 'wisdom' },
      { sign: 'snake', signifier: 'animal', signified: 'danger' },
      { sign: 'lion', signifier: 'animal', signified: 'courage' },
      { sign: 'lamp', signifier: 'object', signified: 'knowledge' },
    ];
    await this._teachSemiotics(TRIADS);
    // ── ELA-Grad: semiotic reasoning — how meaning is constructed ──
    await this._teachCausalChains([
      ['sign', 'signifier'], ['signifier', 'signified'], ['signified', 'meaning'],
      ['text', 'interpret'], ['interpret', 'meaning'], ['context', 'meaning'],
      ['discourse', 'power'], ['power', 'knowledge'], ['ideology', 'naturalize'],
    ]);
    await this._teachInference([
      ['sign', 'signifier', 'signified'], ['text', 'interpret', 'meaning'],
      ['discourse', 'power', 'knowledge'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runMathGradReal(ctx) {
    const SENTENCES = [
      'measure theory generalizes integration', 'a measure assigns size to sets',
      'lebesgue measure generalizes length', 'sigma algebras contain measurable sets',
      'functional analysis studies function spaces', 'banach spaces are complete normed',
      'hilbert spaces have inner products', 'operators map between spaces',
      'bounded operators have finite norm', 'compact operators approximate finite rank',
      'spectral theory studies operator eigenvalues', 'fourier analysis decomposes functions',
      'distributions generalize functions', 'dirac delta is a distribution',
      'sobolev spaces combine smoothness and integrability', 'partial differential equations need function spaces',
      'the laplacian is fundamental', 'the heat equation describes diffusion',
      'the wave equation describes oscillation', 'variational methods find extrema',
      'euler lagrange equations arise naturally', 'optimization extends to infinite dimensions',
      'graduate mathematics connects many fields', 'abstract unification reveals structure',
      'beauty emerges from rigor',
    ];
    // Session 42 — TODO-aligned measure theory + functional analysis
    await this._teachMeasureTheory();
    await this._teachFunctionalAnalysis();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSciGradReal(ctx) {
    const SENTENCES = [
      'graduate science deepens specialization', 'research builds on prior work',
      'a graduate student chooses a field', 'an advisor guides the research',
      'the qualifying exam tests broad knowledge', 'the dissertation presents original work',
      'techniques are mastered', 'instruments are understood',
      'experiments are designed carefully', 'controls eliminate confounds',
      'data analysis requires statistics', 'models explain patterns',
      'theory unifies observations', 'hypotheses are tested rigorously',
      'null results inform the field', 'positive results are celebrated',
      'collaboration is common', 'multiple authors contribute',
      'grants fund the work', 'the nsf supports basic research',
      'industry partnerships apply findings', 'patents protect inventions',
      'ethics boards oversee research', 'publication shares results',
      'graduate training prepares researchers',
    ];
    // T14.24 Session 54 — prime the research-grade science concept
    // lattice (literature review / dissertation / grant / PI / replication
    // study / statistical power / preprint / advisor / specialization /
    // research program) before the sentence pass so SENTENCES attach to
    // a real grad-research basin instead of drifting into generic
    // Col4 experimental-method vocabulary.
    await this._teachResearchGradeScience();
    await this._teachCausalChains([
      ['question', 'hypothesis'], ['hypothesis', 'method'], ['method', 'result'],
      ['result', 'publish'], ['publish', 'peer'], ['peer', 'replicate'],
      ['theory', 'predict'], ['predict', 'verify'], ['grant', 'fund'],
    ]);
    await this._teachInference([
      ['question', 'hypothesis', 'method'], ['result', 'publish', 'impact'],
      ['theory', 'predict', 'verify'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocGradReal(ctx) {
    const SENTENCES = [
      'graduate social science specializes deeply', 'methodologies are mastered',
      'theory frameworks are chosen', 'research programs extend for years',
      'fieldwork immerses the researcher', 'interviews build understanding',
      'ethnographic writing is an art', 'quantitative analysis reveals patterns',
      'mixed methods triangulate findings', 'a graduate thesis shows original work',
      'comprehensive exams test the field', 'advisors mentor students',
      'committees evaluate progress', 'conferences present work',
      'publication builds reputation', 'teaching shares knowledge',
      'academic jobs are scarce', 'applied research exists in industry',
      'public scholarship engages communities', 'policy research informs decisions',
      'historical research requires archives', 'political research requires fieldwork',
      'sociological research uses multiple methods', 'anthropological research takes time',
      'graduate training transforms scholars',
    ];
    // T14.24 Session 73 — prime research historiography lattice per
    // TODO line 540 before the Grad sentence pass.
    await this._teachResearchHistoriography();
    await this._teachCausalChains([
      ['archive', 'source'], ['source', 'interpret'], ['interpret', 'revise'],
      ['paradigm', 'shift'], ['shift', 'rewrite'], ['method', 'finding'],
      ['finding', 'theory'], ['theory', 'framework'],
    ]);
    await this._teachInference([
      ['archive', 'source', 'interpret'], ['paradigm', 'shift', 'rewrite'],
      ['method', 'finding', 'theory'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtGradReal(ctx) {
    const SENTENCES = [
      'graduate art study deepens practice', 'a graduate studio is a laboratory',
      'experimentation drives development', 'materials are explored deeply',
      'concepts are refined', 'the work develops a voice',
      'critiques shape the work', 'peers provide perspective',
      'faculty mentor development', 'visiting artists inspire',
      'residencies provide focused time', 'exhibitions share work publicly',
      'artist talks explain the work', 'portfolios document growth',
      'statements articulate vision', 'graduate theses integrate practice and theory',
      'writing about art is essential', 'criticism informs practice',
      'history shapes contemporary work', 'contemporary work responds to history',
      'professional practice is part of graduate training', 'grants and residencies sustain practice',
      'teaching shares insights', 'service strengthens communities',
      'graduate training professionalizes artists',
    ];
    // T14.24 Session 92 — prime graduate art research lattice per
    // TODO line 570 before the Grad sentence pass.
    await this._teachGraduateArtResearch();
    await this._teachCausalChains([
      ['studio', 'practice'], ['practice', 'voice'], ['voice', 'exhibition'],
      ['critique', 'growth'], ['residency', 'focus'], ['thesis', 'defense'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER Grad new-track runners (generated; apostrophes stripped).
  async runMajorGradReal(ctx) {
    const VOCAB = [
      'graduate', 'advanced', 'deep', 'learning', 'neural', 'network', 'model', 'architecture',
      'training', 'gradient', 'backpropagation', 'optimization', 'tensor', 'gpu', 'distributed', 'scale',
      'paper', 'seminar', 'specialize', 'depth', 'rigor', 'expert',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'graduate study goes deep into machine learning and neural networks',
      'a deep neural network stacks many layers of simple units',
      'backpropagation trains a network by pushing error backward through it',
      'gradient descent nudges weights toward lower error step by step',
      'training large models needs tensors gpus and distributed computing',
      'an architecture is the chosen shape and connectivity of a network',
      'i read research papers daily and present them in seminar',
      'graduate work means becoming an expert in a narrow deep slice',
      'the math i learned across years is the daily language here',
      'scaling a model up reveals problems a small one never shows',
      'optimization at this level is part science part dark art',
      'i specialize toward the brain models that obsessed me as an undergrad',
      'depth over breadth is the whole point of graduate study',
      'rigor means every claim is defended with evidence and math',
      'i am no longer learning the field i am pushing its edge',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['network', 'layers'], ['backpropagation', 'error'], ['gradient', 'weights'], ['architecture', 'shape'], ['training', 'gpu'], ['scale', 'problems'], ['expert', 'deep'],
    ]);
    await this._trainCodingStories('grad', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('major', ctx, { tag: 'MAJOR-GRAD' });
    return await this._gateSubjectProduction('major', 'grad', [
      { question: 'a network that stacks many layers of units is a deep neural', expected: ['network', 'n'] },
      { question: 'training a network by pushing error backward is', expected: ['backpropagation', 'backprop', 'b'] },
      { question: 'nudging weights toward lower error is gradient', expected: ['descent', 'd'] },
      { question: 'the chosen shape and connectivity of a network is its', expected: ['architecture', 'a'] },
      { question: 'training large models needs tensors and the', expected: ['gpu', 'g'] },
      { question: 'graduate study trades breadth for', expected: ['depth', 'd'] },
      { question: 'every claim defended with evidence and math is', expected: ['rigor', 'r'] },
      { question: 'at the graduate level you stop learning the field and start pushing its', expected: ['edge', 'e'] },
    ], { gateSubjectTag: 'major' });
  },

  async runResearchGradReal(ctx) {
    const VOCAB = [
      'research', 'hypothesis', 'experiment', 'method', 'data', 'result', 'analysis', 'reproduce',
      'publish', 'peer', 'review', 'contribution', 'novel', 'simulation', 'brain', 'neuron',
      'model', 'question', 'evidence', 'rigor', 'knowledge', 'build',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'research is the work of creating knowledge that did not exist before',
      'a hypothesis is a precise testable guess about how something works',
      'an experiment is designed to support or refute a hypothesis',
      'sound method is what separates real findings from wishful thinking',
      'results mean nothing until someone else can reproduce them',
      'analysis turns raw data into a defensible claim',
      'peer review lets other experts attack the work before it is published',
      'a contribution is the new thing your work adds to the field',
      'my research models neurons and networks to study how minds learn',
      'i build brain simulations and test what makes them behave',
      'a good research question is narrow deep and genuinely unanswered',
      'evidence and rigor are the entire currency of science',
      'i am building a brain in code to understand minds by making one',
      'failure is most of research and the part that teaches the most',
      'creating new knowledge is the most powerful thing a mind can do',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['hypothesis', 'test'], ['experiment', 'refute'], ['method', 'findings'], ['reproduce', 'results'], ['review', 'attack'], ['contribution', 'new'], ['simulation', 'brain'],
    ]);
    await this._teachProductionStack('research', ctx, { tag: 'RESEARCH-GRAD' });
    return await this._gateSubjectProduction('research', 'grad', [
      { question: 'a precise testable guess about how something works is a', expected: ['hypothesis', 'h'] },
      { question: 'designed to support or refute a hypothesis is an', expected: ['experiment', 'e'] },
      { question: 'results mean nothing until someone else can', expected: ['reproduce', 'r'] },
      { question: 'experts attacking work before publication is peer', expected: ['review', 'r'] },
      { question: 'the new thing your work adds to the field is a', expected: ['contribution', 'c'] },
      { question: 'the entire currency of science is evidence and', expected: ['rigor', 'r'] },
      { question: 'creating knowledge that did not exist before is', expected: ['research', 'r'] },
      { question: 'i build a brain in code to understand minds by', expected: ['making', 'building', 'm', 'b'] },
    ], { gateSubjectTag: 'research' });
  },

  async runLifeGrad(ctx) {
    // ── Grad life experience — DATA-DRIVEN (corpora/life/grad.json) ──
    // Adult Unity fully operational: brain-simulation research (META — she
    // becomes a brain-builder), the chemical register locked ("the drugs
    // tune me"), the love-hard/dangerous intensity, the BDSM dynamic owned as
    // CHOICE (the collar's meaning), and the shape-of-her (every wound a
    // tool). TRAINED from story DATA. 18+ adult, explicit register.
    await this._trainLifeStories('grad', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'neuroscience', 'brain', 'simulation', 'experiment', 'coke', 'weed',
      'molly', 'acid', 'volatile', 'devoted', 'dangerous',
    ], ctx, { reps: 5 });
  }
};
