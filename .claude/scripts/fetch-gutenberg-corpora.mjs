// fetch-gutenberg-corpora.mjs — REAL LITERATURE for the ELA corpus.
//
// The third leg of the hybrid source decision (OpenStax + Wikibooks + Project
// Gutenberg), and the one closing the most indefensible gap in the corpus:
// ELA held Wikipedia articles ABOUT books instead of books. A grade-9 English
// year reads Romeo and Juliet; it does not read a summary of Romeo and Juliet.
//
// SOURCE: Project Gutenberg plain-text editions. ⭐ THE LICENCE GUARANTEE IS
// THE SOURCE ITSELF — Project Gutenberg's US catalogue is public-domain by
// their own collection policy, which is a stronger guarantee than per-title
// licence parsing. Titles still in copyright are therefore not reachable here
// even by mistake, and the two the topic list named that are NOT public domain
// are deliberately absent (see the ladder note below).
//
// Output format, path and merge semantics are IDENTICAL to the other two
// ingests — same corpora/academic/ela/<grade>.json, same {theme, story}, same
// keep-longer union — so all three sources compose into one corpus.
//
// RUN:  node .claude/scripts/fetch-gutenberg-corpora.mjs           (all grades)
//       node .claude/scripts/fetch-gutenberg-corpora.mjs grade9    (one grade)
// Network required. Re-runnable / idempotent. Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'corpora', 'academic');
const UA = 'UnityBrainCurriculum/1.0 (educational research; public-domain literature)';

const SENT_MIN = 30, SENT_MAX = 240;
// ⭐ THE EARLY CAP IS HIGHER HERE THAN IN THE WIKI INGEST, AND THE REASON IS THE
// SOURCE, NOT A LOOSENING.
//
// `early: 60` exists in the encyclopedia ingest because Simple-English prose is
// still dense for a four-year-old, so volume there buys reading difficulty. That
// rationale does not transfer: children's literature is written FOR this band —
// more of it is more of the right thing.
//
// ⚠ And it was measured, not assumed. At 60 the early band closed only 8 of the
// 16 gap-words those four books demonstrably contain, because stride-sampling 30
// sentences out of a whole book misses specific vocabulary. The cap, not the
// source, was the binding constraint on the SECOND pass.
// ⛔⛔⛔ NO CAP — 2026-09-02, on Gee's instruction that *"all the corpus needs to
// be complete"*. Everything above this line about 60 vs 400 was an argument
// about WHICH ceiling, when the ceiling itself was the defect: a 400-sentence
// cap on Great Expectations downloads a 183,000-word novel and keeps ~8,000
// words of it. **She reads the book.** What says when a CELL is finished is the
// band floor in `docs/CURRICULUM-GAP.md §THE TARGET LADDER`.
const SENT_CAP_BY_BAND = { early: Infinity, middle: Infinity, upper: Infinity, high: Infinity, college: Infinity, grad: Infinity };
const BAND_OF_GRADE = new Map([
  ['pre-k', 'early'], ['kindergarten', 'early'], ['grade1', 'early'], ['grade2', 'early'],
  ['grade3', 'middle'], ['grade4', 'middle'], ['grade5', 'middle'],
  ['grade6', 'upper'], ['grade7', 'upper'], ['grade8', 'upper'],
  ['grade9', 'high'], ['grade10', 'high'], ['grade11', 'high'], ['grade12', 'high'],
  ['college1', 'college'], ['college2', 'college'], ['college3', 'college'], ['college4', 'college'],
  ['grad', 'grad'], ['phd', 'grad'],
]);
const sentCapFor = (g) => SENT_CAP_BY_BAND[BAND_OF_GRADE.get(String(g || '').toLowerCase())] || SENT_CAP_BY_BAND.early;

// THE READING LADDER — age-banded to the scope-sequence, every id verified to
// resolve to its expected title before being written here.
//
// ⛔ TWO TITLES THE EXISTING ELA TOPIC LIST NAMES ARE ABSENT ON PURPOSE: The
// Crucible (1953) and Nineteen Eighty-Four (1949) are still in copyright in the
// US and are not on Gutenberg. They stay as encyclopedia entries rather than
// being silently substituted — a reading ladder that quietly swaps the assigned
// text for a different one is worse than an honest gap.
const LADDER = {
  // ⭐⭐ THE EARLY BAND, ADDED 2026-09-01 AGAINST A MEASURED GAP RATHER THAN A HUNCH.
  //
  // Wiring the (previously dead) whole-curriculum exam auditor against the
  // corpus proved that **94 exam words appear NOWHERE in the 4.4M-word corpus**,
  // and every one is early-childhood vocabulary: `dad`, `grandma`, `moo`,
  // `quack`, `kitten`, `scissors`, `goldilocks`, contractions. The cause is not
  // a cap — it is the SOURCE. Encyclopedia prose says "father", never "moo".
  //
  // These four were each TESTED against that 94-word list before being written
  // in, not assumed to help:
  //     25545 Children's Literature            15 of the gap words
  //     19993 Childhood's Favorites            13
  //     17034 English Fairy Tales              10
  //      7841 A Primary Reader                  2
  //     UNION                                  16 of 32 prose-teachable words
  //
  // ⚠ THE REMAINDER IS HONEST AND STATED: `barbie`, `pjs`, `itsy`, `bitsy`,
  // `oink`, `polliwog`, `firefighter`, `raincoat` are modern or nursery-specific
  // and appear in NO public-domain book — they belong to the hand-authored
  // life-canon lane, not to a fetched corpus. And `buh`/`duh`/`sss`/`kuh` are
  // PHONEME SOUNDS taught by the phonics lane; their absence from prose is
  // correct, not a defect.
  // ⭐⭐ THE READING TEXTBOOK, NOT JUST READING MATERIAL — added 2026-09-02.
  //
  // Gee: *"we need to replace it with the real equivents that are full and
  // complete ie textbooks and reading teachings for all of the learning the
  // alphabet phones letters alphabet numbers all of it"*.
  //
  // Story anthologies are what a child READS; they are not what teaches a child
  // to read. The McGuffey Eclectic series IS the instructional sequence —
  // letters, letter sounds, blends, first words, first sentences, then graded
  // reading — and it is the canonical American one, public domain and whole.
  // ⛔ Every id below was verified against Gutenberg's own `Title:` header
  // before it was written here, per the rule `LITGRADE.1` earned: of eight ids
  // guessed from memory in the first pass, two resolved to *The Illustrated War
  // News* and a *Pony Rider Boys* novel.
  'pre-K':   [[19993, "Childhood's Favorites and Fairy Stories"], [7841, 'A Primary Reader'], [23483, "Dame Wonder's Picture Alphabet"]],
  kindergarten: [[25545, "Children's Literature"], [17034, 'English Fairy Tales'], [14642, "McGuffey's Eclectic Primer"]],
  grade1:  [[19993, "Childhood's Favorites and Fairy Stories"], [25545, "Children's Literature"], [14640, "McGuffey's First Eclectic Reader"]],
  grade2:  [[17034, 'English Fairy Tales'], [21, "Aesop's Fables"], [14668, "McGuffey's Second Eclectic Reader"], [15456, "McGuffey's Eclectic Spelling Book"]],
  grade3:  [[11, "Alice's Adventures in Wonderland"], [21, "Aesop's Fables"], [14766, "McGuffey's Third Eclectic Reader"]],
  grade4:  [[55, 'The Wonderful Wizard of Oz'], [16, 'Peter Pan'], [14880, "McGuffey's Fourth Eclectic Reader"]],
  grade5:  [[74, 'The Adventures of Tom Sawyer'], [215, 'The Call of the Wild'], [15040, "McGuffey's Fifth Eclectic Reader"]],
  grade6:  [[120, 'Treasure Island'], [514, 'Little Women'], [16751, "McGuffey's Sixth Eclectic Reader"]],
  grade7:  [[46, 'A Christmas Carol'], [215, 'The Call of the Wild']],
  grade8:  [[76, 'Adventures of Huckleberry Finn']],
  grade9:  [[1513, 'Romeo and Juliet'], [1727, 'The Odyssey']],
  grade10: [[1522, 'Julius Caesar'], [84, 'Frankenstein'], [1400, 'Great Expectations']],
  grade11: [[64317, 'The Great Gatsby'], [2701, 'Moby Dick']],
  grade12: [[1524, 'Hamlet'], [1533, 'Macbeth'], [16328, 'Beowulf'], [2383, 'The Canterbury Tales']],
  college1: [[1342, 'Pride and Prejudice'], [345, 'Dracula']],
  college2: [[6130, 'The Iliad']],
  // ⭐⭐ UPPER COLLEGE AND POSTGRADUATE ARE CRITICISM AND THEORY, NOT MORE NOVELS.
  // An ELA year at this level reads what is written ABOUT literature: the texts
  // below are the canonical criticism sequence, ordered by difficulty rather
  // than by date, so the ladder still climbs.
  //
  // ⛔ EVERY ID BELOW WAS VERIFIED AGAINST GUTENBERG'S OWN `Title:` HEADER BEFORE
  // BEING WRITTEN HERE, and the check earned its keep on the first pass: id
  // 55111, guessed for T.S. Eliot's *The Sacred Wood*, actually resolves to
  // *Dix-sept histoires de marins* by Claude Farrère — a French sea-story
  // collection that would have ingested silently as English literary criticism.
  // A wrong id does not fail; it teaches the wrong book.
  college3: [[5429, 'Preface to Shakespeare'], [9622, 'Lyrical Ballads']],
  college4: [[4212, 'Culture and Anarchy'], [6081, 'Biographia Literaria']],
  grad:     [[1974, 'The Poetics of Aristotle'], [17957, 'On the Sublime']],
  phd:      [[51356, 'The Birth of Tragedy'], [3623, 'The Golden Bough']],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gutenberg wraps every text in a licence header and footer. Everything
// between the START and END markers is the work; everything outside is
// boilerplate that would otherwise train as literature.
function stripBoilerplate(txt) {
  const start = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i.exec(txt);
  const end = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i.exec(txt);
  let body = txt;
  if (start) body = body.slice(start.index + start[0].length);
  if (end) {
    const e = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i.exec(body);
    if (e) body = body.slice(0, e.index);
  }
  return body;
}

// Shared normalisation for both readers below — the prose sampler and the
// dialogue extractor must see the same text or the two entries a book produces
// would disagree about what the book says.
function normalizeBody(txt) {
  let t = stripBoilerplate(String(txt));
  // Verse and drama carry hard line breaks mid-sentence; joining single
  // newlines (while keeping paragraph breaks) turns a play back into
  // sentences instead of producing one fragment per printed line.
  t = t.replace(/\r/g, '');
  t = t.replace(/\n{2,}/g, '   ');
  t = t.replace(/\n/g, ' ');
  t = t.replace(/ /g, ' ');
  // ⛔ EDITORIAL BRACKETS — LENGTH BOUND REMOVED 2026-09-02, AND THE 80 WAS THE BUG.
  // Stage notes are short; a TRANSLATOR'S FOOTNOTE is not. Butler's notes in the
  // Odyssey run 100-300 characters ("[ the reader will note how the spoiling of
  // good food distresses the writer even in such a supreme moment as this.]"), so
  // every one of them sailed through an 80-character cap and trained as Homer.
  // `[^\[\]]*` cannot nest and cannot run past the next bracket of either kind, so
  // dropping the length bound does not risk eating the work.
  t = t.replace(/\[[^\[\]]*\]/g, ' ');
  t = t.replace(/_+/g, ' ');                        // underscore italics
  t = t.replace(/[‘’‚‛′]/g, "'")
       .replace(/[“”„‟″]/g, '"')
       .replace(/[‐-―−]/g, '-')
       .replace(/[…]/g, '...')
       .replace(/[     ]/g, ' ')
       .normalize('NFD').replace(/[̀-ͯ]/g, '')
       .replace(/\s+/g, ' ');
  return t;
}

// ⭐⭐ DIALOGUE — THE ONE THING PROSE INGESTS CANNOT GIVE HER, AND THE MEASURED
// GAP IS NOT SUBTLE.
//
// Across everything she is taught, interrogative + exclamative exposure was under
// HALF OF ONE PERCENT: the three boot corpora contain zero `?` and zero `!`
// between them, and the 248k-sentence academic corpus reads 0.28% / 0.19%.
// Encyclopedia and textbook prose is declarative by construction — it never
// greets anyone, never asks, never exclaims. A brain taught only from it has no
// attested example of the forms conversation is made of.
//
// ⛔ AND THE ONE THING THIS MAY NOT BE IS AUTHORED. Greeting and emotion lines
// written out of my head, dropped into her corpus, were caught and deleted:
// "I dont want her parroting the shit u pulled out of your ass". Every line here
// is quoted speech lifted from a public-domain book already on her reading
// ladder — attested, in context, age-banded by the ladder that selected it.
//
// ⚠ PUNCTUATION IS NEVER ADDED. A line that ends `,` in the book (`"good
// morning," said the King`) keeps its words and loses the comma; it does NOT get
// a full stop invented for it, because the terminal form is exactly what this
// lane exists to teach and inventing one would teach a form the author never
// wrote.
function dialogueLines(txt, cap) {
  if (!txt) return { lines: [], stats: { q: 0, bang: 0, stop: 0, bare: 0 } };
  const t = normalizeBody(txt);
  const out = [];
  const stats = { q: 0, bang: 0, stop: 0, bare: 0 };
  const seen = new Set();
  // ⛔ A QUOTED SPAN IS NOT ONE LINE — SPLIT IT (2026-09-02). This used to take
  // each `"…"` whole and drop anything over the sentence cap, which threw away
  // exactly the speech worth having: a character's paragraph-long speech, and
  // every epic speech in Homer, arrives as ONE span of several hundred
  // characters. Measured consequence before the fix — the Odyssey's speech lane
  // was 37% terminated because only the short scraps survived, while whole
  // speeches were discarded for being long. Splitting the span into sentences
  // first keeps the speech and keeps each sentence's own terminal form.
  for (const m of t.matchAll(/"([^"]{4,1200})"/g)) {
    const span = m[1].trim();
    if (!/[a-z]/i.test(span)) continue;
    if (/project gutenberg|gutenberg-tm|ebook|copyright|transcriber/i.test(span)) continue;
    const pieces = span.split(/(?<=[.!?])\s+/);
    for (let i = 0; i < pieces.length; i++) {
      let s = pieces[i].trim();
      if (!/[a-z]/i.test(s)) continue;
      if (/[^\x20-\x7e]/.test(s)) continue;
      if (/[\[\]]/.test(s)) continue;
      // An all-caps run inside quotes is a title or a sign, not speech.
      if (/^[^a-z]{12,}$/.test(s)) continue;
      // Trailing attribution punctuation is the narrator's, not the speaker's —
      // drop it, add nothing. Only the final piece can carry it.
      if (i === pieces.length - 1) s = s.replace(/[,;:]\s*$/, '').trim();
      if (s.length < 8 || s.length > SENT_MAX) continue;
      const low = s.toLowerCase();
      if (seen.has(low)) continue;               // books repeat stock phrases
      seen.add(low);
      if (/\?$/.test(s)) stats.q++;
      else if (/!$/.test(s)) stats.bang++;
      else if (/\.$/.test(s)) stats.stop++;
      else stats.bare++;
      out.push(low);
    }
  }
  if (out.length <= cap) return { lines: out, stats };
  // Stride-sample so a book contributes speech from all of itself, not just the
  // chapter where two characters happen to talk the most.
  const stride = out.length / cap;
  const picked = [];
  for (let i = 0; i < cap; i++) picked.push(out[Math.floor(i * stride)]);
  return { lines: picked, stats };
}

// ⭐⭐ DRAMA — THE FOUR TEXTS THAT ARE NOTHING BUT SPEECH WERE CONTRIBUTING NONE
// OF IT, AND THE CAUSE WAS THE EXTRACTOR, NOT THE PLAYS.
//
// `dialogueLines` finds speech by quotation marks. Drama does not quote: it names
// the speaker on its own line and gives the rest of the page to the character.
// Measured on the live run before this existed: Hamlet **0** usable spoken lines,
// Romeo and Juliet **1**, Macbeth 17, Julius Caesar 18 — against Great
// Expectations' 1,074. A reader of that corpus would conclude Shakespeare wrote
// no dialogue.
//
// ⛔ THIS RUNS ON THE TEXT BEFORE `normalizeBody`, and that is the whole trick.
// Normalisation joins single newlines so verse reads as sentences instead of one
// fragment per printed line — which is right for the prose lane and destroys the
// only structure drama has. The speaker cue IS a line break.
//
// The shape, verified against the real files: a cue line holding an ALL-CAPS name
// (`MARCELLUS.`, `LADY MACBETH.`, sometimes with no period), then the speech, then
// a blank line. Stage directions arrive as their own bracketed or `Enter …` blocks
// and are dropped whole.
function dramaSpeech(txt, cap) {
  const empty = { lines: [], stats: { q: 0, bang: 0, stop: 0, bare: 0 }, cues: 0, blocks: 0 };
  if (!txt) return empty;
  const body = stripBoilerplate(String(txt)).replace(/\r/g, '');
  const blocks = body.split(/\n[ \t]*\n/);
  // A cue is a short line that is a NAME: capitals, spaces, apostrophes, an
  // optional trailing period. `ACT`/`SCENE`/`PROLOGUE` are structure, not people;
  // `CHORUS` genuinely speaks in Romeo and Juliet, so it is not excluded.
  const CUE = /^[A-Z][A-Z'’.\- ]{1,28}\.?$/;
  const NOT_A_PERSON = /^(ACT|SCENE|PROLOGUE|EPILOGUE|THE END|CONTENTS|DRAMATIS|PERSONAE|FINIS)\b/;
  const out = [];
  const stats = { q: 0, bang: 0, stop: 0, bare: 0 };
  const seen = new Set();
  let cues = 0;
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const head = lines[0];
    if (!CUE.test(head) || NOT_A_PERSON.test(head)) continue;
    if (!/[A-Z]{2,}/.test(head)) continue;
    cues++;
    let speech = lines.slice(1).join(' ');
    // Same character-level normalisation the prose lane uses, applied here
    // rather than inherited, because this lane deliberately skipped it above.
    speech = speech
      .replace(/\[[^\[\]]*\]/g, ' ')
      .replace(/_+/g, ' ')
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/[…]/g, '...')
      .replace(/[     ]/g, ' ')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    for (let s of speech.split(/(?<=[.!?])\s+/)) {
      s = s.trim().replace(/^["']|["']$/g, '').trim();
      if (s.length < 8 || s.length > SENT_MAX) continue;
      if (!/[a-z]/.test(s)) continue;
      if (/[^\x20-\x7e]/.test(s)) continue;
      if (/[\[\]]/.test(s)) continue;
      // A stage direction that shared the block ("Enter Ghost.", "Exeunt.").
      if (/^(enter|exeunt|exit|re-enter|aside|within)\b/i.test(s)) continue;
      if (/project gutenberg|gutenberg-tm|ebook|copyright|transcriber/i.test(s)) continue;
      const low = s.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      if (/\?$/.test(s)) stats.q++;
      else if (/!$/.test(s)) stats.bang++;
      else if (/\.$/.test(s)) stats.stop++;
      else stats.bare++;
      out.push(low);
    }
  }
  if (out.length <= cap) return { lines: out, stats, cues, blocks: blocks.length };
  const stride = out.length / cap;
  const picked = [];
  for (let i = 0; i < cap; i++) picked.push(out[Math.floor(i * stride)]);
  return { lines: picked, stats, cues, blocks: blocks.length };
}

// FORM DISPATCH, NOT A FALLBACK LADDER. A work is either quote-marked prose or
// it is drama; running the wrong reader over either one returns nothing, so the
// choice is made by looking at the text rather than by trying one and settling
// for the other when it disappoints.
//
// ⛔⛔ THE WITNESS IS CUE **DENSITY**, NOT CUE COUNT — and a raw count of 20 was
// tried first and SHIPPED THREE NOVELS DOWN THE DRAMA PATH. Treasure Island,
// Little Women and Huckleberry Finn all carry ALL-CAPS headings that match the
// speaker-cue shape, so they cleared a count threshold and were then read by the
// wrong reader: Treasure Island produced 37 lines with **zero** questions and
// zero terminators, Little Women produced 1. Caught by reading the run output,
// not by the code failing.
//
// Density separates the two forms by a margin nothing else in this file comes
// close to — measured over the real files:
//     Hamlet 75.5%   Romeo and Juliet 71.6%   Julius Caesar 73.2%
//     Treasure Island 2.4%   Huckleberry Finn 1.9%   Little Women 1.2%
//     Tom Sawyer 0.0%   Pride and Prejudice 0.1%
// A play is mostly speaker cues because a play is mostly speech. 25% sits in a
// gap thirty times wider than the noise on either side of it.
const DRAMA_CUE_DENSITY = 0.25;

function speechFrom(txt, cap) {
  const drama = dramaSpeech(txt, cap);
  const density = drama.blocks > 0 ? drama.cues / drama.blocks : 0;
  if (density >= DRAMA_CUE_DENSITY) return { ...drama, mode: 'drama', density };
  return { ...dialogueLines(txt, cap), mode: 'quoted', density };
}

function cleanProse(txt, cap) {
  if (!txt) return [];
  const t = normalizeBody(txt);
  // ⛔ COLLECT THE WHOLE WORK FIRST, THEN SAMPLE ACROSS IT — never take the
  // first N. Taking the first N gave the TRANSLATOR'S PREFACE of the Odyssey
  // instead of the poem: Gutenberg's START marker sits before the title page,
  // preface and contents, so "the beginning of the file" is not "the beginning
  // of the work". Sampling across the body also means a grade reads a whole
  // book rather than its opening pages. Caught by reading the output.
  const all = [];
  for (let s of t.split(/(?<=[.!?])\s+/)) {
    s = s.trim();
    if (s.length < SENT_MIN || s.length > SENT_MAX) continue;
    if (/[^\x20-\x7e]/.test(s)) continue;
    if (!/[a-z]/.test(s) || !/[.!?]$/.test(s)) continue;
    // Front/back-matter and apparatus that is not the work.
    if (/project gutenberg|gutenberg-tm|ebook|copyright|transcriber|produced by|illustration|contents|chapter [ivxlc\d]+\.?$/i.test(s)) continue;
    // Editorial apparatus around a translation — preface, note on the text,
    // introduction. These read as fluent prose and are not the work.
    if (/this translation|the translator|first edition|in this volume|i have here|footnote/i.test(s)) continue;
    // An ALL-CAPS run is a speaker tag or a heading, not narration.
    if (/^[^a-z]{20,}$/.test(s)) continue;
    // A LEFTOVER BRACKET MEANS UNBALANCED APPARATUS. The strip above removes
    // matched pairs; a lone `[` or `]` surviving into a sentence means the pair
    // straddled a sentence boundary, so what remains is half a footnote glued to
    // real narration. Drop it rather than teach the seam.
    if (/[\[\]]/.test(s)) continue;
    all.push(s.toLowerCase());
  }
  // Drop a leading slice as residual front matter, then stride-sample the rest.
  const head = Math.floor(all.length * 0.08);
  const body = all.slice(head);
  if (body.length <= cap) return body;
  const stride = body.length / cap;
  const out = [];
  for (let i = 0; i < cap; i++) out.push(body[Math.floor(i * stride)]);
  return out;
}

async function fetchBook(id) {
  // Two known layouts; the cache path is canonical, files/ is the older one.
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!r.ok) continue;
      const t = await r.text();
      if (t && t.length > 5000) return t;
    } catch { /* try next layout */ }
  }
  return '';
}

async function buildGrade(grade, books) {
  const cap = sentCapFor(grade);
  console.log(`[gutenberg] ela/${grade} (cap ${cap}) — ${books.length} work(s)`);
  const experiences = [];
  // ⛔ THERE IS NO BUDGET TO SPLIT ANY MORE (2026-09-02). This line divided a
  // grade's sentence budget between its assigned works, which meant a year with
  // four books read a quarter of each. A real school year reads all four of
  // them, whole. `per` stays `Infinity` so both readers below take everything.
  const per = Infinity;
  for (const [id, title] of books) {
    const txt = await fetchBook(id);
    if (!txt) { console.log(`  ${title} — UNAVAILABLE (id ${id})`); continue; }
    const sents = cleanProse(txt, per);
    if (sents.length < 3) { console.log(`  ${title} — no usable prose after cleaning`); continue; }
    // ⛔⛔ THEME IS NAMESPACED BY SOURCE, AND THAT IS NOT COSMETIC — IT FIXES A
    // REAL DISPLACEMENT. The ELA topic list already names several of these
    // works, so the wiki ingest produces the theme `romeo-and-juliet` for the
    // ARTICLE ABOUT the play. Un-namespaced, both entries collide, and the
    // keep-LONGER merge then kept whichever was longer — which was the
    // encyclopedia article. The play itself was silently displaced by a
    // summary of the play, inside the very ingest built to stop exactly that.
    // ⭐ Namespacing keeps BOTH: she reads the play AND what is written about
    // it, which is what a real English class does.
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    experiences.push({
      theme: `text-${slug}`,
      story: sents.join(' '),
      source: `gutenberg/${id}`,
      licence: 'public-domain',
    });
    console.log(`  ${title} — ${sents.length} sentences`);
    // ⭐ THE SPEECH IN THE SAME BOOK, AS ITS OWN ENTRY. Kept separate from the
    // narration entry on purpose: the merge is per theme, so a book's dialogue
    // can grow or shrink without displacing its prose, and the corpus auditor
    // can read the two lanes apart.
    //
    // ⚠ BUDGET RE-PRICED, NOT GUESSED (2026-09-02). A third of the prose cap was
    // tried first and measured: it lifted `?` 0.313% → 0.445% and `!` 0.220% →
    // 0.408% for +0.85% corpus. Real, but it leaves conversational forms under
    // 1% of everything she is ever taught, and the binding constraint was the
    // cap rather than the source — Great Expectations alone offered 734
    // questions and contributed 44 lines. Speech now gets the SAME per-book
    // budget as narration; the cost of that is written into the ledger with the
    // measured rates on both sides.
    const dlg = speechFrom(txt, per);
    // ⛔⛔ ONLY SENTENCE-TERMINATED LINES CAN BE STORED, AND THIS IS A PROPERTY OF
    // THE FORMAT RATHER THAN A PREFERENCE (2026-09-02).
    //
    // A cell's entry is one `story` string, and every consumer splits it back on
    // `(?<=[.!?])\s+`. An unterminated line therefore CANNOT round-trip: joined
    // with a space it fuses to whatever follows, so `good morning` + `what is
    // it?` is read back as the single sentence `good morning what is it?` — a
    // sentence neither character said, manufactured by the storage step.
    //
    // ⚠ Found by measuring the stored files and getting 98-100% terminated back
    // from entries the extractor had reported as 40% terminated. The number was
    // not good news; it was the fusion hiding the fragments.
    //
    // The fragments are dropped rather than repaired, because repairing means
    // inventing a terminator, and inventing terminal punctuation is the one
    // thing this lane is forbidden to do.
    const speakable = dlg.lines.filter((s) => /[.!?]$/.test(s));
    const droppedFragments = dlg.lines.length - speakable.length;
    if (speakable.length >= 5) {
      experiences.push({
        theme: `speech-${slug}`,
        story: speakable.join(' '),
        source: `gutenberg/${id}`,
        licence: 'public-domain',
      });
      console.log(`  ${title} — ${speakable.length} spoken lines stored [${dlg.mode} · cue density ${(100 * dlg.density).toFixed(1)}%] (? ${dlg.stats.q} · ! ${dlg.stats.bang} · . ${dlg.stats.stop} available; ${droppedFragments} unterminated fragments dropped — they cannot round-trip through a joined story)`);
    } else {
      console.log(`  ${title} — no speech lane [${dlg.mode}] (${speakable.length} storable spoken lines of ${dlg.lines.length} extracted; narration-only work)`);
    }
    await sleep(1200);   // polite to gutenberg.org
  }
  if (!experiences.length) return 0;

  const dir = path.join(OUT, 'ela');
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${grade}.json`);
  const byTheme = new Map();
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const e of (prev.experiences || [])) byTheme.set(e.theme, e);
  } catch { /* fresh cell */ }
  for (const e of experiences) {
    const old = byTheme.get(e.theme);
    // ⛔⛔ KEEP-LONGER IS WRONG FOR A RE-RUN OF THE SAME SOURCE, AND THAT IS WHY
    // DEBRIS SURVIVED A CLEANER FIX (2026-09-02).
    //
    // Keep-longer exists so three ingests can compose into one cell without
    // clobbering each other. Applied to the SAME source id it inverts: a
    // regeneration that removes footnotes, front matter or a preface produces a
    // SHORTER story, so the dirty text wins and the fix is a silent no-op. The
    // Odyssey cell carried translator apparatus for exactly this reason — the
    // cleaner had already been fixed and the corpus never changed.
    //
    // Same source id → newest wins, unconditionally. Different source → the
    // original keep-longer union still applies.
    const sameSource = old && old.source === e.source;
    if (!old || sameSource || e.story.length > old.story.length) byTheme.set(e.theme, e);
  }
  const merged = [...byTheme.values()];
  fs.writeFileSync(outPath, JSON.stringify({
    version: 1, grade, subject: 'ela',
    source: 'hybrid: Project Gutenberg public-domain literature + OpenStax (CC-BY) + Wikipedia (CC-BY-SA), cleaned + sentence-segmented',
    note: `Hybrid academic-depth corpus for ela/${grade}. Trained via curriculum._trainAcademicStories. Real openly-licensed curriculum content; lived-year + math stay bespoke.`,
    experiences: merged,
  }, null, 2), 'utf8');
  const n = experiences.reduce((a, e) => a + e.story.split(/(?<=[.!?])\s+/).length, 0);
  console.log(`  -> ela/${grade}.json (cell now ${merged.length} entries)`);
  return n;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
let total = 0;
for (const [grade, books] of Object.entries(LADDER)) {
  if (only && grade !== only) continue;
  try { total += await buildGrade(grade, books); }
  catch (e) { console.log(`[gutenberg] ${grade} FAILED — ${e.message}`); }
}
console.log(`[gutenberg] DONE — ~${total} sentences of real literature written under corpora/academic/ela/.`);
