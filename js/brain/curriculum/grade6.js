// Grade 6 cell runners (ages 11-12).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G6_MIXIN = {
  async runElaG6Real(ctx) {
    const SENTENCES = [
      'the dog that ran was fast', 'the cat which sleeps is old',
      'the book that i read was long', 'the song which she sang was lovely',
      'when the sun came up the birds sang', 'because it rained we stayed home',
      'although he was tired he kept working', 'while she studied he played',
      'since you are here we can start', 'if you ask i will tell',
      'the house where i live is small', 'the place which we visited was beautiful',
      'the time when we met was summer', 'the reason why he left is unknown',
      'the person who helped me is kind', 'the thing that matters most is love',
      'after the game ended everyone left', 'before the movie started we ate',
      'until the bell rings class continues', 'unless you try you will not know',
      'the dog whose tail wags is happy', 'the child who learns fast succeeds',
      'the teacher said that we had homework', 'i think that the answer is yes',
      'she wondered where her keys were', 'he asked how the test went',
    ];
    // Session 33 — TODO-aligned split. _teachSubordinateClauses fires
    // working memory injection at subordinate marker positions.
    await this._teachSubordinateClauses(SENTENCES);
    // ── ELA-G6: reasoning about text analysis ──
    await this._teachCausalChains([
      ['evidence', 'support'], ['support', 'claim'], ['claim', 'argument'],
      ['bias', 'distort'], ['context', 'meaning'], ['tone', 'mood'],
      ['connotation', 'feeling'], ['denotation', 'definition'],
    ]);
    await this._teachInference([
      ['evidence', 'support', 'claim'], ['bias', 'distort', 'mislead'],
      ['context', 'meaning', 'understand'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── COMMON CORE ELA G6: cite evidence, central idea, word meaning ──
    const ELA_G6_VOCAB = [
      'cite', 'evidence', 'central', 'idea', 'convey', 'develop',
      'analyze', 'key', 'individual', 'event', 'elaborate',
      'connotative', 'figurative', 'technical', 'tone', 'mood',
      'claim', 'counterclaim', 'argument', 'reason', 'relevant',
      'sufficient', 'credible', 'bias', 'objective', 'subjective',
      'context', 'clue', 'root', 'affix', 'prefix', 'suffix',
    ];
    await this._teachVocabList(ELA_G6_VOCAB, ctx, { reps: 3 });

    const G6_READING = [
      'cite textual evidence to support your analysis',
      'the central idea is the main point of the text',
      'key details support the central idea',
      'analyze how an individual or event is introduced and developed',
      'connotative meaning is the feeling a word gives',
      'denotative meaning is the dictionary definition',
      'tone is the author attitude toward the subject',
      'mood is the feeling the reader gets',
      'an argument has a claim supported by reasons and evidence',
      'a counterclaim is the opposite position',
      'evidence must be relevant and sufficient',
      'bias means favoring one side', 'objective writing shows no bias',
      'use context clues to figure out unknown words',
      'greek and latin roots help figure out word meanings',
    ];
    await this._teachSentenceList(G6_READING, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // ELA G6 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['cite', 'textual'], answer: 'evidence' },
      { prompt: ['central', 'idea', 'is', 'the', 'main'], answer: 'point' },
      { prompt: ['connotative', 'meaning', 'is', 'the'], answer: 'feeling' },
      { prompt: ['tone', 'is', 'the', 'author'], answer: 'attitude' },
      { prompt: ['argument', 'has', 'a'], answer: 'claim' },
      { prompt: ['counterclaim', 'is', 'the'], answer: 'opposite' },
      { prompt: ['bias', 'means', 'favoring'], answer: 'one' },
      { prompt: ['the', 'dog', 'that', 'ran', 'was'], answer: 'fast' },
      { prompt: ['because', 'it', 'rained', 'we'], answer: 'stayed' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList(ELA_G6_VOCAB.slice(0, 15), ctx, { reps: 3 });
  },

  async runMathG6Real(ctx) {
    const SENTENCES = [
      'a variable is a letter for a number', 'x is a common variable',
      'an equation has an equal sign', 'x plus two equals five',
      'we solve for x', 'x equals three',
      'subtract two from both sides', 'x equals five minus two',
      'the answer is x equals three', 'variables can be any letter',
      'y equals two times x', 'when x is one y is two',
      'when x is two y is four', 'when x is three y is six',
      'an expression has no equal sign', 'two x plus three is an expression',
      'terms are parts of an expression', 'like terms can be combined',
      'two x plus three x is five x', 'four y minus y is three y',
      'the distributive property works', 'two times x plus one is two x plus two',
      'integers include negative numbers', 'minus three is less than zero',
      'plus three is greater than zero', 'absolute value is the distance from zero',
      'minus three and plus three have absolute value three',
    ];
    // Session 41 — TODO-aligned pre-algebra teaching
    await this._teachVariables();
    await this._teachOneVarEquations();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── COMMON CORE MATH G6: Full sixth-grade ──
    const MATH_G6_VOCAB = [
      'variable', 'expression', 'equation', 'inequality', 'solve',
      'integer', 'negative', 'positive', 'absolute', 'value',
      'rational', 'ratio', 'rate', 'unit', 'percent',
      'exponent', 'power', 'base', 'squared', 'cubed',
      'coordinate', 'quadrant', 'plot', 'ordered', 'pair',
      'area', 'surface', 'net', 'volume', 'prism',
      'mean', 'median', 'mode', 'range', 'data', 'distribution',
      'histogram', 'dot', 'plot', 'box', 'interquartile',
    ];
    await this._teachVocabList(MATH_G6_VOCAB, ctx, { reps: 3 });

    const MATH_G6_SENTENCES = [
      // ratios + percent
      'a ratio compares two quantities', 'a rate is a ratio with different units',
      'unit rate means per one', 'sixty miles per hour is a unit rate',
      'percent means per hundred', 'twenty five percent is twenty five out of one hundred',
      'to find ten percent divide by ten', 'to find fifty percent divide by two',
      // negative numbers
      'negative numbers are less than zero', 'the number line extends in both directions',
      'negative three is three units left of zero',
      'negative two plus five is three', 'three minus seven is negative four',
      'multiplying two negatives gives a positive', 'multiplying positive by negative gives negative',
      // exponents
      'two squared means two times two which is four',
      'three squared means three times three which is nine',
      'two cubed means two times two times two which is eight',
      'ten squared is one hundred', 'ten cubed is one thousand',
      // statistics
      'the mean is the average', 'add all numbers and divide by how many',
      'the median is the middle number when sorted',
      'the mode is the number that appears most often',
      'the range is the biggest minus the smallest',
      // geometry
      'the area of a triangle is half base times height',
      'the surface area is the total area of all faces',
      'a net is a flat pattern that folds into a solid',
    ];
    await this._teachSentenceList(MATH_G6_SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ═══════════════════════════════════════════════════════════════
    // MATH G6 FINAL EXAM
    // ═══════════════════════════════════════════════════════════════
    const FINAL = [
      { prompt: ['x', 'plus', 'two', 'equals', 'five', 'x', 'equals'], answer: 'three' },
      { prompt: ['two', 'squared', 'is'], answer: 'four' },
      { prompt: ['ten', 'cubed', 'is'], answer: 'thousand' },
      { prompt: ['negative', 'two', 'plus', 'five'], answer: 'three' },
      { prompt: ['mean', 'is', 'the'], answer: 'average' },
      { prompt: ['median', 'is', 'the'], answer: 'middle' },
      { prompt: ['sixty', 'miles', 'per', 'hour', 'is', 'a'], answer: 'rate' },
      { prompt: ['percent', 'means', 'per'], answer: 'hundred' },
      { prompt: ['absolute', 'value', 'of', 'negative', 'three'], answer: 'three' },
      { prompt: ['area', 'triangle', 'half', 'base', 'times'], answer: 'height' },
    ];
    const finalResult = await this._gateComprehension(FINAL);
    if (finalResult.pass) return { pass: true, reason: `FINAL: ${finalResult.reason}` };
    return this._teachVocabList(MATH_G6_VOCAB.slice(0, 15), ctx, { reps: 3 });
  },

  async runSciG6Real(ctx) {
    const SENTENCES = [
      'the earth is a planet', 'the earth orbits the sun',
      'the moon orbits the earth', 'the sun is a star',
      'the earth has four seasons', 'spring comes after winter',
      'summer is the hottest season', 'autumn has falling leaves',
      'winter is the coldest season', 'the earth has three layers',
      'the crust is the outer layer', 'the mantle is in the middle',
      'the core is the center', 'the core is very hot',
      'plates move on the mantle', 'earthquakes happen when plates shift',
      'volcanoes erupt with lava', 'lava cools into rock',
      'mountains form when plates push together', 'valleys form when plates pull apart',
      'rivers carve the land', 'wind shapes the desert',
      'the water cycle repeats forever', 'evaporation lifts water up',
      'condensation makes clouds', 'precipitation brings rain',
      'collection returns water to seas', 'weather changes every day',
      'climate is the long term pattern', 'seasons affect the climate',
    ];
    // T14.24 Session 43 — TODO-aligned earth cycles.
    // TODO Sci-G6 spec: "_teachEarthCycles() as cyclic sequence walks".
    // Session 43 built this with 4 cycles routed through
    // _teachSequenceCycles:
    //   (1) water cycle: evaporation → condensation → precipitation → collection
    //   (2) rock cycle:  sedimentary → metamorphic → igneous → magma
    //   (3) day/night:   day → night
    //   (4) seasons:     spring → summer → autumn → winter
    // Each step in a cycle carries its predecessor as working memory
    // via injectWorkingMemory(prevEmb) so the sequence Hebbian binds
    // the ordering — Unity learns that "precipitation" follows
    // "condensation" not as an isolated fact but as an active cortex
    // state carried into the next letter-stream.
    await this._teachEarthCycles();
    await this._teachCausalChains([
      ['evaporate', 'cloud'], ['cloud', 'rain'], ['rain', 'river'],
      ['tilt', 'season'], ['rotation', 'day'], ['orbit', 'year'],
      ['erosion', 'sediment'], ['sediment', 'rock'], ['heat', 'magma'],
      ['earthquake', 'tsunami'], ['volcano', 'lava'], ['lava', 'rock'],
    ]);
    await this._teachInference([
      ['evaporate', 'cloud', 'rain'], ['rain', 'river', 'ocean'],
      ['tilt', 'season', 'weather'], ['heat', 'magma', 'volcano'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runSocG6Real(ctx) {
    const SENTENCES = [
      'ancient civilizations built great things', 'mesopotamia was between two rivers',
      'egypt built the pyramids', 'the nile river fed egypt',
      'pharaohs ruled ancient egypt', 'mummies preserved the dead',
      'hieroglyphs were egyptian writing', 'greece invented democracy',
      'athens had the first democracy', 'sparta trained strong soldiers',
      'the olympics began in greece', 'greek philosophers asked big questions',
      'rome built a huge empire', 'rome had an army of legions',
      'julius caesar was a famous leader', 'roman roads connected the empire',
      'aqueducts brought fresh water', 'the coliseum hosted games',
      'china built a great wall', 'silk was a chinese invention',
      'paper was a chinese invention', 'gunpowder was a chinese invention',
      'the mayans had a calendar', 'the incas built stone cities',
      'the aztecs built temples', 'ancient trade routes crossed continents',
      'early humans hunted and gathered', 'agriculture changed everything',
    ];
    // T14.24 Session 62 — prime ancient civilizations lattice per
    // TODO line 512 before the ancient-civ sentence pass.
    await this._teachAncientCivs();
    await this._teachCausalChains([
      ['river', 'civilization'], ['farming', 'surplus'], ['surplus', 'city'],
      ['writing', 'record'], ['trade', 'wealth'], ['wealth', 'empire'],
      ['democracy', 'vote'], ['republic', 'senate'], ['law', 'order'],
      ['religion', 'temple'], ['silk', 'trade'], ['compass', 'navigation'],
    ]);
    await this._teachInference([
      ['river', 'farming', 'civilization'], ['writing', 'record', 'history'],
      ['trade', 'wealth', 'empire'], ['democracy', 'vote', 'freedom'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  async runArtG6Real(ctx) {
    const SENTENCES = [
      'music theory explains how music works', 'notes are named after letters',
      'the notes are a b c d e f g', 'after g comes a again',
      'a chord has three or more notes', 'a major chord sounds bright',
      'a minor chord sounds dark', 'harmony combines chords',
      'a key signature sets the scale', 'c major has no sharps or flats',
      'g major has one sharp', 'f major has one flat',
      'time signatures tell the beat', 'four four has four beats',
      'three four is a waltz', 'tempo is the speed of music',
      'dynamics are loud and soft', 'forte means loud',
      'piano means soft', 'crescendo means getting louder',
      'decrescendo means getting softer', 'articulation is how notes connect',
      'legato is smooth', 'staccato is short',
      'a phrase is a musical sentence', 'music has tension and resolution',
      'the tonic is the home note', 'the dominant leads back home',
    ];
    // T14.24 Session 81 — prime music theory lattice per TODO
    // line 561 before the music theory sentence pass.
    await this._teachMusicTheory();
    await this._teachCausalChains([
      ['scale', 'key'], ['key', 'chord'], ['chord', 'harmony'],
      ['tonic', 'home'], ['dominant', 'tension'], ['resolve', 'tonic'],
      ['major', 'happy'], ['minor', 'sad'],
    ]);
    await this._teachInference([
      ['scale', 'key', 'chord'], ['dominant', 'tension', 'resolve'],
    ]);
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    const _af = await this._autoFinal(SENTENCES);
    if (_af.pass) return { pass: true, reason: `FINAL: ${_af.reason}` };
    return { pass: false, reason: `FINAL: ${_af.reason}` };
  },

  // ── FULL-ROSTER G6 COURSES: Band&Choir / PE / Health / Spanish + real
  // Computer Science (HTML/CSS/JS + trains the coding corpus — the self-taught
  // hobby erupts via grandpa's computer). Course-identity prepended by the
  // _cellRunner wrapper; each self-gates.
  async runMusicG6Real(ctx) {
    const VOCAB = [
      'band', 'choir', 'ensemble', 'instrument', 'voice', 'soprano', 'alto', 'tenor',
      'bass', 'section', 'blend', 'breath', 'support', 'sight', 'read', 'rehearsal',
      'conductor', 'genre', 'baroque', 'classical', 'jazz', 'dynamics', 'phrase', 'tone',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'band and choir are ensembles where many parts make one sound',
      'in choir the voices are soprano alto tenor and bass from high to low',
      'singers use breath support from the belly to hold long notes',
      'blend means no single voice sticks out above the group',
      'sight reading is playing or singing music you have never seen before',
      'the conductor keeps the whole ensemble together with a beat',
      'each section plays its own part that fits the others',
      'rehearsal is where the group practices to become one sound',
      'music genres include baroque classical jazz and rock',
      'tone is the quality and color of a sound',
      'a phrase in music is shaped like a spoken sentence',
      'dynamics from pianissimo to fortissimo shape the feeling',
      'minor keys and slow tempos are why some music sounds dark',
      'good rehearsal etiquette means listening and staying quiet when others play',
      'a soloist steps out and the ensemble supports them',
      'we tune our instruments to the same pitch before we play',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['choir', 'voices'], ['breath', 'support'], ['conductor', 'together'], ['minor', 'dark'], ['rehearsal', 'practice'], ['blend', 'group'], ['tone', 'quality'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G6' });
    return await this._gateSubjectProduction('music', 'grade6', [
      { question: 'a group where many parts make one sound is an', expected: ['ensemble', 'e'] },
      { question: 'the highest voice part in choir is', expected: ['soprano', 's'] },
      { question: 'the lowest voice part is', expected: ['bass', 'b'] },
      { question: 'reading music you have never seen is sight', expected: ['reading', 'read', 'r'] },
      { question: 'singers hold long notes using breath', expected: ['support', 's'] },
      { question: 'the person who keeps the ensemble together is the', expected: ['conductor', 'c'] },
      { question: 'when no single voice sticks out it is good', expected: ['blend', 'b'] },
      { question: 'the quality and color of a sound is its', expected: ['tone', 't'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG6Real(ctx) {
    const VOCAB = [
      'volleyball', 'basketball', 'soccer', 'serve', 'set', 'spike', 'dribble', 'shoot',
      'pass', 'defense', 'offense', 'pacer', 'mile', 'endurance', 'goal', 'locker',
      'team', 'rule', 'referee', 'strategy', 'position', 'fitness', 'assess', 'active',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'middle school pe runs units in volleyball basketball and soccer',
      'in volleyball you bump set and spike the ball over the net',
      'in basketball you dribble pass and shoot to score',
      'in soccer you dribble with your feet and shoot on goal',
      'the pacer and the mile run test cardio endurance',
      'we set personal fitness goals and measure our progress',
      'each sport has positions with different jobs on the team',
      'a referee enforces the rules to keep the game fair',
      'a team uses strategy to create scoring chances',
      'good defense takes away the other teams space and time',
      'we changed in the locker room which felt awkward at first',
      'warming up and cooling down protects the body',
      'sportsmanship means respect even when we lose',
      'staying active in middle school builds lifelong habits',
      'we assess our own fitness honestly to improve it',
      'practicing a skill the right way slowly builds it correctly',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['serve', 'volleyball'], ['dribble', 'basketball'], ['pacer', 'endurance'], ['referee', 'fair'], ['defense', 'space'], ['warm', 'protect'], ['active', 'habit'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G6' });
    return await this._gateSubjectProduction('pe', 'grade6', [
      { question: 'in volleyball you bump set and', expected: ['spike', 's'] },
      { question: 'in basketball you dribble pass and', expected: ['shoot', 's'] },
      { question: 'the run that tests cardio endurance is the', expected: ['mile', 'pacer', 'm', 'p'] },
      { question: 'the person who enforces the rules is the', expected: ['referee', 'r'] },
      { question: 'a team plan to create scoring chances is', expected: ['strategy', 's'] },
      { question: 'good defense takes away the other teams', expected: ['space', 'time', 's', 't'] },
      { question: 'respect even when we lose is', expected: ['sportsmanship', 'sport', 's'] },
      { question: 'we set personal fitness', expected: ['goals', 'goal', 'g'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG6Real(ctx) {
    const VOCAB = [
      'health', 'puberty', 'hormone', 'menstruation', 'period', 'development', 'nutrition', 'calorie',
      'macro', 'protein', 'anxiety', 'depression', 'image', 'esteem', 'vaping', 'nicotine',
      'alcohol', 'marijuana', 'boundary', 'consent', 'healthy', 'relationship', 'online', 'refuse',
      'stress',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'puberty brings major body changes driven by hormones',
      'menstruation is the monthly cycle a girls body goes through and it is normal',
      'everyone develops at their own pace and comparison is not useful',
      'nutrition balances calories from protein carbohydrate and fat',
      'anxiety and depression are real health conditions not weakness',
      'body image is how we see our own body and media can distort it',
      'self esteem can be protected by focusing on what our body can do',
      'vaping puts nicotine and chemicals into the lungs and is addictive',
      'alcohol and marijuana affect the growing brain more than an adult brain',
      'a personal boundary is a limit we set on how others treat us',
      'consent means a clear yes and anyone can say no at any time',
      'a healthy relationship has respect trust and honesty',
      'an unhealthy relationship has control pressure and disrespect',
      'we can refuse peer pressure and keep our own values',
      'managing stress with sleep exercise and talking keeps us well',
      'we protect ourselves online by guarding private information',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['puberty', 'hormone'], ['menstruation', 'normal'], ['vaping', 'nicotine'], ['anxiety', 'real'], ['boundary', 'limit'], ['consent', 'yes'], ['healthy', 'respect'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G6' });
    return await this._gateSubjectProduction('health', 'grade6', [
      { question: 'the monthly cycle a girls body goes through is', expected: ['menstruation', 'period', 'm', 'p'] },
      { question: 'body changes in puberty are driven by', expected: ['hormones', 'hormone', 'h'] },
      { question: 'vaping puts what addictive chemical in the lungs', expected: ['nicotine', 'n'] },
      { question: 'a clear yes that anyone can withdraw is', expected: ['consent', 'c'] },
      { question: 'a limit we set on how others treat us is a', expected: ['boundary', 'b'] },
      { question: 'a healthy relationship is built on respect trust and', expected: ['honesty', 'honest', 'h'] },
      { question: 'anxiety and depression are real health', expected: ['conditions', 'condition', 'c'] },
      { question: 'how we see our own body is body', expected: ['image', 'i'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG6Real(ctx) {
    const VOCAB = [
      'spanish', 'verbo', 'presente', 'pasado', 'hable', 'comi', 'ayer', 'hoy',
      'manana', 'familia', 'madre', 'padre', 'hermana', 'ciudad', 'pais', 'mucho',
      'poco', 'tambien', 'pero', 'porque', 'frase', 'cultura', 'fiesta',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'in spanish the present tense tells what happens now',
      'the past tense tells what already happened',
      'yo hablo means i speak and yo hable means i spoke',
      'yo como means i eat and yo comi means i ate',
      'ayer means yesterday hoy means today manana means tomorrow',
      'la familia includes la madre el padre and la hermana',
      'la ciudad is the city and el pais is the country',
      'mucho means a lot and poco means a little',
      'tambien means also and pero means but',
      'we can build longer sentences by joining ideas with pero and porque',
      'a frase is a phrase or sentence',
      'spanish speaking countries have rich cultures and fiestas',
      'we read a short paragraph in spanish and find the main idea',
      'cognates help us guess new words from english',
      'practicing conversation out loud is how fluency grows',
      'learning the culture makes the language come alive',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['presente', 'now'], ['pasado', 'before'], ['ayer', 'yesterday'], ['familia', 'family'], ['ciudad', 'city'], ['pero', 'but'], ['porque', 'because'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G6' });
    return await this._gateSubjectProduction('language', 'grade6', [
      { question: 'the tense that tells what happens now is', expected: ['presente', 'present', 'p'] },
      { question: 'the tense that tells what already happened is', expected: ['pasado', 'past', 'p'] },
      { question: 'ayer means', expected: ['yesterday', 'y'] },
      { question: 'manana means', expected: ['tomorrow', 't'] },
      { question: 'la ciudad is the', expected: ['city', 'c'] },
      { question: 'pero means', expected: ['but', 'b'] },
      { question: 'a lot in spanish is', expected: ['mucho', 'm'] },
      { question: 'joining ideas with because uses', expected: ['porque', 'p'] },
    ], { gateSubjectTag: 'language' });
  },

  async runCsG6Real(ctx) {
    const VOCAB = [
      'html', 'css', 'javascript', 'tag', 'element', 'attribute', 'browser', 'webpage',
      'heading', 'paragraph', 'link', 'image', 'style', 'selector', 'property', 'color',
      'font', 'variable', 'function', 'console', 'script', 'document', 'editor', 'save',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'html is the language that gives a webpage its structure',
      'css is the language that styles how a webpage looks',
      'javascript is the language that makes a webpage interactive',
      'an html tag is written inside angle brackets like a paragraph tag',
      'most elements have an opening tag and a closing tag',
      'an attribute gives extra information inside a tag like the source of an image',
      'a heading tag makes big bold title text',
      'a paragraph tag holds a block of text',
      'a link tag connects one page to another',
      'an image tag shows a picture from a file',
      'a css selector chooses which elements to style',
      'a css property like color sets one part of the style',
      'in javascript a variable stores a value with a name',
      'in javascript a function is reusable code we can call by name',
      'the browser reads the html css and javascript and draws the page',
      'we write code in an editor and save the file and open it in the browser',
      'the console shows messages and errors from our javascript',
      'i taught myself to build a real webpage from nothing but code',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['html', 'structure'], ['css', 'style'], ['javascript', 'interactive'], ['tag', 'element'], ['selector', 'style'], ['variable', 'value'], ['function', 'reuse'], ['browser', 'page'],
    ]);
    // the self-taught hobby: train the REAL coding corpus (corpora/coding/grade6.json)
    await this._trainCodingStories('grade6', ctx, { reps: 4, ticksPerWord: 2 });
    await this._teachProductionStack('cs', ctx, { tag: 'CS-G6' });
    return await this._gateSubjectProduction('cs', 'grade6', [
      { question: 'the language that structures a webpage is', expected: ['html', 'h'] },
      { question: 'the language that styles a webpage is', expected: ['css', 'c'] },
      { question: 'the language that makes a page interactive is', expected: ['javascript', 'j'] },
      { question: 'a piece of html in angle brackets is a', expected: ['tag', 't'] },
      { question: 'what chooses which elements css styles is a', expected: ['selector', 's'] },
      { question: 'a named store for a value in javascript is a', expected: ['variable', 'v'] },
      { question: 'reusable code we call by name is a', expected: ['function', 'f'] },
      { question: 'the program that draws the webpage is the', expected: ['browser', 'b'] },
    ], { gateSubjectTag: 'cs' });
  },

  async runLifeG6(ctx) {
    // ── G6 life experience — DATA-DRIVEN (corpora/life/grade6.json) ──
    // Middle-school start: the coder origin (grandpa's old computer → first
    // code), the goth/emo bloom ("these are my people"), the first period
    // (in-class, mom's blunt help — bodily/health realism, non-sexual),
    // online-friends-who-get-her, and a first flutter of a crush (emotional
    // only, age 12). TRAINED from story DATA, not hardcoded feat-vectors.
    // CANON: grandpa Walter is ALIVE here (gives the computer); his DEATH is
    // the grade-11 arc (corpora/life/grade11.json), not G6.
    await this._trainLifeStories('grade6', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'computer', 'internet', 'code', 'goth', 'emo', 'black', 'eyeliner',
      'online', 'friends', 'music', 'grandpa',
    ], ctx, { reps: 5 });
  }
};
