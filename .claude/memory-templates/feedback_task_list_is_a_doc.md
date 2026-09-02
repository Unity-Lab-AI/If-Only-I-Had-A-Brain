---
name: feedback_task_list_is_a_doc
description: "Test TaskCreate once at session start; docs/TODO.md is the ONE board — OPEN-TASKS.md and BOARD.md were deleted 'one board, not three'"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-25T13:53:54.807Z
---

**FIRST ACTION EVERY SESSION: call `TaskCreate` once.** Gee has asked for the CLI task-list panel many times and it kept getting answered with a markdown list, which is not what he means. As of 2026-08-20 the tools are genuinely absent — `ToolSearch` for `TaskCreate` / `TaskUpdate` / `TodoWrite` answers *"No matching deferred tools found"*, tested twice that day — and `todoFeatureEnabled: true` was already set in `.claude/settings.json`, so **that key alone is not the lever**; the verdict needs a CLI relaunch. **Test it, don't recall it.**

⛔ **CORRECTED 2026-08-25 — `docs/OPEN-TASKS.md` AND `docs/BOARD.md` NO LONGER EXIST.** Both were deleted in commit `dda1bb17`, message: *"docs: delete BOARD.md + OPEN-TASKS.md - one board, not three"*. **`docs/TODO.md` is the single board.** The earlier version of this memory told me to update `OPEN-TASKS.md` in the same pass as every `TODO.md` edit — following that today would have meant recreating a file Gee deliberately removed.

**Why the deletion was right:** three files holding the same list meant two derived views that nothing refreshed, and a derived view that nothing refreshes is a lying instrument — the exact defect class this repo keeps paying for. One board cannot disagree with itself.

**How to apply:**
- Edit `docs/TODO.md` and nothing else. There is no second list to sync.
- ⛔ **Do not recreate `OPEN-TASKS.md` or `BOARD.md`**, and do not treat their absence as an oversight to fix.
- Closed items STAY in `docs/TODO.md` with the status marker flipped to `[x]` and a `✅ CLOSED` summary prepended — every word of the original description is preserved (see [[feedback_never_delete_todo_info]]), with the full entry going to `docs/FINALIZED.md` first (see [[feedback_finalized_before_delete]]).
- Don't trust a derived count — re-count against the board. Two false reads happened on 2026-08-20 alone: `BAND1300.1` was invisible to the ID pattern (extra text inside the bold ID), and `DELTAIDX.9` landed in a close pile because BOARD.md's own *"must not be closed"* warning sentence parsed as tier membership.
- A standing instruction (like this one) belongs in memory, not as an open board item — a rule on a task board is a line that can never be finished.
- ⭐ The general lesson: **a memory that names a file must be checked against the tree before it is acted on.** This one aged into an instruction to rebuild deleted work.
