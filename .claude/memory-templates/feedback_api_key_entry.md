---
name: API keys via env.js file
description: User wants API keys in js/env.js so they don't have to type them in the UI every time
type: feedback
originSessionId: 3edf394f-c4a8-41e8-97a1-9c7589df3cec
---
User wants API keys stored in `js/env.js` (gitignored) so they load automatically on boot without manual entry each time. The setup UI still works for adding/changing keys, but env.js is the primary way the user configures their keys.

**Why:** User doesn't want to type long API keys into the UI repeatedly. env.js is a simple JS module that exports key-value pairs.

**How to apply:** Keys from env.js get seeded into localStorage on boot. `js/env.example.js` ships with the repo as a template. `js/env.js` is in .gitignore.
