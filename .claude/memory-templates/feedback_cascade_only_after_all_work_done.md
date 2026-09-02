---
name: cascade-only-after-all-work-done
description: "Push/cascade fires ONLY at the very end — after ALL open TODO items in the batch are code-complete AND docs are synced; never mid-batch, never on a partial task list."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1c5c508c-9223-4e00-aa29-04c8a2dc5400
---

Gee verbatim (2026-07-10): "no ther are still a shit ton of open item work before docs and only after docs do we push you fool"

**Why:** "end after doc push and then cascade" means the sequence END = (finish ALL open item work) → (doc sync) → (push) → (cascade). Cascading with tracker items still open shipped a partial batch to main/develop mid-session. The batch is the unit of shipping, not the individual task.

**How to apply:** When Gee authorizes a branch + cascade, treat it as the END-OF-BATCH protocol: keep working every open item on the feature branch first; docs banner/sync commit comes after the LAST code item; push the feature branch, then cascade develop → main, exactly once, at the end. If unsure whether the batch is done, it isn't — keep working. Related: [[docs-before-push]] / feedback_docs_before_push.
