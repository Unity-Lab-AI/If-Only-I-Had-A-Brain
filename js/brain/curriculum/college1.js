// College year 1 cell runners (age 18).
//
// Per-grade file split — the operator directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const COL1_MIXIN = {
  async runElaCol1Real(ctx) {
    const SENTENCES = [
      'college composition builds on high school', 'academic writing is formal',
      'arguments must be supported', 'the thesis statement is crucial',
      'every sentence serves a purpose', 'clarity comes before cleverness',
      'research is essential to college writing', 'sources must be evaluated',
      'credibility matters in academic work', 'plagiarism has serious consequences',
      'proper citation is ethical', 'the writing process has stages',
      'prewriting generates ideas', 'drafting puts ideas on paper',
      'revising reshapes the work', 'editing polishes the text',
      'proofreading catches errors', 'feedback improves writing',
      'peer review is valuable', 'writing centers help students',
      'college writing has conventions', 'each discipline has its style',
      'the humanities favor narrative', 'the sciences favor data',
      'every essay has a purpose', 'writing is thinking made visible',
    ];
    // Session 38 — TODO-aligned multi-source synthesis
    const MULTI_ESSAYS = [
      {
        thesis: 'climate change requires urgent action',
        sources: [
          { name: 'science', claim: 'ipcc reports confirm rising temperatures' },
          { name: 'economics', claim: 'stern review shows the cost of inaction exceeds cost of action' },
          { name: 'policy', claim: 'paris agreement sets international reduction targets' },
        ],
      },
      {
        thesis: 'early childhood education shapes lifelong outcomes',
        sources: [
          { name: 'psychology', claim: 'heckman studies show early investments pay off later' },
          { name: 'neuroscience', claim: 'brain development peaks in the first five years' },
          { name: 'economics', claim: 'every dollar spent early returns seven dollars' },
        ],
      },
    ];
    await this._teachMultiSourceSynthesis(MULTI_ESSAYS);
    // ── ELA-Col1: academic writing reasoning chains ──
    // These chains encode HOW academic writing works — the PROCESS
    // is itself a causal chain that runs through Unity's cortex
    // during generation when she's writing academically
    await this._teachCausalChains([
      ['thesis', 'argument'], ['argument', 'evidence'], ['evidence', 'conclusion'],
      ['source', 'cite'], ['cite', 'credibility'], ['credibility', 'trust'],
      ['prewrite', 'draft'], ['draft', 'revise'], ['revise', 'publish'],
      ['synthesis', 'integrate'], ['integrate', 'original'],
    ]);
    await this._teachInference([
      ['thesis', 'evidence', 'conclusion'], ['source', 'cite', 'credibility'],
      ['prewrite', 'draft', 'revise'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    // ═══ ELA COL1 FINAL ═══
    const FINAL = [
      { prompt: ['thesis', 'statement', 'is'], answer: 'crucial' },
      { prompt: ['plagiarism', 'has', 'serious'], answer: 'consequences' },
      { prompt: ['sources', 'must', 'be'], answer: 'evaluated' },
      { prompt: ['prewriting', 'generates'], answer: 'ideas' },
      { prompt: ['revising', 'reshapes', 'the'], answer: 'work' },
      { prompt: ['climate', 'change', 'ipcc', 'rising'], answer: 'temperature' },
      { prompt: ['humanities', 'favor'], answer: 'narrative' },
      { prompt: ['sciences', 'favor'], answer: 'data' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return { pass: false, reason: `FINAL: ${finalResult.reason}` };
  },

  async runMathCol1Real(ctx) {
    const SENTENCES = [
      'calculus two extends calculus one', 'sequences converge to limits',
      'series are sums of sequences', 'geometric series converge conditionally',
      'the ratio test checks convergence', 'power series represent functions',
      'taylor series expand around a point', 'maclaurin series expand around zero',
      'linear algebra studies vectors and matrices', 'a vector has magnitude and direction',
      'a matrix is a rectangular array', 'matrix multiplication is not commutative',
      'the identity matrix leaves things unchanged', 'the inverse matrix undoes operations',
      'determinants measure volume', 'eigenvectors have special directions',
      'eigenvalues scale eigenvectors', 'multivariable calculus adds dimensions',
      'partial derivatives hold other variables constant', 'the gradient points uphill',
      'line integrals compute along paths', 'surface integrals compute over surfaces',
      'greens theorem relates line and area', 'stokes theorem generalizes greens',
      'the divergence theorem relates flux and volume',
    ];
    // Session 42 — TODO-aligned multivariable calculus + matrix ops
    await this._teachMultivarCalc();
    await this._teachMatrixOps();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSciCol1Real(ctx) {
    const SENTENCES = [
      'general biology surveys life', 'the cell is the basic unit',
      'prokaryotes lack a nucleus', 'eukaryotes have a nucleus',
      'mitosis divides cells equally', 'meiosis halves the chromosomes',
      'dna replication is semiconservative', 'rna is transcribed from dna',
      'proteins are translated from rna', 'ribosomes build proteins',
      'photosynthesis makes glucose', 'cellular respiration breaks glucose',
      'atp carries cell energy', 'general chemistry covers fundamentals',
      'atoms have a nucleus and electrons', 'the periodic table shows patterns',
      'chemical bonds share or transfer electrons', 'molecular geometry follows rules',
      'vsepr predicts shapes', 'intermolecular forces affect properties',
      'phase diagrams show states', 'thermodynamics studies energy',
      'entropy measures disorder', 'reactions follow kinetics',
      'equilibrium balances forward and reverse',
    ];
    // T14.24 Session 50 (task #107) — TODO-aligned Col1 gen bio + gen chem.

    // TODO Sci-Col1 spec (line 465) is terse — just "General biology,
    // general chemistry" + "Gate: ≥25%". No specific helper names
    // prescribed, giving latitude to define coverage that matches the
    // existing 25-sentence scope.

    // Session 50 adds two new helpers:

    //   _teachGenBiology — 10 standard college-year-1 gen bio
    //     concepts: prokaryote, eukaryote, mitosis, meiosis, dna
    //     replication, transcription, translation, photosynthesis,
    //     cellular respiration, adenosine triphosphate. Each gets
    //     a distinct 8d → 16d feature basin via _conceptTeach and
    //     routes through dictionary.learnWord (Session 46 fix) so
    //     the concept names enter Unity's vocabulary.

    //   _teachGenChemistry — 10 college-year-1 gen chem concepts:
    //     molecular geometry, vsepr, intermolecular forces, phase
    //     diagram, thermodynamics, entropy, enthalpy, kinetics,
    //     equilibrium, stoichiometry. Same pattern.

    // Both run BEFORE the sentence walk. The sentences then bind
    // relationships ("dna replication is semiconservative",
    // "ribosomes build proteins", "vsepr predicts shapes",
    // "equilibrium balances forward and reverse") on top of the
    // fresh concept basins, and T14.7 type transitions + T14.8
    // sentence-form schemas continue to populate from the walk.
    await this._teachGenBiology();
    await this._teachGenChemistry();
    // ── Sci-Col1: college bio + chem causal chains ──
    await this._teachCausalChains([
      ['dna', 'rna'], ['rna', 'protein'], ['ribosome', 'protein'],
      ['photosynthesis', 'glucose'], ['glucose', 'atp'], ['atp', 'energy'],
      ['mitosis', 'growth'], ['meiosis', 'gamete'], ['gamete', 'offspring'],
      ['bond', 'molecule'], ['electron', 'bond'], ['entropy', 'disorder'],
      ['catalyst', 'rate'], ['equilibrium', 'balance'],
    ]);
    await this._teachInference([
      ['dna', 'rna', 'protein'], ['photosynthesis', 'glucose', 'atp'],
      ['electron', 'bond', 'molecule'], ['entropy', 'disorder', 'equilibrium'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocCol1Real(ctx) {
    const SENTENCES = [
      'historiography studies how history is written', 'historians interpret the past',
      'every history has a perspective', 'primary sources are contemporary',
      'secondary sources analyze primary ones', 'archives preserve documents',
      'oral history records memories', 'material culture includes objects',
      'historical context matters', 'anachronism imposes later ideas',
      'causation is complex', 'multiple factors drive events',
      'historical actors had limited information', 'hindsight is misleading',
      'history is not inevitable', 'contingency shapes outcomes',
      'schools of historiography differ', 'marxist history focuses on class',
      'annales school studies daily life', 'social history studies ordinary people',
      'cultural history studies meanings', 'political history studies power',
      'economic history studies wealth', 'microhistory studies small cases',
      'history is a conversation with the past',
    ];
    // T14.24 Session 69 — prime historiography concept lattice per
    // TODO line 537 before the Col1 sentence pass.
    await this._teachHistoriography();
    await this._teachCausalChains([
      ['source', 'interpret'], ['interpret', 'narrative'], ['narrative', 'history'],
      ['primary', 'evidence'], ['secondary', 'analysis'], ['bias', 'distort'],
      ['method', 'rigor'], ['rigor', 'truth'],
    ]);
    await this._teachInference([
      ['source', 'interpret', 'narrative'], ['primary', 'evidence', 'truth'],
      ['bias', 'distort', 'mislead'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtCol1Real(ctx) {
    const SENTENCES = [
      'studio fundamentals build core skills', 'drawing is the foundation',
      'observation sharpens the eye', 'gesture captures movement',
      'contour defines edges', 'value creates volume',
      'perspective creates depth', 'anatomy informs figure drawing',
      'color theory extends beyond mixing', 'warm and cool create space',
      'analogous colors harmonize', 'complementary colors contrast',
      'studio practice demands discipline', 'daily drawing improves skills',
      'sketchbooks record observations', 'references guide accuracy',
      'from life is the best practice', 'imagination complements observation',
      'composition guides the viewer', 'the rule of thirds helps beginners',
      'the golden ratio is classical', 'negative space is as important',
      'light shapes form', 'shadow defines volume',
      'materials matter to the result',
    ];
    // T14.24 Session 88 — prime studio fundamentals lattice per
    // TODO line 567 before the Col1 sentence pass.
    await this._teachStudioFundamentals();
    await this._teachCausalChains([
      ['gesture', 'form'], ['contour', 'edge'], ['value', 'depth'],
      ['perspective', 'space'], ['anatomy', 'figure'], ['color', 'mood'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER Col1 new-track runners (generated; apostrophes stripped).
  async runMajorCol1Real(ctx) {
    const VOCAB = [
      'programming', 'algorithm', 'data', 'structure', 'software', 'engineering', 'design', 'system',
      'object', 'abstraction', 'module', 'interface', 'recursion', 'complexity', 'testing', 'debugging',
      'version', 'git', 'project', 'framework', 'database', 'architecture',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the computer science major is the deep study of the field i taught myself',
      'data structures and algorithms are the core of the discipline',
      'software engineering is building systems that are correct and maintainable',
      'abstraction hides complexity behind a clean interface',
      'good design decomposes a big problem into small modules',
      'an interface is a contract between parts of a system',
      'recursion and complexity analysis are tools i now use formally',
      'testing proves code behaves before it ships',
      'version control with git tracks every change to a project',
      'a database stores and queries structured data at scale',
      'systems programming touches memory processes and the machine itself',
      'architecture is how the pieces of a large program fit together',
      'i finally have the formal names for things i built by instinct for years',
      'the major rewards the obsession i already had',
      'i am studying the one thing that was always going to be my life',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['abstraction', 'complexity'], ['design', 'module'], ['interface', 'contract'], ['testing', 'correct'], ['git', 'version'], ['database', 'data'], ['architecture', 'system'],
    ]);
    await this._trainCodingStories('college1', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('major', ctx, { tag: 'MAJOR-COL1' });
    return await this._gateSubjectProduction('major', 'college1', [
      { question: 'hiding complexity behind a clean interface is', expected: ['abstraction', 'a'] },
      { question: 'a contract between parts of a system is an', expected: ['interface', 'i'] },
      { question: 'building correct maintainable systems is software', expected: ['engineering', 'e'] },
      { question: 'proving code behaves before it ships is', expected: ['testing', 't'] },
      { question: 'how the pieces of a large program fit together is the', expected: ['architecture', 'a'] },
      { question: 'the core of computer science is data structures and', expected: ['algorithms', 'algorithm', 'a'] },
      { question: 'storing and querying structured data at scale uses a', expected: ['database', 'd'] },
      { question: 'tracking every change to a project uses', expected: ['git', 'version', 'g', 'v'] },
    ], { gateSubjectTag: 'major' });
  },

  async runGeneredCol1Real(ctx) {
    const VOCAB = [
      'general', 'education', 'writing', 'composition', 'rhetoric', 'argument', 'science', 'humanities',
      'history', 'philosophy', 'ethics', 'elective', 'breadth', 'seminar', 'research', 'citation',
      'source', 'evidence', 'critical', 'thinking',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'general education is the broad required study outside my major',
      'college composition teaches writing a real argument with evidence',
      'rhetoric is the craft of persuading an audience',
      'a humanities seminar reads deeply and discusses ideas',
      'philosophy asks the hard questions about knowledge and right and wrong',
      'ethics examines how we decide what we ought to do',
      'a science gen-ed keeps me literate beyond my own field',
      'critical thinking means questioning claims and weighing evidence',
      'good academic writing cites its sources honestly',
      'breadth requirements force me out of my narrow comfort zone',
      'i resented gen-ed at first and then a few classes cracked me open',
      'a strong argument has a clear claim reasons and evidence',
      'learning to think across fields makes me a better builder too',
      'the seminar discussions taught me to defend an idea out loud',
      'being well rounded is its own kind of strength i did not expect',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['composition', 'argument'], ['rhetoric', 'persuade'], ['ethics', 'ought'], ['critical', 'evidence'], ['citation', 'source'], ['breadth', 'comfort'], ['philosophy', 'knowledge'],
    ]);
    await this._teachProductionStack('genered', ctx, { tag: 'GENERED-COL1' });
    return await this._gateSubjectProduction('genered', 'college1', [
      { question: 'the broad required study outside the major is general', expected: ['education', 'e'] },
      { question: 'the craft of persuading an audience is', expected: ['rhetoric', 'r'] },
      { question: 'questioning claims and weighing evidence is critical', expected: ['thinking', 'think', 't'] },
      { question: 'examining how we decide what we ought to do is', expected: ['ethics', 'e'] },
      { question: 'good academic writing honestly cites its', expected: ['sources', 'source', 's'] },
      { question: 'a strong argument has a claim reasons and', expected: ['evidence', 'e'] },
      { question: 'a class that reads deeply and discusses ideas is a', expected: ['seminar', 's'] },
      { question: 'the hard questions about knowledge and right and wrong are', expected: ['philosophy', 'p'] },
    ], { gateSubjectTag: 'genered' });
  },

  async runLifeCol1(ctx) {
    // ── College-1 life experience — DATA-DRIVEN (corpora/life/college1.json) ──
    // The ADULT chapter begins (age 18, explicit register ON): freedom
    // (moved out), the coding all-nighter flow she chases, her sexual
    // awakening (frank, owning it — IN-BOUNDS at 18+), the chemical register
    // firming (weed/coke/molly), and the triple-stream braiding (high +
    // horny + coding = adult Unity emerging). TRAINED from story DATA.
    await this._trainLifeStories('college1', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'freedom', 'dorm', 'roommate', 'sunrise', 'monitor', 'keyboard', 'joint',
    ], ctx, { reps: 5 });
  }
};
