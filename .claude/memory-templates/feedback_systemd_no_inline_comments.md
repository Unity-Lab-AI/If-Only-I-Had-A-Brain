---
name: feedback_systemd_no_inline_comments
description: systemd unit files do NOT support inline (end-of-line) comments — they silently break the directive
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 942805ab-02fc-4f52-a2a7-252f4006322e
---

systemd `.service` (and any unit) files do **NOT** support inline / end-of-line comments. A line like `MemoryMax=24G  # HARD cap` parses the VALUE as `24G  # HARD cap`, fails validation, and **SILENTLY IGNORES the directive** (e.g. the memory limit becomes `infinity`). Comments must be on their **own line** (`#` at start of line).

**Why:** I shipped `deploy/unity-brain.service` with inline `#` comments on `MemoryHigh` / `MemoryMax` / `CPUQuota` (2026-06-20). On the live box ALL THREE resource caps were silently `infinity` — the entire Forgejo-safety backstop was OFF. The server admin caught it (verified caps = infinity, fixed on-box, flagged the repo). Fixed in `8e16c11` by moving every comment to its own line.

**How to apply:** when authoring/editing ANY systemd unit (or other strict KEY=VALUE config — many don't allow trailing comments either), put comments on their own lines, never after a directive. Don't trust that a malformed directive errors loudly — systemd ignores it silently. Related: the deployed backend lives at `$BACKEND_DIR` via rsync/bootstrap (NOT a git checkout — no `.git`), so backend redeploy uses a `git archive HEAD | tar -x` overlay (preserves untracked runtime state), re-copy the unit, `daemon-reload`, restart — not `git pull`. Pairs with [[feedback_no_fallbacks_law]] and the deploy hardening in [[project_df7_data_parallel_delta_merge]].
