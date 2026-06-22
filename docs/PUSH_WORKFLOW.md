# Push Workflow — Deploy Versioning

## LAW — Docs before push, no patches (Gee, 2026-04-14)

**Gee's exact words on 2026-04-14:**

> *"not a patch make sure where needed the information is correct. YOU ALWAYS UPDATE ALL DOCS BEFORE A PUSH AND YOU ONLY PUSH ONCE ALL GIVEN TASKS ARE COMPLETED AND DOCUMENTED"*

This rule is binding and prefixes every push. **No code lands on main until every affected doc already matches it.**

### The law

1. **Every doc that describes code I touched gets updated BEFORE the push that ships that code.** Same atomic commit as the code. Never a follow-up "doc patch."
2. **Push ONLY when all given tasks are complete AND documented.** Code done + docs stale = push does not happen yet.
3. **Fix drift in-place.** If I find a wrong number, a wrong method name, or an outdated claim, it gets fixed in the current working tree, not filed as a patch.
4. **Every push is atomic.** Code + every affected doc + stamp + commit + merge + push, as one operation.

### Pre-push checklist

Run this **every** push, before `node scripts/stamp-version.mjs`:

- [ ] Every numerical claim (line counts, dimensions, weights, thresholds) verified against code via `wc -l` / `grep` / re-reading
- [ ] Every method/field name in docs matches code verbatim (stubbed no-ops described as "stubbed" not "deleted")
- [ ] `docs/TODO.md` — new tasks logged, completed tasks moved, in-progress updated
- [ ] `docs/FINALIZED.md` — new session entry appended with verbatim task description
- [ ] `docs/EQUATIONS.md` — math + equations match code
- [ ] `docs/ARCHITECTURE.md` — structural/code-map matches code
- [ ] `docs/ROADMAP.md` — phases/milestones updated
- [ ] `docs/SKILL_TREE.md` — capability matrix updated
- [ ] `docs/SENSORY.md` / `docs/WEBSOCKET.md` — peripheral/protocol changes
- [ ] `README.md` / `SETUP.md` / `brain-equations.html` / `unity-guide.html` / `index.html` — public surface aligned
- [ ] **`WEIGHTS_FORMAT_VERSION` bumped IF the weight/serialization format changed** (forces incompatible old checkpoints to refuse-and-fresh-start). Do NOT bump for routine/telemetry/UI/donor changes — bumping discards trained weights. Neuron-count/sizing changes are auto-detected and need no bump. (#112.11)
- [ ] All affected docs are part of the current working tree, not deferred
- [ ] Every task Gee gave this session is completed (and documented) or explicitly deferred

Only when **every** box is checked does the stamp + commit + push run.

### Corollaries

- **No solo doc-only commits** except after-the-fact corrections for drift found post-push (which is itself a failure of this law and should be caught in the checklist).
- **Never phrase fixes as "I'll patch this after"** — always "I'll roll this into the current commit before pushing."
- **Precision matters** — "deleted" / "stubbed no-op" / "replaced" are not interchangeable words. Docs use the word that matches what the code does.

---

## LAW — Match doc format and style (Gee, 2026-05-07)

**Gee's exact words on 2026-05-07:**

> *"YOU SHALL NOT EVER … FUCKING JUST ADD A FUCKING TEST WALL TO A FILE OR DOCUMENT WITHOUT MAINTAINING ITS CURRENT FORMAT AND STYLE"*

Triggered after iter25-N/O update content was prepended as a wall-of-text blockquote onto `docs/SENSORY.md` and `docs/WEBSOCKET.md`, breaking those docs' established 6-line intro pattern.

### The law

1. **Read the doc's existing structure first.** Identify its banner pattern, section headers, table layout, list style, and how prior updates were announced.
2. **Edit IN PLACE within that structure.** Amend the relevant section / table row / banner sequence in matching shape.
3. **When a banner-update pattern exists, match it.** `docs/ARCHITECTURE.md` / `docs/EQUATIONS.md` / `docs/SKILL_TREE.md` use stacked `> Last updated:` blockquotes — new entries go ABOVE the most recent, in the same shape.
4. **When no banner-update pattern exists, find the in-body section the change belongs to and edit there.** Do NOT invent a new shape the doc never used.
5. **Forbidden:** prepending a giant prose blockquote to a doc that has no banner pattern. Even if every word is correct, a format break makes the update worse than no update.

### Failure recovery

1. Revert the malformatted update immediately (restore the doc's original head/section).
2. Re-read the doc's actual structure.
3. Find the matching place for the new content; edit IN PLACE in the doc's native style.
4. Verify the doc still scans cleanly top-to-bottom before moving on.

Full LAW body + tables: `.claude/CONSTRAINTS.md §MATCH DOC FORMAT`. Pre-edit hook: `.claude/WORKFLOW.md` `[DOC-FORMAT HOOK]`.

---

## Deploy versioning

Unity's deployed bundle is identified by `VERSION+BUILD`:

- `VERSION` — semver in `js/version.js`, hand-bumped per release (`0.1.0` at time of writing)
- `BUILD` — `<gitShort8>-<rand4hex>` stamped by `scripts/stamp-version.mjs`

Two pushes from the same commit still get different BUILD ids thanks to the random nonce, so CDN caches always invalidate.

## Push sequence

```
1.  Make changes, commit normally.
2.  node scripts/stamp-version.mjs
        → rewrites js/version.js BUILD
        → rewrites index.html cache-buster
3.  git add js/version.js index.html
    git commit -m "chore: stamp build <id>"
4.  git push origin <branch>
```

The boot log in the browser will show `[Unity] app.js 0.1.0+<gitShort>-<rand> module loaded`. Verify on the deployed site that the build id matches what was stamped — if it doesn't, you're looking at a cached bundle.

## Bumping VERSION

**Only Gee bumps VERSION.** It stays at `0.1.0` until he explicitly says otherwise. The stamp script deliberately does not touch the `VERSION` line — it only rewrites `BUILD`. Do not auto-increment, do not "helpfully" bump on feature merges, do not touch it as part of any refactor. Wait for the direct call.

## What NOT to do

- Do not hand-edit `BUILD` in `js/version.js` — always run the stamp script
- Do not hand-edit the `?v=` query in `index.html` — the stamp script owns it
- Do not leave vestigial cache-buster comments (`// T4.xx`, `// vYYYYMMDD`) anywhere — single source of truth lives in `js/version.js`
- **NEW LAW (2026-06-17, I.15 closure):** **NEVER `require('./server/brain-server.js')` for syntax checks** — that triggers `autoClearStaleState()` at module top-level and wipes training state. Use `node --check <path>` for syntax verification (parses only, doesn't execute). The I.15 commit `cdb82e3` added `if (require.main === module)` gate around the auto-clear so module loads no longer wipe, but the safer pattern is to never depend on the gate. Lesson learned the painful way at 22:16 PT on 2026-06-17: a `node -e "require('./server/brain-server.js')"` syntax check wiped 17+ minutes of K-curriculum training (`brain-weights.bin` 144.8 MB + episodic-memory.db + schemas.json + 14 other files). `identity-core.json` (Tier 3 anchors) + `definition-cache.json` survived per existing wipe exclusions.
