---
name: feedback_reprice_before_removing_a_gate
description: ⛔ Never remove/weaken a gate or bound until corpus × reps × scale × visits is recomputed and written down; the consolidation gate is the ONLY thing keeping the walk finite
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-20T14:31:17.545Z
---

⛔ **Re-price the walk BEFORE removing a gate.** No gate, bound, or dedup that keeps the walk finite may be removed, bypassed or weakened until **`corpus × reps × scale × visits`** has been recomputed and written into the commit + the ledger.

**Why:** on 2026-08-20 `art/kindergarten` held ONE phase for **21.2 hours** and could not complete. Nothing was broken — three individually-justified changes had compounded and **nobody multiplied them together**: corpus 2,888 sentences → 11,436 transitions × reps 100 × ~47ms per pair-teach at 12M neurons = **14.9h in a single call**, inside a phase that runs in **114 cells** ⟹ ~100 days of refresh alone. The failure mode is arithmetic, and arithmetic is invisible in a diff.

**How to apply:**
- Gee removed the 20-minute phase budget the same day it shipped (*"some cells are big they take the length of time they take"*) and restored `STRUCTURE_DOSE` to 1.0. **That is his call — the rule is not "keep the gate", it is "do the multiplication first".**
- **As of 2026-08-20 the consolidation gate is the ONLY thing keeping the walk finite** (`cluster._mechanicsProbeRate`: full depth on first teach / on a regression / every 10th visit, cheap top-up otherwise). Measured: ~24 days of structure-refresh across K→PhD with it, ~100 days without.
- Say out loud which side of the line a change is on: **dedup of literal duplicates with frequency preserved = waste removal (always fine); a dose multiplier = less teaching (needs Gee)**. See [[feedback_say_fix_not_cut]].
- **Verify an escape hatch by RUNNING it, never by reading its comment.** `DREAM_PHASE_BUDGET_MS=0` was documented as "disables the bound" and actually computed `Date.now() + 0` — truthy and instantly expired — so it produced the harshest possible cut (one rep per phase) while the log said the bound was off.
- Multiply a per-unit cost by its call site's REAL frequency: 32s per unit sounds small until it fires per word and adds 70 minutes to a cell.
- A silent cap is worse than a loud one. If a bound trims training, it prints what it trimmed. See [[feedback_no_fallbacks_law]].
