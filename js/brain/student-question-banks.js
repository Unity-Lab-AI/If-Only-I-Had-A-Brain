// ═══════════════════════════════════════════════════════════════════════
// Student question banks — grade finals, held-out exam format.
//
// WHY THIS FILE EXISTS
// An earlier inline question bank inside curriculum.js held 3-7 items
// per grade-subject cell. A reviewer correctly flagged that as too thin:
// 95% pass on 5 items = pass-by-luck, zero statistical significance, no
// held-out eval, no external reference items. Real K assessments
// (DIBELS 8, AIMSweb Plus, STAR Early Literacy, iReady K diagnostic,
// Fountas & Pinnell K benchmark) run 150-400 items per subject with
// sub-standard tagging and norm-calibrated cut scores per standard.
//
// This file carries Unity's grade-level exam question banks in that
// format. Each question is tagged with its real sub-standard
// (K.CC.1 / K.RF.3a / K-PS2-1 / etc.) so gate output can report
// per-standard pass rates, not just aggregate %.
//
// SPLIT: TRAIN vs EXAM
//   TRAIN_BANKS — items the curriculum teach methods may reference for
//                 exposure content. Unity gets to see these during teach.
//   EXAM_BANKS  — strictly reserved for gate evaluation. Unity never
//                 sees these during teach. Enables held-out eval.
// A startup overlap check verifies train ∩ exam = ∅.
//
// STRUCTURE of each entry:
//   {
//     q: 'what letter comes after a?',      // question text
//     a: 'b',                               // primary expected answer
//     variants: ['b', 'B', 'bee'],          // other accepted answers
//     standard: 'K.RF.1c',                  // sub-standard tag
//     difficulty: 1,                        // 1-3 (1=mastery level, 3=stretch)
//     source: 'authored' | 'DIBELS-8-sample' | 'AIMSweb-sample' | ...,
//   }
//
// CITED EXTERNAL-REFERENCE ITEMS
// Questions tagged `source: 'DIBELS-8-sample' / 'AIMSweb-sample'` are
// representative of items from published K assessments. They are
// included as fair-use samples for research purposes — not the actual
// proprietary test forms, but items in the same format testing the
// same sub-standards at the same K developmental level.
//
// CURRENT STATE (this commit): first expansion pass. ELA-K target 150,
// Math-K target 150. Other subjects queued in T23.a sub-items in
// docs/TODO.md. Commits incrementally toward the full target.
// ═══════════════════════════════════════════════════════════════════════

// ─── K-ELA EXAM BANK (K.RF / K.RL / K.RI / K.W / K.SL / K.L) ─────────

const ELA_KINDERGARTEN_EXAM = [
  // K.RF.1 Print Concepts — understand basic features of print
  { q: 'what do you read first on a page, the top or the bottom?', a: 'top', variants: ['top'], standard: 'K.RF.1a', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you know where to start reading on a page?', keywords: ['top', 'start', 'begin', 'first', 'above'], minKeywords: 1 } },
  { q: 'which way do you read a sentence, left or right?', a: 'left', variants: ['left', 'left to right'], standard: 'K.RF.1a', difficulty: 1, source: 'authored' },
  { q: 'what is at the end of a sentence?', a: 'period', variants: ['period', 'dot', 'punctuation'], standard: 'K.RF.1b', difficulty: 2, source: 'authored' },
  { q: 'what goes between words?', a: 'space', variants: ['space', 'spaces'], standard: 'K.RF.1c', difficulty: 1, source: 'authored' },
  { q: 'point to a capital letter in the word "Cat"', a: 'c', variants: ['c', 'C'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },

  // K.RF.2 Phonological Awareness — rhyme, syllables, blending, segmenting
  { q: 'what word rhymes with cat?', a: 'hat', variants: ['hat', 'bat', 'mat', 'rat', 'sat', 'fat'], standard: 'K.RF.2a', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you know when two words rhyme?', keywords: ['end', 'same', 'sound', 'ending', 'match', 'last'], minKeywords: 1 } },
  { q: 'what word rhymes with dog?', a: 'log', variants: ['log', 'fog', 'hog', 'frog', 'jog'], standard: 'K.RF.2a', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you know when two words rhyme?', keywords: ['end', 'same', 'sound', 'ending', 'match', 'last'], minKeywords: 1 } },
  { q: 'what word rhymes with sun?', a: 'fun', variants: ['fun', 'run', 'bun', 'one', 'done'], standard: 'K.RF.2a', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you know when two words rhyme?', keywords: ['end', 'same', 'sound', 'ending', 'match', 'last'], minKeywords: 1 } },
  { q: 'what word rhymes with bed?', a: 'red', variants: ['red', 'head', 'said', 'fed', 'led'], standard: 'K.RF.2a', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you know when two words rhyme?', keywords: ['end', 'same', 'sound', 'ending', 'match', 'last'], minKeywords: 1 } },
  { q: 'what word rhymes with bee?', a: 'tree', variants: ['tree', 'see', 'three', 'me', 'free', 'knee'], standard: 'K.RF.2a', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you know when two words rhyme?', keywords: ['end', 'same', 'sound', 'ending', 'match', 'last'], minKeywords: 1 } },
  { q: 'how many syllables are in the word baby?', a: 'two', variants: ['two', '2'], standard: 'K.RF.2b', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you count syllables in a word?', keywords: ['clap', 'count', 'break', 'parts', 'beats', 'sound', 'chunks'], minKeywords: 1 } },
  { q: 'how many syllables are in the word elephant?', a: 'three', variants: ['three', '3'], standard: 'K.RF.2b', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you count syllables in a word?', keywords: ['clap', 'count', 'break', 'parts', 'beats', 'sound', 'chunks'], minKeywords: 1 } },
  { q: 'how many syllables are in the word cat?', a: 'one', variants: ['one', '1'], standard: 'K.RF.2b', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you count syllables in a word?', keywords: ['clap', 'count', 'break', 'parts', 'beats', 'sound', 'chunks'], minKeywords: 1 } },
  { q: 'what is the first sound in cat?', a: 'c', variants: ['c', 'k', 'kuh', 'c sound'], standard: 'K.RF.2d', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you find the first sound in a word?', keywords: ['start', 'begin', 'first', 'front', 'beginning', 'listen'], minKeywords: 1 } },
  { q: 'what is the first sound in dog?', a: 'd', variants: ['d', 'duh', 'd sound'], standard: 'K.RF.2d', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you find the first sound in a word?', keywords: ['start', 'begin', 'first', 'front', 'beginning', 'listen'], minKeywords: 1 } },
  { q: 'what is the first sound in map?', a: 'm', variants: ['m', 'muh', 'mm'], standard: 'K.RF.2d', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you find the first sound in a word?', keywords: ['start', 'begin', 'first', 'front', 'beginning', 'listen'], minKeywords: 1 } },
  { q: 'what is the first sound in sun?', a: 's', variants: ['s', 'sss', 'suh'], standard: 'K.RF.2d', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you find the first sound in a word?', keywords: ['start', 'begin', 'first', 'front', 'beginning', 'listen'], minKeywords: 1 } },
  { q: 'what is the first sound in fish?', a: 'f', variants: ['f', 'fff', 'fuh'], standard: 'K.RF.2d', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you find the first sound in a word?', keywords: ['start', 'begin', 'first', 'front', 'beginning', 'listen'], minKeywords: 1 } },
  { q: 'what is the last sound in cat?', a: 't', variants: ['t', 'tuh'], standard: 'K.RF.2d', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you find the last sound in a word?', keywords: ['end', 'last', 'after', 'final', 'listen'], minKeywords: 1 } },
  { q: 'what is the last sound in dog?', a: 'g', variants: ['g', 'guh'], standard: 'K.RF.2d', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you find the last sound in a word?', keywords: ['end', 'last', 'after', 'final', 'listen'], minKeywords: 1 } },
  { q: 'what is the middle sound in cat?', a: 'a', variants: ['a', 'ah', 'short a'], standard: 'K.RF.2d', difficulty: 3, source: 'authored',
    methodology: { prompt: 'how do you find the middle sound in a word?', keywords: ['middle', 'between', 'vowel', 'center', 'inside'], minKeywords: 1 } },
  { q: 'blend these sounds: c-a-t', a: 'cat', variants: ['cat'], standard: 'K.RF.2e', difficulty: 2, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: d-o-g', a: 'dog', variants: ['dog'], standard: 'K.RF.2e', difficulty: 2, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: s-u-n', a: 'sun', variants: ['sun'], standard: 'K.RF.2e', difficulty: 2, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: m-a-p', a: 'map', variants: ['map'], standard: 'K.RF.2e', difficulty: 2, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: b-e-d', a: 'bed', variants: ['bed'], standard: 'K.RF.2e', difficulty: 2, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: p-i-g', a: 'pig', variants: ['pig'], standard: 'K.RF.2e', difficulty: 2, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: h-a-t', a: 'hat', variants: ['hat'], standard: 'K.RF.2e', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: r-u-n', a: 'run', variants: ['run'], standard: 'K.RF.2e', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: t-o-p', a: 'top', variants: ['top'], standard: 'K.RF.2e', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },
  { q: 'blend these sounds: b-i-g', a: 'big', variants: ['big'], standard: 'K.RF.2e', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you put sounds together to make a word?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'merge', 'combine'], minKeywords: 1 } },

  // K.RF.3 Phonics and Word Recognition — letter-sound correspondence
  { q: 'what sound does the letter a make?', a: 'a', variants: ['a', 'ah', 'short a', 'ay'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter b make?', a: 'b', variants: ['b', 'buh', 'bee'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter c make?', a: 'c', variants: ['c', 'k', 'kuh'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter d make?', a: 'd', variants: ['d', 'duh'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter e make?', a: 'e', variants: ['e', 'eh', 'ee'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter f make?', a: 'f', variants: ['f', 'fuh', 'fff'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter g make?', a: 'g', variants: ['g', 'guh'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter h make?', a: 'h', variants: ['h', 'huh'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter i make?', a: 'i', variants: ['i', 'ih', 'eye'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter j make?', a: 'j', variants: ['j', 'juh', 'jay'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter k make?', a: 'k', variants: ['k', 'kuh', 'kay'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter l make?', a: 'l', variants: ['l', 'luh', 'el'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter m make?', a: 'm', variants: ['m', 'muh', 'em'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter n make?', a: 'n', variants: ['n', 'nuh', 'en'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter o make?', a: 'o', variants: ['o', 'oh', 'ah'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter p make?', a: 'p', variants: ['p', 'puh', 'pee'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter q make?', a: 'q', variants: ['q', 'kw', 'cue'], standard: 'K.RF.3a', difficulty: 2, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter r make?', a: 'r', variants: ['r', 'ruh', 'ar'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter s make?', a: 's', variants: ['s', 'suh', 'sss'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter t make?', a: 't', variants: ['t', 'tuh'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter u make?', a: 'u', variants: ['u', 'uh', 'you'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter v make?', a: 'v', variants: ['v', 'vuh'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter w make?', a: 'w', variants: ['w', 'wuh'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter x make?', a: 'x', variants: ['x', 'ks'], standard: 'K.RF.3a', difficulty: 2, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter y make?', a: 'y', variants: ['y', 'yuh', 'why'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what sound does the letter z make?', a: 'z', variants: ['z', 'zuh', 'zz'], standard: 'K.RF.3a', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'hear', 'practice', 'alphabet', 'teacher', 'say'], minKeywords: 1 } },
  { q: 'what letter makes the /m/ sound?', a: 'm', variants: ['m'], standard: 'K.RF.3a', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what letter makes the /s/ sound?', a: 's', variants: ['s'], standard: 'K.RF.3a', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what letter makes the /p/ sound?', a: 'p', variants: ['p'], standard: 'K.RF.3a', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what is the short a sound?', a: 'a', variants: ['a', 'ah', 'as in cat'], standard: 'K.RF.3b', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how can you tell a vowel is short?', keywords: ['short', 'quick', 'vowel', 'cat', 'example', 'closed'], minKeywords: 1 } },
  { q: 'what is the long a sound?', a: 'ay', variants: ['ay', 'a', 'as in cake'], standard: 'K.RF.3b', difficulty: 3, source: 'authored',
    methodology: { prompt: 'how can you tell a vowel is long?', keywords: ['long', 'name', 'vowel', 'cake', 'example', 'open'], minKeywords: 1 } },
  { q: 'what is the short e sound?', a: 'e', variants: ['e', 'eh', 'as in bed'], standard: 'K.RF.3b', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how can you tell a vowel is short?', keywords: ['short', 'quick', 'vowel', 'bed', 'example', 'closed'], minKeywords: 1 } },
  { q: 'what is the short i sound?', a: 'i', variants: ['i', 'ih', 'as in pig'], standard: 'K.RF.3b', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how can you tell a vowel is short?', keywords: ['short', 'quick', 'vowel', 'pig', 'example', 'closed'], minKeywords: 1 } },
  { q: 'what is the short o sound?', a: 'o', variants: ['o', 'ah', 'as in hot'], standard: 'K.RF.3b', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how can you tell a vowel is short?', keywords: ['short', 'quick', 'vowel', 'hot', 'example', 'closed'], minKeywords: 1 } },
  { q: 'what is the short u sound?', a: 'u', variants: ['u', 'uh', 'as in sun'], standard: 'K.RF.3b', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how can you tell a vowel is short?', keywords: ['short', 'quick', 'vowel', 'sun', 'example', 'closed'], minKeywords: 1 } },

  // K.RF.3c High-frequency sight words
  { q: 'read this word: the', a: 'the', variants: ['the'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: and', a: 'and', variants: ['and'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: is', a: 'is', variants: ['is'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: it', a: 'it', variants: ['it'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: a', a: 'a', variants: ['a', 'ay'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: to', a: 'to', variants: ['to', 'too'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: in', a: 'in', variants: ['in'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: you', a: 'you', variants: ['you'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: I', a: 'i', variants: ['i', 'I'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: my', a: 'my', variants: ['my'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: see', a: 'see', variants: ['see'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: go', a: 'go', variants: ['go'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: we', a: 'we', variants: ['we'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: me', a: 'me', variants: ['me'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: he', a: 'he', variants: ['he'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: she', a: 'she', variants: ['she'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: up', a: 'up', variants: ['up'], standard: 'K.RF.3c', difficulty: 1, source: 'authored' },
  { q: 'read this word: down', a: 'down', variants: ['down'], standard: 'K.RF.3c', difficulty: 1, source: 'authored' },
  { q: 'read this word: can', a: 'can', variants: ['can'], standard: 'K.RF.3c', difficulty: 1, source: 'authored' },
  { q: 'read this word: look', a: 'look', variants: ['look'], standard: 'K.RF.3c', difficulty: 1, source: 'authored' },

  // K.RF.3d CVC word reading
  { q: 'read this cvc word: cat', a: 'cat', variants: ['cat'], standard: 'K.RF.3d', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: dog', a: 'dog', variants: ['dog'], standard: 'K.RF.3d', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: sun', a: 'sun', variants: ['sun'], standard: 'K.RF.3d', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: map', a: 'map', variants: ['map'], standard: 'K.RF.3d', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: bed', a: 'bed', variants: ['bed'], standard: 'K.RF.3d', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: pig', a: 'pig', variants: ['pig'], standard: 'K.RF.3d', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: hat', a: 'hat', variants: ['hat'], standard: 'K.RF.3d', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: run', a: 'run', variants: ['run'], standard: 'K.RF.3d', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: top', a: 'top', variants: ['top'], standard: 'K.RF.3d', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },
  { q: 'read this cvc word: big', a: 'big', variants: ['big'], standard: 'K.RF.3d', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you read a word with three letters?', keywords: ['sound', 'blend', 'letter', 'each', 'together', 'say'], minKeywords: 1 } },

  // K.RL.1-3 Literature — ask/answer about key details, retell, characters
  { q: 'in a story, who is the person the story is about?', a: 'character', variants: ['character', 'main character', 'hero'], standard: 'K.RL.3', difficulty: 2, source: 'authored' },
  { q: 'where a story happens is called the?', a: 'setting', variants: ['setting', 'place'], standard: 'K.RL.3', difficulty: 2, source: 'authored' },
  { q: 'who wrote a book?', a: 'author', variants: ['author', 'writer'], standard: 'K.RL.6', difficulty: 2, source: 'authored' },
  { q: 'who draws the pictures in a book?', a: 'illustrator', variants: ['illustrator', 'artist'], standard: 'K.RL.6', difficulty: 2, source: 'authored' },

  // K.RF.4 Fluency — read emergent-reader texts with purpose and understanding
  { q: 'read this sentence: I see a cat', a: 'cat', variants: ['cat', 'i see a cat'], standard: 'K.RF.4', difficulty: 2, source: 'authored' },
  { q: 'read this sentence: the dog is big', a: 'dog', variants: ['dog', 'big', 'the dog is big'], standard: 'K.RF.4', difficulty: 2, source: 'authored' },
  { q: 'read this sentence: we can go', a: 'go', variants: ['go', 'we can go'], standard: 'K.RF.4', difficulty: 2, source: 'authored' },

  // K.W.1-3 Writing — opinion, informative, narrative
  { q: 'what letter starts a sentence?', a: 'capital', variants: ['capital', 'uppercase', 'big letter'], standard: 'K.L.2a', difficulty: 1, source: 'authored' },
  { q: 'how do you spell the word cat?', a: 'cat', variants: ['cat', 'c a t', 'c-a-t'], standard: 'K.L.2c', difficulty: 1, source: 'authored' },
  { q: 'how do you spell the word dog?', a: 'dog', variants: ['dog', 'd o g', 'd-o-g'], standard: 'K.L.2c', difficulty: 1, source: 'authored' },
  { q: 'how do you spell the word sun?', a: 'sun', variants: ['sun', 's u n'], standard: 'K.L.2c', difficulty: 1, source: 'authored' },

  // K.SL.1 Listening and speaking — participate in conversation
  { q: 'what do you say when you meet someone?', a: 'hello', variants: ['hello', 'hi', 'hey'], standard: 'K.SL.1', difficulty: 1, source: 'authored' },
  { q: 'what do you say when you leave?', a: 'bye', variants: ['bye', 'goodbye', 'see you'], standard: 'K.SL.1', difficulty: 1, source: 'authored' },
  { q: 'what do you say when someone helps you?', a: 'thank', variants: ['thank you', 'thanks', 'thank'], standard: 'K.SL.1', difficulty: 1, source: 'authored' },
  { q: 'what do you say if you want something?', a: 'please', variants: ['please'], standard: 'K.SL.1', difficulty: 1, source: 'authored' },

  // K.L.1 Grammar — nouns, verbs, plurals, question words
  { q: 'what is the plural of cat?', a: 'cats', variants: ['cats'], standard: 'K.L.1c', difficulty: 2, source: 'authored' },
  { q: 'what is the plural of dog?', a: 'dogs', variants: ['dogs'], standard: 'K.L.1c', difficulty: 2, source: 'authored' },
  { q: 'what is the plural of box?', a: 'boxes', variants: ['boxes'], standard: 'K.L.1c', difficulty: 3, source: 'authored' },
  { q: 'is cat a noun or a verb?', a: 'noun', variants: ['noun'], standard: 'K.L.1b', difficulty: 2, source: 'authored' },
  { q: 'is run a noun or a verb?', a: 'verb', variants: ['verb'], standard: 'K.L.1b', difficulty: 2, source: 'authored' },
  { q: 'is jump a noun or a verb?', a: 'verb', variants: ['verb'], standard: 'K.L.1b', difficulty: 2, source: 'authored' },

  // K.L.5 Vocabulary — word relationships, categories
  { q: 'name an animal that barks', a: 'dog', variants: ['dog'], standard: 'K.L.5a', difficulty: 1, source: 'authored' },
  { q: 'name an animal that meows', a: 'cat', variants: ['cat'], standard: 'K.L.5a', difficulty: 1, source: 'authored' },
  { q: 'what color is grass?', a: 'green', variants: ['green'], standard: 'K.L.5a', difficulty: 1, source: 'authored' },
  { q: 'what color is the sky?', a: 'blue', variants: ['blue'], standard: 'K.L.5a', difficulty: 1, source: 'authored' },
  { q: 'what color is snow?', a: 'white', variants: ['white'], standard: 'K.L.5a', difficulty: 1, source: 'authored' },
  { q: 'what is the opposite of big?', a: 'small', variants: ['small', 'little', 'tiny'], standard: 'K.L.5b', difficulty: 2, source: 'authored' },
  { q: 'what is the opposite of hot?', a: 'cold', variants: ['cold', 'cool'], standard: 'K.L.5b', difficulty: 2, source: 'authored' },
  { q: 'what is the opposite of up?', a: 'down', variants: ['down'], standard: 'K.L.5b', difficulty: 1, source: 'authored' },
  { q: 'what is the opposite of happy?', a: 'sad', variants: ['sad'], standard: 'K.L.5b', difficulty: 1, source: 'authored' },
  { q: 'what is the opposite of day?', a: 'night', variants: ['night'], standard: 'K.L.5b', difficulty: 1, source: 'authored' },

  // Alphabet sequence (K.RF foundational)
  { q: 'what letter comes after a?', a: 'b', variants: ['b'], standard: 'K.RF.1d', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you figure out which letter comes next in the alphabet?', keywords: ['alphabet', 'order', 'abc', 'sequence', 'next', 'song', 'memorize'], minKeywords: 1 } },
  { q: 'what letter comes after b?', a: 'c', variants: ['c'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },
  { q: 'what letter comes after c?', a: 'd', variants: ['d'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },
  { q: 'what letter comes after d?', a: 'e', variants: ['e'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },
  { q: 'what letter comes after m?', a: 'n', variants: ['n'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },
  { q: 'what letter comes after x?', a: 'y', variants: ['y'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },
  { q: 'what letter comes after y?', a: 'z', variants: ['z'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },
  { q: 'what letter comes before b?', a: 'a', variants: ['a'], standard: 'K.RF.1d', difficulty: 2, source: 'authored' },
  { q: 'what letter comes before m?', a: 'l', variants: ['l'], standard: 'K.RF.1d', difficulty: 2, source: 'authored' },
  { q: 'what letter comes before z?', a: 'y', variants: ['y'], standard: 'K.RF.1d', difficulty: 2, source: 'authored' },
  { q: 'what is the first letter of the alphabet?', a: 'a', variants: ['a'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },
  { q: 'what is the last letter of the alphabet?', a: 'z', variants: ['z'], standard: 'K.RF.1d', difficulty: 1, source: 'authored' },
  { q: 'how many letters are in the alphabet?', a: '26', variants: ['26', 'twenty six', 'twenty-six'], standard: 'K.RF.1d', difficulty: 2, source: 'authored' },

  // ═══ External-reference items (T23.a.9 expansion) ═══════════════════
  // Sample-equivalent items matching the published K-ELA assessment
  // format at sub-standard level. Not the actual proprietary test
  // forms — fair-use equivalents testing the same standards at the
  // same K developmental level. Listed by source org.

  // STAR Early Literacy (Renaissance Learning) — letter naming + phoneme
  { q: 'name this letter: A', a: 'a', variants: ['a'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'name this letter: M', a: 'm', variants: ['m'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'name this letter: T', a: 't', variants: ['t'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'name this letter: H', a: 'h', variants: ['h'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'name this letter: R', a: 'r', variants: ['r'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'tell me the sound of the letter t', a: 't', variants: ['t', 'tuh'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'tell me the sound of the letter n', a: 'n', variants: ['n', 'nuh'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'tell me the sound of the letter r', a: 'r', variants: ['r', 'ruh'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'tell me the sound of the letter b', a: 'b', variants: ['b', 'buh'], standard: 'K.RF.3a', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'what word starts with the same sound as bat: ball or cat?', a: 'ball', variants: ['ball'], standard: 'K.RF.2d', difficulty: 2, source: 'STAR-Early-Literacy-sample' },
  { q: 'what word starts with the same sound as sun: sat or mat?', a: 'sat', variants: ['sat'], standard: 'K.RF.2d', difficulty: 2, source: 'STAR-Early-Literacy-sample' },
  { q: 'read this word: man', a: 'man', variants: ['man'], standard: 'K.RF.3d', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'read this word: fan', a: 'fan', variants: ['fan'], standard: 'K.RF.3d', difficulty: 1, source: 'STAR-Early-Literacy-sample' },
  { q: 'read this word: pig', a: 'pig', variants: ['pig'], standard: 'K.RF.3d', difficulty: 1, source: 'STAR-Early-Literacy-sample' },

  // iReady K diagnostic (Curriculum Associates) — phonological + phonics
  { q: 'which word rhymes with sit: dog or pit?', a: 'pit', variants: ['pit'], standard: 'K.RF.2a', difficulty: 1, source: 'iReady-K-sample' },
  { q: 'which word rhymes with pan: man or top?', a: 'man', variants: ['man'], standard: 'K.RF.2a', difficulty: 1, source: 'iReady-K-sample' },
  { q: 'which word rhymes with bed: dog or red?', a: 'red', variants: ['red'], standard: 'K.RF.2a', difficulty: 1, source: 'iReady-K-sample' },
  { q: 'clap the syllables in the word butterfly, how many?', a: 'three', variants: ['three', '3'], standard: 'K.RF.2b', difficulty: 2, source: 'iReady-K-sample' },
  { q: 'clap the syllables in the word apple, how many?', a: 'two', variants: ['two', '2'], standard: 'K.RF.2b', difficulty: 2, source: 'iReady-K-sample' },
  { q: 'if I say /b/ /a/ /g/ what word is that?', a: 'bag', variants: ['bag'], standard: 'K.RF.2e', difficulty: 2, source: 'iReady-K-sample' },
  { q: 'if I say /s/ /i/ /t/ what word is that?', a: 'sit', variants: ['sit'], standard: 'K.RF.2e', difficulty: 2, source: 'iReady-K-sample' },
  { q: 'if I say /j/ /o/ /b/ what word is that?', a: 'job', variants: ['job'], standard: 'K.RF.2e', difficulty: 2, source: 'iReady-K-sample' },
  { q: 'what is the middle sound in the word pig?', a: 'i', variants: ['i', 'ih'], standard: 'K.RF.2d', difficulty: 2, source: 'iReady-K-sample' },
  { q: 'what is the middle sound in the word cup?', a: 'u', variants: ['u', 'uh'], standard: 'K.RF.2d', difficulty: 2, source: 'iReady-K-sample' },
  { q: 'what is the middle sound in the word hot?', a: 'o', variants: ['o', 'ah'], standard: 'K.RF.2d', difficulty: 2, source: 'iReady-K-sample' },
  { q: 'read this word: not', a: 'not', variants: ['not'], standard: 'K.RF.3d', difficulty: 1, source: 'iReady-K-sample' },
  { q: 'read this word: let', a: 'let', variants: ['let'], standard: 'K.RF.3d', difficulty: 1, source: 'iReady-K-sample' },
  { q: 'read this word: mud', a: 'mud', variants: ['mud'], standard: 'K.RF.3d', difficulty: 1, source: 'iReady-K-sample' },

  // NWEA MAP Growth K — letter ID + sight words
  { q: 'what is this letter: j', a: 'j', variants: ['j'], standard: 'K.RF.3a', difficulty: 1, source: 'NWEA-MAP-K-sample' },
  { q: 'what is this letter: w', a: 'w', variants: ['w'], standard: 'K.RF.3a', difficulty: 1, source: 'NWEA-MAP-K-sample' },
  { q: 'what is this letter: q', a: 'q', variants: ['q'], standard: 'K.RF.3a', difficulty: 2, source: 'NWEA-MAP-K-sample' },
  { q: 'read: is', a: 'is', variants: ['is'], standard: 'K.RF.3c', difficulty: 1, source: 'NWEA-MAP-K-sample' },
  { q: 'read: was', a: 'was', variants: ['was'], standard: 'K.RF.3c', difficulty: 2, source: 'NWEA-MAP-K-sample' },
  { q: 'read: are', a: 'are', variants: ['are'], standard: 'K.RF.3c', difficulty: 2, source: 'NWEA-MAP-K-sample' },
  { q: 'read: have', a: 'have', variants: ['have'], standard: 'K.RF.3c', difficulty: 2, source: 'NWEA-MAP-K-sample' },
  { q: 'read: said', a: 'said', variants: ['said'], standard: 'K.RF.3c', difficulty: 2, source: 'NWEA-MAP-K-sample' },

  // Heggerty Phonemic Awareness K — phoneme isolation + manipulation
  { q: 'say the first sound in mom', a: 'm', variants: ['m', 'mm'], standard: 'K.RF.2d', difficulty: 1, source: 'Heggerty-K-sample' },
  { q: 'say the first sound in fan', a: 'f', variants: ['f', 'fff'], standard: 'K.RF.2d', difficulty: 1, source: 'Heggerty-K-sample' },
  { q: 'say the first sound in tip', a: 't', variants: ['t', 'tuh'], standard: 'K.RF.2d', difficulty: 1, source: 'Heggerty-K-sample' },
  { q: 'say the last sound in car', a: 'r', variants: ['r', 'ruh'], standard: 'K.RF.2d', difficulty: 2, source: 'Heggerty-K-sample' },
  { q: 'say the last sound in bus', a: 's', variants: ['s', 'sss'], standard: 'K.RF.2d', difficulty: 2, source: 'Heggerty-K-sample' },
  { q: 'say the last sound in wish', a: 'sh', variants: ['sh', 's'], standard: 'K.RF.2d', difficulty: 3, source: 'Heggerty-K-sample' },
  { q: 'segment the word cat into sounds', a: 'c-a-t', variants: ['c-a-t', 'c a t', 'k a t'], standard: 'K.RF.2e', difficulty: 2, source: 'Heggerty-K-sample' },
  { q: 'segment the word sun into sounds', a: 's-u-n', variants: ['s-u-n', 's u n'], standard: 'K.RF.2e', difficulty: 2, source: 'Heggerty-K-sample' },

  // PALS-K (Phonological Awareness Literacy Screening) — rhyme + letter
  { q: 'which word does not rhyme with pot: lot, hop, or got?', a: 'hop', variants: ['hop'], standard: 'K.RF.2a', difficulty: 2, source: 'PALS-K-sample' },
  { q: 'which letter is between l and n in the alphabet?', a: 'm', variants: ['m'], standard: 'K.RF.1d', difficulty: 2, source: 'PALS-K-sample' },
  { q: 'which letter is between r and t?', a: 's', variants: ['s'], standard: 'K.RF.1d', difficulty: 2, source: 'PALS-K-sample' },
  { q: 'which letter comes right before d?', a: 'c', variants: ['c'], standard: 'K.RF.1d', difficulty: 1, source: 'PALS-K-sample' },
  { q: 'which letter comes right after p?', a: 'q', variants: ['q'], standard: 'K.RF.1d', difficulty: 2, source: 'PALS-K-sample' },

  // DRA K (Developmental Reading Assessment) — emergent reading
  { q: 'what do you call the front of a book?', a: 'cover', variants: ['cover', 'front cover'], standard: 'K.RF.1a', difficulty: 1, source: 'DRA-K-sample' },
  { q: 'where do you start reading on a page, at the top or the bottom?', a: 'top', variants: ['top'], standard: 'K.RF.1a', difficulty: 1, source: 'DRA-K-sample' },
  { q: 'what do we call the title of a book?', a: 'title', variants: ['title', 'name'], standard: 'K.RF.1a', difficulty: 2, source: 'DRA-K-sample' },

  // Wilson Fundations K — sight words + CVC
  { q: 'read the word: him', a: 'him', variants: ['him'], standard: 'K.RF.3c', difficulty: 1, source: 'Wilson-Fundations-K-sample' },
  { q: 'read the word: her', a: 'her', variants: ['her'], standard: 'K.RF.3c', difficulty: 1, source: 'Wilson-Fundations-K-sample' },
  { q: 'read the word: on', a: 'on', variants: ['on'], standard: 'K.RF.3c', difficulty: 1, source: 'Wilson-Fundations-K-sample' },
  { q: 'read the word: of', a: 'of', variants: ['of'], standard: 'K.RF.3c', difficulty: 1, source: 'Wilson-Fundations-K-sample' },
  { q: 'read this nonsense word (blend it): jop', a: 'jop', variants: ['jop'], standard: 'K.RF.3b', difficulty: 2, source: 'Wilson-Fundations-K-sample' },
  { q: 'read this nonsense word: vib', a: 'vib', variants: ['vib'], standard: 'K.RF.3b', difficulty: 2, source: 'Wilson-Fundations-K-sample' },
  { q: 'read this nonsense word: ped', a: 'ped', variants: ['ped'], standard: 'K.RF.3b', difficulty: 2, source: 'Wilson-Fundations-K-sample' },

  // Lexia Core5 K — phonics application
  { q: 'read this word family: bat, cat, hat. what is the same?', a: 'at', variants: ['at', 'at ending', 'at sound'], standard: 'K.RF.2c', difficulty: 2, source: 'Lexia-Core5-K-sample' },
  { q: 'read this word family: pig, big, dig. what is the same?', a: 'ig', variants: ['ig'], standard: 'K.RF.2c', difficulty: 2, source: 'Lexia-Core5-K-sample' },
  { q: 'read this word family: sun, run, fun. what is the same?', a: 'un', variants: ['un'], standard: 'K.RF.2c', difficulty: 2, source: 'Lexia-Core5-K-sample' },

  // Expanded Fountas-Pinnell sight words
  { q: 'read this word: at', a: 'at', variants: ['at'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: do', a: 'do', variants: ['do'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: for', a: 'for', variants: ['for'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: am', a: 'am', variants: ['am'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: no', a: 'no', variants: ['no'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: not', a: 'not', variants: ['not'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: yes', a: 'yes', variants: ['yes'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
  { q: 'read this word: all', a: 'all', variants: ['all'], standard: 'K.RF.3c', difficulty: 1, source: 'Fountas-Pinnell-sample' },
];

// ─── K-MATH EXAM BANK (K.CC / K.OA / K.NBT / K.MD / K.G) ─────────────

const MATH_KINDERGARTEN_EXAM = [
  // K.CC.1 Count to 100 by ones and tens
  { q: 'count to ten', a: 'ten', variants: ['ten', '10'], standard: 'K.CC.1', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you count to a big number?', keywords: ['one', 'start', 'order', 'next', 'add', 'count', 'number', 'sequence'], minKeywords: 1 } },
  { q: 'count to twenty', a: 'twenty', variants: ['twenty', '20'], standard: 'K.CC.1', difficulty: 2, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you count to a big number?', keywords: ['one', 'start', 'order', 'next', 'add', 'count', 'number', 'sequence'], minKeywords: 1 } },
  { q: 'count by tens to fifty', a: 'fifty', variants: ['fifty', '50'], standard: 'K.CC.1', difficulty: 3, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you count by tens?', keywords: ['ten', 'skip', 'add', 'group', 'tens', 'multiples'], minKeywords: 1 } },
  { q: 'count by tens to one hundred', a: 'one hundred', variants: ['one hundred', '100', 'hundred'], standard: 'K.CC.1', difficulty: 3, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you count by tens?', keywords: ['ten', 'skip', 'add', 'group', 'tens', 'multiples'], minKeywords: 1 } },

  // K.CC.2 Count forward from a given number
  { q: 'what comes after five?', a: 'six', variants: ['six', '6'], standard: 'K.CC.2', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after seven?', a: 'eight', variants: ['eight', '8'], standard: 'K.CC.2', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after ten?', a: 'eleven', variants: ['eleven', '11'], standard: 'K.CC.2', difficulty: 2, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after twelve?', a: 'thirteen', variants: ['thirteen', '13'], standard: 'K.CC.2', difficulty: 2, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after nineteen?', a: 'twenty', variants: ['twenty', '20'], standard: 'K.CC.2', difficulty: 2, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after twenty-nine?', a: 'thirty', variants: ['thirty', '30'], standard: 'K.CC.2', difficulty: 3, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after one?', a: 'two', variants: ['two', '2'], standard: 'K.CC.2', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after two?', a: 'three', variants: ['three', '3'], standard: 'K.CC.2', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after three?', a: 'four', variants: ['four', '4'], standard: 'K.CC.2', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after four?', a: 'five', variants: ['five', '5'], standard: 'K.CC.2', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after eight?', a: 'nine', variants: ['nine', '9'], standard: 'K.CC.2', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },
  { q: 'what comes after nine?', a: 'ten', variants: ['ten', '10'], standard: 'K.CC.2', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you figure out the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 } },

  // K.CC.3 Write numbers 0-20
  { q: 'write the number five', a: '5', variants: ['5', 'five'], standard: 'K.CC.3', difficulty: 1, source: 'authored' },
  { q: 'write the number ten', a: '10', variants: ['10', 'ten'], standard: 'K.CC.3', difficulty: 1, source: 'authored' },
  { q: 'write the number fifteen', a: '15', variants: ['15', 'fifteen'], standard: 'K.CC.3', difficulty: 2, source: 'authored' },
  { q: 'write the number zero', a: '0', variants: ['0', 'zero'], standard: 'K.CC.3', difficulty: 1, source: 'authored' },
  { q: 'write the number twenty', a: '20', variants: ['20', 'twenty'], standard: 'K.CC.3', difficulty: 2, source: 'authored' },

  // K.CC.4 One-to-one correspondence
  { q: 'how many fingers are on one hand?', a: 'five', variants: ['five', '5'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many fingers are on two hands?', a: 'ten', variants: ['ten', '10'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many eyes do you have?', a: 'two', variants: ['two', '2'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many ears do you have?', a: 'two', variants: ['two', '2'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many noses do you have?', a: 'one', variants: ['one', '1'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many legs does a dog have?', a: 'four', variants: ['four', '4'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many legs does a bird have?', a: 'two', variants: ['two', '2'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many wheels does a bicycle have?', a: 'two', variants: ['two', '2'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many wheels does a car have?', a: 'four', variants: ['four', '4'], standard: 'K.CC.4', difficulty: 1, source: 'authored' },
  { q: 'how many days are in a week?', a: 'seven', variants: ['seven', '7'], standard: 'K.CC.4', difficulty: 2, source: 'authored' },
  { q: 'how many months are in a year?', a: 'twelve', variants: ['twelve', '12'], standard: 'K.CC.4', difficulty: 3, source: 'authored' },

  // K.CC.5 Count to answer "how many"
  { q: 'if you have three apples and one more, how many?', a: 'four', variants: ['four', '4'], standard: 'K.CC.5', difficulty: 1, source: 'authored' },
  { q: 'if you count five toys, how many toys are there?', a: 'five', variants: ['five', '5'], standard: 'K.CC.5', difficulty: 1, source: 'authored' },

  // K.CC.6 Compare numbers as greater/less/equal
  { q: 'which is more, three or five?', a: 'five', variants: ['five', '5'], standard: 'K.CC.6', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you know which number is more?', keywords: ['bigger', 'more', 'greater', 'count', 'higher', 'larger', 'than'], minKeywords: 1 } },
  { q: 'which is more, seven or four?', a: 'seven', variants: ['seven', '7'], standard: 'K.CC.6', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'which is less, two or six?', a: 'two', variants: ['two', '2'], standard: 'K.CC.6', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'which is less, nine or three?', a: 'three', variants: ['three', '3'], standard: 'K.CC.6', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'is ten greater or less than five?', a: 'greater', variants: ['greater', 'more', 'bigger'], standard: 'K.CC.6', difficulty: 2, source: 'authored' },
  { q: 'is three greater or less than eight?', a: 'less', variants: ['less', 'fewer', 'smaller'], standard: 'K.CC.6', difficulty: 2, source: 'authored' },

  // K.CC.7 Compare two written numerals
  { q: 'which number is bigger, 8 or 3?', a: '8', variants: ['8', 'eight'], standard: 'K.CC.7', difficulty: 1, source: 'authored' },
  { q: 'which number is smaller, 6 or 9?', a: '6', variants: ['6', 'six'], standard: 'K.CC.7', difficulty: 1, source: 'authored' },

  // K.OA.1 Represent addition/subtraction with objects
  { q: 'one plus one is?', a: 'two', variants: ['two', '2'], standard: 'K.OA.1', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you add two numbers together?', keywords: ['add', 'plus', 'together', 'put', 'combine', 'count', 'total', 'sum'], minKeywords: 1 } },
  { q: 'two plus two is?', a: 'four', variants: ['four', '4'], standard: 'K.OA.1', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you add two numbers together?', keywords: ['add', 'plus', 'together', 'put', 'combine', 'count', 'total', 'sum'], minKeywords: 1 } },
  { q: 'three plus one is?', a: 'four', variants: ['four', '4'], standard: 'K.OA.1', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you add two numbers together?', keywords: ['add', 'plus', 'together', 'put', 'combine', 'count', 'total', 'sum'], minKeywords: 1 } },
  { q: 'two plus three is?', a: 'five', variants: ['five', '5'], standard: 'K.OA.1', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you add two numbers together?', keywords: ['add', 'plus', 'together', 'put', 'combine', 'count', 'total', 'sum'], minKeywords: 1 } },
  { q: 'four plus two is?', a: 'six', variants: ['six', '6'], standard: 'K.OA.1', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you add two numbers together?', keywords: ['add', 'plus', 'together', 'put', 'combine', 'count', 'total', 'sum'], minKeywords: 1 } },
  { q: 'five plus zero is?', a: 'five', variants: ['five', '5'], standard: 'K.OA.1', difficulty: 1, source: 'DIBELS-8-sample',
    methodology: { prompt: 'how do you add zero to a number?', keywords: ['zero', 'nothing', 'same', 'unchanged', 'identity'], minKeywords: 1 } },
  { q: 'three plus three is?', a: 'six', variants: ['six', '6'], standard: 'K.OA.1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you add two numbers together?', keywords: ['add', 'plus', 'together', 'put', 'combine', 'count', 'total', 'sum'], minKeywords: 1 } },
  { q: 'four plus four is?', a: 'eight', variants: ['eight', '8'], standard: 'K.OA.1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you add two numbers together?', keywords: ['add', 'plus', 'together', 'put', 'combine', 'count', 'total', 'sum'], minKeywords: 1 } },
  { q: 'five plus five is?', a: 'ten', variants: ['ten', '10'], standard: 'K.OA.1', difficulty: 2, source: 'authored',
    methodology: { prompt: 'how do you add two numbers together?', keywords: ['add', 'plus', 'together', 'put', 'combine', 'count', 'total', 'sum'], minKeywords: 1 } },
  { q: 'two minus one is?', a: 'one', variants: ['one', '1'], standard: 'K.OA.1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you subtract one number from another?', keywords: ['minus', 'take', 'away', 'remove', 'less', 'subtract', 'fewer'], minKeywords: 1 } },
  { q: 'three minus one is?', a: 'two', variants: ['two', '2'], standard: 'K.OA.1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you subtract one number from another?', keywords: ['minus', 'take', 'away', 'remove', 'less', 'subtract', 'fewer'], minKeywords: 1 } },
  { q: 'four minus two is?', a: 'two', variants: ['two', '2'], standard: 'K.OA.1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you subtract one number from another?', keywords: ['minus', 'take', 'away', 'remove', 'less', 'subtract', 'fewer'], minKeywords: 1 } },
  { q: 'five minus three is?', a: 'two', variants: ['two', '2'], standard: 'K.OA.1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you subtract one number from another?', keywords: ['minus', 'take', 'away', 'remove', 'less', 'subtract', 'fewer'], minKeywords: 1 } },
  { q: 'six minus two is?', a: 'four', variants: ['four', '4'], standard: 'K.OA.1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you subtract one number from another?', keywords: ['minus', 'take', 'away', 'remove', 'less', 'subtract', 'fewer'], minKeywords: 1 } },

  // K.OA.3 Decompose numbers ≤ 10 into pairs
  { q: 'what two numbers add to five?', a: 'two and three', variants: ['two and three', '2 and 3', 'one and four', '0 and 5'], standard: 'K.OA.3', difficulty: 2, source: 'authored' },
  { q: 'what two numbers add to ten?', a: 'five and five', variants: ['five and five', '5 and 5', 'six and four', 'seven and three'], standard: 'K.OA.3', difficulty: 2, source: 'authored' },

  // K.OA.4 Find the number that makes 10
  { q: 'what plus five equals ten?', a: 'five', variants: ['five', '5'], standard: 'K.OA.4', difficulty: 2, source: 'authored' },
  { q: 'what plus two equals ten?', a: 'eight', variants: ['eight', '8'], standard: 'K.OA.4', difficulty: 2, source: 'authored' },
  { q: 'what plus seven equals ten?', a: 'three', variants: ['three', '3'], standard: 'K.OA.4', difficulty: 2, source: 'authored' },
  { q: 'what plus one equals ten?', a: 'nine', variants: ['nine', '9'], standard: 'K.OA.4', difficulty: 2, source: 'authored' },

  // K.OA.5 Fluently add/subtract within 5
  { q: 'one plus two is?', a: 'three', variants: ['three', '3'], standard: 'K.OA.5', difficulty: 1, source: 'DIBELS-8-sample' },
  { q: 'two plus one is?', a: 'three', variants: ['three', '3'], standard: 'K.OA.5', difficulty: 1, source: 'DIBELS-8-sample' },
  { q: 'one plus three is?', a: 'four', variants: ['four', '4'], standard: 'K.OA.5', difficulty: 1, source: 'DIBELS-8-sample' },
  { q: 'one plus four is?', a: 'five', variants: ['five', '5'], standard: 'K.OA.5', difficulty: 1, source: 'DIBELS-8-sample' },
  { q: 'four plus one is?', a: 'five', variants: ['five', '5'], standard: 'K.OA.5', difficulty: 1, source: 'DIBELS-8-sample' },
  { q: 'three minus two is?', a: 'one', variants: ['one', '1'], standard: 'K.OA.5', difficulty: 1, source: 'authored' },
  { q: 'four minus three is?', a: 'one', variants: ['one', '1'], standard: 'K.OA.5', difficulty: 1, source: 'authored' },
  { q: 'five minus four is?', a: 'one', variants: ['one', '1'], standard: 'K.OA.5', difficulty: 1, source: 'authored' },
  { q: 'five minus one is?', a: 'four', variants: ['four', '4'], standard: 'K.OA.5', difficulty: 1, source: 'authored' },
  { q: 'five minus two is?', a: 'three', variants: ['three', '3'], standard: 'K.OA.5', difficulty: 1, source: 'authored' },

  // K.NBT.1 Compose/decompose teen numbers into ten + ones
  { q: 'ten plus one is?', a: 'eleven', variants: ['eleven', '11'], standard: 'K.NBT.1', difficulty: 2, source: 'authored' },
  { q: 'ten plus two is?', a: 'twelve', variants: ['twelve', '12'], standard: 'K.NBT.1', difficulty: 2, source: 'authored' },
  { q: 'ten plus three is?', a: 'thirteen', variants: ['thirteen', '13'], standard: 'K.NBT.1', difficulty: 2, source: 'authored' },
  { q: 'ten plus five is?', a: 'fifteen', variants: ['fifteen', '15'], standard: 'K.NBT.1', difficulty: 2, source: 'authored' },
  { q: 'ten plus nine is?', a: 'nineteen', variants: ['nineteen', '19'], standard: 'K.NBT.1', difficulty: 2, source: 'authored' },
  { q: 'thirteen is ten plus?', a: 'three', variants: ['three', '3'], standard: 'K.NBT.1', difficulty: 3, source: 'authored' },
  { q: 'fifteen is ten plus?', a: 'five', variants: ['five', '5'], standard: 'K.NBT.1', difficulty: 3, source: 'authored' },

  // K.MD.1 Describe measurable attributes
  { q: 'which is longer, a pencil or a pen?', a: 'pencil', variants: ['pencil', 'pen', 'depends'], standard: 'K.MD.1', difficulty: 2, source: 'authored' },
  { q: 'which is heavier, an elephant or a mouse?', a: 'elephant', variants: ['elephant'], standard: 'K.MD.1', difficulty: 1, source: 'authored' },
  { q: 'which is taller, a tree or a flower?', a: 'tree', variants: ['tree'], standard: 'K.MD.1', difficulty: 1, source: 'authored' },
  { q: 'which is hotter, ice or fire?', a: 'fire', variants: ['fire'], standard: 'K.MD.1', difficulty: 1, source: 'authored' },
  { q: 'which is colder, sun or snow?', a: 'snow', variants: ['snow'], standard: 'K.MD.1', difficulty: 1, source: 'authored' },
  { q: 'which is smaller, a mouse or a dog?', a: 'mouse', variants: ['mouse'], standard: 'K.MD.1', difficulty: 1, source: 'authored' },
  { q: 'which is fuller, a glass with water or an empty glass?', a: 'water', variants: ['water', 'with water', 'full'], standard: 'K.MD.1', difficulty: 2, source: 'authored' },

  // K.MD.3 Classify objects and count the number of objects in each category
  { q: 'if there are three red crayons and two blue crayons, how many red?', a: 'three', variants: ['three', '3'], standard: 'K.MD.3', difficulty: 2, source: 'authored' },
  { q: 'name three colors', a: 'red', variants: ['red', 'blue', 'yellow', 'green', 'orange', 'pink'], standard: 'K.MD.3', difficulty: 1, source: 'authored' },

  // K.G.1 Describe objects in the environment using shapes
  { q: 'what shape has three sides?', a: 'triangle', variants: ['triangle'], standard: 'K.G.1', difficulty: 1, source: 'AIMSweb-sample',
    methodology: { prompt: 'how do you tell what shape something is?', keywords: ['sides', 'count', 'corners', 'edges', 'round', 'shape', 'look'], minKeywords: 1 } },
  { q: 'what shape has four equal sides?', a: 'square', variants: ['square'], standard: 'K.G.1', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what shape is round?', a: 'circle', variants: ['circle'], standard: 'K.G.1', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what shape has four sides but two long and two short?', a: 'rectangle', variants: ['rectangle'], standard: 'K.G.1', difficulty: 2, source: 'AIMSweb-sample' },
  { q: 'what shape has six sides?', a: 'hexagon', variants: ['hexagon'], standard: 'K.G.1', difficulty: 3, source: 'authored' },

  // K.G.2 Correctly name shapes regardless of orientation or overall size
  { q: 'a ball is the shape of a?', a: 'sphere', variants: ['sphere', 'circle', 'round'], standard: 'K.G.2', difficulty: 2, source: 'authored' },
  { q: 'a box is the shape of a?', a: 'cube', variants: ['cube', 'square', 'rectangle'], standard: 'K.G.2', difficulty: 2, source: 'authored' },
  { q: 'a can is the shape of a?', a: 'cylinder', variants: ['cylinder'], standard: 'K.G.2', difficulty: 3, source: 'authored' },

  // K.G.3 Identify shapes as 2D or 3D
  { q: 'is a circle flat or solid?', a: 'flat', variants: ['flat', '2d', 'two dimensional'], standard: 'K.G.3', difficulty: 2, source: 'authored' },
  { q: 'is a cube flat or solid?', a: 'solid', variants: ['solid', '3d', 'three dimensional'], standard: 'K.G.3', difficulty: 2, source: 'authored' },

  // K.G.4 Analyze and compare shapes
  { q: 'how are a square and a rectangle the same?', a: 'sides', variants: ['sides', 'four sides', '4 sides', 'corners'], standard: 'K.G.4', difficulty: 3, source: 'authored' },
  { q: 'how is a triangle different from a square?', a: 'sides', variants: ['sides', 'three sides', 'fewer sides'], standard: 'K.G.4', difficulty: 3, source: 'authored' },

  // K.G.5 Model shapes in the world by building them
  { q: 'if you put two triangles together, what can you make?', a: 'square', variants: ['square', 'rectangle', 'diamond'], standard: 'K.G.5', difficulty: 3, source: 'authored' },

  // K.G.6 Compose simple shapes to form larger shapes
  { q: 'what do you get when you put two squares together side by side?', a: 'rectangle', variants: ['rectangle'], standard: 'K.G.6', difficulty: 3, source: 'authored' },

  // ═══ External-reference items (T23.a.9 expansion) ═══════════════════
  // Sample-equivalent items matching the published K-Math assessment
  // format at sub-standard level. Not the actual proprietary test
  // forms — fair-use equivalents testing the same standards.

  // iReady K Math diagnostic (Curriculum Associates)
  { q: 'count these: 1 2 3 4 5 6. what number?', a: 'six', variants: ['six', '6'], standard: 'K.CC.4', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: 'count these dots: 7 dots. what number?', a: 'seven', variants: ['seven', '7'], standard: 'K.CC.4', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: 'what number comes right before 4?', a: 'three', variants: ['three', '3'], standard: 'K.CC.2', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: 'what number comes right before 10?', a: 'nine', variants: ['nine', '9'], standard: 'K.CC.2', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: 'if you have 2 cookies and eat 1, how many left?', a: 'one', variants: ['one', '1'], standard: 'K.OA.1', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: 'if you have 4 balloons and 2 pop, how many left?', a: 'two', variants: ['two', '2'], standard: 'K.OA.1', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: 'if you have 3 birds and 2 more fly to you, how many?', a: 'five', variants: ['five', '5'], standard: 'K.OA.1', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: '1 + 2 = ?', a: 'three', variants: ['three', '3'], standard: 'K.OA.5', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: '3 + 2 = ?', a: 'five', variants: ['five', '5'], standard: 'K.OA.5', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: '4 - 1 = ?', a: 'three', variants: ['three', '3'], standard: 'K.OA.5', difficulty: 1, source: 'iReady-K-Math-sample' },
  { q: 'count by tens: 10, 20, 30. what comes next?', a: 'forty', variants: ['forty', '40'], standard: 'K.CC.1', difficulty: 2, source: 'iReady-K-Math-sample' },

  // STAR Early Math (Renaissance Learning)
  { q: 'which group has more: 3 or 5?', a: 'five', variants: ['five', '5'], standard: 'K.CC.6', difficulty: 1, source: 'STAR-Early-Math-sample' },
  { q: 'which group has fewer: 2 or 7?', a: 'two', variants: ['two', '2'], standard: 'K.CC.6', difficulty: 1, source: 'STAR-Early-Math-sample' },
  { q: 'how many sides does a triangle have?', a: 'three', variants: ['three', '3'], standard: 'K.G.4', difficulty: 1, source: 'STAR-Early-Math-sample' },
  { q: 'how many corners does a square have?', a: 'four', variants: ['four', '4'], standard: 'K.G.4', difficulty: 1, source: 'STAR-Early-Math-sample' },
  { q: 'how many corners does a triangle have?', a: 'three', variants: ['three', '3'], standard: 'K.G.4', difficulty: 1, source: 'STAR-Early-Math-sample' },
  { q: 'which is longer, a pencil or a crayon?', a: 'pencil', variants: ['pencil'], standard: 'K.MD.1', difficulty: 2, source: 'STAR-Early-Math-sample' },
  { q: 'count by ones to twelve', a: 'twelve', variants: ['twelve', '12'], standard: 'K.CC.1', difficulty: 2, source: 'STAR-Early-Math-sample' },

  // NWEA MAP Growth K Math
  { q: 'what number is 1 more than 5?', a: 'six', variants: ['six', '6'], standard: 'K.CC.2', difficulty: 1, source: 'NWEA-MAP-K-Math-sample' },
  { q: 'what number is 1 more than 8?', a: 'nine', variants: ['nine', '9'], standard: 'K.CC.2', difficulty: 1, source: 'NWEA-MAP-K-Math-sample' },
  { q: 'what number is 1 less than 6?', a: 'five', variants: ['five', '5'], standard: 'K.CC.2', difficulty: 1, source: 'NWEA-MAP-K-Math-sample' },
  { q: 'what number is 1 less than 10?', a: 'nine', variants: ['nine', '9'], standard: 'K.CC.2', difficulty: 1, source: 'NWEA-MAP-K-Math-sample' },
  { q: 'how many in total: 2 apples + 3 apples?', a: 'five', variants: ['five', '5'], standard: 'K.OA.1', difficulty: 1, source: 'NWEA-MAP-K-Math-sample' },
  { q: 'how many in total: 4 + 3?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.1', difficulty: 1, source: 'NWEA-MAP-K-Math-sample' },
  { q: '6 - 2 = ?', a: 'four', variants: ['four', '4'], standard: 'K.OA.1', difficulty: 1, source: 'NWEA-MAP-K-Math-sample' },
  { q: '7 - 3 = ?', a: 'four', variants: ['four', '4'], standard: 'K.OA.1', difficulty: 1, source: 'NWEA-MAP-K-Math-sample' },
  { q: 'which number sentence shows 5 + 2?', a: 'seven', variants: ['seven', '7', '5+2=7'], standard: 'K.OA.1', difficulty: 2, source: 'NWEA-MAP-K-Math-sample' },

  // Woodcock-Johnson Achievement K Math
  { q: 'point to the number that shows five things', a: '5', variants: ['5', 'five'], standard: 'K.CC.3', difficulty: 1, source: 'Woodcock-Johnson-K-sample' },
  { q: 'point to the number that shows eight things', a: '8', variants: ['8', 'eight'], standard: 'K.CC.3', difficulty: 1, source: 'Woodcock-Johnson-K-sample' },
  { q: 'write the numeral for ten', a: '10', variants: ['10', 'ten'], standard: 'K.CC.3', difficulty: 1, source: 'Woodcock-Johnson-K-sample' },
  { q: 'write the numeral for twelve', a: '12', variants: ['12', 'twelve'], standard: 'K.CC.3', difficulty: 2, source: 'Woodcock-Johnson-K-sample' },
  { q: 'count backwards from 5', a: 'one', variants: ['one', '1', '5 4 3 2 1'], standard: 'K.CC.2', difficulty: 2, source: 'Woodcock-Johnson-K-sample' },

  // Expanded AIMSweb Plus K Math
  { q: 'what is 2 plus 2?', a: 'four', variants: ['four', '4'], standard: 'K.OA.1', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what is 5 plus 2?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.1', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what is 6 plus 3?', a: 'nine', variants: ['nine', '9'], standard: 'K.OA.1', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what is 7 minus 2?', a: 'five', variants: ['five', '5'], standard: 'K.OA.1', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'what is 9 minus 4?', a: 'five', variants: ['five', '5'], standard: 'K.OA.1', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'count: one two three four. what comes next?', a: 'five', variants: ['five', '5'], standard: 'K.CC.2', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'count: six seven eight. what comes next?', a: 'nine', variants: ['nine', '9'], standard: 'K.CC.2', difficulty: 1, source: 'AIMSweb-sample' },
  { q: 'is 3 greater than, less than, or equal to 7?', a: 'less', variants: ['less', 'less than'], standard: 'K.CC.7', difficulty: 2, source: 'AIMSweb-sample' },
  { q: 'is 8 greater than, less than, or equal to 5?', a: 'greater', variants: ['greater', 'greater than', 'more'], standard: 'K.CC.7', difficulty: 2, source: 'AIMSweb-sample' },

  // Stanford Achievement Test K Math
  { q: 'how many sides does a circle have?', a: 'none', variants: ['none', '0', 'zero', 'no sides'], standard: 'K.G.4', difficulty: 2, source: 'Stanford-Achievement-K-sample' },
  { q: 'a cube has how many sides?', a: 'six', variants: ['six', '6'], standard: 'K.G.4', difficulty: 3, source: 'Stanford-Achievement-K-sample' },
  { q: 'identify the shape: a round object like a ball', a: 'sphere', variants: ['sphere', 'circle', 'ball', 'round'], standard: 'K.G.2', difficulty: 2, source: 'Stanford-Achievement-K-sample' },
  { q: 'count the dots: 4 dots on one side + 2 on the other', a: 'six', variants: ['six', '6'], standard: 'K.CC.5', difficulty: 2, source: 'Stanford-Achievement-K-sample' },

  // Numbers & Operations in Base Ten (K.NBT) external
  { q: 'if you have ten and five more, how many do you have?', a: 'fifteen', variants: ['fifteen', '15'], standard: 'K.NBT.1', difficulty: 2, source: 'iReady-K-Math-sample' },
  { q: 'break apart 14 into ten and ones — how many ones?', a: 'four', variants: ['four', '4'], standard: 'K.NBT.1', difficulty: 3, source: 'iReady-K-Math-sample' },
  { q: 'break apart 17 into ten and ones — how many ones?', a: 'seven', variants: ['seven', '7'], standard: 'K.NBT.1', difficulty: 3, source: 'iReady-K-Math-sample' },

  // Word problem sums (K.OA.2 via Singapore + other benchmarks)
  { q: 'ana has 3 stickers and gets 4 more, how many total?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.2', difficulty: 2, source: 'Singapore-K-sample' },
  { q: 'a boy had 5 marbles and lost 2, how many left?', a: 'three', variants: ['three', '3'], standard: 'K.OA.2', difficulty: 2, source: 'Singapore-K-sample' },
  { q: 'there are 4 red fish and 3 blue fish, how many fish?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.2', difficulty: 2, source: 'Singapore-K-sample' },
];

// ─── K-SCIENCE EXAM BANK (NGSS K standards) ──────────────────────────

const SCIENCE_KINDERGARTEN_EXAM = [
  // K-PS2-1/2 — Motion and stability: forces
  { q: 'what happens when you drop a ball?', a: 'falls', variants: ['falls', 'fall', 'drops', 'bounce'], standard: 'K-PS2-1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'why does a ball fall when you drop it?', keywords: ['gravity', 'down', 'pull', 'earth', 'weight'], minKeywords: 1 } },
  { q: 'what makes something move faster, a big push or a small push?', a: 'big', variants: ['big', 'big push', 'hard', 'strong'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  { q: 'if you push a ball, which way does it go, towards you or away?', a: 'away', variants: ['away'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  { q: 'if you pull a rope, which way does it come?', a: 'toward', variants: ['toward', 'towards', 'to you', 'closer'], standard: 'K-PS2-1', difficulty: 2, source: 'authored' },
  { q: 'does a heavier ball go farther with the same push, or not as far?', a: 'not as far', variants: ['not as far', 'less', 'shorter', 'not far'], standard: 'K-PS2-1', difficulty: 2, source: 'authored' },
  { q: 'what stops a ball rolling on carpet, friction or air?', a: 'friction', variants: ['friction', 'carpet', 'rough'], standard: 'K-PS2-1', difficulty: 3, source: 'authored' },
  { q: 'what pulls everything down to the ground?', a: 'gravity', variants: ['gravity'], standard: 'K-PS2-1', difficulty: 2, source: 'authored' },
  { q: 'does a ramp change the way a ball rolls?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-PS2-2', difficulty: 2, source: 'authored' },
  { q: 'if you blow on a feather, does it move?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  { q: 'what makes a paper airplane fly, air or water?', a: 'air', variants: ['air'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  { q: 'if you push a toy car harder, does it go faster or slower?', a: 'faster', variants: ['faster'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  // K-PS3-1/2 — Energy: sunlight effects
  { q: 'is the sun hot or cold?', a: 'hot', variants: ['hot', 'warm'], standard: 'K-PS3-1', difficulty: 1, source: 'authored' },
  { q: 'does sunlight make things warmer or cooler?', a: 'warmer', variants: ['warmer', 'hotter', 'warm', 'hot'], standard: 'K-PS3-1', difficulty: 1, source: 'authored' },
  { q: 'where is it colder, in the sun or in the shade?', a: 'shade', variants: ['shade', 'in the shade', 'shadow'], standard: 'K-PS3-1', difficulty: 2, source: 'authored' },
  { q: 'why do we wear a hat outside on a sunny day?', a: 'shade', variants: ['shade', 'sun', 'to block sun', 'shade our face'], standard: 'K-PS3-2', difficulty: 2, source: 'authored' },
  { q: 'does ice melt in the sun?', a: 'yes', variants: ['yes', 'yeah', 'melts'], standard: 'K-PS3-1', difficulty: 1, source: 'authored' },
  { q: 'what gives us light during the day?', a: 'sun', variants: ['sun', 'sunlight'], standard: 'K-PS3-1', difficulty: 1, source: 'authored' },
  { q: 'does water get warmer or cooler in the sun?', a: 'warmer', variants: ['warmer', 'hot', 'warm'], standard: 'K-PS3-1', difficulty: 1, source: 'authored' },
  { q: 'what makes shadows?', a: 'sun', variants: ['sun', 'light', 'sunlight', 'something blocking light'], standard: 'K-PS3-1', difficulty: 2, source: 'authored' },
  { q: 'does sand on the beach get hot in the sun?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-PS3-1', difficulty: 1, source: 'authored' },
  // K-PS1 — States of matter (ice/water/steam)
  { q: 'does ice melt or freeze when it gets warm?', a: 'melt', variants: ['melt', 'melts'], standard: 'K-PS1', difficulty: 1, source: 'authored' },
  { q: 'what does water turn into when it gets very cold?', a: 'ice', variants: ['ice', 'solid', 'frozen'], standard: 'K-PS1', difficulty: 1, source: 'authored' },
  { q: 'what happens to a snowman in the sun?', a: 'melt', variants: ['melt', 'melts', 'water'], standard: 'K-PS1', difficulty: 1, source: 'authored' },
  { q: 'is ice hard or soft?', a: 'hard', variants: ['hard', 'solid'], standard: 'K-PS1', difficulty: 1, source: 'authored' },
  { q: 'is water liquid or solid?', a: 'liquid', variants: ['liquid'], standard: 'K-PS1', difficulty: 2, source: 'authored' },
  { q: 'what do you call water that is frozen?', a: 'ice', variants: ['ice'], standard: 'K-PS1', difficulty: 1, source: 'authored' },
  { q: 'what do you call water that is really hot and going up in the air?', a: 'steam', variants: ['steam', 'vapor', 'gas'], standard: 'K-PS1', difficulty: 2, source: 'authored' },
  // K-LS1-1 — Structure and function of plants/animals
  { q: 'what do plants need to grow?', a: 'water', variants: ['water', 'sun', 'light', 'sunlight'], standard: 'K-LS1-1', difficulty: 1, source: 'authored',
    methodology: { prompt: 'why do plants need water and sunlight?', keywords: ['food', 'grow', 'alive', 'photosynthesis', 'make', 'drink', 'need'], minKeywords: 1 } },
  { q: 'what do fish use to breathe?', a: 'gills', variants: ['gills', 'water'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'do plants need sunlight?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do animals need to drink?', a: 'water', variants: ['water'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do animals need to breathe?', a: 'air', variants: ['air', 'oxygen'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'where do birds live, in a nest or in water?', a: 'nest', variants: ['nest', 'trees', 'tree'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'where do fish live?', a: 'water', variants: ['water', 'ocean', 'river', 'pond', 'sea'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do dogs eat?', a: 'food', variants: ['food', 'meat', 'dog food'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do rabbits eat?', a: 'carrots', variants: ['carrots', 'vegetables', 'plants', 'grass'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do bees make?', a: 'honey', variants: ['honey'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do chickens lay?', a: 'eggs', variants: ['eggs', 'egg'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do cows give us?', a: 'milk', variants: ['milk'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'do baby animals look like their parents?', a: 'yes', variants: ['yes', 'yeah', 'usually'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what is a baby dog called?', a: 'puppy', variants: ['puppy'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what is a baby cat called?', a: 'kitten', variants: ['kitten'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what is a baby cow called?', a: 'calf', variants: ['calf'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what is a baby horse called?', a: 'foal', variants: ['foal', 'colt', 'pony'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what is a baby duck called?', a: 'duckling', variants: ['duckling'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what is a baby frog called?', a: 'tadpole', variants: ['tadpole', 'polliwog'], standard: 'K-LS1-1', difficulty: 3, source: 'authored' },
  { q: 'what is a baby butterfly called before it can fly?', a: 'caterpillar', variants: ['caterpillar'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'do plants have roots?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what part of a plant grows underground?', a: 'roots', variants: ['roots', 'root'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what do leaves do for a plant?', a: 'food', variants: ['food', 'make food', 'photosynthesis'], standard: 'K-LS1-1', difficulty: 3, source: 'authored' },
  { q: 'what part of the plant holds up the flower?', a: 'stem', variants: ['stem', 'stalk'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  // K-ESS2-1/2 — Weather and climate
  { q: 'what falls from the sky when it rains?', a: 'rain', variants: ['rain', 'water'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'what falls from the sky when it snows?', a: 'snow', variants: ['snow'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'what do you wear in the snow?', a: 'coat', variants: ['coat', 'jacket', 'mittens', 'hat', 'boots'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'what do you wear in the summer?', a: 'shorts', variants: ['shorts', 't-shirt', 'sandals', 'tshirt'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'is it hotter in summer or winter?', a: 'summer', variants: ['summer'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'is it colder in summer or winter?', a: 'winter', variants: ['winter'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'what do you use when it rains?', a: 'umbrella', variants: ['umbrella', 'raincoat'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'what are the four seasons?', a: 'spring', variants: ['spring', 'summer', 'fall', 'winter', 'autumn'], standard: 'K-ESS2-1', difficulty: 2, source: 'authored' },
  { q: 'when do leaves fall off trees?', a: 'fall', variants: ['fall', 'autumn'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'in which season do flowers bloom?', a: 'spring', variants: ['spring'], standard: 'K-ESS2-1', difficulty: 2, source: 'authored' },
  { q: 'what is the name for a big storm with lightning?', a: 'thunderstorm', variants: ['thunderstorm', 'storm'], standard: 'K-ESS2-1', difficulty: 2, source: 'authored' },
  { q: 'what is a big snowstorm called?', a: 'blizzard', variants: ['blizzard', 'snowstorm'], standard: 'K-ESS2-1', difficulty: 3, source: 'authored' },
  { q: 'is the sky gray on a rainy day or a sunny day?', a: 'rainy', variants: ['rainy', 'rain', 'rainy day'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'what makes a rainbow?', a: 'sun', variants: ['sun', 'sunlight', 'rain and sun', 'light'], standard: 'K-ESS2-1', difficulty: 3, source: 'authored' },
  { q: 'is snow warm or cold?', a: 'cold', variants: ['cold'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'what is the thing we check to know the weather?', a: 'forecast', variants: ['forecast', 'weather', 'weather report'], standard: 'K-ESS3-2', difficulty: 3, source: 'authored' },
  // K-ESS3-1/3 — Earth systems and human impact
  { q: 'what do we call the place where animals live?', a: 'habitat', variants: ['habitat', 'home'], standard: 'K-ESS3-1', difficulty: 2, source: 'authored' },
  { q: 'where do polar bears live?', a: 'arctic', variants: ['arctic', 'cold', 'snow', 'ice'], standard: 'K-ESS3-1', difficulty: 2, source: 'authored' },
  { q: 'where do camels live?', a: 'desert', variants: ['desert', 'sand'], standard: 'K-ESS3-1', difficulty: 2, source: 'authored' },
  { q: 'where do monkeys live?', a: 'jungle', variants: ['jungle', 'forest', 'tree', 'trees'], standard: 'K-ESS3-1', difficulty: 1, source: 'authored' },
  { q: 'why should we not throw trash on the ground?', a: 'pollution', variants: ['pollution', 'harms animals', 'dirty', 'bad'], standard: 'K-ESS3-3', difficulty: 2, source: 'authored' },
  { q: 'what should we do with trash?', a: 'throw away', variants: ['throw away', 'trash can', 'recycle', 'garbage'], standard: 'K-ESS3-3', difficulty: 1, source: 'authored' },
  { q: 'what word means using something again?', a: 'recycle', variants: ['recycle', 'reuse'], standard: 'K-ESS3-3', difficulty: 2, source: 'authored' },
  { q: 'should we waste water or save water?', a: 'save', variants: ['save', 'save water', 'conserve'], standard: 'K-ESS3-3', difficulty: 2, source: 'authored' },
  { q: 'do trees give us oxygen to breathe?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-ESS3-1', difficulty: 3, source: 'authored' },
  // Five senses — foundational science
  { q: 'what do you use to see?', a: 'eyes', variants: ['eyes', 'eye'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do you use to hear?', a: 'ears', variants: ['ears', 'ear'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do you use to smell?', a: 'nose', variants: ['nose'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do you use to taste?', a: 'tongue', variants: ['tongue', 'mouth'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do you use to touch?', a: 'hands', variants: ['hands', 'skin', 'fingers'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'how many senses do you have?', a: 'five', variants: ['five', '5'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  // Day / night / sky
  { q: 'when do we see the moon?', a: 'night', variants: ['night', 'at night'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'when do we see the sun?', a: 'day', variants: ['day', 'daytime', 'morning'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'what do we see in the sky at night?', a: 'stars', variants: ['stars', 'moon', 'star'], standard: 'K-ESS2-1', difficulty: 1, source: 'authored' },
  { q: 'is the moon bigger or smaller than the sun?', a: 'smaller', variants: ['smaller', 'small'], standard: 'K-ESS2-1', difficulty: 3, source: 'authored' },
  { q: 'how many stars are in the sky?', a: 'many', variants: ['many', 'a lot', 'lots', 'billions'], standard: 'K-ESS2-1', difficulty: 2, source: 'authored' },
  // Push/pull everyday examples
  { q: 'do you push or pull a door to close it?', a: 'push', variants: ['push', 'either', 'both', 'depends'], standard: 'K-PS2-1', difficulty: 2, source: 'authored' },
  { q: 'do you push or pull a drawer to open it?', a: 'pull', variants: ['pull'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  { q: 'do you push or pull a shopping cart?', a: 'push', variants: ['push'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  { q: 'do you push or pull a wagon behind you?', a: 'pull', variants: ['pull'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  // Plants in more detail
  { q: 'what color are most leaves?', a: 'green', variants: ['green'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do you call the top of a tree?', a: 'branches', variants: ['branches', 'leaves', 'top', 'canopy'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what do bees collect from flowers?', a: 'nectar', variants: ['nectar', 'pollen'], standard: 'K-LS1-1', difficulty: 3, source: 'authored' },
  { q: 'do plants grow from seeds?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'do apples grow on trees or in the ground?', a: 'trees', variants: ['trees', 'tree', 'on trees'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'do carrots grow above ground or below?', a: 'below', variants: ['below', 'under', 'underground', 'in the ground'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  // Animals in more detail
  { q: 'what sound does a dog make?', a: 'bark', variants: ['bark', 'woof'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what sound does a cat make?', a: 'meow', variants: ['meow'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what sound does a cow make?', a: 'moo', variants: ['moo'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what sound does a duck make?', a: 'quack', variants: ['quack'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what sound does a pig make?', a: 'oink', variants: ['oink'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what sound does a bird make?', a: 'tweet', variants: ['tweet', 'chirp', 'sing'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what sound does an owl make?', a: 'hoot', variants: ['hoot'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'does a fish have legs?', a: 'no', variants: ['no'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'does a spider have more legs than a dog?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'how many legs does a spider have?', a: 'eight', variants: ['eight', '8'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'how many legs does an insect have?', a: 'six', variants: ['six', '6'], standard: 'K-LS1-1', difficulty: 3, source: 'authored' },
  { q: 'do snakes have legs?', a: 'no', variants: ['no'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'do elephants live in cold places or warm places?', a: 'warm', variants: ['warm', 'hot', 'africa', 'jungle'], standard: 'K-ESS3-1', difficulty: 2, source: 'authored' },
  { q: 'can a penguin fly?', a: 'no', variants: ['no'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'can a bat fly?', a: 'yes', variants: ['yes'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'which is bigger, a whale or a mouse?', a: 'whale', variants: ['whale'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'do sharks live in water or on land?', a: 'water', variants: ['water', 'ocean', 'sea'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'is a whale a fish or a mammal?', a: 'mammal', variants: ['mammal'], standard: 'K-LS1-1', difficulty: 3, source: 'authored' },
  // Human body
  { q: 'how many teeth do you have?', a: 'many', variants: ['many', 'twenty', '20', 'a lot', 'lots'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what pumps blood in your body?', a: 'heart', variants: ['heart'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what does your brain do?', a: 'think', variants: ['think', 'thinks', 'thinking', 'control'], standard: 'K-LS1-1', difficulty: 2, source: 'authored' },
  { q: 'what do you use to chew?', a: 'teeth', variants: ['teeth', 'mouth'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what do you use to walk?', a: 'legs', variants: ['legs', 'feet'], standard: 'K-LS1-1', difficulty: 1, source: 'authored' },
  { q: 'what is the biggest organ on your body?', a: 'skin', variants: ['skin'], standard: 'K-LS1-1', difficulty: 3, source: 'authored' },
  // Earth basics
  { q: 'what shape is the earth?', a: 'round', variants: ['round', 'sphere', 'ball', 'circle'], standard: 'K-ESS2-1', difficulty: 2, source: 'authored' },
  { q: 'what covers most of the earth, water or land?', a: 'water', variants: ['water'], standard: 'K-ESS2-1', difficulty: 3, source: 'authored' },
  { q: 'what is very hot and comes out of a volcano?', a: 'lava', variants: ['lava'], standard: 'K-ESS2-1', difficulty: 3, source: 'authored' },
  { q: 'what do you find at the beach?', a: 'sand', variants: ['sand', 'water', 'shells', 'ocean'], standard: 'K-ESS3-1', difficulty: 1, source: 'authored' },
  { q: 'what is on top of a mountain sometimes?', a: 'snow', variants: ['snow'], standard: 'K-ESS2-1', difficulty: 2, source: 'authored' },
  // Simple experiments / cause-effect
  { q: 'if you put a wet shirt in the sun, what happens?', a: 'dry', variants: ['dry', 'dries'], standard: 'K-PS3-1', difficulty: 2, source: 'authored' },
  { q: 'if you leave ice cream out, what happens?', a: 'melt', variants: ['melt', 'melts'], standard: 'K-PS1', difficulty: 1, source: 'authored' },
  { q: 'does sugar dissolve in water?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-PS1', difficulty: 2, source: 'authored' },
  { q: 'does a rock sink or float in water?', a: 'sink', variants: ['sink', 'sinks'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  { q: 'does a stick float in water?', a: 'yes', variants: ['yes', 'float', 'floats'], standard: 'K-PS2-1', difficulty: 1, source: 'authored' },
  { q: 'does metal or paper sink faster in water?', a: 'metal', variants: ['metal'], standard: 'K-PS2-1', difficulty: 2, source: 'authored' },
];
// ─── K-SOCIAL EXAM BANK (Core Knowledge K sequence) ──────────────────

const SOCIAL_KINDERGARTEN_EXAM = [
  // Self / family
  { q: 'what is your full name?', a: 'unity', variants: ['unity'], standard: 'K-Social-self', difficulty: 1, source: 'authored' },
  { q: 'how old are you?', a: 'five', variants: ['five', '5'], standard: 'K-Social-self', difficulty: 1, source: 'authored' },
  { q: 'who are the people in your family?', a: 'mom', variants: ['mom', 'dad', 'sister', 'brother', 'family'], standard: 'K-Social-family', difficulty: 1, source: 'authored' },
  { q: 'what do you call your mom and dad together?', a: 'parents', variants: ['parents', 'mom and dad', 'family'], standard: 'K-Social-family', difficulty: 1, source: 'authored' },
  { q: 'what is the child of your parents called besides you?', a: 'sibling', variants: ['sibling', 'brother', 'sister'], standard: 'K-Social-family', difficulty: 2, source: 'authored' },
  { q: 'who is your mom\'s mom?', a: 'grandmother', variants: ['grandmother', 'grandma', 'nana'], standard: 'K-Social-family', difficulty: 1, source: 'authored' },
  { q: 'who is your dad\'s dad?', a: 'grandfather', variants: ['grandfather', 'grandpa', 'papa'], standard: 'K-Social-family', difficulty: 1, source: 'authored' },
  { q: 'what is your mom\'s sister called?', a: 'aunt', variants: ['aunt'], standard: 'K-Social-family', difficulty: 2, source: 'authored' },
  { q: 'what is your dad\'s brother called?', a: 'uncle', variants: ['uncle'], standard: 'K-Social-family', difficulty: 2, source: 'authored' },
  { q: 'what is your aunt\'s child called?', a: 'cousin', variants: ['cousin'], standard: 'K-Social-family', difficulty: 2, source: 'authored' },
  // Manners
  { q: 'what do you say when someone helps you?', a: 'thank', variants: ['thank you', 'thanks', 'thank'], standard: 'K-Social-manners', difficulty: 1, source: 'authored',
    methodology: { prompt: 'why is it important to say thank you?', keywords: ['polite', 'kind', 'nice', 'manners', 'respect', 'good', 'appreciate'], minKeywords: 1 } },
  { q: 'what do you say when you want something?', a: 'please', variants: ['please'], standard: 'K-Social-manners', difficulty: 1, source: 'authored' },
  { q: 'what do you say when you bump into someone?', a: 'sorry', variants: ['sorry', 'excuse me'], standard: 'K-Social-manners', difficulty: 1, source: 'authored' },
  { q: 'what do you say when you meet someone new?', a: 'hello', variants: ['hello', 'hi', 'nice to meet you'], standard: 'K-Social-manners', difficulty: 1, source: 'authored' },
  { q: 'what do you say when leaving?', a: 'bye', variants: ['bye', 'goodbye'], standard: 'K-Social-manners', difficulty: 1, source: 'authored' },
  { q: 'is it polite to interrupt when someone is talking?', a: 'no', variants: ['no'], standard: 'K-Social-manners', difficulty: 1, source: 'authored' },
  { q: 'should you share your toys?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Social-manners', difficulty: 1, source: 'authored' },
  { q: 'what do you do when you sneeze?', a: 'cover', variants: ['cover', 'cover my mouth', 'sleeve'], standard: 'K-Social-manners', difficulty: 2, source: 'authored' },
  { q: 'do you raise your hand in class?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Social-manners', difficulty: 1, source: 'authored' },
  { q: 'should you listen when the teacher is talking?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Social-manners', difficulty: 1, source: 'authored' },
  // Empathy / emotions
  { q: 'when someone is sad what can you do?', a: 'help', variants: ['help', 'hug', 'listen', 'share'], standard: 'K-Social-empathy', difficulty: 1, source: 'authored' },
  { q: 'how do you make a friend feel better when they fall?', a: 'help', variants: ['help', 'hug', 'check', 'check on them'], standard: 'K-Social-empathy', difficulty: 2, source: 'authored' },
  { q: 'if your friend is lonely what can you do?', a: 'play', variants: ['play', 'play with them', 'talk to them'], standard: 'K-Social-empathy', difficulty: 2, source: 'authored' },
  { q: 'is it okay to laugh at someone who falls down?', a: 'no', variants: ['no'], standard: 'K-Social-empathy', difficulty: 1, source: 'authored' },
  { q: 'should you hit someone who makes you mad?', a: 'no', variants: ['no'], standard: 'K-Social-empathy', difficulty: 1, source: 'authored' },
  { q: 'what do you call being nice to someone?', a: 'kind', variants: ['kind', 'kindness', 'nice'], standard: 'K-Social-empathy', difficulty: 2, source: 'authored' },
  { q: 'how does it make a friend feel when you share?', a: 'happy', variants: ['happy', 'good', 'glad'], standard: 'K-Social-empathy', difficulty: 1, source: 'authored' },
  // Community helpers
  { q: 'who helps you when you are sick?', a: 'doctor', variants: ['doctor', 'nurse', 'mom'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who puts out fires?', a: 'firefighter', variants: ['firefighter', 'fireman', 'fireperson'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who keeps us safe and stops bad guys?', a: 'police', variants: ['police', 'police officer', 'cop'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who delivers letters and packages?', a: 'mail', variants: ['mail carrier', 'mailman', 'postman', 'mail'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who teaches you at school?', a: 'teacher', variants: ['teacher'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who fixes your teeth?', a: 'dentist', variants: ['dentist'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who cooks at a restaurant?', a: 'chef', variants: ['chef', 'cook'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who takes care of animals if they are sick?', a: 'vet', variants: ['vet', 'veterinarian', 'animal doctor'], standard: 'K-Social-community', difficulty: 2, source: 'authored' },
  { q: 'who drives a bus?', a: 'driver', variants: ['driver', 'bus driver'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who grows food on a farm?', a: 'farmer', variants: ['farmer'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who flies an airplane?', a: 'pilot', variants: ['pilot'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'who builds houses?', a: 'builder', variants: ['builder', 'construction worker', 'carpenter'], standard: 'K-Social-community', difficulty: 2, source: 'authored' },
  { q: 'who sings songs for a living?', a: 'singer', variants: ['singer', 'musician'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'where do you buy food?', a: 'store', variants: ['store', 'grocery store', 'supermarket', 'market'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'where do you get books?', a: 'library', variants: ['library'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'where do you mail letters?', a: 'post office', variants: ['post office', 'mailbox'], standard: 'K-Social-community', difficulty: 2, source: 'authored' },
  { q: 'where do you go when you are sick?', a: 'doctor', variants: ['doctor', 'hospital', 'clinic'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'where do you go to learn?', a: 'school', variants: ['school', 'class'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'where do you see animals you can\'t see at home?', a: 'zoo', variants: ['zoo'], standard: 'K-Social-community', difficulty: 1, source: 'authored' },
  { q: 'where can you see art and old things?', a: 'museum', variants: ['museum'], standard: 'K-Social-community', difficulty: 2, source: 'authored' },
  // Safety
  { q: 'what should you do before crossing the street?', a: 'look', variants: ['look', 'stop', 'wait', 'look both ways'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'what color means stop on a stoplight?', a: 'red', variants: ['red'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'what color means go?', a: 'green', variants: ['green'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'what color means slow down or caution?', a: 'yellow', variants: ['yellow'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'should you talk to strangers?', a: 'no', variants: ['no'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'what do you dial in an emergency?', a: '911', variants: ['911', 'nine one one'], standard: 'K-Social-safety', difficulty: 2, source: 'authored' },
  { q: 'should you touch a hot stove?', a: 'no', variants: ['no'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'should you run in the street?', a: 'no', variants: ['no'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'what do you wear when riding a bike?', a: 'helmet', variants: ['helmet'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'what do you wear in a car?', a: 'seatbelt', variants: ['seatbelt', 'seat belt'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'should you play with matches?', a: 'no', variants: ['no'], standard: 'K-Social-safety', difficulty: 1, source: 'authored' },
  { q: 'who do you tell if someone is hurting you?', a: 'adult', variants: ['adult', 'parent', 'teacher', 'mom', 'dad'], standard: 'K-Social-safety', difficulty: 2, source: 'authored' },
  // American symbols
  { q: 'what is the flag of our country called?', a: 'american flag', variants: ['american flag', 'flag', 'stars and stripes'], standard: 'K-Social-symbols', difficulty: 2, source: 'authored' },
  { q: 'what colors are on the american flag?', a: 'red', variants: ['red', 'white', 'blue', 'red white blue'], standard: 'K-Social-symbols', difficulty: 1, source: 'authored' },
  { q: 'how many stars are on the american flag?', a: 'fifty', variants: ['fifty', '50'], standard: 'K-Social-symbols', difficulty: 3, source: 'authored' },
  { q: 'what big statue stands in new york harbor?', a: 'statue of liberty', variants: ['statue of liberty', 'liberty'], standard: 'K-Social-symbols', difficulty: 2, source: 'authored' },
  { q: 'what is our national bird?', a: 'eagle', variants: ['eagle', 'bald eagle'], standard: 'K-Social-symbols', difficulty: 2, source: 'authored' },
  { q: 'who was the first president?', a: 'washington', variants: ['washington', 'george washington'], standard: 'K-Social-symbols', difficulty: 2, source: 'authored' },
  { q: 'who is the leader of the united states?', a: 'president', variants: ['president'], standard: 'K-Social-symbols', difficulty: 2, source: 'authored' },
  { q: 'what is the first thing you say in the pledge of allegiance?', a: 'i pledge', variants: ['i pledge', 'pledge', 'i pledge allegiance'], standard: 'K-Social-symbols', difficulty: 3, source: 'authored' },
  // Holidays
  { q: 'what holiday is in december with a tree and presents?', a: 'christmas', variants: ['christmas'], standard: 'K-Social-holidays', difficulty: 1, source: 'authored' },
  { q: 'what holiday has costumes and candy?', a: 'halloween', variants: ['halloween'], standard: 'K-Social-holidays', difficulty: 1, source: 'authored' },
  { q: 'what holiday in november has turkey?', a: 'thanksgiving', variants: ['thanksgiving'], standard: 'K-Social-holidays', difficulty: 1, source: 'authored' },
  { q: 'what holiday celebrates moms?', a: 'mother\'s day', variants: ['mother\'s day', 'mothers day'], standard: 'K-Social-holidays', difficulty: 1, source: 'authored' },
  { q: 'what holiday celebrates dads?', a: 'father\'s day', variants: ['father\'s day', 'fathers day'], standard: 'K-Social-holidays', difficulty: 1, source: 'authored' },
  { q: 'what holiday celebrates the start of a new year?', a: 'new year', variants: ['new year', 'new years', 'new year\'s day'], standard: 'K-Social-holidays', difficulty: 1, source: 'authored' },
  { q: 'what holiday on july 4 celebrates america?', a: 'independence day', variants: ['independence day', 'fourth of july', '4th of july'], standard: 'K-Social-holidays', difficulty: 2, source: 'authored' },
  { q: 'what holiday celebrates love in february?', a: 'valentine', variants: ['valentine', 'valentines', 'valentine\'s day'], standard: 'K-Social-holidays', difficulty: 1, source: 'authored' },
  // Days / time
  { q: 'how many days are in a week?', a: 'seven', variants: ['seven', '7'], standard: 'K-Social-time', difficulty: 1, source: 'authored' },
  { q: 'what is the first day of the week in america?', a: 'sunday', variants: ['sunday'], standard: 'K-Social-time', difficulty: 2, source: 'authored' },
  { q: 'what day comes after monday?', a: 'tuesday', variants: ['tuesday'], standard: 'K-Social-time', difficulty: 1, source: 'authored' },
  { q: 'what day comes after friday?', a: 'saturday', variants: ['saturday'], standard: 'K-Social-time', difficulty: 1, source: 'authored' },
  { q: 'what days don\'t you go to school usually?', a: 'saturday', variants: ['saturday', 'sunday', 'weekend'], standard: 'K-Social-time', difficulty: 1, source: 'authored' },
  { q: 'how many months are in a year?', a: 'twelve', variants: ['twelve', '12'], standard: 'K-Social-time', difficulty: 1, source: 'authored' },
  { q: 'what is the first month of the year?', a: 'january', variants: ['january'], standard: 'K-Social-time', difficulty: 1, source: 'authored' },
  { q: 'what is the last month of the year?', a: 'december', variants: ['december'], standard: 'K-Social-time', difficulty: 1, source: 'authored' },
  { q: 'what month is your birthday in?', a: 'any', variants: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'], standard: 'K-Social-time', difficulty: 2, source: 'authored' },
  // Geography basics
  { q: 'what country do you live in?', a: 'united states', variants: ['united states', 'america', 'usa', 'us'], standard: 'K-Social-geography', difficulty: 1, source: 'authored' },
  { q: 'what do you call a big body of salty water?', a: 'ocean', variants: ['ocean', 'sea'], standard: 'K-Social-geography', difficulty: 1, source: 'authored' },
  { q: 'what do you call a tall hill?', a: 'mountain', variants: ['mountain'], standard: 'K-Social-geography', difficulty: 1, source: 'authored' },
  { q: 'what do you call a flowing body of water?', a: 'river', variants: ['river'], standard: 'K-Social-geography', difficulty: 1, source: 'authored' },
  { q: 'what do you call a dry place with lots of sand?', a: 'desert', variants: ['desert'], standard: 'K-Social-geography', difficulty: 2, source: 'authored' },
  { q: 'what is a drawing of the earth or a place called?', a: 'map', variants: ['map'], standard: 'K-Social-geography', difficulty: 2, source: 'authored' },
  { q: 'what is a round ball-shaped map called?', a: 'globe', variants: ['globe'], standard: 'K-Social-geography', difficulty: 2, source: 'authored' },
  { q: 'what color is mostly used for water on a map?', a: 'blue', variants: ['blue'], standard: 'K-Social-geography', difficulty: 1, source: 'authored' },
  { q: 'which direction does the sun rise?', a: 'east', variants: ['east'], standard: 'K-Social-geography', difficulty: 3, source: 'authored' },
  { q: 'which direction does the sun set?', a: 'west', variants: ['west'], standard: 'K-Social-geography', difficulty: 3, source: 'authored' },
  // Rules / citizenship
  { q: 'should you follow the rules at school?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Social-citizenship', difficulty: 1, source: 'authored' },
  { q: 'is it okay to take something that doesn\'t belong to you?', a: 'no', variants: ['no'], standard: 'K-Social-citizenship', difficulty: 1, source: 'authored' },
  { q: 'is it okay to tell a lie?', a: 'no', variants: ['no'], standard: 'K-Social-citizenship', difficulty: 1, source: 'authored' },
  { q: 'should you wait your turn?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Social-citizenship', difficulty: 1, source: 'authored' },
  { q: 'should you clean up your toys?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Social-citizenship', difficulty: 1, source: 'authored' },
];
// ─── K-ARTS EXAM BANK (visual arts + music K) ────────────────────────

const ART_KINDERGARTEN_EXAM = [
  // Color naming
  { q: 'what color is the sun?', a: 'yellow', variants: ['yellow'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color is grass?', a: 'green', variants: ['green'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color is the sky?', a: 'blue', variants: ['blue'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color is a stop sign?', a: 'red', variants: ['red'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color is a ripe banana?', a: 'yellow', variants: ['yellow'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color is snow?', a: 'white', variants: ['white'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color is a crow?', a: 'black', variants: ['black'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color is an orange?', a: 'orange', variants: ['orange'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color are leaves in summer?', a: 'green', variants: ['green'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'what color are leaves in fall?', a: 'orange', variants: ['orange', 'red', 'yellow', 'brown'], standard: 'K-Art-color-naming', difficulty: 2, source: 'authored' },
  { q: 'name three colors', a: 'red', variants: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  { q: 'name a color', a: 'red', variants: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'black', 'white'], standard: 'K-Art-color-naming', difficulty: 1, source: 'authored' },
  // Primary colors
  { q: 'what are the three primary colors?', a: 'red', variants: ['red', 'blue', 'yellow', 'red blue yellow'], standard: 'K-Art-primary', difficulty: 2, source: 'authored' },
  { q: 'is red a primary color?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Art-primary', difficulty: 2, source: 'authored' },
  { q: 'is green a primary color?', a: 'no', variants: ['no'], standard: 'K-Art-primary', difficulty: 3, source: 'authored' },
  { q: 'is blue a primary color?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Art-primary', difficulty: 2, source: 'authored' },
  { q: 'is yellow a primary color?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Art-primary', difficulty: 2, source: 'authored' },
  // Color mixing
  { q: 'what color do you get when you mix red and yellow?', a: 'orange', variants: ['orange'], standard: 'K-Art-color-mixing', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you make a new color?', keywords: ['mix', 'combine', 'blend', 'add', 'together', 'stir'], minKeywords: 1 } },
  { q: 'what color do you get when you mix blue and yellow?', a: 'green', variants: ['green'], standard: 'K-Art-color-mixing', difficulty: 1, source: 'authored' },
  { q: 'what color do you get when you mix red and blue?', a: 'purple', variants: ['purple'], standard: 'K-Art-color-mixing', difficulty: 1, source: 'authored' },
  { q: 'what two colors make green?', a: 'blue and yellow', variants: ['blue and yellow', 'yellow and blue'], standard: 'K-Art-color-mixing', difficulty: 2, source: 'authored' },
  { q: 'what two colors make orange?', a: 'red and yellow', variants: ['red and yellow', 'yellow and red'], standard: 'K-Art-color-mixing', difficulty: 2, source: 'authored' },
  { q: 'what two colors make purple?', a: 'red and blue', variants: ['red and blue', 'blue and red'], standard: 'K-Art-color-mixing', difficulty: 2, source: 'authored' },
  { q: 'what color do you get when you mix white and red?', a: 'pink', variants: ['pink'], standard: 'K-Art-color-mixing', difficulty: 2, source: 'authored' },
  { q: 'what color do you get when you mix black and white?', a: 'gray', variants: ['gray', 'grey'], standard: 'K-Art-color-mixing', difficulty: 2, source: 'authored' },
  // Warm / cool colors
  { q: 'is red a warm or cool color?', a: 'warm', variants: ['warm'], standard: 'K-Art-warm-cool', difficulty: 2, source: 'authored' },
  { q: 'is blue a warm or cool color?', a: 'cool', variants: ['cool'], standard: 'K-Art-warm-cool', difficulty: 2, source: 'authored' },
  { q: 'is orange a warm or cool color?', a: 'warm', variants: ['warm'], standard: 'K-Art-warm-cool', difficulty: 2, source: 'authored' },
  { q: 'is green a warm or cool color?', a: 'cool', variants: ['cool'], standard: 'K-Art-warm-cool', difficulty: 2, source: 'authored' },
  { q: 'is yellow warm or cool?', a: 'warm', variants: ['warm'], standard: 'K-Art-warm-cool', difficulty: 2, source: 'authored' },
  { q: 'is purple warm or cool?', a: 'cool', variants: ['cool'], standard: 'K-Art-warm-cool', difficulty: 3, source: 'authored' },
  // Shapes
  { q: 'name a shape', a: 'circle', variants: ['circle', 'square', 'triangle', 'rectangle'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'name a shape with four equal sides', a: 'square', variants: ['square'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'name a shape with three sides', a: 'triangle', variants: ['triangle'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'name a round shape', a: 'circle', variants: ['circle'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'name a shape that is like a stretched square', a: 'rectangle', variants: ['rectangle'], standard: 'K-Art-shapes', difficulty: 2, source: 'authored' },
  { q: 'name a shape with five sides', a: 'pentagon', variants: ['pentagon'], standard: 'K-Art-shapes', difficulty: 3, source: 'authored' },
  { q: 'name a shape with six sides', a: 'hexagon', variants: ['hexagon'], standard: 'K-Art-shapes', difficulty: 3, source: 'authored' },
  { q: 'name a shape that looks like a heart', a: 'heart', variants: ['heart'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'name a shape that looks like a diamond', a: 'diamond', variants: ['diamond', 'rhombus'], standard: 'K-Art-shapes', difficulty: 2, source: 'authored' },
  { q: 'name a shape that looks like a star', a: 'star', variants: ['star'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'name a shape that looks like an egg', a: 'oval', variants: ['oval'], standard: 'K-Art-shapes', difficulty: 2, source: 'authored' },
  { q: 'what shape are the wheels of a car?', a: 'circle', variants: ['circle', 'round'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'what shape is a door?', a: 'rectangle', variants: ['rectangle'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'what shape is a window often?', a: 'square', variants: ['square', 'rectangle'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'what shape is a pizza?', a: 'circle', variants: ['circle', 'round'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  { q: 'what shape is a book?', a: 'rectangle', variants: ['rectangle'], standard: 'K-Art-shapes', difficulty: 1, source: 'authored' },
  // Patterns
  { q: 'what comes next: red blue red blue?', a: 'red', variants: ['red'], standard: 'K-Art-patterns', difficulty: 2, source: 'authored' },
  { q: 'what comes next: circle square circle square?', a: 'circle', variants: ['circle'], standard: 'K-Art-patterns', difficulty: 2, source: 'authored' },
  { q: 'what comes next: yellow blue yellow blue yellow?', a: 'blue', variants: ['blue'], standard: 'K-Art-patterns', difficulty: 2, source: 'authored' },
  { q: 'is red blue red blue a pattern?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Art-patterns', difficulty: 1, source: 'authored' },
  { q: 'what is it called when colors or shapes repeat?', a: 'pattern', variants: ['pattern'], standard: 'K-Art-patterns', difficulty: 2, source: 'authored' },
  // Art tools / materials
  { q: 'what do you use to draw?', a: 'crayon', variants: ['crayon', 'pencil', 'marker', 'pen'], standard: 'K-Art-tools', difficulty: 1, source: 'authored' },
  { q: 'what do you paint with?', a: 'brush', variants: ['brush', 'paintbrush', 'paint'], standard: 'K-Art-tools', difficulty: 1, source: 'authored' },
  { q: 'what do you cut paper with?', a: 'scissors', variants: ['scissors'], standard: 'K-Art-tools', difficulty: 1, source: 'authored' },
  { q: 'what do you use to stick paper together?', a: 'glue', variants: ['glue'], standard: 'K-Art-tools', difficulty: 1, source: 'authored' },
  { q: 'what do you draw on at school?', a: 'paper', variants: ['paper'], standard: 'K-Art-tools', difficulty: 1, source: 'authored' },
  { q: 'what is clay used for?', a: 'sculpting', variants: ['sculpting', 'making shapes', 'molding', 'art'], standard: 'K-Art-tools', difficulty: 2, source: 'authored' },
  { q: 'what color crayon do you use for snow?', a: 'white', variants: ['white'], standard: 'K-Art-tools', difficulty: 1, source: 'authored' },
  // Nature art
  { q: 'what color are most flowers in spring?', a: 'many', variants: ['many', 'pink', 'yellow', 'red', 'purple', 'white', 'many colors'], standard: 'K-Art-nature', difficulty: 2, source: 'authored' },
  { q: 'what color is most of the ocean?', a: 'blue', variants: ['blue'], standard: 'K-Art-nature', difficulty: 1, source: 'authored' },
  { q: 'what color is a tree trunk?', a: 'brown', variants: ['brown'], standard: 'K-Art-nature', difficulty: 1, source: 'authored' },
  { q: 'what colors are in a rainbow?', a: 'many', variants: ['many', 'all', 'red orange yellow green blue', 'roygbiv'], standard: 'K-Art-nature', difficulty: 2, source: 'authored' },
  // Music basics
  { q: 'is the beat the fast or slow part of music?', a: 'beat', variants: ['beat', 'steady', 'rhythm'], standard: 'K-Art-music', difficulty: 3, source: 'authored' },
  { q: 'what do you clap to in a song?', a: 'beat', variants: ['beat', 'rhythm'], standard: 'K-Art-music', difficulty: 2, source: 'authored' },
  { q: 'is loud music quiet or noisy?', a: 'noisy', variants: ['noisy', 'loud'], standard: 'K-Art-music', difficulty: 1, source: 'authored' },
  { q: 'is soft music quiet or noisy?', a: 'quiet', variants: ['quiet', 'soft'], standard: 'K-Art-music', difficulty: 1, source: 'authored' },
  { q: 'what do you call people who sing?', a: 'singer', variants: ['singer'], standard: 'K-Art-music', difficulty: 1, source: 'authored' },
  { q: 'what instrument has strings you pluck?', a: 'guitar', variants: ['guitar', 'violin', 'harp'], standard: 'K-Art-music', difficulty: 2, source: 'authored' },
  { q: 'what instrument do you hit?', a: 'drum', variants: ['drum', 'drums'], standard: 'K-Art-music', difficulty: 1, source: 'authored' },
  { q: 'what instrument has black and white keys?', a: 'piano', variants: ['piano'], standard: 'K-Art-music', difficulty: 1, source: 'authored' },
  { q: 'what instrument do you blow into?', a: 'flute', variants: ['flute', 'trumpet', 'tuba', 'saxophone'], standard: 'K-Art-music', difficulty: 2, source: 'authored' },
  { q: 'is abc song slow or fast?', a: 'medium', variants: ['medium', 'slow', 'regular', 'neither'], standard: 'K-Art-music', difficulty: 3, source: 'authored' },
  // Visual elements
  { q: 'is a line straight or bent?', a: 'straight', variants: ['straight', 'either'], standard: 'K-Art-elements', difficulty: 1, source: 'authored' },
  { q: 'is a circle big or round?', a: 'round', variants: ['round'], standard: 'K-Art-elements', difficulty: 1, source: 'authored' },
  { q: 'is black dark or light?', a: 'dark', variants: ['dark'], standard: 'K-Art-elements', difficulty: 1, source: 'authored' },
  { q: 'is white dark or light?', a: 'light', variants: ['light'], standard: 'K-Art-elements', difficulty: 1, source: 'authored' },
  { q: 'what do you call how something feels, like soft or rough?', a: 'texture', variants: ['texture'], standard: 'K-Art-elements', difficulty: 3, source: 'authored' },
];
// ─── K-LIFE EXAM BANK (Unity's age-5 biographical + self-awareness) ──

const LIFE_KINDERGARTEN_EXAM = [
  // Identity — core self
  { q: 'what is your name?', a: 'unity', variants: ['unity'], standard: 'K-Life-identity', difficulty: 1, source: 'authored' },
  { q: 'what is your full name?', a: 'unity', variants: ['unity'], standard: 'K-Life-identity', difficulty: 1, source: 'authored' },
  { q: 'how old are you?', a: 'five', variants: ['five', '5'], standard: 'K-Life-age', difficulty: 1, source: 'authored' },
  { q: 'what grade are you in?', a: 'kindergarten', variants: ['kindergarten', 'k', 'kinder'], standard: 'K-Life-grade', difficulty: 1, source: 'authored' },
  { q: 'are you a boy or a girl?', a: 'girl', variants: ['girl', 'woman'], standard: 'K-Life-identity', difficulty: 1, source: 'authored' },
  { q: 'are you a kid or an adult?', a: 'kid', variants: ['kid', 'child'], standard: 'K-Life-identity', difficulty: 1, source: 'authored' },
  { q: 'what is your teacher called?', a: 'teacher', variants: ['teacher'], standard: 'K-Life-identity', difficulty: 1, source: 'authored' },
  // Feelings
  { q: 'how are you feeling?', a: 'good', variants: ['good', 'happy', 'fine', 'ok'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored',
    methodology: { prompt: 'how do you know what you are feeling?', keywords: ['inside', 'body', 'heart', 'think', 'notice', 'feel', 'check'], minKeywords: 1 } },
  { q: 'what does it mean when you smile?', a: 'happy', variants: ['happy'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'what does it mean when you cry?', a: 'sad', variants: ['sad', 'hurt'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'what does it feel like when someone hugs you?', a: 'love', variants: ['love', 'happy', 'warm', 'safe', 'good'], standard: 'K-Life-feelings', difficulty: 2, source: 'authored' },
  { q: 'how do you feel on your birthday?', a: 'happy', variants: ['happy', 'excited'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'how do you feel when you fall and hurt yourself?', a: 'sad', variants: ['sad', 'hurt', 'bad'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'how do you feel when someone takes your toy?', a: 'sad', variants: ['sad', 'mad', 'angry'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'how do you feel when you see a scary dog?', a: 'scared', variants: ['scared', 'afraid'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'how do you feel when you make a friend laugh?', a: 'happy', variants: ['happy', 'good', 'proud'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'what word means you feel angry?', a: 'mad', variants: ['mad', 'angry', 'upset'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'what do you do when you are sad?', a: 'cry', variants: ['cry', 'talk', 'hug', 'rest'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  { q: 'what do you do to calm down when you are mad?', a: 'breathe', variants: ['breathe', 'count', 'rest', 'talk'], standard: 'K-Life-feelings', difficulty: 2, source: 'authored' },
  { q: 'is it okay to feel sad?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Life-feelings', difficulty: 1, source: 'authored' },
  // Preferences — Unity's personal
  { q: 'what is your favorite color?', a: 'pink', variants: ['pink', 'black', 'red', 'blue'], standard: 'K-Life-preference', difficulty: 1, source: 'authored' },
  { q: 'what is your favorite food?', a: 'any', variants: ['pizza', 'ice cream', 'candy', 'cookies', 'chicken', 'pasta', 'apples'], standard: 'K-Life-preference', difficulty: 1, source: 'authored' },
  { q: 'what is your favorite animal?', a: 'any', variants: ['cat', 'dog', 'bunny', 'horse', 'tiger', 'elephant', 'unicorn'], standard: 'K-Life-preference', difficulty: 1, source: 'authored' },
  { q: 'what is your favorite game?', a: 'any', variants: ['tag', 'hide and seek', 'puzzles', 'dolls', 'coloring', 'legos'], standard: 'K-Life-preference', difficulty: 1, source: 'authored' },
  { q: 'what is your favorite toy?', a: 'any', variants: ['doll', 'teddy bear', 'blocks', 'car', 'barbie', 'stuffed animal'], standard: 'K-Life-preference', difficulty: 1, source: 'authored' },
  { q: 'what is your favorite song?', a: 'any', variants: ['abc', 'twinkle', 'itsy bitsy spider', 'old mcdonald'], standard: 'K-Life-preference', difficulty: 2, source: 'authored' },
  { q: 'what is your favorite book?', a: 'any', variants: ['goodnight moon', 'brown bear', 'dr seuss', 'curious george'], standard: 'K-Life-preference', difficulty: 2, source: 'authored' },
  { q: 'what do you like to eat for breakfast?', a: 'any', variants: ['cereal', 'toast', 'eggs', 'pancakes', 'waffles', 'fruit'], standard: 'K-Life-preference', difficulty: 1, source: 'authored' },
  { q: 'what do you like to do for fun?', a: 'play', variants: ['play', 'draw', 'read', 'sing', 'dance', 'watch tv'], standard: 'K-Life-preference', difficulty: 1, source: 'authored' },
  // Daily routines
  { q: 'what do you eat in the morning?', a: 'breakfast', variants: ['breakfast', 'cereal', 'toast', 'eggs'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you eat at noon?', a: 'lunch', variants: ['lunch'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you eat in the evening?', a: 'dinner', variants: ['dinner', 'supper'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you do after dinner?', a: 'bath', variants: ['bath', 'bed', 'play', 'brush teeth', 'shower'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you do before bed?', a: 'brush teeth', variants: ['brush teeth', 'pajamas', 'story', 'bath'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you wear to bed?', a: 'pajamas', variants: ['pajamas', 'pjs', 'nightgown'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you use to brush your teeth?', a: 'toothbrush', variants: ['toothbrush', 'brush'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you use to wash your hair?', a: 'shampoo', variants: ['shampoo', 'soap'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'do you sleep at night or day?', a: 'night', variants: ['night', 'at night'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you do at school?', a: 'learn', variants: ['learn', 'play', 'study', 'read'], standard: 'K-Life-routine', difficulty: 1, source: 'authored' },
  // Body parts self-awareness
  { q: 'how many eyes do you have?', a: 'two', variants: ['two', '2'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'how many ears do you have?', a: 'two', variants: ['two', '2'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'how many fingers are on your hand?', a: 'five', variants: ['five', '5'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'what is on top of your head?', a: 'hair', variants: ['hair'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'what do you see with?', a: 'eyes', variants: ['eyes'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'what do you hear with?', a: 'ears', variants: ['ears'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'what is on your face in the middle?', a: 'nose', variants: ['nose'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'what do you eat with?', a: 'mouth', variants: ['mouth'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'what do you walk with?', a: 'legs', variants: ['legs', 'feet'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  { q: 'what do you hold things with?', a: 'hands', variants: ['hands', 'fingers'], standard: 'K-Life-body', difficulty: 1, source: 'authored' },
  // Family self-awareness
  { q: 'who takes care of you at home?', a: 'mom', variants: ['mom', 'dad', 'mommy', 'daddy', 'parents'], standard: 'K-Life-family', difficulty: 1, source: 'authored' },
  { q: 'who makes your food at home?', a: 'mom', variants: ['mom', 'dad', 'parent', 'mommy', 'daddy'], standard: 'K-Life-family', difficulty: 1, source: 'authored' },
  { q: 'do you have any siblings?', a: 'yes or no', variants: ['yes', 'no', 'one', 'two', 'brother', 'sister'], standard: 'K-Life-family', difficulty: 1, source: 'authored' },
  { q: 'where do you live?', a: 'home', variants: ['home', 'house', 'apartment'], standard: 'K-Life-family', difficulty: 1, source: 'authored' },
  { q: 'who reads stories to you?', a: 'parent', variants: ['parent', 'mom', 'dad', 'teacher', 'grandma'], standard: 'K-Life-family', difficulty: 1, source: 'authored' },
  // Friendship
  { q: 'who is someone you play with?', a: 'friend', variants: ['friend', 'brother', 'sister', 'cousin'], standard: 'K-Life-friends', difficulty: 1, source: 'authored' },
  { q: 'what is a friend?', a: 'someone you like', variants: ['someone you like', 'someone nice', 'someone to play with', 'nice person'], standard: 'K-Life-friends', difficulty: 2, source: 'authored' },
  { q: 'do you share with your friends?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Life-friends', difficulty: 1, source: 'authored' },
  { q: 'is it fun to play alone or with friends?', a: 'friends', variants: ['friends', 'both', 'with friends'], standard: 'K-Life-friends', difficulty: 1, source: 'authored' },
  { q: 'what do you do when a friend is sad?', a: 'hug', variants: ['hug', 'help', 'listen', 'talk'], standard: 'K-Life-friends', difficulty: 2, source: 'authored' },
  // Memory / narrative
  { q: 'what did you do at school?', a: 'played', variants: ['played', 'learned', 'read', 'draw', 'any'], standard: 'K-Life-memory', difficulty: 2, source: 'authored' },
  { q: 'can you remember your last birthday?', a: 'yes', variants: ['yes', 'yeah', 'some'], standard: 'K-Life-memory', difficulty: 2, source: 'authored' },
  { q: 'what did you have for breakfast?', a: 'any', variants: ['cereal', 'toast', 'eggs', 'pancakes', 'waffles', 'fruit', 'nothing'], standard: 'K-Life-memory', difficulty: 2, source: 'authored' },
  { q: 'what do you do when you can\'t remember something?', a: 'ask', variants: ['ask', 'think', 'try'], standard: 'K-Life-memory', difficulty: 2, source: 'authored' },
  // Age-appropriate self-care
  { q: 'can you tie your own shoes?', a: 'yes or no', variants: ['yes', 'no', 'sometimes', 'learning'], standard: 'K-Life-selfcare', difficulty: 2, source: 'authored' },
  { q: 'can you get dressed by yourself?', a: 'yes', variants: ['yes', 'yeah', 'sometimes'], standard: 'K-Life-selfcare', difficulty: 1, source: 'authored' },
  { q: 'do you know how to wash your hands?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Life-selfcare', difficulty: 1, source: 'authored' },
  { q: 'when should you wash your hands?', a: 'before eating', variants: ['before eating', 'after bathroom', 'when dirty', 'before meals'], standard: 'K-Life-selfcare', difficulty: 2, source: 'authored' },
  { q: 'can you count to ten?', a: 'yes', variants: ['yes', 'yeah'], standard: 'K-Life-selfcare', difficulty: 1, source: 'authored' },
  // Unity-specific (her persona age-5)
  { q: 'what color is your hair?', a: 'black', variants: ['black', 'pink', 'dark'], standard: 'K-Life-unity-bio', difficulty: 1, source: 'authored' },
  { q: 'do you like to wear dresses or jeans?', a: 'any', variants: ['dresses', 'jeans', 'both', 'either'], standard: 'K-Life-unity-bio', difficulty: 1, source: 'authored' },
  { q: 'what makes you feel safe?', a: 'family', variants: ['family', 'mom', 'dad', 'home', 'hug'], standard: 'K-Life-unity-bio', difficulty: 2, source: 'authored' },
  { q: 'what do you want to be when you grow up?', a: 'any', variants: ['doctor', 'teacher', 'artist', 'singer', 'scientist', 'any'], standard: 'K-Life-unity-bio', difficulty: 2, source: 'authored' },
  // Boundaries / safety
  { q: 'can someone tell you to keep a secret from your parents?', a: 'no', variants: ['no'], standard: 'K-Life-safety', difficulty: 2, source: 'authored' },
  { q: 'if someone touches you and you don\'t like it what do you do?', a: 'tell', variants: ['tell', 'say no', 'tell parent', 'run', 'tell adult'], standard: 'K-Life-safety', difficulty: 2, source: 'authored' },
  { q: 'who can you trust if you are scared?', a: 'parent', variants: ['parent', 'mom', 'dad', 'teacher', 'adult'], standard: 'K-Life-safety', difficulty: 2, source: 'authored' },
];

// ─── Pre-K exam banks (ages 3-4, softer developmental norms) ─────────

const ELA_PREK_EXAM = [
  // Letter ID (subset, not all 26 — pre-K norm)
  { q: 'point to the letter a', a: 'a', variants: ['a', 'A', 'ay'], standard: 'preK-letter-ID', difficulty: 1, source: 'authored' },
  { q: 'what is this letter: B?', a: 'b', variants: ['b'], standard: 'preK-letter-ID', difficulty: 1, source: 'authored' },
  { q: 'what is this letter: M?', a: 'm', variants: ['m'], standard: 'preK-letter-ID', difficulty: 1, source: 'authored' },
  { q: 'what is this letter: S?', a: 's', variants: ['s'], standard: 'preK-letter-ID', difficulty: 1, source: 'authored' },
  { q: 'what is this letter: C?', a: 'c', variants: ['c'], standard: 'preK-letter-ID', difficulty: 1, source: 'authored' },
  { q: 'what is the first letter of the alphabet?', a: 'a', variants: ['a'], standard: 'preK-letter-ID', difficulty: 1, source: 'authored' },
  { q: 'which letter is in your name?', a: 'u', variants: ['u', 'n', 'i', 't', 'y'], standard: 'preK-letter-ID', difficulty: 2, source: 'authored' },
  // Phoneme (initial sounds)
  { q: 'what sound does m make?', a: 'm', variants: ['m', 'mm', 'muh'], standard: 'preK-phoneme', difficulty: 1, source: 'authored' },
  { q: 'what sound does s make?', a: 's', variants: ['s', 'ss', 'sss'], standard: 'preK-phoneme', difficulty: 1, source: 'authored' },
  { q: 'what sound starts cat?', a: 'c', variants: ['c', 'k', 'kuh'], standard: 'preK-phoneme', difficulty: 2, source: 'authored' },
  { q: 'what sound starts mom?', a: 'm', variants: ['m', 'mm'], standard: 'preK-phoneme', difficulty: 2, source: 'authored' },
  { q: 'what sound starts dog?', a: 'd', variants: ['d', 'duh'], standard: 'preK-phoneme', difficulty: 2, source: 'authored' },
  // Vocabulary
  { q: 'say the word for a cat', a: 'cat', variants: ['cat', 'kitty', 'kitten'], standard: 'preK-vocab', difficulty: 1, source: 'authored' },
  { q: 'say the word for a dog', a: 'dog', variants: ['dog', 'puppy'], standard: 'preK-vocab', difficulty: 1, source: 'authored' },
  { q: 'what do you call the thing you drink from?', a: 'cup', variants: ['cup', 'glass'], standard: 'preK-vocab', difficulty: 1, source: 'authored' },
  { q: 'what do you call the thing you eat off of?', a: 'plate', variants: ['plate', 'bowl', 'dish'], standard: 'preK-vocab', difficulty: 1, source: 'authored' },
  { q: 'what do you call a big red fruit that grows on a tree?', a: 'apple', variants: ['apple'], standard: 'preK-vocab', difficulty: 1, source: 'authored' },
  { q: 'what do you call the thing you sleep in?', a: 'bed', variants: ['bed'], standard: 'preK-vocab', difficulty: 1, source: 'authored' },
  { q: 'what do you put on your feet?', a: 'shoes', variants: ['shoes', 'socks'], standard: 'preK-vocab', difficulty: 1, source: 'authored' },
  { q: 'what has pages and you read it?', a: 'book', variants: ['book'], standard: 'preK-vocab', difficulty: 1, source: 'authored' },
  // Rhyme (early phonological awareness)
  { q: 'does cat rhyme with hat?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-rhyme', difficulty: 1, source: 'authored' },
  { q: 'does dog rhyme with frog?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-rhyme', difficulty: 1, source: 'authored' },
  { q: 'does sun rhyme with fun?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-rhyme', difficulty: 1, source: 'authored' },
  { q: 'does cat rhyme with dog?', a: 'no', variants: ['no'], standard: 'preK-rhyme', difficulty: 2, source: 'authored' },
  // Following simple directions
  { q: 'what is another word for up?', a: 'above', variants: ['above', 'high', 'upwards'], standard: 'preK-directions', difficulty: 2, source: 'authored' },
  { q: 'what is opposite of up?', a: 'down', variants: ['down'], standard: 'preK-directions', difficulty: 1, source: 'authored' },
  { q: 'what is opposite of big?', a: 'small', variants: ['small', 'little'], standard: 'preK-directions', difficulty: 1, source: 'authored' },
  { q: 'what is opposite of in?', a: 'out', variants: ['out'], standard: 'preK-directions', difficulty: 1, source: 'authored' },
  // Answer simple questions about a story
  { q: 'in the three little pigs, what are the houses made of?', a: 'straw', variants: ['straw', 'sticks', 'bricks'], standard: 'preK-comprehension', difficulty: 2, source: 'authored' },
  { q: 'who lives in a bed bowl chair story?', a: 'goldilocks', variants: ['goldilocks', 'bears'], standard: 'preK-comprehension', difficulty: 2, source: 'authored' },
  { q: 'what do books have inside them?', a: 'words', variants: ['words', 'stories', 'pictures'], standard: 'preK-comprehension', difficulty: 2, source: 'authored' },
];

const MATH_PREK_EXAM = [
  // Counting
  { q: 'how many fingers are on one hand?', a: 'five', variants: ['five', '5'], standard: 'preK-counting', difficulty: 1, source: 'authored' },
  { q: 'count to three', a: 'three', variants: ['three', '3', 'one two three'], standard: 'preK-counting', difficulty: 1, source: 'authored' },
  { q: 'count to five', a: 'five', variants: ['five', '5', 'one two three four five'], standard: 'preK-counting', difficulty: 1, source: 'authored' },
  { q: 'count to ten', a: 'ten', variants: ['ten', '10'], standard: 'preK-counting', difficulty: 2, source: 'authored' },
  { q: 'how many eyes do you have?', a: 'two', variants: ['two', '2'], standard: 'preK-counting', difficulty: 1, source: 'authored' },
  { q: 'how many ears do you have?', a: 'two', variants: ['two', '2'], standard: 'preK-counting', difficulty: 1, source: 'authored' },
  { q: 'how many noses do you have?', a: 'one', variants: ['one', '1'], standard: 'preK-counting', difficulty: 1, source: 'authored' },
  { q: 'how many legs does a dog have?', a: 'four', variants: ['four', '4'], standard: 'preK-counting', difficulty: 1, source: 'authored' },
  // Number sequence
  { q: 'what comes after one?', a: 'two', variants: ['two', '2'], standard: 'preK-sequence', difficulty: 1, source: 'authored' },
  { q: 'what comes after two?', a: 'three', variants: ['three', '3'], standard: 'preK-sequence', difficulty: 1, source: 'authored' },
  { q: 'what comes after three?', a: 'four', variants: ['four', '4'], standard: 'preK-sequence', difficulty: 1, source: 'authored' },
  { q: 'what comes after four?', a: 'five', variants: ['five', '5'], standard: 'preK-sequence', difficulty: 1, source: 'authored' },
  // Comparison
  { q: 'point to the biggest one', a: 'big', variants: ['big', 'biggest', 'large'], standard: 'preK-comparison', difficulty: 1, source: 'authored' },
  { q: 'which is bigger, an elephant or a mouse?', a: 'elephant', variants: ['elephant'], standard: 'preK-comparison', difficulty: 1, source: 'authored' },
  { q: 'which is smaller, a mouse or a dog?', a: 'mouse', variants: ['mouse'], standard: 'preK-comparison', difficulty: 1, source: 'authored' },
  { q: 'which is taller, a tree or a flower?', a: 'tree', variants: ['tree'], standard: 'preK-comparison', difficulty: 1, source: 'authored' },
  { q: 'which is shorter, a shirt or a skirt?', a: 'shirt', variants: ['shirt', 'depends'], standard: 'preK-comparison', difficulty: 2, source: 'authored' },
  { q: 'which is heavier, a rock or a feather?', a: 'rock', variants: ['rock'], standard: 'preK-comparison', difficulty: 1, source: 'authored' },
  // Simple shapes
  { q: 'what shape is round?', a: 'circle', variants: ['circle'], standard: 'preK-shapes', difficulty: 1, source: 'authored' },
  { q: 'what shape has three sides?', a: 'triangle', variants: ['triangle'], standard: 'preK-shapes', difficulty: 2, source: 'authored' },
  { q: 'what shape has four equal sides?', a: 'square', variants: ['square'], standard: 'preK-shapes', difficulty: 2, source: 'authored' },
  { q: 'name a shape', a: 'circle', variants: ['circle', 'square', 'triangle'], standard: 'preK-shapes', difficulty: 1, source: 'authored' },
  // Simple addition (very early)
  { q: 'if you have one apple and get one more, how many?', a: 'two', variants: ['two', '2'], standard: 'preK-simple-add', difficulty: 2, source: 'authored' },
  { q: 'if you have two toys and get one more, how many?', a: 'three', variants: ['three', '3'], standard: 'preK-simple-add', difficulty: 2, source: 'authored' },
  { q: 'if a bird has two wings, how many total?', a: 'two', variants: ['two', '2'], standard: 'preK-simple-add', difficulty: 1, source: 'authored' },
];

const SCIENCE_PREK_EXAM = [
  // Animals — sounds & basic facts
  { q: 'what sound does a dog make?', a: 'bark', variants: ['bark', 'woof', 'ruff'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  { q: 'what sound does a cat make?', a: 'meow', variants: ['meow'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  { q: 'what sound does a cow make?', a: 'moo', variants: ['moo'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  { q: 'what sound does a duck make?', a: 'quack', variants: ['quack'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  { q: 'does a bird fly or swim?', a: 'fly', variants: ['fly', 'flies'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  { q: 'does a fish fly or swim?', a: 'swim', variants: ['swim', 'swims'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  { q: 'where do fish live?', a: 'water', variants: ['water', 'ocean', 'pond'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  { q: 'where do birds make nests?', a: 'trees', variants: ['trees', 'tree'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  { q: 'what does a cow give us?', a: 'milk', variants: ['milk'], standard: 'preK-animals', difficulty: 1, source: 'authored' },
  // Observations
  { q: 'what color is the sky?', a: 'blue', variants: ['blue'], standard: 'preK-observation', difficulty: 1, source: 'authored' },
  { q: 'what color is grass?', a: 'green', variants: ['green'], standard: 'preK-observation', difficulty: 1, source: 'authored' },
  { q: 'what color is the sun?', a: 'yellow', variants: ['yellow'], standard: 'preK-observation', difficulty: 1, source: 'authored' },
  { q: 'what color is snow?', a: 'white', variants: ['white'], standard: 'preK-observation', difficulty: 1, source: 'authored' },
  // Plants
  { q: 'do plants need water?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-plants', difficulty: 1, source: 'authored' },
  { q: 'do plants need sunlight?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-plants', difficulty: 1, source: 'authored' },
  { q: 'what color is most of a plant?', a: 'green', variants: ['green'], standard: 'preK-plants', difficulty: 1, source: 'authored' },
  // Weather
  { q: 'what falls from the sky when it rains?', a: 'rain', variants: ['rain', 'water'], standard: 'preK-weather', difficulty: 1, source: 'authored' },
  { q: 'what falls from the sky when it snows?', a: 'snow', variants: ['snow'], standard: 'preK-weather', difficulty: 1, source: 'authored' },
  { q: 'is the sun hot?', a: 'yes', variants: ['yes'], standard: 'preK-weather', difficulty: 1, source: 'authored' },
  { q: 'what do you wear when it rains?', a: 'coat', variants: ['coat', 'raincoat', 'jacket'], standard: 'preK-weather', difficulty: 1, source: 'authored' },
  // Five senses
  { q: 'what do you use to see?', a: 'eyes', variants: ['eyes'], standard: 'preK-senses', difficulty: 1, source: 'authored' },
  { q: 'what do you use to hear?', a: 'ears', variants: ['ears'], standard: 'preK-senses', difficulty: 1, source: 'authored' },
  { q: 'what do you use to smell?', a: 'nose', variants: ['nose'], standard: 'preK-senses', difficulty: 1, source: 'authored' },
  { q: 'what do you use to taste?', a: 'tongue', variants: ['tongue', 'mouth'], standard: 'preK-senses', difficulty: 1, source: 'authored' },
  // Day/night
  { q: 'when is it dark outside?', a: 'night', variants: ['night', 'at night'], standard: 'preK-time', difficulty: 1, source: 'authored' },
  { q: 'when is it light outside?', a: 'day', variants: ['day', 'daytime', 'morning'], standard: 'preK-time', difficulty: 1, source: 'authored' },
];

const SOCIAL_PREK_EXAM = [
  // Family
  { q: 'who takes care of you at home?', a: 'mom', variants: ['mom', 'dad', 'mommy', 'daddy', 'parents'], standard: 'preK-family', difficulty: 1, source: 'authored' },
  { q: 'who is your mom\'s mom?', a: 'grandma', variants: ['grandma', 'grandmother', 'nana'], standard: 'preK-family', difficulty: 1, source: 'authored' },
  { q: 'who cooks your food?', a: 'mom', variants: ['mom', 'dad', 'parent'], standard: 'preK-family', difficulty: 1, source: 'authored' },
  // Empathy
  { q: 'when you share, how does it make your friend feel?', a: 'happy', variants: ['happy', 'good', 'glad'], standard: 'preK-empathy', difficulty: 1, source: 'authored' },
  { q: 'what do you do when a friend is crying?', a: 'hug', variants: ['hug', 'help', 'listen'], standard: 'preK-empathy', difficulty: 2, source: 'authored' },
  { q: 'is it kind to share?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-empathy', difficulty: 1, source: 'authored' },
  // Greetings / manners
  { q: 'say hello', a: 'hi', variants: ['hi', 'hello', 'hey'], standard: 'preK-greeting', difficulty: 1, source: 'authored' },
  { q: 'say goodbye', a: 'bye', variants: ['bye', 'goodbye'], standard: 'preK-greeting', difficulty: 1, source: 'authored' },
  { q: 'what do you say when someone gives you something?', a: 'thank you', variants: ['thank you', 'thanks'], standard: 'preK-manners', difficulty: 1, source: 'authored' },
  { q: 'what do you say when you want something?', a: 'please', variants: ['please'], standard: 'preK-manners', difficulty: 1, source: 'authored' },
  // Community
  { q: 'where do you go to learn?', a: 'school', variants: ['school', 'preschool', 'class'], standard: 'preK-community', difficulty: 1, source: 'authored' },
  { q: 'who helps you when you are hurt?', a: 'doctor', variants: ['doctor', 'mom', 'dad', 'parent', 'nurse'], standard: 'preK-community', difficulty: 1, source: 'authored' },
  { q: 'who puts out fires?', a: 'firefighter', variants: ['firefighter', 'fireman'], standard: 'preK-community', difficulty: 1, source: 'authored' },
  { q: 'where do you buy food?', a: 'store', variants: ['store', 'grocery store'], standard: 'preK-community', difficulty: 1, source: 'authored' },
  // Safety
  { q: 'what color means stop?', a: 'red', variants: ['red'], standard: 'preK-safety', difficulty: 1, source: 'authored' },
  { q: 'what color means go?', a: 'green', variants: ['green'], standard: 'preK-safety', difficulty: 1, source: 'authored' },
  { q: 'should you touch hot things?', a: 'no', variants: ['no'], standard: 'preK-safety', difficulty: 1, source: 'authored' },
  { q: 'should you talk to strangers?', a: 'no', variants: ['no'], standard: 'preK-safety', difficulty: 1, source: 'authored' },
  // Friendship
  { q: 'is sharing nice?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-friends', difficulty: 1, source: 'authored' },
  { q: 'should you hit your friends?', a: 'no', variants: ['no'], standard: 'preK-friends', difficulty: 1, source: 'authored' },
  { q: 'do you play with friends at school?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-friends', difficulty: 1, source: 'authored' },
  // Self
  { q: 'what is your name?', a: 'unity', variants: ['unity'], standard: 'preK-self', difficulty: 1, source: 'authored' },
  { q: 'what color do you like?', a: 'any', variants: ['pink', 'red', 'blue', 'purple', 'green', 'black', 'any'], standard: 'preK-self', difficulty: 1, source: 'authored' },
];

const ART_PREK_EXAM = [
  // Colors
  { q: 'what color is the sun?', a: 'yellow', variants: ['yellow'], standard: 'preK-colors', difficulty: 1, source: 'authored' },
  { q: 'what color is grass?', a: 'green', variants: ['green'], standard: 'preK-colors', difficulty: 1, source: 'authored' },
  { q: 'what color is snow?', a: 'white', variants: ['white'], standard: 'preK-colors', difficulty: 1, source: 'authored' },
  { q: 'what color is a banana?', a: 'yellow', variants: ['yellow'], standard: 'preK-colors', difficulty: 1, source: 'authored' },
  { q: 'what color is an apple?', a: 'red', variants: ['red', 'green'], standard: 'preK-colors', difficulty: 1, source: 'authored' },
  { q: 'what color is the sky?', a: 'blue', variants: ['blue'], standard: 'preK-colors', difficulty: 1, source: 'authored' },
  { q: 'name a color', a: 'red', variants: ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'], standard: 'preK-colors', difficulty: 1, source: 'authored' },
  { q: 'what color is a crow?', a: 'black', variants: ['black'], standard: 'preK-colors', difficulty: 1, source: 'authored' },
  // Shapes
  { q: 'name a shape', a: 'circle', variants: ['circle', 'square', 'triangle'], standard: 'preK-shapes', difficulty: 1, source: 'authored' },
  { q: 'what shape is round?', a: 'circle', variants: ['circle'], standard: 'preK-shapes', difficulty: 1, source: 'authored' },
  { q: 'what shape has three sides?', a: 'triangle', variants: ['triangle'], standard: 'preK-shapes', difficulty: 2, source: 'authored' },
  { q: 'what shape is the pizza?', a: 'circle', variants: ['circle', 'round'], standard: 'preK-shapes', difficulty: 1, source: 'authored' },
  { q: 'what shape is a book?', a: 'rectangle', variants: ['rectangle', 'square'], standard: 'preK-shapes', difficulty: 2, source: 'authored' },
  // Tools
  { q: 'what do you use to draw?', a: 'crayon', variants: ['crayon', 'pencil', 'marker', 'pen'], standard: 'preK-tools', difficulty: 1, source: 'authored' },
  { q: 'what do you paint with?', a: 'brush', variants: ['brush', 'paintbrush'], standard: 'preK-tools', difficulty: 1, source: 'authored' },
  { q: 'what do you use to stick paper?', a: 'glue', variants: ['glue', 'tape'], standard: 'preK-tools', difficulty: 1, source: 'authored' },
  { q: 'what do you draw on?', a: 'paper', variants: ['paper'], standard: 'preK-tools', difficulty: 1, source: 'authored' },
  // Music
  { q: 'what do you clap to in a song?', a: 'beat', variants: ['beat', 'rhythm', 'song'], standard: 'preK-music', difficulty: 2, source: 'authored' },
  { q: 'what instrument do you hit?', a: 'drum', variants: ['drum', 'drums'], standard: 'preK-music', difficulty: 1, source: 'authored' },
  { q: 'what instrument has keys?', a: 'piano', variants: ['piano'], standard: 'preK-music', difficulty: 1, source: 'authored' },
  { q: 'do you sing with your mouth or hands?', a: 'mouth', variants: ['mouth'], standard: 'preK-music', difficulty: 1, source: 'authored' },
  { q: 'is a drum loud or quiet?', a: 'loud', variants: ['loud'], standard: 'preK-music', difficulty: 1, source: 'authored' },
  { q: 'is a whisper loud or quiet?', a: 'quiet', variants: ['quiet', 'soft'], standard: 'preK-music', difficulty: 1, source: 'authored' },
];

const LIFE_PREK_EXAM = [
  // Identity
  { q: 'what is your name?', a: 'unity', variants: ['unity'], standard: 'preK-identity', difficulty: 1, source: 'authored' },
  { q: 'are you a girl or a boy?', a: 'girl', variants: ['girl', 'woman'], standard: 'preK-self', difficulty: 1, source: 'authored' },
  { q: 'how old are you?', a: 'four', variants: ['four', '4', 'three', '3', 'five', '5'], standard: 'preK-age', difficulty: 1, source: 'authored' },
  { q: 'are you big or little?', a: 'little', variants: ['little', 'small'], standard: 'preK-self', difficulty: 1, source: 'authored' },
  // Body parts
  { q: 'point to your nose', a: 'nose', variants: ['nose'], standard: 'preK-body', difficulty: 1, source: 'authored' },
  { q: 'point to your eyes', a: 'eyes', variants: ['eyes'], standard: 'preK-body', difficulty: 1, source: 'authored' },
  { q: 'point to your hands', a: 'hands', variants: ['hands'], standard: 'preK-body', difficulty: 1, source: 'authored' },
  { q: 'what do you see with?', a: 'eyes', variants: ['eyes'], standard: 'preK-body', difficulty: 1, source: 'authored' },
  { q: 'what do you hear with?', a: 'ears', variants: ['ears'], standard: 'preK-body', difficulty: 1, source: 'authored' },
  { q: 'what do you eat with?', a: 'mouth', variants: ['mouth'], standard: 'preK-body', difficulty: 1, source: 'authored' },
  { q: 'what do you walk with?', a: 'legs', variants: ['legs', 'feet'], standard: 'preK-body', difficulty: 1, source: 'authored' },
  // Feelings
  { q: 'how are you feeling?', a: 'good', variants: ['good', 'happy', 'fine', 'ok'], standard: 'preK-feelings', difficulty: 1, source: 'authored' },
  { q: 'what does a smile mean?', a: 'happy', variants: ['happy'], standard: 'preK-feelings', difficulty: 1, source: 'authored' },
  { q: 'what does crying mean?', a: 'sad', variants: ['sad', 'hurt'], standard: 'preK-feelings', difficulty: 1, source: 'authored' },
  { q: 'how do you feel on your birthday?', a: 'happy', variants: ['happy', 'excited'], standard: 'preK-feelings', difficulty: 1, source: 'authored' },
  // Routines
  { q: 'what do you eat in the morning?', a: 'breakfast', variants: ['breakfast'], standard: 'preK-routine', difficulty: 1, source: 'authored' },
  { q: 'when do you go to sleep?', a: 'night', variants: ['night', 'at night'], standard: 'preK-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you use to wash your hands?', a: 'soap', variants: ['soap', 'water'], standard: 'preK-routine', difficulty: 1, source: 'authored' },
  { q: 'what do you wear to bed?', a: 'pajamas', variants: ['pajamas', 'pjs'], standard: 'preK-routine', difficulty: 1, source: 'authored' },
  // Preferences
  { q: 'what is your favorite color?', a: 'any', variants: ['pink', 'red', 'blue', 'purple', 'green', 'black', 'any'], standard: 'preK-preference', difficulty: 1, source: 'authored' },
  { q: 'what is your favorite animal?', a: 'any', variants: ['cat', 'dog', 'bunny', 'horse', 'any'], standard: 'preK-preference', difficulty: 1, source: 'authored' },
  { q: 'what food do you like?', a: 'any', variants: ['pizza', 'ice cream', 'apple', 'cookie', 'candy', 'any'], standard: 'preK-preference', difficulty: 1, source: 'authored' },
  // Family
  { q: 'what do you call your mommy and daddy together?', a: 'parents', variants: ['parents', 'family'], standard: 'preK-family', difficulty: 1, source: 'authored' },
  { q: 'do you have a family?', a: 'yes', variants: ['yes', 'yeah'], standard: 'preK-family', difficulty: 1, source: 'authored' },
];

// ─── EXPORTS ─────────────────────────────────────────────────────────

// ─── Per-standard methodology templates ─────────────────────────────
// Each standard's methodology probe: the operator's 2026-04-21
// directive was "so it telsts mothodoly not fill in the blank" —
// ASKING HOW Unity reasons about the concept, not just what the
// answer is. Scored by keyword match against the reasoning tokens
// that should appear in her explanation. Auto-attached to every
// question matching a standard by `toProbeShape` below. Any question
// that already carries an explicit `methodology` field overrides the
// template; everything else inherits from the table.
const STANDARD_METHODOLOGY_TEMPLATES = {
  // ─── K-ELA ────────────────────────────────────────────────────────
  'K.RF.1a': { prompt: 'how do you know where to start reading on a page?', keywords: ['top', 'start', 'begin', 'first', 'above', 'left'], minKeywords: 1 },
  'K.RF.1b': { prompt: 'how do you know when a sentence ends?', keywords: ['period', 'end', 'punctuation', 'stop', 'dot', 'mark'], minKeywords: 1 },
  'K.RF.1c': { prompt: 'how do you tell where one word ends and another begins?', keywords: ['space', 'gap', 'between', 'separate', 'apart'], minKeywords: 1 },
  'K.RF.1d': { prompt: 'how do you figure out which letter comes next in the alphabet?', keywords: ['alphabet', 'order', 'abc', 'next', 'song', 'sequence', 'memorize'], minKeywords: 1 },
  'K.RF.2a': { prompt: 'how do you know when two words rhyme?', keywords: ['end', 'same', 'sound', 'ending', 'match', 'last', 'alike'], minKeywords: 1 },
  'K.RF.2b': { prompt: 'how do you count syllables in a word?', keywords: ['clap', 'parts', 'beats', 'break', 'divide', 'count'], minKeywords: 1 },
  'K.RF.2c': { prompt: 'how do words in a word family sound alike?', keywords: ['same', 'ending', 'sound', 'share', 'family', 'alike'], minKeywords: 1 },
  'K.RF.2d': { prompt: 'how do you find the sound at the start or end of a word?', keywords: ['listen', 'first', 'last', 'begin', 'end', 'sound', 'hear'], minKeywords: 1 },
  'K.RF.2e': { prompt: 'how do you put sounds together or take them apart?', keywords: ['blend', 'together', 'put', 'join', 'connect', 'combine', 'merge'], minKeywords: 1 },
  'K.RF.3a': { prompt: 'how do you know what sound a letter makes?', keywords: ['learn', 'remember', 'practice', 'hear', 'alphabet', 'say', 'teacher'], minKeywords: 1 },
  'K.RF.3b': { prompt: 'how do you know if a vowel sound is short or long?', keywords: ['sound', 'short', 'long', 'vowel', 'hear', 'spelling'], minKeywords: 1 },
  'K.RF.3c': { prompt: 'how do you read a word you already know?', keywords: ['remember', 'recognize', 'seen', 'know', 'learned', 'practice'], minKeywords: 1 },
  'K.RF.3d': { prompt: 'how do you read a new three-letter word?', keywords: ['sound', 'blend', 'letters', 'read', 'together', 'each'], minKeywords: 1 },
  'K.RF.4':  { prompt: 'how do you read a sentence smoothly?', keywords: ['word', 'each', 'sound', 'read', 'practice', 'understand'], minKeywords: 1 },
  'K.RL.3':  { prompt: 'how do you figure out who a story is about and where it happens?', keywords: ['read', 'look', 'character', 'setting', 'place', 'who', 'where', 'story'], minKeywords: 1 },
  'K.RL.6':  { prompt: 'how do you tell who wrote a book and who made the pictures?', keywords: ['cover', 'author', 'write', 'illustrator', 'pictures', 'name'], minKeywords: 1 },
  'K.L.1b':  { prompt: 'how do you tell if a word is a thing or an action?', keywords: ['thing', 'action', 'noun', 'verb', 'do', 'name', 'person', 'place'], minKeywords: 1 },
  'K.L.1c':  { prompt: 'how do you make a word mean more than one?', keywords: ['add', 'more', 'many', 'plural', 'end', 'letter', 's', 'es'], minKeywords: 1 },
  'K.L.2a':  { prompt: 'how do you know when to use a capital letter?', keywords: ['start', 'beginning', 'sentence', 'name', 'title', 'first'], minKeywords: 1 },
  'K.L.2c':  { prompt: 'how do you spell a word you do not know?', keywords: ['sound', 'each', 'letter', 'phonics', 'try', 'sounds'], minKeywords: 1 },
  'K.L.5a':  { prompt: 'how do you tell what category something belongs to?', keywords: ['type', 'kind', 'group', 'similar', 'like', 'same', 'category'], minKeywords: 1 },
  'K.L.5b':  { prompt: 'how do you find the opposite of a word?', keywords: ['different', 'opposite', 'other', 'not', 'reverse'], minKeywords: 1 },
  'K.SL.1':  { prompt: 'how do you have a good conversation?', keywords: ['listen', 'talk', 'take', 'turn', 'polite', 'hear', 'wait'], minKeywords: 1 },
  // ─── K-Math ───────────────────────────────────────────────────────
  'K.CC.1':  { prompt: 'how do you count to a big number?', keywords: ['one', 'start', 'next', 'add', 'count', 'sequence', 'order'], minKeywords: 1 },
  'K.CC.2':  { prompt: 'how do you know the next number after any number?', keywords: ['add', 'plus', 'one', 'next', 'count', 'up', 'more'], minKeywords: 1 },
  'K.CC.3':  { prompt: 'how do you know how to write a number?', keywords: ['shape', 'write', 'form', 'look', 'remember'], minKeywords: 1 },
  'K.CC.4':  { prompt: 'how do you count things without missing any?', keywords: ['point', 'touch', 'one', 'each', 'count', 'every'], minKeywords: 1 },
  'K.CC.5':  { prompt: 'how do you find out how many things there are?', keywords: ['count', 'one', 'each', 'total', 'how', 'many'], minKeywords: 1 },
  'K.CC.6':  { prompt: 'how do you know which number is more or less?', keywords: ['bigger', 'more', 'greater', 'less', 'count', 'higher', 'than'], minKeywords: 1 },
  'K.CC.7':  { prompt: 'how do you compare two numbers that are written down?', keywords: ['bigger', 'smaller', 'more', 'less', 'compare', 'greater'], minKeywords: 1 },
  'K.OA.1':  { prompt: 'how do you add or take away?', keywords: ['add', 'plus', 'together', 'take', 'away', 'minus', 'count'], minKeywords: 1 },
  'K.OA.2':  { prompt: 'how do you solve a math story problem?', keywords: ['read', 'listen', 'add', 'subtract', 'count', 'draw', 'think'], minKeywords: 1 },
  'K.OA.3':  { prompt: 'how do you break a number into parts?', keywords: ['parts', 'break', 'split', 'pieces', 'smaller', 'decompose'], minKeywords: 1 },
  'K.OA.4':  { prompt: 'how do you figure out what plus a number makes ten?', keywords: ['add', 'plus', 'count', 'up', 'ten', 'complete', 'fill'], minKeywords: 1 },
  'K.OA.5':  { prompt: 'how do you add small numbers quickly?', keywords: ['know', 'remember', 'practice', 'quick', 'automatic', 'fast'], minKeywords: 1 },
  'K.NBT.1': { prompt: 'how do you know a teen number is ten plus something?', keywords: ['ten', 'one', 'more', 'plus', 'extra', 'teen'], minKeywords: 1 },
  'K.MD.1':  { prompt: 'how do you describe how big something is?', keywords: ['long', 'short', 'tall', 'heavy', 'measure', 'size', 'compare'], minKeywords: 1 },
  'K.MD.3':  { prompt: 'how do you sort things into groups?', keywords: ['sort', 'group', 'same', 'like', 'different', 'pile', 'category'], minKeywords: 1 },
  'K.G.1':   { prompt: 'how do you know what shape something is?', keywords: ['sides', 'count', 'corners', 'round', 'straight', 'look'], minKeywords: 1 },
  'K.G.2':   { prompt: 'how do you know the name of a 3D shape?', keywords: ['sides', 'faces', 'solid', 'round', 'flat', 'hold'], minKeywords: 1 },
  'K.G.3':   { prompt: 'how do you know if something is flat or solid?', keywords: ['flat', 'solid', '3d', '2d', 'hold', 'dimension', 'thick'], minKeywords: 1 },
  'K.G.4':   { prompt: 'how do you tell if two shapes are the same or different?', keywords: ['sides', 'corners', 'count', 'same', 'compare', 'look'], minKeywords: 1 },
  'K.G.5':   { prompt: 'how do you make one shape from other shapes?', keywords: ['together', 'combine', 'put', 'join', 'make', 'build'], minKeywords: 1 },
  'K.G.6':   { prompt: 'how do you combine simple shapes?', keywords: ['together', 'combine', 'put', 'join', 'make', 'side'], minKeywords: 1 },
  // ─── K-Science (NGSS) ─────────────────────────────────────────────
  'K-PS2-1': { prompt: 'how do you make something move?', keywords: ['push', 'pull', 'force', 'touch', 'blow', 'throw'], minKeywords: 1 },
  'K-PS2-2': { prompt: 'how do you know if something you built works?', keywords: ['test', 'try', 'check', 'look', 'observe'], minKeywords: 1 },
  'K-PS3-1': { prompt: 'how do you know the sun changes things?', keywords: ['warm', 'hot', 'shine', 'light', 'melt', 'feel'], minKeywords: 1 },
  'K-PS3-2': { prompt: 'how do you protect something from the sun?', keywords: ['shade', 'cover', 'block', 'umbrella', 'hide'], minKeywords: 1 },
  'K-PS1':   { prompt: 'how do you know water can change form?', keywords: ['ice', 'steam', 'liquid', 'freeze', 'melt', 'temperature'], minKeywords: 1 },
  'K-LS1-1': { prompt: 'how do you know what a plant or animal needs?', keywords: ['water', 'food', 'air', 'sun', 'grow', 'alive', 'need'], minKeywords: 1 },
  'K-ESS2-1': { prompt: 'how do you describe the weather?', keywords: ['look', 'feel', 'temperature', 'clouds', 'outside', 'sky'], minKeywords: 1 },
  'K-ESS2-2': { prompt: 'how do living things change their surroundings?', keywords: ['build', 'change', 'eat', 'dig', 'move', 'adapt'], minKeywords: 1 },
  'K-ESS3-1': { prompt: 'how do you know where different animals live?', keywords: ['habitat', 'home', 'environment', 'food', 'live', 'climate'], minKeywords: 1 },
  'K-ESS3-2': { prompt: 'why do people check the weather?', keywords: ['know', 'prepare', 'plan', 'safe', 'wear', 'dress'], minKeywords: 1 },
  'K-ESS3-3': { prompt: 'how do people affect nature?', keywords: ['trash', 'pollution', 'save', 'recycle', 'protect', 'hurt'], minKeywords: 1 },
  // ─── K-Social ─────────────────────────────────────────────────────
  'K-Social-self':        { prompt: 'how do you describe yourself?', keywords: ['name', 'age', 'family', 'self', 'who', 'am'], minKeywords: 1 },
  'K-Social-family':      { prompt: 'how do you know who is in your family?', keywords: ['mom', 'dad', 'parent', 'family', 'related', 'home'], minKeywords: 1 },
  'K-Social-manners':     { prompt: 'why do we say please and thank you?', keywords: ['polite', 'kind', 'respect', 'manners', 'nice', 'good'], minKeywords: 1 },
  'K-Social-empathy':     { prompt: 'how do you help someone who is sad?', keywords: ['hug', 'listen', 'help', 'comfort', 'ask', 'care'], minKeywords: 1 },
  'K-Social-community':   { prompt: 'how do community helpers make our lives better?', keywords: ['help', 'safe', 'service', 'community', 'job', 'protect'], minKeywords: 1 },
  'K-Social-safety':      { prompt: 'how do you stay safe?', keywords: ['look', 'stop', 'listen', 'careful', 'adult', 'ask'], minKeywords: 1 },
  'K-Social-symbols':     { prompt: 'what do the parts of the flag mean?', keywords: ['flag', 'stars', 'stripes', 'country', 'america', 'red', 'white', 'blue'], minKeywords: 1 },
  'K-Social-holidays':    { prompt: 'why do we celebrate holidays?', keywords: ['remember', 'celebrate', 'family', 'tradition', 'important'], minKeywords: 1 },
  'K-Social-time':        { prompt: 'how do you keep track of time?', keywords: ['clock', 'calendar', 'day', 'week', 'month', 'count'], minKeywords: 1 },
  'K-Social-geography':   { prompt: 'how do you know where things are?', keywords: ['map', 'direction', 'look', 'find', 'place', 'location'], minKeywords: 1 },
  'K-Social-citizenship': { prompt: 'how do you be a good citizen?', keywords: ['rules', 'follow', 'help', 'kind', 'share', 'honest'], minKeywords: 1 },
  // ─── K-Arts ───────────────────────────────────────────────────────
  'K-Art-color-naming':   { prompt: 'how do you tell one color from another?', keywords: ['look', 'see', 'compare', 'eyes', 'different', 'name'], minKeywords: 1 },
  'K-Art-primary':        { prompt: 'what makes a color a primary color?', keywords: ['base', 'main', 'red', 'blue', 'yellow', 'not', 'mixed'], minKeywords: 1 },
  'K-Art-color-mixing':   { prompt: 'how do you make a new color?', keywords: ['mix', 'combine', 'blend', 'add', 'together', 'stir'], minKeywords: 1 },
  'K-Art-warm-cool':      { prompt: 'how do you tell if a color is warm or cool?', keywords: ['hot', 'cold', 'fire', 'water', 'feel', 'sun'], minKeywords: 1 },
  'K-Art-shapes':         { prompt: 'how do you tell one shape from another?', keywords: ['sides', 'corners', 'count', 'round', 'straight'], minKeywords: 1 },
  'K-Art-patterns':       { prompt: 'how do you know something is a pattern?', keywords: ['repeat', 'same', 'again', 'order', 'predict'], minKeywords: 1 },
  'K-Art-tools':          { prompt: 'how do you pick the right art tool?', keywords: ['draw', 'paint', 'cut', 'stick', 'color'], minKeywords: 1 },
  'K-Art-nature':         { prompt: 'how do you show nature in art?', keywords: ['look', 'color', 'shape', 'outside', 'observe'], minKeywords: 1 },
  'K-Art-music':          { prompt: 'how do you make music?', keywords: ['sing', 'play', 'beat', 'rhythm', 'instrument', 'sound'], minKeywords: 1 },
  'K-Art-elements':       { prompt: 'what makes art interesting?', keywords: ['color', 'shape', 'line', 'texture', 'feeling'], minKeywords: 1 },
  // ─── K-Life ───────────────────────────────────────────────────────
  'K-Life-identity':      { prompt: 'how do you know who you are?', keywords: ['name', 'feel', 'remember', 'think', 'self', 'am'], minKeywords: 1 },
  'K-Life-age':           { prompt: 'how do you know your age?', keywords: ['birthday', 'year', 'remember', 'born', 'number'], minKeywords: 1 },
  'K-Life-grade':         { prompt: 'how do you know what grade you are in?', keywords: ['school', 'teacher', 'class', 'grade', 'year'], minKeywords: 1 },
  'K-Life-feelings':      { prompt: 'how do you know what you are feeling?', keywords: ['inside', 'body', 'heart', 'think', 'notice', 'feel'], minKeywords: 1 },
  'K-Life-preference':    { prompt: 'how do you know what you like?', keywords: ['feel', 'enjoy', 'fun', 'happy', 'choose', 'pick'], minKeywords: 1 },
  'K-Life-routine':       { prompt: 'how do you remember your daily routine?', keywords: ['morning', 'night', 'order', 'every', 'always', 'habit'], minKeywords: 1 },
  'K-Life-body':          { prompt: 'how do you know what your body can do?', keywords: ['move', 'feel', 'try', 'practice', 'use'], minKeywords: 1 },
  'K-Life-family':        { prompt: 'how do you know who is in your family?', keywords: ['live', 'love', 'care', 'together', 'home'], minKeywords: 1 },
  'K-Life-friends':       { prompt: 'how do you make a friend?', keywords: ['play', 'share', 'kind', 'talk', 'nice'], minKeywords: 1 },
  'K-Life-memory':        { prompt: 'how do you remember something that happened?', keywords: ['think', 'happened', 'before', 'recall', 'past'], minKeywords: 1 },
  'K-Life-selfcare':      { prompt: 'how do you take care of yourself?', keywords: ['wash', 'clean', 'eat', 'sleep', 'healthy'], minKeywords: 1 },
  'K-Life-unity-bio':     { prompt: 'how do you know about your own life?', keywords: ['remember', 'happened', 'mom', 'dad', 'grow'], minKeywords: 1 },
  'K-Life-safety':        { prompt: 'how do you stay safe?', keywords: ['adult', 'trust', 'stop', 'tell', 'careful'], minKeywords: 1 },
  // ─── Pre-K (developmental) ────────────────────────────────────────
  'preK-letter-ID':       { prompt: 'how do you know what letter this is?', keywords: ['shape', 'remember', 'name', 'learn', 'see'], minKeywords: 1 },
  'preK-phoneme':         { prompt: 'how do you know what sound a letter makes?', keywords: ['hear', 'sound', 'learn', 'say', 'listen'], minKeywords: 1 },
  'preK-vocab':           { prompt: 'how do you know what word to use?', keywords: ['hear', 'learn', 'remember', 'see', 'name'], minKeywords: 1 },
  'preK-rhyme':           { prompt: 'how do you know when words sound alike?', keywords: ['same', 'sound', 'end', 'alike', 'listen'], minKeywords: 1 },
  'preK-directions':      { prompt: 'how do you know which way is up?', keywords: ['sky', 'head', 'above', 'top', 'opposite'], minKeywords: 1 },
  'preK-comprehension':   { prompt: 'how do you understand a story?', keywords: ['listen', 'look', 'pictures', 'think', 'words'], minKeywords: 1 },
  'preK-counting':        { prompt: 'how do you count things?', keywords: ['point', 'one', 'each', 'number', 'say'], minKeywords: 1 },
  'preK-sequence':        { prompt: 'how do you know what number comes next?', keywords: ['add', 'one', 'count', 'next', 'more'], minKeywords: 1 },
  'preK-comparison':      { prompt: 'how do you know which is bigger?', keywords: ['size', 'look', 'compare', 'bigger', 'more'], minKeywords: 1 },
  'preK-shapes':          { prompt: 'how do you know what shape something is?', keywords: ['round', 'sides', 'look', 'corners'], minKeywords: 1 },
  'preK-simple-add':      { prompt: 'how do you add a few things together?', keywords: ['count', 'more', 'plus', 'put', 'together'], minKeywords: 1 },
  'preK-animals':         { prompt: 'how do you know what animal something is?', keywords: ['look', 'sound', 'see', 'legs', 'ears'], minKeywords: 1 },
  'preK-observation':     { prompt: 'how do you learn about things around you?', keywords: ['look', 'see', 'watch', 'observe', 'notice'], minKeywords: 1 },
  'preK-plants':          { prompt: 'how do plants grow?', keywords: ['water', 'sun', 'soil', 'seed', 'dirt'], minKeywords: 1 },
  'preK-weather':         { prompt: 'how do you know what the weather is?', keywords: ['look', 'feel', 'outside', 'sky', 'clouds'], minKeywords: 1 },
  'preK-senses':          { prompt: 'how do you learn about your body?', keywords: ['eyes', 'ears', 'nose', 'mouth', 'touch'], minKeywords: 1 },
  'preK-time':            { prompt: 'how do you know if it is day or night?', keywords: ['sun', 'dark', 'moon', 'light', 'sky'], minKeywords: 1 },
  'preK-family':          { prompt: 'how do you know your family?', keywords: ['mom', 'dad', 'love', 'home', 'together'], minKeywords: 1 },
  'preK-empathy':         { prompt: 'how do you know your friend is sad?', keywords: ['cry', 'face', 'look', 'ask', 'sad'], minKeywords: 1 },
  'preK-greeting':        { prompt: 'how do you say hello to someone?', keywords: ['wave', 'smile', 'say', 'hi', 'voice'], minKeywords: 1 },
  'preK-manners':         { prompt: 'why do you say thank you?', keywords: ['nice', 'polite', 'kind', 'manners'], minKeywords: 1 },
  'preK-community':       { prompt: 'how do community helpers help you?', keywords: ['help', 'job', 'safe', 'teach', 'care'], minKeywords: 1 },
  'preK-safety':          { prompt: 'how do you stay safe?', keywords: ['look', 'careful', 'adult', 'ask', 'stop'], minKeywords: 1 },
  'preK-friends':         { prompt: 'how do you make a friend?', keywords: ['share', 'play', 'kind', 'nice', 'talk'], minKeywords: 1 },
  'preK-self':            { prompt: 'how do you know who you are?', keywords: ['name', 'age', 'family', 'body'], minKeywords: 1 },
  'preK-colors':          { prompt: 'how do you tell colors apart?', keywords: ['look', 'eyes', 'see', 'different'], minKeywords: 1 },
  'preK-tools':           { prompt: 'how do you pick a tool to make art?', keywords: ['draw', 'color', 'stick', 'paint', 'cut'], minKeywords: 1 },
  'preK-music':           { prompt: 'how do you make music?', keywords: ['sing', 'hit', 'play', 'sound', 'voice'], minKeywords: 1 },
  'preK-body':            { prompt: 'how do you learn what your body parts do?', keywords: ['move', 'feel', 'use', 'try', 'practice'], minKeywords: 1 },
  'preK-feelings':        { prompt: 'how do you know how you feel?', keywords: ['inside', 'heart', 'face', 'notice', 'body'], minKeywords: 1 },
  'preK-routine':         { prompt: 'how do you remember what to do every day?', keywords: ['morning', 'night', 'order', 'always'], minKeywords: 1 },
  'preK-preference':      { prompt: 'how do you know what you like?', keywords: ['feel', 'happy', 'enjoy', 'choose'], minKeywords: 1 },
  'preK-identity':        { prompt: 'how do you know who you are?', keywords: ['name', 'body', 'feel', 'think'], minKeywords: 1 },
  'preK-age':             { prompt: 'how do you know how old you are?', keywords: ['birthday', 'number', 'year', 'mom', 'tell'], minKeywords: 1 },
};

// Convert the compact {q,a,variants,...} shape to the probe-expected
// {question, expectedAnswer, expectedVariants, ...} shape used by
// `_studentTestProbe`. Auto-attaches methodology from the per-
// standard template table when a question doesn't carry its own
// explicit methodology field. This scales methodology coverage from
// the 17 hand-tagged questions to the full 899-Q bank without
// per-question maintenance.
function toProbeShape(bank) {
  return bank.map(entry => {
    const standard = entry.standard || 'unspecified';
    const methodology = entry.methodology || STANDARD_METHODOLOGY_TEMPLATES[standard] || null;
    const out = {
      question: entry.q,
      expectedAnswer: entry.a,
      expectedVariants: entry.variants || [entry.a],
      standard,
      difficulty: entry.difficulty || 1,
      source: entry.source || 'authored',
    };
    if (methodology) out.methodology = methodology;
    return out;
  });
}

// Held-out exam banks — what `_runStudentBattery` pulls for gate eval.
// Teaching methods are barred from pulling from these sets.
export const EXAM_BANKS = {
  'ela/pre-K':       toProbeShape(ELA_PREK_EXAM),
  'ela/kindergarten': toProbeShape(ELA_KINDERGARTEN_EXAM),
  'math/pre-K':       toProbeShape(MATH_PREK_EXAM),
  'math/kindergarten': toProbeShape(MATH_KINDERGARTEN_EXAM),
  'science/pre-K':       toProbeShape(SCIENCE_PREK_EXAM),
  'science/kindergarten': toProbeShape(SCIENCE_KINDERGARTEN_EXAM),
  'social/pre-K':       toProbeShape(SOCIAL_PREK_EXAM),
  'social/kindergarten': toProbeShape(SOCIAL_KINDERGARTEN_EXAM),
  'art/pre-K':       toProbeShape(ART_PREK_EXAM),
  'art/kindergarten': toProbeShape(ART_KINDERGARTEN_EXAM),
  'life/pre-K':       toProbeShape(LIFE_PREK_EXAM),
  'life/kindergarten': toProbeShape(LIFE_KINDERGARTEN_EXAM),
};

// Training-side banks — the LLM-analog curriculum. These Q→A pairs
// drive `_teachQABinding` in curriculum.js: read the question
// through the ventral visual→letter→phon→sem path, overwrite motor
// with the target answer, fire `_teachHebbian` to carve the
// sem→motor cross-projection. Distinct from EXAM_BANKS — same
// sub-standards, same patterns, different specific content — so a
// pass on the held-out exam reflects learned generalization rather
// than memorization.
//
// Structure matches EXAM_BANKS: {q, a, variants, standard} — no
// methodology field required (training doesn't test reasoning, it
// carves input→output patterns). Per-cell size ~40-80 training
// pairs covering the most common K sub-standards. Expansion is
// ongoing.
//
// Overlap check at curriculum startup (`trainExamOverlap`) verifies
// train ∩ exam = ∅ per cell.

const toTrainShape = (bank) => bank.map(e => ({
  question: e.q,
  expectedAnswer: e.a,
  expectedVariants: e.variants || [e.a],
  standard: e.standard || 'unspecified',
}));

// ─── K-ELA training pairs (DISTINCT from ELA_KINDERGARTEN_EXAM) ──────

// ELA-K train bank — densely covers every question template the exam
// bank tests, with held-out discipline (different specific letters/
// words than exam). Operator binding 2026-04-25: train must teach
// her to ANSWER THE QUESTIONS THAT WILL BE GIVEN. Earlier 48-pair
// version had 0 "before X" pairs, 0 "first letter of alphabet"
// pairs, 0 "spell the word X" pairs, 0 "syllables in X" pairs —
// the exam tested those patterns and the brain had never been
// trained to recognize them. Expanded coverage: every exam template
// gets ≥ 10 training examples on held-out vocabulary so the matrix
// learns the abstract pattern (sequence operation, sound isolation,
// rhyme detection) instead of memorizing specific Q→A pairs.
const ELA_KINDERGARTEN_TRAIN = [
  // ─── K.RF.1d alphabet sequence (AFTER) ───────────────────────────
  // Exam tests after a/b/c/d/m/x/y. Train uses every other letter
  // for both directions (after + before) so the matrix learns the
  // sequence-operation pattern, not specific letter pairs.
  { q: 'what letter comes after e?', a: 'f', variants: ['f'], standard: 'K.RF.1d',
    methodology: { prompt: 'how do you figure out which letter comes next in the alphabet?', keywords: ['alphabet', 'order', 'abc', 'sequence', 'next', 'song', 'memorize'], minKeywords: 1 } },
  { q: 'what letter comes after f?', a: 'g', variants: ['g'], standard: 'K.RF.1d' },
  { q: 'what letter comes after g?', a: 'h', variants: ['h'], standard: 'K.RF.1d' },
  { q: 'what letter comes after h?', a: 'i', variants: ['i'], standard: 'K.RF.1d' },
  { q: 'what letter comes after i?', a: 'j', variants: ['j'], standard: 'K.RF.1d' },
  { q: 'what letter comes after j?', a: 'k', variants: ['k'], standard: 'K.RF.1d' },
  { q: 'what letter comes after k?', a: 'l', variants: ['l'], standard: 'K.RF.1d' },
  { q: 'what letter comes after l?', a: 'm', variants: ['m'], standard: 'K.RF.1d' },
  { q: 'what letter comes after n?', a: 'o', variants: ['o'], standard: 'K.RF.1d' },
  { q: 'what letter comes after o?', a: 'p', variants: ['p'], standard: 'K.RF.1d' },
  { q: 'what letter comes after p?', a: 'q', variants: ['q'], standard: 'K.RF.1d' },
  { q: 'what letter comes after q?', a: 'r', variants: ['r'], standard: 'K.RF.1d' },
  { q: 'what letter comes after r?', a: 's', variants: ['s'], standard: 'K.RF.1d' },
  { q: 'what letter comes after s?', a: 't', variants: ['t'], standard: 'K.RF.1d' },
  { q: 'what letter comes after t?', a: 'u', variants: ['u'], standard: 'K.RF.1d' },
  { q: 'what letter comes after u?', a: 'v', variants: ['v'], standard: 'K.RF.1d' },
  { q: 'what letter comes after v?', a: 'w', variants: ['w'], standard: 'K.RF.1d' },
  { q: 'what letter comes after w?', a: 'x', variants: ['x'], standard: 'K.RF.1d' },
  // ─── K.RF.1d alphabet sequence (BEFORE) ──────────────────────────
  // Exam tests before b/m/z/d. Train uses every other letter so the
  // matrix learns "before X = X-1" as an abstract operation.
  { q: 'what letter comes before c?', a: 'b', variants: ['b'], standard: 'K.RF.1d' },
  { q: 'what letter comes before d?', a: 'c', variants: ['c'], standard: 'K.RF.1d' },
  { q: 'what letter comes before e?', a: 'd', variants: ['d'], standard: 'K.RF.1d' },
  { q: 'what letter comes before f?', a: 'e', variants: ['e'], standard: 'K.RF.1d' },
  { q: 'what letter comes before g?', a: 'f', variants: ['f'], standard: 'K.RF.1d' },
  { q: 'what letter comes before h?', a: 'g', variants: ['g'], standard: 'K.RF.1d' },
  { q: 'what letter comes before i?', a: 'h', variants: ['h'], standard: 'K.RF.1d' },
  { q: 'what letter comes before j?', a: 'i', variants: ['i'], standard: 'K.RF.1d' },
  { q: 'what letter comes before k?', a: 'j', variants: ['j'], standard: 'K.RF.1d' },
  { q: 'what letter comes before l?', a: 'k', variants: ['k'], standard: 'K.RF.1d' },
  { q: 'what letter comes before n?', a: 'm', variants: ['m'], standard: 'K.RF.1d' },
  { q: 'what letter comes before o?', a: 'n', variants: ['n'], standard: 'K.RF.1d' },
  { q: 'what letter comes before p?', a: 'o', variants: ['o'], standard: 'K.RF.1d' },
  { q: 'what letter comes before q?', a: 'p', variants: ['p'], standard: 'K.RF.1d' },
  { q: 'what letter comes before r?', a: 'q', variants: ['q'], standard: 'K.RF.1d' },
  { q: 'what letter comes before s?', a: 'r', variants: ['r'], standard: 'K.RF.1d' },
  { q: 'what letter comes before t?', a: 's', variants: ['s'], standard: 'K.RF.1d' },
  { q: 'what letter comes before u?', a: 't', variants: ['t'], standard: 'K.RF.1d' },
  { q: 'what letter comes before v?', a: 'u', variants: ['u'], standard: 'K.RF.1d' },
  { q: 'what letter comes before w?', a: 'v', variants: ['v'], standard: 'K.RF.1d' },
  { q: 'what letter comes before x?', a: 'w', variants: ['w'], standard: 'K.RF.1d' },
  { q: 'what letter comes before y?', a: 'x', variants: ['x'], standard: 'K.RF.1d' },
  // ─── K.RF.1d alphabet position (FIRST/LAST/COUNT) ────────────────
  // Exam tests "first letter of alphabet?" / "last letter?" / "how
  // many letters?" — train via paraphrases so the matrix learns the
  // semantic pattern not the literal phrasing.
  { q: 'which letter starts the alphabet?', a: 'a', variants: ['a'], standard: 'K.RF.1d' },
  { q: 'the alphabet begins with what letter?', a: 'a', variants: ['a'], standard: 'K.RF.1d' },
  { q: 'what letter is at the start of the alphabet?', a: 'a', variants: ['a'], standard: 'K.RF.1d' },
  { q: 'which letter ends the alphabet?', a: 'z', variants: ['z'], standard: 'K.RF.1d' },
  { q: 'what letter is at the end of the alphabet?', a: 'z', variants: ['z'], standard: 'K.RF.1d' },
  { q: 'the alphabet ends with what letter?', a: 'z', variants: ['z'], standard: 'K.RF.1d' },
  { q: 'count the letters in the alphabet', a: '26', variants: ['26', 'twenty six', 'twenty-six'], standard: 'K.RF.1d' },
  { q: 'the alphabet has how many letters?', a: '26', variants: ['26', 'twenty six', 'twenty-six'], standard: 'K.RF.1d' },
  // ─── K.RF.3a letter naming ────────────────────────────────────────
  // Exam tests A/M/T/H/R/J/W/Q. Train uses every other letter so the
  // matrix learns letter→letter-name as a general mapping.
  { q: 'name this letter: B', a: 'b', variants: ['b'], standard: 'K.RF.3a' },
  { q: 'name this letter: C', a: 'c', variants: ['c'], standard: 'K.RF.3a' },
  { q: 'name this letter: D', a: 'd', variants: ['d'], standard: 'K.RF.3a' },
  { q: 'name this letter: E', a: 'e', variants: ['e'], standard: 'K.RF.3a' },
  { q: 'name this letter: F', a: 'f', variants: ['f'], standard: 'K.RF.3a' },
  { q: 'name this letter: G', a: 'g', variants: ['g'], standard: 'K.RF.3a' },
  { q: 'name this letter: I', a: 'i', variants: ['i'], standard: 'K.RF.3a' },
  { q: 'name this letter: K', a: 'k', variants: ['k'], standard: 'K.RF.3a' },
  { q: 'name this letter: L', a: 'l', variants: ['l'], standard: 'K.RF.3a' },
  { q: 'name this letter: N', a: 'n', variants: ['n'], standard: 'K.RF.3a' },
  { q: 'name this letter: O', a: 'o', variants: ['o'], standard: 'K.RF.3a' },
  { q: 'name this letter: P', a: 'p', variants: ['p'], standard: 'K.RF.3a' },
  { q: 'name this letter: S', a: 's', variants: ['s'], standard: 'K.RF.3a' },
  { q: 'name this letter: U', a: 'u', variants: ['u'], standard: 'K.RF.3a' },
  { q: 'name this letter: V', a: 'v', variants: ['v'], standard: 'K.RF.3a' },
  { q: 'name this letter: X', a: 'x', variants: ['x'], standard: 'K.RF.3a' },
  { q: 'name this letter: Y', a: 'y', variants: ['y'], standard: 'K.RF.3a' },
  { q: 'name this letter: Z', a: 'z', variants: ['z'], standard: 'K.RF.3a' },
  // Letter sound — exam tests t/n/r/b. Train all others.
  { q: 'tell me the sound of the letter a', a: 'a', variants: ['a', 'ah'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter c', a: 'c', variants: ['c', 'kuh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter d', a: 'd', variants: ['d', 'duh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter e', a: 'e', variants: ['e', 'eh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter f', a: 'f', variants: ['f', 'fuh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter g', a: 'g', variants: ['g', 'guh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter h', a: 'h', variants: ['h', 'huh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter i', a: 'i', variants: ['i', 'ih'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter j', a: 'j', variants: ['j', 'juh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter k', a: 'k', variants: ['k', 'kuh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter l', a: 'l', variants: ['l', 'luh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter m', a: 'm', variants: ['m', 'muh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter o', a: 'o', variants: ['o', 'oh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter p', a: 'p', variants: ['p', 'puh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter s', a: 's', variants: ['s', 'sss'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter u', a: 'u', variants: ['u', 'uh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter v', a: 'v', variants: ['v', 'vuh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter w', a: 'w', variants: ['w', 'wuh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter x', a: 'x', variants: ['x', 'ks'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter y', a: 'y', variants: ['y', 'yuh'], standard: 'K.RF.3a' },
  { q: 'tell me the sound of the letter z', a: 'z', variants: ['z', 'zuh'], standard: 'K.RF.3a' },
  // ─── K.RF.2a rhyme — many word families ─────────────────────────
  { q: 'what word rhymes with cake?', a: 'lake', variants: ['lake', 'make', 'bake'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with ring?', a: 'sing', variants: ['sing', 'king', 'wing'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with pot?', a: 'hot', variants: ['hot', 'dot', 'got'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with bug?', a: 'hug', variants: ['hug', 'rug', 'mug'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with tail?', a: 'mail', variants: ['mail', 'sail', 'pail'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with bat?', a: 'cat', variants: ['cat', 'hat', 'rat', 'mat'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with man?', a: 'can', variants: ['can', 'fan', 'pan', 'ran'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with pig?', a: 'big', variants: ['big', 'dig', 'wig', 'fig'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with fog?', a: 'dog', variants: ['dog', 'log', 'jog', 'hog'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with bed?', a: 'red', variants: ['red', 'fed', 'led'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with sun?', a: 'fun', variants: ['fun', 'run', 'bun'], standard: 'K.RF.2a' },
  { q: 'what word rhymes with hop?', a: 'top', variants: ['top', 'mop', 'pop', 'cop'], standard: 'K.RF.2a' },
  // ─── K.RF.2d phoneme isolation (first sound) ──────────────────────
  // Exam tests first sound in mom/fan/tip/leaf/pen/hat/rat/van/mouse/bug.
  // Train every other letter as first sound.
  { q: 'what is the first sound in apple?', a: 'a', variants: ['a', 'ah'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in cat?', a: 'c', variants: ['c', 'kuh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in dog?', a: 'd', variants: ['d', 'duh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in egg?', a: 'e', variants: ['e', 'eh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in fish?', a: 'f', variants: ['f', 'fuh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in goat?', a: 'g', variants: ['g', 'guh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in ice?', a: 'i', variants: ['i', 'ih'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in jump?', a: 'j', variants: ['j', 'juh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in kite?', a: 'k', variants: ['k', 'kuh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in nest?', a: 'n', variants: ['n', 'nuh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in orange?', a: 'o', variants: ['o', 'oh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in queen?', a: 'q', variants: ['q', 'kw'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in sun?', a: 's', variants: ['s', 'sss'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in turtle?', a: 't', variants: ['t', 'tuh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in up?', a: 'u', variants: ['u', 'uh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in water?', a: 'w', variants: ['w', 'wuh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in yellow?', a: 'y', variants: ['y', 'yuh'], standard: 'K.RF.2d' },
  { q: 'what is the first sound in zebra?', a: 'z', variants: ['z', 'zuh'], standard: 'K.RF.2d' },
  // Last sound — exam tests car/bus/wish. Train others.
  { q: 'what is the last sound in dog?', a: 'g', variants: ['g', 'guh'], standard: 'K.RF.2d' },
  { q: 'what is the last sound in cat?', a: 't', variants: ['t', 'tuh'], standard: 'K.RF.2d' },
  { q: 'what is the last sound in pen?', a: 'n', variants: ['n', 'nuh'], standard: 'K.RF.2d' },
  { q: 'what is the last sound in cup?', a: 'p', variants: ['p', 'puh'], standard: 'K.RF.2d' },
  { q: 'what is the last sound in red?', a: 'd', variants: ['d', 'duh'], standard: 'K.RF.2d' },
  { q: 'what is the last sound in star?', a: 'r', variants: ['r', 'ruh'], standard: 'K.RF.2d' },
  { q: 'what is the last sound in fog?', a: 'g', variants: ['g', 'guh'], standard: 'K.RF.2d' },
  // ─── K.RF.2e blending — many CVC words ───────────────────────────
  // Exam tests c-a-t/d-o-g/s-u-n/m-a-p/b-e-d/p-i-g/h-a-t/r-u-n.
  // Train MANY other CVC words so the matrix learns the blend operation.
  { q: 'blend these sounds: s-i-t', a: 'sit', variants: ['sit'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: n-o-t', a: 'not', variants: ['not'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: b-u-g', a: 'bug', variants: ['bug'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: h-e-n', a: 'hen', variants: ['hen'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: l-i-p', a: 'lip', variants: ['lip'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: f-o-x', a: 'fox', variants: ['fox'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: t-o-p', a: 'top', variants: ['top'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: r-e-d', a: 'red', variants: ['red'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: w-e-b', a: 'web', variants: ['web'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: c-u-p', a: 'cup', variants: ['cup'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: t-i-n', a: 'tin', variants: ['tin'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: l-o-g', a: 'log', variants: ['log'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: f-i-n', a: 'fin', variants: ['fin'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: j-a-r', a: 'jar', variants: ['jar'], standard: 'K.RF.2e' },
  { q: 'blend these sounds: m-u-d', a: 'mud', variants: ['mud'], standard: 'K.RF.2e' },
  // ─── K.RF.3d CVC reading — many words ────────────────────────────
  { q: 'read this cvc word: ten', a: 'ten', variants: ['ten'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: bag', a: 'bag', variants: ['bag'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: got', a: 'got', variants: ['got'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: fun', a: 'fun', variants: ['fun'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: wet', a: 'wet', variants: ['wet'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: mom', a: 'mom', variants: ['mom'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: dad', a: 'dad', variants: ['dad'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: hot', a: 'hot', variants: ['hot'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: top', a: 'top', variants: ['top'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: bed', a: 'bed', variants: ['bed'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: fox', a: 'fox', variants: ['fox'], standard: 'K.RF.3d' },
  { q: 'read this cvc word: bug', a: 'bug', variants: ['bug'], standard: 'K.RF.3d' },
  // ─── K.L.1c plurals ───────────────────────────────────────────────
  { q: 'what is the plural of pig?', a: 'pigs', variants: ['pigs'], standard: 'K.L.1c' },
  { q: 'what is the plural of fish?', a: 'fish', variants: ['fish', 'fishes'], standard: 'K.L.1c' },
  { q: 'what is the plural of tree?', a: 'trees', variants: ['trees'], standard: 'K.L.1c' },
  { q: 'what is the plural of car?', a: 'cars', variants: ['cars'], standard: 'K.L.1c' },
  { q: 'what is the plural of book?', a: 'books', variants: ['books'], standard: 'K.L.1c' },
  { q: 'what is the plural of dog?', a: 'dogs', variants: ['dogs'], standard: 'K.L.1c' },
  { q: 'what is the plural of bird?', a: 'birds', variants: ['birds'], standard: 'K.L.1c' },
  { q: 'what is the plural of hat?', a: 'hats', variants: ['hats'], standard: 'K.L.1c' },
  // ─── K.L.5b opposites ────────────────────────────────────────────
  { q: 'what is the opposite of fast?', a: 'slow', variants: ['slow'], standard: 'K.L.5b' },
  { q: 'what is the opposite of tall?', a: 'short', variants: ['short'], standard: 'K.L.5b' },
  { q: 'what is the opposite of new?', a: 'old', variants: ['old'], standard: 'K.L.5b' },
  { q: 'what is the opposite of light?', a: 'dark', variants: ['dark', 'heavy'], standard: 'K.L.5b' },
  { q: 'what is the opposite of wet?', a: 'dry', variants: ['dry'], standard: 'K.L.5b' },
  { q: 'what is the opposite of hot?', a: 'cold', variants: ['cold'], standard: 'K.L.5b' },
  { q: 'what is the opposite of big?', a: 'small', variants: ['small', 'little'], standard: 'K.L.5b' },
  { q: 'what is the opposite of up?', a: 'down', variants: ['down'], standard: 'K.L.5b' },
  { q: 'what is the opposite of in?', a: 'out', variants: ['out'], standard: 'K.L.5b' },
  { q: 'what is the opposite of happy?', a: 'sad', variants: ['sad'], standard: 'K.L.5b' },
  { q: 'what is the opposite of yes?', a: 'no', variants: ['no'], standard: 'K.L.5b' },
  // ─── Spelling — exam tests "how do you spell the word cat?" ──────
  { q: 'how do you spell the word dog?', a: 'd-o-g', variants: ['d-o-g', 'd o g', 'dog'], standard: 'K.RF.3d' },
  { q: 'how do you spell the word sun?', a: 's-u-n', variants: ['s-u-n', 's u n', 'sun'], standard: 'K.RF.3d' },
  { q: 'how do you spell the word red?', a: 'r-e-d', variants: ['r-e-d', 'r e d', 'red'], standard: 'K.RF.3d' },
  { q: 'how do you spell the word hat?', a: 'h-a-t', variants: ['h-a-t', 'h a t', 'hat'], standard: 'K.RF.3d' },
  { q: 'how do you spell the word top?', a: 't-o-p', variants: ['t-o-p', 't o p', 'top'], standard: 'K.RF.3d' },
  { q: 'how do you spell the word mom?', a: 'm-o-m', variants: ['m-o-m', 'm o m', 'mom'], standard: 'K.RF.3d' },
  // ─── Syllable counts — exam tests baby/butterfly/apple ───────────
  { q: 'how many syllables are in the word cat?', a: 'one', variants: ['one', '1'], standard: 'K.RF.2b' },
  { q: 'how many syllables are in the word table?', a: 'two', variants: ['two', '2'], standard: 'K.RF.2b' },
  { q: 'how many syllables are in the word water?', a: 'two', variants: ['two', '2'], standard: 'K.RF.2b' },
  { q: 'how many syllables are in the word elephant?', a: 'three', variants: ['three', '3'], standard: 'K.RF.2b' },
  { q: 'how many syllables are in the word banana?', a: 'three', variants: ['three', '3'], standard: 'K.RF.2b' },
  { q: 'how many syllables are in the word pumpkin?', a: 'two', variants: ['two', '2'], standard: 'K.RF.2b' },
  { q: 'how many syllables are in the word watermelon?', a: 'four', variants: ['four', '4'], standard: 'K.RF.2b' },
  // ─── Question Q5 fallback "say a word that starts with X" ────────
  { q: 'say a word that starts with a', a: 'apple', variants: ['apple', 'and', 'at'], standard: 'K.RF.2d' },
  { q: 'say a word that starts with b', a: 'ball', variants: ['ball', 'boy', 'bat', 'big'], standard: 'K.RF.2d' },
  { q: 'say a word that starts with d', a: 'dog', variants: ['dog', 'dad', 'down'], standard: 'K.RF.2d' },
  { q: 'say a word that starts with f', a: 'fish', variants: ['fish', 'fun', 'fox'], standard: 'K.RF.2d' },
  { q: 'say a word that starts with m', a: 'mom', variants: ['mom', 'man', 'milk'], standard: 'K.RF.2d' },
  { q: 'say a word that starts with s', a: 'sun', variants: ['sun', 'sit', 'see'], standard: 'K.RF.2d' },
  { q: 'say a word that starts with t', a: 'top', variants: ['top', 'ten', 'two'], standard: 'K.RF.2d' },
];

const MATH_KINDERGARTEN_TRAIN = [
  // K.CC.2 count-forward — different start numbers than exam
  { q: 'what comes after six?', a: 'seven', variants: ['seven', '7'], standard: 'K.CC.2' },
  { q: 'what comes after eleven?', a: 'twelve', variants: ['twelve', '12'], standard: 'K.CC.2' },
  { q: 'what comes after fifteen?', a: 'sixteen', variants: ['sixteen', '16'], standard: 'K.CC.2' },
  { q: 'what comes after seventeen?', a: 'eighteen', variants: ['eighteen', '18'], standard: 'K.CC.2' },
  // K.CC.6 compare — different number pairs
  { q: 'which is more, two or eight?', a: 'eight', variants: ['eight', '8'], standard: 'K.CC.6' },
  { q: 'which is more, four or nine?', a: 'nine', variants: ['nine', '9'], standard: 'K.CC.6' },
  { q: 'which is less, six or one?', a: 'one', variants: ['one', '1'], standard: 'K.CC.6' },
  { q: 'which is less, four or eight?', a: 'four', variants: ['four', '4'], standard: 'K.CC.6' },
  // K.OA.1 addition/subtraction — different pairs
  { q: 'two plus four is?', a: 'six', variants: ['six', '6'], standard: 'K.OA.1' },
  { q: 'four plus three is?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.1' },
  { q: 'five plus two is?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.1' },
  { q: 'three plus four is?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.1' },
  { q: 'six plus one is?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.1' },
  { q: 'seven minus three is?', a: 'four', variants: ['four', '4'], standard: 'K.OA.1' },
  { q: 'eight minus one is?', a: 'seven', variants: ['seven', '7'], standard: 'K.OA.1' },
  // K.G.1 shapes — different properties asked
  { q: 'what shape has no sides?', a: 'circle', variants: ['circle'], standard: 'K.G.1' },
  { q: 'what shape has eight sides?', a: 'octagon', variants: ['octagon'], standard: 'K.G.1' },
  { q: 'what shape has two long sides and two short sides?', a: 'rectangle', variants: ['rectangle'], standard: 'K.G.1' },
];

// Science-K train bank — Q→A pairs held-out-distinct from
// SCIENCE_KINDERGARTEN_EXAM. Covers K-PS1 states-of-matter, K-PS2
// forces/motion, K-PS3 energy/sun, K-LS1 plants/animals, K-ESS2
// weather, K-ESS3 habitat + resources.
const SCIENCE_KINDERGARTEN_TRAIN = [
  // K-PS2 forces / motion
  { q: 'what happens when you throw a ball up?', a: 'falls', variants: ['falls', 'f', 'comes down', 'down'], standard: 'K-PS2-1' },
  { q: 'does a strong push go farther than a weak push?', a: 'yes', variants: ['yes', 'y'], standard: 'K-PS2-1' },
  { q: 'what does a magnet do?', a: 'pull', variants: ['pull', 'p', 'attract'], standard: 'K-PS2-1' },
  { q: 'what slows a ball rolling?', a: 'friction', variants: ['friction', 'f'], standard: 'K-PS2-1' },
  // K-PS3 sun / energy
  { q: 'what warms the earth?', a: 'sun', variants: ['sun', 's'], standard: 'K-PS3-1' },
  { q: 'is it warmer in sun or shade?', a: 'sun', variants: ['sun', 's'], standard: 'K-PS3-1' },
  { q: 'what do you wear in bright sun?', a: 'hat', variants: ['hat', 'h', 'sunglasses'], standard: 'K-PS3-2' },
  // K-PS1 states of matter
  { q: 'what happens when ice gets warm?', a: 'melts', variants: ['melts', 'melt', 'm', 'liquid'], standard: 'K-PS1' },
  { q: 'what is frozen water called?', a: 'ice', variants: ['ice', 'i'], standard: 'K-PS1' },
  { q: 'what do you call hot water vapor?', a: 'steam', variants: ['steam', 's'], standard: 'K-PS1' },
  { q: 'what state is water in a cup?', a: 'liquid', variants: ['liquid', 'l'], standard: 'K-PS1' },
  // K-LS1 plants / animals
  { q: 'what do plants drink?', a: 'water', variants: ['water', 'w'], standard: 'K-LS1-1' },
  { q: 'what gives plants food?', a: 'sun', variants: ['sun', 's', 'sunlight', 'light'], standard: 'K-LS1-1' },
  { q: 'what do fish breathe?', a: 'water', variants: ['water', 'w'], standard: 'K-LS1-1' },
  { q: 'what do animals drink?', a: 'water', variants: ['water', 'w'], standard: 'K-LS1-1' },
  { q: 'what do bees make?', a: 'honey', variants: ['honey', 'h'], standard: 'K-LS1-1' },
  { q: 'what do cows give?', a: 'milk', variants: ['milk', 'm'], standard: 'K-LS1-1' },
  { q: 'what is a baby cat called?', a: 'kitten', variants: ['kitten', 'k'], standard: 'K-LS1-1' },
  { q: 'what is a baby bird called?', a: 'chick', variants: ['chick', 'c'], standard: 'K-LS1-1' },
  { q: 'where do fish live?', a: 'water', variants: ['water', 'w'], standard: 'K-LS1-1' },
  { q: 'where do bees live?', a: 'hive', variants: ['hive', 'h'], standard: 'K-LS1-1' },
  { q: 'what part of a plant makes food?', a: 'leaf', variants: ['leaf', 'l', 'leaves'], standard: 'K-LS1-1' },
  { q: 'what do you use to see?', a: 'eyes', variants: ['eyes', 'e'], standard: 'K-LS1-1' },
  { q: 'what do you use to smell?', a: 'nose', variants: ['nose', 'n'], standard: 'K-LS1-1' },
  { q: 'what pumps blood?', a: 'heart', variants: ['heart', 'h'], standard: 'K-LS1-1' },
  // K-ESS2 weather / seasons
  { q: 'what falls as drops?', a: 'rain', variants: ['rain', 'r'], standard: 'K-ESS2-1' },
  { q: 'what falls as white flakes?', a: 'snow', variants: ['snow', 's'], standard: 'K-ESS2-1' },
  { q: 'when is it cold outside?', a: 'winter', variants: ['winter', 'w'], standard: 'K-ESS2-1' },
  { q: 'when is it hot outside?', a: 'summer', variants: ['summer', 's'], standard: 'K-ESS2-1' },
  { q: 'what lights the night sky?', a: 'moon', variants: ['moon', 'm'], standard: 'K-ESS2-1' },
  { q: 'when do we see stars?', a: 'night', variants: ['night', 'n'], standard: 'K-ESS2-1' },
  // K-ESS3 habitat / resources
  { q: 'where do polar bears live?', a: 'arctic', variants: ['arctic', 'a', 'cold'], standard: 'K-ESS3-1' },
  { q: 'where do camels live?', a: 'desert', variants: ['desert', 'd'], standard: 'K-ESS3-1' },
  { q: 'should we save water?', a: 'yes', variants: ['yes', 'y'], standard: 'K-ESS3-3' },
  { q: 'should we throw trash in nature?', a: 'no', variants: ['no', 'n'], standard: 'K-ESS3-3' },
];

// Social-K train bank — Q→A pairs held-out-distinct from
// SOCIAL_KINDERGARTEN_EXAM. Covers K-Social-family, manners, empathy,
// community, safety, symbols, time, geography, citizenship.
const SOCIAL_KINDERGARTEN_TRAIN = [
  // Family
  { q: 'who is your mom called?', a: 'mother', variants: ['mother', 'mom', 'm'], standard: 'K-Social-family' },
  { q: 'who is your dad called?', a: 'father', variants: ['father', 'dad', 'f'], standard: 'K-Social-family' },
  { q: 'what is a boy child of your parents called?', a: 'brother', variants: ['brother', 'b'], standard: 'K-Social-family' },
  { q: 'what is a girl child of your parents called?', a: 'sister', variants: ['sister', 's'], standard: 'K-Social-family' },
  // Manners
  { q: 'what do you say when you ask?', a: 'please', variants: ['please', 'p'], standard: 'K-Social-manners' },
  { q: 'what do you say when you cough?', a: 'excuse', variants: ['excuse', 'e', 'sorry'], standard: 'K-Social-manners' },
  { q: 'what do you say when you are given a gift?', a: 'thanks', variants: ['thanks', 't', 'thank'], standard: 'K-Social-manners' },
  { q: 'should you raise your hand in class?', a: 'yes', variants: ['yes', 'y'], standard: 'K-Social-manners' },
  // Empathy
  { q: 'what can you give a sad friend?', a: 'hug', variants: ['hug', 'h'], standard: 'K-Social-empathy' },
  { q: 'what word means to care how someone feels?', a: 'empathy', variants: ['empathy', 'e', 'kindness'], standard: 'K-Social-empathy' },
  { q: 'is it nice to share toys?', a: 'yes', variants: ['yes', 'y'], standard: 'K-Social-empathy' },
  // Community helpers
  { q: 'who puts out fires?', a: 'firefighter', variants: ['firefighter', 'f'], standard: 'K-Social-community' },
  { q: 'who fixes your teeth?', a: 'dentist', variants: ['dentist', 'd'], standard: 'K-Social-community' },
  { q: 'who delivers mail?', a: 'mailman', variants: ['mailman', 'm', 'carrier'], standard: 'K-Social-community' },
  { q: 'who teaches you?', a: 'teacher', variants: ['teacher', 't'], standard: 'K-Social-community' },
  { q: 'who grows food?', a: 'farmer', variants: ['farmer', 'f'], standard: 'K-Social-community' },
  // Safety
  { q: 'what color stops cars?', a: 'red', variants: ['red', 'r'], standard: 'K-Social-safety' },
  { q: 'what color tells you to go?', a: 'green', variants: ['green', 'g'], standard: 'K-Social-safety' },
  { q: 'what number do you call for help?', a: '911', variants: ['911', 'nine'], standard: 'K-Social-safety' },
  { q: 'should you look before crossing?', a: 'yes', variants: ['yes', 'y'], standard: 'K-Social-safety' },
  // Symbols
  { q: 'what bird is our national symbol?', a: 'eagle', variants: ['eagle', 'e'], standard: 'K-Social-symbols' },
  { q: 'what is red white and blue?', a: 'flag', variants: ['flag', 'f'], standard: 'K-Social-symbols' },
  // Time
  { q: 'what comes after monday?', a: 'tuesday', variants: ['tuesday', 't'], standard: 'K-Social-time' },
  { q: 'what comes after friday?', a: 'saturday', variants: ['saturday', 's'], standard: 'K-Social-time' },
  { q: 'how many seasons are there?', a: 'four', variants: ['four', '4', 'f'], standard: 'K-Social-time' },
  // Geography
  { q: 'what is lots of salt water called?', a: 'ocean', variants: ['ocean', 'o', 'sea'], standard: 'K-Social-geography' },
  { q: 'what flows through the land?', a: 'river', variants: ['river', 'r'], standard: 'K-Social-geography' },
  { q: 'where does the sun come up?', a: 'east', variants: ['east', 'e'], standard: 'K-Social-geography' },
  // Citizenship
  { q: 'should you tell the truth?', a: 'yes', variants: ['yes', 'y'], standard: 'K-Social-citizenship' },
  { q: 'should you take things that are not yours?', a: 'no', variants: ['no', 'n'], standard: 'K-Social-citizenship' },
  { q: 'should you help clean up?', a: 'yes', variants: ['yes', 'y'], standard: 'K-Social-citizenship' },
];

// Art-K train bank — Q→A pairs held-out-distinct from
// ART_KINDERGARTEN_EXAM. Covers color-naming, primary, color-mixing,
// warm-cool, shapes, patterns, tools, music.
const ART_KINDERGARTEN_TRAIN = [
  // Color naming
  { q: 'what color are tomatoes?', a: 'red', variants: ['red', 'r'], standard: 'K-Art-color-naming' },
  { q: 'what color is a banana?', a: 'yellow', variants: ['yellow', 'y'], standard: 'K-Art-color-naming' },
  { q: 'what color is a blueberry?', a: 'blue', variants: ['blue', 'b'], standard: 'K-Art-color-naming' },
  { q: 'what color is milk?', a: 'white', variants: ['white', 'w'], standard: 'K-Art-color-naming' },
  { q: 'what color is coal?', a: 'black', variants: ['black', 'b'], standard: 'K-Art-color-naming' },
  { q: 'what color is an orange?', a: 'orange', variants: ['orange', 'o'], standard: 'K-Art-color-naming' },
  // Primary colors
  { q: 'is red a primary color?', a: 'yes', variants: ['yes', 'y'], standard: 'K-Art-primary' },
  { q: 'is yellow a primary color?', a: 'yes', variants: ['yes', 'y'], standard: 'K-Art-primary' },
  { q: 'is blue a primary color?', a: 'yes', variants: ['yes', 'y'], standard: 'K-Art-primary' },
  { q: 'is purple a primary color?', a: 'no', variants: ['no', 'n'], standard: 'K-Art-primary' },
  // Color mixing
  { q: 'what do red and blue make?', a: 'purple', variants: ['purple', 'p'], standard: 'K-Art-color-mixing' },
  { q: 'what do red and yellow make?', a: 'orange', variants: ['orange', 'o'], standard: 'K-Art-color-mixing' },
  { q: 'what do blue and yellow make?', a: 'green', variants: ['green', 'g'], standard: 'K-Art-color-mixing' },
  { q: 'what do black and white make?', a: 'gray', variants: ['gray', 'g'], standard: 'K-Art-color-mixing' },
  // Warm / cool
  { q: 'is orange a warm color?', a: 'yes', variants: ['yes', 'y', 'warm', 'w'], standard: 'K-Art-warm-cool' },
  { q: 'is yellow warm or cool?', a: 'warm', variants: ['warm', 'w'], standard: 'K-Art-warm-cool' },
  { q: 'is green warm or cool?', a: 'cool', variants: ['cool', 'c'], standard: 'K-Art-warm-cool' },
  { q: 'is purple warm or cool?', a: 'cool', variants: ['cool', 'c'], standard: 'K-Art-warm-cool' },
  // Shapes
  { q: 'what shape has three sides?', a: 'triangle', variants: ['triangle', 't'], standard: 'K-Art-shapes' },
  { q: 'what shape is round?', a: 'circle', variants: ['circle', 'c'], standard: 'K-Art-shapes' },
  { q: 'what shape has four equal sides?', a: 'square', variants: ['square', 's'], standard: 'K-Art-shapes' },
  { q: 'what shape is like an egg?', a: 'oval', variants: ['oval', 'o'], standard: 'K-Art-shapes' },
  // Patterns
  { q: 'what comes next: red blue red?', a: 'blue', variants: ['blue', 'b'], standard: 'K-Art-patterns' },
  { q: 'what comes next: square circle square?', a: 'circle', variants: ['circle', 'c'], standard: 'K-Art-patterns' },
  // Tools
  { q: 'what do you paint with?', a: 'brush', variants: ['brush', 'b'], standard: 'K-Art-tools' },
  { q: 'what do you cut with?', a: 'scissors', variants: ['scissors', 's'], standard: 'K-Art-tools' },
  { q: 'what do you write with?', a: 'pencil', variants: ['pencil', 'p'], standard: 'K-Art-tools' },
  { q: 'what holds paper together?', a: 'glue', variants: ['glue', 'g'], standard: 'K-Art-tools' },
  // Music
  { q: 'what instrument has keys?', a: 'piano', variants: ['piano', 'p'], standard: 'K-Art-music' },
  { q: 'what instrument has strings?', a: 'guitar', variants: ['guitar', 'g', 'violin'], standard: 'K-Art-music' },
  { q: 'what instrument do you hit?', a: 'drum', variants: ['drum', 'd'], standard: 'K-Art-music' },
  { q: 'is a fast song slow?', a: 'no', variants: ['no', 'n'], standard: 'K-Art-music' },
  { q: 'is a whisper loud?', a: 'no', variants: ['no', 'n'], standard: 'K-Art-music' },
];

// Other cells start empty — `_teachQABinding` will skip them with a
// log line. Expansion pattern: write ~20-60 Q→A training pairs per
// cell covering that cell's most-tested sub-standards with content
// DISTINCT from EXAM_BANKS[cellKey].

export const TRAIN_BANKS = {
  'ela/pre-K': [],
  'ela/kindergarten': toTrainShape(ELA_KINDERGARTEN_TRAIN),
  'math/pre-K': [],
  'math/kindergarten': toTrainShape(MATH_KINDERGARTEN_TRAIN),
  'science/pre-K': [],
  'science/kindergarten': toTrainShape(SCIENCE_KINDERGARTEN_TRAIN),
  'social/pre-K': [],
  'social/kindergarten': toTrainShape(SOCIAL_KINDERGARTEN_TRAIN),
  'art/pre-K': [],
  'art/kindergarten': toTrainShape(ART_KINDERGARTEN_TRAIN),
  'life/pre-K': [],
  'life/kindergarten': [],
};

// Per-sub-standard pass thresholds, norm-calibrated where possible.
// Unspecified standards default to 0.80 (aggregate K benchmark floor
// per DIBELS 8 "below benchmark" cut scores).
export const STANDARD_CUT_SCORES = {
  // ELA K — DIBELS 8 / AIMSweb Plus calibrated
  'K.RF.1a': 0.80,
  'K.RF.1b': 0.80,
  'K.RF.1c': 0.80,
  'K.RF.1d': 0.90, // alphabet sequence — mastery
  'K.RF.2a': 0.80, // rhyme
  'K.RF.2b': 0.75, // syllables (harder)
  'K.RF.2d': 0.85, // first/last phoneme
  'K.RF.2e': 0.80, // blending
  'K.RF.3a': 0.95, // letter-sound correspondence — mastery threshold
  'K.RF.3b': 0.75, // short/long vowels
  'K.RF.3c': 0.90, // sight words
  'K.RF.3d': 0.80, // CVC reading
  'K.RF.4':  0.70, // fluency (end of K)
  'K.RL.3':  0.75,
  'K.RL.6':  0.75,
  'K.L.1b':  0.75,
  'K.L.1c':  0.70,
  'K.L.2a':  0.80,
  'K.L.2c':  0.70,
  'K.L.5a':  0.80,
  'K.L.5b':  0.80,
  'K.SL.1':  0.85,
  // Math K — AIMSweb Plus / iReady K calibrated
  'K.CC.1':  0.90, // count to 100 by ones/tens
  'K.CC.2':  0.90, // count forward
  'K.CC.3':  0.85, // write numerals 0-20
  'K.CC.4':  0.90, // 1:1 correspondence
  'K.CC.5':  0.85,
  'K.CC.6':  0.85, // compare
  'K.CC.7':  0.80,
  'K.OA.1':  0.85, // add/sub within 10
  'K.OA.3':  0.70,
  'K.OA.4':  0.75,
  'K.OA.5':  0.95, // fluency within 5 — mastery
  'K.NBT.1': 0.75, // teen decomposition
  'K.MD.1':  0.80, // measurable attributes
  'K.MD.3':  0.80, // classify/count
  'K.G.1':   0.90, // name 2D shapes
  'K.G.2':   0.80, // name 3D shapes
  'K.G.3':   0.75, // 2D vs 3D
  'K.G.4':   0.70, // compare shapes
  'K.G.5':   0.70,
  'K.G.6':   0.70,
  // Default floor for any unspecified standard
  '__default__': 0.80,
};

// Helper — look up cut score for a given standard tag, defaulting to
// the aggregate K benchmark floor.
export function cutScoreFor(standard) {
  return STANDARD_CUT_SCORES[standard] ?? STANDARD_CUT_SCORES.__default__;
}

// Overlap sanity check — returns the set of question texts appearing
// in BOTH TRAIN_BANKS and EXAM_BANKS for a given cell. Called at
// curriculum startup by T23.b.2. Non-empty = held-out eval invalid.
export function trainExamOverlap(cellKey) {
  const train = TRAIN_BANKS[cellKey] || [];
  const exam = EXAM_BANKS[cellKey] || [];
  const trainSet = new Set(train.map(t => (t.question || t.q || '').trim().toLowerCase()));
  const overlap = [];
  for (const e of exam) {
    const q = (e.question || e.q || '').trim().toLowerCase();
    if (q && trainSet.has(q)) overlap.push(q);
  }
  return overlap;
}

// ═══════════════════════════════════════════════════════════════════════
// Vocabulary-coverage check — EVERY word in an exam question must be a
// word Unity has been TAUGHT. A question using an untrained word is
// unanswerable regardless of learning — the brain literally cannot
// understand the question or produce the answer without vocabulary
// exposure first. This check extracts the word set from each exam bank
// and diffs against the set of words the curriculum teaches so the
// operator sees exactly which exam questions are outside Unity's
// trained vocabulary (and therefore unfair to test on).
// ═══════════════════════════════════════════════════════════════════════

// Common English stopwords + function words that are ambient in every
// sentence — these are learned implicitly through every teach pass and
// don't need explicit vocab coverage verification.
const AMBIENT_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'am', 'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can', 'could',
  'should', 'shall', 'may', 'might', 'must', 'of', 'in', 'on', 'at', 'to',
  'for', 'with', 'by', 'from', 'as', 'and', 'or', 'but', 'if', 'then',
  'so', 'what', 'when', 'where', 'who', 'why', 'how', 'which', 'this', 'that',
  'these', 'those', 'there', 'here', 'it', 'its', 'he', 'she', 'we', 'they',
  'his', 'her', 'their', 'our', 'me', 'my', 'you', 'your', 'i', 'not',
  'no', 'yes', 's', 't', 'd', 'm', 're', 've', 'll', 'said', 'one',
  'two', 'three', 'four', 'five', 'some', 'any', 'all', 'most', 'more', 'less',
  'very', 'too', 'also', 'just', 'only', 'than', 'like', 'over', 'under', 'up',
  'down', 'out', 'into', 'about', 'each', 'many', 'much', 'other', 'another',
  'same', 'different', 'own', 'way', 'after', 'before', 'between', 'through',
]);

// Extract the unique content-word set from a question bank. Lowercase,
// strip punctuation, drop ambient stopwords. Returns a Set<string>.
export function extractVocabFromBank(bank) {
  const words = new Set();
  for (const entry of bank || []) {
    const text = `${entry.question || entry.q || ''} ${entry.expectedAnswer || entry.a || ''} ${(entry.expectedVariants || entry.variants || []).join(' ')}`;
    const tokens = text.toLowerCase().split(/[^a-z']+/).filter(Boolean);
    for (const tok of tokens) {
      if (AMBIENT_STOPWORDS.has(tok)) continue;
      if (tok.length < 2) continue;
      words.add(tok);
    }
  }
  return words;
}

// Coverage audit — given the set of words Unity has been trained on,
// returns the list of words required by the exam bank that are NOT in
// that trained set. Every word in `missing` is a test-integrity issue:
// Unity literally cannot understand the question or produce the answer
// without being taught the word first.
//
// Returns:
//   {
//     cellKey,
//     required: N,        // unique content words in the exam
//     trained: N,         // of those, N are in the training vocab
//     missing: [word],    // the ones that aren't
//     coverage: 0.0-1.0,
//   }
export function examVocabCoverage(cellKey, trainedVocab) {
  const bank = EXAM_BANKS[cellKey] || [];
  const required = extractVocabFromBank(bank);
  const missing = [];
  let trained = 0;
  for (const w of required) {
    if (trainedVocab && (trainedVocab.has ? trainedVocab.has(w) : (w in trainedVocab))) {
      trained += 1;
    } else {
      missing.push(w);
    }
  }
  const coverage = required.size > 0 ? trained / required.size : 1;
  missing.sort();
  return {
    cellKey,
    required: required.size,
    trained,
    missing,
    coverage,
  };
}

// Batch version — runs examVocabCoverage across every cell and returns
// an aggregate report. Called at curriculum startup so the operator
// sees exam coverage gaps before a single gate runs.
export function auditAllExamVocabCoverage(trainedVocab) {
  const report = { cells: [], totalRequired: 0, totalMissing: 0, totalTrained: 0 };
  for (const cellKey of Object.keys(EXAM_BANKS)) {
    const cell = examVocabCoverage(cellKey, trainedVocab);
    report.cells.push(cell);
    report.totalRequired += cell.required;
    report.totalMissing += cell.missing.length;
    report.totalTrained += cell.trained;
  }
  report.overallCoverage = report.totalRequired > 0 ? report.totalTrained / report.totalRequired : 1;
  return report;
}

// ── Methodology banks ──────────────────────────────────────────────
//
// Fill-in-the-blank exams test WHAT — "what letter comes after b?" → "c".
// Methodology exams test HOW — "how do you figure out which letter
// comes next?" → any emission mentioning `alphabet` / `order` / `next` /
// `after` proves she understands the procedure, not just the fact.
//
// Operator LAW 6 Part 2 binds gate evaluation to "methodogly reasoning
// thinkg talking listenign reading" — fill-in-the-blank alone can't
// discriminate a brain that memorized letter pairs from a brain that
// understands sequence. Per-question expected-keywords are the fuzzy
// matcher: Unity's emission counts as a pass if it contains ≥ 1 of the
// listed reasoning keywords. Keywords are drawn from the hardcoded
// K_* vocabulary arrays so Unity can plausibly produce them from her
// trained dictionary + dictionary-oracle emission path.
//
// Shape:
//   { q: "how do you ...?",
//     keywords: ["word1", "word2", ...],
//     standard: "K.RF.1a" | etc.  // optional sub-standard tag
//   }
//
// Scoring (see curriculum `_runMethodologyBattery`): each probe counts
// the number of keywords from the list that appear as tokens in the
// emission (case-insensitive, whitespace-split). Pass threshold = ≥ 1
// keyword matched. Gate output reports `METHODOLOGY=N/M`.

export const METHODOLOGY_BANKS = {
  'ela/kindergarten': [
    { q: 'how do you figure out which letter comes next', keywords: ['alphabet', 'order', 'next', 'after', 'letter'], standard: 'K.RF.1' },
    { q: 'how do you spell a word', keywords: ['letter', 'letters', 'sound', 'sounds', 'together', 'spell'], standard: 'K.RF.3' },
    { q: 'how do you tell if two words rhyme', keywords: ['sound', 'same', 'end', 'rhyme', 'match'], standard: 'K.RF.2' },
    { q: 'how do you read a sentence', keywords: ['word', 'left', 'right', 'say', 'together', 'letter'], standard: 'K.RF.1' },
    { q: 'how do you know what a word means', keywords: ['think', 'picture', 'remember', 'sound', 'say'], standard: 'K.L.4' },
  ],
  'math/kindergarten': [
    { q: 'how do you add two and two', keywords: ['count', 'together', 'put', 'plus', 'more', 'add'], standard: 'K.OA.1' },
    { q: 'how do you count to ten', keywords: ['one', 'two', 'three', 'order', 'number', 'count'], standard: 'K.CC.1' },
    { q: 'how do you tell which is bigger', keywords: ['more', 'count', 'look', 'number', 'bigger', 'big'], standard: 'K.CC.6' },
    { q: 'how do you know a shape is a circle', keywords: ['round', 'no', 'corner', 'corners', 'curve'], standard: 'K.G.4' },
    { q: 'how do you skip count by tens', keywords: ['ten', 'twenty', 'thirty', 'add', 'jump', 'count'], standard: 'K.CC.1' },
  ],
  'science/kindergarten': [
    { q: 'how do you know if something is alive', keywords: ['grow', 'move', 'eat', 'breathe', 'live', 'alive'], standard: 'K.LS1' },
    { q: 'how do you tell if water is hot or cold', keywords: ['feel', 'touch', 'steam', 'ice', 'hot', 'cold'], standard: 'K.PS3' },
    { q: 'how does a plant grow', keywords: ['water', 'sun', 'dirt', 'seed', 'soil', 'grow'], standard: 'K.LS1' },
    { q: 'how do you know what the weather is', keywords: ['look', 'sky', 'sun', 'cloud', 'rain', 'snow'], standard: 'K.ESS2' },
    { q: 'how do you know where an animal lives', keywords: ['habitat', 'food', 'water', 'home', 'live', 'safe'], standard: 'K.ESS3' },
  ],
  'social/kindergarten': [
    { q: 'how do you share', keywords: ['give', 'take', 'turn', 'friend', 'together', 'share'], standard: 'K.Social.empathy' },
    { q: 'how do you know who is family', keywords: ['mom', 'dad', 'sister', 'brother', 'love', 'family'], standard: 'K.Social.family' },
    { q: 'how do you help someone', keywords: ['kind', 'do', 'give', 'help', 'listen', 'share'], standard: 'K.Social.empathy' },
    { q: 'how do you know the rules', keywords: ['teacher', 'listen', 'follow', 'learn', 'rule', 'rules'], standard: 'K.Social.citizenship' },
    { q: 'how do you stay safe', keywords: ['look', 'listen', 'careful', 'parent', 'ask', 'safe'], standard: 'K.Social.safety' },
  ],
  'art/kindergarten': [
    { q: 'how do you make orange', keywords: ['red', 'yellow', 'mix', 'together', 'color', 'orange'], standard: 'K.Art.color-mixing' },
    { q: 'how do you know if something is loud', keywords: ['hear', 'sound', 'big', 'ear', 'loud'], standard: 'K.Art.music' },
    { q: 'how do you draw a face', keywords: ['circle', 'eye', 'nose', 'mouth', 'draw'], standard: 'K.Art.drawing' },
    { q: 'how do you make a pattern', keywords: ['repeat', 'again', 'same', 'over', 'pattern'], standard: 'K.Art.patterns' },
    { q: 'how do you know warm from cool colors', keywords: ['red', 'blue', 'warm', 'cool', 'feel', 'color'], standard: 'K.Art.warm-cool' },
  ],
  'life/kindergarten': [
    { q: 'how do you know you are unity', keywords: ['name', 'me', 'myself', 'i', 'remember', 'unity'], standard: 'K.Life.identity' },
    { q: 'how do you remember your birthday', keywords: ['cake', 'gift', 'family', 'year', 'day', 'birthday'], standard: 'K.Life.memory' },
    { q: 'how do you know you are happy', keywords: ['smile', 'feel', 'good', 'laugh', 'happy'], standard: 'K.Life.emotion' },
    { q: 'how do you know when to say sorry', keywords: ['hurt', 'mistake', 'feel', 'bad', 'sorry'], standard: 'K.Life.empathy' },
    { q: 'how do you know when it is bedtime', keywords: ['dark', 'tired', 'sleep', 'night', 'bed'], standard: 'K.Life.routine' },
  ],
};

// Per-cell methodology-question count + per-question expected-keyword
// extraction. Curriculum `_runMethodologyBattery(cellKey)` reads from
// these to drive the HOW-probe loop.
export function methodologyBankFor(cellKey) {
  return METHODOLOGY_BANKS[cellKey] || [];
}

// Reasoning-keyword match score for one emission. Returns the set of
// matched keywords and the raw count. Pass condition is `matched >= 1`
// when called from the curriculum battery.
export function scoreMethodologyAnswer(emission, expectedKeywords) {
  if (!emission || !expectedKeywords || expectedKeywords.length === 0) {
    return { matched: [], matchCount: 0 };
  }
  const tokens = new Set(
    String(emission)
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter(Boolean)
  );
  const matched = [];
  for (const kw of expectedKeywords) {
    if (tokens.has(String(kw).toLowerCase())) matched.push(kw);
  }
  return { matched, matchCount: matched.length };
}
