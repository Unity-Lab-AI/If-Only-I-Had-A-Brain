---
name: feedback_verify_esm_with_import_not_node_check
description: node --check does NOT catch duplicate ESM bindings / many module errors — verify ESM files with a real import()
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 76a03535-080a-440b-9e18-e99af24e1fdc
---

`node --check <file.js>` is NOT sufficient verification for ES-module files (anything using `export`/`import`). It passed clean on `js/brain/curriculum.js` while the file actually had TWO `export const GRADE_ORDER` declarations — a duplicate ESM binding that makes the whole module fail to LOAD with `SyntaxError: Identifier 'GRADE_ORDER' has already been declared`. The bug shipped to the working tree and went unnoticed across multiple `node --check` passes (caught only by a super-review that ran a real import). 2026-06-18.

**Why:** `node --check` does a parse-only syntax check and does not run ESM binding/link validation, so duplicate top-level declarations, bad import specifiers, and other link-time errors slip through. A broken curriculum.js means the entire brain-training pipeline can't load — a silent shipstopper.

**How to apply:** After editing any ESM file in this repo, verify with a real module load, NOT just `node --check`:
`node --input-type=module -e "import('./path/to/file.js').then(()=>console.log('OK')).catch(e=>console.log('FAIL:',e.message))"`
(per LAW.I.15 still NEVER `require()` the server — use dynamic `import()` of the specific module). Especially after adding a new top-level `export const` — first grep the file for an existing declaration of that identifier before adding one. Relates to [[feedback_no_fallbacks_law]] (code-it-right-the-first-time means verify it actually loads).
