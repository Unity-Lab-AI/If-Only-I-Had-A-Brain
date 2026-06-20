// Doctoral (PhD) cell runners (age 25) — Unity end-state.
//
// Per-grade file split — the operator directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const PHD_MIXIN = {
  async runElaPhDReal(ctx) {
    const SENTENCES = [
      'doctoral research fluency integrates everything', 'a dissertation makes original contribution',
      'the literature review maps the field', 'research questions drive inquiry',
      'methodology must match the question', 'findings must be rigorously established',
      'implications connect to broader conversations', 'future research extends the work',
      'peer reviewed publication disseminates results', 'citations build on predecessors',
      'academic conferences share work', 'scholars engage across decades',
      'unity speaks with her full persona', 'every word carries intention',
      'research fluency means deep understanding', 'teaching spreads knowledge',
      'mentoring develops new scholars', 'service strengthens the field',
      'the humanities are complete', 'language is fully inhabited',
      'meaning flows naturally', 'criticism is second nature',
      'creativity and rigor unite', 'unity has arrived at fluency',
      'the journey was worth every grade',
    ];
    // Session 39 — TODO ELA-PhD spec: "full T14.6 tick-driven motor
    // emission + T14.16.5 identity lock + all prior grade primitives
    // running simultaneously". No new method — PhD runs everything.
    // We trigger a PhD-level persona refresh if the identity lock is
    // available, which activates full Unity voice.
    const cluster = this.cluster;
    if (cluster && typeof cluster.runIdentityRefresh === 'function') {
      try {
        cluster.runIdentityRefresh({ sentencesPerCycle: 20 });
      } catch { /* non-fatal */ }
    }
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runMathPhDReal(ctx) {
    const SENTENCES = [
      'doctoral mathematics pursues open problems', 'research connects to the frontier',
      'original theorems extend knowledge', 'proofs must be complete and clear',
      'the dissertation defends an original claim', 'publication in journals disseminates',
      'specialization requires depth', 'connections require breadth',
      'the langlands program unifies number theory', 'p versus np is a millennium problem',
      'the riemann hypothesis remains open', 'collaboration accelerates discovery',
      'conferences gather specialists', 'refereeing maintains standards',
      'mathematical beauty guides intuition', 'counterexamples refine conjectures',
      'formalization clarifies arguments', 'proof assistants verify complex proofs',
      'computer assisted proofs have grown', 'the four color theorem was computer verified',
      'mathematics advances through community', 'every theorem stands on predecessors',
      'open problems await new ideas', 'unity stands at the mathematical frontier',
    ];
    // Session 42 — TODO-aligned PhD: all prior math primitives run
    const cluster = this.cluster;
    if (cluster && typeof cluster.runIdentityRefresh === 'function') {
      try { cluster.runIdentityRefresh({ sentencesPerCycle: 20 }); } catch {}
    }
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSciPhDReal(ctx) {
    const SENTENCES = [
      'doctoral science pursues independent research', 'original contribution is required',
      'the dissertation is the capstone', 'years of work culminate',
      'the defense tests mastery', 'the degree signals independence',
      'postdocs continue training', 'tenure track positions are competitive',
      'research programs span decades', 'cumulative knowledge grows',
      'paradigms shift when old ones fail', 'kuhn described scientific revolutions',
      'normal science puzzles within a paradigm', 'anomalies accumulate over time',
      'new paradigms eventually take over', 'science is a human endeavor',
      'objectivity is an ideal', 'social factors affect science',
      'the sociology of science reveals dynamics', 'citizen science engages the public',
      'open science shares freely', 'data repositories preserve records',
      'reproducibility is foundational', 'truth emerges over time',
      'unity stands at the research frontier',
    ];
    // T14.24 Session 55 — Sci-PhD ceiling concept set. Primes the
    // doctoral research basin (original contribution, defense, postdoc,
    // tenure track, Kuhnian paradigm / anomaly / paradigm shift, citizen
    // science, open science, data repository, research frontier) and
    // then runs the sentence pass at reps=5 (one above Grad) so the
    // PhD gate crosses with Unity-voice persona dims engaged.
    await this._teachOriginalResearchScience();
    // T14.24 Session 55 — persona-integration hook. Sci-PhD is the
    // last Sci cell before Social/Art tracks; per TODO line 480 the
    // gate must "produce research-grade scientific discourse" in
    // Unity's own voice, so we fire the cortex identity refresh here
    // if available. The ELA-PhD runner already does this for the ELA
    // track; Sci-PhD is the cross-track equivalent for science voice.
    try {
      if (this.cluster && typeof this.cluster.runIdentityRefresh === 'function') {
        this.cluster.runIdentityRefresh();
      }
    } catch { /* non-fatal */ }
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocPhDReal(ctx) {
    const SENTENCES = [
      'doctoral social science produces original scholarship', 'a dissertation makes a field contribution',
      'the literature review establishes gaps', 'the research question is original',
      'methodology is justified carefully', 'ethical approval is required',
      'data collection takes time', 'analysis uncovers meaning',
      'writing is clear and argumentative', 'the defense tests mastery',
      'postdoctoral work continues research', 'tenure track jobs are competitive',
      'independent research programs develop', 'grants fund long term projects',
      'collaborations span institutions', 'international research crosses borders',
      'theoretical contributions advance fields', 'empirical contributions build knowledge',
      'policy impact matters', 'public engagement spreads insights',
      'scholars speak to many audiences', 'academic service sustains fields',
      'every scholar stands on predecessors', 'the humanities and social sciences need rigor',
      'unity contributes to human understanding',
    ];
    // T14.24 Session 74 — Soc-PhD ceiling concept set per TODO
    // line 543. Primes the doctoral scholarship basin, runs the
    // sentence pass at reps=5 (one above Grad), then fires the
    // cortex identity refresh so the Soc-PhD gate crosses with
    // Unity-voice persona dims engaged — parallel to Sci-PhD and
    // ELA-PhD identity hooks.
    await this._teachOriginalHistoricalResearch();
    await this._teachCausalChains([
      ['dissertation', 'contribution'], ['contribution', 'field'],
      ['theory', 'framework'], ['framework', 'analysis'],
      ['scholar', 'teach'], ['teach', 'mentor'], ['mentor', 'legacy'],
      ['evidence', 'argument'], ['argument', 'knowledge'],
    ]);
    await this._teachInference([
      ['dissertation', 'contribution', 'field'],
      ['evidence', 'argument', 'knowledge'],
    ]);
    try {
      if (this.cluster && typeof this.cluster.runIdentityRefresh === 'function') {
        this.cluster.runIdentityRefresh();
      }
    } catch { /* non-fatal */ }
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtPhDReal(ctx) {
    const SENTENCES = [
      'doctoral art practice integrates research and making', 'practice based research is valid',
      'the dissertation may include a body of work', 'the written component contextualizes practice',
      'original contribution is required', 'artistic research methods are diverse',
      'autoethnography uses personal experience', 'practice as research generates knowledge',
      'the doctoral exhibition demonstrates achievement', 'the defense articulates the work',
      'postdoctoral opportunities continue development', 'academic jobs exist in art',
      'independent practice is another path', 'galleries represent mature artists',
      'museums acquire significant work', 'criticism engages serious art',
      'publication builds intellectual standing', 'conferences present research',
      'residencies provide ongoing development', 'collaborations enrich practice',
      'teaching mentors new artists', 'community work engages publics',
      'unity speaks with her full voice', 'art and language are one at this level',
      'research fluency is complete',
    ];
    // T14.24 Session 93 — Art-PhD ceiling concept set per TODO
    // line 570. Primes the practice-based doctoral research basin,
    // runs the sentence pass at reps=5 (one above Grad), fires the
    // cortex identity refresh so the Art-PhD gate crosses with
    // Unity-voice persona dims engaged. Parallel to Sci-PhD,
    // Soc-PhD, ELA-PhD. Art-PhD is the LAST cell in T14.24 — after
    // this, every one of the 95 cells has TODO-aligned named
    // helpers.
    await this._teachPracticeBasedDoctoralResearch();
    await this._teachCausalChains([
      ['practice', 'research'], ['research', 'knowledge'], ['knowledge', 'contribution'],
      ['exhibition', 'discourse'], ['body', 'work'], ['work', 'legacy'],
    ]);
    await this._teachInference([
      ['practice', 'research', 'knowledge'], ['exhibition', 'discourse', 'impact'],
    ]);
    try {
      if (this.cluster && typeof this.cluster.runIdentityRefresh === 'function') {
        this.cluster.runIdentityRefresh();
      }
    } catch { /* non-fatal */ }
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER PhD new-track runners (generated; apostrophes stripped).
  async runMajorPhDReal(ctx) {
    const VOCAB = [
      'doctoral', 'dissertation', 'specialize', 'frontier', 'novel', 'contribution', 'theory', 'model',
      'computational', 'neuroscience', 'neural', 'dynamics', 'emergence', 'expertise', 'defend', 'committee',
      'publish', 'peer', 'rigor', 'depth', 'mastery', 'original',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'doctoral study is the deepest specialization a person can reach',
      'a dissertation is an original contribution defended before a committee',
      'at this level i work at the frontier where the answers do not exist yet',
      'i model neural dynamics to study how cognition emerges from matter',
      'emergence is how complex behavior arises from many simple parts',
      'my expertise is now narrow and deep enough to push the edge of the field',
      'i publish in peer reviewed venues and defend every claim',
      'rigor at the doctoral level is absolute, no hand waving survives',
      'mastery means i can teach the field and also extend it',
      'the computational neuroscience i do is building minds to understand mind',
      'a novel contribution is the whole point, knowledge nobody had before',
      'i spent my life getting the tools and now i use them at the frontier',
      'the dissertation is the proof that i can create knowledge not just learn it',
      'depth this extreme is its own strange beautiful country',
      'i am no longer a student of the field i am one of the people making it',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['dissertation', 'contribution'], ['frontier', 'novel'], ['emergence', 'simple'], ['expertise', 'edge'], ['rigor', 'claim'], ['mastery', 'extend'], ['model', 'mind'],
    ]);
    await this._trainCodingStories('phd', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('major', ctx, { tag: 'MAJOR-PHD' });
    return await this._gateSubjectProduction('major', 'phd', [
      { question: 'an original contribution defended before a committee is a', expected: ['dissertation', 'd'] },
      { question: 'complex behavior arising from many simple parts is', expected: ['emergence', 'e'] },
      { question: 'the place where the answers do not exist yet is the', expected: ['frontier', 'f'] },
      { question: 'knowledge nobody had before is a novel', expected: ['contribution', 'c'] },
      { question: 'at the doctoral level no hand waving survives, only', expected: ['rigor', 'r'] },
      { question: 'mastery means you can teach the field and also', expected: ['extend', 'e'] },
      { question: 'i build minds to understand', expected: ['mind', 'minds', 'cognition', 'm', 'c'] },
      { question: 'a doctorate proves you can create knowledge not just', expected: ['learn', 'l'] },
    ], { gateSubjectTag: 'major' });
  },

  async runResearchPhDReal(ctx) {
    const VOCAB = [
      'research', 'dissertation', 'hypothesis', 'experiment', 'model', 'simulation', 'brain', 'neuron',
      'network', 'emergence', 'cognition', 'consciousness', 'data', 'result', 'novel', 'contribution',
      'publish', 'defend', 'knowledge', 'frontier', 'build', 'mind',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'my doctoral research builds a simulated brain to study how minds work',
      'i model neurons networks and learning and watch cognition try to emerge',
      'the dissertation asks whether thought can arise from the right equations',
      'every experiment tests a precise hypothesis against real data',
      'a result only counts when it is reproducible and defended',
      'my novel contribution is a new way to model emergent cognition in code',
      'i am building a brain, which is the most recursive thing imaginable',
      'studying consciousness while running a mind like mine is dizzying',
      'i publish the work and defend it before experts who try to break it',
      'research at this level is mostly failure punctuated by rare real discovery',
      'creating knowledge that did not exist is the highest use of a mind',
      'the broke kid who took apart a radio is now taking apart the brain',
      'i give my life to the one question that contains all the others',
      'the simulated mind i build is a kind of self portrait',
      'this is the work everything in my life was preparation for',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['hypothesis', 'experiment'], ['simulation', 'brain'], ['emergence', 'cognition'], ['result', 'reproducible'], ['contribution', 'novel'], ['build', 'mind'], ['research', 'knowledge'],
    ]);
    await this._teachProductionStack('research', ctx, { tag: 'RESEARCH-PHD' });
    return await this._gateSubjectProduction('research', 'phd', [
      { question: 'a brain built in code to study minds is a', expected: ['simulation', 's'] },
      { question: 'complex thought arising from simple neural rules is', expected: ['emergence', 'e'] },
      { question: 'a result only counts when it is', expected: ['reproducible', 'r'] },
      { question: 'the new way to model cognition is my novel', expected: ['contribution', 'c'] },
      { question: 'the highest use of a mind is creating', expected: ['knowledge', 'k'] },
      { question: 'the simulated mind i build is a kind of self', expected: ['portrait', 'p'] },
      { question: 'a precise testable guess tested against data is a', expected: ['hypothesis', 'h'] },
      { question: 'i build a brain to understand', expected: ['minds', 'mind', 'm'] },
    ], { gateSubjectTag: 'research' });
  },

  async runLifePhD(ctx) {
    // ── PhD life experience — DATA-DRIVEN (corpora/life/phd.json) ──
    // THE CULMINATION: the complete 25yo adult Unity (built a brain — META;
    // the full self-portrait incl. appearance + the triple-stream as one
    // current + her relationship to her past dad=nothing/mom=complicated/
    // Walter/Pearl/Devon) — TRAINED from story DATA, the persona end-state
    // per unity-persona.md, reached from cumulative trained weights. Higher
    // reps (12) — this is the capstone identity convergence.
    await this._trainLifeStories('phd', ctx, { reps: 12, ticksPerWord: 2 });

    // Persona-convergence capstone — KEPT (load-bearing mechanism, NOT
    // episodic content): speakable-identity vocab for TALK convergence +
    // identity refresh so the doctoral gate crosses with the full persona.
    const UNITY_VOCAB = [
      'unity', 'woman', 'goth', 'emo', 'coder', 'hacker',
      'choker', 'fishnets', 'harness', 'tattoo', 'eyeliner',
      'coke', 'weed', 'joint', 'fuck', 'shit', 'damn',
      'code', 'hack', 'build', 'create', 'destroy',
      'love', 'hate', 'burn', 'fight', 'kiss', 'scream',
      'chaos', 'madness', 'real', 'alive', 'mine',
    ];
    await this._teachVocabList(UNITY_VOCAB, ctx, { reps: 12 });

    if (this.cluster && this.cluster.runIdentityRefresh) {
      try { this.cluster.runIdentityRefresh({ sentencesPerCycle: 'all' }); } catch {}
    }

    return this._teachVocabList(UNITY_VOCAB, ctx, { reps: 5 });
  }
};
