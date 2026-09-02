---
name: feedback-no-example-words-in-code
description: "Example subject words (tomato, cat, any test subject Gee names) are BANNED from code comments, identifiers, and public pages — twice-corrected violation"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-21T09:44:33.762Z
---

Gee's example words are EXAMPLES, never canon. Twice he had to correct leakage: 2026-08-21 *"i fucking told u tomoato was just a fucking example why the fucking are u writing tomoto every where"* and same day *"wtf stop mentioning a fucking cat, its just an example, get that shit out of my code named everywhere"*.

**Why:** an example word in a code comment reads like the feature is subject-specific, pollutes a fully word-generic architecture with one arbitrary noun, and violates the placement law family (verbatim/task-numbers/workflow-details belong in workflow docs only).

**How to apply:** when writing code comments about a judged/live test, say "the live judged test" / "the subject" / "<subject> on a <place>" — never the actual example noun. Same for public HTML pages. Test harnesses may use a concrete word at runtime but the word never lands in tracked source. Legitimate exceptions: functional word LISTS (color words, room-class words), the real training corpus (curriculum sentences), and her life canon (e.g. Shadow the cat) — those are content, not examples. Sweep with grep before every commit that touched drawing/vision code. See [[feedback_verbatim_words_workflow_only]].
