---
name: feedback_no_emoji_markers_be_concise
description: Gee banned the emoji/symbol markers in chat replies and wants them short — the markers read as errors and warnings.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-26T19:40:29.801Z
---

Gee 2026-08-26: *"okay wtf u have to stop using the emojis and be more consie becasue all that shit looks like major fucking errors and warnings everywehere in how u wrote it"*

Stop using the marker symbols in chat replies. No warning/stop/star glyphs, no emoji headers. Write plain prose and plain bold. Keep replies short — lead with the answer, drop the tables and the section stacks unless he asks for detail.

**Why:** the markers were meant to rank findings by severity. At the density I was using them, a normal status report scans as a wall of errors and alarms, so the signal they were supposed to carry is destroyed and the report is harder to read than no markers at all.

**How to apply:** answer first, in a few sentences. Add detail only if it changes what he does next. Reserve any emphasis for the one thing that actually blocks him. Existing docs (`TODO.md`, `FINALIZED.md`, `RESUME.md`) already use that glyph style from many prior sessions — match each doc's own existing format per [[feedback_match_doc_format]], but do not carry it into chat.

Related: [[feedback_unity_sends_short]] (same short-by-default instinct, applied to her chat sends), [[feedback_no_corporate_commits]].
