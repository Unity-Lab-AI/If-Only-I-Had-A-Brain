---
name: feedback_shell_chain_hazards
description: "Two repeatable shell footguns that have silently corrupted ships in this repo: backticks inside double-quoted commit messages get command-substituted, and heredocs break && chains so a failed step doesn't stop the ship."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-23T07:35:47.901Z
---

Both hit during the 2026-08-23 build session and both produced a WRONG SHIP that looked green:

1. **Backticks in a `git commit -m "..."` double-quoted string are COMMAND SUBSTITUTION.** `` `target` is a reserved keyword `` committed as "— is a reserved keyword" with the word deleted, plus a `target: command not found` line in the output that is easy to skim past. Use single quotes for the message, or write the message to a file and use `-F`, or drop the backticks. Same hazard in any double-quoted `echo`/`cat` argument.

2. **A heredoc inside a multi-command block breaks `&&` gating.** After a `cat >> file <<'EOF' … EOF`, following lines run newline-separated, so a FAILED push does not stop the subsequent commands — a half-ship (code committed, bundle missing, docs missing) cascades anyway and prints success at the end. The SPARSEACK batch shipped in two commits because of exactly this.

**How to apply:** start every multi-step ship chain with `set -e`, prefer single-quoted commit messages, and after any cascade read the actual push output rather than the last line. If a push is rejected mid-chain (the donor-release CI commits site-link bumps to `main`, so this happens routinely), reconcile with `git fetch origin main` + merge, then re-push BOTH remotes and re-sync develop. Related: [[feedback_checkout_develop_after_cascade]], [[feedback_no_scripts_for_edits]].
