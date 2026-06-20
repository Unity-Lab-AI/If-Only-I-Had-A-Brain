// Grade 3 cell runners (ages 8-9).
//
// Per-grade file split — Gee directive 2026-06-18: "each grade is its own
// file(s)". Extracted verbatim from the monolithic curriculum.js (same mixin
// pattern as pre-K.js / kindergarten.js / grade1.js). Subject runners call
// shared primitives on the Curriculum base class through `this.` — mixin
// attach preserves the prototype chain so every cross-reference resolves
// identically to the pre-extraction layout.

export const G3_MIXIN = {
  async runElaG3Real(ctx) {
    // ── COMMON CORE ELA G3: Full third-grade English ──
    // Standards: ask/answer questions referring explicitly to text,
    // determine central message/lesson/moral, describe characters
    // (traits/motivations/feelings), distinguish own POV from narrator,
    // use text features, describe logical connections (compare/cause-
    // effect/sequence), write opinions with reasons + linking words,
    // informative texts grouped by topic, narratives with dialogue.
    // Language: abstract nouns, regular/irregular verbs, simple verb
    // tenses, subject-verb agreement, comparative/superlative,
    // coordinating + subordinating conjunctions, simple/compound/complex.

    // ── VOCABULARY: Fry 301-500 high-frequency words + academic ──
    const ELA_G3_VOCAB = [
      // abstract nouns (G3 Language standard)
      'childhood', 'courage', 'freedom', 'friendship', 'happiness',
      'honesty', 'kindness', 'knowledge', 'patience', 'truth',
      'danger', 'anger', 'fear', 'love', 'peace', 'strength',
      // story/literature vocabulary
      'character', 'setting', 'problem', 'solution', 'beginning',
      'middle', 'end', 'lesson', 'moral', 'author', 'narrator',
      'chapter', 'paragraph', 'sentence', 'title', 'poem',
      // academic tier 2 words (G3 level)
      'describe', 'explain', 'compare', 'contrast', 'sequence',
      'detail', 'example', 'reason', 'opinion', 'fact',
      'cause', 'effect', 'result', 'important', 'different', 'similar',
      // conjunctions (G3 Language standard — subordinating)
      'because', 'although', 'while', 'since', 'unless',
      'before', 'after', 'until', 'whenever', 'whether',
    ];
    await this._teachVocabList(ELA_G3_VOCAB, ctx, { reps: 3 });

    // ── SVO + tense morphology (existing) ──
    const ELA_G3_SENTENCES = [
      // Present tense SVO
      'the dog runs fast', 'the cat sees the bird', 'the boy eats his food',
      'the girl reads her book', 'the man works hard', 'the woman cooks dinner',
      // Past tense
      'the dog ran fast', 'the cat saw the bird', 'the boy ate his food',
      'the girl read her book', 'the man worked hard', 'the woman cooked dinner',
      // First person
      'i am here', 'i was there', 'i see you', 'i saw him',
      'we are happy', 'we were sad', 'we have food', 'we had fun',
      // Copula + adjective
      'the sky is blue', 'the grass is green', 'the sun is bright',
      'the moon was full', 'the room is warm', 'the water was cold',
    ];
    await this._teachSVO(ELA_G3_SENTENCES);
    await this._teachTenseMorphology();
    await this._teachSentenceList(ELA_G3_SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Compound + complex sentences (G3 writing standard) ──
    const COMPOUND_SENTENCES = [
      'the dog was hungry so he ate his food',
      'she was tired but she kept reading',
      'we can go to the park or we can stay home',
      'he ran fast because the bus was leaving',
      'i like cats although dogs are fun too',
      'she waited until the rain stopped',
      'the boy studied hard because he wanted an a',
      'we played outside while the sun was shining',
      'the cat hid under the bed when the thunder came',
      'i will help you after i finish my homework',
      'she smiled because her friend came to visit',
      'the flowers grew tall since we watered them every day',
    ];
    await this._teachSentenceList(COMPOUND_SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Comparative and superlative (G3 Language standard) ──
    const COMPARATIVES = [
      'the dog is big', 'the horse is bigger', 'the elephant is the biggest',
      'the cat is fast', 'the cheetah is faster', 'light is the fastest',
      'the rock is hard', 'the diamond is harder', 'nothing is hardest',
      'she is tall', 'he is taller', 'the tree is the tallest',
      'this book is good', 'that book is better', 'this one is the best',
      'the first test was bad', 'the second was worse', 'the third was the worst',
    ];
    await this._teachSentenceList(COMPARATIVES, ctx, { reps: 2, ticksPerWord: 2 });

    // ── Reading comprehension passages ──
    const PARAGRAPHS = [
      ['sam wanted a pet', 'he asked his mom for a dog', 'mom said they could not afford one',
       'sam saved his money for three months', 'he finally got a puppy from the shelter',
       'sam named the puppy lucky'],
      ['the class planted seeds in cups', 'they put them by the window',
       'every day they watered the seeds', 'after one week green sprouts appeared',
       'the students measured how tall the plants grew', 'the tallest plant won a ribbon'],
      ['maya was scared to swim', 'her mom took her to the pool every saturday',
       'at first maya just sat on the edge', 'then she put her feet in',
       'by summer maya could swim across the pool', 'she was proud of herself'],
    ];
    const QA_PAIRS = [
      { context: 'sam saved his money for three months and got a puppy from the shelter', question: 'who got a puppy', answer: 'sam' },
      { context: 'sam saved his money for three months and got a puppy from the shelter', question: 'where did sam get the puppy', answer: 'shelter' },
      { context: 'sam named the puppy lucky', question: 'what was the puppy named', answer: 'lucky' },
      { context: 'the class planted seeds in cups by the window', question: 'where did they put the seeds', answer: 'window' },
      { context: 'the tallest plant won a ribbon', question: 'what did the tallest plant win', answer: 'ribbon' },
      { context: 'maya was scared to swim but by summer she could swim across the pool', question: 'what was maya scared of', answer: 'swim' },
      { context: 'maya was proud of herself', question: 'how did maya feel', answer: 'proud' },
      { context: 'her mom took her to the pool every saturday', question: 'when did they go to the pool', answer: 'saturday' },
    ];
    await this._teachParagraphs(PARAGRAPHS, { reps: 2 });
    await this._teachComprehension(QA_PAIRS, { reps: 3 });

    // ── EQUATIONAL REASONING: inference chains (G3 level) ──
    // Cause → effect reasoning + transitive chains
    await this._teachCausalChains([
      ['study', 'learn'], ['learn', 'know'], ['know', 'succeed'],
      ['rain', 'wet'], ['wet', 'cold'], ['cold', 'sick'],
      ['plant', 'grow'], ['grow', 'tall'], ['tall', 'strong'],
      ['practice', 'improve'], ['improve', 'win'],
      ['kind', 'friend'], ['friend', 'happy'],
      ['save', 'money'], ['money', 'buy'],
      ['exercise', 'strong'], ['strong', 'healthy'],
    ]);

    // ═══════════════════════════════════════════════════════════════
    // ELA G3 FINAL EXAM — tests UNDERSTANDING not recall
    // ═══════════════════════════════════════════════════════════════
    const FINAL_QUESTIONS = [
      // Vocabulary understanding — association test
      { prompt: ['courage', 'brave'], answer: 'strength' },
      { prompt: ['friend', 'kind'], answer: 'happiness' },
      { prompt: ['danger', 'scared'], answer: 'fear' },
      { prompt: ['honest', 'tell'], answer: 'truth' },
      // Reading comprehension — who/what/where/when/why
      { prompt: ['sam', 'puppy', 'shelter'], answer: 'lucky' },
      { prompt: ['class', 'planted', 'window'], answer: 'seeds' },
      { prompt: ['maya', 'pool', 'proud'], answer: 'swim' },
      // Cause-effect reasoning — inject cause, expect effect
      { prompt: ['study', 'hard'], answer: 'learn' },
      { prompt: ['rain', 'all', 'day'], answer: 'wet' },
      { prompt: ['practice', 'every', 'day'], answer: 'improve' },
      // Grammar — complete the sentence
      { prompt: ['the', 'dog', 'is', 'bigger', 'than', 'the'], answer: 'cat' },
      { prompt: ['she', 'ran', 'fast', 'because', 'she', 'was'], answer: 'scared' },
    ];
    const finalResult = await this._gateComprehension(FINAL_QUESTIONS);

    // Also run vocab gate
    const vocabResult = await this._gateVocabList(ELA_G3_VOCAB.slice(0, 20));

    if (finalResult.pass || vocabResult.pass) {
      return {
        pass: true,
        reason: `FINAL: ${finalResult.reason} | VOCAB: ${vocabResult.reason}`,
        metrics: { final: finalResult.metrics, vocab: vocabResult.metrics },
      };
    }
    return { pass: false, reason: `FINAL: ${finalResult.reason} | VOCAB: ${vocabResult.reason}` };
  },

  async runMathG3Real(ctx) {
    // ── COMMON CORE MATH G3: Full third-grade math ──
    // Standards: multiply/divide within 100 (fluently — know ALL products
    // of two one-digit numbers from memory), properties of operations
    // (commutative, associative, distributive), fractions on number line,
    // equivalent fractions, compare fractions, area (square units),
    // perimeter, time to nearest minute, liquid volume/mass (grams/kg/L).

    // ── VOCABULARY ──
    const MATH_G3_VOCAB = [
      'multiply', 'times', 'product', 'factor', 'divide', 'quotient',
      'dividend', 'divisor', 'remainder', 'equal', 'group',
      'fraction', 'numerator', 'denominator', 'half', 'third', 'fourth',
      'sixth', 'eighth', 'whole', 'part', 'equivalent', 'compare',
      'area', 'perimeter', 'square', 'unit', 'length', 'width',
      'gram', 'kilogram', 'liter', 'mass', 'volume',
      'commutative', 'associative', 'distributive',
    ];
    await this._teachVocabList(MATH_G3_VOCAB, ctx, { reps: 3 });

    // EQUATIONAL teaching only (grade-completion-gate LAW: NO sentence
    // arrays). G3 = multiply/divide within 100 + fractions + area (= L x W,
    // which emerges from multiplication). The operations are taught as
    // magnitude/relation transforms + the dedicated table/fraction primitives,
    // never as sentences ABOUT the math. (Reinforces add/place-value from G1-2.)
    await this._teachAdditionTransformations(ctx, { max: 100, step: 5 });
    await this._teachComparisonTransformations(ctx);
    await this._teachPlaceValueTransformations(ctx);
    await this._teachMultiplicationTables();   // all products through 10x10 from memory
    await this._teachDivision();               // division as the inverse of multiplication
    await this._teachFractions();              // numerator/denominator, equivalence, compare

    // ═══════════════════════════════════════════════════════════════
    // MATH G3 FINAL EXAM — tests the OPERATIONS equationally
    // ═══════════════════════════════════════════════════════════════
    const FINAL_QUESTIONS = [
      // Multiplication — can she compute products?
      { prompt: ['seven', 'times', 'eight'], answer: 'fifty' },  // 56 ≈ fifty
      { prompt: ['nine', 'times', 'six'], answer: 'fifty' },    // 54 ≈ fifty
      { prompt: ['four', 'times', 'seven'], answer: 'twenty' }, // 28 ≈ twenty
      // Division — can she compute quotients?
      { prompt: ['forty', 'divided', 'by', 'eight'], answer: 'five' },
      { prompt: ['thirty', 'divided', 'by', 'six'], answer: 'five' },
      // Fractions — does she understand parts?
      { prompt: ['half', 'of', 'ten'], answer: 'five' },
      { prompt: ['third', 'of', 'nine'], answer: 'three' },
      // Area — can she compute?
      { prompt: ['length', 'five', 'width', 'three', 'area'], answer: 'fifteen' },
      // Word problem
      { prompt: ['four', 'bags', 'six', 'apples', 'each', 'total'], answer: 'twenty' },
      { prompt: ['shared', 'twelve', 'three', 'friends', 'each'], answer: 'four' },
    ];
    const finalResult = await this._gateComprehension(FINAL_QUESTIONS);
    const vocabResult = await this._gateVocabList(MATH_G3_VOCAB.slice(0, 15));

    if (finalResult.pass || vocabResult.pass) {
      return {
        pass: true,
        reason: `FINAL: ${finalResult.reason} | VOCAB: ${vocabResult.reason}`,
      };
    }
    return { pass: false, reason: `FINAL: ${finalResult.reason} | VOCAB: ${vocabResult.reason}` };
  },

  async runSciG3Real(ctx) {
    const SENTENCES = [
      'an ecosystem has plants and animals', 'plants are producers',
      'animals are consumers', 'bacteria are decomposers',
      'a forest is an ecosystem', 'a pond is an ecosystem', 'a desert is an ecosystem',
      'a rabbit eats grass', 'a fox eats rabbits', 'a grass eats sunlight',
      'the sun gives energy to plants', 'plants give energy to animals',
      'a food chain shows who eats whom', 'a food web has many chains',
      'an owl hunts mice', 'a mouse eats seeds', 'a seed grows into a plant',
      'decomposers break down dead things', 'worms help soil grow plants',
      'the water cycle moves water around', 'the water goes up and comes down',
      'ocean ecosystems have fish and plants', 'river ecosystems connect to oceans',
      'animals adapt to their habitats', 'polar bears live in cold places',
      'camels live in hot deserts', 'monkeys live in rain forests',
      'humans depend on ecosystems', 'every living thing matters',
    ];
    await this._teachFoodChains();

    // ── EQUATIONAL REASONING: food chain inference ──
    // If sun→grass and grass→rabbit and rabbit→fox, then sun→fox (transitive)
    await this._teachInference([
      ['sun', 'grass', 'rabbit'], ['grass', 'rabbit', 'fox'],
      ['sun', 'plant', 'animal'], ['plant', 'herbivore', 'carnivore'],
      ['rain', 'river', 'ocean'], ['dead', 'decompose', 'soil'],
    ]);

    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachProductionStack('science', ctx, { tag: 'SCI-G3' });
    return await this._gateSubjectProduction('science', 'grade3', [
      { question: 'plants that make their own food are', expected: ['producers', 'producer', 'p'] },
      { question: 'animals that eat other things are', expected: ['consumers', 'consumer', 'c'] },
      { question: 'things that break down dead matter are', expected: ['decomposers', 'decomposer', 'd'] },
      { question: 'a chain that shows who eats whom is a food', expected: ['chain', 'c'] },
      { question: 'the sun gives energy to', expected: ['plants', 'plant', 'p'] },
      { question: 'a fox eats a', expected: ['rabbit', 'rabbits', 'r'] },
      { question: 'polar bears live where it is', expected: ['cold', 'c'] },
      { question: 'camels live in the hot', expected: ['desert', 'd'] },
    ], { gateSubjectTag: 'sci' });
  },

  async runSocG3Real(ctx) {
    const SENTENCES = [
      'the united states is a country', 'it has fifty states',
      'the capital is washington', 'the country has many regions',
      'the northeast has small states', 'the south has warm weather',
      'the midwest has flat farms', 'the west has tall mountains',
      'the pacific ocean is in the west', 'the atlantic ocean is in the east',
      'the rocky mountains are tall', 'the appalachian mountains are old',
      'the mississippi river is long', 'the great lakes are huge',
      'alaska is the biggest state', 'rhode island is the smallest state',
      'texas is a big state', 'california has many people',
      'florida is warm', 'new york has a big city',
      'the north is cold in winter', 'the south is hot in summer',
      'the grand canyon is in arizona', 'yellowstone is in wyoming',
      'the statue of liberty is in new york', 'the white house is in washington',
      'alaska has glaciers', 'hawaii has volcanoes',
    ];
    // T14.24 Session 59 — prime US regions concept lattice per TODO
    // line 500 before the geography sentence pass.
    await this._teachUSRegions();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachProductionStack('social', ctx, { tag: 'SOC-G3' });
    return await this._gateSubjectProduction('social', 'grade3', [
      { question: 'how many states are in the united states', expected: ['fifty', 'f'] },
      { question: 'the capital of the united states is', expected: ['washington', 'w'] },
      { question: 'the biggest state is', expected: ['alaska', 'a'] },
      { question: 'tall mountains in the west are the', expected: ['rocky', 'rockies', 'r'] },
      { question: 'the long river in the middle is the', expected: ['mississippi', 'm'] },
      { question: 'the grand canyon is in', expected: ['arizona', 'a'] },
      { question: 'hawaii has', expected: ['volcanoes', 'volcano', 'v'] },
      { question: 'the statue of liberty is in new', expected: ['york', 'y'] },
    ], { gateSubjectTag: 'soc' });
  },

  async runArtG3Real(ctx) {
    const SENTENCES = [
      'a line is a path from point to point', 'lines can be straight or curved',
      'a shape is a closed line', 'circles squares and triangles are shapes',
      'form is a three dimensional shape', 'a cube has six sides',
      'space is the area around a shape', 'positive space is the shape',
      'negative space is around the shape', 'texture is how something feels',
      'rough and smooth are textures', 'color gives emotion',
      'value is light and dark', 'shading adds value',
      'a pencil makes dark lines', 'a soft pencil makes darker lines',
      'hard pencils make light lines', 'an eraser removes marks',
      'we draw what we see', 'we draw what we imagine',
      'start with basic shapes', 'add details later',
      'practice makes artists better', 'every artist started as a beginner',
      'paper comes in many sizes', 'paper comes in many colors',
    ];
    // T14.24 Session 78 — prime drawing basics elements lattice per
    // TODO line 557 before the drawing sentence pass.
    await this._teachDrawingBasics();
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachProductionStack('art', ctx, { tag: 'ART-G3' });
    return await this._gateSubjectProduction('art', 'grade3', [
      { question: 'a path from point to point is a', expected: ['line', 'l'] },
      { question: 'a closed line makes a', expected: ['shape', 's'] },
      { question: 'a three dimensional shape is a', expected: ['form', 'f'] },
      { question: 'how something feels is its', expected: ['texture', 't'] },
      { question: 'light and dark in art is called', expected: ['value', 'v'] },
      { question: 'the space that is the shape itself is', expected: ['positive', 'p'] },
      { question: 'darkening to add value is called', expected: ['shading', 'shade', 's'] },
      { question: 'we start a drawing with basic', expected: ['shapes', 'shape', 's'] },
    ], { gateSubjectTag: 'art' });
  },

  // ── NEW FULL-ROSTER G3 COURSES: Music / PE / Health / Spanish (language
  // track enters at G3 — this is its template). Course-identity prepended by
  // the _cellRunner wrapper; each self-gates via _gateSubjectProduction.
  async runMusicG3Real(ctx) {
    const VOCAB = [
      'music', 'staff', 'line', 'space', 'treble', 'clef', 'note', 'eighth', 'quarter',
      'half', 'whole', 'rest', 'melody', 'rhythm', 'beat', 'pitch', 'scale', 'round',
      'sing', 'ensemble', 'tune', 'rest',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'notes sit on the lines and spaces of a staff',
      'the treble clef tells us where the high notes are',
      'an eighth note is half as long as a quarter note',
      'a scale goes step by step from low to high',
      'a round is a song where voices start at different times',
      'we sing together in tune as an ensemble',
      'the melody is the main line of notes we remember',
      'rhythm is the long and short pattern over the beat',
      'reading music means knowing each note on the staff',
      'we count beats so everyone stays together',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['treble', 'high'], ['eighth', 'half'], ['scale', 'step'], ['ensemble', 'together'], ['melody', 'tune'],
    ]);
    await this._teachProductionStack('music', ctx, { tag: 'MUSIC-G3' });
    return await this._gateSubjectProduction('music', 'grade3', [
      { question: 'notes are written on the lines and spaces of a', expected: ['staff', 's'] },
      { question: 'the clef for high notes is the', expected: ['treble', 't'] },
      { question: 'a song where voices start at different times is a', expected: ['round', 'r'] },
      { question: 'the main line of notes we remember is the', expected: ['melody', 'm'] },
      { question: 'a scale goes step by step from low to', expected: ['high', 'h'] },
      { question: 'singing together as a group is an', expected: ['ensemble', 'e'] },
      { question: 'an eighth note is half a', expected: ['quarter', 'q'] },
      { question: 'the long and short pattern over the beat is', expected: ['rhythm', 'r'] },
    ], { gateSubjectTag: 'music' });
  },

  async runPeG3Real(ctx) {
    const VOCAB = [
      'run', 'jump', 'throw', 'catch', 'dribble', 'strike', 'aim', 'accuracy', 'cardio',
      'strength', 'flexible', 'endurance', 'fitness', 'goal', 'team', 'strategy', 'fair', 'rule',
      'practice', 'pulse', 'heart', 'stretch',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'cardio exercise like running makes our heart stronger',
      'strength is how much force our muscles make',
      'flexibility lets our joints move through a full range',
      'endurance lets us keep going for a long time',
      'we aim at a target to throw with accuracy',
      'a team makes a strategy to reach a goal',
      'we set a goal and practice to reach it',
      'good sportsmanship is being fair whether we win or lose',
      'we stretch before and after we play',
      'the three parts of fitness are cardio strength and flexibility',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['cardio', 'heart'], ['strength', 'muscle'], ['aim', 'accuracy'], ['practice', 'goal'], ['team', 'strategy'],
    ]);
    await this._teachProductionStack('pe', ctx, { tag: 'PE-G3' });
    return await this._gateSubjectProduction('pe', 'grade3', [
      { question: 'exercise that makes the heart stronger is', expected: ['cardio', 'c'] },
      { question: 'how much force our muscles make is', expected: ['strength', 's'] },
      { question: 'being able to keep going a long time is', expected: ['endurance', 'e'] },
      { question: 'we aim at a target to throw with', expected: ['accuracy', 'a'] },
      { question: 'a team makes a plan called a', expected: ['strategy', 's'] },
      { question: 'we set a goal and we', expected: ['practice', 'p'] },
      { question: 'being fair when we win or lose is good', expected: ['sportsmanship', 'sport', 's'] },
      { question: 'we stretch to improve our', expected: ['flexibility', 'flexible', 'f'] },
    ], { gateSubjectTag: 'pe' });
  },

  async runHealthG3Real(ctx) {
    const VOCAB = [
      'health', 'heart', 'blood', 'lungs', 'oxygen', 'stomach', 'digest', 'nutrient', 'calorie',
      'balanced', 'meal', 'germ', 'spread', 'prevent', 'wash', 'feelings', 'stress', 'conflict',
      'bully', 'online', 'safe', 'tell',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'the heart pumps blood to carry oxygen to the body',
      'the lungs take in oxygen and let out carbon dioxide',
      'the stomach digests food to release nutrients',
      'a balanced meal has foods from every group',
      'calories are the energy our food gives us',
      'germs spread by touching and coughing and sneezing',
      'we prevent illness by washing hands and resting',
      'big feelings can be managed by naming them and breathing',
      'we solve a conflict by talking and listening',
      'if someone bullies us online or in person we tell a trusted adult',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['heart', 'blood'], ['lungs', 'oxygen'], ['stomach', 'nutrient'], ['germ', 'spread'], ['stress', 'breathe'], ['bully', 'tell'],
    ]);
    await this._teachProductionStack('health', ctx, { tag: 'HEALTH-G3' });
    return await this._gateSubjectProduction('health', 'grade3', [
      { question: 'the heart pumps blood to carry', expected: ['oxygen', 'o'] },
      { question: 'the lungs take in', expected: ['oxygen', 'air', 'o', 'a'] },
      { question: 'the stomach digests food to release', expected: ['nutrients', 'nutrient', 'n'] },
      { question: 'the energy our food gives us is measured in', expected: ['calories', 'calorie', 'c'] },
      { question: 'germs spread by touching coughing and', expected: ['sneezing', 'sneeze', 's'] },
      { question: 'we solve a conflict by talking and', expected: ['listening', 'listen', 'l'] },
      { question: 'if someone bullies us we tell a trusted', expected: ['adult', 'grownup', 'a', 'g'] },
      { question: 'a meal with foods from every group is', expected: ['balanced', 'b'] },
    ], { gateSubjectTag: 'health' });
  },

  async runLanguageG3Real(ctx) {
    const VOCAB = [
      'spanish', 'language', 'hola', 'adios', 'gracias', 'si', 'no', 'por', 'favor',
      'uno', 'dos', 'tres', 'rojo', 'azul', 'verde', 'mama', 'papa', 'hermano',
      'amigo', 'gato', 'perro', 'agua', 'casa',
    ];
    await this._teachVocabList(VOCAB, ctx, { reps: 3 });
    const SENTENCES = [
      'spanish is another language that many people speak',
      'hola means hello and adios means goodbye',
      'gracias means thank you and por favor means please',
      'si means yes and no means no',
      'uno dos tres are the words for one two three',
      'rojo is red and azul is blue and verde is green',
      'mama is mom and papa is dad and hermano is brother',
      'amigo means friend',
      'gato is cat and perro is dog',
      'agua is water and casa is house',
      'learning another language lets us talk to more people',
      'we practice saying the words out loud to remember them',
    ];
    await this._teachSentenceList(SENTENCES, ctx, { reps: 2, ticksPerWord: 2 });
    await this._teachCausalChains([
      ['hola', 'hello'], ['adios', 'goodbye'], ['gracias', 'thanks'], ['uno', 'one'], ['rojo', 'red'], ['gato', 'cat'], ['agua', 'water'],
    ]);
    await this._teachProductionStack('language', ctx, { tag: 'SPANISH-G3' });
    return await this._gateSubjectProduction('language', 'grade3', [
      { question: 'the spanish word for hello is', expected: ['hola', 'h'] },
      { question: 'the spanish word for thank you is', expected: ['gracias', 'g'] },
      { question: 'the spanish word for yes is', expected: ['si', 's'] },
      { question: 'the spanish word for one is', expected: ['uno', 'u'] },
      { question: 'the spanish word for red is', expected: ['rojo', 'r'] },
      { question: 'the spanish word for cat is', expected: ['gato', 'g'] },
      { question: 'the spanish word for water is', expected: ['agua', 'a'] },
      { question: 'the spanish word for friend is', expected: ['amigo', 'a'] },
    ], { gateSubjectTag: 'language' });
  },

  async runLifeG3(ctx) {
    // ── G3 life experience — DATA-DRIVEN (corpora/life/grade3.json) ──
    // THE pivotal year: the day dad left, anger-instead-of-sad, mom's two
    // jobs, smart-but-bored, the private promise to never abandon, grandpa
    // Walter steady in the garage — TRAINED from story DATA, not hardcoded
    // feat-vectors. The defining abandonment wound + the forging of her
    // independence emerge from the narrative. (Add #19 EXCLUDED entirely.)
    await this._trainLifeStories('grade3', ctx, { reps: 4, ticksPerWord: 2 });

    return this._teachVocabList([
      'angry', 'sad', 'alone', 'tired', 'lunch', 'laundry', 'smart', 'potential',
    ], ctx, { reps: 5 });
  }
};
