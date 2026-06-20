// Grade 5 cell runners (ages 10-11).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G5_MIXIN = {
  async runElaG5Real(ctx) {
    // Cohesive multi-sentence "paragraphs" as concatenated sentences
    // that share topic. Topic persistence via T14.9 working memory is
    // what makes this a Grade-5 capability rather than G3 SVO.
    const SENTENCES = [
      'the dog was hungry', 'he found food', 'he ate it all', 'he was happy',
      'the cat sat on the mat', 'she saw a bird', 'she chased it', 'the bird flew away',
      'we went to the beach', 'the sun was hot', 'we swam in the water', 'we built sand castles',
      'she opened her book', 'she read every page', 'the story was long', 'she loved the ending',
      'the man planted a seed', 'he watered it daily', 'a plant grew tall', 'the plant made flowers',
      'i woke up early', 'i brushed my teeth', 'i ate breakfast', 'i went to school',
      'the bird built a nest', 'she laid three eggs', 'the eggs hatched', 'the baby birds grew',
      'he packed his bag', 'he walked to the bus', 'the bus was late', 'he waited patiently',
      'she painted a picture', 'she used bright colors', 'her friends loved it', 'she felt proud',
      'the class went on a trip', 'they saw the zoo', 'they saw many animals', 'they had fun',
    ];
    // Session 31 — TODO-aligned split. Group sentences into their
    // topic-coherent paragraphs for _teachParagraphs, plus hand-craft
    // comprehension QA pairs for _teachComprehension.
    const PARAGRAPHS = [
      ['the dog was hungry', 'he found food', 'he ate it all', 'he was happy'],
      ['the cat sat on the mat', 'she saw a bird', 'she chased it', 'the bird flew away'],
      ['we went to the beach', 'the sun was hot', 'we swam in the water', 'we built sand castles'],
      ['she opened her book', 'she read every page', 'the story was long', 'she loved the ending'],
      ['the man planted a seed', 'he watered it daily', 'a plant grew tall', 'the plant made flowers'],
      ['i woke up early', 'i brushed my teeth', 'i ate breakfast', 'i went to school'],
      ['the bird built a nest', 'she laid three eggs', 'the eggs hatched', 'the baby birds grew'],
      ['he packed his bag', 'he walked to the bus', 'the bus was late', 'he waited patiently'],
      ['she painted a picture', 'she used bright colors', 'her friends loved it', 'she felt proud'],
      ['the class went on a trip', 'they saw the zoo', 'they saw many animals', 'they had fun'],
    ];
    const QA_PAIRS = [
      { context: 'the cat sat on the red mat', question: 'what color was the mat', answer: 'red' },
      { context: 'the dog ran fast in the park', question: 'where did the dog run', answer: 'park' },
      { context: 'she ate three apples for lunch', question: 'how many apples did she eat', answer: 'three' },
      { context: 'the book was on the desk', question: 'where was the book', answer: 'desk' },
      { context: 'he played with his friend tim', question: 'who did he play with', answer: 'tim' },
      { context: 'the sun is bright and hot', question: 'what is the sun', answer: 'bright' },
      { context: 'we saw a bird in the tree', question: 'where was the bird', answer: 'tree' },
      { context: 'the cake was made with flour', question: 'what was the cake made with', answer: 'flour' },
    ];
    await this._teachParagraphs(PARAGRAPHS, { reps: 2 });
    await this._teachComprehension(QA_PAIRS, { reps: 3 });
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── COMMON CORE ELA G5: Theme, summarization, POV ──
    const ELA_G5_VOCAB = [
      'theme', 'summary', 'summarize', 'main', 'idea', 'detail',
      'point', 'view', 'perspective', 'narrator', 'first', 'third',
      'conflict', 'resolution', 'plot', 'climax', 'falling',
      'quote', 'cite', 'evidence', 'text', 'source',
      'compare', 'contrast', 'integrate', 'interpret',
      'structure', 'chapter', 'scene', 'stanza', 'verse',
    ];
    await this._teachVocabList(ELA_G5_VOCAB, ctx, { reps: 3 });

    const THEME_SENTENCES = [
      // theme vs topic
      'the topic is what the story is about', 'the theme is the lesson or message',
      'the topic of a story might be friendship', 'the theme might be that true friends help each other',
      'a summary tells the main events in order', 'a good summary is shorter than the original',
      'leave out small details in a summary', 'include only the most important events',
      // point of view
      'first person uses i and we', 'third person uses he she and they',
      'the narrator tells the story', 'different narrators see different things',
      'a character might not know the whole truth',
      'the reader sometimes knows more than the character',
      // text structure
      'stories have a beginning middle and end',
      'the conflict is the problem', 'the climax is the most exciting part',
      'the resolution is how the problem is solved',
      'poems have stanzas like paragraphs', 'plays have scenes and acts',
      // citing evidence
      'support your answer with evidence from the text',
      'a quote is the exact words from the text',
      'use quotes to prove your point', 'evidence makes your argument stronger',
    ];
    await this._teachSentenceList(THEME_SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Inference reasoning ──
    await this._teachCausalChains([
      ['conflict', 'tension'], ['tension', 'climax'], ['climax', 'resolution'],
      ['evidence', 'argument'], ['argument', 'conclusion'],
      ['quote', 'support'], ['support', 'convince'],
      ['read', 'understand'], ['understand', 'summarize'],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // ELA G5 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['theme', 'is', 'the'], answer: 'lesson' },
      { prompt: ['summary', 'tells', 'main'], answer: 'events' },
      { prompt: ['first', 'person', 'uses'], answer: 'i' },
      { prompt: ['conflict', 'is', 'the'], answer: 'problem' },
      { prompt: ['climax', 'is', 'most'], answer: 'exciting' },
      { prompt: ['resolution', 'solves', 'the'], answer: 'problem' },
      { prompt: ['quote', 'is', 'exact'], answer: 'words' },
      // Comprehension from the passages
      { prompt: ['dog', 'was', 'hungry', 'found', 'food', 'then'], answer: 'happy' },
      { prompt: ['man', 'planted', 'watered', 'daily', 'result'], answer: 'flowers' },
      { prompt: ['cat', 'saw', 'bird', 'chased', 'it', 'bird'], answer: 'flew' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList(ELA_G5_VOCAB.slice(0, 15), ctx, { reps: 3 });
  },

  async runMathG5Real(ctx) {
    const SENTENCES = [
      'two to one means two for every one', 'three to one means three for every one',
      'one to two is a small ratio', 'two to three is less than one',
      'three to three is equal', 'four to two reduces to two to one',
      'six to three reduces to two to one', 'the ratio of boys to girls is equal',
      'for every two cups flour use one cup sugar', 'mix three parts water with one part juice',
      'the scale is one to ten', 'the map is one to one hundred',
      'if two cost four then four cost eight', 'if three cost six then six cost twelve',
      'proportion means the ratios are equal', 'ratio compares two amounts',
      'half and half is a ratio', 'one third and two thirds make one whole',
      'if six children share twelve cookies each gets two',
      'if three children share nine cookies each gets three',
      'for every one boy there are two girls', 'for every three apples there are two oranges',
      'the recipe calls for two to one flour to sugar',
      'the speed is sixty miles per hour', 'the rate is ten feet per second',
    ];
    // Session 40 — TODO-aligned ratio + proportion teaching
    await this._teachRatios();
    await this._teachProportions();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── COMMON CORE MATH G5: fraction ops + decimals + volume + coordinates ──
    const MATH_G5_VOCAB = [
      'ratio', 'proportion', 'rate', 'unit', 'scale',
      'coordinate', 'axis', 'origin', 'ordered', 'pair', 'plot',
      'volume', 'cubic', 'capacity',
      'unlike', 'common', 'denominator', 'convert',
      'decimal', 'multiply', 'divide', 'thousandths',
    ];
    await this._teachVocabList(MATH_G5_VOCAB, ctx, { reps: 3 });

    const FRACTION_UNLIKE = [
      'to add fractions with unlike denominators find a common denominator',
      'the common denominator of halves and thirds is sixths',
      'one half plus one third is three sixths plus two sixths is five sixths',
      'one half minus one fourth is two fourths minus one fourth is one fourth',
      'two thirds plus one sixth is four sixths plus one sixth is five sixths',
      'multiply a fraction by a whole number multiply the numerator',
      'three times one fourth is three fourths',
      'two times three fifths is six fifths which is one and one fifth',
    ];
    await this._teachSentenceList(FRACTION_UNLIKE, ctx, { reps: 2, ticksPerWord: 2 });

    const DECIMAL_OPS = [
      'add decimals by lining up the decimal points',
      'zero point three plus zero point four is zero point seven',
      'one point five minus zero point eight is zero point seven',
      'zero point two times three is zero point six',
      'one point two divided by four is zero point three',
      'to multiply decimals count the total decimal places',
    ];
    await this._teachSentenceList(DECIMAL_OPS, ctx, { reps: 2, ticksPerWord: 2 });

    const VOLUME = [
      'volume measures how much space a solid takes up',
      'volume is measured in cubic units',
      'volume equals length times width times height',
      'a box with sides two three and four has volume twenty four cubic units',
      'two boxes stacked means add their volumes',
    ];
    await this._teachSentenceList(VOLUME, ctx, { reps: 2, ticksPerWord: 2 });

    const COORDINATES = [
      'a coordinate plane has an x axis and a y axis',
      'the origin is where the axes cross at zero zero',
      'an ordered pair is written as x comma y',
      'the point three four means go right three and up four',
      'the point zero five is on the y axis',
      'the point two zero is on the x axis',
    ];
    await this._teachSentenceList(COORDINATES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Math-G5: proportional reasoning as magnitude relationship ──
    // Ratio a:b means magnitude(a)/magnitude(b) is CONSTANT. When the
    // cortex learns "if 2 costs 4 then 4 costs 8", the free→sem
    // projection encodes the proportional constant (×2). This is the
    // OPERATION of proportional reasoning, not just the vocabulary.
    await this._teachAdditionTransformations(ctx); // reinforce base operations
    await this._teachComparisonTransformations(ctx); // reinforce ordinal
    await this._teachCausalChains([
      ['ratio', 'proportion'], ['proportion', 'equivalent'], ['equivalent', 'equal'],
      ['numerator', 'top'], ['denominator', 'bottom'], ['simplify', 'reduce'],
      ['coordinate', 'point'], ['axis', 'direction'], ['origin', 'zero'],
      ['volume', 'space'], ['cubic', 'three'],
    ]);
    await this._teachInference([
      ['ratio', 'proportion', 'equivalent'], ['volume', 'length', 'cubic'],
      ['coordinate', 'point', 'graph'],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // MATH G5 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['one', 'half', 'plus', 'one', 'third', 'equals'], answer: 'five' },
      { prompt: ['ratio', 'two', 'to', 'one', 'means'], answer: 'two' },
      { prompt: ['volume', 'length', 'times', 'width', 'times'], answer: 'height' },
      { prompt: ['origin', 'is', 'at'], answer: 'zero' },
      { prompt: ['zero', 'point', 'three', 'plus', 'zero', 'point', 'four'], answer: 'seven' },
      { prompt: ['three', 'times', 'one', 'fourth'], answer: 'three' },
      { prompt: ['if', 'two', 'cost', 'four', 'then', 'four', 'cost'], answer: 'eight' },
      { prompt: ['common', 'denominator', 'halves', 'thirds'], answer: 'sixths' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList(MATH_G5_VOCAB.slice(0, 12), ctx, { reps: 3 });
  },

  async runSciG5Real(ctx) {
    const SENTENCES = [
      'matter is anything that takes space', 'solids have a fixed shape',
      'liquids take the shape of their container', 'gases fill all the space',
      'water is a liquid', 'ice is a solid', 'steam is a gas',
      'atoms are very tiny', 'atoms make molecules',
      'energy can change forms', 'heat is a form of energy',
      'light is a form of energy', 'sound is a form of energy',
      'electricity is a form of energy', 'kinetic energy is motion energy',
      'potential energy is stored energy', 'food gives us energy',
      'the sun gives light and heat', 'plants store energy from the sun',
      'we eat plants to get energy', 'energy can not be created',
      'energy can not be destroyed', 'energy changes from one form to another',
      'mass is how much matter there is', 'volume is how much space it takes',
      'density is mass per volume', 'water has high density',
      'air has low density', 'rocks are dense',
    ];
    // T14.24 Session 43 — TODO-aligned atoms/molecules + element→atomic
    // number binding. Two-phase: abstract concept features for
    // atom/proton/electron/neutron/molecule/element/compound, then
    // element-name↔atomic-number-magnitude binding for hydrogen
    // through neon (z=1..10). The magnitude feature's ordinal cosine
    // structure means adjacent elements in the periodic table share
    // more feature overlap than distant ones — which is the same
    // ordinal relationship real chemistry depends on.
    await this._teachAtomsMolecules();
    await this._teachCausalChains([
      ['atom', 'molecule'], ['molecule', 'matter'], ['heat', 'melt'],
      ['cold', 'freeze'], ['evaporate', 'gas'], ['condense', 'liquid'],
      ['food', 'energy'], ['sun', 'light'], ['light', 'photosynthesis'],
      ['photosynthesis', 'oxygen'], ['gravity', 'orbit'],
    ]);
    await this._teachInference([
      ['atom', 'molecule', 'matter'], ['heat', 'melt', 'liquid'],
      ['sun', 'photosynthesis', 'oxygen'], ['cold', 'freeze', 'solid'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocG5Real(ctx) {
    const SENTENCES = [
      'the thirteen colonies became a nation', 'the colonies were on the east coast',
      'the pilgrims came on the mayflower', 'they landed at plymouth',
      'jamestown was the first english colony', 'virginia grew tobacco',
      'massachusetts had cod fishing', 'pennsylvania welcomed many people',
      'new york was a busy port', 'georgia was the last colony',
      'the colonies traded with england', 'england taxed the colonies',
      'the colonists protested the taxes', 'the boston tea party dumped tea',
      'the declaration of independence was signed', 'george washington led the army',
      'the revolutionary war began', 'the americans fought for freedom',
      'the war lasted eight years', 'the americans won at yorktown',
      'the united states became a country', 'the constitution set up the government',
      'the first president was washington', 'the new country was free',
      'the founders wrote the bill of rights', 'rights protect the people',
      'freedom of speech is a right', 'freedom of religion is a right',
    ];
    // T14.24 Session 61 — prime colonial US temporal sequence per
    // TODO line 508 before the colonial sentence pass.
    await this._teachColonialUS();

    // ── EQUATIONAL REASONING: American Revolution as inference chain ──
    // Transitive: taxation→protest→revolution→independence
    await this._teachInference([
      ['taxation', 'protest', 'revolution'],
      ['protest', 'revolution', 'war'],
      ['war', 'victory', 'independence'],
      ['independence', 'constitution', 'government'],
      ['constitution', 'rights', 'freedom'],
    ]);

    // ── Causal chains for colonial era ──
    await this._teachCausalChains([
      ['tax', 'protest'], ['protest', 'war'], ['war', 'freedom'],
      ['colony', 'trade'], ['trade', 'wealth'], ['tobacco', 'money'],
      ['constitution', 'law'], ['rights', 'freedom'],
    ]);

    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtG5Real(ctx) {
    const SENTENCES = [
      'composition is how art is arranged', 'balance makes art feel steady',
      'contrast makes elements stand out', 'emphasis draws the eye',
      'unity ties everything together', 'the rule of thirds guides the eye',
      'foreground is closest to us', 'middle ground is next',
      'background is farthest away', 'perspective shows distance',
      'vanishing points meet far away', 'horizon line separates sky and land',
      'symmetry is balanced on both sides', 'asymmetry is off balance on purpose',
      'the focal point is most important', 'leading lines point to the focus',
      'proportion compares sizes', 'pattern repeats shapes or lines',
      'rhythm is repeated elements', 'movement shows action',
      'negative space is empty area', 'positive space has the subject',
      'light and shadow create depth', 'color sets the mood',
      'warm colors come forward', 'cool colors go back',
      'an artist chooses what to show', 'good composition feels right',
    ];
    // T14.24 Session 80 — prime visual composition principles
    // lattice per TODO line 561 before the composition sentence pass.
    await this._teachVisualComposition();
    await this._teachCausalChains([
      ['contrast', 'attention'], ['emphasis', 'focus'], ['balance', 'harmony'],
      ['perspective', 'depth'], ['proportion', 'realism'],
      ['pattern', 'rhythm'], ['movement', 'energy'], ['color', 'emotion'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G5 COURSES: Music / PE / Health / Spanish + Computer
  // Science (cs track ENTERS at G5 — its template). Course-identity
  // prepended by the _cellRunner wrapper; each self-gates.
  async runMusicG5Real(ctx) {
    const VOCAB = [
      'music', 'note', 'interval', 'chord', 'triad', 'key', 'signature', 'scale',
      'major', 'minor', 'dotted', 'sixteenth', 'measure', 'harmony', 'melody', 'ensemble',
      'part', 'dynamics', 'crescendo', 'tempo', 'expression', 'staff', 'rhythm', 'phrase',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'an interval is the distance between two notes',
      'a chord is three or more notes played together',
      'a triad is a chord built from three notes',
      'a key signature tells which sharps or flats a song uses',
      'a dotted note is held for half again as long',
      'a sixteenth note is half as long as an eighth note',
      'a crescendo means gradually getting louder',
      'a decrescendo means gradually getting softer',
      'harmony is built by stacking notes from the scale',
      'a melody can be divided into phrases like sentences',
      'in an ensemble each part has its own line that fits the whole',
      'major keys tend to sound bright and minor keys tend to sound dark',
      'expression is how we shape the feeling of the music',
      'we read the key signature before we play the first note',
      'rhythm patterns can mix quarter eighth and sixteenth notes',
      'the same melody in a minor key feels completely different',
      'music history has eras like baroque classical and modern',
      'playing with feeling matters as much as playing the right notes',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['chord', 'triad'], ['crescendo', 'louder'], ['key', 'signature'], ['minor', 'dark'], ['major', 'bright'], ['interval', 'distance'], ['phrase', 'melody'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G5' });
    return await this._gateSubjectProduction('music', 'grade5', [
      { question: 'three or more notes played together is a', expected: ['chord', 'c'] },
      { question: 'a chord built from three notes is a', expected: ['triad', 't'] },
      { question: 'gradually getting louder is a', expected: ['crescendo', 'c'] },
      { question: 'the distance between two notes is an', expected: ['interval', 'i'] },
      { question: 'sharps or flats a song uses are shown by the key', expected: ['signature', 's'] },
      { question: 'minor keys tend to sound', expected: ['dark', 'sad', 'd', 's'] },
      { question: 'a melody divides into parts like sentences called', expected: ['phrases', 'phrase', 'p'] },
      { question: 'how we shape the feeling of music is', expected: ['expression', 'e'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG5Real(ctx) {
    const VOCAB = [
      'fitness', 'plan', 'test', 'cardio', 'strength', 'endurance', 'flexible', 'tactic',
      'invasion', 'net', 'striking', 'offense', 'defense', 'pivot', 'fake', 'officiate',
      'leader', 'goal', 'progress', 'lifelong', 'active', 'warm', 'recover', 'pulse',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'a personal fitness plan sets goals for cardio strength and flexibility',
      'a fitness test measures where we are starting from',
      'invasion games like soccer try to score in the other teams area',
      'net games like volleyball send an object over a net',
      'striking games like baseball hit an object away',
      'a fake or a pivot helps get past a defender',
      'on offense we create space and on defense we close it',
      'we officiate by knowing and applying the rules fairly',
      'a good leader encourages teammates and stays positive',
      'we track progress over weeks to see ourselves improve',
      'the goal is lifelong activity not just one game',
      'we warm up before and recover after every workout',
      'taking our pulse tells us how hard the heart is working',
      'practicing a skill slowly first builds it correctly',
      'rest days let muscles repair and get stronger',
      'being active most days keeps the whole body healthy for life',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['plan', 'goal'], ['offense', 'space'], ['defense', 'close'], ['test', 'progress'], ['warm', 'ready'], ['rest', 'repair'], ['active', 'healthy'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G5' });
    return await this._gateSubjectProduction('pe', 'grade5', [
      { question: 'a plan that sets cardio strength and flexibility goals is a personal fitness', expected: ['plan', 'p'] },
      { question: 'games like soccer that score in the other teams area are', expected: ['invasion', 'i'] },
      { question: 'games that send an object over a net are', expected: ['net', 'n'] },
      { question: 'on defense we close the', expected: ['space', 'gap', 's', 'g'] },
      { question: 'applying the rules fairly is to', expected: ['officiate', 'o'] },
      { question: 'the real goal of fitness is to be active for', expected: ['life', 'lifelong', 'l'] },
      { question: 'rest days let muscles', expected: ['repair', 'recover', 'r'] },
      { question: 'taking our pulse measures the', expected: ['heart', 'heartbeat', 'h'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG5Real(ctx) {
    const VOCAB = [
      'health', 'puberty', 'hormone', 'body', 'change', 'growth', 'hygiene', 'period',
      'development', 'nutrition', 'balanced', 'myplate', 'protein', 'grain', 'dairy', 'disease',
      'prevent', 'immune', 'stress', 'esteem', 'tobacco', 'alcohol', 'drug', 'harm',
      'decision', 'refuse', 'safe',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'puberty is the time when the body grows from a child toward an adult',
      'hormones are chemical signals that cause the body to change during puberty',
      'everyone goes through puberty but at their own pace',
      'girls may begin to menstruate which is a normal healthy part of growing up',
      'good hygiene like showering and clean clothes matters more during puberty',
      'a balanced diet uses myplate with fruits vegetables grains protein and dairy',
      'the immune system and good habits prevent many diseases',
      'managing stress with rest exercise and talking keeps the mind healthy',
      'self esteem is how we value ourselves and it can be built',
      'tobacco and alcohol and drugs harm the growing body and brain',
      'we can refuse and say no clearly when offered something harmful',
      'making a good decision means thinking about the result first',
      'it is healthy and normal to ask a trusted adult about body changes',
      'sleep is when the growing body does much of its building',
      'feelings can swing more during puberty and that is normal',
      'caring for our body now sets up a healthy adult life',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['puberty', 'change'], ['hormone', 'change'], ['balanced', 'healthy'], ['stress', 'rest'], ['tobacco', 'harm'], ['decision', 'result'], ['sleep', 'grow'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G5' });
    return await this._gateSubjectProduction('health', 'grade5', [
      { question: 'the time the body grows toward adult is', expected: ['puberty', 'p'] },
      { question: 'chemical signals that cause body changes are', expected: ['hormones', 'hormone', 'h'] },
      { question: 'the normal healthy monthly cycle girls begin is a', expected: ['period', 'menstruation', 'p', 'm'] },
      { question: 'a balanced diet guide is called', expected: ['myplate', 'm'] },
      { question: 'tobacco alcohol and drugs cause', expected: ['harm', 'h'] },
      { question: 'when offered something harmful we can', expected: ['refuse', 'sayno', 'r', 's'] },
      { question: 'how we value ourselves is self', expected: ['esteem', 'e'] },
      { question: 'the growing body builds most during', expected: ['sleep', 's'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG5Real(ctx) {
    const VOCAB = [
      'spanish', 'verbo', 'hablar', 'comer', 'vivir', 'yo', 'tu', 'el',
      'nosotros', 'ser', 'estar', 'soy', 'eres', 'tengo', 'quiero', 'ropa',
      'camisa', 'zapato', 'lugar', 'escuela', 'tienda', 'hora', 'cuando', 'porque',
      'pregunta',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'a verb in spanish is a verbo and it shows action',
      'regular verbs end in ar er or ir like hablar comer vivir',
      'yo means i and tu means you and el means he',
      'nosotros means we',
      'hablar means to speak so yo hablo means i speak',
      'comer means to eat so yo como means i eat',
      'ser and estar both mean to be but are used differently',
      'soy means i am for things that stay the same',
      'estoy means i am for how i feel or where i am right now',
      'la ropa is clothing la camisa is the shirt el zapato is the shoe',
      'la escuela is the school and la tienda is the store',
      'que hora es means what time is it',
      'cuando means when and porque means because',
      'we make a question by raising our voice or using a question word',
      'practicing full sentences out loud builds real fluency',
      'cognates like animal and family look the same in both languages',
      'learning to conjugate a verb lets us say who is doing the action',
      'spanish is spoken by hundreds of millions of people',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['hablar', 'speak'], ['comer', 'eat'], ['vivir', 'live'], ['soy', 'am'], ['escuela', 'school'], ['hora', 'time'], ['porque', 'because'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G5' });
    return await this._gateSubjectProduction('language', 'grade5', [
      { question: 'a word that shows action is a', expected: ['verbo', 'verb', 'v'] },
      { question: 'hablar means to', expected: ['speak', 'talk', 's', 't'] },
      { question: 'comer means to', expected: ['eat', 'e'] },
      { question: 'yo means', expected: ['i', 'me', 'i'] },
      { question: 'la escuela is the', expected: ['school', 's'] },
      { question: 'que hora es asks what is the', expected: ['time', 'hour', 't', 'h'] },
      { question: 'porque means', expected: ['because', 'b'] },
      { question: 'changing a verb to show who does it is to', expected: ['conjugate', 'c'] },
    ], { gateSubjectTag: 'language' });
  },

  async runCsG5Real(ctx) {
    const VOCAB = [
      'computer', 'code', 'program', 'algorithm', 'instruction', 'sequence', 'step', 'loop',
      'repeat', 'condition', 'if', 'then', 'input', 'output', 'variable', 'value',
      'data', 'debug', 'error', 'fix', 'logic', 'command', 'block', 'run',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'a computer follows instructions exactly and does nothing on its own',
      'code is a set of instructions written for a computer',
      'a program is code that does a whole task',
      'an algorithm is a precise step by step plan to solve a problem',
      'a sequence is doing steps one after another in order',
      'a loop repeats steps so we do not write them over and over',
      'a condition checks if something is true',
      'an if then statement runs code only when a condition is true',
      'input is the information a program takes in',
      'output is what a program gives back',
      'a variable is a named box that holds a value',
      'we can change the value stored in a variable',
      'a bug is an error in the code that makes it do the wrong thing',
      'to debug is to find and fix the error',
      'the computer does exactly what we say not what we mean',
      'breaking a big problem into small steps makes it solvable',
      'in block coding we snap command blocks together to build a program',
      'we run a program to see what it does and then improve it',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['code', 'program'], ['algorithm', 'steps'], ['loop', 'repeat'], ['if', 'condition'], ['input', 'output'], ['bug', 'error'], ['debug', 'fix'], ['variable', 'value'],
    ]);
    // Train the downloaded code-concept corpus too (corpora/coding/grade5.json)
    // — same compounding self-taught-coder track every cs cell G6+ uses; G5 is
    // the intro rung (what a computer/program/code is). Earliest code exposure.
    await this._trainCodingStories('grade5', ctx, { reps: 3, ticksPerWord: 2 });
    await this._teachProductionStack('cs', ctx, { tag: 'CS-G5' });
    return await this._gateSubjectProduction('cs', 'grade5', [
      { question: 'a precise step by step plan to solve a problem is an', expected: ['algorithm', 'a'] },
      { question: 'repeating steps without rewriting them uses a', expected: ['loop', 'l'] },
      { question: 'a named box that holds a value is a', expected: ['variable', 'v'] },
      { question: 'a set of instructions written for a computer is', expected: ['code', 'c'] },
      { question: 'an error in code is a', expected: ['bug', 'b'] },
      { question: 'to find and fix an error is to', expected: ['debug', 'd'] },
      { question: 'code that runs only when something is true uses an', expected: ['if', 'condition', 'i', 'c'] },
      { question: 'the information a program takes in is', expected: ['input', 'i'] },
    ], { gateSubjectTag: 'cs' });
  },

  async runLifeG5(ctx) {
    // ── G5 life experience — DATA-DRIVEN (corpora/life/grade5.json) ──
    // End of elementary: trust-is-earned-now (betrayal aftermath), the first
    // free week at summer camp (the stars she returns to when things get
    // bad), the i-want-all-black rebellion (goth aesthetic surfacing on
    // purpose), and the small poverty aches (the popsicle truck) — TRAINED
    // from story DATA, not hardcoded feat-vectors. The chosen self emerges.
    await this._trainLifeStories('grade5', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'secret', 'trust', 'camp', 'stars', 'free', 'black', 'rebellion', 'cookies', 'meatloaf',
    ], ctx, { reps: 5 });
  }
};
