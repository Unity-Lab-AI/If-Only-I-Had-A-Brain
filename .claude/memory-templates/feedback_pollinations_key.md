---
name: feedback_pollinations_key
description: "ANONYMOUS TIER ONLY (2026-08-22 law) — no Pollinations key anywhere in the brain; every key store deleted, every seed path removed; never re-add a default key."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-22T15:22:26.411Z
---

Gee, 2026-08-22: *"delte any .env file we have. i dont want a key being used for the brain any more it always says GFourteen and the key when i want it only using anonymous, i keep having to clear the key and name"* — this SUPERSEDES the old "never clear pollinations-user.json" rule.

**Why:** keys were already DEAD (2026-08-17: free tier only, 402s expected), yet THREE seed paths kept re-filling a cleared key every page load: index.html force-seeded `DEFAULT_POLLINATIONS_KEY` into localStorage, app.js seeded `js/env.js` keys into storage at init, and the server extracted the default from index.html for image URLs.

**How to apply:** the brain runs the Pollinations ANONYMOUS tier, period. `js/env.js` and `.claude/pollinations-user.json` are DELETED (ANONKEY batch); index.html's block is purge-only (retired keys `sk_cVKT…` + `sk_sGQD…` removed from visitor storage, nothing ever seeded); app.js never seeds the pollinations slot and purges retired keys; the server's `_pollinationsImageKey` is env-var-override-only. NEVER re-add a default/seeded key or a key file; a visitor's own personally-pasted key is the only key that may exist, and it stays theirs. The donor NAME is the user's own `unity_donor_name` localStorage — an empty-save removes it; it is not code-seeded. Related: [[reference_pollinations_image_endpoint]].
