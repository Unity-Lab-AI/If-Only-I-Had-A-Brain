// fetch-phonics-corpora.mjs — SYSTEMATIC PHONICS, DERIVED NOT TYPED.
//
// Gee: *"is that going to work building it by hand shouldnt we using something
// similar to hooked on phonics?"*
//
// ⛔ HE STOPPED ME REBUILDING THE BROKEN THING. The phonics exam bank was
// measured missing five letters (`b n q r t`) and teaching **no letter a second
// sound** — no hard/soft c, no hard/soft g, no long/short vowels. I offered to
// write the missing questions by hand, which would have produced another
// arbitrary list exactly as incomplete as the one already there. This project
// already has that rule: derive from a real source, the way
// `drawable-taxonomy.js` uses WordNet instead of a blacklist.
//
// ⚠ HOOKED ON PHONICS ITSELF IS PROPRIETARY and is not ingested. The brand is
// not the method: what makes a programme like it work is a **systematic
// scope-and-sequence** — an ordered inventory of grapheme→phoneme
// correspondences over the ~44 English phonemes and ~250 graphemes. That is
// openly published, and this is the openly-licensed equivalent.
//
// TWO SOURCES, BOTH LICENCE-VERIFIED, EACH DOING WHAT ONLY IT CAN:
//
//   ① Wikipedia, "English orthography"  — CC-BY-SA
//      The GRAPHEME inventory with CONTEXT RULES and multiple values per
//      grapheme: `c` is /s/ before e,i,y and /k/ elsewhere; `ch` is /tʃ/ but
//      /k/ in Greek-origin words and /ʃ/ in French-origin ones. **This is the
//      part a pronunciation dictionary cannot supply**, because a dictionary
//      says what a WORD sounds like and never which letters made which sound.
//
//   ② CMU Pronouncing Dictionary — BSD 2-clause, 135,166 entries
//      The PHONEME ground truth per word, used here to CHECK the table's claims
//      against attested pronunciation rather than trusting an encyclopedia.
//      ⭐ The cleanest licence in this corpus: modification and redistribution
//      explicitly permitted, no NC, no ND, no SA.
//
// ⛔⛔ GRAPHEME-FIRST WAS AN EXPLICIT DECISION, AND THE ALTERNATIVE WAS MEASURED
// AND REJECTED. Aligning single LETTERS to first phonemes across the whole
// dictionary looked convincing — it recovered hard/soft c and g and found 16 of
// 26 letters with more than one initial sound — and it was wrong in a way that
// would teach errors: it credited `k → /n/` from *knab* (that /n/ belongs to the
// `n` of a silent-k word) and `p → /f/` from *phi* (that is the digraph `ph`).
// **A letter is not a grapheme, and an aligner that cannot see digraphs
// misattributes sounds to the wrong unit.** Taking the units from a real
// sequence removes the guess entirely.
//
// RUN:  node .claude/scripts/fetch-phonics-corpora.mjs
//       node .claude/scripts/fetch-phonics-corpora.mjs --verify   (checks only)
// Network required. Re-runnable / idempotent. Node 18+.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
// ⚠ Its own directory, deliberately: the two wiki ingests write
// corpora/academic continuously, and `CELLRACE` is the standing hazard.
const OUT_DIR = path.join(ROOT, 'corpora', 'phonics');
const UA = 'UnityBrainCurriculum/1.0 (https://github.com/Unity-Lab-AI/If-Only-I-Had-A-Brain; contact@unityailab.com) node-fetch educational-research';

const WIKI_API = 'https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&page=English_orthography';
const CMU_DICT = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';
const CMU_LICENCE = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/LICENSE';

async function fetchText(url, ms = 60000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
    if (!r.ok) return { text: null, reason: `HTTP ${r.status}` };
    return { text: await r.text(), reason: '' };
  } catch (e) {
    return { text: null, reason: `network: ${e?.message || e}` };
  } finally { clearTimeout(t); }
}

// ⛔⛔ ROWSPAN-AWARE, AND WITHOUT THIS THE CONTEXT RULES ATTACH TO THE WRONG
// LETTER. In the source table the grapheme cell carries `rowspan`, so `c`'s four
// context rows — "before e,i,y", "word initial before n,t", "before unstressed
// ea,ia,ie,io", "elsewhere" — have NO grapheme cell of their own. A naive
// per-row read yields `["word initial before n, t", "∅", "cnidarian, ctenoid"]`
// with the grapheme silently missing, and the next row's letter would inherit
// it. **Seen in the first extraction, which is why this exists.**
function parseTableRowspanAware(tableHtml) {
  const rowHtml = [...String(tableHtml).matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  const carry = [];                 // column index -> { text, rowsLeft }
  const out = [];
  for (const rh of rowHtml) {
    const cells = [...rh.matchAll(/<(t[dh])([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m) => ({
      attrs: m[2],
      text: m[3].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim(),
    }));
    const row = [];
    let ci = 0;
    // Carried cells occupy their column BEFORE this row's own cells are placed.
    const place = () => { while (carry[ci] && carry[ci].rowsLeft > 0) { row[ci] = carry[ci].text; ci++; } };
    place();
    for (const c of cells) {
      const rs = parseInt((/\browspan\s*=\s*"?(\d+)/i.exec(c.attrs) || [])[1] || '1', 10) || 1;
      row[ci] = c.text;
      if (rs > 1) carry[ci] = { text: c.text, rowsLeft: rs };
      ci++;
      place();
    }
    for (let k = 0; k < carry.length; k++) if (carry[k] && carry[k].rowsLeft > 0) carry[k].rowsLeft--;
    if (row.filter(Boolean).length) out.push(row);
  }
  return out;
}

// IPA (the encyclopedia's alphabet) -> ARPAbet (the dictionary's alphabet), so
// the table's claims can be CHECKED against attested pronunciation instead of
// believed. ⚠ Deliberately partial and honest about it: only the mappings this
// check relies on are listed, and an unmapped symbol makes a claim
// "unverifiable" rather than "false".
// ⛔⛔ THE IPA VOICED-VELAR IS U+0261 SCRIPT G, NOT THE KEYBOARD LETTER G.
// `ɡ` and `g` render identically and are different code points, so the ASCII
// entry below never matched a single encyclopedia value and five `g` rules were
// filed "unverifiable" while the data was there. **A lookalike character is a
// silent mismatch: nothing errors, the count just comes out wrong.** Both are
// mapped, and the normaliser folds one onto the other.
const IPA_TO_ARPA = {
  'ɡ': ['G'],
  'b': ['B'], 'd': ['D'], 'f': ['F'], 'g': ['G'], 'h': ['HH'], 'j': ['Y'], 'k': ['K'],
  'l': ['L'], 'm': ['M'], 'n': ['N'], 'p': ['P'], 'r': ['R'], 's': ['S'], 't': ['T'],
  'v': ['V'], 'w': ['W'], 'z': ['Z'], 'ŋ': ['NG'], 'ʃ': ['SH'], 'ʒ': ['ZH'],
  'θ': ['TH'], 'ð': ['DH'], 'tʃ': ['CH'], 'dʒ': ['JH'],
  'æ': ['AE'], 'ɑ': ['AA'], 'ɑː': ['AA'], 'ɒ': ['AA', 'AO'], 'ɔ': ['AO'], 'ɔː': ['AO'],
  'ə': ['AH'], 'ʌ': ['AH'], 'e': ['EH'], 'ɛ': ['EH'], 'eɪ': ['EY'], 'i': ['IY'],
  'iː': ['IY'], 'ɪ': ['IH'], 'oʊ': ['OW'], 'əʊ': ['OW'], 'u': ['UW'], 'uː': ['UW'],
  'ʊ': ['UH'], 'aɪ': ['AY'], 'aʊ': ['AW'], 'ɔɪ': ['OY'], 'ɜː': ['ER'], 'ɝ': ['ER'],
};

// ⚠ A value cell can hold SEVERAL symbols inside one pair of slashes —
// `/ɪ, ə/`, `/r, ʃ, ʒ, dʒl/` — and reading that as a single symbol makes an
// entire rule unverifiable when both of its values were mappable. Split on
// commas INSIDE the slashes, not just between them.
function ipaSymbols(field) {
  const out = [];
  for (const m of String(field || '').matchAll(/\/([^/]+)\//g)) {
    for (const part of m[1].split(',')) {
      const s = part.replace(/[ˈˌ()]/g, '').trim();
      if (s) out.push(s);
    }
  }
  if (/^∅$/.test(String(field || '').trim())) out.push('∅');
  return out;
}

// ⭐ A GRAPHEME CAN SPELL A CLUSTER, NOT JUST A PHONEME. `x` is /ks/, `u` can be
// /juː/, `qu` is /kw/ — two phonemes from one grapheme, which is ordinary
// English and not an edge case. The single-phoneme map cannot express it, so a
// cluster is checked as a SEQUENCE: every phoneme must be mappable, and the word
// must contain them consecutively. Ten `/ks/` rules alone were sitting
// unverifiable for want of this.
function arpaSequences(sym) {
  if (IPA_TO_ARPA[sym]) return IPA_TO_ARPA[sym].map((a) => [a]);
  // Greedily split a cluster into known symbols, longest first.
  const keys = Object.keys(IPA_TO_ARPA).sort((a, b) => b.length - a.length);
  const parts = [];
  let rest = sym;
  while (rest.length) {
    const k = keys.find((x) => rest.startsWith(x));
    if (!k) return null;              // an unknown symbol makes it unverifiable, never refuted
    parts.push(IPA_TO_ARPA[k]);
    rest = rest.slice(k.length);
  }
  if (parts.length < 2) return null;
  // One representative sequence per alternative of the first element is enough
  // for a containment check.
  return [parts.map((p) => p[0])];
}

function containsSequence(pron, seq) {
  for (let i = 0; i + seq.length <= pron.length; i++) {
    let ok = true;
    for (let k = 0; k < seq.length; k++) if (pron[i + k] !== seq[k]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

function exampleWords(field) {
  return String(field || '')
    .split(/[,;]/)
    .map((s) => s.replace(/\(.*?\)/g, '').replace(/[^A-Za-z'-]/g, '').toLowerCase().trim())
    .filter((s) => s.length > 1);
}

async function main() {
  console.log('[phonics] ① the GRAPHEME inventory with context rules — Wikipedia "English orthography" (CC-BY-SA)');
  const { text: wikiJson, reason: wr } = await fetchText(WIKI_API);
  if (!wikiJson) { console.log(`  ABORT — ${wr}`); return; }
  let html;
  try { html = JSON.parse(wikiJson).parse.text['*']; }
  catch (e) { console.log(`  ABORT — unexpected API shape: ${e?.message || e}`); return; }
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);

  // Take EVERY table whose header is the spelling->value shape, not a fixed
  // index. ⛔ An index into someone else's article is a position, and this
  // project has been bitten twice today by treating a position as an identity.
  const gpc = [];
  let tablesUsed = 0;
  for (const t of tables) {
    const rows = parseTableRowspanAware(t);
    if (!rows.length) continue;
    const head = rows[0].map((c) => String(c || '').toLowerCase());
    const isGpc = head.some((c) => /spelling/.test(c)) && head.some((c) => /value/.test(c));
    if (!isGpc) continue;
    tablesUsed++;
    const iSpell = head.findIndex((c) => /spelling/.test(c));
    const iMajor = head.findIndex((c) => /major value/.test(c));
    const iMajorEg = head.findIndex((c) => /examples of major/.test(c));
    const iOther = head.findIndex((c) => /other values|minor values/.test(c));
    const iOtherEg = head.findIndex((c) => /examples of (other|minor)/.test(c));
    for (const r of rows.slice(1)) {
      const spelling = String(r[iSpell] || '').trim();
      if (!spelling) continue;
      // A grapheme cell can list variants: "b, bb" / "d, dd, dh".
      const graphemes = spelling.split(/[,/]/).map((s) => s.replace(/[^a-z-]/gi, '').toLowerCase().trim()).filter(Boolean);
      if (!graphemes.length) continue;
      // The cell after the grapheme is either a CONTEXT RULE or the value
      // itself; a value always contains slashes or the null sign.
      const majorRaw = String(r[iMajor] || '');
      const contextIsHere = majorRaw && !/[/∅]/.test(majorRaw);
      const context = contextIsHere ? majorRaw.trim() : 'elsewhere';
      const major = contextIsHere ? String(r[iMajor + 1] || '') : majorRaw;
      const majorEg = contextIsHere ? String(r[iMajorEg + 1] || '') : String(r[iMajorEg] || '');
      for (const g of graphemes) {
        const values = ipaSymbols(major);
        const others = ipaSymbols(String(r[iOther] || ''));
        if (!values.length && !others.length) continue;
        gpc.push({
          grapheme: g,
          context,
          value: values[0] || null,
          otherValues: [...new Set([...values.slice(1), ...others])],
          examples: exampleWords(majorEg),
          otherExamples: exampleWords(String(r[iOtherEg] || '')),
        });
      }
    }
  }
  console.log(`  ${tablesUsed} spelling->value table(s) parsed -> ${gpc.length} grapheme/context rules`);
  const graphemes = new Set(gpc.map((r) => r.grapheme));
  const multi = new Map();
  for (const r of gpc) {
    if (!multi.has(r.grapheme)) multi.set(r.grapheme, new Set());
    for (const v of [r.value, ...r.otherValues]) if (v) multi.get(r.grapheme).add(v);
  }
  const multiCount = [...multi.values()].filter((s) => s.size > 1).length;
  console.log(`  distinct graphemes: ${graphemes.size}   carrying MORE THAN ONE sound: ${multiCount}`);

  console.log('[phonics] ② the PHONEME ground truth — CMU Pronouncing Dictionary (BSD 2-clause)');
  const { text: licTxt } = await fetchText(CMU_LICENCE);
  const licOk = licTxt && /Redistribution and use in source and binary forms/i.test(licTxt);
  if (!licOk) { console.log('  ABORT — could not read the BSD licence at source; a licence I did not read is not a licence'); return; }
  console.log('  licence verified at source: BSD 2-clause (redistribution with modification permitted)');
  const { text: dictTxt, reason: dr } = await fetchText(CMU_DICT, 120000);
  if (!dictTxt) { console.log(`  ABORT — ${dr}`); return; }
  const pron = new Map();
  for (const line of dictTxt.split(/\n/)) {
    const m = /^([^ (]+)(\([0-9]+\))? (.+)$/.exec(line.trim());
    if (!m) continue;
    const w = m[1].toLowerCase();
    if (!/^[a-z'-]+$/.test(w)) continue;
    if (!pron.has(w)) pron.set(w, []);
    pron.get(w).push(m[3].split(/\s+/).map((p) => p.replace(/[0-9]/g, '')));
  }
  console.log(`  ${pron.size.toLocaleString()} pronounceable words loaded`);

  // ⭐ CHECK THE ENCYCLOPEDIA AGAINST THE DICTIONARY. For each rule, does at
  // least one of its own example words actually contain the claimed phoneme?
  // ⚠ Three outcomes, kept distinct: CONFIRMED, REFUTED, and UNVERIFIABLE (the
  // IPA symbol is not in the partial map above, or no example word is in the
  // dictionary). Collapsing unverifiable into refuted would manufacture errors.
  let confirmed = 0, refuted = 0, unverifiable = 0;
  const refutations = [];
  for (const r of gpc) {
    const arpa = IPA_TO_ARPA[r.value];
    const seqs = arpa ? null : arpaSequences(r.value || '');
    if (!r.value || r.value === '∅' || (!arpa && !seqs)) { unverifiable++; r.check = 'unverifiable'; continue; }
    const egs = r.examples.filter((w) => pron.has(w));
    if (!egs.length) { unverifiable++; r.check = 'unverifiable'; continue; }
    const hit = arpa
      ? egs.some((w) => pron.get(w).some((p) => p.some((ph) => arpa.includes(ph))))
      : egs.some((w) => pron.get(w).some((p) => seqs.some((s) => containsSequence(p, s))));
    if (hit) { confirmed++; r.check = 'confirmed'; }
    // ⛔⛔ A FAILED CLUSTER MATCH IS "UNVERIFIABLE", NEVER "REFUTED", AND THE
    // FIRST VERSION GOT THIS BACKWARDS — refutations jumped 4 → 28 the moment
    // cluster checking was added, and every new one was MY error.
    //
    // The added refutations were r-coloured diphthongs: `ear → /ɪər/ (fear)`,
    // `air → /ɛər/ (cairn)`. ARPAbet writes *fear* as `F IH1 R` — rhotic
    // American English has no separate schwa there — while a greedy split of
    // /ɪər/ demands `IH + AH + R` and cannot match. **The encyclopedia was right
    // and the checker was wrong**, and it was about to publish the opposite.
    //
    // ⚠ So the two outcomes are not symmetric, deliberately: a SINGLE-phoneme
    // mismatch is unambiguous enough to call refuted, while a multi-phoneme
    // sequence carries my own segmentation assumption and can only ever fail
    // "unproven". **An instrument should not accuse a source of an error that
    // lives in the instrument.**
    else if (!arpa) { unverifiable++; r.check = 'unverifiable'; r.note = 'cluster segmentation unproven, not a refutation'; }
    else { refuted++; r.check = 'refuted'; if (refutations.length < 8) refutations.push(`${r.grapheme} [${r.context}] -> /${r.value}/ eg ${egs.slice(0, 3).join(',')}`); }
  }
  console.log(`  rules CONFIRMED by attested pronunciation : ${confirmed}`);
  console.log(`  rules REFUTED                             : ${refuted}`);
  console.log(`  rules UNVERIFIABLE (symbol or word absent) : ${unverifiable}`);
  for (const x of refutations) console.log(`     refuted: ${x}`);

  // ⛔⛔ THE TAIL WAS CONTAMINATED AND THE HEADLINE COUNT WAS INFLATED. Both were
  // found by printing the rules for two graphemes and reading them (2026-09-02).
  //
  // Three separate defects, none of which errored:
  //   ① DUPLICATES — every rule appeared 2-5 times (`sh [elsewhere]` five
  //      times), because the article carries several spelling->value tables that
  //      overlap and a grapheme cell can list variants. **411 was never 411
  //      distinct rules.**
  //   ② A LEAKED GRAPHEME — `a -> /w/` with other values `/k/ /ɡ/ /ŋ/` and no
  //      examples. Those belong to the `qu`/`x`/`ng` family; a row with no
  //      spelling cell of its own had inherited `a`.
  //   ③ NULL-VALUED RULES kept alive by a non-empty other-values column.
  //
  // ⭐ THE BAR THAT FIXES ALL THREE AT ONCE, and it costs nothing: **a rule must
  // have at least one example word that is IN THE DICTIONARY.** A rule with no
  // checkable example cannot generate a teaching question anyway, so requiring
  // one removes every piece of junk above without discarding anything usable —
  // and it makes the published count mean "rules a generator can actually use"
  // instead of "rows I scraped".
  //
  // ⚠ The drop is REPORTED, not silent. A cleaner that quietly halves its own
  // output is the same defect as an instrument that lies about coverage.
  // ⚠ THE DEDUPE KEY MUST NOT INCLUDE `otherValues`, AND INCLUDING IT IS WHY
  // `sh` KEPT FIVE COPIES: those five were identical in grapheme, context, value
  // and examples and differed ONLY in the garbage other-values column, so a key
  // containing it made every duplicate look distinct. **A dedupe key built from
  // an unreliable field does not dedupe.**
  //
  // ⚠ Its separators are NUL bytes rather than spaces — unintended, harmless as
  // a separator (a NUL cannot occur in the data being joined), and left alone
  // rather than churned. Recorded because it is a landmine for the next reader:
  // **the file parses fine and `grep` reports it as binary**, which is how the
  // three of them went unnoticed until an editor could not match the line.
  const seen = new Set();
  const kept = [];
  let droppedDupe = 0, droppedNoExample = 0;
  for (const r of gpc) {
    const key = `${r.grapheme} ${r.context} ${r.value} `;
    if (seen.has(key)) { droppedDupe++; continue; }
    seen.add(key);
    const usable = r.examples.filter((w) => pron.has(w));
    if (!r.value || !usable.length) { droppedNoExample++; continue; }
    // ⛔⛔ `otherValues` IS DROPPED, NOT SHIPPED WITH A CAVEAT — IT WAS HALF
    // GARBAGE AND HALF OF IT WOULD HAVE BECOME EXAM QUESTIONS.
    //
    // Audited: **53 of its 107 entries are not phonemes at all** — `s h`,
    // `z h`, `ph`, `kn`, `zw`, `tθ`, `th`. They are spelling fragments and
    // mis-split cells, produced because the other-values column sits at a
    // different index on digraph rows and my reader took whatever was there.
    // `sh` came out as `ʃ s h z h s ʃ ʃ h s`.
    //
    // ⭐ AND NOTHING IS LOST, WHICH IS WHY THIS IS A DELETION RATHER THAN A
    // WARNING LABEL. The trustworthy multi-sound evidence was never in that
    // column: it is **several RULES per grapheme, each with its own context and
    // its own example words** — `c` is /s/ before e,i,y (*city*), /ʃ/ before
    // unstressed ea,ia (*ocean*), /k/ elsewhere (*cat*). That path is the one
    // checked against the dictionary, and it gives **52 graphemes with more than
    // one primary value**. A field that is 50% noise cannot be fixed by telling
    // the reader it might be wrong.
    const { otherValues, otherExamples, ...clean } = r;
    kept.push({ ...clean, examples: usable });
  }
  const keptGraphemes = new Set(kept.map((r) => r.grapheme));
  const keptMulti = new Map();
  for (const r of kept) {
    if (!keptMulti.has(r.grapheme)) keptMulti.set(r.grapheme, new Set());
    if (r.value && r.value !== '∅') keptMulti.get(r.grapheme).add(r.value);
  }
  const keptMultiCount = [...keptMulti.values()].filter((s) => s.size > 1).length;
  console.log(`  CLEANED — dropped ${droppedDupe} duplicate(s) and ${droppedNoExample} rule(s) with no dictionary-checkable example`);
  console.log(`  KEPT ${kept.length} usable rules over ${keptGraphemes.size} graphemes · ${keptMultiCount} carrying more than one sound`);

  if (process.argv.includes('--verify')) { console.log('[phonics] --verify: nothing written'); return; }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'gpc.json');
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({
    version: 1,
    note: 'Systematic grapheme->phoneme correspondences with context rules. The grapheme inventory and context rules come from Wikipedia "English orthography" (CC-BY-SA); every rule is checked against the CMU Pronouncing Dictionary (BSD 2-clause) and carries its own verdict. NOT hand-authored.',
    sources: [
      { what: 'grapheme inventory + context rules + example words', url: 'https://en.wikipedia.org/wiki/English_orthography', licence: 'CC-BY-SA' },
      { what: 'phoneme ground truth per word (verification)', url: 'https://github.com/cmusphinx/cmudict', licence: 'BSD-2-Clause' },
    ],
    counts: {
      rules: kept.length,
      graphemes: keptGraphemes.size,
      multiSound: keptMultiCount,
      confirmed, refuted, unverifiable,
      // ⚠ Published so the kept count can never be mistaken for the scraped
      // count. Every rule here has a dictionary-checkable example word.
      scrapedBeforeCleaning: gpc.length,
      droppedDuplicate: droppedDupe,
      droppedNoCheckableExample: droppedNoExample,
    },
    rules: kept,
  }, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  console.log(`[phonics] DONE — ${kept.length} usable rules over ${keptGraphemes.size} graphemes -> corpora/phonics/gpc.json`);
}

await main();
