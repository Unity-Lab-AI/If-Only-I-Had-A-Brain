---
name: tasklist-completions-preserved-never-removed
description: "Completed tasks in the harness TaskList stay CHECKED OFF (status=completed), never set to deleted, never removed from view. The task list scrolls to current work-in-progress but historical completions remain visible above for context + audit trail. Same rule as TODO.md/FINALIZED.md \"never delete info\" — applied to the live harness tasklist too."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b128daab-9e1a-4697-8867-1ab55f337e9d
---

⛔ **NEVER set status=deleted on a completed task.** ⛔

Same principle as `docs/TODO.md` "NEVER Delete TODO Info — change status ONLY, keep all descriptions" but applied to the live **harness TaskList** (TaskCreate/TaskUpdate/TaskList tool surface).

**Why:** (a) Operator monitors progress by scrolling the live tasklist — historical completions show what work has landed in this session. (b) Removing completed entries breaks the audit trail. (c) The tasklist is a SCROLL not a queue — past work stays visible above current work, current work-in-progress shows where focus is now.

**How to apply:**

- ✅ Set status=`completed` when work finishes. Leave the entry visible.
- ✅ Set status=`in_progress` on the next task. Operator can see the scroll/focus shift naturally.
- ❌ Set status=`deleted` on a completed task — destroys audit trail.
- ❌ Delete + recreate as a fresh task to "clean up" the list — never. Keep the completion history.
- ❌ Truncate or compress the tasklist by removing old completed entries when new ones come in — never.

The ONLY case for status=`deleted` is when a task was created in ERROR (wrong subject, duplicate, mis-typed) and has never been started. Once a task has been worked on, status moves `pending` → `in_progress` → `completed` and STAYS at completed.

**Violation history:**

- 2026-06-17: Operator caught Claude potentially confused about TaskList lifecycle. Operator: *"AND YOU DO NOT REMOVE COMPLETIONS FROM THE TASKLIST YOU ONLY CHECK THEM OFF AND SCROLLL IT TO CURRENT WORK"*. Reinforces that completed entries are permanent in the tasklist view.

**Related rules:**
- [[feedback_never_delete_todo_info]] — same principle, applied to docs/TODO.md
- [[feedback_finalized_before_delete]] — write FINALIZED entry first, change status only, never delete original
