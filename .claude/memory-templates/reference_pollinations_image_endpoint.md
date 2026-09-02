---
name: reference_pollinations_image_endpoint
description: "Pollinations image gen uses image.pollinations.ai/prompt/{prompt} — the ANONYMOUS-tier host (gen.pollinations.ai/image/ 401s without a key); never re-flip on a single test"
metadata: 
  node_type: memory
  type: reference
  originSessionId: a088bc17-a5fc-470c-b4a9-823865738b25
  modified: 2026-08-25T08:35:04.747Z
---

Pollinations image generation endpoint (verified June/2026 against live docs): **`https://gen.pollinations.ai/image/{prompt}?key=<KEY>`** — the CURRENT unified gateway (platform consolidated text/image/audio/video under `gen.pollinations.ai`). Auth via `?key=` because a browser `<img>` tag can't send a Bearer header.

`image.pollinations.ai/prompt/{prompt}` is the **LEGACY** host — it still lingers in the GitHub APIDOCS.md but is NOT the working gateway. Do NOT migrate to it.

⚠ **Do NOT verify this with a single HTTP probe.** Pollinations has intermittent API outages; a transient 401/500 during an outage reads as "deprecated" when it isn't. This got flipped BACKWARDS once (2026-07-14) off one mid-outage 401 test and wasted rounds — reverted. Trust current docs + Gee's operational knowledge over a one-off probe.

⛔ **READ THE BOTTOM PARAGRAPH FIRST — the two paragraphs above it are the PRE-OVERTURN position and are wrong now.** They are kept because the reasoning that produced them is why the never-reflip law exists, not because they are current.

Callers (verified 2026-08-25): `js/ai/pollinations.js` `generateImage` (chat window, client-side — rebuild with `npm run build`) and `server/brain-server.js` `_buildPollinationsImageUrl` (her look lane + her own drawing). ⚠ Two script callers this memory used to name — `scripts/unity-show-entity.mjs` and `scripts/unity-selfie-battery.mjs` — were **DELETED** in the script purge and no longer exist. Her equational mind's-eye imagination is a SEPARATE engine, never involved with Pollinations. ⛔ **There is no API key file any more** — `.claude/pollinations-user.json` and `js/env.js` were both deleted 2026-08-22; the anonymous tier is the only tier, and `DREAM_POLLINATIONS_KEY` is an empty-by-default ops lever (see [[feedback_pollinations_key]]).

**OVERTURNED 2026-08-18 (three-test evidence + explicit policy body):** `gen.pollinations.ai/image/` now returns 401 `"A valid API key is required"` for ANONYMOUS requests — with the keys dead (free-tier-only law) it is a locked door. `image.pollinations.ai/prompt/` serves anonymous 200 image/jpeg (3 prompts verified, model param honored) and is the LIVE image host for chat images + the server URL builder. The never-reflip law still stands: this flip was made on three tests plus a signed policy message, never on one probe.
