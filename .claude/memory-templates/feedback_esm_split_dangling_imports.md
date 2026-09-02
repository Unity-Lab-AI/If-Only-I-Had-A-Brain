---
name: feedback_esm_split_dangling_imports
description: ESM file-splits (P4.x) leave used-but-unimported helper refs that crash the server but are hidden by node --check AND the esbuild bundle
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 77bc4400-a6b0-4314-baba-534597d9a6fb
---

When methods are moved out of a god-class into per-concern ESM modules (the P4.1 curriculum→grade-files, P4.2 cluster→cluster/*.js, P4.3 brain-server→brain-server/*.js splits), the moved method's module-level helper references (e.g. `normalizeSubject`, `wordMotorBandName`, `SUBJECTS` from `subjects.js`) are NOT automatically carried over — the new module must add its own `import`. Missing ones throw `ReferenceError: X is not defined` **at call time**, crashing the server-side walk / live chat.

**Why:** the free variable resolves against the module where the method is now DEFINED (the new split file), not where it was originally written. The new file's scope lacks the helper.

**Two things hide this — both gave false confidence in this project:**
- `node --check` only checks syntax, never resolves cross-module references → passes clean.
- The esbuild browser bundle flattens ALL modules into ONE scope (helpers appear deduped as `normalizeSubject2` etc.), so the bundle WORKS even when the ESM source is broken. The **server runs ESM source**, so only it crashes.

**How to apply:** after any ESM file-split, for each moved method's module, statically check every referenced identifier that is NOT (locally declared | imported | JS global | `this.`/param) against sibling-module exports → add the missing import. Verify with real `import()` of the entry module (per [[feedback_verify_esm_with_import_not_node_check]]), not just `node --check`. Confirmed crashers fixed 2026-06-19: `kindergarten.js` + `cluster/emit.js` (both missing `subjects.js` imports). Broad audit of all split modules was still open (FINAL CODE CHECK FC.1 / harness task #13).
