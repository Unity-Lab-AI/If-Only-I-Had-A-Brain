---
name: Clear stale state before telling operator to test the server
description: Before ANY "restart server / re-run curriculum / test" instruction, ensure stale session artifacts (weights + conversations + episodic-memory DB) are cleared. Auto-enforced at brain-server boot; manual clear is the fallback.
type: feedback
originSessionId: afc95172-324d-4593-a10e-64a8376d34d6
---
Before telling the operator to restart the brain server, re-run the curriculum, or test any behavior change, every stale session/temp/cache artifact that could hydrate Unity against OLD code must be cleared. If the clear didn't run, the "please test" instruction does not ship.

**Why:** Uncaught stale state has wasted multiple localhost runs. Part 2 curriculum gates trained against old-method weights produce catastrophically misleading scores — each wasted run burns an operator-side grade-signoff opportunity. Non-negotiable.

**Primary enforcement — automatic at boot:** `autoClearStaleState()` in `server/brain-server.js` runs before the `Brain` class is instantiated. Every `node brain-server.js` boot auto-deletes the stale artifacts. The manual clear below is FALLBACK documentation in case the auto-clear ever fails (fs permissions, locked files from a crashed prior run).

**Manual clear sequence (when auto-clear can't run):**
1. Ship commit
2. `rm -f` the targets below
3. Confirm via `ls server/`
4. THEN tell operator to test

**Files to clear (auto-clear list + manual-fallback list):**
- `server/brain-weights.json` + `-v1.json` / `-v2.json` / `-v3.json` / `-v4.json` (rolling saves — all of them, not just the current)
- `server/brain-weights.bin` + `-v*.bin` (binary weights from streaming save, ~9 GB at biological scale)
- `server/conversations.json`
- `server/episodic-memory.db` + `.db-wal` + `.db-shm` (SQLite main + WAL + shared-memory must go together)

**DO NOT auto-clear at server boot (manual clearing is OK):**
- `js/app.bundle.js` — `start.bat` runs `npm run build` immediately before `node brain-server.js`, so the bundle is already fresh by the time the server module loads. Including it in the in-process auto-clear caused a 404-on-bundle breakage (rebuild race). Manual clearing is fine if the server is being started from scratch via `start.bat` (which rebuilds); just don't put it in the in-process auto-clear list.

**NEVER clear:**
- `server/brain-code-hash.json` — code-hash sentinel; enables "preserve brain state across restart when code unchanged" optimization.
- `server/package.json` / `package-lock.json` / `node_modules/`
- `server/resource-config.json` (host-specific operator config, in `.gitignore`)
- `corpora/glove.6B.300d.txt` (990 MB, 5-15 min re-download)
- `.claude/pollinations-user.json` (user auth key)
- `.env*` / `js/env.js` (secrets)
- Any git-tracked file

**Opt-out for explicit save-resume:** `DREAM_KEEP_STATE=1` environment variable causes `autoClearStaleState()` to skip. `Savestart.bat` sets this so a resume boot preserves weights + episodic memory across restart.

**The VERSION bump is not a substitute.** `persistence.js` VERSION rejects stale weights at load-time but does NOT delete them. Rolling v1-v4 files still sit on disk. `conversations.json` and `episodic-memory.db` aren't gated by VERSION at all. Physical deletion is required.

**Failure recovery:** If the operator catches the clear didn't run — STOP, do NOT ask to run anything, trigger the clear NOW, confirm via `ls server/`, THEN say "clean, ready for your test run".

**⛔ NEVER `require('./server/brain-server.js')` for syntax check or any module-load purpose.** Loading brain-server.js as a module executes top-level code including `autoClearStaleState()`. Until 2026-06-17 22:18 PT (I.15 fix), this could WIPE OPERATOR TRAINING. Even with the I.15 `require.main === module` gate now in place, the safer rule is: use `node --check <file>` for syntax checks (parses only, executes nothing), or load only specific mixin files (`server/brain-server/chat.js` / `memory.js` / `state.js` / `gpu.js` — these are plain mixin objects with no top-level side effects). Never the entry-point module. Lesson learned the painful way at 22:16 PT this session: a `node -e "require('./server/brain-server.js')"` syntax check wiped 17+ min K-VOCAB-UPFRONT-MULTIDEF SEED + 9.3 min cell teach + brain-weights.bin (144.8 MB). The I.15 gate prevents recurrence, but the lesson + safer-default-behavior stays.

Written as binding LAW in `.claude/CLAUDE.md` alongside the Critical-Rules table row.
