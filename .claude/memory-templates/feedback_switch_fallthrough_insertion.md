---
name: feedback_switch_fallthrough_insertion
description: "Never add a `case` between fall-through labels and the body they share — it silently reroutes every label above it, and node --check cannot see it."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2795d08d-2d70-4a62-a0ac-2b9e2da25fb6
  modified: 2026-08-30T20:32:58.117Z
---

Adding a `case` to a `switch` is only safe **at the end of a body**, never between a label and the body it shares with the labels above it.

`server/brain-server.js` has a seven-label fall-through chain (`sparse_upload_ack` · `sparse_propagate_ack` · `sparse_hebbian_ack` · `rebind_sparse_ack` · `readback_letter_buckets_ack` · `letter_surprise_ack` · `readback_matrix_checksum_ack`) sharing ONE pending-resolve body. On 2026-08-30 I inserted `case 'readback_matrix_values_ack'` with its own body in the middle of it, which **severed six labels** and routed them into my new handler. Their pendings never resolved and every one rode its full timeout: all 16 cross-projection rebinds timing out at 30 s each (~8 minutes of dead boot, every projection dropped to the degraded standalone path), plus `readback_letter_buckets` (gate probes, motor argmax) and `letter_surprise` (episode salience) broken silently — those lanes have no loud line, so only the rebinds shouted.

**Why:** the insertion is valid JavaScript and a fall-through chain is *syntactically identical* whether intact or hijacked. `node --check` cannot see it, ESM `import()` cannot see it, and no harness could — the switch lives inside a live WebSocket handler.

**How to apply:** before adding a `case`, look UP from the insertion point for bare `case X:` labels with no body. If any exist, put the new case AFTER the shared body's closing brace. Verify by extracting the label list and diffing it against the pre-change tree (`git show <sha>:file`), not by reading the diff — the diff shows only additions and looks clean. A repo-wide scan for chains is cheap: count consecutive bare `case` labels before one that opens `{`.

Same family as [[feedback_typeof_no_shield_const_tdz]] — a language-level trap that passes every syntax check and fails at runtime. Related: [[feedback_harness_production_wiring]].
