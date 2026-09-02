---
name: feedback_dont_promote_unestablished_to_preexisting
description: "When you suspect your own change and can't find the mechanism, keep looking — never upgrade \"unestablished\" into \"probably pre-existing.\""
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2795d08d-2d70-4a62-a0ac-2b9e2da25fb6
  modified: 2026-08-30T20:33:10.920Z
---

When a regression appears right after my change and I suspect my change but cannot name the mechanism, the honest statement is **"I suspect my change, I cannot yet name how"** — not "it's not established, probably pre-existing."

2026-08-30: all 16 cross-projection rebinds started timing out immediately after my `SHADOWCOST.3` press. I suspected my build first — correctly. I couldn't find the mechanism, so I retracted toward "pre-existing," and as *support* I cited a previous-boot console snapshot that **I had myself already labelled as taken too early to prove anything**. The cause was mine: a `case` inserted into a fall-through chain (see [[feedback_switch_fallthrough_insertion]]). I found it fifteen minutes later by continuing to look.

**Why it matters:** a wrong "pre-existing" verdict is worse than no verdict. It retires a live, correct lead, and it aims the next investigation at the wrong component — in this case the donor binary, which was innocent and would have cost a Rust change and a release to "fix."

**How to apply:** timing correlation with my own change is real evidence, not a hunch — keep it on the table until a mechanism is found or the change is reverted and the symptom persists. Weak evidence I've already flagged as weak cannot be recycled as support for the opposite conclusion. State confidence separately from conclusion, and prefer "suspected, mechanism unknown" over a comfortable verdict. Reverting to test is cheaper than a wrong attribution.

Counterpart to the retraction discipline in [[feedback_fix_the_chokepoint_not_the_instance]] — retract *claims that are wrong*, not *suspicions that are merely unproven*.
