---
name: VERSION bumps are Gee-only
description: Never auto-bump js/version.js VERSION. Only Gee decides when to change from 0.1.0.
type: feedback
originSessionId: c28adae8-9e20-4f37-bc65-7e86b5aab212
---
Only Gee bumps `VERSION` in `js/version.js`. It stays at `0.1.0` until he explicitly says otherwise. The `scripts/stamp-version.mjs` script only rewrites `BUILD` (git hash + random nonce), never `VERSION`.

**Why:** Gee owns semver for this project. Auto-bumping on feature merges or refactors would lie about release state and burn through version numbers he hasn't sanctioned.

**How to apply:** Never edit the `VERSION` line in `js/version.js` unprompted. Never "helpfully" bump it as part of a refactor, feature merge, or cleanup. The stamp script must never touch VERSION. If a change feels like it warrants a bump, ask — don't act.
