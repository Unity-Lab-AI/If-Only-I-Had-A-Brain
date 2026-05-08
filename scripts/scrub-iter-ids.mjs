// One-shot scrub of internal iter25-X.Y / K.N markers from session-touched
// source comments. Code comments are public/shared text; workflow markers
// belong in TODO.md / FINALIZED.md / commits.
//
// Strategy:
//   1. Lines whose only purpose was an iter ID prefix (e.g. "// iter25-X.Y" or
//      "// iter25-X.Y — description") get the prefix stripped, keeping the
//      description if present.
//   2. Inline mentions ("per iter25-X.Y" / "(iter25-X.Y)") get deleted with
//      surrounding whitespace cleaned up.
//   3. Bare K.N labels in comments (e.g. "// K.4 hubs") become descriptive
//      ("// hub neurons") via the K-mapping table.
//   4. T-numbers and Gee references are NOT touched here — they live under
//      different LAW scopes and have their own scrub history.
//
// Idempotent: rerunning produces no further changes.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(process.cwd());
const FILES = [
  'js/brain/cluster.js',
  'js/brain/curriculum.js',
  'js/brain/sparse-matrix.js',
  'js/brain/k-vocabulary.js',
  'js/brain/global-workspace.js',
  'server/definition-service.js',
  'js/brain/curriculum/kindergarten.js',
  'js/brain/language-cortex.js',
  'js/brain/remote-brain.js',
  'js/brain/engine.js',
  'js/ui/brain-3d.js',
  'server/brain-server.js',
  'dashboard.html',
  // Full-repo scrub: iter IDs from earlier sessions are also LAW-banned
  // from source per the task-numbers-placement rule. app.js carries
  // legacy iter25-E / iter25-G / iter25-E.5 references; bundle rebuilds
  // from app.js so the matching bundle hits clear too.
  'js/app.js',
];

// Public HTML docs that the LAW also bans iter IDs from. Treated separately
// because their "comments" are visible <li>/<strong>/<p> body content
// rather than // line comments.
const PUBLIC_HTMLS = [
  'html/brain-equations.html',
  'html/unity-guide.html',
];

// K-numbered labels → descriptive feature names. Used to scrub bare K.N
// references in comments to match the iter25-K cortical microstructure
// design. K.1-K.9 from the cortex spec.
const K_MAP = {
  'K.1': 'small-world topology',
  'K.2': 'microcolumns',
  'K.3': 'six-layer lamination',
  'K.4': 'hub neurons',
  'K.5': 'within-column voltage coherence',
  'K.6': 'topographic cross-projections',
  'K.7': 'theta-gamma oscillations',
  'K.8': 'hierarchical cluster organization',
  'K.9': 'per-layer plasticity',
};

let totalFiles = 0;
let totalChanges = 0;

for (const rel of FILES) {
  const path = join(ROOT, rel);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (err) { console.warn(`skip ${rel}: ${err.message}`); continue; }

  const before = text;

  // 1. Leading-prefix scrub on comment lines:
  //    "// iter25-X.Y — description"   → "// description"
  //    "// iter25-X.Y.Z — description" → "// description"
  //    "// iter25-X.Y description"     → "// description"
  //    "// iter25-X — description"     → "// description"  (bare letter)
  //    "// iter25-X.Y"                 → "" (entire empty comment line removed)
  // Em-dashes: — (U+2014), – (U+2013), -- (double-hyphen).
  text = text.replace(
    /^([ \t]*\/\/[ \t]*)iter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}([ \t]*[—–-]+[ \t]+|[ \t]+|$)/gm,
    (match, prefix, sep) => {
      // If `sep` is end-of-line / empty, drop the whole line by emitting
      // an empty comment placeholder; otherwise keep the comment prefix
      // and continue with the description.
      if (!sep || /^[ \t]*$/.test(sep)) return prefix.replace(/\/\/[ \t]*$/, '//');
      return prefix;
    }
  );

  // 2. Inline mentions inside comments:
  //    "per iter25-X.Y" → "" (drop the qualifier)
  //    "(iter25-X.Y)"   → "" (drop the parenthetical)
  //    "iter25-X.Y"     → "" (drop the bare reference)
  // Only inside // line comments / /* */ block comments to avoid
  // mangling string literals or identifiers. {0,3} matches both
  // "iter25-X" (no dot) and "iter25-X.Y[.Z]" forms.
  text = text.replace(
    /(\/\/[^\n]*?)\bper iter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}\b/g,
    '$1'
  );
  text = text.replace(
    /(\/\/[^\n]*?)\s*\(iter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}\)/g,
    '$1'
  );
  text = text.replace(
    /(\/\/[^\n]*?)\biter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}\b/g,
    '$1'
  );
  // Block-comment variant.
  text = text.replace(
    /(\/\*[\s\S]*?\*\/)/g,
    (block) => block
      .replace(/\bper iter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}\b/g, '')
      .replace(/\s*\(iter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}\)/g, '')
      .replace(/\biter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}\b/g, '')
  );

  // HTML comments + JSX/HTML attribute strings — apply only to <!-- --> blocks.
  text = text.replace(
    /(<!--[\s\S]*?-->)/g,
    (block) => block
      .replace(/iter25-[A-Z](?:\.[A-Za-z0-9]+){0,3} \+ /g, '')
      .replace(/iter25-[A-Z](?:\.[A-Za-z0-9]+){0,3} — /g, '')
      .replace(/\biter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}\b\s*/g, '')
  );

  // 3. K-mapping inside comments. Only inside line comments to avoid
  // accidentally rewriting code that happens to contain "K.4" tokens.
  text = text.replace(
    /(\/\/[^\n]*?)\b(K\.[1-9])\b/g,
    (m, prefix, key) => prefix + (K_MAP[key] || key)
  );

  // Tidy up: collapse double-blank lines created by line drops, and trim
  // trailing whitespace introduced by removed inline mentions.
  text = text.replace(/^([ \t]*\/\/[ \t]*)$/gm, '');
  text = text.replace(/[ \t]+$/gm, '');
  // Don't collapse arbitrary multi-blank-line runs — preserve original
  // file structure as much as possible.

  if (text !== before) {
    writeFileSync(path, text, 'utf8');
    const diff = (before.match(/iter25-[A-Z](?:\.[A-Za-z0-9]+){1,3}/g) || []).length
               - (text.match(/iter25-[A-Z](?:\.[A-Za-z0-9]+){1,3}/g) || []).length;
    console.log(`${rel}: removed ${diff} iter ID references`);
    totalFiles += 1;
    totalChanges += diff;
  }
}

// Public-HTML pass: aggressive scrub on body content because iter IDs
// here are visible to anyone opening the HTML in a browser, not just to
// code readers. Patterns handled:
//   <strong>iter25-X.Y — TEXT</strong> → <strong>TEXT</strong>
//   <strong>iter25-X.Y/X.Z TEXT</strong> → <strong>TEXT</strong>
//   <strong>iter25-X — TEXT</strong>   → <strong>TEXT</strong>
//   (iter25-X.Y)                       → ""
//   (iter25-X.Y description)           → "(description)"
//   "per iter25-X.Y"                   → ""
//   "post-iter25-X.Y"                  → ""
//   "iter25-X.Y multiplies"            → "It multiplies" (sentence-start)
//   bare "iter25-X.Y"                  → ""
const ITER_RE = /iter25-[A-Z](?:\.[A-Za-z0-9]+){0,3}/.source;
for (const rel of PUBLIC_HTMLS) {
  const path = join(ROOT, rel);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (err) { console.warn(`skip ${rel}: ${err.message}`); continue; }

  const before = text;

  // <strong>iter25-X.Y[/X.Z][/...] [—|-|.] TEXT</strong>
  text = text.replace(
    new RegExp(`(<strong>)${ITER_RE}(?:\\/[A-Z]?\\.[A-Za-z0-9]+)*[ \\t]*[—–-]?[ \\t]*`, 'g'),
    '$1'
  );
  // (iter25-X.Y reread of iter25-X.Y) and similar parentheticals — strip
  // the entire parenthetical when its text is dominated by iter IDs.
  text = text.replace(
    new RegExp(`[ \\t]*\\([^)]*${ITER_RE}[^)]*\\)`, 'g'),
    (m) => {
      // Keep the parenthetical only if the non-iter-ID portion contains
      // something more than connecting words. Simple heuristic: if the
      // remaining text after stripping iter IDs is < 12 chars or only
      // connectors, drop the whole thing.
      const stripped = m.replace(new RegExp(ITER_RE, 'g'), '').replace(/^[ \t(]+|[ \t)]+$/g, '');
      const meaningful = stripped.replace(/\b(reread|of|per|see|cf\.?|and|the|a|to)\b/gi, '').trim();
      if (meaningful.length < 8) return '';
      return ' (' + stripped.replace(/\s{2,}/g, ' ').trim() + ')';
    }
  );
  // "per iter25-X.Y" / "post-iter25-X.Y" qualifiers in flowing text.
  text = text.replace(new RegExp(`[ \\t]*per ${ITER_RE}`, 'g'), '');
  text = text.replace(new RegExp(`[ \\t]*post-${ITER_RE}`, 'g'), '');
  // Sentence-start bare reference: "iter25-X.Y verb ..." → "It verb ..."
  text = text.replace(
    new RegExp(`(\\.[ \\t]+|>\\s*|^\\s*)${ITER_RE}([ \\t])`, 'g'),
    '$1It$2'
  );
  // Bare reference anywhere else.
  text = text.replace(new RegExp(`\\b${ITER_RE}\\b`, 'g'), '');
  // Tidy: collapse leftover whitespace introduced by removals.
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/[ \t]+([.,;:])/g, '$1');
  text = text.replace(/<strong>[ \t]*/g, '<strong>');

  if (text !== before) {
    writeFileSync(path, text, 'utf8');
    const diff = (before.match(new RegExp(ITER_RE, 'g')) || []).length
               - (text.match(new RegExp(ITER_RE, 'g')) || []).length;
    console.log(`${rel}: removed ${diff} iter ID references (public HTML)`);
    totalFiles += 1;
    totalChanges += diff;
  }
}

console.log(`\nDone. Modified ${totalFiles} files, removed ${totalChanges} iter ID references.`);
