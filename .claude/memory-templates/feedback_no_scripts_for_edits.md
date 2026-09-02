---
name: feedback_no_scripts_for_edits
description: ⛔ Never write a script to edit code/files/docs — use Edit/Write directly; any temp script gets deleted the moment it has run
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-25T14:47:28.298Z
---

⛔ **STOP using scripts to edit code, files, or the stack.** Gee, 2026-08-20 (verbatim): *"STOP using scripts to do everything and get rid of all these shit scripts we dont use and were only for fixing,editing, temp use. They are taking up space for shit we will never use again, and in the future delet them asfter u use them, but like i said stop using scripts to edit code, files,and the stack"*

**Why:** one-shot Python/mjs patchers (`patch-*.py`, `tu29*-edit.py`, `docs-sync-*.py`, `finalize-*.py`, `write-*.py`) had piled up to **49 files in `scripts/`** — dead weight for edits that should have been made directly, unreadable in review, and each one an extra thing that can lie about what it did. 26 one-shot patchers + 23 stale verify/smoke harnesses were deleted that day; six survivors: the two gatling press files, `stamp-version.mjs`, `unity-chat-hold.mjs`, `unity-say-live.mjs`, `vox-build-bank.mjs`.

**How to apply:**
- Edit files with the **Edit / Write tools**, not a generated script. Multiple edits = multiple Edit calls.
- CRLF is NOT an excuse — see [[feedback_crlf_curriculum_files_edit_tool]]: use **single-line** `old_string` anchors on CRLF/mixed files instead of reaching for Python.
- ⛔ **RE-BROKEN 2026-08-25, and the shape of the lapse is the thing to remember: an INLINE `python - <<'PY'` heredoc that read a file, asserted each replacement was unique, substituted 4 strings and wrote it back.** It never touched `scripts/`, left nothing in the tree, and every edit was correct — which is exactly why it *felt* exempt. **It is not.** The rule is about the METHOD, not about whether a file is left behind: a heredoc is unreviewable, its assertions are invisible in the diff, and `newline=''`/encoding handling is one slip away from rewriting a whole file's line endings (it didn't — 950/950 CRLF verified after — but that was luck, not care). **4 near-identical text substitutions is 4 Edit calls, and the tedium IS the review.**
- ⚠ The tell to watch for: *"this is just a bulk text swap, a script is tidier"*. Tidier for me, opaque for Gee. If the count feels too high for Edit calls, that is a signal the change needs to be smaller, not that the tool needs replacing.
- If a script is genuinely the only way (bulk mechanical sweep across hundreds of files), say so first, and **delete it in the same commit that uses it**. Never leave it in the tree.
- No new `verify-*` / `smoke-*` / `*-test` harnesses at all — that is also the NO TESTS LAW ([[feedback_read_workflow_files]]).
- Generated docs are the same disease one level up: `docs/OPEN-TASKS.md` is hand-maintained now, not regenerated — see [[feedback_task_list_is_a_doc]].
- ⛔ **Before deleting any file, grep the STEM and the directory, not just the filename.** `docs/DECOMPOSED-curriculum-build.md` returned ZERO hits by filename and was one keystroke from deletion — the hooks and the yolo agent read that tier by PATTERN (`DECOMPOSED`). An unreferenced-by-NAME file is not proof of an orphan. Same error class as reporting a field without reading its definition.
- Enforcement is a REPORT, not a blocker: `.claude/hooks/session-start-env-dump.cjs` names untracked / patcher-shaped files in `scripts/` at session start. A PreToolUse guard that silently eats a legitimate write is the failure class this whole ledger is about.
