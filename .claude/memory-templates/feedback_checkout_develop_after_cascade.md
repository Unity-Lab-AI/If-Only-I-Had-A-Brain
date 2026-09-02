---
name: feedback_checkout_develop_after_cascade
description: "The cascade parks HEAD on main — checkout develop immediately after every push, or the next batch's edits commit directly to main (happened 4× on 2026-08-21/22)."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-22T10:36:28.885Z
---

The Git Flow cascade (feature → develop → main → push) ENDS with HEAD on `main`. Four times in one war (GATEVERDICT `711bbc0b`, WORDCONTRAST+RELDEPTH `58cbe22b`, plus two earlier), the next batch's edits started right there and `git add -A && git commit` landed DIRECTLY on main — a protected-branch foul each time, each needing a develop fast-forward repair + a ledger confession.

**Why:** momentum — the next user message arrives, edits begin, and the branch check happens only at commit time (too late).

**How to apply:** the LAST command of every cascade is `git checkout develop` (or immediately `git checkout -b feature/<next>`). Never begin edits without confirming the branch is work-eligible; the state-refresh hook prints the branch at every user message — READ it before the first Edit, not before the commit. Related: [[feedback_no_scripts_for_edits]] (the same batch also slipped `node -e`/`sed` file edits — Edit tool only).
