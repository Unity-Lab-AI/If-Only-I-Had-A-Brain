// server/self-code-inventory.js — the DRIFT-PROOF half of the self-code lane.
// Its sibling's mechanism table is authored content
// and will age as files change; this module reads her ACTUAL source tree at
// call time (fs — server-only, attached onto the cluster the same way
// life-curriculum.js attaches story loaders, so browser-bundled curriculum
// code never imports fs).
//
// Returns speakable file STEMS only (a stem she could actually say —
// letters/hyphens, sane length), bounded, deduped, deterministic order.
// Cached per boot: her tree does not change while she runs.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['js/brain', 'js/brain/mindspace', 'js/brain/cluster', 'server', 'server/brain-server'];
const MAX_STEMS = 40;

let _cache = null;

function inventory() {
  if (_cache) return _cache;
  const stems = new Set();
  let files = 0;
  for (const rel of SCAN_DIRS) {
    let names = [];
    try { names = fs.readdirSync(path.join(ROOT, rel)); } catch { continue; }
    for (const n of names) {
      if (!/\.(js|mjs|cjs)$/.test(n)) continue;
      files++;
      const stem = n.replace(/\.(js|mjs|cjs)$/, '').toLowerCase();
      // speakable: plain words/hyphenations she can say; drop bundles/workers
      if (!/^[a-z][a-z-]{2,20}$/.test(stem)) continue;
      if (/bundle|worker/.test(stem)) continue;
      stems.add(stem);
      if (stems.size >= MAX_STEMS) break;
    }
    if (stems.size >= MAX_STEMS) break;
  }
  _cache = { stems: [...stems].sort(), files, at: Date.now() };
  return _cache;
}

module.exports = { inventory };
