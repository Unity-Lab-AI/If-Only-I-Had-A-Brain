---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
# ⛔ Per-pass history lives in the body under `## Verification history`, newest
# first — never concatenated onto the `last-verified` line.
status: draft
verified-scope: >
  2026-09-08 doc sweep: the pre-push checklist was extended from nine files to
  every doc tree the DOCS law actually covers (it had omitted html/ tooltips,
  deploy/, .claude/, wiki/, RESUME.md and NOW.md); 7 personal attributions
  removed with every verbatim quote left intact; 5 ticket identifiers removed;
  the syntax-check wipe warning promoted out of a bullet into its own section.
  The central non-fast-forward finding was RE-VERIFIED against the one source
  that had moved.
  NOT re-verified: the deploy-versioning BUILD/nonce mechanics against
  scripts/stamp-version.mjs line by line.
sources:
  - .forgejo/workflows/deploy.yml
  - .forgejo/workflows/donor-release.yml
  - scripts/stamp-version.mjs
last-verified: "17bb3070 2026-09-08"
---

# Push Workflow — Deploy Versioning

## ⛔ LAW — NEVER PUSH WITH SUPPRESSED OUTPUT. VERIFY WITH `git ls-remote` (2026-08-20)

**This cost two fresh walks — hours of training thrown away — and it was invisible for nine consecutive pushes.**

I pushed with `git push -q "$remote" "$branch" 2>/dev/null`. The quiet flag plus a discarded stderr makes **a rejection and a success byte-identical in the output**, so I reported "pushed" nine times on the strength of an exit code I had thrown away.

### The mechanism, and why nothing local reveals it

`.forgejo/workflows/donor-release.yml` commits the site-link bump to `main` **and pushes it to Forgejo only** (`origin`). Local `main` never has that commit, so from that moment every `origin` push is a **non-fast-forward and is refused** — while **`github` keeps accepting, because the CI never pushes there.** The two remotes silently disagree, and `deploy/self-update.sh` does `git clone --depth 1 --branch main <Forgejo>` — so **the box faithfully redeploys whatever Forgejo's `main` says**, which was stale code. Two presses of Update & Fresh Walk built the wrong brain before anyone noticed. It then recurred the same day and was caught **only** because the output was no longer suppressed.

### The rule

1. **Push LOUDLY.** No `-q`, no `2>/dev/null`, on any push. A rejection must be visible.
2. **Verify against the remote, not the exit code:**
   ```bash
   git push origin main            # loud
   git push github main            # loud
   git rev-parse --short=8 main
   git ls-remote origin refs/heads/main   # must match
   git ls-remote github refs/heads/main   # must match
   ```
3. **Expect CI-authored commits on `origin/main`.** After any `donor-v*` tag, `fetch` and merge before pushing:
   ```bash
   git fetch origin main && git log --oneline main..FETCH_HEAD && git merge --no-ff FETCH_HEAD
   ```
4. **A claim of "pushed" is only true if the remote says the same SHA.** Anything else is a guess.

### The corollary that caught a second bug

A failed shell line means **later `&&`-chained commands never ran.** A heredoc quoting error caused `git checkout -b` to be skipped, so edits and a commit landed **directly on `main`** — three times in one session. **After any command that errors, re-check `git branch --show-current` before committing.**


## LAW — Docs before push, no patches (2026-04-14)

**The operator's exact words, 2026-04-14:**

> *"not a patch make sure where needed the information is correct. YOU ALWAYS UPDATE ALL DOCS BEFORE A PUSH AND YOU ONLY PUSH ONCE ALL GIVEN TASKS ARE COMPLETED AND DOCUMENTED"*

This rule is binding and prefixes every push. **No code lands on main until every affected doc already matches it.**

### The law — docs before push

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
- [ ] `docs/RESUME.md` + `docs/NOW.md` — the pickup brief and the snapshot
- [ ] `README.md` / `docs/SETUP.md` / `docs/HOW-IT-WORKS.md` — the public front door and the plain-English page
- [ ] **`html/*.html` — ALL of them, and ⛔ INCLUDING `title=` / `data-tip` TOOLTIPS AND IN-PAGE COPY.** A page's body can be corrected while its own tooltip still contradicts it; that has happened here more than once, and an apostrophe in one tooltip took the donor page down for twelve days
- [ ] `deploy/*.md` — box setup, redeploy notes, hook fixes
- [ ] `.claude/*.md` — the workflow docs
- [ ] `wiki/**` — ⚠ **one tree among many, NOT "the docs".** Updating the wiki and calling the documentation current is a recorded failure
- [ ] **`WEIGHTS_FORMAT_VERSION` bumped IF the weight/serialization format changed** (forces incompatible old checkpoints to refuse-and-fresh-start). Do NOT bump for routine/telemetry/UI/donor changes — bumping discards trained weights. Neuron-count/sizing changes are auto-detected and need no bump.
- [ ] All affected docs are part of the current working tree, not deferred
- [ ] Every task the operator gave this session is completed (and documented) or explicitly deferred

> ⛔⛔ **"DOCS" IS THE WHOLE SET, AND THIS CHECKLIST LISTED HALF OF IT UNTIL 2026-09-08.** It named nine `docs/*.md` files, `README`, `SETUP` and three HTMLs — and omitted the rest of `html/`, **every tooltip**, `deploy/`, `.claude/`, `wiki/`, `RESUME.md` and `NOW.md`. ⭐ **Name every tree, or say why it is unaffected.** A tree nobody names is a tree nobody checks.
>
> ⚠ **Start from the mechanical worklist, not from memory: `npm run docs:drift`.** It reads each page's `last-verified` commit against the `sources:` it declares and names the pages whose sources have moved. ⛔ **It covers `docs/*.md` + `deploy/*.md` + `README.md` ONLY** — `html/*.html` and `.claude/*.md` have **no staleness mechanism at all**, so those two trees are hand-walked or they are skipped.
>
> ⛔ **And every doc edit is made BY HAND with `Edit`/`Write`.** No heredocs, no `sed -i`, no `node -e`, no `python -c` — reading is fine. That ban has been broken four times in this project and each violation is recorded; the last one had no mechanical excuse at all.

Only when **every** box is checked does the stamp + commit + push run.

### Corollaries

- **No solo doc-only commits** except after-the-fact corrections for drift found post-push (which is itself a failure of this law and should be caught in the checklist).
- **Never phrase fixes as "I'll patch this after"** — always "I'll roll this into the current commit before pushing."
- **Precision matters** — "deleted" / "stubbed no-op" / "replaced" are not interchangeable words. Docs use the word that matches what the code does.

---

## LAW — Match doc format and style (2026-05-07)

**The operator's exact words, 2026-05-07:**

> *"YOU SHALL NOT EVER … FUCKING JUST ADD A FUCKING TEST WALL TO A FILE OR DOCUMENT WITHOUT MAINTAINING ITS CURRENT FORMAT AND STYLE"*

Triggered after a batch of update content was prepended as a wall-of-text blockquote onto `docs/SENSORY.md` and `docs/WEBSOCKET.md`, breaking those docs' established 6-line intro pattern.

### The law — match the format

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

**Only the operator bumps VERSION.** It stays at `0.1.0` until he explicitly says otherwise. The stamp script deliberately does not touch the `VERSION` line — it only rewrites `BUILD`. Do not auto-increment, do not "helpfully" bump on feature merges, do not touch it as part of any refactor. Wait for the direct call.

## What NOT to do

- Do not hand-edit `BUILD` in `js/version.js` — always run the stamp script
- Do not hand-edit the `?v=` query in `index.html` — the stamp script owns it
- Do not leave vestigial cache-buster comments (`// <ticket-id>`, `// vYYYYMMDD`) anywhere — single source of truth lives in `js/version.js`

---

## ⛔ LAW — NEVER `require()` THE SERVER FOR A SYNTAX CHECK (2026-06-17)

**`require('./server/brain-server.js')` triggers `autoClearStaleState()` at module top level and WIPES TRAINING STATE.** Use `node --check <path>` — it parses only and never executes.

**Learned the painful way at 22:16 PT on 2026-06-17:** a `node -e "require('./server/brain-server.js')"` syntax check wiped **17+ minutes of kindergarten training** — `brain-weights.bin`, `episodic-memory.db`, `schemas.json` and 14 other files. `identity-core.json` (the Tier 3 anchors) and `definition-cache.json` survived, per the wipe exclusions that already existed.

⭐ **A guard was then added** — `if (require.main === module)` around the auto-clear, so a module load no longer wipes. ⛔ **Do not depend on it.** The safe pattern is to never take the branch at all.

> ⚠ **The weight file in that incident was ~145 MB. Today a single `brain-weights-v*.bin` is ~5,460 MB — about 5.3 GB, measured on a live checkpoint set.** The historical figure is left as written because it is a record of that event, not a current measurement; with three rotating checkpoint slots the standing exposure is **~16 GB**, which is why saves defer rather than risk truncation below `DREAM_SAVE_MIN_FREE_DISK_MB`.

---

## Verification history

Newest first. ⛔ **This section exists so `last-verified` can stay a short `<hash> <date>`.**

### `17bb3070` — 2026-09-08 — documentation sweep

- ⛔⛔ **The pre-push checklist was the defect.** It named nine `docs/*.md` files, `README`, `SETUP` and three HTMLs — and omitted the rest of `html/`, **every tooltip**, `deploy/`, `.claude/`, `wiki/`, `RESUME.md` and `NOW.md`. ⭐ **This is the checklist whose whole job is preventing the drift this sweep is cleaning up**, so a partial list here is upstream of every stale page downstream. Extended to the full set, with `npm run docs:drift` named as the mechanical starting point and its two blind spots (`html/*.html` and `.claude/*.md` have no staleness mechanism) stated outright.
- **7 personal attributions removed** from headings and prose. ⭐ **Every verbatim quote kept byte-intact** — only the wrapper around it changed. A quote is evidence; stripping it would destroy the record while pretending to tidy up.
- **5 ticket identifiers removed.** The syntax-check-wipe warning was promoted out of a trailing bullet into **its own section**, because *"never `require()` the server"* is a standing rule that costs training when broken, and it was the last item in a list called "What NOT to do".
- ⭐ **THE CENTRAL FINDING WAS RE-VERIFIED, NOT ASSUMED.** The drift checker flagged one of three declared sources as moved. Read: the change to `donor-release.yml` was the Cargo-workspace target-directory fix, **unrelated to this page's claims.** The release lane still commits the site-link bump to `main` and pushes it with the Actions token, so local `main` still never has that commit and the non-fast-forward mechanism described above still holds exactly as written.
- ⚠ **Not re-verified:** the `BUILD`/nonce mechanics against `scripts/stamp-version.mjs` line by line, which is why `status` stays `draft`.

### `2aadfd94` — 2026-08-20

The suppressed-push law was written after the incident it describes: nine consecutive pushes reported as successful on the strength of a discarded exit code, two fresh walks lost.
