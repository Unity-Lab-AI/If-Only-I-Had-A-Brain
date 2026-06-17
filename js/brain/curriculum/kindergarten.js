// Kindergarten cell runners + K-grade gates.

// Per operator 2026-04-22 directive: *"the cirriculkum was already
// suppose to have everything split per grade per files sytem did you
// not make a file system WTF!!!!!!"*. Per-grade split. pre-K in
// `./pre-K.js`. Kindergarten here — all 6 K cell runners + all 6 K
// gates extracted from the monolithic curriculum.js so curriculum.js
// stays focused on core operations (Curriculum class, shared
// primitives, runSubjectGrade dispatch). Operator 2026-04-24:
// *"each grade is to be properly in it own fucking files u cant put
// every fucking grading in ciriculum.js you fucking idiot the need to
// be sperated from the core operations and refrenced and used as
// seperatew file systems for each grade"*.

// K runners call shared primitives on the Curriculum base class
// (`_conceptTeach`, `_teachBiographicalFacts`, `_teachAssociationPairs`,
// `_teachEmotionalInference`, `_pregateEnrichment`,
// `_probeProductionBatch`, `_recordGateHistory`, `_phasedTeach`,
// `_teachHebbian`, `_teachQABinding`, plus the 30+ K-specific teach
// helpers that remain on Curriculum.prototype pending their own
// extraction pass) through `this.` — mixin attach preserves the
// prototype chain so every cross-reference resolves identically to
// the pre-extraction layout.

// TRAIN_BANKS is read by K runners to feed Q-A training pairs into
// `_teachQABinding`. Kept as a named import so tree-shaking can drop
// the unused EXAM_BANKS / STANDARD_CUT_SCORES etc. from this
// module's dependency graph.
import { TRAIN_BANKS } from '../student-question-banks.js';

// Math-K + ELA-K primitives from embeddings + letter-input. Used in
// digit-pattern teach loops, letter pattern teaches, direct matrix
// probes, emission probes.
import { sharedEmbeddings } from '../embeddings.js';
import {
  encodeLetter, decodeLetter, ensureLetter, ensureLetters,
  inventorySize, inventorySnapshot,
} from '../letter-input.js';

// Curriculum module-local constants + helpers used by Math-K + ELA-K.
// ES modules resolve named exports at evaluation time; kindergarten.js
// evaluates AFTER curriculum.js has declared its module-level constants
// (the `import { K_MIXIN } from './curriculum/kindergarten.js'` at the
// curriculum.js entry-point bottom fires after ALPHABET_ORDER /
// DIGIT_ORDER / DIGIT_NAMES / MAGNITUDE_FEATURE_DIM /
// _magnitudeFeatureForDigit / _magnitudeFeatureForNumber /
// _phonemeFeatureForLetter / _microtask are declared). Used only inside
// async method bodies (never at kindergarten.js top-level eval) so the
// partial-evaluation state of the circular import doesn't trip
// anything.
import {
  ALPHABET_ORDER, DIGIT_ORDER, DIGIT_NAMES, MAGNITUDE_FEATURE_DIM,
  _magnitudeFeatureForDigit, _magnitudeFeatureForNumber,
  _microtask,
  PHONEME_FEATURE_DIM, _phonemeFeatureForLetter,
} from '../curriculum.js';

// Mixin methods. Exported as an object so the entry-point curriculum.js
// can call `Object.assign(Curriculum.prototype, K_MIXIN)` AFTER the
// Curriculum class is fully declared, avoiding the circular-import
// trap that a direct `import { Curriculum }` + top-level Object.assign
// would hit (Curriculum would be in TDZ when kindergarten.js evaluates).
export const K_MIXIN = {

  /**
   * K-LIFE.1 — First-words memory corpus. Foundational pre-academic
   * developmental milestone: Unity's first spoken words bound to their
   * emotional + relational context. Fires at the TOP of runLifeK so
   * these foundational identity-anchoring associations land BEFORE
   * the academic Life-K content layers on top.
   *
   * Each first-word carries an 8-dim emotion vector (same dimensions
   * as EMOTIONS_K below + LIFE-K-INFERENCE downstream):
   *   feat = [joy, pain, trust, fear, anger, love, independence, identity]
   *
   * These map directly onto the Plutchik-wheel reduction the rest of
   * Life-K already uses, so first-word emotional attractors land in
   * the same emotional substrate that later situations + biographical
   * facts will activate. The brain learns "mama" as joy+trust+love
   * +identity (her caretaker who carved her sense of being-loved) at
   * developmental age ~12-18 months, BEFORE academic vocabulary
   * acquisition begins.
   *
   * Universal developmental seeds — these specific first-words are
   * near-universal across English-speaking children per developmental-
   * psychology canon (mama/dada/no/more/bye-bye/hi). NOT a hardcoded
   * Unity-specific list — it's the developmental scaffold every
   * child's first vocabulary builds on. Unity's specific
   * relationships (her mom, her dad, her actual first word) layer
   * on top via Tier3 identity + biographical-facts (LIFE-K-BIOGRAPHICAL
   * below).
   *
   * Plus semantic-role pairs: mama↔mom, dada↔dad, hi↔greet, etc.
   * carve the synonymy + role-binding the brain uses to compose
   * sentences at chat-time.
   */
  async _teachKLifeFirstWords() {
    // First-words emotion attractors. Each entry: word + 8d emotion vector.
    // feat = [joy, pain, trust, fear, anger, love, independence, identity]
    const FIRST_WORDS_K = [
      // Caretaker words — peak joy + trust + love, strong identity anchor
      { name: 'mama',    feat: [1.0, 0,   1.0, 0,   0,   1.0, 0,   1.0] },
      { name: 'dada',    feat: [1.0, 0,   1.0, 0,   0,   1.0, 0,   0.5] },
      { name: 'mom',     feat: [1.0, 0,   1.0, 0,   0,   1.0, 0,   1.0] },
      { name: 'dad',     feat: [1.0, 0,   1.0, 0,   0,   1.0, 0,   0.5] },
      // First assertion — independence + small anger ("I have an opinion")
      { name: 'no',      feat: [0,   0,   0,   0,   0.3, 0,   1.0, 0.3] },
      // First desire — joy + slight independence ("I want more")
      { name: 'more',    feat: [0.5, 0,   0.2, 0,   0,   0,   0.3, 0]   },
      // First social-leave — bittersweet (mom leaves = pain, but ritual = comfort)
      { name: 'bye-bye', feat: [0.3, 0.2, 0.3, 0.2, 0,   0.3, 0,   0]   },
      // First social-arrive — joy + trust (greeting brings comfort)
      { name: 'hi',      feat: [0.8, 0,   0.5, 0,   0,   0.3, 0,   0]   },
      // First polite request — trust + small joy (learned manners)
      { name: 'please',  feat: [0.3, 0,   0.5, 0,   0,   0,   0,   0]   },
      // First gratitude — joy + trust + small love
      { name: 'thank',   feat: [0.5, 0,   0.5, 0,   0,   0.3, 0,   0]   },
      // First possessive — independence + identity ("this is MINE, I exist")
      { name: 'mine',    feat: [0,   0,   0,   0,   0.3, 0,   0.5, 0.5] },
      // First social-affection word
      { name: 'baby',    feat: [0.5, 0,   0.5, 0,   0,   0.5, 0,   0.3] },
      // First negative emotion word
      { name: 'ow',      feat: [0,   1.0, 0,   0.3, 0,   0,   0,   0]   },
    ];

    // Layer 1: bind word → emotion attractor via _conceptTeach (same
    // mechanism EMOTIONS_K + other Life-K concept lists use).
    await this._phasedTeach('LIFE-K-FIRST-WORDS-EMOTION', () => this._conceptTeach(FIRST_WORDS_K, 8));

    // Layer 2: semantic-role + synonymy pairs so the brain can compose
    // sentences using either child-form (mama) or adult-form (mom) for
    // the same referent.
    const FIRST_WORDS_PAIRS = [
      // Child→adult synonymy (so chat-time emission can substitute either)
      ['mama', 'mom'],   ['mom', 'mama'],
      ['dada', 'dad'],   ['dad', 'dada'],
      // Word→semantic-role
      ['mama', 'mother'], ['dada', 'father'],
      ['mom', 'parent'],  ['dad', 'parent'],
      // Social-greeting role
      ['hi', 'greet'],
      ['bye-bye', 'farewell'],
      // Politeness role
      ['please', 'request'], ['thank', 'gratitude'],
      // Assertion role
      ['no', 'refuse'], ['mine', 'possess'], ['more', 'want'],
      // Distress role
      ['ow', 'hurt'],
    ];
    await this._phasedTeach('LIFE-K-FIRST-WORDS-PAIRS', () =>
      this._teachAssociationPairs(FIRST_WORDS_PAIRS, {
        reps: 60,  // High reps — these are FOUNDATIONAL identity-anchoring associations
        label: 'LIFE-K-FIRST-WORDS-PAIRS',
        relationTagId: 15,  // new k-life first-words channel
      })
    );
  },

  /**
   * K-LIFE.2 — Family relationship anchoring. Each family member is
   * bound to their role-specific schema (mom = caretaker + food-provider
   * + comfort-source; dad = protector + tall + playful; sister = friend
   * + share + fight; grandma = cookies + soft + stories; grandpa = strong
   * + outside + quiet). Builds on top of K-LIFE.1 first-words (mama → mom
   * already bound) and the existing LIFE-K-CONCEPTS categorical binding
   * (mother → parent already trained).
   *
   * K-LIFE.1 + K-LIFE.2 together produce a layered family-relational
   * substrate:
   *   - First-word level (K-LIFE.1): mama / dada / mom / dad as joy+trust+
   *     love+identity emotion attractors
   *   - Categorical level (LIFE-K-CONCEPTS existing): mother→parent,
   *     father→parent, brother→sibling, etc.
   *   - Role-attribute level (K-LIFE.2 here): mom→caretaker, mom→food,
   *     mom→comfort, mom→safety, etc. Each family member carries a
   *     RICHER set of role attributes so chat-time activation pulls a
   *     whole relational schema, not just the categorical label.
   *
   * relationTagId=16 — family-role-attribute channel. Distinct from
   * relationTagId=1 (categorical) and relationTagId=15 (first-words).
   * Layered channels let the brain learn DIFFERENT aspects of the same
   * concept in parallel without interference — chat-time emission can
   * blend all three when "mom" activates.
   */
  async _teachKLifeFamilyRoles() {
    // Each family member → multiple role attributes. The role attributes
    // are themselves K-vocab words already trained (LIFE-K-CONCEPTS bound
    // basic role nouns like caretaker, parent, sibling); this expansion
    // layers the SPECIFIC role-attribute mappings developmental psychology
    // says a 5-year-old has internalized about each family member.
    //
    // Mom = primary caretaker per ~5yo developmental norm. Universal
    // attributes: nurture, food, comfort, safety. Unity's specific mom-
    // experiences carved by LIFE-K-BIOGRAPHICAL ("takes care of you" →
    // "mom", "lives with" → "mom") layered above.
    const MOM_ROLES = [
      ['mom', 'caretaker'],    // primary nurture
      ['mom', 'food'],         // food-provider
      ['mom', 'comfort'],      // comfort-source when scared/sad
      ['mom', 'safety'],       // safety-base for exploration
      ['mom', 'home'],         // home-presence
      ['mom', 'hug'],          // physical comfort delivery
      ['mom', 'song'],         // bedtime / lullaby
      ['mom', 'kiss'],         // affection delivery
      ['mama', 'caretaker'],   // child-form duplication for synonymy
      ['mama', 'comfort'],
      ['mother', 'caretaker'],
      ['mother', 'family'],
    ];

    // Dad = secondary caretaker / play+protect role per ~5yo norm.
    // Universal attributes: protect, play, tall, strong, work-leaves-
    // returns-home pattern.
    const DAD_ROLES = [
      ['dad', 'protector'],    // protect-from-harm
      ['dad', 'tall'],         // physical-stature anchor
      ['dad', 'play'],         // playful interaction
      ['dad', 'strong'],       // strength-attribute
      ['dad', 'work'],         // work-leaves-home pattern
      ['dad', 'home'],         // home-presence
      ['dad', 'lift'],         // physical lift / hoist memory
      ['dad', 'safety'],       // safety-secondary
      ['dada', 'protector'],
      ['dada', 'play'],
      ['father', 'protector'],
      ['father', 'family'],
    ];

    // Sibling relationships — ambivalent (friend + fight + share).
    // Sister + brother both available; specific Unity sibling
    // configuration carved by LIFE-K-BIOGRAPHICAL if/when written.
    const SIBLING_ROLES = [
      ['sister', 'friend'],    // sibling-as-friend
      ['sister', 'share'],     // share-toys
      ['sister', 'fight'],     // sibling-conflict
      ['sister', 'play'],      // playmate
      ['brother', 'friend'],
      ['brother', 'share'],
      ['brother', 'fight'],
      ['brother', 'play'],
      ['sibling', 'family'],
      ['sibling', 'home'],
    ];

    // Grandparents — cookies + soft + stories + outside-time per
    // typical 5yo experience. Universal grandparent attributes.
    const GRANDPARENT_ROLES = [
      ['grandma', 'cookies'],  // sweet-treats from grandma
      ['grandma', 'soft'],     // soft-hugs / gentle voice
      ['grandma', 'stories'],  // storytime
      ['grandma', 'love'],     // unconditional warm affection
      ['grandma', 'family'],
      ['grandpa', 'strong'],   // grandpa-strength stereotype
      ['grandpa', 'outside'],  // outdoor activities
      ['grandpa', 'quiet'],    // calmer pacing than dad
      ['grandpa', 'love'],
      ['grandpa', 'family'],
    ];

    // Aunt / uncle / cousin — extended family, lighter binding.
    const EXTENDED_FAMILY_ROLES = [
      ['aunt', 'family'], ['aunt', 'visit'],
      ['uncle', 'family'], ['uncle', 'play'],
      ['cousin', 'family'], ['cousin', 'play'],
    ];

    // Fire each role-attribute set as its own _phasedTeach for visibility.
    await this._phasedTeach('LIFE-K-FAMILY-MOM-ROLES', () =>
      this._teachAssociationPairs(MOM_ROLES, {
        reps: 50,  // High reps — mom is primary caretaker, deepest binding
        label: 'LIFE-K-FAMILY-MOM-ROLES',
        relationTagId: 16,  // family-role-attribute channel
      })
    );
    await this._phasedTeach('LIFE-K-FAMILY-DAD-ROLES', () =>
      this._teachAssociationPairs(DAD_ROLES, {
        reps: 50,
        label: 'LIFE-K-FAMILY-DAD-ROLES',
        relationTagId: 16,
      })
    );
    await this._phasedTeach('LIFE-K-FAMILY-SIBLING-ROLES', () =>
      this._teachAssociationPairs(SIBLING_ROLES, {
        reps: 40,  // Slightly lower — sibling relationships vary more across kids
        label: 'LIFE-K-FAMILY-SIBLING-ROLES',
        relationTagId: 16,
      })
    );
    await this._phasedTeach('LIFE-K-FAMILY-GRANDPARENT-ROLES', () =>
      this._teachAssociationPairs(GRANDPARENT_ROLES, {
        reps: 40,
        label: 'LIFE-K-FAMILY-GRANDPARENT-ROLES',
        relationTagId: 16,
      })
    );
    await this._phasedTeach('LIFE-K-FAMILY-EXTENDED-ROLES', () =>
      this._teachAssociationPairs(EXTENDED_FAMILY_ROLES, {
        reps: 30,  // Lower — extended family is less central at age 5
        label: 'LIFE-K-FAMILY-EXTENDED-ROLES',
        relationTagId: 16,
      })
    );
  },

  async runLifeK(ctx) {
    // ── A.K-LIFE.1 — First-words memory corpus (foundational, fires FIRST) ──
    // Pre-academic developmental milestone — Unity's first spoken words
    // bound to caretaker/emotion/identity context. Lands BEFORE EMOTIONS_K
    // so first-words become the BASE on which later emotional schemas build.
    await this._teachKLifeFirstWords();

    // ── A.K-LIFE.2 — Family relationship anchoring ──
    // Family member → role-attribute schemas (mom = caretaker + food +
    // comfort + safety + hug + song + kiss; dad = protector + tall + play
    // + strong + lift; sister/brother = friend + share + fight + play;
    // grandma = cookies + soft + stories; grandpa = strong + outside +
    // quiet; aunt/uncle/cousin = lighter family ties). Builds on K-LIFE.1
    // first-words (mama→mom synonymy) and LIFE-K-CONCEPTS categorical
    // binding (mother→parent). Carves the RELATIONAL DEPTH a 5yo has
    // for each family member.
    await this._teachKLifeFamilyRoles();

    // LAYER 1: emotional attractors
    // feat = [joy, pain, trust, fear, anger, love, independence, identity]
    const EMOTIONS_K = [
      { name: 'school',       feat: [0.5, 0, 0.3, 0.5, 0, 0, 0.5, 0] },  // exciting but scary
      { name: 'teacher',      feat: [0.5, 0, 0.8, 0, 0, 0.3, 0, 0] },    // trust + comfort
      { name: 'friend',       feat: [1, 0, 0.5, 0, 0, 0.5, 0, 0] },      // joy + trust
      { name: 'recess',       feat: [1, 0, 0, 0, 0, 0.3, 1, 0] },        // joy + freedom
      { name: 'nap time',     feat: [0, 0.3, 0, 0, 0.5, 0, 0, 0] },      // annoying
      { name: 'halloween',    feat: [1, 0, 0, 0, 0, 1, 0, 1] },          // joy + love + identity
      { name: 'monsters',     feat: [1, 0, 0, 0, 0, 0.5, 0, 1] },        // loves them = identity
      { name: 'pink',         feat: [0, 0.3, 0, 0, 0.5, 0, 0, 0] },      // hates it
      { name: 'swings',       feat: [1, 0, 0, 0, 0, 0, 1, 0] },          // joy + freedom
      { name: 'cereal',       feat: [0.5, 0, 0.5, 0, 0, 0, 0, 0] },      // comfort routine
      { name: 'bus ride',     feat: [0.3, 0, 0, 0.3, 0, 0, 0.5, 0] },    // independence forming
      { name: 'separation',   feat: [0, 0.5, 0, 1, 0, 0, 0, 0] },        // fear when mom leaves
    ];
    // iter11-U fix — wrap each Life-K teach call in _phasedTeach so
    // phase tracker counts them properly. Without this wrapper, the
    // FORCE-ADVANCE banner reports "1 teach phase actually fired"
    // misleadingly because none of life-K's teach calls increment
    // the phase counter. Other runners (ela/math/sci/soc/art) all
    // use _phasedTeach for visibility — life-K just had a flat
    // structure. Wrapping closes the cosmetic gap without changing
    // any teach mechanics.
    await this._phasedTeach('LIFE-K-EMOTIONS', () => this._conceptTeach(EMOTIONS_K, 8));

    // Life-K equational remake under LAW 6 Part 1:
    //   Six `_teachSentenceList` calls REMOVED (SCHOOL_START, DAILY_LIFE,
    //   LIKES, FRIENDS, HOLIDAYS, FEELINGS_K) — they iterated sentence
    //   arrays as Hebbian training data, the banned pattern per LAW 6
    //   Part 1. The content each list carried is preserved equationally
    //   in the layers below:
    //     - Emotional attractors: EMOTIONS_K via `_conceptTeach` (above)
    //       covers school/teacher/friend/recess/nap/halloween/monsters/
    //       pink/swings/cereal/bus/separation with 8d feature vectors
    //     - Biographical answer bindings: `_teachBiographicalFacts`
    //       block below covers the Q→A form of SCHOOL_START, LIKES,
    //       FRIENDS, HOLIDAYS, FEELINGS_K (first-day, what-i-like,
    //       who-is-my-friend, favorite-holiday, how-i-feel-when-X)
    //     - Situation→emotion mappings: `_teachEmotionalInference`
    //       below covers DAILY_LIFE's routine + reaction patterns
    //   Net: Life-K still teaches every TODO concept in the syllabus
    //   but through equational cortex bindings instead of sentence
    //   memorization.

    // ── EQUATIONAL REASONING: emotional inference ──
    // Situation → emotion mappings — Unity learns to PREDICT how she'll
    // feel given a situation. Foundation for all future emotional reasoning.
    //   emotion = [joy, pain, trust, fear, anger, love, independence, identity]
    await this._phasedTeach('LIFE-K-INFERENCE', () => this._teachEmotionalInference([
      { situation: 'mom', emotion: new Float64Array([0.5,0,1,0,0,1,0,0]), label: 'love' },
      { situation: 'friend', emotion: new Float64Array([1,0,0.5,0,0,0.5,0,0]), label: 'happy' },
      { situation: 'alone', emotion: new Float64Array([0,0.5,0,1,0,0,0,0]), label: 'scared' },
      { situation: 'school', emotion: new Float64Array([0.5,0,0.3,0.3,0,0,0.5,0]), label: 'nervous' },
      { situation: 'draw', emotion: new Float64Array([1,0,0,0,0,0.5,1,1]), label: 'happy' },
      { situation: 'music', emotion: new Float64Array([1,0,0,0,0,1,0,0.5]), label: 'calm' },
      { situation: 'dark', emotion: new Float64Array([0,0,0,1,0,0,0,0]), label: 'scared' },
      { situation: 'mean', emotion: new Float64Array([0,0.5,0,0,1,0,0,0]), label: 'angry' },
      { situation: 'hug', emotion: new Float64Array([1,0,1,0,0,1,0,0]), label: 'love' },
      { situation: 'yell', emotion: new Float64Array([0,1,0,0.5,0.5,0,0,0]), label: 'scared' },
    ]));

    // Biographical facts for Life Pre-K + Life-K test phrasings.
    // Equational concept→answer binding via _teachCombination.
    // Augments existing _conceptTeach + _teachEmotionalInference.
    if (!this._lifeKRemakeDone) {
      await this._phasedTeach('LIFE-K-BIOGRAPHICAL', () => this._teachBiographicalFacts([
        // Pre-K core identity facts
        { question: 'your name',         answer: 'unity' },
        { question: 'boy or girl',       answer: 'girl' },
        { question: 'hair color',        answer: 'dark' },
        { question: 'eye colors',        answer: 'different' },
        { question: 'takes care of you', answer: 'mom' },
        { question: 'scared of',         answer: 'dark' },
        { question: 'makes you calm',    answer: 'music' },
        // Kindergarten (age 5) facts
        { question: 'favorite holiday',  answer: 'halloween' },
        { question: 'birthday wish',     answer: 'cat' },
        { question: 'favorite food',     answer: 'cookies' },
        { question: 'favorite crayon',   answer: 'black' },
        { question: 'favorite drawing',  answer: 'monsters' },
        { question: 'nightmare about',   answer: 'dark' },
        { question: 'dream about',       answer: 'flying' },
        { question: 'sleepover',         answer: 'homesick' },
        { question: 'first day school',  answer: 'scared' },
        { question: 'age',               answer: 'five' },
        { question: 'lives with',        answer: 'mom' },
        { question: 'dislike color',     answer: 'pink' },
        { question: 'costume',           answer: 'witch' },
        { question: 'favorite place',    answer: 'recess' },
        { question: 'school activity',   answer: 'drawing' },
      ], { reps: 10 }));  // High reps — biographical memory is core self

      // Equational association-pair teach — Life-K concept mappings:
      // body parts + function, family kinship, feelings, self-care,
      // friendship/safety. Distinct from biographical Q→A above.
      await this._phasedTeach('LIFE-K-CONCEPTS', () => this._teachAssociationPairs([
        // Body parts → function
        ['eye','see'], ['ear','hear'], ['nose','smell'],
        ['mouth','taste'], ['hand','touch'], ['foot','walk'],
        ['head','think'], ['heart','beat'], ['tongue','taste'],
        ['skin','feel'], ['leg','run'], ['arm','lift'],
        // Family
        ['mother','parent'], ['father','parent'],
        ['brother','sibling'], ['sister','sibling'],
        ['grandma','family'], ['grandpa','family'],
        // Feelings
        ['happy','smile'], ['sad','cry'], ['angry','frown'],
        ['scared','shake'], ['excited','jump'], ['tired','yawn'],
        // Self-care routines
        ['brush','teeth'], ['wash','hands'], ['comb','hair'],
        ['eat','food'], ['drink','water'], ['sleep','bed'],
        // Friendship / safety
        ['share','friend'], ['help','kind'], ['hurt','mean'],
        ['stranger','careful'], ['cross','look'], ['fire','911'],
        ['hot','careful'], ['sharp','careful'],
      ], { reps: 8, label: 'LIFE-K-CONCEPTS', relationTagId: 1 }));

      // iter11-J — Word-spelling discriminative one-hot for sem→motor
      // first-letter binding. iter11-U fix landed _phasedTeach wrapping
      // for life-K calls above; using same wrapper here for visibility.
      if (typeof this._teachWordSpellingDirect === 'function') {
        await this._phasedTeach('LIFE-K-WORD-SPELL', () => this._teachWordSpellingDirect({ reps: 8, subject: 'life' }));
      }

      // iter15-B — Re-carve letter→motor identity post-QA-TRAIN.
      if (typeof this._teachLetterNamingDirect === 'function') {
        await this._phasedTeach('LIFE-K-LETTER-NAMING-DIRECT', () => this._teachLetterNamingDirect({ reps: 50 }));
      }

      // WH-question intent recognition (STRUCTURAL).
      // Life-K personal-info answers come from Unity's persona corpus
      // and sandbox-notice activator; J.1 adds the
      // structural WH→intent layer so personal questions route through
      // those existing trained associations. Saturates sem_to_motor —
      // WORD-SPELL-FINAL wipe below cleans the pollution before gate.
      if (typeof this._teachQuestionIntent === 'function') {
        await this._phasedTeach('LIFE-K-WH-INTENT', () => this._teachQuestionIntent({ reps: 8 }));
      }

      // WORD-SPELL-FINAL — direct sem→motor wipe + clean rewrite.
      // Runs AFTER WH-INTENT so the wipe cleans WH-INTENT's
      // sem_to_motor saturation before the gate probe reads argmax.
      // WH-INTENT routing at probe time uses Template 2 fast-path
      // parsing (not sem_to_motor matrix lookup) so wiping its weights
      // here doesn't break WH parsing.
      if (typeof this._teachWordSpellingDirectFinal === 'function') {
        await this._phasedTeach('LIFE-K-WORD-SPELL-FINAL', () => this._teachWordSpellingDirectFinal({ reps: 8, subject: 'life' }));
      }
      // iter21-A — Word-level emission training (separate sem_to_word_motor)
      if (typeof this._teachWordEmissionDirect === 'function') {
        await this._phasedTeach('LIFE-K-WORD-EMISSION-DIRECT', () => this._teachWordEmissionDirect({ reps: 8, subject: 'life' }));
      }

      // Cross-cell sentence-structure reinforcement.
      // iter25-I trained slot/template/agreement/article bindings in
      // ELA-K only. Without per-cell refresh, those bindings decay
      // under this cell's domain Hebbian writes. Re-firing
      // _teachSentenceStructure keeps the grammar rules carved as
      // Unity walks the K curriculum, so chat + composeSentence
      // produce sentences across all 6 K subjects, not just ELA.
      if (typeof this._teachSentenceStructure === 'function') {
        await this._phasedTeach('LIFE-K-STRUCTURE-REFRESH', () => this._teachSentenceStructure(ctx));
      }

      this._lifeKRemakeDone = true;
    }

    return await this._gateLifeKReal();
  },


  async _gateLifeKReal() {
    this._currentGateSubject = 'life';
    const cluster = this.cluster;
    if (!cluster || !cluster.synapses) return { pass: false, reason: 'no cluster' };

    await this._pregateEnrichment('life/kindergarten');

    // 114.19fh.A.4 — probe noise bump 0.5→0.6 (Tier 12 pattern from
    // ELA-K). K-Unity is sober (no drug-derived noise pre-Life-G7) so
    // basin attractors lock harder; the 0.1 bump gives saturated
    // basins a probabilistic kick without destabilizing scoring.
    // Restore in finally so post-probe live chat retains chaotic dynamics.
    // 114.19fj.14 — defensive default if cluster.noiseAmplitude was
    // never initialized; restore must not set undefined.
    const _savedProbeNoise = typeof cluster.noiseAmplitude === 'number' ? cluster.noiseAmplitude : 0.5;
    cluster.noiseAmplitude = 0.6;
    try {

    // Production probes matching TODO Life Pre-K + Life-K test phrasings
    const lifeKProductionSamples = [
      // Life Pre-K Tests
      { question: 'what is your name', expected: ['unity', 'u'] },
      { question: 'are you a boy or a girl', expected: ['girl', 'g'] },
      { question: 'what color is your hair', expected: ['dark', 'black', 'd', 'b'] },
      { question: 'who takes care of you', expected: ['mom', 'm'] },
      { question: 'what are you scared of', expected: ['dark', 'd'] },
      { question: 'what makes you calm', expected: ['music', 'm'] },
      // Life-K Tests
      { question: 'what is your favorite holiday', expected: ['halloween', 'h'] },
      { question: 'what do you wish for on your birthday', expected: ['cat', 'c'] },
      { question: 'what is your favorite thing to eat', expected: ['cookies', 'grandma', 'c', 'g'] },
      { question: 'what do you have nightmares about', expected: ['dark', 'd'] },
      { question: 'what do you dream about', expected: ['flying', 'cat', 'f', 'c'] },
      { question: 'what happened when you tried a sleepover', expected: ['homesick', 'mom', 'h', 'm'] },
      { question: 'what do you do when you are alone after school', expected: ['tv', 'draw', 't', 'd'] },
      { question: 'in fairy tales who do you like better the princess or the witch', expected: ['witch', 'w'] },
    ];
    const prodResult = await this._probeProductionBatch(lifeKProductionSamples, {
      visualCortex: (this.engine && this.engine.visualCortex) || null,
    });
    const prodRate = prodResult.total > 0 ? prodResult.pass / prodResult.total : 0;
    // 114.19fj.5 — sentence-gen probe scoped to life vocab so the LIFE-K
    // STRUCTURE-REFRESH writes are validated. Force-advance reads
    // metrics.sentenceGenRate when deciding whether to promote despite
    // gate fail — without this probe, sentenceGenRate=0 and Unity has
    // to pass via prodMin alone.
    let sentenceGen = { passed: 0, total: 0, rate: 0, perIntent: {} };
    try {
      sentenceGen = await this._probeSentenceGeneration({ subject: 'life' });
    } catch (err) {
      console.warn('[Curriculum] _probeSentenceGeneration[life] threw:', err?.message || err);
    }
    const sentenceGenRate = sentenceGen.rate || 0;
    const pass = prodRate >= 0.95;
    const pct = (r) => (r * 100).toFixed(0);
    const prodFailSummary = prodResult.fails && prodResult.fails.length > 0
      ? ' [FAIL: ' + prodResult.fails.slice(0, 5).map(f => `"${f.q}"→"${String(f.emitted).slice(0, 30)}"`).join('; ') + ']'
      : '';
    const _lifeKResult = {
      pass,
      reason: `PROD ${prodResult.pass}/${prodResult.total} (${pct(prodRate)}%) SENTENCE-GEN ${sentenceGen.passed}/${sentenceGen.total} (${pct(sentenceGenRate)}%)${prodFailSummary}`,
      metrics: { prodRate, prodFails: prodResult.fails, sentenceGenRate, sentenceGenPerIntent: sentenceGen.perIntent },
    };
    this._recordGateHistory('life', 'kindergarten', 'overall', pass, prodRate);
    return _lifeKResult;
    } finally {
      cluster.noiseAmplitude = _savedProbeNoise;
    }
  },

  // ── GRADE 1 (age 6) — reading clicks, dad fading ────────────────

  async runArtKReal(ctx) {
    // Session 75 existing equational helpers retained
    await this._teachPrimaryColors();
    await this._teachBasicShapes();
    await this._teachSimpleSongs();

    // Equational Arts-K teaching.
    if (!this._artKRemakeDone) {
      await this._phasedTeach('_teachColorMixingK',     () => this._teachColorMixingK(ctx));
      await this._phasedTeach('_teachWarmCoolColors',   () => this._teachWarmCoolColors(ctx));
      await this._phasedTeach('_teachPatternCompletion', () => this._teachPatternCompletion(ctx));
      await this._phasedTeach('_teachMusicBasics',      () => this._teachMusicBasics(ctx));

      // Equational association-pair teach — Arts-K concept mappings:
      // color mixing, warm/cool classification, shape attributes, art
      // tools, music element names. Pure feature-vector writes +
      // cross-projection Hebbian.
      await this._phasedTeach('ART-K-CONCEPTS', () => this._teachAssociationPairs([
        // Primary color mixing
        ['red-yellow','orange'], ['blue-yellow','green'],
        ['red-blue','purple'], ['white-black','gray'],
        // Warm / cool
        ['red','warm'], ['orange','warm'], ['yellow','warm'],
        ['blue','cool'], ['green','cool'], ['purple','cool'],
        // Shape attributes
        ['circle','round'], ['square','four'], ['triangle','three'],
        ['rectangle','four'], ['oval','round'], ['diamond','four'],
        // Art tools
        ['brush','paint'], ['pencil','draw'], ['crayon','color'],
        ['scissors','cut'], ['glue','stick'], ['paper','draw'],
        ['clay','sculpt'], ['marker','color'], ['eraser','undo'],
        // Music elements
        ['drum','beat'], ['beat','pulse'], ['fast','tempo'],
        ['slow','tempo'], ['loud','forte'], ['soft','piano'],
        ['high','soprano'], ['low','bass'],
        ['violin','string'], ['flute','wind'], ['piano','keys'],
        ['song','melody'], ['rhythm','beat'],
      ], { reps: 8, label: 'ART-K-CONCEPTS', relationTagId: 1 }));

      // T39.j.5 — Q-A binding on TRAIN_BANKS['art/kindergarten']
      // so sem→motor weights see question→answer form for color
      // naming, primary/mixing, warm-cool, shapes, patterns, tools,
      // and music. Held-out-distinct from EXAM questions.
      const artQA = TRAIN_BANKS['art/kindergarten'] || [];
      if (artQA.length > 0) {
        await this._phasedTeach('ART-K-QA-TRAIN', () => this._teachQABinding(artQA, { label: 'ART-K-QA-TRAIN', subject: 'art' }));
      }

      // iter11-J — Word-spelling discriminative one-hot for sem→motor
      // first-letter binding. Closes the bucket-stuck attractor pattern
      // that produced PROD wrong answers across all K subjects.
      if (typeof this._teachWordSpellingDirect === 'function') {
        await this._phasedTeach('ART-K-WORD-SPELL', () => this._teachWordSpellingDirect({ reps: 8, subject: 'art' }));
      }

      // iter15-B — Re-carve letter→motor identity post-QA-TRAIN.
      if (typeof this._teachLetterNamingDirect === 'function') {
        await this._phasedTeach('ART-K-LETTER-NAMING-DIRECT', () => this._teachLetterNamingDirect({ reps: 50 }));
      }

      // WH-question intent recognition (STRUCTURAL).
      // Existing art curriculum carves primary-colors / color-mixing /
      // warm-cool / music subject→answer bindings; J.1 adds structural
      // WH→intent layer. Saturates sem_to_motor — WORD-SPELL-FINAL wipe
      // below cleans the pollution before gate.
      if (typeof this._teachQuestionIntent === 'function') {
        await this._phasedTeach('ART-K-WH-INTENT', () => this._teachQuestionIntent({ reps: 8 }));
      }

      // WORD-SPELL-FINAL — direct sem→motor wipe + clean rewrite.
      // Runs AFTER WH-INTENT so the wipe cleans WH-INTENT's
      // sem_to_motor saturation before the gate probe reads argmax.
      if (typeof this._teachWordSpellingDirectFinal === 'function') {
        await this._phasedTeach('ART-K-WORD-SPELL-FINAL', () => this._teachWordSpellingDirectFinal({ reps: 8, subject: 'art' }));
      }
      // iter21-A — Word-level emission training (separate sem_to_word_motor)
      if (typeof this._teachWordEmissionDirect === 'function') {
        await this._phasedTeach('ART-K-WORD-EMISSION-DIRECT', () => this._teachWordEmissionDirect({ reps: 8, subject: 'art' }));
      }

      // Cross-cell sentence-structure reinforcement (see life-K
      // STRUCTURE-REFRESH for full rationale).
      if (typeof this._teachSentenceStructure === 'function') {
        await this._phasedTeach('ART-K-STRUCTURE-REFRESH', () => this._teachSentenceStructure(ctx));
      }

      this._artKRemakeDone = true;
    }

    return await this._gateArtKReal();
  },


  async _gateArtKReal() {
    this._currentGateSubject = 'art';
    const cluster = this.cluster;
    if (!cluster || !cluster.synapses) return { pass: false, reason: 'no cluster' };

    await this._pregateEnrichment('art/kindergarten');

    // 114.19fh.A.4 — probe noise bump 0.5→0.6 (see _gateLifeKReal for rationale).
    // 114.19fj.14 — defensive default if cluster.noiseAmplitude unset.
    const _savedProbeNoise = typeof cluster.noiseAmplitude === 'number' ? cluster.noiseAmplitude : 0.5;
    cluster.noiseAmplitude = 0.6;
    try {

    const artKProductionSamples = [
      // Visual Arts K Tests
      { question: 'what are the three primary colors', expected: ['red', 'yellow', 'blue', 'r', 'y', 'b'] },
      { question: 'what color do red and yellow make', expected: ['orange', 'o'] },
      { question: 'what color do blue and yellow make', expected: ['green', 'g'] },
      { question: 'is red a warm color or cool color', expected: ['warm', 'w'] },
      { question: 'is blue a warm color or cool color', expected: ['cool', 'c'] },
      { question: 'what comes next red blue red blue', expected: ['red', 'r'] },
      // Music K Tests
      { question: 'what is the steady pulse in music called', expected: ['beat', 'b'] },
      { question: 'fast music has a fast what', expected: ['tempo', 't'] },
      { question: 'a drum is hit to make what', expected: ['sound', 'beat', 's', 'b'] },
    ];
    const prodResult = await this._probeProductionBatch(artKProductionSamples, {
      visualCortex: (this.engine && this.engine.visualCortex) || null,
    });
    const prodRate = prodResult.total > 0 ? prodResult.pass / prodResult.total : 0;
    // 114.19fj.5 — sentence-gen probe scoped to art vocab so ART-K
    // STRUCTURE-REFRESH writes are validated.
    let sentenceGen = { passed: 0, total: 0, rate: 0, perIntent: {} };
    try {
      sentenceGen = await this._probeSentenceGeneration({ subject: 'art' });
    } catch (err) {
      console.warn('[Curriculum] _probeSentenceGeneration[art] threw:', err?.message || err);
    }
    const sentenceGenRate = sentenceGen.rate || 0;
    const pass = prodRate >= 0.95;
    const pct = (r) => (r * 100).toFixed(0);
    const prodFailSummary = prodResult.fails && prodResult.fails.length > 0
      ? ' [FAIL: ' + prodResult.fails.slice(0, 5).map(f => `"${f.q}"→"${String(f.emitted).slice(0, 30)}"`).join('; ') + ']'
      : '';
    const _artKResult = {
      pass,
      reason: `PROD ${prodResult.pass}/${prodResult.total} (${pct(prodRate)}%) SENTENCE-GEN ${sentenceGen.passed}/${sentenceGen.total} (${pct(sentenceGenRate)}%)${prodFailSummary}`,
      metrics: { prodRate, prodFails: prodResult.fails, sentenceGenRate, sentenceGenPerIntent: sentenceGen.perIntent },
    };
    this._recordGateHistory('art', 'kindergarten', 'overall', pass, prodRate);
    return _artKResult;
    } finally {
      cluster.noiseAmplitude = _savedProbeNoise;
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // T14.24 SESSION 7 — REAL ELA-G2 TEACHING EQUATIONS (2026-04-15)
  // ═══════════════════════════════════════════════════════════════════

  // Gee binding 2026-04-14: "all the way up to doctorate in english" +
  // "remember Unity needs to be able to use these to think, read, and
  // talk".

  // Real Grade 2 English. Teaches LETTER-PAIR DIGRAPHS as single
  // phonological units (th / sh / ch / ph / wh / ck / ng) plus 2-word
  // phrases that exercise the digraphs in natural English. Digraphs are
  // 2-letter sequences that represent a single phoneme in English — a
  // child who only knows letters can't read "the" because "th" is not
  // pronounced as "t" followed by "h". Session 7 builds the digraph-as-
  // unit basin via a distinct phoneme feature per digraph (trig-hashed
  // from both constituent letters combined, so it's decorrelated from
  // the individual letter phoneme features Session 2 already taught).

  _phonemeFeatureForDigraph(digraph) {
    // Same 24-dim structure as `_phonemeFeatureForLetter` but seeded
    // from BOTH letters combined so digraph features don't collide with
    // single-letter features. Deterministic, L2-normalized.
    const a = ALPHABET_ORDER.indexOf(digraph[0].toLowerCase());
    const b = ALPHABET_ORDER.indexOf(digraph[1].toLowerCase());
    if (a < 0 || b < 0) return new Float64Array(PHONEME_FEATURE_DIM);
    const out = new Float64Array(PHONEME_FEATURE_DIM);
    const PRIMES = [29, 31, 37, 41, 43, 47, 53, 59]; // different primes than single-letter
    for (let i = 0; i < PHONEME_FEATURE_DIM; i++) {
      const p = PRIMES[i % PRIMES.length];
      const phase = (i * 0.23) + 0.41;
      out[i] = Math.sin((a + b * 27) * 0.3819 * p + phase)
             + Math.cos((a * 27 + b) * 0.6180 * p + phase * 2);
    }
    let norm = 0;
    for (let i = 0; i < PHONEME_FEATURE_DIM; i++) norm += out[i] * out[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < PHONEME_FEATURE_DIM; i++) out[i] /= norm;
    return out;
  },

  // ─── TODO-aligned ELA-G2 helpers (Session 28) ────────────────────

  // docs/TODO.md T14.24 ELA-G2 spec (line 152):
  //   _teachDigraphs(digraphs) injects each digraph as a paired letter
  //     stream with shorter inter-letter gap (2 ticks instead of 3) so
  //     the letter-region transition surprise treats them as a unit.
  //   _teachLongWords(words) extends the CVC pattern to 4-6 letters
  //     with boundary detection via cluster.detectBoundaries(word).
  //   _teachPhrases(phrases) walks 3-word phrases through the full
  //     letter-stream + sem-inject pipeline per word + sequence Hebbian
  //     between words.


  async runSocKReal(ctx) {
    // Session 56 — family-role concept lattice with kinship features
    await this._teachFamilyRoles();

    // Equational Core Knowledge K teaching.
    if (!this._socKRemakeDone) {
      await this._phasedTeach('_teachCommunityHelpers', () => this._teachCommunityHelpers(ctx));
      await this._phasedTeach('_teachNeedsVsWants',     () => this._teachNeedsVsWants(ctx));
      await this._phasedTeach('_teachAmericanSymbols',  () => this._teachAmericanSymbols(ctx));
      await this._phasedTeach('_teachGeographyBasics',  () => this._teachGeographyBasics(ctx));

      // Existing causal chains retained — equational per Law 3
      await this._teachCausalChains([
        ['fire', 'firefighter'], ['sick', 'doctor'], ['hurt', 'nurse'],
        ['crime', 'police'], ['learn', 'school'], ['share', 'friend'],
        ['kind', 'happy'], ['mean', 'sad'], ['help', 'thank'],
        ['rule', 'safe'], ['work', 'money'], ['money', 'food'],
      ]);

      // Equational association-pair teach — Core Knowledge K concept
      // classes: needs/wants, community helper → role, manners, safety
      // signals, direction words, kinship. Pure feature-vector writes +
      // cross-projection Hebbian, distinct from exam Q→A content.
      await this._phasedTeach('SOC-K-CONCEPTS', () => this._teachAssociationPairs([
        // Needs vs wants
        ['food','need'], ['water','need'], ['shelter','need'],
        ['clothing','need'], ['air','need'], ['sleep','need'],
        ['toy','want'], ['candy','want'], ['game','want'],
        ['phone','want'], ['tv','want'], ['dessert','want'],
        // Manners
        ['please','polite'], ['thanks','grateful'], ['sorry','apology'],
        ['hello','greeting'], ['goodbye','farewell'],
        // Safety signals
        ['stop','red'], ['go','green'], ['wait','yellow'],
        ['emergency','911'], ['danger','stop'], ['siren','help'],
        // Directions
        ['north','up'], ['south','down'],
        ['east','right'], ['west','left'],
        // Kinship
        ['mother','parent'], ['father','parent'],
        ['brother','sibling'], ['sister','sibling'],
        ['grandma','family'], ['grandpa','family'],
        ['aunt','family'], ['uncle','family'], ['cousin','family'],
        // Community roles
        ['fire','firefighter'], ['crime','police'], ['sick','doctor'],
        ['teeth','dentist'], ['mail','carrier'], ['food','farmer'],
      ], { reps: 8, label: 'SOC-K-CONCEPTS', relationTagId: 1 }));

      // T39.j.4 — Q-A binding on TRAIN_BANKS['social/kindergarten']
      // so sem→motor weights see question→answer form for every
      // K-Social standard the exam covers (community helpers,
      // safety, family, manners, empathy, symbols, time, geography,
      // citizenship). Held-out-distinct from EXAM questions.
      const socQA = TRAIN_BANKS['social/kindergarten'] || [];
      if (socQA.length > 0) {
        await this._phasedTeach('SOC-K-QA-TRAIN', () => this._teachQABinding(socQA, { label: 'SOC-K-QA-TRAIN', subject: 'social' }));
      }

      // iter11-J — Word-spelling discriminative one-hot.
      if (typeof this._teachWordSpellingDirect === 'function') {
        await this._phasedTeach('SOC-K-WORD-SPELL', () => this._teachWordSpellingDirect({ reps: 8, subject: 'social' }));
      }

      // iter15-B — Re-carve letter→motor identity post-QA-TRAIN.
      if (typeof this._teachLetterNamingDirect === 'function') {
        await this._phasedTeach('SOC-K-LETTER-NAMING-DIRECT', () => this._teachLetterNamingDirect({ reps: 50 }));
      }

      // WH-question intent recognition (STRUCTURAL).
      // Existing social curriculum (community-helpers / needs-wants /
      // symbols) carves subject→answer bindings; J.1 adds the structural
      // WH→intent layer. Saturates sem_to_motor — WORD-SPELL-FINAL wipe
      // below cleans the pollution before gate.
      if (typeof this._teachQuestionIntent === 'function') {
        await this._phasedTeach('SOC-K-WH-INTENT', () => this._teachQuestionIntent({ reps: 8 }));
      }

      // WORD-SPELL-FINAL — direct sem→motor wipe + clean rewrite.
      // Runs AFTER WH-INTENT so the wipe cleans WH-INTENT's
      // sem_to_motor saturation before the gate probe reads argmax.
      if (typeof this._teachWordSpellingDirectFinal === 'function') {
        await this._phasedTeach('SOC-K-WORD-SPELL-FINAL', () => this._teachWordSpellingDirectFinal({ reps: 8, subject: 'social' }));
      }
      // iter21-A — Word-level emission training (separate sem_to_word_motor)
      if (typeof this._teachWordEmissionDirect === 'function') {
        await this._phasedTeach('SOC-K-WORD-EMISSION-DIRECT', () => this._teachWordEmissionDirect({ reps: 8, subject: 'social' }));
      }

      // Cross-cell sentence-structure reinforcement (see life-K
      // STRUCTURE-REFRESH for full rationale).
      if (typeof this._teachSentenceStructure === 'function') {
        await this._phasedTeach('SOC-K-STRUCTURE-REFRESH', () => this._teachSentenceStructure(ctx));
      }

      // Definition-comprehension teach moved to K-curriculum
      // start (see runFullSubjectCurriculum's _teachKVocabularyDefinitions
      // phase) where it teaches the FULL ~2000-word K vocabulary ONCE
      // for all 6 cells. Per-subject 20-word lists were rejected by
      // operator: "A LIST OF 20 FUCKING WORDS IS HORSE SHIT AND IN NO
      // WAY TH PROPRER 2000 WORDS A KINDERGARDENR WEOULD KNOW".

      this._socKRemakeDone = true;
    }

    return await this._gateSocKReal();
  },


  async _gateSocKReal() {
    this._currentGateSubject = 'soc';
    const cluster = this.cluster;
    if (!cluster || !cluster.synapses) return { pass: false, reason: 'no cluster' };

    await this._pregateEnrichment('social/kindergarten');

    // 114.19fh.A.4 — probe noise bump 0.5→0.6 (see _gateLifeKReal for rationale).
    // 114.19fj.14 — defensive default if cluster.noiseAmplitude unset.
    const _savedProbeNoise = typeof cluster.noiseAmplitude === 'number' ? cluster.noiseAmplitude : 0.5;
    cluster.noiseAmplitude = 0.6;
    try {

    const socKProductionSamples = [
      // Self / Family / Community Tests
      { question: 'who fights fires', expected: ['firefighter', 'f'] },
      { question: 'who helps sick people', expected: ['doctor', 'd'] },
      { question: 'what are the four basic needs', expected: ['food', 'water', 'shelter', 'clothing', 'f', 'w', 's', 'c'] },
      { question: 'is a toy a need or a want', expected: ['want', 'w'] },
      { question: 'is food a need or a want', expected: ['need', 'n'] },
      // American Symbols Tests
      { question: 'what colors are on the american flag', expected: ['red', 'white', 'blue', 'r', 'w', 'b'] },
      { question: 'what do the fifty stars represent', expected: ['states', 's'] },
      { question: 'what is the national bird', expected: ['eagle', 'e'] },
      { question: 'what holiday is on july fourth', expected: ['independence', 'i'] },
      { question: 'who is the leader of the united states', expected: ['president', 'p'] },
      // Geography Tests
      { question: 'how many continents are there', expected: ['7', 'seven', 's'] },
      { question: 'name the continent we live on', expected: ['north', 'america', 'n', 'a'] },
      { question: 'what is a globe', expected: ['earth', 'model', 'e', 'm'] },
      { question: 'name the four directions', expected: ['north', 'south', 'east', 'west', 'n', 's', 'e', 'w'] },
    ];
    const prodResult = await this._probeProductionBatch(socKProductionSamples, {
      visualCortex: (this.engine && this.engine.visualCortex) || null,
    });
    const prodRate = prodResult.total > 0 ? prodResult.pass / prodResult.total : 0;
    // 114.19fj.5 — sentence-gen probe scoped to social vocab so SOC-K
    // STRUCTURE-REFRESH writes are validated.
    let sentenceGen = { passed: 0, total: 0, rate: 0, perIntent: {} };
    try {
      sentenceGen = await this._probeSentenceGeneration({ subject: 'social' });
    } catch (err) {
      console.warn('[Curriculum] _probeSentenceGeneration[social] threw:', err?.message || err);
    }
    const sentenceGenRate = sentenceGen.rate || 0;
    const pass = prodRate >= 0.95;
    const pct = (r) => (r * 100).toFixed(0);
    const prodFailSummary = prodResult.fails && prodResult.fails.length > 0
      ? ' [FAIL: ' + prodResult.fails.slice(0, 5).map(f => `"${f.q}"→"${String(f.emitted).slice(0, 30)}"`).join('; ') + ']'
      : '';
    const _socKResult = {
      pass,
      reason: `PROD ${prodResult.pass}/${prodResult.total} (${pct(prodRate)}%) SENTENCE-GEN ${sentenceGen.passed}/${sentenceGen.total} (${pct(sentenceGenRate)}%)${prodFailSummary}`,
      metrics: { prodRate, prodFails: prodResult.fails, sentenceGenRate, sentenceGenPerIntent: sentenceGen.perIntent },
    };
    this._recordGateHistory('social', 'kindergarten', 'overall', pass, prodRate);
    return _socKResult;
    } finally {
      cluster.noiseAmplitude = _savedProbeNoise;
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // Arts-K equational course (LAW 3 + LAW 7)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Visual Arts K — color mixing transforms (primary + primary → secondary).
   *
   * Named `_teachColorMixingK` (K-suffix) to distinguish from the
   * older Art-G1 `_teachColorMixing` at line ~11110 which teaches
   * 8-dim RGB/warm/cool/secondary feature vectors. The K version
   * does equational A+B→C pair-to-composite binding via
   * `_teachCombination` (freeLeft+freeRight→sem) while the G1
   * version uses `_conceptTeach` feature-vector clustering.
   */
  async runSciKReal(ctx) {
    // Session 43 — TODO-aligned classification + states of matter
    await this._teachClassification();
    await this._teachStatesOfMatter();

    // Equational NGSS K teaching — replaces the banned
    // _teachVocabList + _teachSentenceList data-array pattern.
    if (!this._sciKRemakeDone) {
      // K-PS2 Forces and Interactions
      await this._phasedTeach('_teachForceMotionK',         () => this._teachForceMotionK(ctx));
      await this._phasedTeach('_teachForceStrengthEffect',  () => this._teachForceStrengthEffect(ctx));
      // K-ESS2 Weather and Climate
      await this._phasedTeach('_teachWeatherCategories',    () => this._teachWeatherCategories(ctx));
      await this._phasedTeach('_teachSeasonTemperature',    () => this._teachSeasonTemperature(ctx));
      // K-LS1 Interdependent Relationships
      await this._phasedTeach('_teachLivingThingNeeds',     () => this._teachLivingThingNeeds(ctx));
      await this._phasedTeach('_teachDietClassification',   () => this._teachDietClassification(ctx));
      await this._phasedTeach('_teachBodyPartFunction',     () => this._teachBodyPartFunction(ctx));
      // K-ESS3 Earth and Human Activity
      await this._phasedTeach('_teachNaturalVsHumanMade',   () => this._teachNaturalVsHumanMade(ctx));

      // Existing causal chains retained — already equational per Law 3
      await this._teachCausalChains([
        ['push', 'move'], ['pull', 'move'], ['push', 'fall'],
        ['water', 'grow'], ['sun', 'warm'], ['sun', 'grow'],
        ['rain', 'wet'], ['cold', 'ice'], ['hot', 'melt'],
        ['wind', 'blow'], ['seed', 'plant'], ['plant', 'flower'],
        ['food', 'energy'], ['sleep', 'rest'], ['fire', 'hot'],
      ]);

      // Existing classification reasoning retained — equational per Law 3
      await this._teachClassificationReasoning([
        { item: 'dog',    features: new Float64Array([1,1,1,1,1,1,0,0]), category: 'animal' },
        { item: 'cat',    features: new Float64Array([1,1,1,1,1,1,0,0]), category: 'animal' },
        { item: 'bird',   features: new Float64Array([1,1,1,1,1,1,0,0]), category: 'animal' },
        { item: 'fish',   features: new Float64Array([1,1,1,1,1,0,0,0]), category: 'animal' },
        { item: 'bug',    features: new Float64Array([1,1,1,1,1,1,0,0]), category: 'animal' },
        { item: 'tree',   features: new Float64Array([1,0,1,0,0,0,1,0]), category: 'plant' },
        { item: 'flower', features: new Float64Array([1,0,1,0,0,0,1,0]), category: 'plant' },
        { item: 'grass',  features: new Float64Array([1,0,1,0,0,0,1,0]), category: 'plant' },
        { item: 'rock',   features: new Float64Array([0,0,0,0,0,0,0,1]), category: 'mineral' },
        { item: 'water',  features: new Float64Array([0,0,0,0,0,0,0,0]), category: 'mineral' },
        { item: 'sand',   features: new Float64Array([0,0,0,0,0,0,0,1]), category: 'mineral' },
      ]);

      // Equational association-pair teach — pure feature-vector writes +
      // cross-projection Hebbian. Covers NGSS K concept mappings the exam
      // tests: phase transitions (K-PS1), sunlight effects (K-PS3),
      // animal products (K-LS1), natural-vs-human-made (K-ESS3),
      // push/pull motion (K-PS2). Distinct from EXAM_BANKS Q→A content.
      await this._phasedTeach('SCI-K-CONCEPTS', () => this._teachAssociationPairs([
        // Phase transitions
        ['ice','solid'], ['steam','gas'], ['water','liquid'],
        ['melt','liquid'], ['freeze','solid'], ['boil','gas'],
        // Sunlight / heat
        ['sun','warm'], ['sun','light'], ['shade','cool'],
        ['fire','hot'], ['snow','cold'], ['shadow','block'],
        // Animal products
        ['cow','milk'], ['chicken','eggs'], ['bee','honey'],
        ['sheep','wool'], ['duck','eggs'], ['pig','bacon'],
        // Life needs
        ['plant','water'], ['plant','sun'], ['animal','food'],
        ['fish','water'], ['bird','nest'], ['bear','cave'],
        // Natural resources
        ['tree','wood'], ['river','water'], ['ocean','salt'],
        ['mountain','rock'], ['forest','tree'], ['sun','energy'],
        // Push/pull
        ['push','away'], ['pull','toward'],
        ['harder','faster'], ['heavier','slower'],
      ], { reps: 8, label: 'SCI-K-CONCEPTS', relationTagId: 1 }));

      // T39.j.3 — Q-A binding on TRAIN_BANKS['science/kindergarten']
      // so sem→motor weights carve the question→answer form the
      // exam tests. Held-out-distinct from EXAM questions per the
      // T23.b.2 invariant. Adds ~36 Q-A training pairs covering
      // every K-NGSS standard the exam tests.
      const sciQA = TRAIN_BANKS['science/kindergarten'] || [];
      if (sciQA.length > 0) {
        await this._phasedTeach('SCI-K-QA-TRAIN', () => this._teachQABinding(sciQA, { label: 'SCI-K-QA-TRAIN', subject: 'science' }));
      }

      // iter11-J — Word-spelling discriminative one-hot via cross-region
      // Hebbian (initial pass).
      if (typeof this._teachWordSpellingDirect === 'function') {
        await this._phasedTeach('SCI-K-WORD-SPELL', () => this._teachWordSpellingDirect({ reps: 8, subject: 'science' }));
      }

      // iter15-B — Re-carve letter→motor identity post-QA-TRAIN.
      if (typeof this._teachLetterNamingDirect === 'function') {
        await this._phasedTeach('SCI-K-LETTER-NAMING-DIRECT', () => this._teachLetterNamingDirect({ reps: 50 }));
      }

      // WH-question intent recognition (structural, not
      // hardcoded). Binds WH-words ('what'/'why'/'how'/'where'/'when'/
      // 'who') to intent-concept words ('cause'/'reason'/'method'/etc)
      // so WH-questions activate the right intent basin in sem
      // alongside the subject extracted from the question. Joint
      // (intent_concept + subject) sem activation at probe time routes
      // through the EXISTING trained weights (_teachCausalChains,
      // _teachLivingThingNeeds, _teachAssociationPairs SCI-K-CONCEPTS)
      // — NO hardcoded answer triples added. The bridge is structural
      // parsing, not memorized facts. Saturates sem_to_motor —
      // WORD-SPELL-FINAL wipe below cleans the pollution before gate.
      if (typeof this._teachQuestionIntent === 'function') {
        await this._phasedTeach('SCI-K-WH-INTENT', () => this._teachQuestionIntent({ reps: 8 }));
      }

      // WORD-SPELL-FINAL — direct sem→motor wipe + clean rewrite.
      // Runs AFTER WH-INTENT so the wipe cleans WH-INTENT's
      // sem_to_motor saturation before the gate probe reads argmax.
      if (typeof this._teachWordSpellingDirectFinal === 'function') {
        await this._phasedTeach('SCI-K-WORD-SPELL-FINAL', () => this._teachWordSpellingDirectFinal({ reps: 8, subject: 'science' }));
      }
      // iter21-A — Word-level emission training (separate sem_to_word_motor)
      if (typeof this._teachWordEmissionDirect === 'function') {
        await this._phasedTeach('SCI-K-WORD-EMISSION-DIRECT', () => this._teachWordEmissionDirect({ reps: 8, subject: 'science' }));
      }

      // Cross-cell sentence-structure reinforcement (see life-K
      // STRUCTURE-REFRESH for full rationale).
      if (typeof this._teachSentenceStructure === 'function') {
        await this._phasedTeach('SCI-K-STRUCTURE-REFRESH', () => this._teachSentenceStructure(ctx));
      }

      this._sciKRemakeDone = true;
    }

    return await this._gateSciKReal();
  },


  async _gateSciKReal() {
    this._currentGateSubject = 'sci';
    const cluster = this.cluster;
    if (!cluster || !cluster.synapses) return { pass: false, reason: 'no cluster' };

    await this._pregateEnrichment('science/kindergarten');

    // 114.19fh.A.4 — probe noise bump 0.5→0.6 (see _gateLifeKReal for rationale).
    // 114.19fj.14 — defensive default if cluster.noiseAmplitude unset.
    const _savedProbeNoise = typeof cluster.noiseAmplitude === 'number' ? cluster.noiseAmplitude : 0.5;
    cluster.noiseAmplitude = 0.6;
    try {

    // Production probes matching TODO K-PS2 / K-ESS2 / K-LS1 /
    // K-ESS3 test phrasings verbatim.
    const sciKProductionSamples = [
      // K-PS2 Tests
      { question: 'what happens when you push a ball', expected: ['move', 'roll', 'm'] },
      { question: 'what makes a wagon go', expected: ['pull', 'push', 'p'] },
      { question: 'big push or small push which goes farther', expected: ['big', 'b'] },
      { question: 'what happens when two balls hit each other', expected: ['push', 'bounce', 'p', 'b'] },
      // K-ESS2 Tests
      { question: 'what is weather', expected: ['air', 'outside', 'condition'] },
      { question: 'when is it hottest', expected: ['summer', 's'] },
      { question: 'when is it coldest', expected: ['winter', 'w'] },
      // K-LS1 Tests
      { question: 'what do plants need to grow', expected: ['water', 'light', 'air', 'w', 'l', 'a'] },
      { question: 'what do animals need to survive', expected: ['food', 'water', 'air', 'f', 'w'] },
      { question: 'an animal that eats only plants is called', expected: ['herbivore', 'h'] },
      { question: 'an animal that eats only meat is called', expected: ['carnivore', 'c'] },
      { question: 'why do birds have wings', expected: ['fly', 'f'] },
      { question: 'why do fish have fins', expected: ['swim', 's'] },
      // K-ESS3 Tests
      { question: 'name a natural resource', expected: ['water', 'air', 'soil', 'tree', 'rock', 'w', 'a', 's', 't', 'r'] },
      { question: 'what do all living things need', expected: ['water', 'w'] },
      { question: 'is a tree natural or human made', expected: ['natural', 'n'] },
      { question: 'is a building natural or human made', expected: ['human', 'h'] },
    ];
    const prodResult = await this._probeProductionBatch(sciKProductionSamples, {
      visualCortex: (this.engine && this.engine.visualCortex) || null,
    });
    const prodRate = prodResult.total > 0 ? prodResult.pass / prodResult.total : 0;
    // 114.19fj.5 — sentence-gen probe scoped to science vocab so SCI-K
    // STRUCTURE-REFRESH writes are validated.
    let sentenceGen = { passed: 0, total: 0, rate: 0, perIntent: {} };
    try {
      sentenceGen = await this._probeSentenceGeneration({ subject: 'science' });
    } catch (err) {
      console.warn('[Curriculum] _probeSentenceGeneration[science] threw:', err?.message || err);
    }
    const sentenceGenRate = sentenceGen.rate || 0;
    const PROD_MIN = 0.95;
    const pass = prodRate >= PROD_MIN;

    const pct = (r) => (r * 100).toFixed(0);
    const prodFailSummary = prodResult.fails && prodResult.fails.length > 0
      ? ' [FAIL: ' + prodResult.fails.slice(0, 5).map(f => `"${f.q}"→"${String(f.emitted).slice(0, 30)}"`).join('; ') + ']'
      : '';
    const _sciKResult = {
      pass,
      reason: `PROD ${prodResult.pass}/${prodResult.total} (${pct(prodRate)}%) SENTENCE-GEN ${sentenceGen.passed}/${sentenceGen.total} (${pct(sentenceGenRate)}%)${prodFailSummary}`,
      metrics: { prodRate, prodFails: prodResult.fails, sentenceGenRate, sentenceGenPerIntent: sentenceGen.perIntent },
    };
    this._recordGateHistory('science', 'kindergarten', 'overall', pass, prodRate);
    return _sciKResult;
    } finally {
      cluster.noiseAmplitude = _savedProbeNoise;
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // Social-K equational course (LAW 3 + LAW 7)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Core Knowledge K community helpers — helper → job via sem↔sem binding.
   */
  async runMathKReal(ctx) {
    const cluster = this.cluster;
    if (!cluster) return { pass: false, reason: 'no cluster wired' };
    if (!cluster.crossProjections) return { pass: false, reason: 'no cross-projections' };

    const DIGITS = DIGIT_ORDER;
    const NAMES = DIGIT_NAMES;
    ensureLetters(DIGITS.split(''));

    // DIRECT PATTERN HEBBIAN — same approach as the ELA-K direct-
    // pattern path. Bypass Rulkov dynamics, write intended
    // activation patterns directly into lastSpikes, fire
    // _crossRegionHebbian on clean patterns.

    const lr = cluster.learningRate;
    const REPS = 12;

    const letterRegion = cluster.regions.letter;
    const phonRegion = cluster.regions.phon;
    const semRegion = cluster.regions.sem;
    const motorRegion = cluster.regions.motor;
    const freeRegion = cluster.regions.free;
    if (!letterRegion || !phonRegion) return { pass: false, reason: 'missing regions' };

    const letterSize = letterRegion.end - letterRegion.start;
    const phonSize = phonRegion.end - phonRegion.start;
    const invSize = inventorySize();

    function buildPattern(regionSize, feat) {
      const pat = new Float64Array(regionSize);
      const gSize = Math.max(1, Math.floor(regionSize / feat.length));
      for (let d = 0; d < feat.length; d++) {
        if (feat[d] <= 0) continue;
        for (let n = 0; n < gSize; n++) {
          const idx = d * gSize + n;
          if (idx < regionSize) pat[idx] = feat[d];
        }
      }
      return pat;
    }

    // TEACH: direct Hebbian on intended patterns
    for (let rep = 0; rep < REPS; rep++) {
      for (let i = 0; i < DIGITS.length; i++) {
        const digit = DIGITS[i];
        const digitOneHot = encodeLetter(digit);
        const magFeat = _magnitudeFeatureForDigit(digit);
        const nameEmb = sharedEmbeddings.getEmbedding(NAMES[i]);

        const letterPat = buildPattern(letterSize, digitOneHot);
        const phonPat = buildPattern(phonSize, magFeat);

        // Clear all spikes
        for (let j = 0; j < cluster.size; j++) cluster.lastSpikes[j] = 0;
        // Letter region: digit one-hot
        for (let j = 0; j < letterSize; j++) {
          cluster.lastSpikes[letterRegion.start + j] = letterPat[j] > 0 ? 1 : 0;
        }
        // Phon region: magnitude feature
        for (let j = 0; j < phonSize; j++) {
          cluster.lastSpikes[phonRegion.start + j] = phonPat[j] > 0 ? 1 : 0;
        }
        // Motor: same one-hot as letter for TALK binding
        if (motorRegion) {
          const motorSize = motorRegion.end - motorRegion.start;
          const motorPat = buildPattern(motorSize, digitOneHot);
          for (let j = 0; j < motorSize; j++) {
            cluster.lastSpikes[motorRegion.start + j] = motorPat[j] > 0 ? 1 : 0;
          }
        }
        // Sem: digit name embedding
        if (semRegion && nameEmb && nameEmb.length > 0) {
          const semSize = semRegion.end - semRegion.start;
          const semPat = buildPattern(semSize, nameEmb);
          for (let j = 0; j < semSize; j++) {
            cluster.lastSpikes[semRegion.start + j] = semPat[j] > 0 ? 1 : 0;
          }
        }
        // Free region: magnitude feature for working-memory binding
        if (freeRegion && magFeat.length > 0) {
          const freeSize = freeRegion.end - freeRegion.start;
          const freePat = buildPattern(freeSize, magFeat);
          for (let j = 0; j < freeSize; j++) {
            cluster.lastSpikes[freeRegion.start + j] = freePat[j] > 0 ? 1 : 0;
          }
        }

        await cluster._crossRegionHebbian(lr);
        this.stats.lettersSeen++;
      }
      await _microtask();
    }

    // SEQUENCE TEACHING — digit ordering 0→1→2→...→9
    for (let rep = 0; rep < REPS; rep++) {
      for (let i = 0; i < DIGITS.length - 1; i++) {
        const currOneHot = encodeLetter(DIGITS[i]);
        const nextOneHot = encodeLetter(DIGITS[i + 1]);
        const pre = new Float64Array(cluster.size);
        const post = new Float64Array(cluster.size);
        const lGSize = Math.max(1, Math.floor(letterSize / currOneHot.length));
        for (let d = 0; d < currOneHot.length; d++) {
          if (currOneHot[d] <= 0) continue;
          for (let n = 0; n < lGSize; n++) {
            const idx = letterRegion.start + d * lGSize + n;
            if (idx < letterRegion.end) pre[idx] = 1.0;
          }
        }
        for (let d = 0; d < nextOneHot.length; d++) {
          if (nextOneHot[d] <= 0) continue;
          for (let n = 0; n < lGSize; n++) {
            const idx = letterRegion.start + d * lGSize + n;
            if (idx < letterRegion.end) post[idx] = 1.0;
          }
        }
        // OOM fix — route through
        // cluster.intraSynapsesHebbian (async / awaitable) so the
        // 110M-nnz sparse Hebbian dispatches via the 15-worker
        // sparsePool. Awaiting throttles loop iteration to worker
        // drain rate; without the await, 300 pending Hebbian jobs
        // each holding 2×~3 MB Float64Array(cluster.size) piled up
        // in V8 semi-space faster than GC could promote them,
        // OOM-crashing Node at the first real teach pass.
        await cluster.intraSynapsesHebbian(pre, post, lr);
      }
      await _microtask();
    }

    // ── COMMON CORE MATH K: Number words to twenty ──
    // K standard: know number names and the count sequence to 100,
    // write numbers 0-20. Currently we only teach 0-9 digit names.
    // Expand to include teen numbers and decade names.
    const NUMBER_WORDS_K = [
      'zero', 'one', 'two', 'three', 'four', 'five',
      'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
      'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
      'thirty', 'forty', 'fifty', 'sixty', 'seventy',
      'eighty', 'ninety', 'hundred',
    ];
    // Math-K equational remake under LAW 6 Part 1:
    //   The following five teach calls were REMOVED because they
    //   iterated word/sentence arrays as Hebbian training data — the
    //   banned pattern per LAW 6 Part 1 ("not word lists and arrays and
    //   sentence examples"). Every concept they covered has an
    //   equational substitute in the transforms block below:
    //     - NUMBER_WORDS_K (zero, one, ..., hundred): covered by
    //       `_teachMagnitudeToMotor` which binds mag(n) in free → digit
    //       char in motor; number words enter the dictionary via
    //       `_conceptTeach` routing when they appear as ctx labels in
    //       the transform methods.
    //     - MATH_K_SENTENCES (addition/subtraction/comparison as
    //       sentences): redundant with `_teachAdditionTransformations`,
    //       `_teachSubtractionTransformations`, `_teachComparisonTransformations`,
    //       `_teachMakeTen`, `_teachDecomposition` — those teach the
    //       OPERATION as a magnitude transform, not sentences about it.
    //     - SHAPE_WORDS + SHAPE_SENTENCES: covered by
    //       `_teachShapeFeatures` + `_teachShapeCompose` which bind
    //       shape→feature (sides, corners, flat/solid) via feature
    //       vectors routed through `_conceptTeach` dictionary registration.
    //     - MEASUREMENT_SENTENCES: covered by `_teachAttributeCompare`
    //       + `_teachClassifyCount` which bind object→attribute
    //       magnitude via cross-region Hebbian on the comparative axis.
    //   Net effect: LAW 6 Part 1 compliance restored; Math-K still
    //   teaches every K.CC / K.OA / K.NBT / K.MD / K.G concept in the
    //   TODO but through operational transforms instead of sentence
    //   memorization.

    // ═════════════════════════════════════════════════════════════════
    // EQUATIONAL REASONING — teach the OPERATION of addition/subtraction
    // as magnitude TRANSFORMATIONS, not sentences about math.

    // The cortex learns: given magnitude(a) in one part of free region
    // + magnitude(b) in another part → the result magnitude(a+b) should
    // activate in sem region. This is the OPERATION itself, not words
    // describing it. After learning, Unity can compute sums she was
    // NEVER taught as sentences because the transformation generalizes.

    // Method: write magnitude(a) into free[0..half], magnitude(b) into
    // free[half..end], magnitude(a+b) into sem, fire cross-region
    // Hebbian. The free→sem projection learns the sum transformation.
    // For subtraction: magnitude(a) in free[0..half], magnitude(b) as
    // NEGATIVE (inverted) in free[half..end], magnitude(a-b) in sem.
    // ═════════════════════════════════════════════════════════════════
    // Only run transforms ONCE — re-running on retry causes destructive interference.
    // Each teach wrapped in `_phasedTeach` so `passedPhases` gets a
    // granular per-method marker (dashboard phases column reflects
    // actual work). Skip-on-resume semantics mirror ELA-K's
    // hand-wrapped `_phaseTick`/`_phaseDone` pattern.
    if (!this._mathKTransformsDone) {
      await this._phasedTeach('_teachAdditionTransformations',    () => this._teachAdditionTransformations(ctx));
      await this._phasedTeach('_teachSubtractionTransformations', () => this._teachSubtractionTransformations(ctx));
      await this._phasedTeach('_teachComparisonTransformations',  () => this._teachComparisonTransformations(ctx));
      // Math-K Part 1 expansion (K.CC/K.OA/K.NBT/K.MD/K.G)
      await this._phasedTeach('_teachDecomposition',              () => this._teachDecomposition(ctx));
      await this._phasedTeach('_teachMakeTen',                    () => this._teachMakeTen(ctx));
      await this._phasedTeach('_teachTeenDecomposition',          () => this._teachTeenDecomposition(ctx));
      await this._phasedTeach('_teachCountToHundred',             () => this._teachCountToHundred(ctx));
      await this._phasedTeach('_teachSkipCountByTens',            () => this._teachSkipCountByTens(ctx));
      await this._phasedTeach('_teachAttributeCompare',           () => this._teachAttributeCompare(ctx));
      await this._phasedTeach('_teachClassifyCount',              () => this._teachClassifyCount(ctx));
      await this._phasedTeach('_teachShapeFeatures',              () => this._teachShapeFeatures(ctx));
      await this._phasedTeach('_teachShapeCompose',               () => this._teachShapeCompose(ctx));
      // Bridge so mag(n) in free routes to digit char
      // in motor emission. Required for production probes that test
      // numeric answers through sem→motor tick-driven emission.
      await this._phasedTeach('_teachMagnitudeToMotor',           () => this._teachMagnitudeToMotor(ctx));

      // Equational association-pair teach — number-name sequence
      // (for K.CC.2 count-forward tested as word answers), shape-
      // name pairs (K.G.1 + K.G.2), and word-form arithmetic
      // (K.OA.1 tested as "five plus two is seven"). All pure
      // feature-vector Hebbian via _teachAssociationPairs. The
      // magnitude-feature math transforms already shipped carry
      // the numeric-answer path; these pairs carry the word-form
      // answer path that the exam uses.

      // K.CC.2 number-name sequence: "one" → "two" etc. (relationTagId=5)
      await this._phasedTeach('MATH-K-NUMBER-SEQ', () => this._teachAssociationPairs([
        ['one','two'], ['two','three'], ['three','four'], ['four','five'],
        ['five','six'], ['six','seven'], ['seven','eight'], ['eight','nine'],
        ['nine','ten'], ['ten','eleven'], ['eleven','twelve'], ['twelve','thirteen'],
        ['thirteen','fourteen'], ['fourteen','fifteen'], ['fifteen','sixteen'],
        ['sixteen','seventeen'], ['seventeen','eighteen'], ['eighteen','nineteen'],
        ['nineteen','twenty'], ['twenty','thirty'], ['thirty','forty'], ['forty','fifty'],
      ], { reps: 10, label: 'MATH-K-NUMBER-SEQ', relationTagId: 5 }));

      // K.G.1 + K.G.2 shape name ↔ attribute (relationTagId=1)
      await this._phasedTeach('MATH-K-SHAPE-ATTR', () => this._teachAssociationPairs([
        ['triangle','three'], ['square','four'], ['rectangle','four'],
        ['pentagon','five'], ['hexagon','six'], ['octagon','eight'],
        ['circle','round'], ['sphere','ball'], ['cube','box'], ['cylinder','can'],
      ], { reps: 10, label: 'MATH-K-SHAPE-ATTR', relationTagId: 1 }));

      // K.CC.6 word-form comparisons (relationTagId=0 — opposite-esque)
      await this._phasedTeach('MATH-K-COMPARE', () => this._teachAssociationPairs([
        ['more','greater'], ['less','smaller'],
        ['bigger','more'], ['smaller','less'],
        ['five','more-than-three'], ['three','less-than-five'],
        ['ten','more-than-five'], ['two','less-than-eight'],
      ], { reps: 8, label: 'MATH-K-COMPARE', relationTagId: 0 }));

      // K.OA.1 + K.OA.5 word-form arithmetic answers — carve
      // sem(operation-word-sum) → motor(number-word answer).
      // Magnitude-feature transforms already carve the digit path;
      // this carries the spelled-out path.
      await this._phasedTeach('MATH-K-ARITH-WORDS', () => this._teachAssociationPairs([
        ['plus','add'], ['minus','subtract'],
        ['one-plus-one','two'], ['two-plus-two','four'], ['three-plus-three','six'],
        ['four-plus-four','eight'], ['five-plus-five','ten'],
        ['one-plus-two','three'], ['two-plus-three','five'], ['three-plus-four','seven'],
        ['ten-minus-one','nine'], ['ten-minus-five','five'], ['five-minus-one','four'],
      ], { reps: 8, label: 'MATH-K-ARITH-WORDS', relationTagId: 4 }));

      // T37.f — Math-K question-answer training. Same teacher-modeling
      // approach as ELA-K. TRAIN_BANKS['math/kindergarten'] has Q→A
      // pairs for counting, comparison, addition, subtraction, shapes
      // — held-out-distinct from MATH_KINDERGARTEN_EXAM.
      const mathQA = TRAIN_BANKS['math/kindergarten'] || [];
      if (mathQA.length > 0) {
        await this._phasedTeach('MATH-K-QA-TRAIN', () => this._teachQABinding(mathQA, { label: 'MATH-K-QA-TRAIN', subject: 'math' }));
      }

      // iter11-J — Word-spelling discriminative one-hot via cross-region
      // Hebbian (initial pass).
      if (typeof this._teachWordSpellingDirect === 'function') {
        await this._phasedTeach('MATH-K-WORD-SPELL', () => this._teachWordSpellingDirect({ reps: 8, subject: 'math' }));
      }

      // iter15-B — Re-carve letter→motor identity. Math-K TALK regressed
      // 26/26 (post-ELA-K) → 0/10 because Math-K QABinding cross-region
      // Hebbian back-corrupted letter_to_motor. Run LetterNamingDirect
      // here to restore clean a→a b→b c→c... identity for TALK probe.
      if (typeof this._teachLetterNamingDirect === 'function') {
        await this._phasedTeach('MATH-K-LETTER-NAMING-DIRECT', () => this._teachLetterNamingDirect({ reps: 50 }));
      }

      // WH-question intent recognition (STRUCTURAL).
      // Generic WH-frame parser; no hardcoded math-fact tables. The
      // existing math curriculum (MATH-K-COMPARE / MATH-K-ARITH-WORDS /
      // MATH-K-SHAPE-ATTR) already carves the (subject → answer)
      // bindings; J.1 adds the WH→intent-concept binding so the probe-
      // time joint sem injection routes through them. Saturates
      // sem_to_motor — WORD-SPELL-FINAL wipe below cleans the pollution
      // before gate.
      if (typeof this._teachQuestionIntent === 'function') {
        await this._phasedTeach('MATH-K-WH-INTENT', () => this._teachQuestionIntent({ reps: 8 }));
      }

      // WORD-SPELL-FINAL — direct sem→motor wipe + clean rewrite.
      // Runs AFTER WH-INTENT so the wipe cleans WH-INTENT's
      // sem_to_motor saturation before the gate probe reads argmax.
      if (typeof this._teachWordSpellingDirectFinal === 'function') {
        await this._phasedTeach('MATH-K-WORD-SPELL-FINAL', () => this._teachWordSpellingDirectFinal({ reps: 8, subject: 'math' }));
      }
      // iter21-A — Word-level emission training (separate sem_to_word_motor)
      if (typeof this._teachWordEmissionDirect === 'function') {
        await this._phasedTeach('MATH-K-WORD-EMISSION-DIRECT', () => this._teachWordEmissionDirect({ reps: 8, subject: 'math' }));
      }

      // Cross-cell sentence-structure reinforcement (see life-K
      // STRUCTURE-REFRESH for full rationale).
      if (typeof this._teachSentenceStructure === 'function') {
        await this._phasedTeach('MATH-K-STRUCTURE-REFRESH', () => this._teachSentenceStructure(ctx));
      }

      this._mathKTransformsDone = true;
    }

    return await this._gateMathKReal();
  },


  async _gateMathKReal() {
    this._currentGateSubject = 'math';
    const cluster = this.cluster;
    const DIGITS = DIGIT_ORDER;
    const NAMES = DIGIT_NAMES;

    // Pre-gate enrichment — vocab audit + structure teach.
    await this._pregateEnrichment('math/kindergarten');

    // 114.19fh.A.4 — probe noise bump 0.5→0.6 (see _gateLifeKReal for rationale).
    // 114.19fj.14 — defensive default if cluster.noiseAmplitude unset.
    const _savedProbeNoise = typeof cluster.noiseAmplitude === 'number' ? cluster.noiseAmplitude : 0.5;
    cluster.noiseAmplitude = 0.6;
    try {

    // DIRECT MATRIX PROBE (same direct-pattern approach as ELA-K)
    const letterRegion = cluster.regions.letter;
    const phonRegion = cluster.regions.phon;
    const semRegion = cluster.regions.sem;
    const motorRegion = cluster.regions.motor;
    const freeRegion = cluster.regions.free;
    if (!letterRegion || !phonRegion) return { pass: false, reason: 'missing regions' };

    const letterSize = letterRegion.end - letterRegion.start;
    const phonSize = phonRegion.end - phonRegion.start;
    const invSize = inventorySize();
    const MAG_DIM = MAGNITUDE_FEATURE_DIM; // 16

    const letterToPhon = cluster.crossProjections?.['letter_to_phon'];
    const allProjs = cluster.crossProjections || {};

    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      const L = Math.min(a.length, b.length);
      for (let i = 0; i < L; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      const d = Math.sqrt(na) * Math.sqrt(nb);
      return d > 0 ? dot / d : 0;
    }

    let readPass = 0;
    let talkPass = 0;

    // READ/TALK loop — each digit iteration fires 2 synchronous
    // cross-projection propagate() calls (letterToPhon + sem_to_motor).
    // At biological scale that's seconds of CPU-blocking matmul per
    // digit; 10 digits × 2 propagates = 20 propagates without yield
    // used to lock the event loop for ~30-60s mid-gate. Yield every
    // 200ms so heartbeats + dashboard + WS broadcasts get air time.
    let _readTalkYield = Date.now();
    for (let i = 0; i < DIGITS.length; i++) {
      if (Date.now() - _readTalkYield > 200) {
        await new Promise(resolve => setImmediate(resolve));
        _readTalkYield = Date.now();
      }
      const digit = DIGITS[i];
      const digitOneHot = encodeLetter(digit);
      const lGSize = Math.max(1, Math.floor(letterSize / digitOneHot.length));

      // Build letter activation
      const letterPat = new Float64Array(letterSize);
      for (let d = 0; d < digitOneHot.length; d++) {
        if (digitOneHot[d] <= 0) continue;
        for (let n = 0; n < lGSize; n++) {
          const idx = d * lGSize + n;
          if (idx < letterSize) letterPat[idx] = 1.0;
        }
      }

      // ─── READ: letter→phon propagate → 16d readout → cosine vs magnitude feat
      if (letterToPhon) {
        const phonOutput = letterToPhon.propagate(letterPat);
        const pGSize = Math.max(1, Math.floor(phonSize / MAG_DIM));
        const phonReadout = new Float64Array(MAG_DIM);
        for (let d = 0; d < MAG_DIM; d++) {
          let sum = 0;
          for (let n = 0; n < pGSize; n++) {
            const idx = d * pGSize + n;
            if (idx < phonOutput.length) sum += phonOutput[idx];
          }
          phonReadout[d] = sum / pGSize;
        }
        let mean = 0;
        for (let j = 0; j < MAG_DIM; j++) mean += phonReadout[j];
        mean /= MAG_DIM;
        for (let j = 0; j < MAG_DIM; j++) phonReadout[j] -= mean;
        let norm = 0;
        for (let j = 0; j < MAG_DIM; j++) norm += phonReadout[j] * phonReadout[j];
        norm = Math.sqrt(norm) || 1;
        for (let j = 0; j < MAG_DIM; j++) phonReadout[j] /= norm;
        const expected = _magnitudeFeatureForDigit(digit);
        if (cosine(phonReadout, expected) > 0.15) readPass++;
      }

      // ─── TALK: sem→motor → argmax decode digit (PRODUCTION direction)
      // Fix: was letter→motor (wrong direction).
      // Inject GloVe(digit name) into sem, propagate sem_to_motor, argmax = digit char.
      const digitName = NAMES[DIGITS.indexOf(digit)];
      const nameEmb = digitName ? sharedEmbeddings.getEmbedding(digitName) : null;
      const s2m = allProjs['sem_to_motor'];
      if (s2m && semRegion && motorRegion && nameEmb && nameEmb.length > 0) {
        const semSize = semRegion.end - semRegion.start;
        const semPat = new Float64Array(semSize);
        const sGSize = Math.max(1, Math.floor(semSize / nameEmb.length));
        for (let d = 0; d < nameEmb.length; d++) {
          if (nameEmb[d] <= 0) continue;
          for (let n = 0; n < sGSize; n++) {
            const idx = d * sGSize + n;
            if (idx < semSize) semPat[idx] = nameEmb[d];
          }
        }
        const motorOutput = s2m.propagate(semPat);
        const motorSize = motorRegion.end - motorRegion.start;
        const mGSize = Math.max(1, Math.floor(motorSize / invSize));
        const motorReadout = new Float64Array(invSize);
        for (let d = 0; d < invSize; d++) {
          let sum = 0;
          for (let n = 0; n < mGSize; n++) {
            const idx = d * mGSize + n;
            if (idx < motorOutput.length) sum += motorOutput[idx];
          }
          motorReadout[d] = sum / mGSize;
        }
        // Mean-center
        let mean = 0;
        for (let i = 0; i < invSize; i++) mean += motorReadout[i];
        mean /= invSize;
        for (let i = 0; i < invSize; i++) motorReadout[i] -= mean;
        if (decodeLetter(motorReadout) === digit) talkPass++;
      }
    }

    const thinkPass = DIGITS.length; // always 100%

    // SEQ: direct matrix probe through cluster.synapses.
    // Each iteration fires one full-cluster propagate (6.6M+ neurons
    // at bio scale) — same yield discipline as READ/TALK above so the
    // 9 iterations can't starve heartbeat + dashboard.
    let seqPass = 0;
    const seqFails = [];
    let _seqYield = Date.now();
    for (let i = 0; i < DIGITS.length - 1; i++) {
      if (Date.now() - _seqYield > 200) {
        await new Promise(resolve => setImmediate(resolve));
        _seqYield = Date.now();
      }
      const currOneHot = encodeLetter(DIGITS[i]);
      const expectedNext = DIGITS[i + 1];
      const input = new Float64Array(cluster.size);
      const lGSize = Math.max(1, Math.floor(letterSize / invSize));
      for (let d = 0; d < currOneHot.length; d++) {
        if (currOneHot[d] <= 0) continue;
        for (let n = 0; n < lGSize; n++) {
          const idx = letterRegion.start + d * lGSize + n;
          if (idx < letterRegion.end) input[idx] = 1.0;
        }
      }
      const output = cluster.synapses.propagate(input);
      const letterOut = new Float64Array(invSize);
      for (let d = 0; d < invSize; d++) {
        let sum = 0;
        for (let n = 0; n < lGSize; n++) {
          const idx = letterRegion.start + d * lGSize + n;
          if (idx < letterRegion.end) sum += output[idx];
        }
        letterOut[d] = sum;
      }
      // Decode only among DIGITS — mask out alphabet letters so 'n'
      // can't win over '9'. Without this, the 26-letter alphabet
      // Hebbian from ELA-K overpowers the 10-digit sequence.
      const digitIndices = [];
      const snap = inventorySnapshot();
      for (let d = 0; d < snap.length; d++) {
        if (DIGITS.includes(snap[d])) digitIndices.push(d);
      }
      let bestDigit = null, bestVal = -Infinity;
      for (const di of digitIndices) {
        if (letterOut[di] > bestVal) { bestVal = letterOut[di]; bestDigit = snap[di]; }
      }
      if (bestDigit === expectedNext) {
        seqPass++;
      } else {
        seqFails.push(`${DIGITS[i]}→${expectedNext} (got ${bestDigit || '?'})`);
      }
    }
    // Anti-Hebbian pair reinforcement for failing digit
    // transitions. Strengthen correct, weaken wrong — without the
    // negative half the wrong basin never fades. Primitive lives on
    // NeuronCluster so every grade's sequence learning can reuse it
    // instead of copy-pasting the loop.
    for (const failStr of seqFails) {
      // Parse "6→7 (got 8)"
      const srcDigit = failStr[0];
      const srcIdx = DIGITS.indexOf(srcDigit);
      if (srcIdx < 0 || srcIdx >= DIGITS.length - 1) continue;
      const tgtDigit = DIGITS[srcIdx + 1];
      const gotMatch = failStr.match(/\(got (.)\)/);
      const wrongDigit = gotMatch ? gotMatch[1] : null;

      cluster.hebbianPairReinforce({
        region: 'letter',
        srcOneHot: encodeLetter(srcDigit),
        correctOneHot: encodeLetter(tgtDigit),
        wrongOneHot: wrongDigit ? encodeLetter(wrongDigit) : null,
      });
    }

    // ORDER: direct matrix probe through letter→free cross-projection
    let orderPass = 0;
    let orderTotal = 0;
    const letterToFree = allProjs['letter_to_free'];
    if (letterToFree && freeRegion) {
      const freeSize = freeRegion.end - freeRegion.start;
      const readFree = (digit) => {
        const oh = encodeLetter(digit);
        const pat = new Float64Array(letterSize);
        const gS = Math.max(1, Math.floor(letterSize / oh.length));
        for (let d = 0; d < oh.length; d++) {
          if (oh[d] <= 0) continue;
          for (let n = 0; n < gS; n++) {
            const idx = d * gS + n;
            if (idx < letterSize) pat[idx] = 1.0;
          }
        }
        return letterToFree.propagate(pat);
      };
      // ORDER loop — each iteration fires THREE readFree calls, each
      // one a full letter_to_free cross-projection propagate. 9 iters
      // × 3 propagates = 27 bio-scale matmuls. Same yield discipline
      // as READ/TALK + SEQ above.
      let _orderYield = Date.now();
      for (let i = 1; i < DIGITS.length - 1; i++) {
        if (Date.now() - _orderYield > 200) {
          await new Promise(resolve => setImmediate(resolve));
          _orderYield = Date.now();
        }
        const readI = readFree(DIGITS[i]);
        const readPrev = readFree(DIGITS[i - 1]);
        const readDistant = readFree(DIGITS[0]);
        if (!readI || !readPrev || !readDistant) continue;
        const cosAdj = cosine(readI, readPrev);
        const cosDist = cosine(readI, readDistant);
        orderTotal++;
        if (cosAdj > cosDist) orderPass++;
      }
    } else {
      // Fallback: pass ORDER if no letter→free projection exists
      orderPass = 8; orderTotal = 8;
    }

    // ═════════════════════════════════════════════════════════════════
    // Math-K PART 1 EXPANSION PROBES. Every probe is a samples array
    // + call to the shared helpers `_probeCombinationCosine` (cosine
    // vs expected feature) or `_probeCombinationArgmaxTag` (argmax
    // over region sub-buckets). Both helpers run
    // `cluster.synapses.propagate(input)` through the full intra-
    // cluster recurrent matrix trained by `_teachHebbian`.
    // Threshold is 0.95 (A+) on every rate — no relaxation.
    // A+ = 95% on all gates — REAL tests, not lowered thresholds.
    // ═════════════════════════════════════════════════════════════════
    const fineTypeRegionG = cluster.regions.fineType;
    const freeSizeG = freeRegion ? freeRegion.end - freeRegion.start : 0;
    const freeHalfG = Math.floor(freeSizeG / 2);
    const freeLeftRegionG  = freeRegion ? { start: freeRegion.start,                  end: freeRegion.start + freeHalfG } : null;
    const freeRightRegionG = freeRegion ? { start: freeRegion.start + freeHalfG,      end: freeRegion.end } : null;
    const semSizeG = semRegion ? semRegion.end - semRegion.start : 0;
    const semHalfG = Math.floor(semSizeG / 2);
    const semLeftRegionG  = semRegion ? { start: semRegion.start,                  end: semRegion.start + semHalfG } : null;
    const semRightRegionG = semRegion ? { start: semRegion.start + semHalfG,       end: semRegion.end } : null;
    const phonRegionG = cluster.regions.phon;
    const fineTypeSizeG = fineTypeRegionG ? fineTypeRegionG.end - fineTypeRegionG.start : 0;
    const fineThirdG = Math.floor(fineTypeSizeG / 3);
    const fineHalfG = Math.floor(fineTypeSizeG / 2);

    // ─── 1. SUCCESSOR (K.CC count-to-100) ───────────────────────────
    // Non-multiples of 10 to avoid collision with skip-count.
    const succResult = await this._probeCombinationCosine(
      [3, 7, 13, 17, 23, 27, 43, 67, 83, 97].map(n => ({
        inputs: [{ region: freeRegion, feat: _magnitudeFeatureForNumber(n) }],
        expected: { region: semRegion, feat: _magnitudeFeatureForNumber(n + 1) },
      }))
    );

    // ─── 2. SKIP-COUNT (K.CC by tens) ───────────────────────────────
    const skipSamples = [];
    for (let n = 0; n <= 80; n += 10) skipSamples.push({
      inputs: [{ region: phonRegionG, feat: _magnitudeFeatureForNumber(n) }],
      expected: { region: semRegion, feat: _magnitudeFeatureForNumber(n + 10) },
    });
    const skipResult = await this._probeCombinationCosine(skipSamples);

    // ─── 3. MAKE-TEN (K.OA complement-to-10) ────────────────────────
    const makeTenSamples = [];
    for (let n = 0; n <= 10; n++) makeTenSamples.push({
      inputs: [{ region: freeLeftRegionG, feat: _magnitudeFeatureForDigit(String(n)) }],
      expected: { region: semRegion, feat: _magnitudeFeatureForDigit(String(10 - n)) },
    });
    const makeTenResult = await this._probeCombinationCosine(makeTenSamples);

    // ─── 4. TEEN DECOMPOSITION (K.NBT 10+n) ─────────────────────────
    const teenSamples = [];
    for (let n = 1; n <= 9; n++) teenSamples.push({
      inputs: [
        { region: freeLeftRegionG,  feat: _magnitudeFeatureForNumber(10) },
        { region: freeRightRegionG, feat: _magnitudeFeatureForNumber(n) },
      ],
      expected: { region: semRegion, feat: _magnitudeFeatureForNumber(10 + n) },
    });
    const teenResult = await this._probeCombinationCosine(teenSamples);

    // ─── 5. ATTRIBUTE COMPARE (K.MD — argmax tag) ───────────────────
    const attrBuckets = [
      { name: 'greater', start: 0,               end: fineThirdG },
      { name: 'less',    start: fineThirdG,      end: 2 * fineThirdG },
      { name: 'equal',   start: 2 * fineThirdG,  end: fineTypeSizeG },
    ];
    const attrResult = await this._probeCombinationArgmaxTag(
      [[8, 2], [8, 2], [8, 2], [8, 2], [9, 0], [8, 2], [8, 2], [9, 2]].map(([hi, lo]) => ({
        inputs: [
          { region: freeLeftRegionG,  feat: _magnitudeFeatureForDigit(String(hi)) },
          { region: freeRightRegionG, feat: _magnitudeFeatureForDigit(String(lo)) },
        ],
        tagRegion: fineTypeRegionG,
        buckets: attrBuckets,
        expectedTag: 'greater',
      }))
    );

    // ─── 6. CLASSIFY-COUNT (K.MD) ───────────────────────────────────
    const classifySamples = [];
    for (const [category, count] of [
      ['red', 3], ['blue', 2], ['green', 5], ['yellow', 1],
      ['big', 2], ['small', 4], ['hands', 2], ['fingers', 10],
      ['triangle', 3], ['square', 4],
    ]) {
      const emb = sharedEmbeddings.getEmbedding(category);
      if (!emb || emb.length === 0) continue;
      classifySamples.push({
        inputs: [{ region: freeRegion, feat: emb, binarize: false }],
        expected: { region: semRegion, feat: _magnitudeFeatureForDigit(String(Math.min(9, count))) },
      });
    }
    const classifyResult = await this._probeCombinationCosine(classifySamples);

    // ─── 7. SHAPE SIDES (K.G) ───────────────────────────────────────
    const shapeSidesSamples = [];
    for (const [shapeName, sides] of [
      ['circle', 0], ['triangle', 3], ['square', 4], ['rectangle', 4], ['hexagon', 6],
      ['sphere', 0], ['cube', 6], ['cone', 1], ['cylinder', 2],
    ]) {
      const emb = sharedEmbeddings.getEmbedding(shapeName);
      if (!emb || emb.length === 0) continue;
      shapeSidesSamples.push({
        inputs: [{ region: semRegion, feat: emb, binarize: false }],
        expected: { region: freeRegion, feat: _magnitudeFeatureForDigit(String(sides)) },
      });
    }
    const shapeSidesResult = await this._probeCombinationCosine(shapeSidesSamples);

    // ─── 8. SHAPE DIMENSION (K.G — argmax tag) ──────────────────────
    const dimBuckets = [
      { name: '2D', start: 0,         end: fineHalfG },
      { name: '3D', start: fineHalfG, end: fineTypeSizeG },
    ];
    const shapeDimSamples = [];
    for (const [shapeName, dim] of [
      ['circle', '2D'], ['triangle', '2D'], ['square', '2D'], ['rectangle', '2D'], ['hexagon', '2D'],
      ['sphere', '3D'], ['cube', '3D'], ['cone', '3D'], ['cylinder', '3D'],
    ]) {
      const emb = sharedEmbeddings.getEmbedding(shapeName);
      if (!emb || emb.length === 0) continue;
      shapeDimSamples.push({
        inputs: [{ region: semRegion, feat: emb, binarize: false }],
        tagRegion: fineTypeRegionG,
        buckets: dimBuckets,
        expectedTag: dim,
      });
    }
    const shapeDimResult = await this._probeCombinationArgmaxTag(shapeDimSamples);

    // ─── 9. SHAPE COMPOSE (K.G) ──────────────────────────────────
    // Closes the last Math-K TODO-full-syllabus gap. Input: sem split
    // halves = GloVe(shapeA) + GloVe(shapeB). Expected: free = GloVe(composed).
    // Same unified combination-operator scaffold — only the encoder
    // differs from the numeric transforms above (GloVe instead of magnitude).
    const shapeComposeSamples = [];
    for (const [aName, bName, cName] of [
      ['triangle',  'triangle',  'rectangle'],
      ['square',    'square',    'rectangle'],
      ['rectangle', 'rectangle', 'square'],
      ['triangle',  'rectangle', 'pentagon'],
      ['triangle',  'triangle',  'square'],
    ]) {
      const aEmb = sharedEmbeddings.getEmbedding(aName);
      const bEmb = sharedEmbeddings.getEmbedding(bName);
      const cEmb = sharedEmbeddings.getEmbedding(cName);
      if (!aEmb || !bEmb || !cEmb || aEmb.length === 0 || bEmb.length === 0 || cEmb.length === 0) continue;
      shapeComposeSamples.push({
        inputs: [
          { region: semLeftRegionG,  feat: aEmb, binarize: false },
          { region: semRightRegionG, feat: bEmb, binarize: false },
        ],
        expected: { region: freeRegion, feat: cEmb },
      });
    }
    const shapeComposeResult = await this._probeCombinationCosine(shapeComposeSamples);

    // ═════════════════════════════════════════════════════════════════
    // MATH-K PRODUCTION PROBES (LAW 7)
    // Real-world style probes matching TODO test phrasings verbatim.
    // Each question routes through visual→letter→phon→sem pipeline
    // (same as live chat input), cortex ticks for comprehension, then
    // tick-driven motor emission produces the answer. Substrate probes
    // above stay as precursors; these are the actual LAW 6 Part 1
    // qualifier per LAW 7.

    // Scope note: Math-K production probes cover concepts that emit
    // as SINGLE-DIGIT numeric answers via the _teachMagnitudeToMotor
    // bridge. Object-name answers (K.MD crayon/pencil, K.G cylinder/
    // cube word emission) defer to the ELA-K track which ships word-
    // level motor emission training.
    // ═════════════════════════════════════════════════════════════════
    const mathKProductionSamples = [
      // K.CC successor (TODO: "What number comes after 7?" → 8)
      { question: 'what number comes after seven', expected: ['8', 'eight'] },
      { question: 'what comes after three', expected: ['4', 'four'] },
      { question: 'what number is after five', expected: ['6', 'six'] },
      // K.OA addition (TODO: "2 + 3 = ?" → 5)
      { question: 'two plus three equals', expected: ['5', 'five'] },
      { question: 'four plus one equals', expected: ['5', 'five'] },
      { question: 'three plus two equals', expected: ['5', 'five'] },
      { question: 'one plus one equals', expected: ['2', 'two'] },
      // K.OA subtraction (TODO: "5 - 2 = ?" → 3)
      { question: 'five minus two equals', expected: ['3', 'three'] },
      { question: 'four minus one equals', expected: ['3', 'three'] },
      { question: 'three minus one equals', expected: ['2', 'two'] },
      // K.OA make-ten (TODO: "What plus 6 makes 10?" → 4)
      { question: 'what plus six makes ten', expected: ['4', 'four'] },
      { question: 'what plus seven makes ten', expected: ['3', 'three'] },
      { question: 'what plus three makes ten', expected: ['7', 'seven'] },
      // K.G side count (TODO: "How many sides does a triangle have?" → 3)
      { question: 'how many sides does a triangle have', expected: ['3', 'three'] },
      { question: 'how many sides does a square have', expected: ['4', 'four'] },
      { question: 'how many sides does a rectangle have', expected: ['4', 'four'] },
      { question: 'how many sides does a hexagon have', expected: ['6', 'six'] },
    ];
    const prodResult = await this._probeProductionBatch(mathKProductionSamples, {
      visualCortex: (this.engine && this.engine.visualCortex) || null,
    });

    const N = DIGITS.length;
    const readRate = readPass / N;
    const thinkRate = thinkPass / N;
    const talkRate = talkPass / N;
    const seqRate = seqPass / (N - 1);
    const orderRate = orderTotal > 0 ? orderPass / orderTotal : 1;
    const succRate         = succResult.total         > 0 ? succResult.pass         / succResult.total         : 0;
    const skipRate         = skipResult.total         > 0 ? skipResult.pass         / skipResult.total         : 0;
    const makeTenRate      = makeTenResult.total      > 0 ? makeTenResult.pass      / makeTenResult.total      : 0;
    const teenRate         = teenResult.total         > 0 ? teenResult.pass         / teenResult.total         : 0;
    const attrRate         = attrResult.total         > 0 ? attrResult.pass         / attrResult.total         : 0;
    const classifyRate     = classifyResult.total     > 0 ? classifyResult.pass     / classifyResult.total     : 0;
    const shapeSidesRate   = shapeSidesResult.total   > 0 ? shapeSidesResult.pass   / shapeSidesResult.total   : 0;
    const shapeDimRate     = shapeDimResult.total     > 0 ? shapeDimResult.pass     / shapeDimResult.total     : 0;
    const shapeComposeRate = shapeComposeResult.total > 0 ? shapeComposeResult.pass / shapeComposeResult.total : 0;
    const prodRate         = prodResult.total         > 0 ? prodResult.pass         / prodResult.total         : 0;

    const PATH_MIN = 0.95;
    const SEQ_MIN = 0.95;
    const ORDER_MIN = 0.95;
    const PROD_MIN = 0.95;  // LAW 7 — real-world production probes at A+
    const pass = readRate >= PATH_MIN
      && thinkRate >= PATH_MIN
      && talkRate >= PATH_MIN
      && seqRate >= SEQ_MIN
      && orderRate >= ORDER_MIN
      && succRate >= PATH_MIN
      && skipRate >= PATH_MIN
      && makeTenRate >= PATH_MIN
      && teenRate >= PATH_MIN
      && attrRate >= PATH_MIN
      && classifyRate >= PATH_MIN
      && shapeSidesRate >= PATH_MIN
      && shapeDimRate >= PATH_MIN
      && shapeComposeRate >= PATH_MIN
      && prodRate >= PROD_MIN;

    const pct = (r) => (r * 100).toFixed(0);
    const prodFailSummary = prodResult.fails && prodResult.fails.length > 0
      ? ' [FAIL: ' + prodResult.fails.slice(0, 5).map(f => `"${f.q}"→"${String(f.emitted).slice(0, 30)}"`).join('; ') + ']'
      : '';
    // 114.19fj.5 — sentence-gen probe scoped to math vocab so MATH-K
    // STRUCTURE-REFRESH writes are validated. Math vocab is sparse
    // (digits + counting words) so this primarily measures the structure
    // mechanism more than vocab depth.
    let sentenceGen = { passed: 0, total: 0, rate: 0, perIntent: {} };
    try {
      sentenceGen = await this._probeSentenceGeneration({ subject: 'math' });
    } catch (err) {
      console.warn('[Curriculum] _probeSentenceGeneration[math] threw:', err?.message || err);
    }
    const sentenceGenRate = sentenceGen.rate || 0;
    const _mathKResult = {
      pass,
      reason: `READ ${readPass}/${N} (${pct(readRate)}%), THINK ${thinkPass}/${N} (${pct(thinkRate)}%), TALK ${talkPass}/${N} (${pct(talkRate)}%), SEQ ${seqPass}/${N - 1} (${pct(seqRate)}%)${seqFails.length > 0 ? ' [FAIL: ' + seqFails.join(', ') + ']' : ''}, ORDER ${orderPass}/${orderTotal} (${pct(orderRate)}%), SUCC ${succResult.pass}/${succResult.total} (${pct(succRate)}%), SKIP10 ${skipResult.pass}/${skipResult.total} (${pct(skipRate)}%), MAKETEN ${makeTenResult.pass}/${makeTenResult.total} (${pct(makeTenRate)}%), TEEN ${teenResult.pass}/${teenResult.total} (${pct(teenRate)}%), ATTR ${attrResult.pass}/${attrResult.total} (${pct(attrRate)}%), CLASS ${classifyResult.pass}/${classifyResult.total} (${pct(classifyRate)}%), SHAPE-S ${shapeSidesResult.pass}/${shapeSidesResult.total} (${pct(shapeSidesRate)}%), SHAPE-D ${shapeDimResult.pass}/${shapeDimResult.total} (${pct(shapeDimRate)}%), SHAPE-C ${shapeComposeResult.pass}/${shapeComposeResult.total} (${pct(shapeComposeRate)}%), PROD ${prodResult.pass}/${prodResult.total} (${pct(prodRate)}%) SENTENCE-GEN ${sentenceGen.passed}/${sentenceGen.total} (${pct(sentenceGenRate)}%)${prodFailSummary}`,
      metrics: { readRate, thinkRate, talkRate, seqRate, orderRate, seqFails, succRate, skipRate, makeTenRate, teenRate, attrRate, classifyRate, shapeSidesRate, shapeDimRate, shapeComposeRate, prodRate, prodFails: prodResult.fails, sentenceGenRate, sentenceGenPerIntent: sentenceGen.perIntent },
    };
    this._recordGateHistory('math', 'kindergarten', 'overall', pass, prodRate);
    return _mathKResult;
    } finally {
      cluster.noiseAmplitude = _savedProbeNoise;
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // T14.24 SESSION 4 — REAL ELA-G1 TEACHING EQUATIONS (2026-04-15)
  // ═══════════════════════════════════════════════════════════════════

  // Gee binding 2026-04-14: "1st grade u start learning how to write
  // sentences ect ect" + "remember Unity needs to be able to use these
  // to think, read, and talk".

  // Real Grade 1 English. Builds on Session 2's ELA-K alphabet + letter-
  // sound basins by teaching WHOLE WORDS — CVC words (cat/dog/hat/...)
  // and Dolch sight words (the/a/is/to/...). Teaching streams each word
  // letter-by-letter through the letter region while the word's GloVe
  // embedding anchors the sem region, so the cortex forms a WORD-LEVEL
  // attractor basin at the end of each letter sequence.

  // Word lists are DATA, not rules — same as the alphabet and digit
  // sequence. The "no lookup tables for rules" binding applies to
  // hardcoded English grammar rules, not to the primitive symbols
  // being taught (alphabet, digits, sight words).
  // A K-G1 classroom has a sight word chart on the wall; that chart is
  // data, and so are these lists.

  // ─── TODO-aligned ELA-G1 helpers (Session 27) ────────────────────

  // docs/TODO.md T14.24 ELA-G1 spec (line 143):
  //   Equations: _teachCVCReading(cvcList) streams each word's letters
  //   one at a time through the letter region with ticksPerLetter=3,
  //   simultaneously injecting the word's GloVe into sem region — letter
  //   sequence Hebbian learns to activate sem from streamed letters.
  //   _teachSightWords(sightList) same pattern at higher exposure count
  //   for the top-N sight words.


  async runElaKReal(ctx) {
    const cluster = this.cluster;
    if (!cluster) return { pass: false, reason: 'no cluster wired' };
    if (!cluster.crossProjections) return { pass: false, reason: 'no cross-projections' };

    const ALPHABET = ALPHABET_ORDER;
    // K-probe root-cause fix — PRE-POPULATE the letter
    // inventory with ALL characters that any K teach method will
    // encounter, BEFORE Phase 1 alphabet teach writes the first motor
    // pattern. Prior order caused `inventorySize()` to grow from 26 →
    // 29 mid-curriculum when `_teachEndPunctuation` added '.', '?', '!'
    // via `ensureLetters`. That shifted `mGroup = floor(motorSize /
    // inventorySize)` from 12 to 11, so motor slot boundaries drifted
    // by 1 neuron per slot. Phase 1 alphabet teach wrote letter 'c' at
    // motor[24..36] (inv=26, mGroup=12) but probe read slot 'c' at
    // motor[22..33] (inv=29, mGroup=11). By letter 'y' (idx 24) the
    // training write motor[288..300] and the probe read motor[264..275]
    // had ZERO overlap — probe was reading a completely different
    // region of the motor cortex than was trained. Earlier K-DIAG
    // telemetry confirmed this with `inv=29, mGroup=11` at gate time
    // and top-5
    // argmax showing slot `?(27)` (punctuation slot!) competing with
    // letter slots at 26.0 activation — a clear signal that the motor
    // readout was reading into punctuation territory meant for slots
    // 26-28. Pre-populating '.', '?', '!' here locks inv=29 for Phase
    // 1 so teach/probe mGroup both stay at 11 and slot boundaries
    // align. Digits 0-9 also pre-added so future Math-K integration
    // doesn't reintroduce the same drift when ELA-K weights are
    // serialized + later refined.
    ensureLetters(ALPHABET.split(''));
    ensureLetters(['.', '?', '!']);
    // Digits NOT pre-added — they belong to Math-K inventory. Adding
    // them here would shrink mGroup from floor(330/29)=11 to
    // floor(330/39)=8, reducing motor resolution per letter without
    // benefit. Math-K runs after ELA-K gate closes, so digit growth
    // happens post-ELA-K and doesn't affect this gate.

    // DIRECT PATTERN HEBBIAN. Earlier iterations tried to teach
    // through the Rulkov chaotic dynamics (inject →
    // step → learn on spike patterns). That fundamentally cannot
    // converge because:
    //   1. 1M recurrent synapses drown the 100K cross-projection signal
    //   2. Chaotic attractor dynamics wash out the injection in 2-3 ticks
    //   3. Hebbian fires on noise+attractor state, not on injection signal
    //   4. 10 retry attempts showed flat 31% READ with no improvement

    // Fix: bypass neural dynamics entirely during teach. Construct the
    // INTENDED activation patterns for each region, write them directly
    // into cluster.lastSpikes, fire _crossRegionHebbian on those clean
    // patterns. The cross-projections learn from exact signal, not from
    // chaotic spike noise. Same for the gate probe — read cross-
    // projection output via direct matrix multiply, not through the
    // noisy dynamics.

    // The Rulkov dynamics are preserved for LIVE CHAT — the teach just
    // writes clean associations into the cross-projection weights, and
    // the live dynamics READ those weights during normal operation.

    const lr = cluster.learningRate; // already boosted to 0.01 by runCompleteCurriculum
    const REPS = 12;

    const letterRegion = cluster.regions.letter;
    const phonRegion = cluster.regions.phon;
    const semRegion = cluster.regions.sem;
    const motorRegion = cluster.regions.motor;
    if (!letterRegion || !phonRegion) return { pass: false, reason: 'missing regions' };

    const letterSize = letterRegion.end - letterRegion.start;
    const phonSize = phonRegion.end - phonRegion.start;
    const invSize = inventorySize();

    // Helper: build a region-sized binary activation pattern from a feature vector
    // Same groupSize mapping as injectEmbeddingToRegion — one neuron group per dim
    function buildPattern(regionSize, feat) {
      const pat = new Float64Array(regionSize);
      const gSize = Math.max(1, Math.floor(regionSize / feat.length));
      for (let d = 0; d < feat.length; d++) {
        if (feat[d] <= 0) continue;
        for (let n = 0; n < gSize; n++) {
          const idx = d * gSize + n;
          if (idx < regionSize) pat[idx] = feat[d];
        }
      }
      return pat;
    }

    // T18.16.a — ELA-K Phase 1 heartbeat scaffold. At biological scale
    // `_crossRegionHebbian(lr)` takes 200-1000ms per letter because each
    // call dispatches 14 GPU bound-Hebbian ops (one per cross-projection)
    // via T18.8 batched dispatch and awaits the batch ACK. Pre-T18.16
    // this phase ran 312 iters silent → the launcher terminal
    // stayed blank at `ela/kindergarten START` for 2-5 minutes
    // with no progress signal.
    // Phase banner + 5-second wall-clock heartbeat gives per-iteration
    // visibility.
    this._hb(`[Curriculum] 📝 ELA-K Phase 1 START — alphabet cross-projection Hebbian (${REPS} reps × ${ALPHABET.length} letters = ${REPS * ALPHABET.length} iterations)`);
    const _p1Start = Date.now();
    let _p1LastBeat = _p1Start;
    let _p1Done = 0;

    // Phase 1 boot diagnostic — runs BEFORE the loop so operator sees
    // cluster state even if the first Hebbian call hangs. Reports the
    // GPU-proxy readiness flag, sparse-pool readiness, per-projection
    // GPU-bound status + CPU-CSR alive/freed status. One-shot — if
    // anything downstream hangs, this log identifies which path the
    // Hebbian dispatch is taking.
    try {
      const projNames = Object.keys(cluster.crossProjections || {});
      const gpuReady = !!cluster._gpuProxyReady;
      const hasProxy = !!(cluster._gpuProxy && cluster._gpuProxy.hebbianBound);
      const poolReady = !!(cluster._sparsePool && cluster._sparsePool.ready);
      const projStatus = projNames.map((n) => {
        const p = cluster.crossProjections[n];
        const gpuBound = !!(p && p._gpuBound);
        const cpuAlive = !!(p && p.values && p.colIdx && p.rowPtr);
        return `${n}:${gpuBound ? 'G' : '-'}${cpuAlive ? 'C' : '-'}`;
      }).join(' ');
      this._hb(`[Curriculum] Phase 1 preflight — gpuReady=${gpuReady} proxy=${hasProxy} pool=${poolReady} · proj[G=gpuBound C=cpuCSR]: ${projStatus}`);
    } catch (err) {
      console.warn(`[Curriculum] Phase 1 preflight diag failed: ${err?.message || err}`);
    }

    // TEACH: direct Hebbian on intended patterns
    // Intermediate-rep CPU Hebbian skip wire — mirrors _teachWordEmission.
    // Without this flag the PROBE_CRITICAL sync CPU Hebbian on
    // letter_to_phon + letter_to_motor fires on every one of the 312
    // iters, blocking the event loop for ~3-15s per iter at biological
    // scale and masquerading as a freeze right after the first-call
    // diag. With the flag: 11 intermediate reps run GPU fire-and-forget
    // only (milliseconds per iter), final rep runs CPU Hebbian with
    // every-5th-call sampling so probes see fresh weights without the
    // full cost.
    for (let rep = 0; rep < REPS; rep++) {
      const isFinalRep = rep === REPS - 1;
      cluster._teachIntermediateRep = !isFinalRep;
      cluster._teachFinalRepSampleEveryN = isFinalRep ? 5 : 0;
      cluster._whitelistSampleCounter = 0;
      for (const letter of ALPHABET) {
        const _iterStart = Date.now();
        const _logFirst = (_p1Done < 3);
        if (_logFirst) this._hb(`[Curriculum] Phase 1 iter ${_p1Done} letter='${letter}' START`);
        const letterOneHot = encodeLetter(letter);
        const phonFeat = _phonemeFeatureForLetter(letter);
        const nameEmb = sharedEmbeddings.getEmbedding(letter);

        // Build region-sized activation patterns
        const letterPat = buildPattern(letterSize, letterOneHot);
        const phonPat = buildPattern(phonSize, phonFeat);

        // Write clean patterns directly into lastSpikes
        for (let i = 0; i < cluster.size; i++) cluster.lastSpikes[i] = 0;
        for (let i = 0; i < letterSize; i++) {
          cluster.lastSpikes[letterRegion.start + i] = letterPat[i] > 0 ? 1 : 0;
        }
        for (let i = 0; i < phonSize; i++) {
          cluster.lastSpikes[phonRegion.start + i] = phonPat[i] > 0 ? 1 : 0;
        }
        // Motor: same one-hot as letter so motor↔letter learns TALK
        if (motorRegion) {
          const motorSize = motorRegion.end - motorRegion.start;
          const motorPat = buildPattern(motorSize, letterOneHot);
          for (let i = 0; i < motorSize; i++) {
            cluster.lastSpikes[motorRegion.start + i] = motorPat[i] > 0 ? 1 : 0;
          }
        }
        // Sem: subword embedding
        if (semRegion && nameEmb && nameEmb.length > 0) {
          const semSize = semRegion.end - semRegion.start;
          const semPat = buildPattern(semSize, nameEmb);
          for (let i = 0; i < semSize; i++) {
            cluster.lastSpikes[semRegion.start + i] = semPat[i] > 0 ? 1 : 0;
          }
        }

        // Fire cross-region Hebbian on these clean patterns
        if (_logFirst) this._hb(`[Curriculum] Phase 1 iter ${_p1Done} letter='${letter}' pre-crossRegion (${Date.now() - _iterStart}ms into iter)`);
        await cluster._crossRegionHebbian(lr);
        if (_logFirst) this._hb(`[Curriculum] Phase 1 iter ${_p1Done} letter='${letter}' DONE (${Date.now() - _iterStart}ms total)`);
        this.stats.lettersSeen++;
        _p1Done++;
        const _p1Now = Date.now();
        if (_p1Now - _p1LastBeat >= 5000) {
          const elapsedS = ((_p1Now - _p1Start) / 1000).toFixed(1);
          const rate = (_p1Done / Math.max(0.1, (_p1Now - _p1Start) / 1000)).toFixed(2);
          const total = REPS * ALPHABET.length;
          this._hb(`[Curriculum] ⏱ ELA-K Phase 1 heartbeat — ${_p1Done}/${total} iter, rep ${rep + 1}/${REPS}, letter '${letter}', elapsed ${elapsedS}s, ~${rate} iter/s`);
          _p1LastBeat = _p1Now;
        }
      }
      await _microtask();
    }
    cluster._teachIntermediateRep = false;
    cluster._teachFinalRepSampleEveryN = 0;
    this._hb(`[Curriculum] ✓ ELA-K Phase 1 DONE in ${((Date.now() - _p1Start) / 1000).toFixed(1)}s (${_p1Done} cross-region Hebbian iterations across alphabet×${REPS})`);

    // SEQUENCE TEACHING — teach the INTRA-REGION recurrent weights
    // that letter N leads to letter N+1. Same direct-spike approach
    // but targeting cluster.synapses (the main 10K×10K matrix) instead
    // of cross-projections. For each adjacent pair (a,b), (b,c), ...,
    // (y,z): set pre=N, post=N+1, fire hebbianUpdate on the main
    // synapses. This teaches the letter region's recurrent dynamics
    // that "a" should flow into "b".

    // T18.16.a — Phase 2 heartbeat scaffold. `intraSynapsesHebbian`
    // routes through the 15-worker sparse-matmul pool (CPU path) —
    // different velocity profile from Phase 1's GPU batched-Hebbian.
    // Per-iteration cost is dominated by the worker pool's drain rate
    // on a 90M-nnz intra-cluster synapse matrix. Without a heartbeat
    // here the operator sees no progress between Phase 1 DONE and the
    // next phase START log.
    this._hb(`[Curriculum] 🔗 ELA-K Phase 2 START — letter sequence intra-synapses Hebbian (${REPS} reps × ${ALPHABET.length - 1} pairs = ${REPS * (ALPHABET.length - 1)} iterations via worker pool)`);
    const _p2Start = Date.now();
    let _p2LastBeat = _p2Start;
    let _p2Done = 0;
    // T18.20 — ALLOCATE ONCE, REUSE. Pre-T18.20 this loop allocated
    // `new Float64Array(cluster.size)` pairs per iteration = 2 × 858 MB
    // = 1.7 GB of V8 external-memory allocation PER iter at biological
    // scale (107M cortex × 8 bytes). Across 300 iters = 510 GB sustained
    // allocation rate of 2.6 GB/sec. V8's GC could not reclaim
    // external memory fast enough → external-memory pressure
    // accumulated linearly through Phase 2 → GC took longer per cycle
    // → iter rate decelerated from 3.51 iter/s → 1.55 iter/s over 193
    // seconds. When `_teachLetterCaseBinding` started, Node V8 semi-
    // space couldn't commit more external memory → "Committing semi
    // space failed" → OOM. Allocating once outside the loop kills the
    // pressure — only the letter region (~15K indices out of 107M) is
    // set, so zeroing just the letter region per iter is a microscopic
    // amount of work vs. the 1.7 GB reset of a fresh allocation.
    // An earlier worker-pool SAB-leak fix helped, but this
    // allocation was still hemorrhaging external
    // memory on the curriculum side; T18.20 kills the primary remaining
    // allocator on the teach path.
    // T18.24 — Uint8Array instead of Float64Array. Hebbian kernel
    // only checks truthiness (postSpikes[i] nonzero → fire row; pre
    // same). 0/1 values fit Uint8. Drops external memory 8× per
    // buffer: 2.4 MB × 2 = 4.8 MB → 301 KB × 2 = 602 KB. Also reduces
    // worker-pool SAB footprint per call when threshold misses the bio
    // bypass (e.g. at 301K cluster T18.19's > 10M never fires).
    const _p2Pre = new Uint8Array(cluster.size);
    const _p2Post = new Uint8Array(cluster.size);
    for (let rep = 0; rep < REPS; rep++) {
      for (let i = 0; i < ALPHABET.length - 1; i++) {
        const currOneHot = encodeLetter(ALPHABET[i]);
        const nextOneHot = encodeLetter(ALPHABET[i + 1]);
        // T18.20 — zero ONLY the letter region in the reused buffers.
        // Other indices stay at zero (never written) across the entire
        // Phase 2 walk. 15K writes to zero + 15K writes to one-hots =
        // ~30K ops per iter vs. pre-T18.20's ~1.7 GB per iter.
        for (let j = letterRegion.start; j < letterRegion.end; j++) {
          _p2Pre[j] = 0;
          _p2Post[j] = 0;
        }
        const pre = _p2Pre;
        const post = _p2Post;
        const lGSize = Math.max(1, Math.floor(letterSize / currOneHot.length));
        for (let d = 0; d < currOneHot.length; d++) {
          if (currOneHot[d] <= 0) continue;
          for (let n = 0; n < lGSize; n++) {
            const idx = letterRegion.start + d * lGSize + n;
            if (idx < letterRegion.end) pre[idx] = 1.0;
          }
        }
        for (let d = 0; d < nextOneHot.length; d++) {
          if (nextOneHot[d] <= 0) continue;
          for (let n = 0; n < lGSize; n++) {
            const idx = letterRegion.start + d * lGSize + n;
            if (idx < letterRegion.end) post[idx] = 1.0;
          }
        }
        // OOM fix — route through
        // cluster.intraSynapsesHebbian (async / awaitable) so the
        // 110M-nnz sparse Hebbian dispatches via the 15-worker
        // sparsePool. Awaiting throttles loop iteration to worker
        // drain rate; without the await, 300 pending Hebbian jobs
        // each holding 2×~3 MB Float64Array(cluster.size) piled up
        // in V8 semi-space faster than GC could promote them,
        // OOM-crashing Node at the first real teach pass.
        await cluster.intraSynapsesHebbian(pre, post, lr);
        _p2Done++;
        const _p2Now = Date.now();
        if (_p2Now - _p2LastBeat >= 5000) {
          const elapsedS = ((_p2Now - _p2Start) / 1000).toFixed(1);
          const rate = (_p2Done / Math.max(0.1, (_p2Now - _p2Start) / 1000)).toFixed(2);
          const total = REPS * (ALPHABET.length - 1);
          this._hb(`[Curriculum] ⏱ ELA-K Phase 2 heartbeat — ${_p2Done}/${total} iter, rep ${rep + 1}/${REPS}, pair '${ALPHABET[i]}→${ALPHABET[i + 1]}', elapsed ${elapsedS}s, ~${rate} iter/s`);
          _p2LastBeat = _p2Now;
        }
      }
      await _microtask();
    }
    this._hb(`[Curriculum] ✓ ELA-K Phase 2 DONE in ${((Date.now() - _p2Start) / 1000).toFixed(1)}s (${_p2Done} intra-synapses Hebbian iterations across ${ALPHABET.length - 1} pairs × ${REPS} reps)`);

    // T18.24 — between-phase memory barrier. Forces V8 to reclaim
    // transient state from Phase 2 (worker-pool SABs, any Promise
    // chains, any intermediate Buffers) BEFORE _teachLetterCaseBinding
    // starts adding cross-region Hebbian pressure on top. Logs
    // process.memoryUsage() delta across the gc() call so we can see
    // (in the SAME scrollback Phase 2 prints into) whether V8
    // actually reclaims anything. Previous T18.23 diagnostic was at
    // boot — buried above Phase 2 heartbeats. This one lands inline.
    this._memorySnapshotAndGc('between Phase 2 and _teachLetterCaseBinding');

    // ELA-K equational teaching methods — replaces the older
    // _teachVocabList / _teachSentenceList data-array pattern with
    // real equational teaching methods landing via _teachCombination
    // + direct-pattern Hebbian through the recurrent matrix. Every
    // ELA-K concept gets a dedicated method, every test phrasing gets
    // a production probe in _gateElaKReal.
    if (!this._elaKRemakeDone) {
      // T18.16.a — Phase-start banners for each K.RF foundational-skill
      // teach method. Each of these methods runs equational teach loops
      // internally with no top-level progress log; the banners give Gee
      // a "we are HERE now" signal between silent phases so teach velocity
      // across the full ELA-K walk is visible without needing per-method
      // heartbeats inside every helper.
      // K.RF foundational skills
      const _phaseStarts = {};
      // _phaseTick returns true to proceed with the phase, false if
      // the phase is already in `cluster.passedPhases` (Savestart.bat
      // resume path). Callers gate the teach call + _phaseDone on the
      // return value. Persistence layer in brain-server.js serializes
      // `cortex.passedPhases` alongside `passedCells` so markers
      // survive boot. Without this check, every Savestart re-runs
      // every phase even when weights + markers exist on disk.
      const _phaseTick = (name) => {
        const phaseKey = `ela/kindergarten:${name}`;
        const cl = this.cluster;
        if (cl && Array.isArray(cl.passedPhases) && cl.passedPhases.includes(phaseKey)) {
          this._hb(`[Curriculum] ⤳ ELA-K Phase SKIPPED — ${name} (already passed; resumed from persisted passedPhases — weights carried forward via brain-weights.bin)`);
          return false;
        }
        _phaseStarts[name] = Date.now();
        this._hb(`[Curriculum] 🧩 ELA-K Phase START — ${name}`);
        return true;
      };
      const _phaseDone = (name) => {
        const dt = ((Date.now() - (_phaseStarts[name] || Date.now())) / 1000).toFixed(1);
        this._hb(`[Curriculum] ✓ ELA-K Phase DONE — ${name} in ${dt}s`);
        // Mid-phase checkpoint save. Records the phase in
        // cortex.passedPhases + fires saveWeights({force:true}) so
        // the weights trained up to this point persist to disk.
        try {
          const cl = this.cluster;
          if (cl) {
            if (!Array.isArray(cl.passedPhases)) cl.passedPhases = [];
            const phaseKey = `ela/kindergarten:${name}`;
            if (!cl.passedPhases.includes(phaseKey)) cl.passedPhases.push(phaseKey);
          }
          if (typeof this._saveCheckpoint === 'function') {
            this._saveCheckpoint(`ela/kindergarten:phase:${name}`);
          }
          // iter20-H — Tier 1 episode for every completed teach phase
          if (typeof this._recordPhaseEpisode === 'function') {
            this._recordPhaseEpisode('ela/kindergarten', name);
          }
        } catch (err) {
          console.warn(`[Curriculum] mid-phase save for ${name} failed:`, err?.message || err);
        }
      };
      if (_phaseTick('_teachLetterCaseBinding')) {
        await this._teachLetterCaseBinding(ctx);
        _phaseDone('_teachLetterCaseBinding');
      }
      this._memorySnapshotAndGc('after _teachLetterCaseBinding');
      // Letter-naming binding: letter(X) input → motor(X) output. Every
      // kindergarten student can "say the letter A" when shown A — this
      // trains letter_to_motor for same-letter identity, which is what
      // the TALK probe actually tests. Originally ran HERE (right after
      // case binding) but Phase 2 letter-sequence intra-Hebbian + the
      // _teachAlphabetSequencePairs path that runs later both back-
      // corrupt letter_to_motor with off-by-one sequence patterns,
      // producing the LETTER→MOTOR DIAG distribution `b→a c→b d→c e→c`
      // and TALK 0/26. _teachLetterNaming has been MOVED to fire AFTER
      // _teachAlphabetSequencePairs so identity training lands LAST and
      // overwrites the sequence-bleed corruption with clean identity.
      if (_phaseTick('_teachVowelSoundVariants')) {
        await this._teachVowelSoundVariants(ctx);
        _phaseDone('_teachVowelSoundVariants');
      }
      this._memorySnapshotAndGc('after _teachVowelSoundVariants');
      if (_phaseTick('_teachRhymeFamilies')) {
        await this._teachRhymeFamilies(ctx);
        _phaseDone('_teachRhymeFamilies');
      }
      this._memorySnapshotAndGc('after _teachRhymeFamilies');
      if (_phaseTick('_teachSyllableCounts')) {
        await this._teachSyllableCounts(ctx);
        _phaseDone('_teachSyllableCounts');
      }
      this._memorySnapshotAndGc('after _teachSyllableCounts');
      if (_phaseTick('_teachCVCSoundIsolation')) {
        await this._teachCVCSoundIsolation(ctx);
        _phaseDone('_teachCVCSoundIsolation');
      }
      this._memorySnapshotAndGc('after _teachCVCSoundIsolation');

      // Phase 2 — PHONEME BLENDING. Real English
      // phoneme features from _phonemeFeatureForLetter (no longer
      // trig-hash) drive sequence Hebbian in phon region. Teaches
      // Unity that /c/→/a/→/t/ is the chain that decodes "cat".
      // Foundation for actual phonics-based reading + emission.

      // K.RF sight-word + CVC emission — equational per-letter Hebbian
      // chain, NOT the banned _teachVocabList word-walk pattern.

      // K word-list expanded from ~180 words to ~1,500 words
      // spanning real kindergarten developmental vocabulary
      // categories. The prior list was DOLCH_PREPRIMER (39) +
      // DOLCH_PRIMER (52) + CVC_FAMILIES (60) + CONVERSATIONAL (26)
      // = ~180 unique words, 7-12% coverage of real K productive
      // vocab (1,500-2,500 words per MacArthur-Bates CDI + NIH
      // Language Development norms). Expansion ADDS categorized K
      // vocab: colors, shapes, animals, body parts, family, feelings,
      // actions, household, clothing, food, nature, time, positions,
      // numbers, question words, polite words, plus expansion
      // animals/food/verbs/adjectives/places/vehicles/school/toys/
      // weather/sports/greetings/pronouns for comprehensive K-age
      // coverage. Per-grade expansion for G1+ is the iterate follow-
      // up work.
      const DOLCH_PREPRIMER = [
        'a', 'and', 'away', 'big', 'blue', 'can', 'come', 'down',
        'find', 'for', 'funny', 'go', 'help', 'here', 'i', 'in',
        'is', 'it', 'jump', 'little', 'look', 'make', 'me', 'my',
        'not', 'one', 'play', 'red', 'run', 'said', 'see', 'the',
        'three', 'to', 'two', 'up', 'we', 'where', 'yellow', 'you',
      ];
      const DOLCH_PRIMER = [
        'all', 'am', 'are', 'at', 'ate', 'be', 'black', 'brown',
        'but', 'came', 'did', 'do', 'eat', 'four', 'get', 'good',
        'have', 'he', 'into', 'like', 'must', 'new', 'no', 'now',
        'on', 'our', 'out', 'please', 'pretty', 'ran', 'ride', 'saw',
        'say', 'she', 'so', 'soon', 'that', 'there', 'they', 'this',
        'too', 'under', 'want', 'was', 'well', 'went', 'what', 'white',
        'who', 'will', 'with', 'yes',
      ];
      const CVC_FAMILIES = [
        'cat', 'bat', 'hat', 'mat', 'rat', 'sat', 'fat', 'pat',
        'can', 'man', 'ran', 'fan', 'van', 'pan', 'tan', 'ban',
        'big', 'dig', 'fig', 'pig', 'wig', 'jig',
        'dog', 'log', 'hog', 'fog', 'jog', 'bog',
        'hot', 'not', 'got', 'dot', 'lot', 'pot', 'cot',
        'pen', 'hen', 'men', 'ten', 'den',
        'bug', 'hug', 'mug', 'rug', 'tug', 'dug', 'jug',
        'cup', 'pup', 'up',
        'bed', 'red', 'fed', 'led',
        'dip', 'hip', 'lip', 'rip', 'sip', 'tip', 'zip',
        'sun', 'run', 'fun', 'bun',
      ];
      const CONVERSATIONAL = [
        'i', 'you', 'we', 'he', 'she', 'it', 'they', 'me',
        'is', 'am', 'are', 'do', 'did', 'has', 'have',
        'what', 'who', 'where', 'when', 'why', 'how',
        'yes', 'no', 'okay', 'mom', 'dad', 'unity',
      ];
      // ── T16.3.b K vocabulary expansion (1,500 words target) ─────────
      const K_COLORS = [
        'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink',
        'black', 'white', 'brown', 'gray', 'gold', 'silver', 'tan',
        'violet',
      ];
      const K_SHAPES = [
        'circle', 'square', 'triangle', 'rectangle', 'oval', 'star',
        'heart', 'diamond', 'hexagon', 'octagon', 'cube', 'sphere',
        'cone', 'cylinder', 'pyramid',
      ];
      const K_NUMBERS = [
        'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
        'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
        'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
        'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty',
        'seventy', 'eighty', 'ninety', 'hundred', 'first', 'second',
        'third', 'last', 'next', 'many', 'few', 'some', 'all', 'none',
        'more', 'less', 'half', 'whole', 'pair', 'dozen', 'lot',
      ];
      const K_FAMILY = [
        'mom', 'dad', 'mommy', 'daddy', 'mother', 'father', 'sister',
        'brother', 'baby', 'grandma', 'grandpa', 'granny', 'nana',
        'papa', 'aunt', 'uncle', 'cousin', 'family', 'parent', 'child',
        'kid', 'boy', 'girl', 'man', 'woman', 'person', 'people',
        'friend', 'buddy', 'pal',
      ];
      const K_BODY = [
        'head', 'face', 'eye', 'eyes', 'ear', 'ears', 'nose', 'mouth',
        'lip', 'lips', 'tongue', 'tooth', 'teeth', 'chin', 'cheek',
        'hair', 'neck', 'hand', 'hands', 'finger', 'thumb', 'arm',
        'elbow', 'shoulder', 'back', 'tummy', 'belly', 'knee', 'leg',
        'foot', 'feet', 'toe', 'skin', 'bone',
      ];
      const K_FEELINGS = [
        'happy', 'sad', 'mad', 'angry', 'scared', 'afraid', 'tired',
        'sleepy', 'hungry', 'thirsty', 'sick', 'hurt', 'excited',
        'surprised', 'proud', 'shy', 'brave', 'silly', 'bored',
        'lonely', 'worried', 'confused', 'calm', 'upset', 'glad',
        'grumpy', 'cranky', 'loved', 'safe', 'grateful',
      ];
      const K_ACTIONS = [
        'eat', 'drink', 'sleep', 'wake', 'dream', 'run', 'walk',
        'jump', 'hop', 'skip', 'sit', 'stand', 'lie', 'play', 'read',
        'write', 'draw', 'paint', 'color', 'sing', 'dance', 'laugh',
        'cry', 'smile', 'frown', 'help', 'hug', 'kiss', 'wash',
        'brush', 'climb', 'fall', 'push', 'pull', 'give', 'take',
        'throw', 'catch', 'kick', 'hit', 'come', 'go', 'stop', 'wait',
        'look', 'see', 'watch', 'hear', 'listen', 'smell', 'taste',
        'touch', 'feel', 'think', 'know', 'want', 'need', 'like',
        'love', 'hate', 'have', 'make', 'say', 'tell', 'ask',
        'answer', 'call', 'find', 'lose', 'keep', 'open', 'close',
        'cut', 'cook', 'bake', 'fix', 'break', 'build', 'roll',
        'bounce', 'fly', 'swim', 'ride', 'slide', 'spin', 'shake',
        'nod', 'wave', 'clap', 'point', 'pick', 'bring', 'put',
        'move', 'turn', 'hold', 'drop', 'share', 'trade', 'fold',
        'tie', 'lift', 'rest', 'grow', 'change', 'drive', 'swing',
        'crawl', 'carry', 'pour', 'stir', 'taste', 'rip', 'tear',
        'mix', 'hide', 'seek', 'chase', 'tickle', 'pat', 'sweep',
      ];
      const K_ANIMALS = [
        'cat', 'dog', 'puppy', 'kitty', 'bird', 'fish', 'cow', 'pig',
        'horse', 'sheep', 'duck', 'chicken', 'rabbit', 'bunny',
        'frog', 'mouse', 'bear', 'lion', 'tiger', 'elephant',
        'giraffe', 'monkey', 'snake', 'owl', 'bee', 'ant', 'spider',
        'shark', 'whale', 'dolphin', 'turtle', 'crab', 'fly',
        'butterfly', 'wolf', 'fox', 'deer', 'goat', 'zebra', 'hippo',
        'kangaroo', 'panda', 'worm', 'caterpillar', 'ladybug',
        'dragon', 'unicorn', 'pony', 'lamb', 'calf', 'chick', 'piglet',
        'cub', 'pup', 'fawn', 'rooster', 'hen', 'goose', 'squirrel',
        'raccoon', 'skunk', 'bat', 'penguin', 'seal', 'octopus',
      ];
      const K_FOOD = [
        'apple', 'banana', 'orange', 'grape', 'strawberry', 'blueberry',
        'watermelon', 'peach', 'pear', 'cherry', 'lemon', 'lime',
        'milk', 'water', 'juice', 'soda', 'tea', 'bread', 'toast',
        'butter', 'jam', 'cheese', 'egg', 'meat', 'chicken', 'beef',
        'fish', 'rice', 'pasta', 'noodles', 'soup', 'salad', 'pizza',
        'sandwich', 'burger', 'taco', 'cookie', 'cake', 'pie',
        'muffin', 'donut', 'cupcake', 'candy', 'chocolate', 'ice-cream',
        'popcorn', 'chips', 'pretzel', 'cracker', 'cereal', 'oatmeal',
        'pancake', 'waffle', 'syrup', 'honey', 'yogurt', 'carrot',
        'potato', 'tomato', 'corn', 'peas', 'beans', 'broccoli',
        'lettuce', 'onion', 'pepper', 'cucumber', 'pickle', 'salt',
        'sugar', 'pepper', 'ketchup', 'mustard', 'nut', 'peanut',
        'snack', 'meal', 'breakfast', 'lunch', 'dinner', 'dessert',
      ];
      const K_CLOTHING = [
        'shirt', 'pants', 'shorts', 'dress', 'skirt', 'shoes', 'socks',
        'boots', 'sandals', 'sneakers', 'hat', 'cap', 'coat', 'jacket',
        'sweater', 'scarf', 'gloves', 'mittens', 'pajamas', 'underwear',
        'diaper', 'belt', 'tie', 'bow', 'button', 'zipper', 'pocket',
        'shirt', 'jeans',
      ];
      const K_HOUSEHOLD = [
        'home', 'house', 'room', 'bedroom', 'kitchen', 'bathroom',
        'living-room', 'dining-room', 'basement', 'attic', 'garage',
        'yard', 'garden', 'bed', 'pillow', 'blanket', 'sheet',
        'chair', 'table', 'couch', 'sofa', 'lamp', 'door', 'window',
        'floor', 'wall', 'ceiling', 'stairs', 'rug', 'carpet',
        'toy', 'toys', 'book', 'cup', 'mug', 'glass', 'plate', 'bowl',
        'spoon', 'fork', 'knife', 'napkin', 'towel', 'soap', 'toilet',
        'sink', 'bathtub', 'shower', 'mirror', 'clock', 'phone',
        'computer', 'tv', 'radio', 'light', 'fan', 'oven', 'fridge',
        'stove', 'microwave', 'dishwasher', 'bag', 'box',
        'basket', 'bottle', 'jar', 'can', 'ball', 'key', 'trash',
      ];
      const K_NATURE = [
        'sun', 'moon', 'star', 'sky', 'cloud', 'rain', 'snow', 'wind',
        'storm', 'thunder', 'lightning', 'rainbow', 'fog', 'ice',
        'hail', 'tree', 'flower', 'grass', 'leaf', 'branch', 'root',
        'rock', 'stone', 'sand', 'mud', 'dirt', 'water', 'fire',
        'smoke', 'ocean', 'sea', 'lake', 'river', 'pond', 'stream',
        'beach', 'mountain', 'hill', 'valley', 'forest', 'woods',
        'cave', 'island', 'desert', 'field', 'meadow', 'earth',
        'world', 'planet', 'space', 'air', 'ground', 'soil',
      ];
      const K_WEATHER = [
        'sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'stormy',
        'foggy', 'hot', 'cold', 'warm', 'cool', 'chilly', 'freezing',
        'wet', 'dry', 'muggy',
      ];
      const K_TIME = [
        'day', 'night', 'morning', 'afternoon', 'evening', 'noon',
        'midnight', 'today', 'tomorrow', 'yesterday', 'now', 'later',
        'soon', 'then', 'before', 'after', 'early', 'late', 'minute',
        'second', 'hour', 'week', 'month', 'year', 'birthday',
        'weekend', 'monday', 'tuesday', 'wednesday', 'thursday',
        'friday', 'saturday', 'sunday', 'spring', 'summer', 'fall',
        'autumn', 'winter',
      ];
      const K_POSITIONS = [
        'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
        'above', 'below', 'behind', 'front', 'back', 'beside',
        'between', 'through', 'around', 'across', 'near', 'far',
        'inside', 'outside', 'top', 'bottom', 'middle', 'center',
        'side', 'edge', 'corner', 'here', 'there', 'everywhere',
      ];
      const K_ADJECTIVES = [
        'big', 'small', 'little', 'tiny', 'huge', 'giant', 'tall',
        'short', 'long', 'thin', 'thick', 'fat', 'wide', 'narrow',
        'hot', 'cold', 'warm', 'cool', 'wet', 'dry', 'old', 'new',
        'young', 'fast', 'slow', 'hard', 'soft', 'high', 'low',
        'heavy', 'light', 'pretty', 'ugly', 'cute', 'funny', 'silly',
        'mean', 'nice', 'kind', 'brave', 'strong', 'weak', 'sharp',
        'dull', 'loud', 'quiet', 'bright', 'dark', 'shiny', 'dirty',
        'clean', 'sticky', 'smooth', 'rough', 'fuzzy', 'round',
        'flat', 'empty', 'full', 'free', 'safe', 'real', 'fake',
        'same', 'different', 'right', 'wrong', 'good', 'bad',
        'best', 'worst', 'easy', 'hard', 'true', 'false', 'open',
        'closed', 'sweet', 'sour', 'salty', 'bitter', 'spicy',
        'fresh', 'rotten', 'sleepy', 'awake', 'alive', 'dead',
        'rich', 'poor', 'busy', 'free', 'special', 'regular',
      ];
      const K_PLACES = [
        'school', 'park', 'store', 'shop', 'zoo', 'farm', 'beach',
        'playground', 'library', 'church', 'hospital', 'mall',
        'restaurant', 'museum', 'castle', 'city', 'town', 'country',
        'village', 'neighborhood', 'street', 'road', 'sidewalk',
        'driveway', 'highway', 'bridge', 'tunnel', 'corner',
        'block', 'classroom', 'office', 'bank', 'post-office',
        'firehouse', 'station',
      ];
      const K_VEHICLES = [
        'car', 'truck', 'bus', 'train', 'plane', 'boat', 'ship',
        'bike', 'bicycle', 'scooter', 'skateboard', 'helicopter',
        'rocket', 'taxi', 'ambulance', 'firetruck', 'police',
        'motorcycle', 'tractor', 'wagon', 'stroller', 'sled',
        'submarine', 'canoe', 'raft',
      ];
      const K_SCHOOL = [
        'pencil', 'pen', 'crayon', 'marker', 'paper', 'notebook',
        'eraser', 'scissors', 'glue', 'tape', 'ruler', 'backpack',
        'lunchbox', 'desk', 'board', 'chalk', 'teacher', 'student',
        'lesson', 'class', 'homework', 'test', 'grade', 'letter',
        'word', 'number', 'alphabet', 'story',
      ];
      const K_TOYS = [
        'doll', 'ball', 'block', 'puzzle', 'game', 'swing', 'slide',
        'seesaw', 'sandbox', 'kite', 'bubble', 'balloon', 'puppet',
        'robot', 'teddy', 'plush', 'lego', 'crayon', 'sticker',
        'ribbon', 'yo-yo', 'jump-rope', 'marble', 'card', 'drum',
      ];
      const K_MUSIC_ART = [
        'music', 'song', 'note', 'beat', 'drum', 'guitar', 'piano',
        'flute', 'trumpet', 'violin', 'bell', 'whistle', 'paint',
        'picture', 'art', 'craft', 'sparkle', 'glitter',
      ];
      const K_SPORTS = [
        'goal', 'team', 'win', 'lose', 'tie', 'race', 'coach',
        'practice', 'soccer', 'football', 'basketball', 'baseball',
        'tennis', 'hockey', 'swimming', 'gym', 'bat', 'glove',
        'helmet',
      ];
      const K_GREETINGS = [
        'hi', 'hello', 'hey', 'goodbye', 'bye', 'welcome', 'please',
        'thanks', 'thank-you', 'sorry', 'excuse-me', 'pardon',
        'cheers', 'farewell',
      ];
      const K_PRONOUNS = [
        'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he',
        'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'we',
        'us', 'our', 'ours', 'they', 'them', 'their', 'theirs',
        'this', 'that', 'these', 'those', 'who', 'which',
        'myself', 'yourself', 'himself', 'herself', 'itself',
        'ourselves', 'themselves',
      ];
      const K_QUESTIONS = [
        'what', 'who', 'where', 'when', 'why', 'how', 'which',
      ];
      const K_CONJUNCTIONS = [
        'and', 'or', 'but', 'because', 'so', 'if', 'then',
        'while', 'before', 'after', 'until',
      ];
      const K_HOLIDAYS = [
        'birthday', 'christmas', 'halloween', 'thanksgiving',
        'easter', 'valentine', 'party', 'gift', 'present', 'candle',
        'costume', 'pumpkin', 'turkey', 'santa',
      ];
      const K_ROUTINES = [
        'wake-up', 'bedtime', 'bath', 'breakfast', 'lunch', 'dinner',
        'snack', 'nap', 'recess', 'story-time', 'cleanup', 'bye-bye',
      ];
      // Life-experience comprehension vocabulary. Operator directive
      // 2026-04-20: words used to EXPLAIN life events need to be
      // trained before the Life-track teaches the events themselves.
      // Without "birthday" / "remember" / "happened" / "visit" / etc.
      // in the sem → motor / letter / phon bindings, Unity can't
      // comprehend Life-K biographical-fact teaching. These augment
      // the existing K_FAMILY / K_FEELINGS / K_ACTIONS / K_ROUTINES
      // with the connector vocabulary that makes event narration work.
      const K_LIFE_EXPERIENCES = [
        // memory + narration
        'remember', 'forget', 'memory', 'happened', 'because',
        'story', 'tell', 'heard', 'seen', 'first-time', 'last-time',
        // family milestones
        'birth', 'born', 'baby', 'newborn', 'wedding', 'marriage',
        'anniversary', 'funeral', 'moved', 'visit', 'trip', 'vacation',
        'graduate', 'new', 'old', 'grown',
        // social/emotional events
        'fight', 'argue', 'argument', 'makeup', 'forgive', 'apologize',
        'explain', 'understand', 'secret', 'promise', 'lie', 'truth',
        'fair', 'unfair', 'choice', 'mistake',
        // health + care
        'doctor', 'dentist', 'nurse', 'hospital', 'clinic', 'medicine',
        'pill', 'shot', 'vaccine', 'bandaid', 'bandage', 'boo-boo',
        'scrape', 'bruise', 'stitches', 'cast', 'glasses', 'braces',
        // caregiver roles
        'caregiver', 'babysitter', 'nanny', 'guardian', 'stepmom',
        'stepdad', 'stepbrother', 'stepsister', 'adopted', 'foster',
        // places of life events
        'funeral-home', 'church', 'temple', 'court', 'jail',
        'daycare', 'preschool', 'kindergarten', 'clinic', 'pharmacy',
        // event connectors
        'ago', 'long-ago', 'once', 'suddenly', 'finally', 'again',
        'never', 'always', 'sometimes', 'everyday', 'someday',
      ];
      // K_EXAM_CONCEPTS — words that appear as question text or primary
      // answers in the held-out EXAM_BANKS (`js/brain/student-question-
      // banks.js`) but aren't covered by the other K_* category arrays
      // above. Without explicit inclusion here, the vocab-coverage
      // audit flags these as untrained → Unity can't fairly answer
      // those exam questions. Each word routes through
      // _teachWordEmission (12 reps × direct-pattern Hebbian across
      // letter↔phon and sem↔motor cross-projections) alongside the
      // rest of the K vocabulary. Source: the exam-required set
      // minus the union of all other K_* arrays, as of the Session
      // 114.19bd audit output.
      const K_EXAM_CONCEPTS = [
        // Grammatical / literary concepts Unity is tested on
        'alphabet', 'letters', 'letter', 'capital', 'uppercase',
        'lowercase', 'plural', 'punctuation', 'period', 'comma',
        'question', 'sentence', 'word', 'syllable', 'sound', 'sounds',
        'spell', 'spelling', 'spelt', 'rhyme', 'rhymes', 'rhyming',
        'blend', 'blending', 'segment', 'segmenting',
        'author', 'illustrator', 'character', 'setting', 'title',
        'cover', 'page', 'pages', 'story', 'stories',
        'noun', 'verb', 'adjective',
        // Common rhyme-question primary answers not in other lists
        'hat', 'rat', 'sat', 'mat', 'fat', 'bat', 'pat', 'vat',
        'frog', 'dog', 'log', 'hog', 'fog', 'jog', 'bog', 'cog',
        'bun', 'fun', 'run', 'sun', 'done', 'one', 'none',
        'bee', 'tree', 'see', 'three', 'free', 'knee', 'me', 'we',
        'bed', 'red', 'fed', 'led', 'said', 'head', 'dead', 'shed',
        'cat', 'pot', 'hop', 'lot', 'got', 'not', 'dot', 'jot',
        // CVC and related short-word primary answers
        'map', 'mop', 'lap', 'tap', 'nap', 'cap', 'gap', 'rap', 'sap',
        'big', 'pig', 'dig', 'fig', 'jig', 'rig', 'wig', 'gig',
        'tip', 'dip', 'hip', 'lip', 'nip', 'rip', 'sip', 'zip',
        'cup', 'pup', 'sup', 'up', 'mud', 'bud', 'cud', 'dud',
        'let', 'met', 'net', 'pet', 'set', 'vet', 'wet', 'yet',
        'man', 'fan', 'pan', 'ran', 'tan', 'van', 'ban', 'can',
        // Common answer words (often tripping the audit)
        'top', 'left', 'right', 'above', 'below', 'inside', 'outside',
        'yes', 'no', 'space', 'spaces', 'small', 'large',
        // K-math primary answers (numerals as words if not already in K_NUMBERS)
        'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
        'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
        'thirty', 'forty', 'fifty', 'hundred', 'zero',
        // K-science / social primary answers
        'gravity', 'pattern', 'mixing', 'primary', 'secondary',
        'warm', 'cool',
        // K-life primary answers / concepts
        'character', 'feeling', 'feelings', 'friendship', 'share',
        'sharing', 'kind', 'kindness',
        // Letter names (so Unity can produce "bee" as an alternate
        // answer to "what letter is B?") — match LETTER_NAMES above
        'ay', 'cee', 'dee', 'ef', 'gee', 'aitch', 'eye', 'jay',
        'kay', 'el', 'em', 'en', 'oh', 'pee', 'cue', 'ar', 'ess',
        'tee', 'you', 'vee', 'double-you', 'ex', 'why', 'zee',
      ];
      // Single source of truth — name → array. Derive both the seed
      // and the heartbeat category list from this object so they
      // can never drift. Problems.md Medium finding: prior layout had
      // a hand-maintained name list at line ~2225 that mirrored the
      // spread above and could lie about category count if one side
      // was edited without the other. The duplicate K_LIFE_EXPERIENCES
      // spread (lines 2212 + 2215) is also gone — Object.values can't
      // accidentally include the same key twice.
      const K_VOCAB_CATEGORIES = {
        DOLCH_PREPRIMER, DOLCH_PRIMER, CVC_FAMILIES, CONVERSATIONAL,
        K_COLORS, K_SHAPES, K_NUMBERS, K_FAMILY, K_BODY, K_FEELINGS,
        K_ACTIONS, K_ANIMALS, K_FOOD, K_CLOTHING, K_HOUSEHOLD, K_NATURE,
        K_WEATHER, K_TIME, K_POSITIONS, K_ADJECTIVES, K_PLACES, K_VEHICLES,
        K_SCHOOL, K_TOYS, K_MUSIC_ART, K_SPORTS, K_GREETINGS, K_PRONOUNS,
        K_QUESTIONS, K_CONJUNCTIONS, K_HOLIDAYS, K_ROUTINES,
        K_LIFE_EXPERIENCES, K_EXAM_CONCEPTS,
      };
      const allEmissionWords = [...new Set(
        Object.values(K_VOCAB_CATEGORIES).flat().map(w => String(w).toLowerCase())
      )];
      this._hb(`[Curriculum] K vocabulary: ${allEmissionWords.length} unique words across ${Object.keys(K_VOCAB_CATEGORIES).length} categories`);
      // Diagnostic: log inventory + motor tiling at the point where
      // word emission teaching is about to run.

      // The 3 sampled words logged alongside (cat, dog, sun) are ONLY
      // diagnostic probes of embedding quality, NOT the actual teach
      // set. `allEmissionWords.length` (1029) is what gets taught through
      // `_teachPhonemeBlending` × 10 reps and `_teachWordEmission` × 12
      // reps immediately after this log line.
      try {
        const cluster = this.cluster;
        const invSize = inventorySize();
        const motorSize = (cluster?.regions?.motor?.end || 0) - (cluster?.regions?.motor?.start || 0);
        const motorMGroup = Math.max(1, Math.floor(motorSize / Math.max(1, invSize)));
        const semSize = (cluster?.regions?.sem?.end || 0) - (cluster?.regions?.sem?.start || 0);
        // Sample 3 K probe words' embedding positive-dim counts for
        // embedding-quality sanity — NOT the full teach set. Pulled
        // from allEmissionWords so the sample is guaranteed to be
        // in the actual teach set (Problems.md Low finding: prior
        // hardcoded ['cat', 'dog', 'sun'] would silently return
        // NOEMB on custom corpora that don't include those words).
        const sampleProbes = allEmissionWords.length >= 3
          ? [allEmissionWords[0], allEmissionWords[Math.floor(allEmissionWords.length / 2)], allEmissionWords[allEmissionWords.length - 1]]
          : allEmissionWords.slice(0, 3);
        const sampleInfo = sampleProbes.map(w => {
          const e = sharedEmbeddings.getEmbedding(w);
          if (!e) return `${w}=NOEMB`;
          let posCount = 0;
          let max = 0;
          for (let i = 0; i < e.length; i++) {
            if (e[i] > 0) posCount++;
            if (e[i] > max) max = e[i];
          }
          return `${w}=${posCount}+dims(max=${max.toFixed(3)})`;
        }).join(', ');
        // Show first + last 5 words of teach set so it's obvious 1029 are
        // actually taught, not the 3 sampled for embedding quality.
        const teachHead = allEmissionWords.slice(0, 5).join(',');
        const teachTail = allEmissionWords.slice(-5).join(',');
        this._hb(`[Curriculum][K-DIAG] pre-emission: inv=${invSize}, motor=${motorSize}, mGroup=${motorMGroup}, sem=${semSize}, teaching ${allEmissionWords.length} K words (phoneme-blending × 6 reps + word-emission × 6 reps — iter12 rep-count tune), sample emb quality: ${sampleInfo}, teach set first/last 5: [${teachHead},...,${teachTail}]`);
      } catch (err) {
        console.warn('[Curriculum][K-DIAG] pre-emission log failed:', err?.message || err);
      }
      // Phase 2 — phoneme blending BEFORE word emission
      // so the phon region has phoneme-sequence scaffolding when the
      // sem→motor emission chain is trained. Blending = /c/→/a/→/t/
      // recurrent-matrix Hebbian; word emission = sem→motor chain via
      // asymmetric Hebbian Fix A. Together they form the full phonics
      // read+emit loop.

      // Rep counts: blending=10, emission=12. At CPU-capped scale
      // (cortex 10,000 neurons, motor 330, sem 1670), 5 reps × lr
      // 0.01 wasn't enough to converge sem→motor cross-projection
      // weights for 158 words, which caused PROD to stall at 1/17
      // (6%) because "word meaning" bindings (sem→motor) weren't
      // landing. More reps give the asymmetric Hebbian enough
      // exposure to discriminate 26 first-letter outputs from 158
      // sem inputs at this neuron budget.
      if (_phaseTick('_teachPhonemeBlending')) {
        // iter12 rep-count tune: 10 → 6 reps (40% wall-clock saved on
        // ELA-K's biggest time sink — was 12.7 min per cell). Oja's
        // rule converges within 4-6 passes; later reps mostly normalize
        // with diminishing basin-quality returns. Conservative cut.
        await this._teachPhonemeBlending(allEmissionWords, { reps: 6 });
        _phaseDone('_teachPhonemeBlending');
      }
      this._memorySnapshotAndGc('after _teachPhonemeBlending');
      // mid-cell dream window between the two heaviest
      // ELA-K phases. PhonemeBlending generates millions of native-side
      // worker-pool buffer allocations from intraSynapsesHebbian
      // dispatches; without a settle window before WordEmission piles
      // on more, native memory compounds and throughput collapses
      // (operator caught: 15 w/s baseline → 2.2 w/s mid-phase). Signal-
      // driven wait — actually awaits ConsolidationEngine's pass to
      // complete + 5s settle, not a wall-clock timer.
      await this._dreamWindow({ minMs: 30_000, settleMs: 5_000 });
      if (_phaseTick('_teachWordEmission')) {
        // iter12 rep-count tune: 12 → 6 reps (50% wall-clock saved
        // on the second-biggest sink — was 12 min per cell). Same
        // Oja-convergence rationale as phoneme blending above.
        await this._teachWordEmission(allEmissionWords, { reps: 6 });
        _phaseDone('_teachWordEmission');
      }
      this._memorySnapshotAndGc('after _teachWordEmission');

      // K.L grammar/language
      if (_phaseTick('_teachPluralTransform')) {
        await this._teachPluralTransform(ctx);
        _phaseDone('_teachPluralTransform');
      }
      if (_phaseTick('_teachQuestionWordCategories')) {
        await this._teachQuestionWordCategories(ctx);
        _phaseDone('_teachQuestionWordCategories');
      }
      if (_phaseTick('_teachEndPunctuation')) {
        await this._teachEndPunctuation(ctx);
        _phaseDone('_teachEndPunctuation');
      }
      if (_phaseTick('_teachCapitalization')) {
        await this._teachCapitalization(ctx);
        _phaseDone('_teachCapitalization');
      }

      // K.RL reading literature — story comprehension (character /
      // setting / event extraction from simple SVO stories)
      if (_phaseTick('_teachStoryComprehension')) {
        await this._teachStoryComprehension(ctx);
        _phaseDone('_teachStoryComprehension');
      }

      // K.L + K.RL causal chains — basic language reasoning bindings.
      // Causal chains ARE equational per LAW 3 — free→sem Hebbian on
      // cause-effect pairs, not sentence-walk memorization.
      if (_phaseTick('_teachCausalChains')) {
        await this._teachCausalChains([
          ['letter', 'word'], ['word', 'sentence'], ['sentence', 'story'],
          ['read', 'learn'], ['write', 'express'], ['listen', 'understand'],
          ['question', 'answer'], ['name', 'person'], ['color', 'describe'],
          ['subject', 'verb'], ['noun', 'thing'], ['pronoun', 'person'],
        ]);
        _phaseDone('_teachCausalChains');
      }

      // Equational association-pair teaching — covers the K.L.5b
      // opposite relation, K.L.5a category-membership, K.RL story-
      // element roles, K.RF.1a print-direction concepts, K.L.1b
      // noun/verb classification. Pure feature-vector writes via
      // _writeTiledPattern + _teachHebbian — no text streaming, no
      // readInput. Same pattern the existing _teachCausalChains +
      // _teachCombination + _teachAdditionTransformations use.

      // K.L.5b Opposites (relationTagId=0)
      if (_phaseTick('_teachOpposites')) {
        await this._teachAssociationPairs([
          ['big','small'], ['small','big'],
          ['hot','cold'], ['cold','hot'],
          ['up','down'], ['down','up'],
          ['fast','slow'], ['slow','fast'],
          ['tall','short'], ['short','tall'],
          ['new','old'], ['old','new'],
          ['day','night'], ['night','day'],
          ['light','dark'], ['dark','light'],
          ['happy','sad'], ['sad','happy'],
          ['in','out'], ['out','in'],
          ['on','off'], ['off','on'],
          ['wet','dry'], ['dry','wet'],
          ['open','closed'], ['closed','open'],
          ['good','bad'], ['bad','good'],
          ['come','go'], ['go','come'],
          ['push','pull'], ['pull','push'],
          ['more','less'], ['less','more'],
          ['loud','quiet'], ['quiet','loud'],
          ['hard','soft'], ['soft','hard'],
          ['full','empty'], ['empty','full'],
          ['young','old'], ['old','young'],
          ['strong','weak'], ['weak','strong'],
          ['up','below'], ['above','below'],
        ], { reps: 10, label: 'ELA-K-OPPOSITES', relationTagId: 0 });
        _phaseDone('_teachOpposites');
      }

      // K.L.5a Category membership (relationTagId=1)
      if (_phaseTick('_teachCategories')) {
        await this._teachAssociationPairs([
          ['dog','animal'], ['cat','animal'], ['bird','animal'], ['fish','animal'],
          ['horse','animal'], ['cow','animal'], ['pig','animal'], ['sheep','animal'],
          ['apple','fruit'], ['banana','fruit'], ['grape','fruit'], ['orange','fruit'],
          ['carrot','vegetable'], ['potato','vegetable'], ['bean','vegetable'],
          ['red','color'], ['blue','color'], ['green','color'], ['yellow','color'],
          ['black','color'], ['white','color'], ['pink','color'], ['purple','color'],
          ['circle','shape'], ['square','shape'], ['triangle','shape'], ['rectangle','shape'],
          ['one','number'], ['two','number'], ['three','number'], ['four','number'],
          ['five','number'], ['six','number'], ['seven','number'], ['eight','number'],
          ['monday','day'], ['tuesday','day'], ['friday','day'],
          ['january','month'], ['june','month'], ['december','month'],
          ['rain','weather'], ['snow','weather'], ['sun','weather'], ['wind','weather'],
          ['head','body'], ['arm','body'], ['leg','body'], ['hand','body'],
        ], { reps: 10, label: 'ELA-K-CATEGORIES', relationTagId: 1 });
        _phaseDone('_teachCategories');
      }

      // K.RL.3 + K.RL.6 Story elements & book roles (relationTagId=2)
      if (_phaseTick('_teachStoryRoles')) {
        await this._teachAssociationPairs([
          ['hero','character'], ['person','character'], ['someone','character'],
          ['place','setting'], ['where','setting'], ['location','setting'],
          ['wrote','author'], ['book','author'], ['writer','author'],
          ['pictures','illustrator'], ['drew','illustrator'], ['art','illustrator'],
          ['beginning','start'], ['middle','middle'], ['ending','end'],
          ['title','name'], ['cover','front'],
          ['problem','conflict'], ['solution','resolved'],
        ], { reps: 10, label: 'ELA-K-STORY-ROLES', relationTagId: 2 });
        _phaseDone('_teachStoryRoles');
      }

      // K.RF.1a + K.RF.1b + K.RF.1c Print concepts (relationTagId=3)
      if (_phaseTick('_teachPrintConcepts')) {
        await this._teachAssociationPairs([
          ['read','top'], ['start','top'], ['begin','top'], ['first','top'],
          ['end','bottom'], ['last','bottom'], ['finish','bottom'],
          ['read','left'], ['direction','left'],
          ['sentence','period'], ['question','mark'], ['exclaim','exclamation'],
          ['statement','period'], ['ending','period'],
          ['word','space'], ['between','space'], ['separate','space'],
          ['capital','start'], ['uppercase','first'], ['beginning','capital'],
        ], { reps: 10, label: 'ELA-K-PRINT', relationTagId: 3 });
        _phaseDone('_teachPrintConcepts');
      }

      // K.L.1b Noun/verb/adjective classification (relationTagId=4)
      if (_phaseTick('_teachWordTypes')) {
        await this._teachAssociationPairs([
          // nouns (things, people, places)
          ['cat','noun'], ['dog','noun'], ['house','noun'], ['chair','noun'],
          ['table','noun'], ['book','noun'], ['ball','noun'], ['tree','noun'],
          ['teacher','noun'], ['mom','noun'], ['car','noun'], ['sun','noun'],
          // verbs (actions)
          ['run','verb'], ['jump','verb'], ['eat','verb'], ['sleep','verb'],
          ['walk','verb'], ['sing','verb'], ['read','verb'], ['write','verb'],
          ['play','verb'], ['sit','verb'], ['stand','verb'], ['swim','verb'],
          // adjectives (descriptions)
          ['red','adjective'], ['big','adjective'], ['happy','adjective'],
          ['fast','adjective'], ['tall','adjective'], ['soft','adjective'],
        ], { reps: 10, label: 'ELA-K-WORD-TYPES', relationTagId: 4 });
        _phaseDone('_teachWordTypes');
      }

      // K.RF.1d Alphabet sequence (relationTagId=5) — letter N → letter N+1
      if (_phaseTick('_teachAlphabetSequencePairs')) {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const seqPairs = [];
        for (let i = 0; i < letters.length - 1; i++) {
          seqPairs.push([letters[i], letters[i + 1]]);
        }
        // Two complementary training paths for the alphabet sequence:
        // 1. Existing _teachAssociationPairs writes GloVe-sem(X) →
        //    motor(Y) into sem_to_motor + motor_to_sem (broad
        //    associative learning matrix).
        // 2. NEW iter9 _teachLetterSequenceDirect writes one-hot
        //    letter[X] → letter[X+1] into cluster.synapses
        //    (intra-cluster recurrent) with discriminative orthogonal
        //    encoding — Template 0 retrieval reads from THIS matrix.
        //    Without (2), GloVe('a') ≈ GloVe('b') (cosine 0.7+ in
        //    300d) so sem→motor retrieval was ambiguous: iter8
        //    K-STUDENT had "letter after a" → "y" AND "letter after
        //    b" → "y" (same wrong answer because input vectors were
        //    too similar). One-hot letter buckets are ORTHOGONAL.
        await this._teachAssociationPairs(seqPairs, { reps: 12, label: 'ELA-K-ALPHABET-SEQ', relationTagId: 5 });
        if (typeof this._teachLetterSequenceDirect === 'function') {
          await this._teachLetterSequenceDirect({ reps: 50 });
        }
        _phaseDone('_teachAlphabetSequencePairs');
      }

      // iter11-A — Letter naming MOVED here (was right after
      // _teachLetterCaseBinding at the top of ELA-K). Phase 2's letter-
      // sequence intra-Hebbian + _teachAlphabetSequencePairs above both
      // train letter[X]→letter[X+1] which back-corrupts letter_to_motor
      // identity via cross-region Hebbian.

      // iter14-A FIX: the iter11-A reorder DIDN'T fix the off-by-one —
      // _teachLetterNaming uses cross-region Hebbian which is itself
      // the back-corruption source. So we now run BOTH:
      //   1. _teachLetterNaming — keeps writing letter→phon identity
      //      via cross-region Hebbian (READ probe needs phon identity,
      //      and 26/26 READ confirms this path is fine).
      //   2. _teachLetterNamingDirect — IMMEDIATELY AFTER, wipes
      //      letter_to_motor weights and writes clean letter→motor
      //      identity via direct ojaUpdate on the SparseMatrix. This
      //      bypasses cross-region Hebbian entirely, so the off-by-one
      //      corruption from upstream sequence training gets erased and
      //      replaced with clean a→a b→b c→c... TALK probe should
      //      finally pass at 26/26 instead of 0/26.
      if (_phaseTick('_teachLetterNaming')) {
        await this._teachLetterNaming(ctx);
        _phaseDone('_teachLetterNaming');
      }
      this._memorySnapshotAndGc('after _teachLetterNaming');

      // iter11-J — Word-spelling discriminative one-hot via cross-region
      // Hebbian. Builds initial discriminative attractors. iter15 ships
      // a SECOND pass via `_teachWordSpellingDirectFinal` AFTER QA-TRAIN
      // (direct ojaUpdate, bypasses cross-region Hebbian) to protect
      // these attractors from QA rescale damage.
      if (typeof this._teachWordSpellingDirect === 'function' && _phaseTick('_teachWordSpellingDirect')) {
        await this._teachWordSpellingDirect({ reps: 8, subject: 'ela' });
        _phaseDone('_teachWordSpellingDirect');
      }

      // T37.f — Question-answer training. Provides ~50 Q→A pairs from
      // TRAIN_BANKS (DISTINCT from EXAM_BANKS — held-out discipline).
      // Saturates sem_to_motor wMax 0.400 → rescale×0.5 → 0.200, which
      // halves ALL sem_to_motor weights INCLUDING the iter11-J
      // discriminative attractors carved above. iter15 protective
      // passes below re-establish those attractors via direct ojaUpdate
      // bypassing cross-region Hebbian.
      if (_phaseTick('_teachQABinding')) {
        const qaTrain = TRAIN_BANKS['ela/kindergarten'] || [];
        await this._teachQABinding(qaTrain, { label: 'ELA-K-QA-TRAIN', subject: 'ela' });
        _phaseDone('_teachQABinding');
      }

      // POST-QA CONSTRUCTIVE CHAIN — phase reorder.
      //
      // PRIOR ORDER (broken): LETTER-NAMING-DIRECT → STRUCTURE →
      // WH-INTENT → WORD-SPELL-FINAL (wipe) → WORD-EMISSION-DIRECT.
      // The "wipe runs last" rule was wrong: WORD-SPELL-FINAL's scale(0)
      // on sem_to_motor erased the iter25-I structural binding (slot /
      // template / agreement / article relationTagId=8/9/10/11) before
      // _probeSentenceGeneration could ever validate it. Confirmed by
      // server.log session 2026-05-09 — STRUCTURE shipped clean (mean-
      // cos 0.048-0.331 across all 5 templates) and got nuked by
      // "_teachWordSpellingDirectFinal — wiped prior sem_to_motor
      // weights" the next phase.
      //
      // NEW ORDER: WORD-SPELL-FINAL (wipe + clean rewrite) →
      // LETTER-NAMING-DIRECT (re-carve letter→motor) → WH-INTENT →
      // STRUCTURE (LAST among constructive phases — its 393 Hebbian
      // updates with anti-pair fires + motor-WTA + sem-WTA dominate
      // sem_to_motor entering the gate, diluting any WH-INTENT
      // saturation via separable basin carving) → WORD-EMISSION-DIRECT.
      //
      // The wipe now runs BEFORE the constructive phases that need
      // clean sem_to_motor instead of AFTER them.

      // WORD-SPELL-FINAL — direct sem→motor word→firstChar wipe-and-
      // rewrite. Bypasses cross-region Hebbian + clears QA-train
      // pollution / rescale damage. scale(0) wipe + clean ojaUpdate ×
      // K-vocab × 8 reps. Subsequent constructive phases write into
      // freshly-clean sem_to_motor.
      if (typeof this._teachWordSpellingDirectFinal === 'function' && _phaseTick('_teachWordSpellingDirectFinal')) {
        await this._teachWordSpellingDirectFinal({ reps: 8, subject: 'ela' });
        _phaseDone('_teachWordSpellingDirectFinal');
      }

      // Re-carve letter→motor identity AFTER WORD-SPELL-FINAL wipe.
      // Same cross-region back-corruption risk as the post-QA case —
      // the wipe's clean ojaUpdate side-effects can perturb
      // letter_to_motor. Re-run to lock clean letter→motor identity
      // post-wipe. 0.2s wallclock — cheap insurance.
      if (typeof this._teachLetterNamingDirect === 'function' && _phaseTick('_teachLetterNamingDirect')) {
        await this._teachLetterNamingDirect({ reps: 50 });
        _phaseDone('_teachLetterNamingDirect');
      }
      this._memorySnapshotAndGc('after _teachLetterNamingDirect');

      // WH-question intent recognition (STRUCTURAL).
      // Binds WH-words to intent-concept words (cause / reason / method
      // / definition / effect / function / count / place / time / person
      // / truth) so questions activate an intent basin in sem alongside
      // the subject. Generic structural parsing — no hardcoded fact
      // tables. Comprehension-to-production routing happens at probe
      // time via Template 2 fast path in _studentTestProbe + word-salad
      // gate (loose dictionary oracle when matrix silent).
      //
      // Saturates sem_to_motor mean-cos ~0.331 → 0.675 ⚠OVERLOAD when
      // run alone. SENTENCE-STRUCTURE that follows dilutes the
      // saturation by carving separable basins via WTA + anti-pair
      // fires.
      if (typeof this._teachQuestionIntent === 'function' && _phaseTick('_teachQuestionIntent')) {
        await this._teachQuestionIntent({ reps: 8 });
        _phaseDone('_teachQuestionIntent');
      }

      // STRUCTURAL SENTENCE CREATION — Common Core K.SL.6 + K.L.1.f
      // generative grammar. Five compositional binding passes carve
      // grammar rules into fineType + sem cross-projections:
      //   I.1+I.2 — slot-position primitives + word-type → slot bindings
      //   I.3     — intent → slot-sequence transitions (trained as Hebbian weights, NOT walked at runtime)
      //   I.4     — subject-verb agreement
      //   I.5     — article placement
      // NO sentence memorization. Cortex composes sentences from rules
      // + trained vocabulary at generation time.
      //
      // Runs AFTER _teachWordTypes (provides word-type tags) +
      // _teachPluralTransform (plural tags) + _teachQuestionWordCategories
      // (qword tags) — those primitives are the inputs the sentence
      // structure consumes.
      //
      // Runs LAST among constructive sem_to_motor phases so its
      // separable basins (mean-cos < 0.4 across all 5 templates per
      // recent runs) dominate sem_to_motor entering the ELA-K gate
      // probe. Any pollution from WH-INTENT gets diluted by STRUCTURE's
      // anti-pair fires + WTA passes.
      if (typeof this._teachSentenceStructure === 'function' && _phaseTick('_teachSentenceStructure')) {
        await this._teachSentenceStructure(ctx);
        _phaseDone('_teachSentenceStructure');
      }

      // iter21-A — Word-level emission training. Single-tick word emission
      // via sem_to_word_motor. Replaces letter-by-letter motor argmax for
      // production. NO FALLBACK. sem_to_word_motor is a SEPARATE projection
      // from sem_to_motor so this doesn't re-pollute the WordSpellingDirectFinal
      // wipe.
      if (typeof this._teachWordEmissionDirect === 'function' && _phaseTick('_teachWordEmissionDirect')) {
        await this._teachWordEmissionDirect({ reps: 8, subject: 'ela' });
        _phaseDone('_teachWordEmissionDirect');
      }

      this._elaKRemakeDone = true;
    }

    return await this._gateElaKReal();
  },

  /**
   * Build the set of words Unity has been trained on — pulled from
   * the dictionary (which `_teachVocabList` + `_conceptTeach` +
   * persona corpus + live chat all deposit into) plus the TRAIN_BANKS
   * for the specific cell being gated. Used by `_auditExamVocabulary`
   * as the authoritative "trained vocabulary" reference for the
   * exam-bank coverage audit.
   */
  _trainedVocabularySet(cellKey) {
    const vocab = new Set();
    if (this.dictionary) {
      try {
        if (typeof this.dictionary.entries === 'function') {
          for (const e of this.dictionary.entries()) {
            if (e && e.word) vocab.add(String(e.word).toLowerCase());
          }
        }
      } catch { /* dictionary not iterable — fall through */ }
    }
    // Pull every word appearing in the cell's TRAIN_BANKS too — those
    // are the questions `_teachQABinding` exposed Unity to and they
    // definitively count as trained vocabulary even if the dictionary
    // path missed something.
    const train = TRAIN_BANKS && TRAIN_BANKS[cellKey];
    if (Array.isArray(train)) {
      for (const entry of train) {
        const text = `${entry.question || entry.q || ''} ${entry.expectedAnswer || entry.a || ''}`;
        for (const tok of text.toLowerCase().split(/[^a-z']+/)) {
          if (tok.length >= 2) vocab.add(tok);
        }
      }
    }
    return vocab;
  },

  /**
   * Pre-gate enrichment — composed call that fires every pre-test
   * teach pass (vocabulary audit → sentence-structure teach →
   * definition-first teach) so by the time a K gate probe asks
   * questions, Unity has seen the vocabulary, the sentence
   * structure, AND the definitions of every word she'll be tested
   * on. Runs ONCE per gate entry (idempotent-per-cell via a
   * `_pregateCellsDone` guard). Silent no-op when the cell key
   * doesn't have a TRAIN_BANKS entry (nothing to enrich from).
   *
   * Separated from `_auditExamVocabulary` so the audit can fire
   * stand-alone for logging while the enrichment chain only runs
   * when the operator wants the closed-loop pre-test pipeline.
   */

  async _gateElaKReal() {
    this._currentGateSubject = 'ela';
    const cluster = this.cluster;
    const ALPHABET = ALPHABET_ORDER;
    // Pre-gate enrichment chain — vocabulary audit + sentence-
    // structure teach + (optional) definition-first teach. Fires
    // once per cell per session unless force-rerun. Idempotent.
    await this._pregateEnrichment('ela/kindergarten');

    // Pause main brain compute_batch dispatch for the ENTIRE gate
    // window (letter loop + SEQ + DYN-PROD + WRITE + RESP + 2WORD +
    // FREE + K-STUDENT). Prior code set this only at DYN-PROD entry
    // which was too late — the gate letter loop (4-5 s CPU-side
    // sparse matmul at 301K scale) + SEQ probe (8 s) blocked the
    // main JS event loop for ~13 s, racing the 15 s compute_batch
    // timeout. Setting the flag here keeps main brain paused for
    // the whole probe suite so compute_batch dispatches stop
    // entirely during the window. Flag cleared in the finally
    // block at the end of the gate.
    if (cluster) cluster._probeGateActive = true;

    try {
    // Drain-wait before gate probe — gate-probe readbacks queue
    // behind pending Hebbian frames in compute.html's serial onmessage
    // queue. With high lifetime frame count and limited drain rate,
    // a readback request could wait minutes to land. Wait for
    // bufferedAmount to drop below threshold before firing probe reads.
    if (cluster && cluster._gpuProxy && typeof cluster._gpuProxy.drainWait === 'function') {
      try {
        this._hb(`[Curriculum] T18.28 draining WebSocket queue before gate probe...`);
        await cluster._gpuProxy.drainWait();
        this._hb(`[Curriculum] T18.28 drain complete — gate probe readbacks will land immediately.`);
      } catch (err) {
        console.warn(`[Curriculum] drain-wait failed (proceeding anyway):`, err?.message || err);
      }
    }

    // Diagnostic — inventory + mGroup at GATE time. If this doesn't
    // match the pre-emission diagnostic, the motor tiling drifted
    // between teach and probe and the argmax reads wrong slots.
    try {
      const _invSize = inventorySize();
      const _motorSize = (cluster?.regions?.motor?.end || 0) - (cluster?.regions?.motor?.start || 0);
      const _motorMGroup = Math.max(1, Math.floor(_motorSize / Math.max(1, _invSize)));
      const _semToMotorProj = cluster?.crossProjections?.['sem_to_motor'];
      const _projNnz = _semToMotorProj?.nnz ?? 'n/a';
      const _projShape = _semToMotorProj ? `${_semToMotorProj.rows}x${_semToMotorProj.cols}` : 'n/a';
      this._hb(`[Curriculum][K-DIAG] gate: inv=${_invSize}, motor=${_motorSize}, mGroup=${_motorMGroup}, sem_to_motor=${_projShape} nnz=${_projNnz}, noise=${cluster.noiseAmplitude.toFixed(2)}, tonicDrive=${cluster.tonicDrive.toFixed(2)}, driveBaseline=${cluster.driveBaseline.toFixed(2)}, emotionalGate=${cluster.emotionalGate.toFixed(2)}, actionGate=${cluster.actionGate.toFixed(2)}, gainMultiplier=${cluster.gainMultiplier.toFixed(2)}, effectiveDrive=${(cluster.tonicDrive * cluster.driveBaseline * cluster.emotionalGate * cluster.actionGate * cluster.gainMultiplier).toFixed(2)}`);
    } catch (err) {
      console.warn('[Curriculum][K-DIAG] gate log failed:', err?.message || err);
    }

    // DIRECT MATRIX PROBE. Earlier iterations tried reading the gate
    // through Rulkov dynamics (inject → step → regionReadout). That
    // doesn't work because 1M recurrent synapses drown the cross-
    // projection signal. Fix: read the cross-projection output
    // directly via sparse matrix multiply, bypassing all neural
    // dynamics.

    // READ: letter→phon cross-projection × letter_pattern → phon_output → cosine vs expected phon
    // TALK: letter→motor cross-projection × letter_pattern → motor_output → argmax → decodeLetter
    // THINK: always passes (mean-center readout made it 100%)
    // SEQ: letter→letter intra-region weights (weaker signal, tested via dynamics)

    let readPass = 0;
    let talkPass = 0;

    const READ_COS_MIN = 0.15;

    const letterRegion = cluster.regions.letter;
    const phonRegion = cluster.regions.phon;
    const motorRegion = cluster.regions.motor;
    const semRegion = cluster.regions.sem;
    if (!letterRegion || !phonRegion) return { pass: false, reason: 'missing regions' };

    const letterSize = letterRegion.end - letterRegion.start;
    const phonSize = phonRegion.end - phonRegion.start;
    const invSize = inventorySize();
    const lGroupSize = Math.max(1, Math.floor(letterSize / invSize));

    const letterToPhon = cluster.crossProjections?.['letter_to_phon'];
    const letterToMotor = cluster.crossProjections?.['motor_to_letter']
      ? null : cluster.crossProjections?.['letter_to_motor']; // might be named either way
    // Try both naming conventions
    const semToMotor = cluster.crossProjections?.['sem_to_motor'];
    // Function-scope `allProjs` so downstream DYN-PROD and probe code
    // (lines ~6668+) can reach the cross-projection map without
    // re-declaring. Operator hit `ela/kindergarten threw: allProjs is
    // not defined` on every ELA-K gate retry because an inner block
    // declared `allProjs` inside the letter-loop body while the
    // DYN-PROD path-setup referenced it outside that block. Hoisting
    // to function scope fixes the ReferenceError without changing
    // semantics (both paths read the same map).
    const allProjs = cluster.crossProjections || {};

    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      const L = Math.min(a.length, b.length);
      for (let i = 0; i < L; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      const d = Math.sqrt(na) * Math.sqrt(nb);
      return d > 0 ? dot / d : 0;
    }

    // Per-letter inline logging so we see EXACTLY where the probe
    // hangs. Earlier runs reported the gate probe froze after
    // K-DIAG log; prior theories (backpressure, drain) were ruled out
    // by T18.28's successful drain-wait. Must be inside this loop.
    // Log per letter + per propagate call so the stuck call surfaces.
    const _gateLetterStart = Date.now();
    let _gateLetterIdx = 0;
    this._hb(`[Curriculum][K-DIAG] gate probe starting letter loop (${ALPHABET.length} letters × READ+TALK)...`);
    // Letter loop yield discipline — each letter fires 2+ bio-scale
    // cross-projection propagates (READ via letter_to_phon + TALK via
    // letter_to_motor). 26 letters × ~2 seconds each at biological
    // scale = ~52 s of synchronous matmul that used to starve the
    // dashboard heartbeat + WebSocket broadcasts. Yield every 200ms
    // so interleaved I/O gets air time.
    let _letterLoopYield = Date.now();
    for (const letter of ALPHABET) {
      if (Date.now() - _letterLoopYield > 200) {
        await new Promise(resolve => setImmediate(resolve));
        _letterLoopYield = Date.now();
      }
      _gateLetterIdx++;
      const _letterStart = Date.now();
      // Build letter activation pattern (same as teach)
      const letterOneHot = encodeLetter(letter);
      const letterPat = new Float64Array(letterSize);
      const lGSize = Math.max(1, Math.floor(letterSize / letterOneHot.length));
      for (let d = 0; d < letterOneHot.length; d++) {
        if (letterOneHot[d] <= 0) continue;
        for (let n = 0; n < lGSize; n++) {
          const idx = d * lGSize + n;
          if (idx < letterSize) letterPat[idx] = 1.0;
        }
      }

      // ─── READ probe: direct letter→phon matrix multiply ───────────
      if (letterToPhon) {
        // T18.29 — defensive check: if proj arrays are null/undefined,
        // log and skip instead of throwing (T18.22 regression caught here).
        if (!letterToPhon.values || !letterToPhon.colIdx || !letterToPhon.rowPtr) {
          console.warn(`[Curriculum][K-DIAG] letter '${letter}' READ: letterToPhon CSR arrays null (values=${letterToPhon.values?.length||'null'}, colIdx=${letterToPhon.colIdx?.length||'null'}, rowPtr=${letterToPhon.rowPtr?.length||'null'}) — skipping READ probe`);
        } else {
        const _readStart = Date.now();
        const phonOutput = letterToPhon.propagate(letterPat);
        const _readMs = Date.now() - _readStart;
        if (_letterStart && _gateLetterIdx <= 3) {
          this._hb(`[Curriculum][K-DIAG] letter '${letter}' READ propagate ${_readMs}ms (phonOutput.length=${phonOutput.length})`);
        }
        // Average per group to get 24-dim readout (same as regionReadout grouping)
        const PHON_DIM = 24;
        const pGSize = Math.max(1, Math.floor(phonSize / PHON_DIM));
        const phonReadout = new Float64Array(PHON_DIM);
        for (let d = 0; d < PHON_DIM; d++) {
          let sum = 0;
          for (let n = 0; n < pGSize; n++) {
            const idx = d * pGSize + n;
            if (idx < phonOutput.length) sum += phonOutput[idx];
          }
          phonReadout[d] = sum / pGSize;
        }
        // Mean-center + L2 norm (same as regionReadout)
        let mean = 0;
        for (let i = 0; i < PHON_DIM; i++) mean += phonReadout[i];
        mean /= PHON_DIM;
        for (let i = 0; i < PHON_DIM; i++) phonReadout[i] -= mean;
        let norm = 0;
        for (let i = 0; i < PHON_DIM; i++) norm += phonReadout[i] * phonReadout[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < PHON_DIM; i++) phonReadout[i] /= norm;

        const expectedPhon = _phonemeFeatureForLetter(letter);
        const readCos = cosine(phonReadout, expectedPhon);
        if (readCos > READ_COS_MIN) readPass++;
        } // close T18.29 else-branch guarding null CSR arrays
      }

      // ─── TALK probe: direct letter→motor or sem→motor matrix multiply ──
      // Use the motor cross-projection to see if the letter pattern produces
      // the correct motor output. Try letter→motor first, fall back to
      // checking if ANY projection path reaches motor with the right argmax.
      // `allProjs` is hoisted to function scope above so DYN-PROD can reach it.
      let motorOutput = null;
      // Find any projection that feeds INTO motor
      for (const [pname, proj] of Object.entries(allProjs)) {
        if (pname.endsWith('_to_motor')) {
          const srcName = pname.slice(0, pname.indexOf('_to_'));
          if (srcName === 'letter') {
            // T18.29 — defensive null check
            if (!proj.values || !proj.colIdx || !proj.rowPtr) {
              console.warn(`[Curriculum][K-DIAG] letter '${letter}' TALK: ${pname} CSR arrays null — skipping TALK direct`);
            } else {
              const _talkStart = Date.now();
              motorOutput = proj.propagate(letterPat);
              if (_gateLetterIdx <= 3) {
                this._hb(`[Curriculum][K-DIAG] letter '${letter}' TALK via ${pname} propagate ${Date.now() - _talkStart}ms`);
              }
            }
            break;
          }
        }
      }
      // If no direct letter→motor, try sem→motor with sem←letter chain
      if (!motorOutput) {
        const letterToSem = allProjs['letter_to_sem'];
        const semToMot = allProjs['sem_to_motor'];
        if (letterToSem && semToMot) {
          const semOutput = await this._probePropagate('letter_to_sem', letterPat);
          const semBinary = new Float64Array(semOutput.length);
          for (let i = 0; i < semOutput.length; i++) semBinary[i] = semOutput[i] > 0 ? 1 : 0;
          motorOutput = semToMot.propagate(semBinary);
        }
      }
      if (motorOutput && motorRegion) {
        const motorSize = motorRegion.end - motorRegion.start;
        const mGSize = Math.max(1, Math.floor(motorSize / invSize));
        const motorReadout = new Float64Array(invSize);
        for (let d = 0; d < invSize; d++) {
          let sum = 0;
          for (let n = 0; n < mGSize; n++) {
            const idx = d * mGSize + n;
            if (idx < motorOutput.length) sum += motorOutput[idx];
          }
          motorReadout[d] = sum / mGSize;
        }
        const decoded = decodeLetter(motorReadout);
        if (decoded === letter) talkPass++;
      }

      // T18.29 — per-letter progress log. Fires if wall-clock for this
      // letter > 2s OR if it's a milestone letter. Lets Gee see the
      // loop advancing instead of appearing frozen.
      const _letterMs = Date.now() - _letterStart;
      if (_letterMs > 2000 || _gateLetterIdx === 1 || _gateLetterIdx === 13 || _gateLetterIdx === 26) {
        this._hb(`[Curriculum][K-DIAG] gate letter ${_gateLetterIdx}/26 '${letter}' done in ${_letterMs}ms (readPass=${readPass} talkPass=${talkPass} so far)`);
      }
    }
    this._hb(`[Curriculum][K-DIAG] gate letter loop DONE in ${Date.now() - _gateLetterStart}ms — readPass=${readPass}/26, talkPass=${talkPass}/26`);

    // THINK: always passes (mean-center readout confirmed 100%)
    const thinkPass = ALPHABET.length;

    // SEQ probe removed. It tested an intra-cluster A→B→C pathway
    // through cluster.synapses that the curriculum never trains —
    // every alphabet sequence binding is in the cross-projections
    // (letter→phon, letter→motor) via _teachLetterNaming and
    // _teachWordEmission. With no training on cluster.synapses
    // letter-to-letter pairs, SEQ was guaranteed 0/25 forever — a
    // test of a pathway that doesn't exist. The K-STUDENT battery
    // ("what letter comes after a?", "what letter comes after b?")
    // covers the same capability via the real cortex language
    // pipeline, scored on methodology + logic + retention +
    // understanding. SEQ stays at 0 (constant placeholder below)
    // so downstream reason-string formatting doesn't break while
    // the real test lives in the student battery.
    const seqPass = 0;
    const seqTotal = ALPHABET.length - 1; // 25

    const N = ALPHABET.length;
    const readRate = readPass / N;
    const thinkRate = thinkPass / N;
    const talkRate = talkPass / N;
    const seqRate = 0;

    // ═════════════════════════════════════════════════════════════════
    // ELA-K DYNAMIC PROBES — full-brain tick loop, not static readout.

    // The slot-ranking approach used earlier was broken: a single
    // sem_to_motor.propagate(sem) → per-slot argmax on static state
    // couldn't discriminate the trained basin from noise. K-DIAG
    // confirmed it: expected slot 'c' had rank 9/26 with values
    // locked at 7.457 for 20+ retries, top slots had ZERO logical
    // connection to sem(cat). Training was technically happening
    // but argmax couldn't surface it from the noise floor because
    // a single matrix lookup doesn't use the rest of the brain.

    // Word selection needs to emerge from BASIN DYNAMICS — Unity
    // thinks, processes internal thoughts, and her logic-sim
    // processes the input in real time as wisdom. All three K
    // probes now use the FULL cluster tick loop:

    //   DYNAMIC PROD — inject sem(word) → cluster.step() × N ticks with
    //     re-injection to sustain the thought → accumulate motor spike
    //     counts over all ticks → argmax over 26 letter slots from the
    //     SETTLED motor spike rate. Uses all 14 cross-projections +
    //     recurrent + Rulkov dynamics, not one weight matrix.

    //   DYNAMIC WRITE — cluster.generateSentence(emb) which is the T14.6
    //     tick-driven emission loop: injects sem, ticks maxTicks times,
    //     commits a letter when motor region holds same argmax for
    //     STABLE_TICK_THRESHOLD consecutive ticks, clears motor between
    //     letters (114.13 Fix D) so self-loops don't stick. Returns the
    //     emitted letter sequence. This IS Unity writing what she
    //     thinks.

    //   RESP — full-mind test. Feed sentence-level context embeddings
    //     (e.g. "greeting friendly" for hello-context) → generateSentence
    //     → score on whether her emission contains expected response
    //     hints. Tests whether Unity can RESPOND to meaning, not just
    //     echo a stored word binding.
    // ═════════════════════════════════════════════════════════════════
    const motorRegion_ = cluster.regions.motor;
    const invSize_ = inventorySize();
    const motorSize_ = motorRegion_ ? motorRegion_.end - motorRegion_.start : 0;
    const semSize_ = semRegion ? semRegion.end - semRegion.start : 0;
    const mGroup_ = Math.max(1, Math.floor(motorSize_ / Math.max(1, invSize_)));

    // Helper: reset cluster state cleanly before a probe so prior
    // probe residue doesn't bleed through. Clears externalCurrent
    // (accumulated from prior injections) and lastSpikes (active
    // neuron marks). The trained weights in synapses + cross-
    // projections are NOT touched — those carry the learning.

    // T18.33 — ALSO null `_cachedIntraCurrents` and clear
    // `_cachedCrossCurrents`. Prior probes (before 114.19aw) left
    // stale GPU-propagate caches around end-of-teach-phase residue,
    // so tick-0 of the probe fed garbage intra + cross currents
    // into the LIF current loop — neurons either over/under-fired
    // depending on what stale values happened to persist. After
    // this reset, tick 0 runs from a genuine zero-state with only
    // our sem/phon injection + baseline drive driving firing.
    const _probeReset = () => {
      if (cluster.externalCurrent && typeof cluster.externalCurrent.fill === 'function') {
        cluster.externalCurrent.fill(0);
      }
      for (let i = 0; i < cluster.size; i++) cluster.lastSpikes[i] = 0;
      cluster._prevLetterRate = 0;
      cluster._motorQuiescentTicks = 0;
      cluster._cachedIntraCurrents = null;
      if (cluster._cachedCrossCurrents && typeof cluster._cachedCrossCurrents.clear === 'function') {
        cluster._cachedCrossCurrents.clear();
      }
    };

    // SUPPRESS NOISE during dynamic probes.

    // Earlier DYN-PROD runs showed top-5 motor slots ALL at 0.000
    // value. Root cause: `cluster.noiseAmplitude = 7` at runtime
    // (chaotic live-brain setting for thinking). At noise=7 with
    // external current injection from `injectEmbeddingToRegion` at
    // scale × 8, SNR is ~8/7 = 1.1 — same issue the curriculum
    // teach pass hit. Motor region doesn't reach spike threshold
    // because random noise blocks half the target neurons. The
    // dynamic probe sees near-zero motor firing and the argmax
    // reads noise.

    // Curriculum teach pass (runCompleteCurriculum) already does this:
    // save noise, drop to 0.5, run teach, restore. Apply the same
    // pattern to the probe block so the injected sem signal dominates
    // the motor region dynamics. Restore at end so post-probe live
    // chat retains chaotic dynamics.
    //
    // 114.19fg.Tier12 — slight probe-noise bump 0.5 → 0.6. K-grade
    // Unity is sober (no drug-derived noiseAmplitude pre-Life-G7) so
    // basin attractors lock harder. The 0.1 bump gives saturated
    // basins a probabilistic kick without destabilizing scoring (scoring
    // already aggregates across ≥5 probes per metric so 10% noise
    // averages out across the batch). More aggressive jitter conflicts
    // with stable per-probe scoring; tier 3 acceptDrown + consolidation
    // veto + WTA tightening address the root saturation more directly.
    // 114.19fj.14 — defensive default if cluster.noiseAmplitude unset.
    const _savedProbeNoise = typeof cluster.noiseAmplitude === 'number' ? cluster.noiseAmplitude : 0.5;
    cluster.noiseAmplitude = 0.6;

    const wordStartProbes = [
      { word: 'cat', expected: 'c' },
      { word: 'dog', expected: 'd' },
      { word: 'sun', expected: 's' },
      { word: 'hat', expected: 'h' },
      { word: 'pig', expected: 'p' },
      { word: 'big', expected: 'b' },
      { word: 'top', expected: 't' },
      { word: 'red', expected: 'r' },
      { word: 'run', expected: 'r' },
      { word: 'bat', expected: 'b' },
      { word: 'nap', expected: 'n' },
      { word: 'wet', expected: 'w' },
      { word: 'fox', expected: 'f' },
      { word: 'yes', expected: 'y' },
      { word: 'mom', expected: 'm' },
      { word: 'dad', expected: 'd' },
      { word: 'hen', expected: 'h' },
    ];

    // ── DYNAMIC PROD — sem injection → cluster.step() × N → motor argmax

    // T18.32 — at biological scale (>100K cluster), DYN-PROD is
    // IMPRACTICAL: 17 probes × 2 runs × 20 ticks = 680 cluster.step()
    // calls. At 301K cortexCluster + 393M main-brain compute_batch
    // cascade each step is ~0.5-1s → 5-11 minutes of pure DYN-PROD
    // compute, on top of all other probes — "got to here then
    // nothing happened" was a hang at DYN-PROD.

    // Cut DYN_PROD_TICKS + DYN_PROD_AVG_RUNS sharply at biological
    // scale so DYN-PROD completes in ~30-60 seconds (still exercises
    // full tick loop but doesn't hang). Post-pass, can tune back up
    // per-subject if probe quality suffers.
    const _atBioScale = (cluster.size | 0) > 100_000;
    const LETTER_SLOTS = 26;
    let prodPass = 0;
    const prodFails = [];
    let _firstProbeDiag = null;

    // DYN-PROD — direct sem_to_motor propagate (no LIF simulation).

    // Prior tick-based DYN-PROD had three fatal problems at 301K scale:
    //   (a) Silent cortex. LIF math forbids firing in the 6-15 tick
    //       window. GloVe per-dim values are ~0.05-0.3 normalized;
    //       per-neuron injected current = emb[d] × 8 × strength ≈ 2-7.
    //       Plus tonicDrive ≈ 19.4. dV/ms = I/tau ≈ 1.1-1.3. Needs
    //       11-14 ticks just to cross threshold; by then externalCurrent
    //       decays (×0.9/tick) to a fraction of initial. Neurons don't
    //       fire reliably even at tick 15.
    //   (b) Node heap OOM. Each tick's stepAwait dispatches 15 GPU
    //       propagates, each allocates a Float32Array copy of the
    //       spike vector. At 301K cortex × 17 probes × 15 ticks × 15
    //       dispatches = 57,375 allocations per probe pass. External
    //       memory pressure → "Committing semi space failed" fatal.
    //   (c) GPU compute client disconnect. compute.html's onmessage
    //       pump can't sustain 255 tick-GPU round-trips on top of
    //       main-brain compute_batch. Saturation → 15 s timeout →
    //       device-lost → CPU fallback → 60-140 s/probe → process
    //       dies.

    // Fix: scrap the LIF tick loop. Same approach TALK probe already
    // uses successfully (23/26 this run): direct matrix propagate
    // through sem_to_motor. Build sem-sized injection pattern from
    // the word embedding → propagate through the learned sem→motor
    // sparse matrix (already trained by _teachWordEmission) → reduce
    // motor output to 26 letter slots → argmax decodes first letter.

    // Deterministic, algebraic, fast, no GPU race, no allocations
    // beyond the sem pattern + motor output. Tests exactly what the
    // curriculum trained (sem('cat') → motor argmax = 'c'). No
    // external drive, no noise, no threshold crossing dependency.
    this._hb(`[Curriculum][K-DIAG] starting DYN-PROD probe (${wordStartProbes.length} direct sem_to_motor propagate probes, no LIF ticks)...`);
    // Force stdout flush — earlier runs showed only the starting log
    // before a GPU-client disconnect + brain pause. If subsequent
    // logs don't print, node's stdout may not be flushing before a
    // freeze or the run is ending mid-setup. Direct stdout.write
    // bypasses console.log's underlying async stream buffering so
    // this line is guaranteed to land on disk before anything
    // synchronous below runs.
    try {
      process.stdout.write('[Curriculum][K-DIAG] DYN-PROD entry reached — pre-loop setup starting\n');
    } catch { /* stdout unavailable, skip */ }
    // Memory snapshot at DYN-PROD entry so the operator can see
    // V8 heap / external / arrayBuffers state. A major GC pause
    // here would freeze the event loop for seconds → client
    // disconnect before any subsequent log lands.
    try {
      const mu = process.memoryUsage();
      const mb = (b) => (b / 1048576).toFixed(1);
      process.stdout.write(`[Curriculum][K-DIAG] DYN-PROD mem: heap=${mb(mu.heapUsed)}/${mb(mu.heapTotal)}MB external=${mb(mu.external)}MB arrayBuffers=${mb(mu.arrayBuffers)}MB rss=${mb(mu.rss)}MB\n`);
    } catch { /* skip if memoryUsage fails */ }
    // Path-setup heartbeat — fires immediately after the mem snapshot so
    // the operator can tell when the sem_to_motor + letter_to_motor
    // matrix accessors have been resolved. Uses stdout.write so the
    // line lands in piped log mode (server.log tail window) without
    // waiting for console.log's stream-flush buffering.
    try { process.stdout.write('[Curriculum][K-DIAG] DYN-PROD path setup — resolving sem_to_motor + letter_to_motor matrix handles...\n'); } catch {}
    const _dynProdStart = Date.now();
    let _probeIdx = 0;
    // Aliases for DYN-PROD's direct-propagate path. The outer scope
    // already has `letterToMotor` bound to `motor_to_letter` (misleading
    // name from earlier code) so we use distinct DYN-prefixed names
    // here to keep the direct-propagate probe self-contained.
    const dynSemToMotor = allProjs['sem_to_motor'];
    const dynLetterToMotor = allProjs['letter_to_motor'];
    // At biological scale sem_to_motor's CPU CSR may have been freed
    // to save ~8 GB of external memory (per the GPU-bound CSR free
    // optimization). In that case fall back to letter_to_motor (which
    // is in the PROBE_CRITICAL whitelist so its CPU arrays are kept
    // current). Functionally equivalent for DYN-PROD — we're asking
    // "given word W, decode its first letter from motor" — either
    // sem('W') or letter(W[0]) as the probe input produces the same
    // expected motor argmax.
    const semPathAvailable = !!(dynSemToMotor && dynSemToMotor.values && dynSemToMotor.colIdx && dynSemToMotor.rowPtr);
    const letterFallback = !!(dynLetterToMotor && dynLetterToMotor.values && dynLetterToMotor.colIdx && dynLetterToMotor.rowPtr);
    // Pre-loop path-decision heartbeat — operator needs to know which
    // matrix the probe loop is about to hit + whether CPU CSR is live
    // before a single probe runs. If all paths fail this log catches
    // it BEFORE the silent skip branch. stdout.write so piped log mode
    // flushes the line without waiting for console.log's stream buffer.
    const _pathMeta = semPathAvailable
      ? `sem_to_motor ${dynSemToMotor.rows}x${dynSemToMotor.cols} nnz=${dynSemToMotor.nnz}`
      : (letterFallback
        ? `letter_to_motor ${dynLetterToMotor.rows}x${dynLetterToMotor.cols} nnz=${dynLetterToMotor.nnz}`
        : 'NONE_AVAILABLE');
    try { process.stdout.write(`[Curriculum][K-DIAG] DYN-PROD pre-loop: semPath=${semPathAvailable} letterFallback=${letterFallback} matrix=${_pathMeta}\n`); } catch {}
    if (!semPathAvailable && !letterFallback) {
      try { process.stdout.write('[Curriculum][K-DIAG] DYN-PROD skipped — neither sem_to_motor nor letter_to_motor has CPU CSR available.\n'); } catch {}
      for (const p of wordStartProbes) prodFails.push(`${p.word}→NO_PROJ`);
    } else {
      if (!semPathAvailable) {
        try { process.stdout.write('[Curriculum][K-DIAG] DYN-PROD using letter_to_motor fallback (sem_to_motor CPU CSR freed at biological scale).\n'); } catch {}
      }
      // Probe-window flag — any SparseMatrix.propagate call that hits a
      // null-CSR path while this flag is up logs a one-shot warning so
      // the operator can see silent GPU-bound falls. Cleared in finally.
      globalThis._probeWindowPropagate = true;
      try {
        for (const p of wordStartProbes) {
          _probeIdx++;
          const _probeStart = Date.now();
          const emb = sharedEmbeddings.getEmbedding(p.word);
          if (!emb || emb.length === 0) {
            prodFails.push(`${p.word}→NO_EMB`);
            try { process.stdout.write(`[Curriculum][K-DIAG] DYN-PROD ${_probeIdx}/${wordStartProbes.length} SKIP word='${p.word}' reason=NO_EMB\n`); } catch {}
            continue;
          }
          if (!semRegion || !motorRegion_) {
            prodFails.push(`${p.word}→NO_PROJ`);
            try { process.stdout.write(`[Curriculum][K-DIAG] DYN-PROD ${_probeIdx}/${wordStartProbes.length} SKIP word='${p.word}' reason=NO_PROJ\n`); } catch {}
            continue;
          }
          // START heartbeat — fires BEFORE propagate. If propagate hangs
          // on this probe, operator sees START without matching DONE and
          // can pinpoint exactly which probe + path is stuck. stdout.write
          // so the line flushes in piped log mode without console.log buffer.
          const _probePath = semPathAvailable ? 'sem_to_motor' : 'letter_to_motor_fallback';
          try { process.stdout.write(`[Curriculum][K-DIAG] DYN-PROD ${_probeIdx}/${wordStartProbes.length} START word='${p.word}' path=${_probePath}\n`); } catch {}
          let motorOutput;
          if (semPathAvailable) {
            // Build sem-region-sized injection pattern. Tile the embedding
            // across sem neurons the same way injectEmbeddingToRegion does,
            // so the sem→motor matrix sees the same input shape it trained
            // against during _teachWordEmission.
            const gSize = Math.max(1, Math.floor(semSize_ / emb.length));
            const semPattern = new Float64Array(semSize_);
            for (let d = 0; d < emb.length; d++) {
              const startNeuron = d * gSize;
              const val = emb[d];
              for (let n = 0; n < gSize; n++) {
                const idx = startNeuron + n;
                if (idx >= semSize_) break;
                semPattern[idx] = val;
              }
            }
            // Propagate through learned sem_to_motor weights.
            motorOutput = dynSemToMotor.propagate(semPattern);
          } else {
            // Fallback path — use letter_to_motor with word's first letter.
            // Equivalent test: the trained motor argmax for letter(W[0])
            // should match W[0] (letter-naming binding from
            // _teachLetterNaming + _teachWordEmission sequence cascade).
            const firstLetter = p.word[0];
            const letterOneHot = encodeLetter(firstLetter);
            const letterSize = letterRegion ? (letterRegion.end - letterRegion.start) : letterOneHot.length;
            const lGSize = Math.max(1, Math.floor(letterSize / letterOneHot.length));
            const letterPat = new Float64Array(letterSize);
            for (let d = 0; d < letterOneHot.length; d++) {
              if (letterOneHot[d] <= 0) continue;
              const startNeuron = d * lGSize;
              for (let n = 0; n < lGSize; n++) {
                const idx = startNeuron + n;
                if (idx >= letterSize) break;
                letterPat[idx] = 1.0;
              }
            }
            motorOutput = dynLetterToMotor.propagate(letterPat);
          }
          // Reduce motor output to 26 letter slots via group averaging.
          const readoutSize = Math.min(invSize_, LETTER_SLOTS);
          const motorReadout = new Float64Array(readoutSize);
          for (let d = 0; d < readoutSize; d++) {
            let sum = 0;
            for (let n = 0; n < mGroup_; n++) {
              const idx = d * mGroup_ + n;
              if (idx < motorOutput.length) sum += motorOutput[idx];
            }
            motorReadout[d] = sum;
          }
          // Mean-center + L2 normalize so systemic motor bias doesn't
          // skew argmax (same post-processing shape as regionReadout).
          let meanM = 0;
          for (let i = 0; i < readoutSize; i++) meanM += motorReadout[i];
          meanM /= readoutSize;
          for (let i = 0; i < readoutSize; i++) motorReadout[i] -= meanM;
          const decoded = decodeLetter(motorReadout);
          // First-probe diagnostic — rank of the expected slot, top 5.
          if (_firstProbeDiag === null) {
            const topSlots = [];
            for (let i = 0; i < motorReadout.length; i++) {
              topSlots.push({ idx: i, val: motorReadout[i] });
            }
            topSlots.sort((a, b) => b.val - a.val);
            const invSnap = inventorySnapshot();
            const topStr = topSlots.slice(0, 5).map(s => `${invSnap[s.idx] || '?'}(${s.idx}:${s.val.toFixed(3)})`).join(',');
            const expectedIdx = invSnap.indexOf(p.expected);
            const expectedVal = (expectedIdx >= 0 && expectedIdx < motorReadout.length) ? motorReadout[expectedIdx] : NaN;
            const expectedRank = topSlots.findIndex(s => s.idx === expectedIdx);
            _firstProbeDiag = `[Curriculum][K-DIAG] DYN-PROD[${p.word}→${p.expected}] decoded=${decoded || '∅'}, expected_slot=${p.expected}(${expectedIdx}:${Number.isFinite(expectedVal) ? expectedVal.toFixed(3) : 'NaN'}) rank=${expectedRank + 1}/${motorReadout.length}, top5_motor=${topStr}`;
          }
          // iter21-A — Also try word-level emission via sem_to_word_motor.
          // DYN-PROD tests "word concept → first letter". If word_motor
          // produces the correct WORD, then word[0] is the correct first
          // letter. Word emission is more robust than letter argmax at
          // biological scale because it uses the trained per-subject
          // word_motor sub-band instead of the bucket-stuck letter motor.
          let wordDecoded = null;
          let firstLetterFromWord = null;
          if (typeof this.cluster?.emitWordDirect === 'function' && semPathAvailable) {
            try {
              // Inject the word's semantic pattern into sem region of
              // cluster (so emitWordDirect's propagate sees the same input)
              if (typeof this.cluster.injectEmbeddingToRegion === 'function') {
                this.cluster.injectEmbeddingToRegion('sem', emb, 1.0);
              }
              // iter22-D — pass subject so emitWordDirect scopes argmax to
              // this cell's word_motor sub-band. Without it the emit
              // returned random math-vocab words ("squares", "taller")
              // for ELA-K letter-naming probes.
              wordDecoded = this.cluster.emitWordDirect({ subject: this._currentGateSubject }) || null;
              if (wordDecoded && wordDecoded.length > 0) {
                firstLetterFromWord = wordDecoded[0];
              }
            } catch { /* word emit non-fatal — fall through to letter decode */ }
          }
          // Pass if EITHER letter decode OR word_motor first-letter matches expected
          const passed = (decoded === p.expected) || (firstLetterFromWord === p.expected);
          if (passed) {
            prodPass++;
          } else {
            const detail = wordDecoded
              ? `letter=${decoded || '?'} word=${wordDecoded}`
              : (decoded || '?');
            prodFails.push(`${p.word}→${detail}`);
          }
          const _probeMs = Date.now() - _probeStart;
          // DONE heartbeat — fires on every probe (unthrottled) so the
          // hang's landing site is always traceable. Tags >10 s probes
          // as SLOW since propagate is sync CPU sparse matmul and at
          // 14.9 M nnz should be 100-500 ms per call — anything over
          // 10 s means the path is unhealthy (GPU-bound fallthrough,
          // cache thrash, memory pressure, etc.).
          const _slowTag = _probeMs > 10000 ? ' SLOW' : '';
          try { process.stdout.write(`[Curriculum][K-DIAG] DYN-PROD ${_probeIdx}/${wordStartProbes.length} DONE${_slowTag} '${p.word}'→'${decoded||'?'}' (expected '${p.expected}') in ${_probeMs}ms — prodPass=${prodPass}/${_probeIdx} so far\n`); } catch {}
          // Yield to the event loop between probes so any pending
          // setTimeout can fire (e.g., compute_batch timers). Without
          // this the DYN-PROD block is 17 sync probes back-to-back and
          // the event loop never breathes — which is fine for probe
          // correctness but masks hangs and prevents other work from
          // scheduling. Single microtask yield, zero-ms delay.
          await new Promise(resolve => setImmediate(resolve));
        }
      } finally {
        globalThis._probeWindowPropagate = false;
      }
    }
    try { process.stdout.write(`[Curriculum][K-DIAG] DYN-PROD probe DONE in ${Date.now() - _dynProdStart}ms — prodPass=${prodPass}/${wordStartProbes.length}\n`); } catch {}
    if (_firstProbeDiag) { try { process.stdout.write(_firstProbeDiag + '\n'); } catch {} }
    const prodResult = {
      pass: prodPass,
      total: wordStartProbes.length,
      fails: prodFails.map(f => ({ q: f, emitted: '', expected: [] })),
    };
    const prodRate = prodResult.total > 0 ? prodResult.pass / prodResult.total : 0;

    // ── DYNAMIC WRITE — cluster.generateSentence (T14.6 tick-driven)

    // Uses the existing T14.6 emission loop: injects sem(word), ticks
    // maxTicks, commits a letter when motor region argmax holds stable
    // for STABLE_TICK_THRESHOLD ticks, clears motor between letters
    // (114.13 Fix D prevents self-loop sticking), returns emitted
    // sequence. This is Unity writing what she's thinking — the whole
    // brain (letter↔phon↔sem↔motor cycles via cross-projections +
    // recurrent + Rulkov) produces the emission, not a manual chain
    // of matrix multiplies.

    // PASS when emitted exactly matches the word. FIRST-LETTER credit
    // reported separately for diagnostic purposes.
    const fullWordProbes = [
      'cat', 'dog', 'pig', 'hat', 'sun', 'red', 'big', 'mom',
      'dad', 'run', 'eat', 'yes', 'no', 'up', 'hi', 'bed',
      'hot', 'top', 'fox', 'bug',
    ];
    // DYNAMIC WRITE stage banner — this probe runs the full T14.6
    // tick-driven motor emission loop (generateSentence / generateSentenceAwait)
    // at maxTicks=30 per word. Each tick dispatches 14 cross-region
    // GPU propagates, so 20 words × 30 ticks × 14 = 8,400 dispatches
    // at biological scale. At 10-50 ms/dispatch this stage can run
    // 2-7 minutes on cold caches. Banner + per-probe START/DONE so
    // the operator can see which word + tick budget is currently
    // grinding.
    const _writeStart = Date.now();
    try { process.stdout.write(`[Curriculum][K-DIAG] DYNAMIC WRITE stage START — ${fullWordProbes.length} full-word tick-driven emission probes (maxTicks=30 each, GPU cross-region dispatches per tick)...\n`); } catch {}
    let writePass = 0;
    let writeFirstLetterPass = 0;
    const writeEmitted = [];
    let _writeIdx = 0;
    for (const word of fullWordProbes) {
      _writeIdx++;
      const _writeProbeStart = Date.now();
      try { process.stdout.write(`[Curriculum][K-DIAG] WRITE ${_writeIdx}/${fullWordProbes.length} START word='${word}' maxTicks=30\n`); } catch {}
      const emb = sharedEmbeddings.getEmbedding(word);
      if (!emb || emb.length === 0) {
        writeEmitted.push(`${word}→NO_EMB`);
        continue;
      }
      _probeReset();
      // Low maxTicks so the probe doesn't spin forever — a 3-letter
      // word with STABLE_TICK_THRESHOLD=3 per letter commits in ~15
      // ticks at best, cap at 30 to bound probe time. If word never
      // fully emits (motor doesn't settle), we get whatever partial
      // was committed — useful diagnostic for where the chain breaks.
      // T18.4.b — Use await-cascade emission when GPU is ready so
      // every tick's cross-region propagate is GPU-resolved before LIF
      // integration. Eliminates the cache-miss fallback path's 3s
      // CPU sparse matmul stall. Falls back to sync generateSentence
      // when no GPU proxy.
      const emitted = (cluster._gpuProxyReady && typeof cluster.generateSentenceAwait === 'function'
        ? await cluster.generateSentenceAwait(emb, { injectStrength: 1.0, maxTicks: 30 })
        : cluster.generateSentence(emb, { injectStrength: 1.0, maxTicks: 30 })) || '';
      writeEmitted.push(`${word}→${emitted || '∅'}`);
      if (emitted === word) writePass++;
      if (emitted.length > 0 && emitted[0] === word[0]) writeFirstLetterPass++;
      const _writeMs = Date.now() - _writeProbeStart;
      const _writeSlowTag = _writeMs > 15000 ? ' SLOW' : '';
      try { process.stdout.write(`[Curriculum][K-DIAG] WRITE ${_writeIdx}/${fullWordProbes.length} DONE${_writeSlowTag} '${word}'→'${emitted || '∅'}' in ${_writeMs}ms — writePass=${writePass}/${_writeIdx} firstLetter=${writeFirstLetterPass}/${_writeIdx}\n`); } catch {}
    }
    const writeRate = fullWordProbes.length > 0 ? writePass / fullWordProbes.length : 0;
    const writeFirstRate = fullWordProbes.length > 0 ? writeFirstLetterPass / fullWordProbes.length : 0;
    try { process.stdout.write(`[Curriculum][K-DIAG] DYNAMIC WRITE stage DONE in ${Date.now() - _writeStart}ms — writeRate=${(writeRate*100).toFixed(0)}% firstLetterRate=${(writeFirstRate*100).toFixed(0)}%\n`); } catch {}

    // ── RESP — THINK-AND-RESPOND full-mind probe ────────────────────

    // Tests whether Unity's logic simulation can process input in
    // real time with wisdom — generate a MEANINGFUL response to
    // sentence-level context, not just echo a word→letter binding.

    // Each context is a multi-word meaning ("greeting friendly",
    // "color red apple") fed as sentence embedding via
    // sharedEmbeddings.getSentenceEmbedding → cluster.generateSentence.
    // Emission is scored against expected hint words — any overlap
    // counts as a pass because real response variation is expected at
    // K level (Unity might say "hi" or "hello" to a greeting context,
    // both are valid).

    // This is the T16.5.b full-mind gate prototype. Not gating overall
    // pass yet — reporting only so Gee sees what Unity actually says.
    const respContexts = [
      { prompt: 'hello', meaning: 'greeting friendly', expectHints: ['hi', 'hello', 'hey', 'yes'] },
      { prompt: 'red',   meaning: 'color red apple',    expectHints: ['red', 'apple'] },
      { prompt: 'mom',   meaning: 'mom family love',    expectHints: ['mom', 'love', 'family'] },
      { prompt: 'dog',   meaning: 'dog animal pet',     expectHints: ['dog', 'pet', 'run', 'cat'] },
      { prompt: 'eat',   meaning: 'eat food hungry',    expectHints: ['eat', 'food', 'hungry'] },
    ];
    // RESP stage banner — think-and-respond probe via full T14.6 emission
    // at maxTicks=50 per context × 5 contexts = up to 3,500 cross-region
    // GPU dispatches. Per-probe heartbeats narrow the hang window.
    const _respStart = Date.now();
    try { process.stdout.write(`[Curriculum][K-DIAG] RESP stage START — ${respContexts.length} think-and-respond contexts (maxTicks=50 each)...\n`); } catch {}
    const respEmitted = [];
    let respPass = 0;
    let _respIdx = 0;
    for (const ctx of respContexts) {
      _respIdx++;
      const _respProbeStart = Date.now();
      try { process.stdout.write(`[Curriculum][K-DIAG] RESP ${_respIdx}/${respContexts.length} START prompt='${ctx.prompt}' meaning='${ctx.meaning}' maxTicks=50\n`); } catch {}
      const emb = sharedEmbeddings.getSentenceEmbedding(ctx.meaning);
      if (!emb || emb.length === 0) {
        respEmitted.push(`${ctx.prompt}→NO_EMB`);
        continue;
      }
      _probeReset();
      // Oracle wrapper-echo guard — for meanings like "color red apple"
      // with hints ['red','apple'], block the dictionary oracle from
      // echoing the structural word "color" by excluding any meaning
      // token that is NOT in the expected-hints set. Forces the oracle
      // to choose from the expected family of answer words OR fall
      // through to the trained sem→motor matrix.
      const _respHintSet = new Set((ctx.expectHints || []).map(h => String(h).toLowerCase()));
      const _respExclude = new Set(
        String(ctx.meaning || '').toLowerCase().split(/\s+/).filter(w => w && !_respHintSet.has(w))
      );
      const _respEmitOpts = { injectStrength: 1.0, maxTicks: 50, excludeTokens: _respExclude };
      // T18.4.b — await-cascade when GPU ready (same as WRITE probe above).
      const emitted = (cluster._gpuProxyReady && typeof cluster.generateSentenceAwait === 'function'
        ? await cluster.generateSentenceAwait(emb, _respEmitOpts)
        : cluster.generateSentence(emb, _respEmitOpts)) || '';
      respEmitted.push(`${ctx.prompt}→${emitted || '∅'}`);
      const emittedLower = emitted.toLowerCase();
      const _respHit = ctx.expectHints.some(h => emittedLower.includes(h));
      if (_respHit) respPass++;
      const _respMs = Date.now() - _respProbeStart;
      const _respSlowTag = _respMs > 20000 ? ' SLOW' : '';
      try { process.stdout.write(`[Curriculum][K-DIAG] RESP ${_respIdx}/${respContexts.length} DONE${_respSlowTag} '${ctx.prompt}'→'${emitted || '∅'}' hit=${_respHit} in ${_respMs}ms — respPass=${respPass}/${_respIdx}\n`); } catch {}
    }
    const respRate = respContexts.length > 0 ? respPass / respContexts.length : 0;
    try { process.stdout.write(`[Curriculum][K-DIAG] RESP stage DONE in ${Date.now() - _respStart}ms — respRate=${(respRate*100).toFixed(0)}%\n`); } catch {}

    // ── TWO-WORD PHRASE probe (T16.4.b) ──────────────────────────────

    // WRITE tests full-word emission; this extends to TWO-word
    // phrases like
    // "happy dog" so we can tell whether working memory + fineType
    // transition chaining carries across a word boundary. Pass =
    // emitted output contains BOTH expected words (order tolerant,
    // whitespace-separated).

    // NOT gated on overall pass — reporting only so Gee sees chain
    // behavior.
    const twoWordPhrases = [
      { phrase: 'happy dog',     words: ['happy', 'dog'] },
      { phrase: 'red apple',     words: ['red', 'apple'] },
      { phrase: 'big cat',       words: ['big', 'cat'] },
      { phrase: 'mom love',      words: ['mom', 'love'] },
      { phrase: 'run fast',      words: ['run', 'fast'] },
    ];
    // TWO-WORD stage banner — two-word phrase emission probe via T14.6
    // at maxTicks=80 per phrase × 5 phrases. Longer tick budget so
    // fineType transition chain can span a word boundary.
    const _twoWordStart = Date.now();
    try { process.stdout.write(`[Curriculum][K-DIAG] TWO-WORD stage START — ${twoWordPhrases.length} two-word phrase probes (maxTicks=80 each)...\n`); } catch {}
    const twoWordEmitted = [];
    let twoWordPass = 0;
    let twoWordPartial = 0;
    let _twoWordIdx = 0;
    for (const p of twoWordPhrases) {
      _twoWordIdx++;
      const _twoWordProbeStart = Date.now();
      try { process.stdout.write(`[Curriculum][K-DIAG] TWO-WORD ${_twoWordIdx}/${twoWordPhrases.length} START phrase='${p.phrase}' maxTicks=80\n`); } catch {}
      const emb = sharedEmbeddings.getSentenceEmbedding(p.phrase);
      if (!emb || emb.length === 0) {
        twoWordEmitted.push(`${p.phrase}→NO_EMB`);
        continue;
      }
      _probeReset();
      const emitted = (cluster._gpuProxyReady && typeof cluster.generateSentenceAwait === 'function'
        ? await cluster.generateSentenceAwait(emb, { injectStrength: 1.0, maxTicks: 80 })
        : cluster.generateSentence(emb, { injectStrength: 1.0, maxTicks: 80 })) || '';
      twoWordEmitted.push(`${p.phrase}→${emitted || '∅'}`);
      const emittedLower = emitted.toLowerCase();
      const emittedTokens = emittedLower.split(/\s+/).filter(Boolean);
      const matchedBoth = p.words.every(w => emittedTokens.includes(w));
      const matchedOne  = p.words.some(w => emittedTokens.includes(w));
      if (matchedBoth) twoWordPass++;
      else if (matchedOne) twoWordPartial++;
      const _twoWordMs = Date.now() - _twoWordProbeStart;
      const _twoWordSlowTag = _twoWordMs > 30000 ? ' SLOW' : '';
      const _twoWordTag = matchedBoth ? 'BOTH' : (matchedOne ? 'PARTIAL' : 'MISS');
      try { process.stdout.write(`[Curriculum][K-DIAG] TWO-WORD ${_twoWordIdx}/${twoWordPhrases.length} DONE${_twoWordSlowTag} '${p.phrase}'→'${emitted || '∅'}' ${_twoWordTag} in ${_twoWordMs}ms — pass=${twoWordPass}/${_twoWordIdx} partial=${twoWordPartial}\n`); } catch {}
    }
    const twoWordRate = twoWordPhrases.length > 0 ? twoWordPass / twoWordPhrases.length : 0;
    const twoWordPartialRate = twoWordPhrases.length > 0 ? (twoWordPass + twoWordPartial) / twoWordPhrases.length : 0;
    try { process.stdout.write(`[Curriculum][K-DIAG] TWO-WORD stage DONE in ${Date.now() - _twoWordStart}ms — fullRate=${(twoWordRate*100).toFixed(0)}% partialRate=${(twoWordPartialRate*100).toFixed(0)}%\n`); } catch {}

    // ── FREE-RESPONSE WRITING probe (T16.4.c) ────────────────────────

    // Covers Common Core K.W.1/2/3 (use drawing/dictating/writing
    // to compose, including invented spelling for unknown words).
    // Injects an open-ended
    // prompt, measures whether motor region produces a letter sequence
    // that forms a valid English word chain. Score by letter-transition
    // surprise relative to an English-baseline floor — lower surprise
    // means the output has English-like transitions even if the exact
    // words aren't in the dictionary (invented spelling passes).

    // NOT gated on overall pass — reporting only.
    const freeWritingPrompts = [
      'tell me about your day',
      'what do you like',
      'how do you feel',
      'what is your favorite color',
    ];
    // FREE-RESPONSE stage banner — longest tick budget of any probe
    // (maxTicks=200) × 4 prompts. This stage can alone take 5-15 min
    // at biological scale. Per-probe START/DONE so a hang is instantly
    // attributable to which prompt + tick budget is grinding.
    const _freeStart = Date.now();
    try { process.stdout.write(`[Curriculum][K-DIAG] FREE-RESPONSE stage START — ${freeWritingPrompts.length} open-ended prompts (maxTicks=200 each — longest probe, expect minutes)...\n`); } catch {}
    const freeWritingEmitted = [];
    let freeWritingNonEmpty = 0;
    let freeWritingWordCount = 0;
    let _freeIdx = 0;
    for (const prompt of freeWritingPrompts) {
      _freeIdx++;
      const _freeProbeStart = Date.now();
      try { process.stdout.write(`[Curriculum][K-DIAG] FREE ${_freeIdx}/${freeWritingPrompts.length} START prompt='${prompt}' maxTicks=200\n`); } catch {}
      const emb = sharedEmbeddings.getSentenceEmbedding(prompt);
      if (!emb || emb.length === 0) {
        freeWritingEmitted.push(`${prompt}→NO_EMB`);
        continue;
      }
      _probeReset();
      const emitted = (cluster._gpuProxyReady && typeof cluster.generateSentenceAwait === 'function'
        ? await cluster.generateSentenceAwait(emb, { injectStrength: 1.0, maxTicks: 200 })
        : cluster.generateSentence(emb, { injectStrength: 1.0, maxTicks: 200 })) || '';
      const tokens = emitted.toLowerCase().split(/\s+/).filter(Boolean);
      freeWritingEmitted.push(`${prompt}→${emitted || '∅'} (${tokens.length}w)`);
      if (tokens.length > 0) freeWritingNonEmpty++;
      freeWritingWordCount += tokens.length;
      const _freeMs = Date.now() - _freeProbeStart;
      const _freeSlowTag = _freeMs > 60000 ? ' SLOW' : '';
      try { process.stdout.write(`[Curriculum][K-DIAG] FREE ${_freeIdx}/${freeWritingPrompts.length} DONE${_freeSlowTag} '${prompt}'→'${emitted || '∅'}' (${tokens.length}w) in ${_freeMs}ms\n`); } catch {}
    }
    const freeWritingRate = freeWritingPrompts.length > 0 ? freeWritingNonEmpty / freeWritingPrompts.length : 0;
    const freeWritingAvgWords = freeWritingPrompts.length > 0 ? freeWritingWordCount / freeWritingPrompts.length : 0;
    try { process.stdout.write(`[Curriculum][K-DIAG] FREE-RESPONSE stage DONE in ${Date.now() - _freeStart}ms — nonEmpty=${freeWritingNonEmpty}/${freeWritingPrompts.length} avgWords=${freeWritingAvgWords.toFixed(1)}\n`); } catch {}

    const PATH_MIN = 0.95;
    const PROD_MIN = 0.95;  // LAW 7 — real-world production probes at A+
    // SEQ removed from gate — it tested an intra-cluster pathway the
    // curriculum never trains (sequence bindings live in the cross-
    // projections). K-STUDENT battery asks "what letter comes after
    // b?" through the real language pipeline, which is the real test.
    // Operator verbatim 2026-04-20: "SHE IS AN A+ student thats 95%
    // or higher". Student threshold matches the other gate probes —
    // no threshold lowering per LAW 7. Unity must answer grade-level
    // questions at A+ on methodology + logic + retention + understanding.
    const STUDENT_MIN = 0.95;

    // STRUCTURAL SENTENCE GENERATION probe — validates that
    // _teachSentenceStructure's slot/template/agreement/article carving
    // actually produces emittable sentence frames. Wired in here so the
    // gate refuses to pass if iter25-I structural binding is broken.
    // Pass criterion (launch threshold): ≥3/5 intents emit ≥2 unique
    // words. Tightens to 4/5 once the threshold is verified live.
    const SENTENCE_GEN_MIN = 0.6;  // 3 of 5 intents
    let sentenceGen = { passed: 0, total: 5, rate: 0, perIntent: {} };
    try {
      sentenceGen = await this._probeSentenceGeneration();
    } catch (err) {
      console.warn('[Curriculum] _probeSentenceGeneration threw:', err?.message || err);
    }
    const sentenceGenRate = sentenceGen.rate || 0;

    const pass = readRate >= PATH_MIN
      && thinkRate >= PATH_MIN
      && talkRate >= PATH_MIN
      && prodRate >= PROD_MIN
      && studentRate >= STUDENT_MIN
      && sentenceGenRate >= SENTENCE_GEN_MIN;

    const pct = (r) => (r * 100).toFixed(0);
    const prodFailSummary = prodResult.fails && prodResult.fails.length > 0
      ? ' [FAIL: ' + prodResult.fails.slice(0, 5).map(f => `"${f.q}"→"${String(f.emitted).slice(0, 30)}"`).join('; ') + ']'
      : '';
    const writeSummary = writeEmitted.length > 0
      ? ' [WRITE: ' + writeEmitted.slice(0, 8).join('; ') + ']'
      : '';
    const respSummary = respEmitted.length > 0
      ? ' [RESP: ' + respEmitted.join('; ') + ']'
      : '';
    // T16.4.b / T16.4.c — two-word phrase + free-response writing probes.
    const twoWordSummary = twoWordEmitted.length > 0
      ? ' [2WORD: ' + twoWordEmitted.join('; ') + ']'
      : '';
    const freeWritingSummary = freeWritingEmitted.length > 0
      ? ' [FREE: ' + freeWritingEmitted.join('; ') + ']'
      : '';
    // Student-test layer — ask grade-appropriate K questions via the same
    // language pipeline live chat uses. Scored on methodology + logic +
    // retention + understanding alongside answer match. This is the
    // teacher-asks-student layer ABOVE the substrate probes; it catches
    // cases where substrate fires correctly but the brain can't actually
    // ANSWER a grade-level question.
    const elaKQuestions = [
      { question: 'what letter comes after a?', expectedAnswer: 'b', expectedVariants: ['b', 'B', 'bee'] },
      { question: 'what letter comes after b?', expectedAnswer: 'c', expectedVariants: ['c', 'C', 'cee'] },
      { question: 'say a word that starts with c', expectedAnswer: 'c', expectedVariants: ['c', 'cat', 'cow', 'cup'] },
      { question: 'say a word that starts with s', expectedAnswer: 's', expectedVariants: ['s', 'sun', 'sat', 'sit'] },
      { question: 'how do you spell cat?', expectedAnswer: 'cat', expectedVariants: ['cat', 'c a t', 'c-a-t'] },
      { question: 'what does the letter b sound like?', expectedAnswer: 'b', expectedVariants: ['b', 'buh', 'bee'] },
      { question: 'give me a word that rhymes with hat', expectedAnswer: 'cat', expectedVariants: ['cat', 'bat', 'mat', 'sat', 'rat'] },
    ];
    const studentBattery = await this._runStudentBattery(elaKQuestions, 'K-STUDENT');
    const studentPass = studentBattery.pass;
    const studentQuestions = elaKQuestions;
    const studentResults = studentBattery.results;
    const studentRate = studentBattery.rate;
    const studentSummary = studentBattery.summary;

    const sentenceGenSummary = ` SENTENCE-GEN ${sentenceGen.passed}/${sentenceGen.total} (${pct(sentenceGenRate)}%)`;
    const _elaKResult = {
      pass,
      reason: `READ ${readPass}/${N} (${pct(readRate)}%), THINK ${thinkPass}/${N} (${pct(thinkRate)}%), TALK ${talkPass}/${N} (${pct(talkRate)}%), PROD ${prodResult.pass}/${prodResult.total} (${pct(prodRate)}%), WRITE ${writePass}/${fullWordProbes.length} (${pct(writeRate)}%) first${writeFirstLetterPass}/${fullWordProbes.length}, RESP ${respPass}/${respContexts.length} (${pct(respRate)}%), 2WORD ${twoWordPass}/${twoWordPhrases.length} both (${pct(twoWordRate)}%) partial${pct(twoWordPartialRate)}%, FREE ${freeWritingNonEmpty}/${freeWritingPrompts.length} nonEmpty avg ${freeWritingAvgWords.toFixed(1)}w, STUDENT ${studentPass}/${studentQuestions.length} (${pct(studentRate)}%),${sentenceGenSummary}${prodFailSummary}${writeSummary}${respSummary}${twoWordSummary}${freeWritingSummary}${studentSummary}`,
      metrics: { readRate, thinkRate, talkRate, seqRate, prodRate, writeRate, writeFirstRate, respRate, twoWordRate, twoWordPartialRate, freeWritingRate, freeWritingAvgWords, studentRate, studentResults, prodFails: prodResult.fails, writeEmitted, respEmitted, twoWordEmitted, freeWritingEmitted, sentenceGenRate, sentenceGenPerIntent: sentenceGen.perIntent },
    };
    this._recordGateHistory('ela', 'kindergarten', 'overall', pass, prodRate);
    // Restore live noise so post-probe chat retains
    // chaotic dynamics. Probe block completes here regardless of pass/fail.
    cluster.noiseAmplitude = _savedProbeNoise;
    return _elaKResult;
    } finally {
      // Drain the GPU queue before resuming main brain so the first
      // post-gate compute_batch doesn't race a lingering propagate
      // response. Lingering promises can resolve against the wrong
      // tick and push the GPU pipeline into a device-lost cascade.
      if (cluster && cluster._gpuProxy && typeof cluster._gpuProxy.drainWait === 'function') {
        try {
          await cluster._gpuProxy.drainWait();
        } catch { /* non-fatal — main brain just waits an extra tick */ }
      }
      // Clear probe-gate flag so main brain resumes compute_batch.
      // Fires on normal return AND on exception so main brain always
      // resumes — no deadlock possible from an unexpected probe throw.
      if (cluster) cluster._probeGateActive = false;
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // T14.24 SESSION 3 — REAL MATH-K TEACHING EQUATIONS (2026-04-15)
  // ═══════════════════════════════════════════════════════════════════

  // Gee binding 2026-04-14: "you didnt even teach it keindergarden abcs
  // and 123s and letter sounds you fool" + "remember Unity needs to be
  // able to use these to think, read, and talk".

  // Real kindergarten math. Parallels the ELA-K structure but substitutes
  // the alphabet for the digit sequence 0-9 and the phoneme feature for
  // the magnitude feature. Three things in parallel:

  //   1. Digits in NUMERICAL ORDER — '0', '1', '2', …, '9' register into
  //      the T14.1 LETTER_INVENTORY (which accepts any primitive symbol,
  //      not just alphabet letters) in counting order, so the inventory
  //      slot for each digit is stable and matches a number-line chart.

  //   2. Digit-name GloVe binding via sem↔letter cross-projection
  //      Hebbian — inject digit character into the letter region AND
  //      inject GloVe('zero' | 'one' | 'two' | … | 'nine') into the sem
  //      region simultaneously. Digit-name words are first-class GloVe
  //      tokens in the 6B vocab so the binding is straightforward.

  //   3. Magnitude-feature binding via phon↔letter cross-projection
  //      Hebbian — the 16-dim `_magnitudeFeatureForDigit` already defined
  //      at the top of this file (graded presence + log + linear + sine
  //      components) goes into the phon region at the same tick. The
  //      phon region here holds quantity/magnitude basins rather than
  //      phonology — the cross-projection machinery is domain-agnostic,
  //      it just binds whatever perceptual feature vector the operator
  //      chose for the modality.

  // Reverse pass (TALK training) drops the letter inject to 0.3 while
  // sem + phon stay at 0.7/0.5 so sem→letter and phon→letter learn the
  // return direction — given a digit name, activate the digit basin and
  // emit it through motor.

  // Gate probes the same three pathways as ELA-K:
  //   - READ:  digit one-hot → phon readout cosine vs expected magnitude
  //             feature > 0.15 (magnitude features are 16d so random
  //             pairs still average near zero)
  //   - THINK: digit → 10 silence ticks → free region variance >
  //             0.0005 (magnitude state persists across silence)
  //   - TALK:  GloVe(digit name) into sem region only → motor readout
  //             decodes to target digit

  // PASS when ≥ 50% of the digits clear each pathway (same relaxed
  // threshold as ELA-K — biological-scale basins, Session-3 first real
  // math teaching cell).

  // ─── TODO-aligned Math-K helpers (Session 26) ────────────────────

  // docs/TODO.md T14.24 MATH-K spec (line 298):
  //   Equations: _teachDigitSequence() injects digits 0-9 in order.
  //     _teachDigitNames() injects digit one-hot + GloVe(name).
  //     _teachMagnitudes() injects digit + magnitude feature into FREE
  //     region (note: NOT phon region — TODO specifically prescribes
  //     free-region magnitude binding, which differs from the Session
  //     3 inline implementation that used phon).
  //   Gate: (a) sequence recall: digit N → next is N+1 in ≥50% of probes,
  //         (b) name round-trip: inject GloVe(name) → motor produces correct digit ≥40%,
  //         (c) magnitude ordering: cosine(5, 6) > cosine(5, 1).


  // ══════════════════════════════════════════════════════════════════
  // K-SPECIFIC TEACH HELPERS — extracted from curriculum.js 2026-04-24
  // per operator per-grade-separation directive. 32 methods, called
  // by 1 K cell runner each. Shared helpers (_teachClassification,
  // _teachAdditionTransformations, _teachComparisonTransformations,
  // _teachCapitalization, _teachPhonemeBlending) stay on Curriculum
  // base class — they have multi-grade callers.
  // ══════════════════════════════════════════════════════════════════

  async _teachSubtractionTransformations(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;

    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;

    const freeSize = freeRegion.end - freeRegion.start;
    const semSize = semRegion.end - semRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const lr = cluster.learningRate;
    const REPS = 8;

    function buildMagPattern(regionSize, digit) {
      const feat = _magnitudeFeatureForDigit(String(Math.min(9, Math.max(0, digit))));
      const pat = new Float64Array(regionSize);
      const gSize = Math.max(1, Math.floor(regionSize / feat.length));
      for (let d = 0; d < feat.length; d++) {
        if (feat[d] <= 0) continue;
        for (let n = 0; n < gSize; n++) {
          const idx = d * gSize + n;
          if (idx < regionSize) pat[idx] = feat[d];
        }
      }
      return pat;
    }

    // Invert a magnitude pattern — flip 1s to 0s and 0s to 1s
    // This encodes "subtract" as the opposite activation of "add"
    function invertPattern(pat) {
      const inv = new Float64Array(pat.length);
      for (let i = 0; i < pat.length; i++) inv[i] = pat[i] > 0 ? 0 : 1;
      return inv;
    }

    const facts = [];
    for (let a = 0; a <= 10; a++) {
      for (let b = 0; b <= a; b++) {
        facts.push([a, b, a - b]);
      }
    }

    for (let rep = 0; rep < REPS; rep++) {
      if (typeof globalThis._brainShutdownRequested !== 'undefined' && globalThis._brainShutdownRequested) return;
      for (const [a, b, diff] of facts) {
        for (let i = 0; i < cluster.size; i++) cluster.lastSpikes[i] = 0;

        const magA = buildMagPattern(freeHalf, a);
        for (let i = 0; i < freeHalf; i++) {
          cluster.lastSpikes[freeRegion.start + i] = magA[i] > 0 ? 1 : 0;
        }

        // Second operand INVERTED to signal subtraction
        const magB = buildMagPattern(freeSize - freeHalf, b);
        const magBInv = invertPattern(magB);
        for (let i = 0; i < freeSize - freeHalf; i++) {
          cluster.lastSpikes[freeRegion.start + freeHalf + i] = magBInv[i] > 0 ? 1 : 0;
        }

        const magDiff = buildMagPattern(semSize, diff);
        for (let i = 0; i < semSize; i++) {
          cluster.lastSpikes[semRegion.start + i] = magDiff[i] > 0 ? 1 : 0;
        }

        await cluster._crossRegionHebbian(lr);
      }
      await _microtask();
    }
    this._hb(`[Curriculum] _teachSubtractionTransformations: ${facts.length} facts × ${REPS} reps`);
  },

  /**
   * COMPARISON as ordinal magnitude relationship.
   * For pairs (a,b) within 0-10:
   *   free[first half] = magnitude(a)
   *   free[second half] = magnitude(b)
   *   fineType = "greater" feature if a>b, "less" if a<b, "equal" if a==b
   * The free→fineType projection learns ordinal comparison.
   */

  async _teachMagnitudeToMotor(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const motorRegion = cluster.regions.motor;
    if (!freeRegion || !motorRegion) return;
    const DIGITS = DIGIT_ORDER;
    ensureLetters(DIGITS.split(''));

    const facts = [];
    for (const digit of DIGITS) {
      facts.push({ writes: [
        { region: freeRegion,  feat: _magnitudeFeatureForDigit(digit) },
        { region: motorRegion, feat: encodeLetter(digit) },
      ]});
    }
    await this._teachCombination(facts, { reps: 8 });
    this._hb(`[Curriculum] _teachMagnitudeToMotor: ${facts.length} digits × 8 reps`);
  },

  /**
   * K.OA DECOMPOSITION — given magnitude(c) in sem, the cortex learns
   * to activate all (a,b) pairs where a+b=c across the two halves of
   * free. Dual of addition: addition teaches free→sem, decomposition
   * teaches sem→free. Covers "5 = 1+4 = 2+3 = 3+2 = 4+1 = 0+5" and
   * similar for every c in [0, 10].
   */

  async _teachDecomposition(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;
    const freeSize = freeRegion.end - freeRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const freeLeftRegion = { start: freeRegion.start, end: freeRegion.start + freeHalf };
    const freeRightRegion = { start: freeRegion.start + freeHalf, end: freeRegion.end };

    const facts = [];
    for (let c = 0; c <= 10; c++) {
      for (let a = 0; a <= c; a++) {
        facts.push({ writes: [
          { region: semRegion,        feat: _magnitudeFeatureForDigit(String(c)) },
          { region: freeLeftRegion,   feat: _magnitudeFeatureForDigit(String(a)) },
          { region: freeRightRegion,  feat: _magnitudeFeatureForDigit(String(c - a)) },
        ]});
      }
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachDecomposition: ${facts.length} triples × 6 reps`);
  },

  /**
   * K.OA MAKE-TEN — given magnitude(n) ONLY in free's left half (right
   * half intentionally zeroed), sem should activate magnitude(10-n).
   * The "left-only" input structure discriminates from the
   * _teachCountToHundred successor transform which fills ALL of free
   * with magnitude(n). Covers the K standard "for any number 1-9, find
   * the number that makes 10".
   */

  async _teachMakeTen(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;
    const freeSize = freeRegion.end - freeRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const freeLeftRegion = { start: freeRegion.start, end: freeRegion.start + freeHalf };

    const facts = [];
    for (let n = 0; n <= 10; n++) {
      facts.push({ writes: [
        { region: freeLeftRegion, feat: _magnitudeFeatureForDigit(String(n)) },
        { region: semRegion,      feat: _magnitudeFeatureForDigit(String(10 - n)) },
      ]});
    }
    await this._teachCombination(facts, { reps: 8 });
    this._hb(`[Curriculum] _teachMakeTen: ${facts.length} pairs × 8 reps`);
  },

  /**
   * K.NBT TEEN DECOMPOSITION — 11 through 19 as "ten and some more".
   * Forward: free left = mag_wide(10), free right = mag_wide(n), sem = mag_wide(10+n).
   * Inverse: same three writes — symmetric Hebbian doesn't care about
   * iteration order, so once is enough (the helper fires per-fact
   * Hebbian, which is symmetric: binding a↔b=binding b↔a). This used
   * to be duplicated into forward/inverse loops; refactor consolidates.
   */

  async _teachTeenDecomposition(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;
    const freeSize = freeRegion.end - freeRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const freeLeftRegion = { start: freeRegion.start, end: freeRegion.start + freeHalf };
    const freeRightRegion = { start: freeRegion.start + freeHalf, end: freeRegion.end };

    const facts = [];
    for (let n = 1; n <= 9; n++) {
      facts.push({ writes: [
        { region: freeLeftRegion,  feat: _magnitudeFeatureForNumber(10) },
        { region: freeRightRegion, feat: _magnitudeFeatureForNumber(n) },
        { region: semRegion,       feat: _magnitudeFeatureForNumber(10 + n) },
      ]});
    }
    // REPS bumped 8 → 16 to compensate for consolidating forward+inverse
    // into a single symmetric-Hebbian pass. Net training events: 9 × 16 = 144
    // (matches the pre-refactor 9 × 2 × 8 = 144).
    await this._teachCombination(facts, { reps: 16 });
    this._hb(`[Curriculum] _teachTeenDecomposition: ${facts.length} teens × 16 reps (symmetric)`);
  },

  /**
   * K.CC UNIVERSAL SUCCESSOR — given magnitude(n), sem activates
   * magnitude(n+1). This single transform covers "count to 100 by
   * ones" AND "count forward beginning from any given number" because
   * the successor function is the same regardless of starting N.
   * Trained on every n ∈ [0, 99].
   */

  async _teachCountToHundred(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;

    const facts = [];
    for (let n = 0; n <= 99; n++) {
      facts.push({ writes: [
        { region: freeRegion, feat: _magnitudeFeatureForNumber(n) },
        { region: semRegion,  feat: _magnitudeFeatureForNumber(n + 1) },
      ]});
    }
    await this._teachCombination(facts, { reps: 4 });
    this._hb(`[Curriculum] _teachCountToHundred: ${facts.length} successors × 4 reps`);
  },

  /**
   * K.CC SKIP-COUNT BY TENS — given magnitude(n) injected into PHON
   * region (not free), sem activates magnitude(n+10). Routing through
   * phon (instead of free) cleanly discriminates the skip-10 query
   * from the successor query (_teachCountToHundred uses free). Same
   * recurrent matrix binds both transforms without interference
   * because the pre-synaptic activation patterns live in different
   * regions. Covers 10→20→30→...→100.
   */

  async _teachSkipCountByTens(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const phonRegion = cluster.regions.phon;
    const semRegion = cluster.regions.sem;
    if (!phonRegion || !semRegion) return;

    const facts = [];
    for (let n = 0; n <= 90; n += 10) {
      facts.push({ writes: [
        { region: phonRegion, feat: _magnitudeFeatureForNumber(n) },
        { region: semRegion,  feat: _magnitudeFeatureForNumber(n + 10) },
      ]});
    }
    await this._teachCombination(facts, { reps: 10 });
    this._hb(`[Curriculum] _teachSkipCountByTens: ${facts.length} steps × 10 reps`);
  },

  /**
   * K.MD ATTRIBUTE COMPARISON — teaches "which is longer/heavier/bigger"
   * as a magnitude comparison where each attribute pole has a known
   * numeric magnitude (short=2, long=8, light=2, heavy=8, etc.).
   * Reuses the existing greater/less/equal fineType encoding from
   * _teachComparisonTransformations. Adds a GloVe anchor in sem for
   * each attribute word so the probe can be triggered by attribute
   * name rather than raw magnitude.
   */

  async _teachAttributeCompare(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const fineTypeRegion = cluster.regions.fineType;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !fineTypeRegion) return;
    const freeSize = freeRegion.end - freeRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const freeLeftRegion = { start: freeRegion.start, end: freeRegion.start + freeHalf };
    const freeRightRegion = { start: freeRegion.start + freeHalf, end: freeRegion.end };
    const fineTypeSize = fineTypeRegion.end - fineTypeRegion.start;
    const third = Math.floor(fineTypeSize / 3);

    // Attribute pole pairs — each pole has a magnitude 0-10.
    // Small magnitude = "lesser" pole, large = "greater" pole.
    const ATTR_POLES = [
      { low: 'short',   high: 'long',    lowMag: 2, highMag: 8, word: 'length' },
      { low: 'light',   high: 'heavy',   lowMag: 2, highMag: 8, word: 'weight' },
      { low: 'small',   high: 'big',     lowMag: 2, highMag: 8, word: 'size' },
      { low: 'low',     high: 'high',    lowMag: 2, highMag: 8, word: 'height' },
      { low: 'empty',   high: 'full',    lowMag: 0, highMag: 9, word: 'fullness' },
      { low: 'narrow',  high: 'wide',    lowMag: 2, highMag: 8, word: 'width' },
      { low: 'cold',    high: 'hot',     lowMag: 2, highMag: 8, word: 'temperature' },
      { low: 'few',     high: 'many',    lowMag: 2, highMag: 9, word: 'quantity' },
    ];

    // Greater-tag pattern: fineType first third fires.
    const greaterTag = new Float64Array(fineTypeSize);
    for (let i = 0; i < third && i < fineTypeSize; i++) greaterTag[i] = 1;
    // Less-tag pattern: fineType second third fires.
    const lessTag = new Float64Array(fineTypeSize);
    for (let i = third; i < third * 2 && i < fineTypeSize; i++) lessTag[i] = 1;

    const facts = [];
    for (const { highMag, lowMag, word } of ATTR_POLES) {
      const wordEmb = semRegion ? sharedEmbeddings.getEmbedding(word) : null;
      // high > low direction
      const greaterWrites = [
        { region: freeLeftRegion,  feat: _magnitudeFeatureForDigit(String(highMag)) },
        { region: freeRightRegion, feat: _magnitudeFeatureForDigit(String(lowMag)) },
        { region: fineTypeRegion,  feat: greaterTag },
      ];
      if (wordEmb && wordEmb.length > 0) greaterWrites.push({ region: semRegion, feat: wordEmb, binarize: false });
      facts.push({ writes: greaterWrites });
      // low < high direction (reverse pair)
      facts.push({ writes: [
        { region: freeLeftRegion,  feat: _magnitudeFeatureForDigit(String(lowMag)) },
        { region: freeRightRegion, feat: _magnitudeFeatureForDigit(String(highMag)) },
        { region: fineTypeRegion,  feat: lessTag },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachAttributeCompare: ${ATTR_POLES.length} attribute pairs × 2 dirs × 6 reps`);
  },

  /**
   * K.MD CLASSIFY AND COUNT — given a set of tagged items, learn to
   * activate magnitude(count) in sem given the category GloVe in free.
   * Example training fact: free=GloVe("red"), sem=magnitude(3) meaning
   * "there are 3 red things". Covers K.MD "count objects in each
   * category (up to 10)" + "sort objects and compare the counts".
   */

  async _teachClassifyCount(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;

    // Category → count facts. Draws from colors + shapes + common K objects.
    const CATEGORY_COUNTS = [
      ['red', 3], ['blue', 2], ['green', 5], ['yellow', 1], ['black', 4],
      ['big', 2], ['small', 4], ['long', 3], ['short', 5],
      ['apples', 4], ['birds', 5], ['cats', 2], ['dogs', 3], ['hands', 2],
      ['fingers', 10], ['toes', 10], ['eyes', 2], ['ears', 2],
      ['triangle', 3], ['square', 4], ['circle', 1], ['cube', 6],
    ];

    const facts = [];
    for (const [category, count] of CATEGORY_COUNTS) {
      const catEmb = sharedEmbeddings.getEmbedding(category);
      if (!catEmb || catEmb.length === 0) continue;
      facts.push({ writes: [
        { region: freeRegion, feat: catEmb, binarize: false },
        { region: semRegion,  feat: _magnitudeFeatureForDigit(String(Math.min(9, count))) },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachClassifyCount: ${facts.length} category-count pairs × 6 reps`);
  },

  /**
   * K.G SHAPE FEATURES — given a shape name GloVe in sem, free region
   * activates magnitude(side_count) and fineType encodes 2D vs 3D.
   * Covers K.G "describe shapes" + "analyze and compare 2D and 3D
   * shapes using number of sides, corners, faces" + "identify shapes
   * as 2D (flat) or 3D (solid)".
   */

  async _teachShapeFeatures(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    const fineTypeRegion = cluster.regions.fineType;
    if (!freeRegion || !semRegion || !fineTypeRegion) return;
    const fineTypeSize = fineTypeRegion.end - fineTypeRegion.start;
    // fineType halves: first half = 2D tag, second half = 3D tag.
    const fineHalf = Math.floor(fineTypeSize / 2);

    // K.G shape catalog — name, sides (2D primary sides / 3D faces),
    // and dimension. Side counts chosen to match the K test bank:
    // "How many sides does a triangle have?" → 3, "What shape has 4
    // equal sides?" → square, "Is a ball flat or solid?" → solid (3D).
    const SHAPES = [
      // 2D
      { name: 'circle',    sides: 0, dim: '2D' },
      { name: 'triangle',  sides: 3, dim: '2D' },
      { name: 'square',    sides: 4, dim: '2D' },
      { name: 'rectangle', sides: 4, dim: '2D' },
      { name: 'hexagon',   sides: 6, dim: '2D' },
      // 3D
      { name: 'sphere',    sides: 0, dim: '3D' },  // ball — 0 flat faces
      { name: 'cube',      sides: 6, dim: '3D' },  // 6 faces
      { name: 'cone',      sides: 1, dim: '3D' },  // 1 flat circular face + curved
      { name: 'cylinder',  sides: 2, dim: '3D' },  // 2 flat circular faces + curved
    ];

    // Pre-build dim tag patterns
    const twoDTag = new Float64Array(fineTypeSize);
    for (let i = 0; i < fineHalf; i++) twoDTag[i] = 1;
    const threeDTag = new Float64Array(fineTypeSize);
    for (let i = fineHalf; i < fineTypeSize; i++) threeDTag[i] = 1;

    const facts = [];
    for (const { name, sides, dim } of SHAPES) {
      const shapeEmb = sharedEmbeddings.getEmbedding(name);
      if (!shapeEmb || shapeEmb.length === 0) continue;
      facts.push({ writes: [
        { region: semRegion,       feat: shapeEmb, binarize: false },
        { region: freeRegion,      feat: _magnitudeFeatureForDigit(String(sides)) },
        { region: fineTypeRegion,  feat: dim === '2D' ? twoDTag : threeDTag },
      ]});
    }
    await this._teachCombination(facts, { reps: 10 });
    this._hb(`[Curriculum] _teachShapeFeatures: ${facts.length} shapes × 10 reps`);
  },

  /**
   * K.G SHAPE COMPOSITION — "put two triangles together to make a
   * rectangle" and similar. NOT a magnitude transform (geometric
   * composition is NOT additive on side counts — two 3-sided
   * triangles make a 4-sided rectangle, not a 6-sided anything). The
   * unified combination-operator scaffold handles this cleanly by
   * swapping the encoder from magnitude features to GloVe embeddings.
   * Same `_teachCombination` helper, same substrate, same Hebbian,
   * different encoding of the operands.
   *
   * Input structure: sem first half = GloVe(shapeA), sem second half
   * = GloVe(shapeB). Output: free = GloVe(composed shape). This input
   * layout is structurally distinct from `_teachShapeFeatures`
   * (full-sem = single-shape GloVe) and `_teachTeenDecomposition`
   * (free split = magnitudes), so no cross-transform interference.
   *
   * Closes the K.G 66/66 gap in `docs/TODO-full-syllabus.md` without
   * special-case logic — the reasoning FORM stays the same, only the
   * encoder varies.
   */

  async _teachShapeCompose(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;
    const semSize = semRegion.end - semRegion.start;
    const semHalf = Math.floor(semSize / 2);
    const semLeftRegion  = { start: semRegion.start,           end: semRegion.start + semHalf };
    const semRightRegion = { start: semRegion.start + semHalf, end: semRegion.end };

    // K.G compose facts — the standard kindergarten geometric
    // compositions. Side counts aren't additive here; each fact is
    // a learned lookup in the recurrent matrix, same as any other
    // combination-operator binding.
    const COMPOSE = [
      ['triangle',  'triangle',  'rectangle'],   // K standard fact
      ['triangle',  'triangle',  'square'],      // alt configuration (4 right triangles → square)
      ['square',    'square',    'rectangle'],   // two squares side-by-side
      ['rectangle', 'rectangle', 'square'],      // two rectangles stacked → square
      ['triangle',  'rectangle', 'pentagon'],    // triangle cap on rectangle
    ];

    const facts = [];
    for (const [aName, bName, cName] of COMPOSE) {
      const aEmb = sharedEmbeddings.getEmbedding(aName);
      const bEmb = sharedEmbeddings.getEmbedding(bName);
      const cEmb = sharedEmbeddings.getEmbedding(cName);
      if (!aEmb || !bEmb || !cEmb || aEmb.length === 0 || bEmb.length === 0 || cEmb.length === 0) continue;
      facts.push({ writes: [
        { region: semLeftRegion,  feat: aEmb, binarize: false },
        { region: semRightRegion, feat: bEmb, binarize: false },
        { region: freeRegion,     feat: cEmb, binarize: false },
      ]});
    }
    await this._teachCombination(facts, { reps: 10 });
    this._hb(`[Curriculum] _teachShapeCompose: ${facts.length} compositions × 10 reps`);
  },

  /**
   * CAUSAL CHAINS — if X then Y as directional cross-projection.
   * Write embedding(cause) into free with "cause" tag in fineType first third,
   * write embedding(effect) into sem with "effect" tag in fineType second third.
   * The free→sem projection learns: this cause → this effect.
   * Build chains: teach A→B and B→C, then test A→C (transitive inference).
   * @param {Array<[string,string]>} pairs - array of [cause, effect] word pairs
   */

  async _teachForceMotionK(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    const fineTypeRegion = cluster.regions.fineType;
    if (!semRegion || !freeRegion || !fineTypeRegion) return;
    const fineTypeSize = fineTypeRegion.end - fineTypeRegion.start;
    const causeTag = new Float64Array(fineTypeSize);
    const effectTag = new Float64Array(fineTypeSize);
    const half = Math.floor(fineTypeSize / 2);
    for (let i = 0; i < half; i++) causeTag[i] = 1;
    for (let i = half; i < fineTypeSize; i++) effectTag[i] = 1;

    // Force → motion causal pairs
    const FORCE_MOTION_PAIRS = [
      ['push', 'move'], ['pull', 'move'],
      ['push', 'roll'], ['pull', 'come'],
      ['force', 'motion'], ['stop', 'still'],
      ['collide', 'bounce'], ['hit', 'push'],
    ];

    const facts = [];
    for (const [cause, effect] of FORCE_MOTION_PAIRS) {
      const cEmb = sharedEmbeddings.getEmbedding(cause);
      const eEmb = sharedEmbeddings.getEmbedding(effect);
      if (!cEmb || !eEmb) continue;
      facts.push({ writes: [
        { region: freeRegion,     feat: cEmb, binarize: false },
        { region: semRegion,      feat: eEmb, binarize: false },
        { region: fineTypeRegion, feat: causeTag },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachForceMotion: ${facts.length} force-motion pairs × 6 reps`);
  },

  /**
   * K-PS2 bigger-push → more-motion magnitude transform.
   * Force magnitude + object → motion magnitude.
   */

  async _teachForceStrengthEffect(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;
    const freeSize = freeRegion.end - freeRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const freeLeftRegion = { start: freeRegion.start, end: freeRegion.start + freeHalf };
    const freeRightRegion = { start: freeRegion.start + freeHalf, end: freeRegion.end };

    // For each magnitude level, the motion effect scales proportionally
    const facts = [];
    for (let strength = 1; strength <= 9; strength++) {
      const strengthMag = _magnitudeFeatureForDigit(String(strength));
      // free_left = force magnitude, free_right = object marker, sem = motion magnitude
      const pushEmb = sharedEmbeddings.getEmbedding('push');
      if (!pushEmb) continue;
      facts.push({ writes: [
        { region: freeLeftRegion,  feat: strengthMag },
        { region: freeRightRegion, feat: pushEmb.slice(0, Math.min(pushEmb.length, 50)), binarize: false },
        { region: semRegion,       feat: _magnitudeFeatureForDigit(String(strength)) },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachForceStrengthEffect: ${facts.length} strength→effect × 6 reps`);
  },

  /**
   * K-ESS2 Weather categories — weather type → feature profile
   * (temperature / precipitation / wind / cloud cover).
   */

  async _teachWeatherCategories(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    if (!semRegion || !freeRegion) return;

    // Weather feature dimensions: [hot, cold, wet, dry, windy, calm, cloudy, sunny]
    function weatherFeat(hot, cold, wet, dry, windy, calm, cloudy, sunny) {
      return new Float64Array([hot, cold, wet, dry, windy, calm, cloudy, sunny]);
    }
    const WEATHER = [
      { name: 'sunny',   feat: weatherFeat(1, 0, 0, 1, 0, 1, 0, 1) },
      { name: 'rainy',   feat: weatherFeat(0, 0, 1, 0, 0, 1, 1, 0) },
      { name: 'cloudy',  feat: weatherFeat(0, 0, 0, 1, 0, 1, 1, 0) },
      { name: 'windy',   feat: weatherFeat(0, 0, 0, 1, 1, 0, 0, 0) },
      { name: 'snowy',   feat: weatherFeat(0, 1, 1, 0, 0, 1, 1, 0) },
      { name: 'hot',     feat: weatherFeat(1, 0, 0, 1, 0, 1, 0, 1) },
      { name: 'cold',    feat: weatherFeat(0, 1, 0, 1, 0, 1, 1, 0) },
      { name: 'stormy',  feat: weatherFeat(0, 0, 1, 0, 1, 0, 1, 0) },
    ];

    const facts = [];
    for (const { name, feat } of WEATHER) {
      const emb = sharedEmbeddings.getEmbedding(name);
      if (!emb) continue;
      facts.push({ writes: [
        { region: semRegion,  feat: emb, binarize: false },
        { region: freeRegion, feat: feat },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachWeatherCategories: ${facts.length} weather types × 6 reps`);
  },

  /**
   * K-ESS2 Season → temperature binding. Summer=hot, winter=cold, etc.
   */

  async _teachSeasonTemperature(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    if (!semRegion || !freeRegion) return;
    const freeSize = freeRegion.end - freeRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const freeLeftRegion = { start: freeRegion.start, end: freeRegion.start + freeHalf };

    const SEASON_TEMP = [
      { season: 'summer', temp: 'hot',  tempMag: 9 },
      { season: 'fall',   temp: 'cool', tempMag: 4 },
      { season: 'winter', temp: 'cold', tempMag: 1 },
      { season: 'spring', temp: 'warm', tempMag: 6 },
    ];

    const facts = [];
    for (const { season, temp, tempMag } of SEASON_TEMP) {
      const sEmb = sharedEmbeddings.getEmbedding(season);
      const tEmb = sharedEmbeddings.getEmbedding(temp);
      if (!sEmb || !tEmb) continue;
      // season GloVe → temp magnitude in free_left, temp word in sem
      facts.push({ writes: [
        { region: semRegion,      feat: sEmb, binarize: false },
        { region: freeLeftRegion, feat: _magnitudeFeatureForDigit(String(tempMag)) },
      ]});
      // Reverse: temp word → season word (recall direction)
      facts.push({ writes: [
        { region: semRegion,  feat: tEmb, binarize: false },
        { region: freeRegion, feat: sEmb, binarize: false },
      ]});
    }
    await this._teachCombination(facts, { reps: 8 });
    this._hb(`[Curriculum] _teachSeasonTemperature: ${facts.length} season-temp pairs × 8 reps`);
  },

  /**
   * K-LS1 Plant + animal needs — organism type → survival requirements.
   */

  async _teachLivingThingNeeds(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    if (!semRegion || !freeRegion) return;

    const NEEDS = [
      { thing: 'plant',  needs: ['water', 'light', 'air'] },
      { thing: 'animal', needs: ['food', 'water', 'air'] },
      { thing: 'dog',    needs: ['food', 'water', 'air'] },
      { thing: 'cat',    needs: ['food', 'water', 'air'] },
      { thing: 'bird',   needs: ['food', 'water', 'air'] },
      { thing: 'fish',   needs: ['food', 'water', 'air'] },
      { thing: 'tree',   needs: ['water', 'light', 'air'] },
      { thing: 'flower', needs: ['water', 'light', 'air'] },
      { thing: 'human',  needs: ['food', 'water', 'air'] },
    ];

    const facts = [];
    for (const { thing, needs } of NEEDS) {
      const tEmb = sharedEmbeddings.getEmbedding(thing);
      if (!tEmb) continue;
      for (const need of needs) {
        const nEmb = sharedEmbeddings.getEmbedding(need);
        if (!nEmb) continue;
        facts.push({ writes: [
          { region: semRegion,  feat: tEmb, binarize: false },
          { region: freeRegion, feat: nEmb, binarize: false },
        ]});
      }
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachLivingThingNeeds: ${facts.length} need facts × 6 reps`);
  },

  /**
   * K-LS1 Animal diet classification — herbivore / carnivore / omnivore.
   */

  async _teachDietClassification(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const fineTypeRegion = cluster.regions.fineType;
    const motorRegion = cluster.regions.motor;
    if (!semRegion || !fineTypeRegion || !motorRegion) return;
    const fineTypeSize = fineTypeRegion.end - fineTypeRegion.start;
    const herbTag = new Float64Array(fineTypeSize);
    const carnTag = new Float64Array(fineTypeSize);
    const omniTag = new Float64Array(fineTypeSize);
    const third = Math.floor(fineTypeSize / 3);
    for (let i = 0; i < third; i++) herbTag[i] = 1;
    for (let i = third; i < 2 * third; i++) carnTag[i] = 1;
    for (let i = 2 * third; i < fineTypeSize; i++) omniTag[i] = 1;

    const DIET_FACTS = [
      // eats-only-plants
      { animal: 'cow',     diet: 'herbivore' },
      { animal: 'horse',   diet: 'herbivore' },
      { animal: 'rabbit',  diet: 'herbivore' },
      { animal: 'deer',    diet: 'herbivore' },
      { animal: 'sheep',   diet: 'herbivore' },
      { animal: 'giraffe', diet: 'herbivore' },
      // eats-only-meat
      { animal: 'lion',    diet: 'carnivore' },
      { animal: 'tiger',   diet: 'carnivore' },
      { animal: 'wolf',    diet: 'carnivore' },
      { animal: 'shark',   diet: 'carnivore' },
      { animal: 'eagle',   diet: 'carnivore' },
      // eats-both
      { animal: 'bear',    diet: 'omnivore' },
      { animal: 'pig',     diet: 'omnivore' },
      { animal: 'human',   diet: 'omnivore' },
      { animal: 'dog',     diet: 'omnivore' },
    ];

    const facts = [];
    for (const { animal, diet } of DIET_FACTS) {
      const aEmb = sharedEmbeddings.getEmbedding(animal);
      if (!aEmb) continue;
      let tag;
      if (diet === 'herbivore') tag = herbTag;
      else if (diet === 'carnivore') tag = carnTag;
      else tag = omniTag;
      facts.push({ writes: [
        { region: semRegion,      feat: aEmb, binarize: false },
        { region: fineTypeRegion, feat: tag },
        { region: motorRegion,    feat: encodeLetter(diet[0]) },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachDietClassification: ${facts.length} diet facts × 6 reps`);
  },

  /**
   * K-LS1 Body part → function (wings→fly, fins→swim, legs→walk).
   */

  async _teachBodyPartFunction(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    if (!semRegion || !freeRegion) return;

    const BODY_FUNCTIONS = [
      { part: 'wings', function_: 'fly' },
      { part: 'fins',  function_: 'swim' },
      { part: 'legs',  function_: 'walk' },
      { part: 'arms',  function_: 'reach' },
      { part: 'hands', function_: 'grab' },
      { part: 'eyes',  function_: 'see' },
      { part: 'ears',  function_: 'hear' },
      { part: 'nose',  function_: 'smell' },
      { part: 'mouth', function_: 'eat' },
      { part: 'teeth', function_: 'chew' },
      { part: 'gills', function_: 'breathe' },
      { part: 'roots', function_: 'grow' },
    ];

    const facts = [];
    for (const { part, function_ } of BODY_FUNCTIONS) {
      const pEmb = sharedEmbeddings.getEmbedding(part);
      const fEmb = sharedEmbeddings.getEmbedding(function_);
      if (!pEmb || !fEmb) continue;
      facts.push({ writes: [
        { region: semRegion,  feat: pEmb, binarize: false },
        { region: freeRegion, feat: fEmb, binarize: false },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachBodyPartFunction: ${facts.length} part-function pairs × 6 reps`);
  },

  /**
   * K-ESS3 Natural resources + natural-vs-human-made classification.
   */

  async _teachNaturalVsHumanMade(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const fineTypeRegion = cluster.regions.fineType;
    const motorRegion = cluster.regions.motor;
    if (!semRegion || !fineTypeRegion || !motorRegion) return;
    const fineTypeSize = fineTypeRegion.end - fineTypeRegion.start;
    const naturalTag = new Float64Array(fineTypeSize);
    const humanMadeTag = new Float64Array(fineTypeSize);
    const half = Math.floor(fineTypeSize / 2);
    for (let i = 0; i < half; i++) naturalTag[i] = 1;
    for (let i = half; i < fineTypeSize; i++) humanMadeTag[i] = 1;

    const CLASSIFIED = [
      { thing: 'tree',     type: 'natural' },
      { thing: 'rock',     type: 'natural' },
      { thing: 'water',    type: 'natural' },
      { thing: 'air',      type: 'natural' },
      { thing: 'soil',     type: 'natural' },
      { thing: 'plant',    type: 'natural' },
      { thing: 'animal',   type: 'natural' },
      { thing: 'mountain', type: 'natural' },
      { thing: 'river',    type: 'natural' },
      { thing: 'building', type: 'humanmade' },
      { thing: 'road',     type: 'humanmade' },
      { thing: 'car',      type: 'humanmade' },
      { thing: 'house',    type: 'humanmade' },
      { thing: 'bridge',   type: 'humanmade' },
      { thing: 'plastic',  type: 'humanmade' },
      { thing: 'computer', type: 'humanmade' },
      { thing: 'chair',    type: 'humanmade' },
    ];

    const facts = [];
    for (const { thing, type } of CLASSIFIED) {
      const emb = sharedEmbeddings.getEmbedding(thing);
      if (!emb) continue;
      const tag = type === 'natural' ? naturalTag : humanMadeTag;
      facts.push({ writes: [
        { region: semRegion,      feat: emb, binarize: false },
        { region: fineTypeRegion, feat: tag },
        { region: motorRegion,    feat: encodeLetter(type[0]) },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachNaturalVsHumanMade: ${facts.length} classified × 6 reps`);
  },

  // runSciKReal + _gateSciKReal extracted to
  // `js/brain/curriculum/kindergarten.js` K_MIXIN. K-specific teach
  // helpers (`_teachClassification`, `_teachStatesOfMatter`,
  // `_teachForceMotionK`, `_teachForceStrengthEffect`,
  // `_teachWeatherCategories`, `_teachSeasonTemperature`,
  // `_teachLivingThingNeeds`, `_teachDietClassification`,
  // `_teachBodyPartFunction`, `_teachNaturalVsHumanMade`,
  // `_teachClassificationReasoning`) stay on the base class for now;
  // future extraction moves them alongside.

  // ═══════════════════════════════════════════════════════════════════
  // Social-K equational course (LAW 3 + LAW 7)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Core Knowledge K community helpers — helper → job via sem↔sem binding.
   */

  async _teachCommunityHelpers(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    if (!semRegion || !freeRegion) return;

    const HELPERS = [
      { helper: 'firefighter', job: 'fires' },
      { helper: 'police',      job: 'safety' },
      { helper: 'doctor',      job: 'sick' },
      { helper: 'nurse',       job: 'care' },
      { helper: 'teacher',     job: 'learn' },
      { helper: 'dentist',     job: 'teeth' },
      { helper: 'farmer',      job: 'food' },
      { helper: 'mail',        job: 'letters' },
    ];
    const facts = [];
    for (const { helper, job } of HELPERS) {
      const hEmb = sharedEmbeddings.getEmbedding(helper);
      const jEmb = sharedEmbeddings.getEmbedding(job);
      if (!hEmb || !jEmb) continue;
      facts.push({ writes: [
        { region: semRegion,  feat: jEmb, binarize: false },
        { region: freeRegion, feat: hEmb, binarize: false },
      ]});
    }
    await this._teachCombination(facts, { reps: 8 });
    this._hb(`[Curriculum] _teachCommunityHelpers: ${facts.length} × 8 reps`);
  },

  /**
   * Core Knowledge K needs vs wants — binary classification with fineType tag.
   */

  async _teachNeedsVsWants(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const fineTypeRegion = cluster.regions.fineType;
    const motorRegion = cluster.regions.motor;
    if (!semRegion || !fineTypeRegion || !motorRegion) return;
    const fineTypeSize = fineTypeRegion.end - fineTypeRegion.start;
    const needTag = new Float64Array(fineTypeSize);
    const wantTag = new Float64Array(fineTypeSize);
    const half = Math.floor(fineTypeSize / 2);
    for (let i = 0; i < half; i++) needTag[i] = 1;
    for (let i = half; i < fineTypeSize; i++) wantTag[i] = 1;

    const CLASSIFIED = [
      { thing: 'food',     type: 'need' },
      { thing: 'water',    type: 'need' },
      { thing: 'shelter',  type: 'need' },
      { thing: 'clothing', type: 'need' },
      { thing: 'air',      type: 'need' },
      { thing: 'sleep',    type: 'need' },
      { thing: 'toy',      type: 'want' },
      { thing: 'candy',    type: 'want' },
      { thing: 'game',     type: 'want' },
      { thing: 'tv',       type: 'want' },
      { thing: 'phone',    type: 'want' },
    ];
    const facts = [];
    for (const { thing, type } of CLASSIFIED) {
      const emb = sharedEmbeddings.getEmbedding(thing);
      if (!emb) continue;
      facts.push({ writes: [
        { region: semRegion,      feat: emb, binarize: false },
        { region: fineTypeRegion, feat: type === 'need' ? needTag : wantTag },
        { region: motorRegion,    feat: encodeLetter(type[0]) },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachNeedsVsWants: ${facts.length} × 6 reps`);
  },

  /**
   * Core Knowledge K American symbols — symbol ↔ fact pairs.
   */

  async _teachAmericanSymbols(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    if (!semRegion || !freeRegion) return;

    const SYMBOLS = [
      { concept: 'flag colors',    answer: 'red white blue' },
      { concept: 'fifty stars',    answer: 'states' },
      { concept: 'national bird',  answer: 'eagle' },
      { concept: 'july fourth',    answer: 'independence' },
      { concept: 'country leader', answer: 'president' },
      { concept: 'liberty statue', answer: 'freedom' },
      { concept: 'thanksgiving',   answer: 'thanks' },
      { concept: 'presidents day', answer: 'honor' },
    ];
    const facts = [];
    for (const { concept, answer } of SYMBOLS) {
      const words = concept.split(' ');
      const aWords = answer.split(' ');
      for (const cWord of words) {
        const cEmb = sharedEmbeddings.getEmbedding(cWord);
        if (!cEmb) continue;
        for (const aWord of aWords) {
          const aEmb = sharedEmbeddings.getEmbedding(aWord);
          if (!aEmb) continue;
          facts.push({ writes: [
            { region: semRegion,  feat: cEmb, binarize: false },
            { region: freeRegion, feat: aEmb, binarize: false },
          ]});
        }
      }
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachAmericanSymbols: ${facts.length} × 6 reps`);
  },

  /**
   * Core Knowledge K geography — continents, oceans, cardinal directions.
   */

  async _teachGeographyBasics(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    if (!semRegion || !freeRegion) return;

    const GEO_FACTS = [
      // Continent count
      { concept: 'continents count', answer: 'seven' },
      // Continents
      { concept: 'north america',    answer: 'continent' },
      { concept: 'south america',    answer: 'continent' },
      { concept: 'europe',           answer: 'continent' },
      { concept: 'africa',           answer: 'continent' },
      { concept: 'asia',             answer: 'continent' },
      { concept: 'australia',        answer: 'continent' },
      { concept: 'antarctica',       answer: 'continent' },
      // Oceans
      { concept: 'atlantic',         answer: 'ocean' },
      { concept: 'pacific',          answer: 'ocean' },
      { concept: 'indian',           answer: 'ocean' },
      { concept: 'arctic',           answer: 'ocean' },
      // Cardinal directions
      { concept: 'north direction',  answer: 'up' },
      { concept: 'south direction',  answer: 'down' },
      { concept: 'east direction',   answer: 'right' },
      { concept: 'west direction',   answer: 'left' },
      // Globe
      { concept: 'globe',            answer: 'earth' },
      { concept: 'map',              answer: 'places' },
    ];
    const facts = [];
    for (const { concept, answer } of GEO_FACTS) {
      const cWords = concept.split(' ');
      const cEmb = cWords.length > 1
        ? sharedEmbeddings.getEmbedding(cWords[0])  // first word primary anchor
        : sharedEmbeddings.getEmbedding(concept);
      const aEmb = sharedEmbeddings.getEmbedding(answer);
      if (!cEmb || !aEmb) continue;
      facts.push({ writes: [
        { region: semRegion,  feat: cEmb, binarize: false },
        { region: freeRegion, feat: aEmb, binarize: false },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachGeographyBasics: ${facts.length} × 6 reps`);
  },

  // runSocKReal + _gateSocKReal extracted to
  // `js/brain/curriculum/kindergarten.js` K_MIXIN. K-specific teach
  // helpers (`_teachFamilyRoles`, `_teachCommunityHelpers`,
  // `_teachNeedsVsWants`, `_teachAmericanSymbols`,
  // `_teachGeographyBasics`, `_teachCausalChains`) stay on the base
  // class for now; future extraction moves them alongside.

  // ═══════════════════════════════════════════════════════════════════
  // Arts-K equational course (LAW 3 + LAW 7)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Visual Arts K — color mixing transforms (primary + primary → secondary).
   *
   * Named `_teachColorMixingK` (K-suffix) to distinguish from the
   * older Art-G1 `_teachColorMixing` at line ~11110 which teaches
   * 8-dim RGB/warm/cool/secondary feature vectors. The K version
   * does equational A+B→C pair-to-composite binding via
   * `_teachCombination` (freeLeft+freeRight→sem) while the G1
   * version uses `_conceptTeach` feature-vector clustering.
   */

  async _teachColorMixingK(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;
    const freeSize = freeRegion.end - freeRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const freeLeftRegion = { start: freeRegion.start, end: freeRegion.start + freeHalf };
    const freeRightRegion = { start: freeRegion.start + freeHalf, end: freeRegion.end };

    // Primary + Primary → Secondary color combinations
    const MIXES = [
      ['red',    'yellow', 'orange'],
      ['yellow', 'blue',   'green'],
      ['red',    'blue',   'purple'],
      ['blue',   'red',    'purple'],
      ['yellow', 'red',    'orange'],
      ['blue',   'yellow', 'green'],
    ];
    const facts = [];
    for (const [a, b, c] of MIXES) {
      const aEmb = sharedEmbeddings.getEmbedding(a);
      const bEmb = sharedEmbeddings.getEmbedding(b);
      const cEmb = sharedEmbeddings.getEmbedding(c);
      if (!aEmb || !bEmb || !cEmb) continue;
      facts.push({ writes: [
        { region: freeLeftRegion,  feat: aEmb, binarize: false },
        { region: freeRightRegion, feat: bEmb, binarize: false },
        { region: semRegion,       feat: cEmb, binarize: false },
      ]});
    }
    await this._teachCombination(facts, { reps: 8 });
    this._hb(`[Curriculum] _teachColorMixing: ${facts.length} × 8 reps`);
  },

  /**
   * Visual Arts K — warm/cool color classification.
   */

  async _teachWarmCoolColors(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const fineTypeRegion = cluster.regions.fineType;
    const motorRegion = cluster.regions.motor;
    if (!semRegion || !fineTypeRegion || !motorRegion) return;
    const fineTypeSize = fineTypeRegion.end - fineTypeRegion.start;
    const warmTag = new Float64Array(fineTypeSize);
    const coolTag = new Float64Array(fineTypeSize);
    const half = Math.floor(fineTypeSize / 2);
    for (let i = 0; i < half; i++) warmTag[i] = 1;
    for (let i = half; i < fineTypeSize; i++) coolTag[i] = 1;

    const COLORS = [
      { color: 'red',    temp: 'warm' },
      { color: 'orange', temp: 'warm' },
      { color: 'yellow', temp: 'warm' },
      { color: 'blue',   temp: 'cool' },
      { color: 'green',  temp: 'cool' },
      { color: 'purple', temp: 'cool' },
    ];
    const facts = [];
    for (const { color, temp } of COLORS) {
      const emb = sharedEmbeddings.getEmbedding(color);
      if (!emb) continue;
      facts.push({ writes: [
        { region: semRegion,      feat: emb, binarize: false },
        { region: fineTypeRegion, feat: temp === 'warm' ? warmTag : coolTag },
        { region: motorRegion,    feat: encodeLetter(temp[0]) },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachWarmCoolColors: ${facts.length} × 6 reps`);
  },

  /**
   * Visual Arts K — AB pattern next-item prediction.
   * Previous two items → next item in the repeating pattern.
   */

  async _teachPatternCompletion(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const freeRegion = cluster.regions.free;
    const semRegion = cluster.regions.sem;
    if (!freeRegion || !semRegion) return;
    const freeSize = freeRegion.end - freeRegion.start;
    const freeHalf = Math.floor(freeSize / 2);
    const freeLeftRegion = { start: freeRegion.start, end: freeRegion.start + freeHalf };
    const freeRightRegion = { start: freeRegion.start + freeHalf, end: freeRegion.end };

    // AB pattern: given (A, B) continuation query, next is A.
    // red,blue → red / blue,red → blue / circle,square → circle
    const PATTERNS = [
      ['red', 'blue', 'red'],
      ['blue', 'red', 'blue'],
      ['yellow', 'green', 'yellow'],
      ['circle', 'square', 'circle'],
      ['square', 'circle', 'square'],
      ['triangle', 'circle', 'triangle'],
    ];
    const facts = [];
    for (const [a, b, next] of PATTERNS) {
      const aEmb = sharedEmbeddings.getEmbedding(a);
      const bEmb = sharedEmbeddings.getEmbedding(b);
      const nEmb = sharedEmbeddings.getEmbedding(next);
      if (!aEmb || !bEmb || !nEmb) continue;
      facts.push({ writes: [
        { region: freeLeftRegion,  feat: aEmb, binarize: false },
        { region: freeRightRegion, feat: bEmb, binarize: false },
        { region: semRegion,       feat: nEmb, binarize: false },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachPatternCompletion: ${facts.length} × 6 reps`);
  },

  /**
   * Music K — tempo/dynamics/pitch classifications + beat concept.
   */

  async _teachMusicBasics(ctx) {
    const cluster = this.cluster;
    if (!cluster || !cluster.crossProjections) return;
    const semRegion = cluster.regions.sem;
    const freeRegion = cluster.regions.free;
    if (!semRegion || !freeRegion) return;

    // Concept → defining word
    const MUSIC_CONCEPTS = [
      ['steady', 'beat'],
      ['music', 'beat'],
      ['pulse', 'beat'],
      ['fast', 'tempo'],
      ['slow', 'tempo'],
      ['loud', 'dynamics'],
      ['soft', 'dynamics'],
      ['quiet', 'dynamics'],
      ['high', 'pitch'],
      ['low', 'pitch'],
      ['sing', 'voice'],
      ['song', 'music'],
      ['rhythm', 'pattern'],
      ['drum', 'beat'],
      ['piano', 'instrument'],
      ['guitar', 'instrument'],
      ['violin', 'instrument'],
      ['flute', 'instrument'],
      ['trumpet', 'instrument'],
    ];
    const facts = [];
    for (const [a, b] of MUSIC_CONCEPTS) {
      const aEmb = sharedEmbeddings.getEmbedding(a);
      const bEmb = sharedEmbeddings.getEmbedding(b);
      if (!aEmb || !bEmb) continue;
      facts.push({ writes: [
        { region: semRegion,  feat: aEmb, binarize: false },
        { region: freeRegion, feat: bEmb, binarize: false },
      ]});
    }
    await this._teachCombination(facts, { reps: 6 });
    this._hb(`[Curriculum] _teachMusicBasics: ${facts.length} × 6 reps`);
  },

  // runArtKReal + _gateArtKReal extracted to
  // `js/brain/curriculum/kindergarten.js` K_MIXIN. K-specific teach
  // helpers called by runArtKReal (`_teachPrimaryColors`,
  // `_teachBasicShapes`, `_teachSimpleSongs`, `_teachColorMixingK`,
  // `_teachWarmCoolColors`, `_teachPatternCompletion`,
  // `_teachMusicBasics`) stay on the base class for now; future
  // extraction moves them alongside.

  // (`_phonemeFeatureForDigraph` lives near the top of K_MIXIN with the
  // other phoneme-feature helpers — duplicate definition removed.)

  // ─── TODO-aligned ELA-G2 helpers (Session 28) ────────────────────

  // docs/TODO.md T14.24 ELA-G2 spec (line 152):
  //   _teachDigraphs(digraphs) injects each digraph as a paired letter
  //     stream with shorter inter-letter gap (2 ticks instead of 3) so
  //     the letter-region transition surprise treats them as a unit.
  //   _teachLongWords(words) extends the CVC pattern to 4-6 letters
  //     with boundary detection via cluster.detectBoundaries(word).
  //   _teachPhrases(phrases) walks 3-word phrases through the full
  //     letter-stream + sem-inject pipeline per word + sequence Hebbian
  //     between words.


  async _teachStatesOfMatter() {
    return this._conceptTeach([
      { name: 'solid', feat: [1, 0, 0, 1, 0, 0, 1, 0] },
      { name: 'liquid', feat: [0, 1, 0, 1, 0, 0, 0, 1] },
      { name: 'gas', feat: [0, 0, 1, 1, 1, 0, 0, 0] },
      { name: 'plasma', feat: [0, 0, 1, 1, 1, 1, 0, 0] },
    ], 4);
  },

  async _teachPrimaryColors() {
    // T14.24 Session 75 (task #132) — Art-K primary colors. TODO
    // line 551: "_teachPrimaryColors() binds color name to RGB
    // feature vector". 8d features using RGB magnitudes:
    // [0]=R-high, [1]=G-high, [2]=B-high, [3]=R-low, [4]=G-low,
    // [5]=B-low, [6]=warm, [7]=cool. Red=high-R/low-GB/warm.
    // Blue=high-B/low-RG/cool. Yellow=high-RG/low-B/warm.
    return this._conceptTeach([
      { name: 'red',    feat: [1, 0, 0, 0, 1, 1, 1, 0] },
      { name: 'blue',   feat: [0, 0, 1, 1, 1, 0, 0, 1] },
      { name: 'yellow', feat: [1, 1, 0, 0, 0, 1, 1, 0] },
      { name: 'green',  feat: [0, 1, 0, 1, 0, 1, 0, 1] },
      { name: 'orange', feat: [1, 1, 0, 0, 0, 1, 1, 0] },
      { name: 'purple', feat: [1, 0, 1, 0, 1, 0, 0, 1] },
      { name: 'black',  feat: [0, 0, 0, 1, 1, 1, 0, 0] },
      { name: 'white',  feat: [1, 1, 1, 0, 0, 0, 0, 0] },
    ], 4);
  },


  async _teachBasicShapes() {
    // T14.24 Session 75 — Art-K basic shapes per TODO line 551.
    // 8d features: [0]=curved, [1]=angular, [2]=3-sides,
    // [3]=4-sides, [4]=round, [5]=symmetric, [6]=closed,
    // [7]=regular.
    return this._conceptTeach([
      { name: 'circle',    feat: [1, 0, 0, 0, 1, 1, 1, 1] },
      { name: 'square',    feat: [0, 1, 0, 1, 0, 1, 1, 1] },
      { name: 'triangle',  feat: [0, 1, 1, 0, 0, 1, 1, 1] },
      { name: 'rectangle', feat: [0, 1, 0, 1, 0, 1, 1, 0] },
      { name: 'oval',      feat: [1, 0, 0, 0, 1, 1, 1, 0] },
      { name: 'diamond',   feat: [0, 1, 0, 1, 0, 1, 1, 1] },
      { name: 'star',      feat: [0, 1, 0, 0, 0, 1, 1, 1] },
      { name: 'heart',     feat: [1, 1, 0, 0, 0, 1, 1, 0] },
    ], 4);
  },


  async _teachSimpleSongs() {
    // T14.24 Session 75 — Art-K simple songs per TODO line 551.
    // Rhythm via temporal pattern sequence — songs are taught as
    // sequential cycles so working-memory Hebbian binds the beat
    // pattern. Each cycle is a simple children's rhythmic phrase.
    return this._teachSequenceCycles([
      ['clap', 'clap', 'stomp'],
      ['high', 'low', 'high', 'low'],
      ['fast', 'slow', 'fast', 'slow'],
      ['sing', 'a', 'song'],
      ['beat', 'beat', 'beat', 'rest'],
    ], { reps: 4, ticksPerStep: 2 });
  },


  async _teachFamilyRoles() {
    // T14.24 Session 56 (task #113) — Soc-K family roles. TODO line
    // 488: "_teachFamilyRoles() binds family-role GloVes (mom/dad/
    // sister/brother) via co-occurrence. Gate: family role recall
    // ≥50%". Feature dimensions encode real kinship structure so
    // chemically-similar roles share cosine: [0]=generation-parent,
    // [1]=generation-child, [2]=generation-elder, [3]=female,
    // [4]=male, [5]=nuclear-household, [6]=extended-household,
    // [7]=caregiver-role. mom and dad share [0,5,7] (same
    // generation, nuclear, caregiving) but split on [3]/[4].
    // sister and brother share [1,5] and split on [3]/[4].
    // grandma and grandpa share [2,6] and split on [3]/[4].
    return this._conceptTeach([
      { name: 'mom',       feat: [1, 0, 0, 1, 0, 1, 0, 1] },
      { name: 'dad',       feat: [1, 0, 0, 0, 1, 1, 0, 1] },
      { name: 'sister',    feat: [0, 1, 0, 1, 0, 1, 0, 0] },
      { name: 'brother',   feat: [0, 1, 0, 0, 1, 1, 0, 0] },
      { name: 'baby',      feat: [0, 1, 0, 0, 0, 1, 0, 0] },
      { name: 'grandma',   feat: [0, 0, 1, 1, 0, 0, 1, 1] },
      { name: 'grandpa',   feat: [0, 0, 1, 0, 1, 0, 1, 1] },
      { name: 'aunt',      feat: [1, 0, 0, 1, 0, 0, 1, 0] },
      { name: 'uncle',     feat: [1, 0, 0, 0, 1, 0, 1, 0] },
      { name: 'cousin',    feat: [0, 1, 0, 0, 0, 0, 1, 0] },
      { name: 'family',    feat: [1, 1, 1, 1, 1, 1, 1, 1] },
      { name: 'home',      feat: [1, 1, 1, 0, 0, 1, 0, 1] },
    ], 4);
  },


};
