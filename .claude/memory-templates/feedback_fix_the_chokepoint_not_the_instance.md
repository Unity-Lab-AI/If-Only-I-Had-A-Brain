---
name: feedback_fix_the_chokepoint_not_the_instance
description: "Gee corrected the same narrow-scope failure twice in one war — fix the PATTERN at the chokepoint all instances flow through, never just the instance under your hands."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-22T11:24:57.382Z
---

Twice in the 2026-08-21/22 gate war, a fix landed only on the instance being debugged and Gee had to demand the rest: *"u only did kindergarden"* (sync gate propagates — the real fix was the SHARED curriculum.js helpers every grade rides) and *"why did you not do all phases, all cells, all grades, all ciriculum?"* (verdict-sticking wired into the math gate only — the real fix was ONE edit at the CELL DONE chokepoint every subject × grade exits through).

**Why:** debugging tunnel vision — the fix ships where the reproduction happened, and "does this pattern exist elsewhere?" never gets asked.

**How to apply:** before shipping any fix, ask two questions: (1) *where do ALL instances of this pattern converge?* — grep for the chokepoint (shared helper, single exit path, one dispatcher) and fix THERE if one exists; (2) if no chokepoint exists, grep the pattern across the tree and fix every site in the same batch (the GATECHUNK sweep model). The codebase strongly favors chokepoints (`_probePropagate`, `_crossRegionHebbian`, `_cellRunner`'s CELL DONE tail, `_sparseSendBinary`) — one edit there beats N parallel patches every time. Related: [[feedback_checkout_develop_after_cascade]].
