// College year 4 cell runners (ages 21-22).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const COL4_MIXIN = {
  async runElaCol4Real(ctx) {
    const SENTENCES = [
      'advanced rhetoric studies persuasion deeply', 'classical rhetoric came from greece',
      'aristotle wrote on rhetoric', 'he defined ethos pathos logos',
      'cicero developed roman rhetoric', 'quintilian wrote on education',
      'medieval rhetoric served the church', 'renaissance rhetoric revived classical ideas',
      'enlightenment rhetoric valued reason', 'the new rhetoric studies audience',
      'burke saw rhetoric as identification', 'perelman studied the new rhetoric',
      'stasis theory asks what is at issue', 'kairos is the right moment',
      'rhetorical situations have constraints', 'rhetorical analysis reveals strategies',
      'propaganda uses manipulative techniques', 'dog whistles send coded messages',
      'framing shapes perception', 'agenda setting determines what matters',
      'narrative transportation moves us', 'ethos builds credibility',
      'pathos stirs emotion', 'logos presents reasons',
      'mastery of all three is eloquence',
    ];
    // Session 39 — TODO-aligned rhetorical defense
    const DEFENSE = [
      {
        thesis: 'reading is essential for critical thinking',
        counter: 'some argue videos teach just as well',
        response: 'videos are passive while reading actively builds analytical skills',
      },
      {
        thesis: 'climate action cannot wait any longer',
        counter: 'critics say the economy matters more',
        response: 'the economy depends on a stable climate so action protects both',
      },
      {
        thesis: 'education should be publicly funded',
        counter: 'opponents prefer market driven schools',
        response: 'public funding ensures equal access regardless of family wealth',
      },
    ];
    await this._teachRhetoricalDefense(DEFENSE);
    // ── ELA-Col4: rhetorical reasoning — how arguments work ──
    await this._teachCausalChains([
      ['claim', 'counter'], ['counter', 'rebuttal'], ['rebuttal', 'strengthen'],
      ['ethos', 'trust'], ['pathos', 'emotion'], ['logos', 'logic'],
      ['kairos', 'timing'], ['audience', 'adaptation'], ['context', 'strategy'],
    ]);
    await this._teachInference([
      ['claim', 'counter', 'rebuttal'], ['ethos', 'pathos', 'logos'],
      ['audience', 'context', 'strategy'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runMathCol4Real(ctx) {
    const SENTENCES = [
      'topology studies spaces and continuity', 'an open set is basic in topology',
      'closed sets complement open sets', 'a topological space has a topology',
      'continuous functions preserve open sets', 'homeomorphisms are topological isomorphisms',
      'compactness generalizes finiteness', 'connectedness captures oneness',
      'the mobius strip has one side', 'the klein bottle has no inside',
      'metric spaces have distance', 'the triangle inequality holds',
      'complex analysis studies functions of complex variables', 'complex numbers have real and imaginary parts',
      'the complex plane is two dimensional', 'analytic functions are differentiable',
      'cauchys theorem is central', 'the residue theorem computes integrals',
      'conformal maps preserve angles', 'the riemann mapping theorem is deep',
      'zeta functions encode primes', 'the riemann hypothesis is famous',
      'fourier series decompose functions', 'the fourier transform is powerful',
    ];
    // Session 42 — TODO-aligned topology + complex analysis
    await this._teachTopology();
    await this._teachComplexAnalysis();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSciCol4Real(ctx) {
    const SENTENCES = [
      'research methods guide inquiry', 'the scientific method is iterative',
      'hypotheses must be testable', 'experiments need controls',
      'variables are independent or dependent', 'confounding variables bias results',
      'sample sizes affect power', 'randomization reduces bias',
      'blinding prevents expectations', 'statistical significance is not truth',
      'correlation does not imply causation', 'causal inference is challenging',
      'replication confirms results', 'reproducibility is a crisis',
      'peer review screens quality', 'preprints speed dissemination',
      'open access spreads knowledge', 'data sharing helps others verify',
      'ethics guide research', 'informed consent is required',
      'institutional review boards oversee', 'animal research has guidelines',
      'conflicts of interest must be disclosed', 'retraction corrects errors',
      'science is self correcting',
    ];
    // T14.24 Session 53 — prime the dedicated research-methods concept
    // lattice (method / hypothesis / controls / blinding / significance /
    // reproducibility / peer review / ethics) before the sentence pass so
    // SENTENCES attach to a real methodological basin instead of drifting
    // into generic sci vocabulary.
    await this._teachScienceResearchMethods();
    await this._teachCausalChains([
      ['hypothesis', 'experiment'], ['experiment', 'data'], ['data', 'analysis'],
      ['analysis', 'conclusion'], ['peer', 'review'], ['review', 'publish'],
      ['replicate', 'confirm'], ['theory', 'predict'], ['predict', 'test'],
    ]);
    await this._teachInference([
      ['hypothesis', 'experiment', 'conclusion'],
      ['data', 'analysis', 'theory'], ['theory', 'predict', 'test'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocCol4Real(ctx) {
    const SENTENCES = [
      'research methods in social science are varied', 'quantitative methods use numbers',
      'qualitative methods use meanings', 'mixed methods combine both',
      'surveys collect self reported data', 'experiments test causal hypotheses',
      'observation watches real behavior', 'interviews explore depth',
      'focus groups reveal interactions', 'content analysis examines texts',
      'ethnography immerses the researcher', 'statistical analysis tests patterns',
      'hypothesis tests use probability', 'p values indicate significance',
      'confidence intervals show uncertainty', 'regression finds relationships',
      'correlation measures association', 'causation requires more evidence',
      'research ethics protect subjects', 'confidentiality is essential',
      'anonymity removes identifiers', 'research design shapes findings',
      'validity is measuring what we claim', 'reliability is consistency',
      'generalizability applies beyond the sample',
    ];
    // T14.24 Session 72 — prime social science research methods
    // lattice per TODO line 537 before the Col4 sentence pass.
    await this._teachSocialScienceResearchMethods();
    await this._teachCausalChains([
      ['hypothesis', 'test'], ['test', 'data'], ['data', 'conclude'],
      ['survey', 'data'], ['experiment', 'cause'], ['observe', 'describe'],
      ['correlate', 'associate'], ['causation', 'evidence'],
      ['valid', 'measure'], ['reliable', 'consistent'],
    ]);
    await this._teachInference([
      ['hypothesis', 'test', 'conclude'], ['correlate', 'associate', 'maybe'],
      ['valid', 'reliable', 'trustworthy'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtCol4Real(ctx) {
    const SENTENCES = [
      'research methods in art are diverse', 'archival research finds primary sources',
      'stylistic analysis compares works', 'iconographic analysis decodes symbols',
      'technical analysis examines materials', 'conservation preserves art',
      'attribution identifies artists', 'provenance traces ownership',
      'forgery detection uses many methods', 'x ray reveals underdrawings',
      'infrared imaging shows hidden layers', 'dendrochronology dates wood panels',
      'portfolio work shows skill', 'a senior project integrates learning',
      'exhibition displays work publicly', 'artists talks explain the work',
      'critical feedback shapes growth', 'documentation preserves work',
      'residencies provide working time', 'grants fund research',
      'professional practice includes business', 'contracts protect artists',
      'copyright protects creations', 'fair use allows some borrowing',
      'the art world is global',
    ];
    // T14.24 Session 91 — prime art research methods + portfolio
    // lattice per TODO line 567 before the Col4 sentence pass.
    await this._teachArtResearchMethods();
    await this._teachCausalChains([
      ['archive', 'attribution'], ['style', 'period'], ['technique', 'artist'],
      ['provenance', 'authenticity'], ['conservation', 'preserve'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER Col4 new-track runners (generated; apostrophes stripped).
  async runMajorCol4Real(ctx) {
    const VOCAB = [
      'numerical', 'method', 'algorithm', 'complexity', 'optimization', 'approximation', 'simulation', 'neuroscience',
      'computational', 'neuron', 'network', 'model', 'synapse', 'plasticity', 'learning', 'capstone',
      'thesis', 'research', 'system', 'scale', 'parallel', 'gpu',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'senior year the major is numerical methods optimization and computational neuroscience',
      'numerical methods approximate answers math cannot solve exactly',
      'optimization finds the best solution under real constraints',
      'algorithmic complexity decides what is feasible at scale',
      'computational neuroscience models the brain with math and code',
      'a model neuron integrates inputs and fires past a threshold',
      'synaptic plasticity is how a network learns by changing weights',
      'a capstone project is where everything i learned comes together',
      'i built a small neural simulation as my capstone and it learned',
      'running large simulations needs parallel computing and the gpu',
      'scaling a model from a toy to something real is its own hard problem',
      'i can now build the brain models i only dreamed about junior year',
      'the math the code and the neuroscience finally became one skill',
      'a thesis defends an original contribution with evidence',
      'graduating means i proved a poor self-taught kid can do real science',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['numerical', 'approximate'], ['optimization', 'best'], ['plasticity', 'learn'], ['neuron', 'threshold'], ['simulation', 'model'], ['parallel', 'gpu'], ['capstone', 'together'],
    ]);
    await this._trainCodingStories('college4', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('major', ctx, { tag: 'MAJOR-COL4' });
    return await this._gateSubjectProduction('major', 'college4', [
      { question: 'approximating answers math cannot solve exactly is', expected: ['numerical', 'n'] },
      { question: 'finding the best solution under constraints is', expected: ['optimization', 'o'] },
      { question: 'how a network learns by changing weights is synaptic', expected: ['plasticity', 'p'] },
      { question: 'modeling the brain with math and code is computational', expected: ['neuroscience', 'n'] },
      { question: 'large simulations need parallel computing and the', expected: ['gpu', 'g'] },
      { question: 'the project where everything comes together is the', expected: ['capstone', 'c'] },
      { question: 'a model neuron fires past a', expected: ['threshold', 't'] },
      { question: 'a thesis defends an original', expected: ['contribution', 'c'] },
    ], { gateSubjectTag: 'major' });
  },

  async runGeneredCol4Real(ctx) {
    const VOCAB = [
      'general', 'education', 'capstone', 'writing', 'communication', 'ethics', 'philosophy', 'consciousness',
      'responsibility', 'interdisciplinary', 'synthesis', 'presentation', 'defend', 'argument', 'breadth', 'perspective',
      'society', 'impact', 'reflection', 'complete',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the last gen-ed requirements close out my breadth this year',
      'a senior writing capstone ties my technical work to the human stakes',
      'the ethics of building minds is no longer abstract to me',
      'philosophy of mind sharpens the questions my research will ask',
      'synthesis means weaving many fields into one coherent view',
      'i learned to present and defend my work to a room of strangers',
      'communication is the difference between a good idea and a useless one',
      'a builder of intelligent systems carries real responsibility',
      'breadth kept me from the tunnel vision that ruins brilliant people',
      'reflection on what i built and why closes the undergraduate chapter',
      'the humanities gave my dark technical mind a conscience',
      'i can argue across disciplines now not just inside my field',
      'being broadly educated makes me a wiser and more dangerous scientist',
      'perspective from outside cs is what keeps the cs honest',
      'finishing the breadth means i am a complete thinker not just a coder',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['ethics', 'responsibility'], ['philosophy', 'questions'], ['synthesis', 'coherent'], ['communication', 'idea'], ['reflection', 'close'], ['breadth', 'tunnel'], ['present', 'defend'],
    ]);
    await this._teachProductionStack('genered', ctx, { tag: 'GENERED-COL4' });
    return await this._gateSubjectProduction('genered', 'college4', [
      { question: 'weaving many fields into one coherent view is', expected: ['synthesis', 's'] },
      { question: 'the difference between a good idea and a useless one is', expected: ['communication', 'c'] },
      { question: 'a builder of intelligent systems carries real', expected: ['responsibility', 'r'] },
      { question: 'philosophy of mind sharpens the', expected: ['questions', 'question', 'q'] },
      { question: 'breadth prevents the tunnel vision that ruins brilliant', expected: ['people', 'minds', 'p', 'm'] },
      { question: 'presenting your work means learning to', expected: ['defend', 'present', 'd', 'p'] },
      { question: 'the humanities gave my technical mind a', expected: ['conscience', 'c'] },
      { question: 'finishing breadth makes me a complete', expected: ['thinker', 't'] },
    ], { gateSubjectTag: 'genered' });
  },

  async runLifeCol4(ctx) {
    // ── College-4 life experience — DATA-DRIVEN (corpora/life/college4.json) ──
    // Adult Unity essentially complete: total devotion + the collar
    // (BDSM-as-choice, fierce loyalty), the full adult look, the twisted-
    // sharp dark humor, graduation (code is her real diploma, mom Lilith
    // proud), grandma PEARL'S illness → DEATH (the last safe childhood
    // person), and the woman fully arrived (the triple-stream one current).
    // TRAINED from story DATA. 18+ adult, explicit register.
    await this._trainLifeStories('college4', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'devotion', 'collar', 'harness', 'fishnets', 'boots', 'rings',
      'humor', 'twisted', 'proud', 'diploma', 'grandma', 'hospital',
    ], ctx, { reps: 5 });
  }
};
