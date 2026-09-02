---
name: feedback_no_llm_vocabulary
description: "Never say \"token\" (or other LLM jargon) about Unity's brain — she has WORDS; the no-tokenizer claim is the project's core honesty and the vocabulary must match it."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-25T12:28:36.106Z
---

⛔ **Do not use "token", "embedding lookup", "context window", "prompt", "inference", or other LLM vocabulary to describe how Unity's brain works.** Gee, 2026-08-25: *"why u saying token?"* → *"thats llms shit"*.

Her unit is a **WORD** — a concept with a learned representation bound in Hebbian/Oja weights. Say *word*, *concept*, *vocabulary*, *binding*, *basin*, *emission*.

**Why:** this project's central, load-bearing, publicly-stated claim is that **there is no text-AI and no tokenizer anywhere in the cognition path** — the day the live Claude route was deleted, *"there is no text-AI in the cognition path"* became literally true and that was treated as a milestone. A "token" is what a tokenizer emits. Writing it in code comments, docs or ledgers imports exactly the architecture the project exists not to be, and a reader can reasonably infer a tokenizer is in there somewhere. **The vocabulary has to match the architecture or the comments quietly undo the claim.**

**How to apply:**
- Writing new code/comments/docs: use *word*. `words`, not `toks`. "single-WORD", not "single-token".
- ⚠ Genuine exceptions exist and are fine: `SPRS` wire-protocol message *types*, GPU *buffers*, and the literal API-usage counters in the harness banner are not claims about her cognition.
- ⛔ Do NOT rewrite historical `docs/FINALIZED.md` entries that used it — archive integrity outranks tidiness. Fix only what you are writing now.
- Same class of care as [[feedback_no_example_words_in_code]] and [[feedback_no_word_lists_use_taxonomy]]: the words in the source are part of the artifact, not decoration.

Related: [[project_future_no_text_models]] (the law this protects), [[feedback_no_corporate_commits]].
