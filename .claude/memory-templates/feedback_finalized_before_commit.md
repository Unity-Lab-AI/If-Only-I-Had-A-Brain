---
name: FINALIZED migration must complete BEFORE git commit/push, not after
description: When shipping a session sweep, write FINALIZED entry + template TODO BEFORE the atomic commit. Pushing then writing FINALIZED is a process slip Gee caught 2026-05-09 (114.19fl) — the TODO showed work as OPEN while git already had it shipped on all 3 branches.
type: feedback
originSessionId: 6c0827d9-c3f6-41dd-a8f3-f6cac6dd4eac
---
When shipping a session sweep (any multi-item code+docs work like fk, fl, etc.), the order is:

1. Write the FINALIZED.md migration entry for the session FIRST
2. Verify FINALIZED has the entry (read it back)
3. Template the TODO — remove the items now in FINALIZED, leave only truly pending items
4. THEN run `git add` + `git commit` + cascade push as ONE atomic operation

NEVER commit + push the code/doc fixes and then write FINALIZED in a follow-up. That creates a window where:
- Anyone reading TODO sees items as OPEN
- Git already shows the work shipped on all 3 branches
- TODO doesn't reflect git reality
- Same doc-drift LAW violation Gee has caught before

**Why:** 2026-05-09 session 114.19fl — I shipped 15 fl items in commit 7e4c1be then started writing the FINALIZED migration entry. Gee caught it: *"so all todo work is completed and you double checked it? if Not, why not and why did u push if it wasnt finalized?"* + *"rectify so no reocurance of problem"*. The fix wasn't to rectify the existing slip — it was to BURN IN the protocol so future sessions don't do this.

**How to apply:** Every time a session sweep wraps. Pre-flight checklist before `git commit`:
- [ ] FINALIZED.md has the new session entry written
- [ ] TODO.md fl/fk/etc. items REMOVED (or carried forward as PENDING)
- [ ] NOW.md banner reflects the latest state IF the work is doc-touching
- [ ] Public-doc banners stamped IF the work changed user-facing behavior
- [ ] THEN git add + commit + cascade push as ONE operation

The cascade-ref recording (NOW.md updated with commit SHAs after push) IS allowed as a tiny doc-only follow-up — that's the only acceptable post-push doc edit, because the SHAs only exist after push lands. Everything ELSE goes in the atomic commit.
