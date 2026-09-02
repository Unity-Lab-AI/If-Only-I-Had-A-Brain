---
name: feedback_crlf_curriculum_files_edit_tool
description: "Some curriculum files (e.g. grade1.js) have CRLF/mixed line endings — the Edit tool's multi-line old_string matches fail; use SINGLE-LINE Edit anchors (scripts are banned)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 76a03535-080a-440b-9e18-e99af24e1fdc
  modified: 2026-08-20T12:39:15.838Z
---

`js/brain/curriculum/grade1.js` (and likely other per-grade files) has **CRLF / mixed line endings** — at least one stray lone `\r` mid-file (observed `  }\r,`). The **Edit tool fails to match multi-line `old_string`** against these files even when the text looks byte-identical in Read output (Read strips `\r`). Single-line / short edits sometimes work; large multi-line blocks reliably fail with "String to replace not found."

`js/brain/curriculum.js` itself is LF-clean — Edit works there normally.

**Why:** the Read tool normalizes `\r` away, so the `old_string` you copy from Read output has `\n` but the file has `\r\n` (or a stray `\r`), so the literal match misses. The tool's note "tried swapping \uXXXX escapes; mismatch likely elsewhere" is the tell.

**How to apply (SUPERSEDED 2026-08-20 — the Python-script route is BANNED, see [[feedback_no_scripts_for_edits]]):** use **single-line `old_string` anchors** with the Edit tool — one Edit per line, as many calls as it takes. A single line carries no embedded `\n`, so the CRLF mismatch never arises; this is how the CRLF docs (`docs/TODO.md`, `docs/FINALIZED.md`, `docs/BOARD.md`) get edited now. Pick an anchor unique in the file, and use `Write` for a whole-file replacement when the edit is that big. Verify after with `node --check` + the ESM `import()` check ([[feedback_verify_esm_with_import_not_node_check]]).
