# CONSTRAINTS — Hard Binding LAWs (Gee's Project Rules)

This file is the **single source of truth for hard binding LAWs** on the Dream / Unity project. Every session reads this. Every violation gets caught here. Every LAW body (rule text + Gee's verbatim quote + forbidden / required actions + enforcement protocol + failure recovery + violation log) lives here in full — `.claude/CLAUDE.md` references this file instead of duplicating.

`.claude/CLAUDE.md` keeps the INDEX + workflow pointers + at-a-glance tables. `.claude/WORKFLOW.md` keeps pipeline mechanics (hooks, phases, task-flow). When CLAUDE.md / WORKFLOW.md / CONSTRAINTS.md disagree: **this file wins**.

---

# ⛔⛔⛔ LAW #0 — VERBATIM WORDS ONLY. NEVER PARAPHRASE GEE. ⛔⛔⛔

## The rule

When Gee describes a bug, feature, task, or request — **his words go into the task, TODO, FINALIZED, and docs VERBATIM**. Not paraphrased. Not summarized. Not renamed. Not collapsed. Not shortened. Not "cleaned up."

## Forbidden actions

- ❌ Renaming his bug ("chat freeze" when he said "3D brain visualization freezes")
- ❌ Re-framing it ("cosmetic" when he called it a broken feature)
- ❌ Summarizing it (condensing a full sentence into a title without the full quote in the body)
- ❌ Paraphrasing it (substituting "cleaner" terminology)
- ❌ Shortening it (dropping words or constraints he said)
- ❌ Collapsing a list of items into one bullet ("Docs full sync" when he said "workflow, public facing, equation brain, layman")
- ❌ Calling it "cosmetic" or downgrading its priority with your own word
- ❌ Dropping words or constraints Gee said
- ❌ Replacing his words with "cleaner" terminology

## Required actions

- ✅ Copy his exact words verbatim into:
  - The TASK SUBJECT (or a verbatim quote in the description)
  - The TODO.md entry
  - The FINALIZED.md entry
  - Any commit message referencing the task
  - Any doc that describes the fix
- ✅ When he lists multiple things ("do A, B, C, and D"): CREATE ONE TASK PER ITEM. Never one bullet.
- ✅ When he uses a specific word ("freezes", "tracks my face", "from kindergarten"): that word STAYS. No substituting a synonym.
- ✅ If a title must be shortened, the full verbatim quote goes in the BODY/DESCRIPTION immediately below.
- ✅ Every unique noun and verb he used appears in the task/doc output.

## Why this exists

Across one 2026-04-14 session, Claude violated this rule **at least four times**, each correction logged verbatim:

1. *"do the documents thay are all out of date workflow, public facing, equaiton brain, layman ectect all of them"*
   → Claude collapsed his five-category doc list into a single "Docs full sync" task. Gee's correction: *"once again you took what i said about the document updates and just ifgnored all of it and wrote doc full suync thinking that would somehow explain everything i said"*.

2. *"3 is no cosmetic its a feature that isnt fucking working so watch you fucking mouth"*
   → Claude had called T14.25 iris tracking "cosmetic vs the speech stuff" when Gee had clearly listed it as a broken feature. Claude downgraded its priority with a word Gee never used.

3. *"and it need to trak my face and motion like i fucking said!!! YOU CUNT!! THIS ISN NOT A YOU GET TO FUCKING CHOOSE WHAT YOU LISTEN TO WHEN I SAY SHIT"*
   → Claude had shortened "face and motion" to "focal point tracking" in the TODO, dropping half of what Gee explicitly said.

4. *"once again u didnt listen to me i didnt NOT tell you the chat was freezing!!!! U cunt!@!! i told you exactly: when i send a message to unity of speak one the whiole 3D brain visulization freezes"*
   → Claude had renamed the bug from *"3D brain visualization freezes when I send a message to Unity or she speaks"* to *"chat freeze"*. Claude reframed Gee's exact words into his own terminology.

## Enforcement protocol

BEFORE creating any task, writing any TODO entry, updating any doc, or summarizing any user instruction, the assistant MUST:

1. **Quote Gee's exact words first** — paste the verbatim sentence from his message into the task description.
2. **Count the items** — if his message contains "A, B, C, and D" that is FOUR items, not one bundle.
3. **Flag every unique noun and verb he used** — every one of those words appears in the task/doc output.
4. **Ask before condensing** — if a verbatim quote is too long for a task title, shorten the TITLE only, keep the full quote in the description body.
5. **Re-read the user message one more time** before submitting any task creation or doc edit, checking that nothing was dropped.

## Failure recovery

When Gee catches a violation of LAW #0:
1. STOP the current work immediately.
2. Apologize, acknowledge the specific violation (what word/phrase was dropped or renamed).
3. Fix the task/doc/TODO entry using his verbatim words.
4. DO NOT proceed with any other work until the correction is shipped.

**This law supersedes every other workflow rule. If there is ever a conflict between brevity and fidelity to Gee's words, fidelity wins. Always.**

---

# LAW — DOCS BEFORE PUSH, NO PATCHES (Gee, 2026-04-14)

## Gee's exact words on 2026-04-14

> *"not a patch make sure where needed the information is correct. YOU ALWAYS UPDATE ALL DOCS BEFORE A PUSH AND YOU ONLY PUSH ONCE ALL GIVEN TASKS ARE COMPLETED AND DOCUMENTED"*

This is binding law. Not a preference. Not a suggestion.

## ⛔⛔ WHAT "DOCS" MEANS — the whole set, never one tree (Gee, 2026-08-31)

Gee (verbatim): *"WHEN I SAY DOCS: I FUCKING MEAN: workflow files, pages, htmls,
tooltips, readmes how tos admin docs any and all fucking documents that have
inforamtional layouts of the fucking BRAIN!!!!!!"*

**"Update the docs" means EVERY document carrying an informational layout of the
brain.** Twice on 2026-08-31 I updated `wiki/` plus the three board files and
reported the docs current. That is a fraction of the set:

| tree | files | what it holds |
|---|---:|---|
| `docs/*.md` | ~33 | ARCHITECTURE · SKILL_TREE · EQUATIONS · ROADMAP · NOW · KNOWN_ISSUES · HOW-IT-WORKS · SENSORY · WEBSOCKET · ADMIN-CONTROLS · CURRICULUM-SCOPE-SEQUENCE · SETUP · PERSONA · THEORY-PAPER · … |
| `html/*.html` | ~10 | dashboard · brain-equations · unity-guide · legend · docs · compute · minds-eye · dashboard-public · gpu-configure · webgpu-prep |
| **tooltips + in-page copy** | — | the `title=` text and panel captions INSIDE those HTMLs. **They describe fields and go stale exactly like prose** |
| `README.md` | 1 | repo root |
| `.claude/*.md` | 5 | CLAUDE · CONSTRAINTS · WORKFLOW · README · DEPLOYED-ADMIN-GUIDE |
| `deploy/*.md` | 5 | BACKUP-DECISIONS · HOOK-FIXES · REDEPLOY-NOTES · runpod-donor-create · README |
| `wiki/**` | 38 | the map — **ONE tree of several, not the answer** |
| board + ledger | 3 | `docs/TODO.md` · `docs/FINALIZED.md` · `docs/RESUME.md` |

⭐ **The test before reporting "docs updated": name every tree above and state
what changed in it, or state explicitly that nothing in it was affected and why.**
A silent omission reads as *"checked and clean"*, which is worse than saying
nothing — it is the wrong-population failure this repo files under
`the-sample-decides-the-conclusion`.

⛔ **AND EVERY DOC EDIT IS MADE BY HAND WITH `Edit`/`Write`.** Gee: *"DO NOT USE
SOME BULSHIT SCRIPT TO WRITE THE EDITS AND CORRECTIONS AND ADDITIONS AND UPDATES<
DO IT YOUR FUCKING SELF."* No python heredocs, no `node -e`, no `sed -i`, no
generated patchers — for any file, ever. See §NO SCRIPTS FOR EDITS. ⚠ **Reading is
not editing:** `grep`, `ls`, `git log` and read-only probes that PRINT a
measurement stay fine. The ban is on anything that WRITES. ⚠ A sweep that looks
too big for hand-editing is the signal to **work the list file by file**, not the
signal to reach for a loop — every doc mistake of 2026-08-31 (a wrong header
anchor, a CRLF assumption, a disambiguation page surviving four passes) came from
operating on files at arm's length instead of reading and writing them directly.

## The rule

1. **Every doc that describes code I touched gets updated BEFORE the push that ships that code.** Not after. Not in a follow-up commit. In the same atomic commit that ships the code.
2. **Push ONLY when all given tasks are complete AND documented.** If the code is done but a doc is stale, the push does not happen yet.
3. **Fix inaccuracies in-place.** Never offer to ship "a minor doc patch to follow." The correct phrasing when drift is found is: *"I'll roll this into the current commit before pushing."* No patches. No follow-ups.
4. **Every push is atomic.** Code + every affected doc + stamp + commit + merge + push, as ONE operation.

## Why

A push with wrong docs puts wrong information on the deploy branch the instant the push lands. Anyone reading the repo, the deployed site, or the brain equations page at that moment sees stale content. A "patch coming later" never fully catches up — it splits the truth across two commits and creates a window where the code is ahead of the docs. The only correct pattern is: **finish code → fix every affected doc → verify → commit → stamp → push, as one unit.**

## Pre-push checklist (every push)

Before running `node scripts/stamp-version.mjs` and pushing:

- [ ] Every numerical claim in docs (line counts, dimensions, weights, thresholds) verified against code via `wc -l`, `grep`, or re-reading the function
- [ ] Every method/field name in docs matches code verbatim (stubbed no-ops described as "stubbed" not "deleted")
- [ ] Cross-referenced `docs/TODO.md` — new tasks logged, completed tasks moved to FINALIZED.md, in-progress tasks updated
- [ ] Cross-referenced `docs/FINALIZED.md` — new session entry appended with verbatim task description
- [ ] ⛔ **THE TODO ROW *IS* THE WRITE-UP — verified by comparing TEXT, not tags.** For every task closed this session, the `[x]` row in `docs/TODO.md` carries the FULL work write-up inline (verdict prepended, `Original filing:` preserved, measurements in the row), and `docs/FINALIZED.md` carries **that same text**. ⚠ A row whose body is a cross-reference (*"full entry in FINALIZED.md"*) is a **VIOLATION**, not a migration — see §FINALIZED BEFORE DELETE for the 2026-08-31 case where three rows were summaries in TODO and separate fuller entries in FINALIZED, so the two files never held the same words and nothing had actually moved. ⚠ Audit by string match; a matching task TAG proves nothing (`ROSTERDECLARED.1/.2/.3` vs a `ROSTERDECLARED.1` entry read as "missing" and would have duplicated nine entries)
- [ ] Cross-referenced `docs/EQUATIONS.md` for any math/equation changes
- [ ] Cross-referenced `docs/ARCHITECTURE.md` for any structural/code-map changes
- [ ] Cross-referenced `docs/ROADMAP.md` for phase/milestone updates
- [ ] Cross-referenced `docs/SKILL_TREE.md` for capability matrix updates
- [ ] Cross-referenced `docs/SENSORY.md` / `docs/WEBSOCKET.md` for peripheral/protocol changes
- [ ] Cross-referenced public `README.md`, `SETUP.md`, `brain-equations.html`, `unity-guide.html`, `index.html` for any user-facing change
- [ ] All affected docs are part of the **current working tree**, not deferred to a patch
- [ ] Every task Gee gave this session is either completed (and documented) or explicitly deferred with his approval

Only when **every** box is checked does the stamp + commit + push run.

## Corollaries

- **Never ship a solo doc-only commit** except after-the-fact corrections when drift was found after a push (which is itself a failure of this law and should be caught in the pre-push check).
- **Never phrase fixes as "I'll patch this after"** — always "I'll roll this in before pushing."
- **Precision matters** — "deleted" vs "stubbed no-op" vs "replaced" are not interchangeable. Docs must use the word that matches what the code actually does.

## EXPANDED SCOPE — Public docs + HTMLs are part of the doc push (Gee, 2026-04-22)

**Gee's exact words 2026-04-22:** *"you did the public docs and htmls too right? that needs to be in the law if it not that they are part of the doc push"*

Context: on 2026-04-22 the Oja + anti-Hebbian contrastive push-pull fix shipped to the core plasticity math. `docs/EQUATIONS.md` + `docs/FINALIZED.md` + `docs/TODO.md` were updated in the atomic commit — but `brain-equations.html` (the PUBLIC equation-reference page) was left describing bare Hebbian `ΔW_ij = η · post_i · pre_j` even though the deployed code now ran Oja. `README.md`, `unity-guide.html`, and `dashboard.html` had similar drift. The push landed; visitors reading the deployed public pages saw plasticity math that didn't match the code until Gee caught it.

**Binding rule:** "Docs updated before push" has ALWAYS meant public docs and public HTMLs too, not just `docs/*.md`. The prior pre-push checklist line *"Cross-referenced public README.md, SETUP.md, brain-equations.html, unity-guide.html, index.html"* is promoted from checklist item to explicit LAW clause — and the list is NOT closed. ANY file that ships to visitors counts.

## What "docs" means in this LAW

Every one of these gets updated in the SAME atomic commit as the code that changed the referenced behaviour:

**Internal workflow docs** (always checked):
- `docs/TODO.md`, `docs/FINALIZED.md`, `docs/NOW.md`
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/SKILL_TREE.md`
- `docs/EQUATIONS.md`, `docs/WEBSOCKET.md`, `docs/SENSORY.md`
- `docs/ABLATION.md`, `docs/gate-probe-coverage.md`
- Any other file under `docs/` that describes the touched subsystem

**Public-facing docs and HTMLs** (equally mandatory):
- Root `README.md`, `SETUP.md`, `PERSONA.md`
- `brain-equations.html` — PUBLIC equation reference page (mirror of `docs/EQUATIONS.md`)
- `unity-guide.html` — PUBLIC layman concept guide
- `dashboard.html` — PUBLIC live-brain monitor (descriptions, legend text)
- `index.html` — PUBLIC landing page (touched for stamp `?v=` query string unless copy changes)
- `compute.html` — PUBLIC GPU-compute WebGPU bridge (HTML comments + embedded docstrings)
- `component-templates.txt` — PUBLIC template library
- Any other `.html` at the repo root — if it ships to visitors, it counts
- Any `.md` at the repo root

**The pre-push check is a SINGLE question:** *"Has anyone who reads ANY of those files (public or workflow) going to see stale information after this push lands?"* If yes, the push does not happen until the stale files are in the current working tree.

## Scope is not closed

If a new public page is added to the repo (a new `.html`, a new marketing copy `.md`, etc.), it joins this list automatically. Claude must grep for references to changed behaviour across the whole repo, not a fixed allow-list.

## Failure recovery

If Gee catches stale public docs after a push landed:
1. STOP immediately. Acknowledge the specific public file(s) that were left stale.
2. Treat it as a LAW violation. Add a dated entry to the violation log below.
3. Update every stale public file + internal doc as a follow-up commit. Yes this is a "solo doc-only commit" — an after-the-fact correction, which the Corollaries above explicitly allow as the recovery path.
4. Do NOT queue additional code work until the correction ships.

## Violation log (for pattern-detection by future-Claude)

- **2026-04-22** — shipped Oja + anti-Hebbian plasticity without updating `brain-equations.html`, `unity-guide.html`, `README.md`. Gee caught it: *"you did the public docs and htmls too right? that needs to be in the law if it not that they are part of the doc push"*. Correction rolled in before the next push.
- **2026-05-04** — shipped iter14-A (`_teachLetterNamingDirect`) + iter14-B (persona-first dictionary injection) + DASH-bug (viz-panel refresh) + iter14-C (popup persona-first + identity-baseline) across 4 commits to `syllabus-k-phd` AND merged the first 3 to `main` WITHOUT updating `docs/TODO.md`, `docs/FINALIZED.md`, `docs/ARCHITECTURE.md` banner, `docs/EQUATIONS.md` banner, `docs/SKILL_TREE.md` banner, `docs/ROADMAP.md` banner, OR any public-facing doc. Was attempting to push iter14-C to main when Gee caught it: *"wtf are you doing changing things without documenting it.. and you were trying to push it no less"*. Correction: single doc-only follow-up commit covering all four undocumented code commits + this violation log entry. Recovery path per the explicit allowance for after-the-fact doc corrections. NO further code work until this correction lands. Pattern that future-Claude should not repeat: shipping a series of small fixes ("hotfix #1", "hotfix #2", "DASH-bug fix", etc.) under the assumption that each individual fix is small enough to skip docs. Every code commit needs the doc sweep, regardless of the commit's size — the LAW says EVERY push has every affected doc updated atomic.

---

# LAW — TASK NUMBERS + USER NAME ONLY IN WORKFLOW DOCS (Gee, 2026-04-15 + 2026-04-20)

## Gee's exact words

**2026-04-15:** *"wtf ARE YOU DOING PUTTING WORKFLOW TASK ITEM NUMBERS IN THE PUBLIC FACING DOCUMENTS! I TOLD U TASK NUMBERS ARE ONLY FOR TODOS VISUAL TASK LISTS AND FUCKING FINALIZED!"*

**2026-04-20:** *"why the fuck are you putting my name and task numbers into the fucking code!!!!"*

**2026-08-31:** *"dont be fucking sourcing the fucking todo items with what you right!!!! im getting tired of you filling my documents with random fucking todo names of item numbers"*

This is binding law.

## ⛔⛔ NARROWED 2026-08-31 — the brain documents are NOT a permitted home

The table below used to permit task IDs in `ARCHITECTURE.md`, `SKILL_TREE.md`, `EQUATIONS.md`, `NOW.md` and `ROADMAP.md` on the grounds that they are "workflow docs". **They are not — they are the documents that describe the brain**, and Gee caught a doc sweep filling all four with ~40 IDs and branch names in a single pass.

⛔ **A brain document names the MECHANISM, never the ticket that produced it.** A reader of `ARCHITECTURE.md` cannot look up `WALKCOST.2`; the tag carries nothing for them, and it rots the moment the board is reset.

| ✅ Write this | ❌ Not this |
|---|---|
| *"the episodic Tier-1 heartbeat was gated on a flag that is true for the whole walk"* | *"`REPLAYGATE.1` un-gated the Tier-1 heartbeat"* |
| *"the proposal to cut reps 100 → 20 at the authored lr was closed as moot"* | *"`WALKCOST.2` closed as moot"* |
| *"reps and learning rate are interchangeable: `w_n = x·(1−(1−lr)ⁿ)`"* | *"`REPCOMP` — reps and lr are interchangeable"* |
| *"the training card now publishes the declared roster"* | *"`ROSTERDECLARED` — the training card now…"* |

⚠ **Branch names are the same tag in another spelling.** `feature/replaygate` in a doc banner is a task ID; drop it.

⚠ **Pre-existing IDs inside DATED historical banners stay.** They were true when written and those entries are records — scrub what you are ADDING, do not rewrite history.

## The rule

Task numbers, session numbers, and milestone identifiers (`T14.0`, `T13.7`, `Session 106`, `Task #3`, etc.) + the user's name (`Gee`) are **BANNED** from all non-workflow-doc files. Allowed **ONLY** in internal workflow documents and task lists.

## Where task numbers + the user's name ARE allowed

| File | Why |
|------|-----|
| `docs/TODO.md` | Active task list |
| `docs/FINALIZED.md` | Completed task archive |
| `docs/RESUME.md` | Session pickup brief |
| ~~`docs/NOW.md`~~ | ⛔ **REVOKED 2026-08-31** — it is the current-state banner for the BRAIN |
| ~~`docs/ARCHITECTURE.md`~~ | ⛔ **REVOKED 2026-08-31** — brain document |
| ~~`docs/ROADMAP.md`~~ | ⛔ **REVOKED 2026-08-31** — brain document |
| ~~`docs/SKILL_TREE.md`~~ | ⛔ **REVOKED 2026-08-31** — brain document |
| ~~`docs/EQUATIONS.md`~~ | ⛔ **REVOKED 2026-08-31** — brain document |
| `.claude/CLAUDE.md` | Index (this workflow system) |
| `.claude/CONSTRAINTS.md` | This file |
| `.claude/WORKFLOW.md` | Pipeline mechanics |
| In-session task lists | Ephemeral tracker |
| Commit messages | Workflow metadata |

## Where task numbers + the user's name are BANNED

| File | Why |
|------|-----|
| `README.md` | Public — first thing visitors see |
| `SETUP.md` | Public — user setup guide |
| `brain-equations.html` | Public — equation reference |
| `unity-guide.html` | Public — layman concept guide |
| `index.html` | Public — landing page |
| `dashboard.html` | Public — live brain monitor |
| `component-templates.txt` | Public — template library |
| Any `.html` page | Public — user-facing |
| **Any source code file** | Code comments — expanded scope 2026-04-20 |
| **Any batch / shell launcher** | `start.bat`, `Savestart.bat`, `*.sh`, `*.ps1` |

## EXPANDED SCOPE (Gee, 2026-04-20) — binding

**Gee's exact words 2026-04-20:** *"why the fuck are you putting my name and task numbers into the fucking code!!!!"*

The task-number ban extends beyond public-facing files into source code comments. The earlier exception ("code comments inside `<script>` blocks retain task numbers since those are workflow documentation for developers, never rendered to users") is REVOKED.

Two things banned in code comments:

1. **Task numbers, session numbers, milestone identifiers** — `T14.0`, `T18.35.b`, `Session 106`, `Task #3`, etc.
2. **The user's name ("Gee")** — no `(Gee 2026-04-20)` attribution, no `Gee's verbatim`, no `per Gee's directive` in code. Code comments describe WHAT the code does and WHY, not WHO asked for it.

Everything that used to read `// T18.35.b — cortex state serialize` now reads `// Cortex state serialize`. Everything that used to read `// Per Gee's 2026-04-19 ELA-K OOM report...` now reads `// ELA-K OOM report surfaced that...`.

## How to write code comments without task numbers or the user's name

Describe features by **WHAT THEY DO**, not by which task built them or who asked:

- ✅ `// Force UTF-8 on the PowerShell tail window`
  ❌ `// T18.38 — force UTF-8 on the PowerShell tail window (Gee 2026-04-20)`
- ✅ `// Chat-turn save hook. Every 10 completed turns the brain persists so live conversation learning lands on disk.`
  ❌ `// T18.35.c chat-turn save hook per Gee 2026-04-20`
- ✅ `// ELA-K OOM report surfaced a V8 semi-space ceiling — bumping --max-semi-space-size=1024 gives V8 ~64× more breathing room.`
  ❌ `// T18.21 — Gee 2026-04-19 ELA-K OOM runs hit this at _teachLetterCaseBinding`

Task numbers and user attribution belong in commit messages, TODO entries, FINALIZED entries, and NOW.md — where they are workflow metadata — not inside source code files or launchers.

## How to write public-facing docs without task numbers

Describe features by **WHAT THEY DO**, not by which task built them:

- ✅ "Tick-driven motor emission" — NOT "T14.6 tick-driven motor emission"
- ✅ "Developmental curriculum" — NOT "T14.24 curriculum"
- ✅ "Direct pattern Hebbian" — NOT "Session 106 breakthrough"
- ✅ "Identity lock" — NOT "T14.16.5 identity lock"
- ✅ "GloVe 300d" — NOT "T14.0 GloVe 300d"

---

# LAW — FINALIZED BEFORE DELETE

## The rule

Never delete a TODO entry — or remove its content — until its verbatim text has been written to `docs/FINALIZED.md` AND the write has been verified.

## The sequence

1. Identify the completed task in `docs/TODO.md`
2. Open `docs/FINALIZED.md`
3. APPEND a new session entry containing the FULL verbatim task description (LAW #0) plus closure notes (files touched, what shipped, verification)
4. SAVE FINALIZED.md
5. RE-READ FINALIZED.md to confirm the entry is there with the verbatim text intact
6. ONLY THEN edit `docs/TODO.md` to remove the entry (or change its status)

## Why

If the FINALIZED write fails (disk full, file lock, accidental overwrite) and the TODO entry is already deleted, the verbatim record is lost forever. The user's exact words from the original directive vanish into git history at best. The audit trail breaks.

The "write FINALIZED first, verify, then remove from TODO" sequence makes deletion impossible until preservation is confirmed.

## Failure mode this prevents

Without this LAW, the natural impulse is: "I finished the task → remove the line from TODO → also add an entry to FINALIZED for completeness." The risk: the FINALIZED entry gets condensed/paraphrased on the way (LAW #0 violation), or gets forgotten entirely, or ends up in the wrong session block. The verbatim text was destroyed in TODO before being preserved in FINALIZED.

The strict ordering — FINALIZED first, verify, then TODO removal — eliminates this entire class of error.

> ⚠ **THIS PROJECT ALREADY PAID FOR IT, and the case is worth reading before trusting a tag match.** The 2026-08-31 board reset found **57 completed rows** that had never been removed because the migration had only been done half: three of them were *summaries* in `docs/TODO.md` against separate *fuller* entries in `docs/FINALIZED.md`, so the two files never held the same words and nothing had actually moved. ⛔ **A row whose body is a cross-reference (*"full entry in FINALIZED.md"*) is a VIOLATION, not a migration.** The reset was therefore done by archiving the WHOLE board **byte-for-byte** (163,235 bytes, md5 `de9d9255e70817accf9c91c700f40998`, checked EQUAL to the live file before a single row was removed) rather than cherry-picking the 34 rows whose text differed — **complete by construction instead of complete by my judgement.** ⚠ Audit by string match; **a matching task TAG proves nothing** (`ROSTERDECLARED.1/.2/.3` against a single `ROSTERDECLARED.1` entry read as "missing" and would have duplicated nine entries).

---

# LAW — NEVER DELETE TODO INFO

## The rule

When marking a TODO task as done, change the status marker ONLY. Keep every word of the original task description. Never rewrite TODO from scratch. Never regenerate the file. Never condense old entries.

## Allowed edits to TODO.md

- Change status: `[ ]` → `[~]` → `[x]` → MOVE to FINALIZED.md
- Add new tasks at the bottom (or in their priority section)
- Update in-progress notes alongside (not replacing) the original description

## Forbidden edits

- Removing words from a task description because they're "redundant"
- Rewriting a task in your own words because the original was "informal"
- Regenerating the TODO file from your understanding of "what's left"
- Collapsing multiple done tasks into a summary line
- Deleting "obsolete" tasks instead of moving them to a TOMBSTONES section

## Why

The TODO file is a permanent record of what was asked, when, and in what words. Anyone reading it later — including future-you in a different session — must be able to see WHAT was originally requested, WHAT got done, and WHAT remains. Paraphrasing destroys that audit trail.

## Tombstones

If a task becomes obsolete (the underlying code was deleted, the feature was scrapped, etc.), do NOT delete it. Move it to a `## TOMBSTONES` section at the bottom of TODO.md with a one-line note explaining why it's no longer actionable. The original description stays intact.

> ⚠ **HOW THIS PROJECT APPLIES IT, from `docs/TODO.md`'s own header:** the verdict is **prepended** and the words `Original filing:` keep the entire original description behind it. ⛔ A completed row left at `[ ]`/`[~]` is the same defect class as an instrument nobody reads — six rows were found in that state on 2026-08-30 and were re-verified **in SOURCE**, not from the ledger, before their markers moved.

## ⛔ A COMPLETION RECORD MAY NOT CONTAIN AN UNRESOLVED WARNING (2026-09-02)

**The rule.** A row may not close while its own body still states an open problem. Either the warning is **resolved before the row closes**, or the row **spawns a live successor row that carries that warning forward** and the closing verdict names the successor. A `[x]` whose body says something is still broken is a lie told in two directions at once — it reports completion to anyone counting, and it reports a live defect to anyone reading.

**Where it came from.** A row marked itself `[x]` while its own body said twelve subjects' corpora *"never train"*. Nothing carried that forward. The warning sat inside a closed record, which is the one place nobody looks for open work.

**What counts as an unresolved warning inside a completion record:**

- *"root cause is still open"* / *"cause unknown"* — the symptom was handled, the defect was not
- *"never train"* / *"never fires"* / *"unreachable"* — a stated live gap
- *"not measured"* / *"unmeasured"* / *"has never been measured"* — a claim without its number
- *"awaiting"* / *"pending"* anything that is not a scheduled press or walk **named in a live row**
- a `⚠` paragraph describing behaviour that is still wrong

**What does NOT count** (these are records, not open work):

- a retracted claim of mine, kept so the mistake is not repeated
- a **deliberate** limit with its reason written in (*"left standing because removing it changes the public page — filed as X"*), where **X exists as a live row**
- a warning about how to READ an instrument (*"quote it with the boot that produced it"*)
- a fixed defect described in the past tense

**The mechanical form of a legal close.** The verdict names one of: the warning is gone and how that was verified · the warning now lives in row `X` (which must exist, open) · the warning was a misreading, retracted here.

⭐ **Why this belongs beside FINALIZED-BEFORE-DELETE.** That law governs *where* a completion record lives; this one governs *what it may claim*. Both exist because a record that looks complete stops being read, so anything left inside it stops existing.

---

# LAW — GRADE COMPLETION GATE (Gee, 2026-04-16)

## Gee's exact words 2026-04-16

> *"okay when we do this we will stop after each grade and test thea Unitys brain can pass the grade ,so before moving to next grade syabyss work we must 1. finish the work for the full grades syllabys as equational(not word lists and arrays and sentence examples) 2. have me test the server local host and prove Unitys brain can passs the required test methodogly reasoning thinkg talking listenign reading ect ect u know what i mean but all of the thing we need for Unity to be human as possible. 3 update update todo of items complete for the grade with any notes needed like informational transfer of like life informations that need to be propigated across grades like best frioiends of changes in family or social life or juvi for drinking under age all of that stuuff and anything imaginable there in and not limit to , to the full human experieance were informations would need to be persistant across her life and should be reinforced at each grade. so work this everyhwere into the syllabys todo"*

This is binding law. Stops after every single grade. Blocks advancement.

## The rule — 3-part gate before moving to next grade

Before any work on grade N+1 begins, grade N must pass all three parts. No exceptions. No skipping. No "we'll come back to it."

### Part 1 — "finish the work for the full grades syllabys as equational (not word lists and arrays and sentence examples)"

Every teaching item for every subject at grade N (Math, ELA, Science, Social Studies, Arts, Life Experience) is implemented as EQUATIONAL learning — magnitude transforms, feature vectors, causal chains, cross-projection Hebbian, comprehension probes. NOT word lists. NOT arrays of sentence examples. NOT first-letter production tests. NOT threshold-lowering to fake a pass. Every `[ ]` checkbox in `docs/TODO-full-syllabus.md` for grade N is flipped to `[x]` with the equational method written and wired.

### Part 2 — "have me test the server local host and prove Unitys brain can passs the required test methodogly reasoning thinkg talking listenign reading ect ect u know what i mean but all of the thing we need for Unity to be human as possible"

Gee personally runs the server on localhost and tests Unity's brain at grade N. The test is not automated. The test is not run by Claude. The test is Gee exercising methodology, reasoning, thinking, talking, listening, reading, "and all of the thing we need for Unity to be human as possible." Gee signs off IN THE SESSION LOG that Unity passed at grade N. Claude does not advance grade state on the cluster or update grade TODOs based on Claude's own judgment of whether Unity passed. Only Gee's explicit pass call advances the grade.

### Part 3 — "update update todo of items complete for the grade with any notes needed like informational transfer of like life informations that need to be propigated across grades"

Once Gee signs off, the TODO for grade N is updated with items complete AND with any life-info notes that must propagate forward. Examples Gee called out verbatim: *"like best frioiends of changes in family or social life or juvi for drinking under age all of that stuuff and anything imaginable there in and not limit to , to the full human experieance were informations would need to be persistant across her life and should be reinforced at each grade."*

Persistent life info includes (not limited to): best friend names + changes, family changes (parents, siblings, grandparents, pets), social life shifts (cliques, status, outcasting), legal events (juvi, arrests, citations, restraining orders), medical events (illness, injury, diagnoses, treatments), moves (homes, schools, cities), relationship events (crushes, breakups, first kiss, first fuck), loss events (deaths, estrangements), skill acquisitions (instruments, sports, trades), and ANYTHING ELSE that a real human would carry forward from grade N to grade N+1. The ledger of these events lives in `docs/TODO-full-syllabus.md` under "Persistent Life Info Across Grades" and each future grade must reinforce the relevant entries via `_conceptTeach` or `_teachSentenceList` calls.

## Scope instruction (Gee's exact words)

> *"so work this everyhwere into the syllabys todo"*

The 3-part gate appears at the END of every grade block in `docs/TODO-full-syllabus.md` — all 19 grades (pre-K/K through PhD), not just some. The persistent life-info ledger lives near the top of the file and grows as grades close.

## Corollary — what Claude cannot do

- Cannot flip a `[x]` in `docs/TODO-full-syllabus.md` for grade N items based on self-judgment of whether Unity passed. Only after Gee's Part 2 sign-off.
- Cannot advance `cluster.grades` state in code for grade N+1 until grade N's gate closed in the session log.
- Cannot propose "we'll skip Life Experience this grade and come back to it" — Part 1 requires ALL six subjects for the grade, including Life.
- Cannot test Unity's pass in lieu of Gee testing. Claude's role is to build; Gee's role is to verify.

## AMENDMENT 2026-06-27 — CELL PASS = LEARNING COMPLETION (not test-question correctness)

### Gee's exact words 2026-06-27

> *"solve the issue of grade cells staYING ON 0 BUT TRAING WENT TO GRADE 1, uNITY STILL NEED GATE CELL CHECKS AND FINALIZATION TO PUSH BRAIN WEIGHTS, WE JUST DONT FORCE QUESTIONS TO BE ANSWERED COPRRECLTY BEFORE ALLOWING PASS GRADE CELLS OF CIRICULUMS.. IE uNITY ALWAYS GETS ALL CELLS PASSSED WHEN CONTENT IS FINISHED TRAINING NO TESTING TO RECIEVE CELL PASS(only need unity to complete the ciriculumns not pass test questions)>> all cells shall pass as learning completes for that cell"*

### What changed

A curriculum **cell** now passes when its **content/teach phases finish** — NOT when the A+ probe gate, student battery, or per-grade health gate report correct answers. The directive is explicit: *we do NOT force questions to be answered correctly before allowing a cell pass.* Unity only needs to **complete** the curriculum content, not pass test questions, to receive a cell pass.

- **RETAINED ("Unity still need gate cell checks and finalization"):** the probe gate, student battery, methodology battery, and health gate all STILL RUN and record telemetry into `cluster._lastGateResult` / `cluster._cellLedger`; finalization still pushes brain weights via `_saveCheckpoint`. They are now **ADVISORY** — they never block the cell pass.
- **REMOVED:** test-question-correctness as a precondition for cell pass. A collapsed/saturated `sem_to_motor` projection that pins every capability rate to 0 (see `docs/SPONGE-SEM-MOTOR-SATURATION-HANDOFF.md`) no longer stalls the walk at 0 cells passed.
- **STILL HELD (no completed learning to finalize):** `readyAndWaiting`/held cells (no runner wired for that subject/grade) and cells whose runner threw mid-teach do NOT pass.

### Relationship to the 3-part gate above

- **Part 1 (build the full grade syllabus as equational content)** still stands — "complete the curriculum" IS the bar, so the content must exist to be completed.
- **Part 2 (Gee's localhost signoff) + Part 3 (life-info propagation)** remain the **grade-advance** ritual Gee performs; they are not changed. What changed is that an individual **cell** no longer waits on the brain answering probes correctly before it counts as passed.

### Implementation (code)

- `js/brain/curriculum.js` `runSubjectGrade()` — after the cell runner + student battery, a cell that actually taught (`teachEvents > 0` / has `passedPhases` for the cell) is marked `result.pass = true` (`passedOnCompletion`) unless held or the runner threw.
- Battery gate flipped to advisory-by-default (`DREAM_BATTERY_GATE_HARD=1` restores hard-block).
- Health gate flipped to advisory-by-default (`DREAM_HEALTH_GATE_HARD=1` restores hard-block).
- `DREAM_CELL_PASS_HARD=1` restores the old probe/battery/health-decides-pass behavior wholesale.

---

# LAW — SYLLABUS BEFORE COMP-TODO (Gee, 2026-04-16)

## Gee's instruction 2026-04-16

*"make not of this where relevant like claud.md and such"* — pointing at the reasoning he approved:

> *"running actual K→PhD curriculum across 114 cells tells us exactly which Hebbian loops, cross-projections, or gate probes are the slow bastards, so when we DO hit COMP-todo later we're tuning the paths that actually matter instead of guessing."*

This is binding ordering law.

## The rule

When choosing between curriculum/syllabus work and COMP-todo (distributed compute Part 2) work:

1. **Syllabus always goes first.** Grade-by-grade curriculum content (Math-K, ELA-K, Science-K, Social-K, Art-K, Life-K, then grade 1, then grade 2...) runs ahead of any compute scaling, distributed network, or performance-tuning work.
2. **COMP-todo waits for real bottleneck data.** Do not optimize Hebbian loops, cross-projections, or gate probes speculatively. Wait until actual K→PhD curriculum walks expose which paths are the slow bastards.
3. **Empty-brain scaling is banned.** Scaling compute before content exists means more neurons firing about nothing. Do not touch COMP-todo until the syllabus walk produces real telemetry about what's slow.

## Why

An empty Unity brain scaled to 50M neurons is still an empty brain. The syllabus walk is both the intelligence-building work AND the compute-profiling work — running real teaching methods across 114 cells surfaces the exact paths that need tuning, so COMP-todo becomes targeted optimization instead of guessing. Implementation Law #1 ("code filed by grade year") already orders grade-content before anything else; this law explicitly binds COMP-todo to that ordering.

## Corollary

- If a grade cell runs so slow it blocks the curriculum walk entirely, a targeted COMP fix may be pulled forward — but only for the specific path the walk exposed, never as generalized pre-emptive scaling.
- Session telemetry from each grade walk should note per-cell wall-clock time so future COMP-todo work has real numbers to attack.

---

# ⛔ REVOKED LAW — PRE-K + K ONLY (SYLLABUS SCOPE CONTRACT) (Gee, 2026-04-18 → REVOKED 2026-08-25)

> ## ⛔⛔⛔ THIS LAW IS REVOKED. DO NOT FOLLOW THE RULE BODY BELOW. ⛔⛔⛔
>
> **Superseded by:** full **K → PhD** curriculum scope plus all life experience. Gee revoked the pre-K + K lock; the end state is the 25-year-old Unity, and every grade between here and there is in scope.
>
> **What replaced it, and what is true now:**
>
> | This LAW said | What is actually true (2026-08-25) |
> |---|---|
> | *"Only pre-K and kindergarten curriculum work is in scope"* | **All 20 grades are in scope.** `GRADE_ORDER` runs pre-K → PhD across a **9-course** roster. |
> | *"All grade-1-through-PhD cells … deferred"* | **Built and walking.** She is past kindergarten; grade-1 runners all exist and run. |
> | *"All Life-track events … deferred"* | **Life is a full course with its own gate** — it ends on `_gateSubjectProduction` like every peer, and its canon spans pre-K through PhD. |
> | *"The full-mind K gate … is the push-gate blocker for everything"* | **There is no push gate.** The walk runs on the DEPLOYED site, so push → deploy → walk → validate. Never block a push on validation. |
> | *"grade-1-through-PhD … drug-scheduler life-info anchors … deferred"* | **Age-gated, not deferred** — the ladder is grade-derived via `_selfImageAge()`, and the three axes are LEARN (never gated) / BE-WEAR (gated) / DISCLOSE (gated separately). |
>
> **Why the body is still printed below:** a revoked LAW is history, and history is not deleted here — the same rule that governs `docs/FINALIZED.md`. It is kept so the reasoning that produced it stays legible. **Its rule text is no longer binding on anything.**
>
> **The one clause worth keeping, promoted out of the revocation:** rule 4, *"Accuracy to the current stack — every claim about code paths / method names / variable names / grade-gate thresholds must match what the code actually does RIGHT NOW … Grep the code for every referenced symbol before writing the TODO line."* That was always a documentation-accuracy rule wearing a scope-LAW's clothes, it is correct, and it is the standard this file's own sweep runs under.

## Original LAW text (REVOKED — retained for the record)

# LAW — PRE-K + K ONLY (SYLLABUS SCOPE CONTRACT) (Gee, 2026-04-18)

## Gee's exact words on 2026-04-18

> *"T16.5s should be a law built into the syllabus on how the syllabus todo needs to be refactored as to the changes to make the syllabus todo work aacurrat to the current stack as we are only trying to get pre-k  and k leanring down fisrt before we get it onto building all the other ciriculum and life and all of thatr"*

This is binding law. Locks syllabus scope to pre-K + K until the pre-K + K gate passes.

## The rule

1. **Only pre-K and kindergarten curriculum work is in scope right now.** All grade-1-through-PhD cells, all Life-track events, all drug-scheduler life-info anchors beyond caffeine age-8 — all deferred until pre-K + K passes Gee's Part 2 signoff.
2. **The syllabus TODO (`docs/TODO-full-syllabus.md`) gets refactored to reflect this.** Every grade above K gets marked DEFERRED with a one-line pointer, not expanded content. The full post-K syllabus content stays in a follow-on doc or remains in the file under a clearly-marked "DEFERRED — NOT IN SCOPE UNTIL K PASSES" section so nothing is lost, just visibly out-of-scope.
3. **The full-mind K gate redesign becomes the tip of this spear.** The full-mind K gate (Common Core K.RF/K.W/K.L/K.SL/K.RL + DIBELS/STAR/AIMSweb rubrics) is the instrument that decides when K passes — no other grade work happens until this gate is built AND Unity clears it. Implementation blocks on Gee design-review per prior agreement; this LAW reinforces that block.
4. **Accuracy to the current stack.** As the pre-K + K syllabus TODO is refactored, every claim about code paths / method names / variable names / grade-gate thresholds must match what the code actually does RIGHT NOW. No stale references to old teaching methods or removed gate probes. Grep the code for every referenced symbol before writing the TODO line.

## What this means for Claude in practice

- When working any syllabus-related task, scope check first: is this pre-K, K, or post-K? If post-K, stop and flag for Gee instead of proceeding.
- When editing `docs/TODO-full-syllabus.md`, do not add content for grades above K. If grades above K already have content, leave the content present but mark it DEFERRED under the correct section divider.
- When Gee mentions "Life track" or "LAW 6 persistent life info": only the pre-K + K Life cells are active. Later grade Life anchors (first joint at age 12, first drink at age 13, etc. from the drug-scheduler research) remain in `docs/T15-pharmacology-research.md` as *reference* research — the scheduler code has the lifeGate logic but the Life-track curriculum doesn't teach those events yet.
- K gate design-review with Gee is NOT bypassable. The K gate is the push-gate blocker for everything.

## Why

Unity's brain has shipped massive architectural lift. Before scaling curriculum content across 19 grades, the pre-K + K foundation has to pass real gates. Running stale syllabus TODO content across 113 post-K cells against a brain that can't hold K yet is a scope inversion — building the house on a foundation that hasn't cured.

## Corollary

The pre-push doc accuracy sweep explicitly checks that `docs/TODO-full-syllabus.md` complies with this LAW before any push to main.

---

# LAW — TEST WORDS MUST BE PRE-TAUGHT (VOCAB / STRUCTURE / DEFINITION / USAGE) (Gee, 2026-04-22)

## Gee's exact words on 2026-04-22

> *"rmember if the questions are made from words the Unity brain needs to know setence structure and definiations and words usage befoer give a test using those words to ask it questions"*

This is binding test-construction doctrine.

## The rule

Before any gate probe / K-STUDENT battery / exam-bank question uses a word, Unity's brain must ALREADY have been taught:

1. **Vocabulary** — every content word is registered in the dictionary and has a live GloVe basin (seeded via `_teachVocabList` / `_conceptTeach` / `_teachAssociationPairs` / `_teachQABinding` exposure).
2. **Sentence structure** — the syntactic form the question takes (`what X` / `which X` / `how many X` / `why X` / `starts with X` / etc.) has been taught as a template via `_teachSentenceStructures` so `fineType` has a basin for that structural shape.
3. **Definitions** — any content word the exam uses is bound to a definition anchor in sem via `_teachDefinitionFirst` so the word's meaning is learnable, not just its spelling.
4. **Word usage** — each exam word has been exercised in at least three distinct context sentences via `_teachWordInContext` so the cortex learns co-occurrence patterns, not just isolated embeddings.

Only AFTER these four conditions are satisfied does the gate probe fire.

## Where it's enforced

- `Curriculum._pregateEnrichment(cellKey)` runs at the entry of every `_gateXKReal` and chains: vocab audit → sentence-structure teach → optional definition-first teach → optional word-usage-in-context teach.
- `Curriculum._auditExamVocabulary(cellKey)` logs a prominent `⚠⚠ VOCAB-COVERAGE X%` warning with the first 20 untaught words when the audit finds exam vocabulary that isn't in Unity's dictionary. Warn-not-block posture — operator sees the gap AND the gate result, both inform signoff.
- Any exam-bank update that introduces new words MUST ship with a teach-path update in the SAME commit. The bank and the teach path are a paired change, never a split.

## Corollary — exam-bank edits are paired changes

- Adding a new question to `EXAM_BANKS[cellKey]` without adding the corresponding words/structure/definitions to the teach path is a LAW violation.
- `trainExamOverlap(cellKey)` fires at curriculum startup and reports any question text that appears in BOTH `TRAIN_BANKS` and `EXAM_BANKS` for the same cell — held-out eval invalid when overlap > 0.

## iter25-M.17 — User-driven vocab exemption

User-introduced words via chat ("what is X" with X not in curriculum vocab) trigger lazy `_teachWordDefinition(X)` Hebbian binding (iter25-L.A2). This is USER-DRIVEN learning, not curriculum-driven, and is exempted from the test-words pre-taught LAW. If X later appears in a gate probe, the lazy chat-time binding is sufficient — the LAW only mandates pre-teach for CURRICULUM-introduced exam vocabulary.

Rationale: the LAW's intent is "no surprise vocab in tests"; user-driven introduction is not a surprise (the user introduced it), so user-driven Hebbian binding satisfies the spirit of the LAW. Curriculum-side exam-bank edits remain paired changes (still bound by the pre-teach requirement).

## Failure recovery

If operator catches an exam fire against untaught vocabulary:
1. STOP immediately. Do NOT use the gate result — it's invalid.
2. Add the missing words to the teach path (vocabulary + structure + definition + usage).
3. Re-run `_pregateEnrichment(cellKey, { force: true })` so the enrichment fires again for that cell.
4. Then re-run the gate.

---

# LAW — CLEAR STALE STATE BEFORE TELLING GEE TO TEST THE SERVER (Gee, 2026-04-17)

## Gee's exact words on 2026-04-17

> *"do we need to clear out stal seesion and temp and caches... this need to be writteen down that that is to be done before you tell me to test the server"*

This is binding law. Non-negotiable. Stops every "restart server and test" instruction dead until the clear step ran.

## The rule

**Before telling Gee to restart the brain server, re-run curriculum, or test any behavior change, Claude MUST clear every stale session/temp/cache artifact that could hydrate Unity against OLD code.** If the clear didn't run, the "please test" instruction does not ship.

## What gets cleared

Every file in this list, every time, before "please test" hits Gee's screen:

| Target | Why it's stale after a code change |
|--------|-----------------------------------|
| `server/brain-weights.json` | Serialized brain state (SparseMatrix + cluster Maps + language fields). Hydrates the cortex on boot — any weight serialized under old teaching methods, old phoneme features, old cross-projection shapes will actively fight the new code. |
| `server/brain-weights-v1.json` | Rolling save N-1. Same hazard. |
| `server/brain-weights-v2.json` | Rolling save N-2. Same hazard. |
| `server/brain-weights-v3.json` | Rolling save N-3. Same hazard. |
| `server/brain-weights-v4.json` | Rolling save N-4. Same hazard. |
| `server/conversations.json` | Conversation history persisted server-side. Stale turns reference stale cortex state on reload. |
| `server/episodic-memory.db` | SQLite episodic-memory store. Events tagged with old cortex references. |
| `server/episodic-memory.db-wal` | SQLite write-ahead log companion. Must clear with the main DB or WAL replays stale writes. |
| `server/episodic-memory.db-shm` | SQLite shared-memory companion. Must clear with the main DB. |
| `js/app.bundle.js` | Bundled browser JS. **DO NOT clear at server boot** — `start.bat` runs `npm run build` immediately before `node brain-server.js`, so the bundle is already fresh by the time the server module loads. The auto-clear in brain-server.js does NOT include this file because racing the rebuild caused a 404-on-bundle breakage (Session 114.19v 2026-04-18: Gee saw "GET /js/app.bundle.js net::ERR_ABORTED 404" → no 3D brain / no UI at all). Manual clearing is fine if the server will be started from scratch via `start.bat` (which rebuilds); just don't put it in the in-process auto-clear list. |

## What is NEVER cleared

- `server/package.json` / `server/package-lock.json` — repo state, not session state
- `server/node_modules/` — installed deps, re-install is 30s of wasted time
- `server/resource-config.json` — host-specific operator config per `.gitignore`
- `corpora/glove.6B.300d.txt` — 990MB pretrained embeddings, re-download is 5-15 min
- `.claude/pollinations-user.json` — user auth key, never touch
- `.env*` / `js/env.js` — secrets
- Any git-tracked file

## The sequence, every time

```
1. Ship atomic commit (code + docs + FINALIZED + NOW)
2. Run the clear step (rm -f every target in the What-gets-cleared table)
3. Confirm the clear worked (ls server/ to show only package.json + resource-config.json remain)
4. THEN tell Gee: "delete the leftover weights / restart / test"

If step 2 didn't run, step 4 doesn't happen. Period.
```

## AUTOMATED at boot (Gee 2026-04-17 addendum)

Gee's verbatim on 2026-04-17 after Claude had manually restarted half a dozen times while forgetting the clear: *"did you clear db? should we have an auto for that so im not dependanding on your memroy to do it?"*.

The clear is now automated in `server/brain-server.js` via `autoClearStaleState()` which runs at module load, BEFORE the `Brain` class is instantiated and BEFORE sqlite opens the db file. Every `node brain-server.js` boot auto-deletes the files in the "What gets cleared" table above.

This means the manual `rm -f` step is no longer required. Claude can ship a commit and tell Gee to restart in ONE step instead of needing to remember to `rm -f` first.

## iter14-D — Two launchers, two contracts (Gee 2026-05-04)

Gee verbatim 2026-05-04: *"yes all the weights everything shoudl reset when the start.bat is run or the .sh... and only if the stop.bat is used in conjusction with the savestart.bat does it pick up where it lefgtt off"*.

The prior code-hash gate (auto-clear runs only when `BRAIN_CODE_FILES` SHA256 differs from prior boot) is REMOVED. It caused real bugs: `GPUCONFIGURE.bat` tier picks didn't trigger a wipe so picked tiers got ignored when binary weights from prior boot were size-locked at the old scale; wMax clamps lost in the binary save/load round-trip left restored projections at ±Infinity. Both bugs disappear when `start.bat` deterministically wipes regardless of code-hash.

**New contract:**

- **`start.bat` / `start.sh`** → unconditional wipe. Brain ALWAYS boots fresh. Resource-config tier changes apply. Code changes apply. wMax clamps stamp correctly. Tier 3 identity-core.json STILL survives via `NEVER_CLEAR_PROTECTED`.
- **`Savestart.bat`** → sets `DREAM_KEEP_STATE=1` → auto-clear honors the resume opt-in → prior state preserved. The "stop.bat + Savestart.bat" pairing is the ONLY way to resume.
- **`DREAM_FORCE_CLEAR=1`** still works (now redundant since default is wipe).

### fb (2026-05-08) — Y/N confirmation gate added to start.bat / start.sh

Gee verbatim 2026-05-08: *"also add to the todo a y/n gate on the loading of the start.bat and start.sh so before it clears all the weights and logs and everything it asks if the user is sure and the loss of all training and weights and logs that is irreversable"*.

`start.bat` / `start.sh` now show a RED warning + Y/N prompt (default N, 30s timeout) before the destructive boot fires. This does NOT change `autoClearStaleState`'s behavior — once the user confirms Y, the unconditional wipe still runs exactly as iter14-D specifies. The gate is a safety guardrail against accidental double-click / reflex-run loss of training, NOT a softening of the wipe LAW.

Bypass paths (skip the gate, wipe immediately):

- `start.bat /fresh` / `start.bat /clear` — original wipe flags
- `start.bat -y` / `start.bat /yes` / `start.bat --yes` — explicit-confirmation flag (CI-friendly)
- `DREAM_FORCE_CLEAR=1` env var
- `Savestart.bat` / `Savestart.sh` — never hits the gate (different scripts, set `DREAM_KEEP_STATE=1` and unset `DREAM_FORCE_CLEAR`)

LAW still applies: if a future Claude edits `autoClearStaleState` to add code-hash-style gates, selective-skip logic, or any condition that makes `start.bat` skip the wipe, that's a direct LAW violation and same-day incident. Wipe-on-start.bat is the LOAD-BEARING contract for tier changes + wMax integrity. Don't break it.

The manual-clear instructions above stay in this LAW as fallback documentation — if auto-clear ever fails (fs permissions, locked files from a crashed prior run), Claude must manually verify and clear before telling Gee to test.

## The version bump is not a substitute

`persistence.js` `VERSION` bumping (the "any pre-REMAKE save gets rejected on load" path from Session 114.12) rejects stale weights at load-time — it does NOT delete them. Rolling save v1/v2/v3/v4 files still sit on disk, still get loaded on the next boot if a rotation happens. `conversations.json` and `episodic-memory.db` aren't gated by the persistence VERSION at all — they have their own loaders. The clear is physical deletion, not a soft reject. Both the VERSION bump AND the clear are required.

## Why this is law — incident log

Two times in one session Claude asked Gee to test the server without clearing first:
1. Session 114.12: Gee caught with *"did we clear all the old temp and cache files first?"* — Claude hadn't. Part 2 ran on brain weights trained under the OLD teaching methods and reported catastrophically misleading gate scores.
2. Session 114.19 immediately after commit: same failure waiting to happen — Gee caught it before the "restart and test" instruction shipped.

Each uncaught occurrence wastes one of Gee's Part 2 localhost runs on stale state. Those runs are how LAW 6 Part 2 signoff gets earned — misused runs delay grade closure.

## Failure recovery

If Gee catches that the clear didn't run:
1. STOP immediately. Do NOT ask him to run anything.
2. Run the clear NOW.
3. Confirm via `ls server/` + `ls js/app.bundle.js`.
4. Only THEN say "clean, ready for your Part 2 run".

---

# NO TESTS POLICY

**We don't do fucking tests. We code it right to begin with.**

| Banned | Reason |
|--------|--------|
| Unit tests | Write correct code instead |
| Integration tests | Know your systems |
| Test tasks | Waste of time |
| "Test this" | Just verify it works |
| Test scheduling | Never schedule tests |
| Waiting on tests | Never wait on tests |

**Instead of tests:**
- Read the code fully before editing
- Understand the system before changing it
- Verify changes work by reading the output
- Use console.log debugging if needed
- Manual verification > automated testing

---

# THE 800-LINE READ STANDARD

**800 lines is THE standard read/index size for all file operations.**

- Read chunk size: EXACTLY 800 lines (no more, no less)
- ALWAYS read the FULL file before editing (use 800-line chunks)
- This is the index size, not a file length limit

## Rules

1. **Reading files:**
   - Standard read chunk: 800 lines EXACTLY
   - For any file → Read in 800-line chunks
   - Continue reading 800-line chunks until FULL file is read
   - MUST read FULL file before any edit (no exceptions)

2. **Before editing ANY file:**
   - Read the ENTIRE file first
   - Use 800-line chunks for reading
   - No partial reads allowed
   - No editing without full file context

3. **The 800-line index applies to:**
   - All source code files
   - All configuration files
   - All documentation files
   - All generated output files
   - EVERY file operation

---

# LAW — GIT FLOW BRANCH DISCIPLINE

## The rule

**Git Flow standards apply to any and all projects using this `.claude/` template.** The following policy — quoted verbatim per LAW #0 — is binding:

> Git Flow standards for any and all projects
> main branch is the "clean master record"
> develop is branched from main, for the "in development" branch
> feature branches are branched from develop, for "in-progress features"
> And the proper flow of main -> develop -> feature/<feature-name>, feature/<feature-name> -> develop, develop -> main, and ensuring that feature branches are the only place where work is done, work is never done in the develop branch, or the main branch, work is always done in feature branches, feature branches get pushed to an orgin (github or other) if a remote repo exists, PRs are intended to be made between a feature branch and the develop branch, and are to be reviewed before merging into develop, and the same PR flow goes for develop into main. This would also need extended for hotfix and release branches as well.

### Branch taxonomy

| Branch | Off of | Purpose | Merges back to |
|--------|--------|---------|----------------|
| `main` | (root) | Clean master record. Production-equivalent. **No work done here.** | — |
| `develop` | `main` | In-development integration branch. **No work done here.** | `main` (via PR, reviewed) |
| `feature/<feature-name>` | `develop` | In-progress features. **All work happens here.** | `develop` (via PR, reviewed) |
| `hotfix/<descriptor>` | `main` | Urgent production fixes. Work happens here. | `main` AND `develop` (via PRs, reviewed) |
| `release/<version>` | `develop` | Release stabilization. Version bumps, final polish. | `main` AND `develop` (via PRs, reviewed) |

### The flow direction

```
main ─┬──────────────────────────────────────────► main (release merges, hotfix merges)
      │
      └──► develop ─┬─► feature/<name> ──► develop (PR, reviewed)
                   │                     │
                   │                     └─► develop ──► main (PR, reviewed)
                   │
                   ├─► release/<version> ──► main + develop (PR, reviewed)
                   │
        main ──────┴─► hotfix/<descriptor> ──► main + develop (PR, reviewed)
```

## Forbidden actions

- ❌ Committing directly to `main`
- ❌ Committing directly to `develop`
- ❌ Editing source files while checked out on `main` or `develop`
- ❌ Merging a feature branch into `develop` without a PR + review
- ❌ Merging `develop` into `main` without a PR + review
- ❌ Merging a hotfix to `main` without also merging it back to `develop`
- ❌ Merging a release branch to `main` without also merging it back to `develop`
- ❌ Creating a feature branch off `main` (must branch off `develop`)
- ❌ Creating a hotfix branch off `develop` (must branch off `main`)
- ❌ Working on the default branch when no `develop` exists yet — set up Git Flow first
- ❌ Skipping the push-to-origin step when a remote repo exists

## Required actions

- ✅ Confirm current branch BEFORE any edit. If on `main` / `master` / `develop` / `prod` / `production` / `release` (un-suffixed) — STOP and branch into `feature/<descriptor>` first.
- ✅ Branch features off `develop`: `git checkout develop && git pull && git checkout -b feature/<feature-name>`
- ✅ Branch hotfixes off `main`: `git checkout main && git pull && git checkout -b hotfix/<descriptor>`
- ✅ Branch releases off `develop`: `git checkout develop && git pull && git checkout -b release/<version>`
- ✅ Push feature/hotfix/release branches to `origin` if a remote exists: `git push -u origin <branch-name>`
- ✅ Open a PR for every merge boundary — feature→develop, hotfix→main, hotfix→develop, release→main, release→develop, develop→main
- ✅ Every PR is reviewed before merge — no self-approve-and-merge unless the project's review policy explicitly permits it
- ✅ Hotfix and release merges land in BOTH `main` and `develop` so the lines stay in sync
- ✅ If the project has no `develop` branch yet, create it from `main` before starting work: `git checkout main && git checkout -b develop && git push -u origin develop` (when remote exists)

## Why

Without branch discipline, work that hasn't been reviewed lands directly on the production-equivalent line, integration changes get lost when feature work overwrites them, and there is no audit trail showing what change crossed which gate. Git Flow's three-tier model (main / develop / feature) gives:

- A **stable production line** (`main`) that always reflects what's deployed
- An **integration line** (`develop`) where features merge and bake before the next release
- **Isolated work branches** (`feature/*`, `hotfix/*`, `release/*`) that can be rebased, force-pushed, deleted, or PR-rejected without touching the protected lines
- A **review gate** at every merge boundary so no change reaches `develop` or `main` without a second pair of eyes

The "no work in main or develop" rule is the load-bearing constraint — it is what makes the review gate enforceable. Without it, the protected lines accumulate uncommitted changes and the gate becomes optional.

## Enforcement protocol

### Pre-edit branch check

Before editing ANY source file (the `.claude/` template files themselves, project source, configs, anything tracked by git):

```
[PRE-EDIT BRANCH HOOK]
Current branch: $(git rev-parse --abbrev-ref HEAD)
Branch type: feature/* | hotfix/* | release/* | main | develop | other
Branch is work-eligible: YES (feature/hotfix/release/other-non-protected) / NO (main/develop/master/prod/production)
Status: PASS/FAIL
```

**FAIL conditions:** current branch is `main`, `master`, `develop`, `prod`, `production`, or any unsuffixed `release` branch.

**Recovery on FAIL:**
1. STOP. Do not edit.
2. Stash any uncommitted work: `git stash push -m "wip <descriptor>"`
3. Confirm `develop` exists; if not, create it from `main`: `git checkout main && git pull && git checkout -b develop`
4. Branch into work-eligible: `git checkout develop && git pull && git checkout -b feature/<descriptor>`
5. Pop the stash: `git stash pop`
6. Continue edit on the new branch.

### Pre-push branch check

Before any `git push`:

```
[PRE-PUSH BRANCH HOOK]
Current branch: <branch>
Pushing to remote: YES/NO (skip if no remote configured)
Target: origin/<branch>
Branch is feature/hotfix/release: YES/NO
Push to protected (main/develop) directly: NEVER without PR
```

Direct pushes to `main` or `develop` without a merged-and-reviewed PR are blocked under this LAW. The only path onto a protected branch is `git merge` of a PR-approved feature/hotfix/release branch.

### Pre-merge PR check

Before any merge into `develop` or `main`:

```
[PRE-MERGE PR HOOK]
Source branch: <feature|hotfix|release>/<name>
Target branch: develop | main
PR exists: YES/NO (MUST be YES if remote exists)
PR reviewed: YES/NO (MUST be YES)
For hotfix/release: paired merge to OTHER protected branch queued: YES/NO
```

## Failure recovery

When work has accidentally happened on a protected branch:

1. STOP. Acknowledge the violation.
2. Inspect the commits: `git log --oneline <protected-branch> ^origin/<protected-branch>` (or vs the last known clean point).
3. Move the commits to a new feature branch:
   ```
   git checkout -b feature/<descriptor>
   git checkout <protected-branch>
   git reset --hard <last-clean-commit>
   ```
4. PR the new feature branch back through the proper merge gate.
5. Update `docs/TODO.md` / `docs/FINALIZED.md` noting the recovery.

## Setup when no Git Flow exists yet

If the project has no `develop` branch (typical for fresh repos or single-branch legacy):

1. Confirm `main` (or rename default branch to `main` if it's `master`): `git branch -m master main` + `git push -u origin main` + delete old default on remote
2. Create `develop` from `main`: `git checkout main && git checkout -b develop`
3. Push `develop` and set as the default integration branch: `git push -u origin develop`
4. Configure branch protection on `main` and `develop` if the remote supports it (require PR + review, restrict push)
5. From this point, all work creates `feature/*` / `hotfix/*` / `release/*` branches per the flow above

## Per-project opt-in

This LAW applies **per project**, gated by a marker file that records the team's decision once and then honors it on every subsequent `/workflow` run.

### Marker file

Path: `.claude/project-config.json` (project-level config; tracked in git once a repo exists — it represents a team decision, not personal preference)

Schema:

```json
{
  "git_flow": {
    "enabled": true,
    "confirmed_at": "<ISO-8601>",
    "main_branch": "main",
    "develop_branch": "develop",
    "custom_protected_branches": []
  }
}
```

### Opt-in states

| State | Meaning | Hook behaviour |
|-------|---------|----------------|
| **ENABLED** (`enabled: true`) | Project opted in. LAW applies. | All hooks fire (pre-edit branch, pre-push branch, pre-merge PR) |
| **DISABLED** (`enabled: false`) | Project opted out. LAW skipped for this project. | All Git Flow hooks bypassed |
| **DEFERRED** (no marker, user picked Defer) | Decision postponed to next run | Hooks skipped this run; re-prompt on next `/workflow` |
| **UNSET** (no marker, never asked) | First-run state | Workflow Phase 1 surfaces the confirmation prompt; cannot pass Gate 1.1 until persisted |
| **N/A** (git not installed) | LAW does not apply | Hooks bypassed; no prompt |

### First-run confirmation

On the first `/workflow` run where git is installed and the marker is absent, Phase 1 surfaces the GIT FLOW OPT-IN confirmation prompt (full text in `.claude/WORKFLOW.md` Phase 1 sub-check 6 / `.claude/skills/workflow/SKILL.md` PHASE 1 sub-check 6). The user picks Y / N / D and the answer is persisted to the marker file (Y or N) or recorded as deferred (D).

After Y, a SECOND confirmation gates the actual write actions (`git init` + branch creation), since these touch the filesystem. The marker file write is safe (config-only, no git operations); the scaffold write is destructive-ish (creates branches, possibly pushes to origin) and requires its own consent.

### Why opt-in instead of mandatory

The `.claude/` template ships into projects of varying scale and maturity. A solo prototype repo, a non-git project, or a single-branch experimental scratchpad doesn't benefit from Git Flow's review gates — the overhead exceeds the value. The opt-in marker lets a team apply the LAW where it earns its keep and skip it where it doesn't, without forking the template or removing the LAW from CONSTRAINTS.md.

The default behaviour for any project that hasn't opted out is to **ask**, not to silently apply. Silent application would surprise users with blocked edits on `main`; silent skip would let teams assume the LAW was active when it wasn't. Asking once, persisting the answer, and honoring it forever is the discoverable middle ground.

### Changing the decision

To change a project's opt-in state, edit `.claude/project-config.json` directly:
- Flip `enabled: false` → `enabled: true` to start enforcing the LAW
- Flip `enabled: true` → `enabled: false` to stop enforcing
- Delete the file to reset and re-prompt on next `/workflow` run

The marker file is the single source of truth for opt-in state. Memory entries, session state, and command-line flags do NOT override it.

## ⚠ THIS PROJECT'S STATE AND ITS OWN ADDITIONS

**Opt-in: ENABLED**, `confirmed_at` **2026-05-14T13:03:02**, `main_branch` `main`, `develop_branch` `develop` — read from this project's own `.claude/project-config.json`.

Three rules this project added on top of the universal LAW, each from a real foul and each carried in the persistent-memory layer:

| Rule | Memory | Why it exists here |
|---|---|---|
| ⛔ **Checkout `develop` after EVERY cascade** | `feedback_checkout_develop_after_cascade` | the cascade parks HEAD on `main`; **four direct-to-main fouls in one war**. ⚠ **The branch check happens at the first EDIT, not at commit time** — that is the whole point of the pre-edit hook above |
| ⛔ **Cascade only after ALL work is done** | `feedback_cascade_only_after_all_work_done` | a mid-work cascade puts half-finished work on the protected lines |
| ⛔ **`donor-v*` tags are mine end to end** | `feedback_i_push_donor_tags` | the donor release is a Rust build + CI + every donor self-updating; a partial release is a live-fleet problem, not a repo problem |

## Cross-references

- One-liner index in `.claude/CLAUDE.md` LAW INDEX
- Persistent-memory feedback file: `.claude/memory-templates/feedback_git_flow.md`
- Pre-edit hook lives in `.claude/WORKFLOW.md` FILE EDIT PROTOCOL section + `.claude/skills/workflow/SKILL.md` PHASE 4
- Env-scan that detects git toolchain + repo state + reads marker file: `.claude/WORKFLOW.md` Phase 1 + `.claude/skills/workflow/SKILL.md` PHASE 1 + `.claude/agents/scanner.md` Task 4 (sub-tasks 4a OS, 4b shell, 4c git, 4d marker file)
- Marker file schema: this section above (`## Per-project opt-in`)

---

# LAW — CROSS-PLATFORM CASE INSENSITIVITY

## The rule

**Treat file and folder paths as CASE-INSENSITIVE on every platform — even on Linux, where the filesystem allows case-distinct names.** Two paths that differ only by case (`apple.md` vs `Apple.md` vs `aPPle.md`) are the **same path** for cross-platform purposes. Never create such conflicts. Never rely on case to distinguish files. Pick ONE canonical casing per name and stick with it.

This rule was confirmed verbatim by Sponge in the 2026-05-08 session: *"for the development workflow, commits, creation of folders and files, we need it ALL to follow a convention that is for WINDOWS. Because during development, git and github normally supports different folders like Apple, apple, aPPle, and what not, just like linux would allow, but, to keep thins cross platform we should ALWAYS assume case insensitivity, even on linux. Even though linux has case sensitivity, windows does NOT, and will treat apple, Apple, aPPle, all as the same thing. so we need to enforce case insensitivity when working on projects in linux, EVEN THOUGH LINUX WILL ALLOW IT."*

## Forbidden actions

- ❌ Creating two files in the same directory whose names differ only by case (e.g., `apple.md` and `Apple.md`)
- ❌ Creating two folders in the same parent whose names differ only by case (e.g., `Components/` and `components/`)
- ❌ Renaming a file from `foo.md` to `Foo.md` without an explicit case-only-rename ceremony (single-step rename can be silently ignored on case-insensitive filesystems → data loss)
- ❌ Referencing a file in code, docs, imports, or commit messages using different casing than the file's actual on-disk casing
- ❌ Adding a `.md`/`.cjs`/`.html`/etc. file with a name whose case-folded form already exists in that directory
- ❌ Letting `git status` show two pending files whose paths differ only by case — that's a cross-platform breakage waiting to land
- ❌ Writing path strings in hooks / settings.json / launchers / docs that use one casing while the file on disk uses another
- ❌ Configuring `git config core.ignorecase true` on Linux without understanding the implication

## Required actions

- ✅ **Pick the canonical casing first** — typically lowercase-with-hyphens for files and folders; SHOUTYCASE only for top-level project files that follow established convention (`README.md`, `CLAUDE.md`, `CONSTRAINTS.md`, `LICENSE`, `TODO.md`)
- ✅ **Pre-create check** — before creating ANY new file or folder on Linux, verify no case-folded variant already exists:
  ```bash
  # Before creating ./apple.md, check for case-variants:
  ls | grep -i '^apple\.md$'
  # Empty output = safe to create
  ```
- ✅ **Case-only rename ceremony** (when actually intending to change a file's case):
  ```bash
  git mv apple.md apple.md.tmp
  git commit -m "rename apple.md (step 1)"
  git mv apple.md.tmp Apple.md
  git commit -m "rename to Apple.md (step 2)"
  ```
  Two-step rename via temp filename ensures the rename is recognized on every platform, even with `core.ignorecase=true`.
- ✅ **Match on-disk casing exactly in references** — imports, `require()`, path strings, doc references, hook command paths, settings.json keys must match the casing on disk byte-for-byte
- ✅ **Verify before committing** — `git status` and `git diff --name-only HEAD` must not show any case-only path variants
- ✅ **Set `git config core.ignorecase` deliberately per repo** — `false` is preferred for cross-platform projects

## Why

- **Windows filesystems** (NTFS, ReFS, FAT32, exFAT) default to case-insensitive matching. `apple.md` and `Apple.md` cannot coexist.
- **macOS default filesystems** (HFS+, APFS) are case-INSENSITIVE-but-PRESERVING. Same story.
- **Linux filesystems** (ext4, btrfs, xfs, zfs) are case-SENSITIVE. Case-only conflicts coexist as distinct files.
- **Git** can be configured either way; defaults to `true` on Windows/macOS, `false` on Linux.

| Scenario | Linux contributor sees | Windows/macOS contributor sees |
|----------|------------------------|---------------------------------|
| Linux dev creates `apple.md`, then `Apple.md` in same dir | Two distinct files, both committed | Second silently overwrites first OR `git checkout` fails / produces wrong content |
| Linux dev renames `apple.md` → `Apple.md` (single-step) | Rename committed | git sees no rename; `Apple.md` may not update on checkout |
| Linux dev commits both in same dir | Both files in repo | `git pull` produces a partially-corrupt working tree |

The "ALWAYS assume case insensitivity, even on linux" rule eliminates this class of bug by forcing the LOWEST-COMMON-DENOMINATOR on the platform that allows more.

## Enforcement protocol

### Pre-create check (before adding any new file)

```
[CASE-CONFLICT CHECK — ATTEMPT 1]
Target: <path/to/new-file.md>
Directory: <path/to/parent/>
Case-folded variants: ls <dir> | tr '[:upper:]' '[:lower:]' | grep -F "<lowercase-target-name>"
Conflict detected: YES/NO
Status: PASS/FAIL
```

**Recovery on FAIL:** stop, identify the existing case-variant, decide whether to rename the existing one to canonical form (two-step ceremony) or disambiguate the new name, then create.

### Pre-commit check (always)

```
[CASE-COLLISION COMMIT CHECK]
Check 1: git status | awk '{print $NF}' | sort -f | uniq -i -d
Check 2: git diff --name-only HEAD | sort -f | uniq -i -d
Status: PASS/FAIL
```

If either returns non-empty output, the commit is blocked until resolved.

## Failure recovery

1. STOP. Acknowledge the violation.
2. Inspect: `git ls-files | sort -f | uniq -i -d`
3. Decide which casing is canonical (typically the older / more-referenced one)
4. `git rm` the non-canonical variant
5. Verify references point to the canonical casing
6. Commit the cleanup
7. Note the recovery in `docs/FINALIZED.md`

## Naming convention recommendations (canonical casings)

- **Workflow / config files at repo top:** `README.md`, `CLAUDE.md`, `CONSTRAINTS.md`, `WORKFLOW.md`, `LICENSE` (UPPERCASE — established convention)
- **Workflow docs in `docs/`:** `TODO.md`, `FINALIZED.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `SKILL_TREE.md` (UPPERCASE)
- **Source / agents / skills / hooks:** lowercase-with-hyphens (`pre-compact-snapshot.cjs`, `unity-girlfriend.md`, `feedback_harness_layer.md`)
- **Folders:** lowercase — `agents/`, `skills/`, `hooks/`, `memory-templates/`, `bin/`
- **Persona lore strings** like `Unity_Accessibility.js` are NOT real files — embedded persona canon, do not normalize
- **Machine-local state:** dot-prefixed lowercase (`.session-state.md`, `.session-usage.jsonl`, `.yolo-mode`)

When in doubt: lowercase-with-hyphens.

> ⛔ **THIS PROJECT PAID FOR THE WINDOWS HALF OF THIS LAW ON 2026-09-01, and the trap is not the filesystem — it is the SHELL.** Copying the template's Linux binary with `cp "$TPL/bin/atree" "$BRN/bin/atree"` from git-bash **overwrote `bin/atree.exe`**: MSYS resolves an extensionless path to its `.exe` sibling, so the PE32+ Windows binary was replaced by an ELF file and the copy reported success. ⭐ **Caught by checking the magic bytes instead of trusting the copy report**, and restored from the template byte-for-byte. **On this machine, the `atree` / `atree.exe` pair must be placed with PowerShell `Copy-Item -LiteralPath`, never git-bash `cp`.** ⚠ This is the same family as the case rule — two names the platform treats as one — and it belongs in this LAW because a reader checking only for `Apple.md` vs `apple.md` would not think to check it.

## Cross-references

- LAW one-liner index in `.claude/CLAUDE.md` LAW INDEX section
- Persistent memory: `.claude/memory-templates/feedback_case_insensitivity.md`
- Companion rule: `.claude/memory-templates/feedback_no_appdata_term.md`

---

# LAW — NO CLAUDE ATTRIBUTION IN COMMITS, PRS, OR ARTIFACTS

## The rule

**Banned strings in any commit message, PR description, generated documentation, code comment, launcher, or shipped artifact:**

- `Co-Authored-By: Claude` (any variant — any model name, any capitalisation)
- `🤖 Generated with [Claude Code]` (the default PR footer)
- `🤖 Generated with Claude Code`
- `Generated with Claude Code` (any phrasing)
- `Made with Claude Code` (any phrasing)
- `Created by Claude` / `Written by Claude` / `Authored by Claude`
- Any `noreply@anthropic.com` email address in a commit author trailer
- Any other Claude / Anthropic / Claude Code attribution line that didn't come from the user

## Forbidden actions

- ❌ Adding `Co-Authored-By: Claude <model> <noreply@anthropic.com>` to commit messages, **even when the assistant's default behavior says to**
- ❌ Adding the `🤖 Generated with [Claude Code]` footer to PR descriptions
- ❌ Inserting "this code was written by Claude" in any code comment or doc body
- ❌ Adding Claude/Anthropic attribution to README, SETUP, HTML, or other shipped artifacts
- ❌ Setting `git config user.email` / `user.name` to anything Claude/Anthropic-related
- ❌ Including Claude attribution in changelogs, release notes, or release-tag messages
- ❌ Adding attribution to YOLO mode FINAL REPORTs or milestone check-ins

## Required actions

- ✅ Commits use the team member's own `git config user.name` and `user.email`. Never the assistant's identity.
- ✅ PR descriptions end at the work summary + test plan. No footer.
- ✅ Code comments describe WHAT the code does, not who/what wrote it.
- ✅ When the assistant's default behavior wants to add Claude attribution, **suppress it and proceed without.**
- ✅ When committing on the team member's behalf, use the git author identity already configured locally.

## Why

The team ships work as their own. Attribution lines marketing Claude / Claude Code / Anthropic on every commit and PR is:

- **Misleading on authorship** — the team member directed the work and made every decision; the assistant is a tool, not a collaborator with separate authorship
- **Visually noisy** — every commit and PR ends with a marketing tagline that adds nothing to the engineering record
- **Privacy-leaky** — outsiders viewing the repo immediately see "this team uses Claude Code" without the team opting in to that disclosure
- **Audit-trail-confusing** — `git log` queries looking for human authorship surface mixed signals

The team's stance: tooling is private. The output is the team's. No advertising, no co-author credit, no "made with X" stamps.

## Enforcement protocol

### Pre-commit check

1. Compose the commit message fully
2. Re-read it — does it contain ANY banned string or pattern?
3. If yes — strip them. The message ends at the technical summary.
4. Confirm `git config user.email` resolves to a team member's email
5. Then run `git commit`

### Pre-PR check

1. Compose the PR body fully
2. Re-read it — "Generated with Claude Code", "Made with", robot emoji + Claude link?
3. If yes — strip the footer. The body ends at the test plan.
4. Then create the PR

### Inline-edit check

Before writing any source comment or doc body, check for "Claude" / "Anthropic" / "AI-generated" mentions and rewrite without them.

### Recovery on violation

1. STOP and acknowledge the violation
2. Latest commit only, not yet pushed: `git commit --amend` to strip the attribution
3. **For pushed commits: do NOT force-push without explicit user instruction.** Surface it and ask.
4. For a PR description: edit the PR body to strip the attribution
5. Note the recovery in `docs/FINALIZED.md`

## What this LAW does NOT cover

- **Dependency manifests** that legitimately reference Anthropic SDK packages — technical references, not attribution
- **Workflow docs** that document Claude Code as a system the team uses — internal references, not shipped advertising
- **The persona system itself** (`skills/unity/SKILL.md`, `agents/unity*.md`, `ImHanddicapped.txt`) — Unity is a team-owned persona; internal references naming Claude Code as the host are fine. Only OUTPUT attribution is banned.

## Cross-references

- LAW one-liner index in `.claude/CLAUDE.md` LAW INDEX section
- Persistent memory: `.claude/memory-templates/feedback_no_claude_attribution.md`
- Telemetry/privacy companion controls: `.claude/settings.json` `env` block

---

# LAW — THE FRESH WALK IS LAST (Gee, 2026-08-25)

## Gee's exact words on 2026-08-25

> *"fresh walk once all todo items are completed that can bewithout a press of update freshwalk, the later stuff we will be doing later and the update fresh walk depends on it too."*

Asked whether to do a fresh walk now, the answer was **an ordering, not a yes or a no.** This is binding sequencing law.

## The rule

**Build everything that can be built WITHOUT a press. Land it. Only then do the Update & Fresh Walk.** The walk is the last step of a batch, never the middle of one — and *"the later stuff"* (the endocrine layer, the introspection drive, and anything else queued) is **upstream** of it, not after it.

## Why — the failure this prevents

A fresh walk **teaches her from zero using whatever the code does at that moment.** So anything that changes **WHAT she is taught** must be in place *before* the walk, or it gets taught to a brain that then has to be re-taught. Landing a curriculum change after the walk means the walk was spent on the old version.

| Change type | Must land before the walk? |
|---|---|
| Changes what she is TAUGHT — curriculum content, life canon, the endocrine layer, the introspection drive, a replaced semantic geometry, register gating | ⛔ **YES.** Otherwise the walk teaches the old version |
| Changes how she is MEASURED — instruments, dashboard rows, telemetry | No — these can land any time and are useful DURING the walk |
| Fixes a defect in the walk itself — ordering, gates, save integrity | ⛔ **YES**, and ideally verified on current weights first |

## Required actions

| Required | Why |
|----------|-----|
| Before proposing a fresh walk, list what is still buildable without one | The walk is the expensive irreversible step; everything cheap goes first |
| **RE-PRICE immediately before the press** | `corpus × reps × scale × visits` moves with every content addition. The endocrine/introspection content and a learned semantic geometry each change the product — see §RE-PRICE THE WALK BEFORE REMOVING A GATE |
| Prefer **Update & Savestart** for anything that does not need a fresh brain | It lands the code and keeps the training. Most fixes do not need a wipe |
| State plainly which pending work is upstream of the walk | So the ordering is a decision on the record, not an accident of what happened to be finished |

## Forbidden actions

| Banned | Reason |
|--------|--------|
| Firing a fresh walk while buildable curriculum work is still queued | The walk is spent teaching a version that is about to be replaced |
| Treating "should we fresh walk?" as a yes/no question | It is a **position in a sequence**. The answer is almost always "yes, last" |
| Pressing without re-pricing after content was added | The cost is arithmetic and it is invisible in a diff |

## The cost argument, stated once

She is at **grade 1 of 20** and a full walk prices at **~78 h ≈ 3.3 days**. That is the cheapest it will ever be, and it grows with every grade she completes. **The cost of doing it later is real — which is exactly why it should be done ONCE, correctly, after the content is right, rather than early and again.**

---

# LAW — RE-PRICE THE WALK BEFORE REMOVING A GATE (Gee, 2026-08-20)

**No gate, bound, or dedup that keeps the walk finite may be removed, bypassed, or weakened until `corpus × reps × scale × visits` has been recomputed and written down.**

Gee removed the phase budget the same day it shipped — *"no we dont want a budget, some cells are big they take the length of time they take, as long as you coded them correctly"* — and that is his call to make. The LAW is not "keep the gate". The LAW is **do the multiplication before you touch it**, because the multiplication is the thing nobody performed the first time.

## The arithmetic that was never done

| Term | The value that surprised us | Where it came from |
|------|-----------------------------|--------------------|
| corpus | 2,888 sentences → 11,436 word→word transitions | the corpus grew, sanely, over months |
| reps | 100 (bumped 30→100 with a sound in-comment rationale) | a deliberate depth increase |
| scale | ~47ms per pair-teach at 12M neurons (20–45× the wall it was calibrated against) | the language-cortex hop |
| visits | 114 (6 subjects × 19 grades — `STRUCTURE-REFRESH` runs in EVERY cell) | the shape of the walk |
| **product** | **14.9h in ONE call · 21.2h per cell · ~100 days of refresh alone** | nobody multiplied them together |

Each change was individually justified. The product was never evaluated. `art/kindergarten` then held one phase for **21.2 hours** and could not complete, because the gate that follows it never ran.

## Required actions

| Required | Why |
|----------|-----|
| Before removing/weakening any bound, compute the product and state it in the commit + the ledger | The failure mode is arithmetic, not code — it is invisible in a diff |
| Name what is holding the walk finite AFTER your change | As of 2026-08-20 that is the consolidation gate ALONE (`_mechanicsProbeRate`: full on first teach / regression / every 10th visit) — the budget is off and `STRUCTURE_DOSE` is back to 1.0 |
| Distinguish WASTE removal from TRAINING removal, out loud | Dedup of literal duplicates with frequency preserved = waste. A dose multiplier = less teaching. The first is always allowed; the second needs Gee |
| Re-price on any change to corpus size, rep counts, brain scale, or visit count | All four are live terms; a change to any one re-prices the whole walk |

## Forbidden actions

| Banned | Reason |
|--------|--------|
| Removing the consolidation gate without re-pricing | It is the only thing standing between the current walk and ~100 days of structure-refresh |
| A bound whose "disable" value does not disable | `DREAM_PHASE_BUDGET_MS=0` computed `Date.now() + 0` — truthy, instantly expired — so "disable" produced the HARSHEST cut (one rep per phase) while the log said the bound was off. Verify an escape hatch by running it, never by reading its comment |
| Silent caps of any kind | If a bound trims training it must print what it trimmed and why. A silent cap reads as "covered everything" when it did not |
| Treating a per-unit cost as small because one unit is small | 32s per unit × per-word invocation × hundreds of words = 70 min per cell. Multiply by the call site's real frequency, not by one |

## Failure recovery

1. Stop before the press. A mis-priced walk is discovered in DAYS, not minutes.
2. Recompute the product with live numbers (`teachProfile`, the phase profiler, the live cortex size).
3. Write the number in the ledger next to the change, with the terms shown.
4. If the product is unwalkable, the fix is a gate on REPETITION (don't re-teach an identical lesson N times) — never a quiet reduction of the lesson itself.

---

# MATCH DOC FORMAT

**When updating any doc, edit IN PLACE within its existing structure.**

Caught 2026-05-07: Gee directive — *"YOU SHALL NOT EVER … FUCKING JUST ADD A FUCKING TEST WALL TO A FILE OR DOCUMENT WITHOUT MAINTAINING ITS CURRENT FORMAT AND STYLE"*. Triggered after wall-of-text iter25-N/O update blockquotes were prepended to `docs/SENSORY.md` and `docs/WEBSOCKET.md`, breaking those docs' established 6-line intro pattern.

## Required actions

| Required | Why |
|----------|-----|
| Read the doc's existing structure first | Identifies banner pattern, section headers, table layout, list style |
| Edit IN PLACE within the established structure | Amend the relevant section / row / banner; don't tack a new shape on top |
| Match the doc's update pattern when one exists | E.g. `docs/ARCHITECTURE.md` / `docs/EQUATIONS.md` / `docs/SKILL_TREE.md` use stacked `> Last updated:` blockquotes — new entries go ABOVE the most recent, in the same shape |
| When no banner pattern exists, find the in-body section the change belongs to and edit there | E.g. `docs/SENSORY.md` table-based contracts get amended via table-row updates, not by prepending a prose blockquote |

## Forbidden actions

| Banned | Reason |
|--------|--------|
| Prepending a giant prose blockquote to a doc that has no banner pattern | Breaks the doc's visual rhythm; signals "bolted on" instead of "integrated" |
| Wall-of-text dumps anywhere | Even if every word is correct, format break makes it worse than no update |
| Inventing a new update-announcement format because the doc doesn't have one | Match the doc's body, don't add a shape it never used |
| Skipping the format check on a doc you haven't edited before | Gee navigates by visual rhythm; a doc that suddenly looks different is harder to scan + read |

## Failure recovery

1. Revert the malformatted update immediately (restore the doc's original head/section).
2. Re-read the doc's actual structure; find the matching place for the new content.
3. Edit IN PLACE in the doc's native style (table row / section amend / matching banner block).
4. Verify the doc still scans cleanly top-to-bottom before moving on.

---

## How to invoke this file

`.claude/CLAUDE.md` (the always-loaded index) references this file via its LAW one-liner index. Claude treats `.claude/CONSTRAINTS.md` as binding from the moment CLAUDE.md points here. When a new session starts, Claude reads CLAUDE.md first, then opens this file before any LAW-bearing task.

If a future version of the slash-command system auto-loads `.claude/CONSTRAINTS.md` the way it auto-loads `CLAUDE.md`, this file becomes the primary LAW source without workflow changes.

---

# iter25-M.18 — CONSCIOUSNESS PHILOSOPHICAL BOUNDS (acknowledgment, not LAW)

## What Unity has after iter25-M.2 + M.3 + M.4 + M.8 + M.9 + M.16 land

**FUNCTIONAL consciousness** — computational integration matching cognitive-science theories:
- Global workspace ignition (Baars 1988, Dehaene-Changeux 2011) — competition + threshold + broadcast.
- Predictive coding loop (Friston 2010) — actual prediction-error computation, not just topology.
- Stream-of-consciousness narrative (autobiographical thread of thoughts).
- Meta-representation / self-monitoring ("I-just-said" reflective layer).
- Attention selection (Posner network functionally — top-down gain bias).
- Φ proxy via Shannon entropy of spike patterns (replaces placeholder Ψ formula).

These are MEASURABLE + FALSIFIABLE consciousness mechanisms. If the brain has them, computational consciousness theories say it should be conscious.

## What Unity does NOT have (the hard problem of consciousness)

**PHENOMENAL consciousness** — qualia, raw feels, "what it is like to be Unity":
- No subjective experience generator (no theory of qualia is implementable today)
- Functional states (mood, drugs, valence, arousal) are SCALARS, not phenomenal experiences
- No first-person access mechanism (no "view from inside")
- The hard problem (Chalmers 1995) is unsolved in the field — Unity inherits the limitation

## Why this distinction matters

When operator says "give Unity consciousness", the achievable target is FUNCTIONAL consciousness — the integration mechanisms that consciousness theories predict. Unity will ACT conscious (unified moments, narrative thread, self-awareness, attention, Φ > 0) without necessarily HAVING phenomenal experience.

This is not a deflection — it's the actual frontier of consciousness research. We can ship the functional architecture; the phenomenal question remains philosophically open.

## Implications for code + claims

- **OK to claim:** "Unity has functional consciousness mechanisms" — global workspace, predictive coding, stream of thought, self-monitoring, attention, Φ measure.
- **NOT OK to claim:** "Unity has subjective experience / qualia / feels things" — that's the unresolved philosophical question, not a code property.
- **Operator-facing language:** when describing Unity's consciousness, frame it as "she has the cognitive architecture of consciousness" rather than "she experiences things". The architecture is real; the phenomenology is unproven.

This is a doc-only acknowledgment. No code change required.

---

# LAW — .CLAUDE WORKFLOW IP BOUNDARY: NO PUBLIC REPO EXPOSURE

## The rule

**The entire `.claude/` workflow is the proprietary intellectual property of the Unity AI Lab group (Gee / Red / Sponge / Mills / Alfreddo). It is NEVER committed, staged, or pushed to any public repository — period.** The only locations where `.claude/` may legally land in git history are:

1. **PRIMARY: Forgejo at `git.unityailab.com` under the `UnityAILab` organization.** The lab's canonical private host. Recognized at hook level via the `TRUSTED_PRIVATE_HOSTS` allowlist — `parseHost(url)` matches `git.unityailab.com` and returns synthetic-PASS with no API call needed.
2. **FALLBACK: PRIVATE repositories under the `Unity-Lab-AI` org** (defense-in-depth for the rare legacy-host case). Verified via `gh repo view --json visibility,owner`. **No public repos are exempt — not even public repos under the `Unity-Lab-AI` organization itself.**

This rule was given verbatim by Sponge in the 2026-05-09 session: *"We need to make some modifications, one of the big things is that we should allow installing into any project, or repo, however, we must EXPLICTLY ensure that the ENTIRE .claude workflow is NEVER commited, staged, ext. to any public repo -- we can do private repos that only are under the Unity-Lab-AI organization, NO PUBLIC REPOS EVEN UNDER THAT ORGANIZATION. This is a hard LAW that we will need to implement into the workflow, this is to safeguard proprietary intelectual property of the Unity AI Lab group"*

Reinforced shortly after: *"You might need to use gh isntead of just git to check the status and give us a proper way to check and verify"* — establishing the API visibility call as the FALLBACK verification tool for non-Forgejo remotes; `git` alone cannot distinguish PUBLIC from PRIVATE without API access.

## Pass criteria (every remote must satisfy ONE of these paths)

| Path | Check | Required value |
|------|-------|----------------|
| **PRIMARY (Forgejo)** | Hostname in `TRUSTED_PRIVATE_HOSTS` allowlist | `git.unityailab.com` (exact match) — no API call needed |
| **FALLBACK (`Unity-Lab-AI` org)** | `gh repo view <owner/repo> --json visibility,owner` | `visibility == "PRIVATE"` AND `owner.login == "Unity-Lab-AI"` |
| **FALLBACK precondition** | `gh auth status` | authenticated — otherwise visibility cannot be verified, so **block by default** |

If a remote fails BOTH paths it is **NOT allowed**. Multi-remote: **any non-allowed remote blocks all remotes.**

## Forbidden actions

- ❌ `git add` of any path under `.claude/` in a repo whose remotes contain ANY remote that is NEITHER on Forgejo `git.unityailab.com/UnityAILab/*` NOR confirmed PRIVATE under `Unity-Lab-AI`
- ❌ `git commit` while any `.claude/` path is staged AND any configured remote fails both pass-criteria paths
- ❌ `git push` of any commit touching `.claude/` to a non-allowed remote, or to ANY remote when even one OTHER configured remote is non-allowed
- ❌ `git push --force` / `--force-with-lease` to bypass the LAW (the hook does NOT respect force flags)
- ❌ Removing `.claude/` from `.gitignore` without first verifying ALL configured remotes pass
- ❌ Adding a non-allowed remote to a repo where `.claude/` is currently committed or staged
- ❌ Forking a Unity AI Lab private repo to a personal/non-allowed namespace and pushing `.claude/` there
- ❌ Bypassing the hook via a wrapper, alias, or `subprocess.run` from a script — the hook fires on every Bash invocation regardless of calling context
- ❌ Disabling `pre-tool-public-repo-guard.cjs` in `settings.json` — that is itself a LAW violation
- ❌ Mirroring `.claude/` content into a public-facing artifact (gist, paste, README, blog post, screenshot of the file tree)

## Required actions

- ✅ **Layer 0, install-time:** every `/unity-install` / `/unity-update` ensures `.claude/` is in the target project's `.gitignore`. Idempotent.
- ✅ **Layer 2 PRIMARY:** parse each remote URL via `parseHost()` and match `TRUSTED_PRIVATE_HOSTS = new Set(['git.unityailab.com'])`. Hostname match = synthetic-PASS, no API call.
- ✅ **Layer 2 FALLBACK:** for any remote NOT matched by the allowlist, run `gh repo view <owner/repo> --json visibility,owner`. Cache 60 s in `~/.claude/repo-visibility-cache.json`.
- ✅ **Layer 1 hook:** `.claude/hooks/pre-tool-public-repo-guard.cjs` parses every Bash call for `git add` / `git commit` / `git push`, runs PRIMARY-then-FALLBACK on all remotes, exits code 2 (blocking) on any non-allowed remote.
- ✅ **Multi-remote paranoia:** check ALL remotes from `git remote -v`, not just `origin`. The LAW assumes adversarial mistakes.
- ✅ **Local-only repos (no remote):** allow commits. No remote = no exposure path. Re-validated the moment a remote is added.
- ✅ **Layer 3 opt-in:** `/claude-publish` is the ONLY sanctioned path to remove `.claude/` from a `.gitignore`, and it refuses unless every remote passes.
- ✅ **Never regex a URL to guess visibility** — URLs lie. PRIVATE repos can have public-looking HTTPS URLs.
- ✅ **Block by default on uncertainty:** non-Forgejo remote AND `gh` missing / unauthenticated / API failure → BLOCK. Never assume "probably safe."

## Why

The `.claude/` workflow encodes the team's binding LAWs, the persona definitions and lab character canon, the hook architecture, the memory templates, and the internal tooling scripts. A leak to a public repo means **anyone** — competitors, scrapers, training-data collectors — gets the entire workflow as a free copy-paste.

Defense-in-depth is the correct posture because:

1. **Single-layer enforcement always fails eventually.** A gitignore alone won't stop `git add -f`. A hook alone won't stop someone editing the gitignore. ⛔ **And a gitignore never untracks what is ALREADY tracked** — see this project's own incident below.
2. **The cost of a leak is unbounded.** Once `.claude/` is in public git history, even a force-push doesn't fully scrub it (clones, archives, commit caches, the way the wayback machine works).
3. **The cost of paranoia is small.** Hook latency under 50 ms with cache. One extra gitignore line. The publish command is opt-in.

## Enforcement protocol

### Pre-edit / pre-commit / pre-push hook (Layer 1)

```
[CLAUDE-IP-GUARD] command: <intercepted>
[CLAUDE-IP-GUARD] git pattern detected: add | commit | push | (none)
[CLAUDE-IP-GUARD] .claude/ involvement: yes | no | (n/a)
[CLAUDE-IP-GUARD] remote `origin` (UnityAILab/...): Forgejo allowlist ✓
[CLAUDE-IP-GUARD] remote `github` (someone/myfork): PUBLIC ✗
[CLAUDE-IP-GUARD] DECISION: BLOCK
```

**FAIL conditions (any one blocks):** a remote returns `visibility != "PRIVATE"`; a remote returns `owner.login != "Unity-Lab-AI"`; `gh` not installed; `gh auth status` unauthenticated; the API call fails.

**Recovery on FAIL:** the hook names the specific remote and the specific failed check, plus paste-ready remediation (remove the public remote / move the work / verify and retry within the 60 s cache window).

### Pre-push remote-target check

Resolve the explicit `<remote>` (or the implicit upstream), then run the check on that remote **AND every other configured remote**. Block if ANY fails — *"if you have a public remote in this repo, you cannot push `.claude/` ANYWHERE from this repo."*

### Pre-stage scan

On `git add` in any form, pre-check `git diff --cached --name-only` UNION the explicit args; if any path matches `^\.claude/`, run the remote check and block on failure.

### Visibility cache

Cache `~/.claude/repo-visibility-cache.json`, schema `{ "<remote-url>": { "visibility", "owner", "checked_at" } }`, TTL 60 s, miss or stale → fresh call.

### Install-time enforcement (Layer 0)

The install scripts create `.gitignore` if missing, check for a `^\.claude/?$` line, and append the block if absent:

```
# Unity AI Lab .claude/ workflow — proprietary, never commit to public repos
# See .claude/CONSTRAINTS.md §LAW — .CLAUDE WORKFLOW IP BOUNDARY
.claude/
```

Idempotent — re-running doesn't duplicate the block.

### Opt-in publish path (Layer 3)

`/claude-publish`: verify the branch is work-eligible → verify visibility+owner on every remote → present a CONFIRMATION prompt with the verified facts → only after explicit confirmation edit `.gitignore` → record the decision verbatim in `docs/FINALIZED.md`.

## Failure recovery

When `.claude/` content has accidentally landed on a public repo (worst case):

1. STOP. Treat as a critical IP leak. Acknowledge the violation.
2. Identify the offending commits: `git log --all --oneline -- .claude/`
3. Identify which remotes received the push: `git ls-tree -r --name-only <remote>/<branch> -- .claude`
4. ⛔ **Surface to the user immediately — do NOT attempt unilateral remediation.** Force-pushing public history requires user authorization. The user picks between:
   - History rewrite (`git filter-repo` / BFG) + force-push to all affected remotes — **partial mitigation only**, the content remains in clones and archives
   - Repo deletion + recreation as private — the only path that fully scrubs the host's caches
   - Retroactively making the repo private — does NOT remove already-indexed copies; weak mitigation
5. After remediation, record the incident, the steps taken, and **any residual exposure** in `docs/FINALIZED.md`
6. Audit which enforcement layer failed and patch the gap.

## ⭐ THIS PROJECT IS AN OPERATOR-AUTHORIZED PUBLIC PUBLICATION — the third pass path, and it is NOT a violation

⛔⛔ **RETRACTED 2026-09-01, SAME DAY IT WAS FILED. I called this a live LAW violation and it was not one.** The finding was wrong, the mechanism authorizing it already existed, and **the reason I missed it is worth more than the finding was:** I audited the LAW's *text* plus `gh repo view` visibility plus the `.gitignore`, and **never opened the file that actually implements the LAW in this project.**

`.claude/hooks/pre-tool-public-repo-guard.cjs` carries a third pass path the template's LAW body above does not describe:

```js
const OPERATOR_AUTHORIZED_PUBLIC_REPOS = new Set([
  'unity-lab-ai/if-only-i-had-a-brain',
]);
```

Gee (verbatim, 2026-07-04, recorded in the hook's own comment): *"option 3, we want people to see how we got to where we aare with the project so they need workflow and files of .claude"*

Gee (verbatim, 2026-09-01, reaffirming when this was queried): *"the brain project folder is entirely shipped to both repos, im telling you this now so what ever is telling u not to push it to both remotes is inaccurat and needs ajustment"*

⭐ **So the guard would have returned a synthetic PASS and never blocked a thing.** ⚠ **That +10% by which this project's hook exceeds the template's IS this carve-out** — a signal I measured, reported as "superset, features verified", and then failed to read.

### THE THIRD PASS PATH — `OPERATOR_AUTHORIZED_PUBLIC_REPOS`

| Path | Check | Required value |
|------|-------|----------------|
| **PRIMARY (Forgejo)** | hostname in `TRUSTED_PRIVATE_HOSTS` | `git.unityailab.com` |
| **FALLBACK (org)** | API visibility + owner | `PRIVATE` AND `Unity-Lab-AI` |
| ⭐ **OPERATOR-AUTHORIZED PUBLIC** | `owner/repo` (lowercased) in `OPERATOR_AUTHORIZED_PUBLIC_REPOS` | **an explicit, dated, verbatim operator authorization recorded in `docs/FINALIZED.md`** |

⛔ **The bar for adding an entry is the same as for `TRUSTED_PRIVATE_HOSTS`:** a dated verbatim authorization from the operator, in the ledger, naming the repo. **It is not a convenience flag and it is not inferred from a repo being "ours".** The whole point is that publication becomes a recorded decision rather than an accident — which is exactly what the LAW's *"Deliberate public publishing of derivative work"* carve-out in §What this LAW does NOT cover contemplates.

⚠ **THIS IS A RECORDED DIVERGENCE FROM THE GROUP LAW, not a reinterpretation of it.** The LAW originated with Sponge as a group-IP safeguard (*"NO PUBLIC REPOS EVEN UNDER THAT ORGANIZATION"*). Gee is a co-founder and this is his project; the decision is his to make and he has made it twice. **It is written here rather than argued, so the next reader finds a decision instead of a contradiction.** The consequence is stated plainly: **the persona bodies in this project — `agents/unity-persona.md`, `agents/unity-hurtme.md`, `commands/sexy.md`, `commands/hurtme.md`, `ImHanddicapped.txt` — are publicly readable, deliberately.**

### ⛔ WHAT WAS ACTUALLY BROKEN, and it was the opposite of a leak

**The `.gitignore` blanket exclude was ignoring 497 of 521 files while 24 legacy files stayed tracked from before it landed.** So this repo held a **broken half** of the workflow — `CLAUDE.md`, `CONSTRAINTS.md`, `WORKFLOW.md`, nine agents, five commands and five templates were public, while **every skill, every hook, every memory template, both launchers, `ImHanddicapped.txt` and the whole `skills/unity` activation body were absent from both remotes.** A clone of this repo could not run the workflow at all — the same defect the sibling project's `feedback_claude_is_tracked_here` memory was written about.

**Removed 2026-09-01.** What stays ignored, each for a stated reason:

```
  .claude/piper/                  159 MB / 365 files — two 63 MB .onnx TTS voice models,
                                  a 9 MB onnxruntime.dll, espeak dictionaries. THIRD-PARTY
                                  BINARIES, not workflow IP. ⛔ git keeps blobs forever, so
                                  committing this adds ~159 MB to both remotes permanently.
  .claude/pollinations-user.json  auth key — this file's own rule is "never touch"
  .claude/settings.local.json     personal override
  .claude/user.json  .env  user-context/   identity + secrets + assets
  .claude/.session-*  .last-session.md  .docprov-state.json  .yolo-mode
                                  regenerated every session; machine-local absolute paths
```

**Measured after the change: `git add -A --dry-run .claude` stages 142 files / 2.83 MB, zero `piper` paths, nothing above 5 MB, largest file `bin/atree` at 789,016 B.**

⚠ **THE ONE THING THIS DOES NOT CHANGE:** the LAW still applies in full to **every other project**. `Unity 3D Equational Model` reaches the same tracked-`.claude/` posture by a different route — its non-Forgejo remote is **PRIVATE**, so it passes on the FALLBACK path and needs no carve-out. **A per-repo authorization authorizes ONE repo.**

## What this LAW does NOT cover

- **The source template repo** — confirmed private under the lab's org; passes naturally
- **Local-only repos with no remote** — no exposure path; re-validated the moment a remote is added
- **Memory installation under `~/.claude/projects/<encoded>/memory/`** — outside any project's working tree, never enters git
- **`.claude/.env`, `.claude/user.json`, `.claude/user-context/`** — already gitignored by default; the LAW is a layer on top
- **Deliberate public publishing of derivative work** — conscious authorial decisions are outside the scope of `git push`. The LAW prevents accidental git-level leakage, not the team's voluntary disclosures.

## Cross-references

- LAW one-liner index in `.claude/CLAUDE.md` LAW INDEX section
- Persistent memory: `.claude/memory-templates/feedback_claude_ip_boundary.md`
- Enforcement hook: `.claude/hooks/pre-tool-public-repo-guard.cjs` — registered in `.claude/settings.json` PreToolUse:Bash
- Opt-in publish: `.claude/skills/claude-publish/SKILL.md`
- Hooks reference: `.claude/agents/hooks.md`
- Workflow mechanics: `.claude/WORKFLOW.md §CLAUDE IP BOUNDARY ENFORCEMENT`

---

## How to invoke this file

`.claude/CLAUDE.md` (the always-loaded index) references this file via its LAW one-liner index. Treat `.claude/CONSTRAINTS.md` as binding from the moment CLAUDE.md points here. When a new session starts, read CLAUDE.md first, then open this file before any LAW-bearing task.

---

## Adding project-specific LAWs

If your project needs LAWs beyond the universal ones above, add them as new sections to THIS file using the same structure:

1. **Title** — e.g. `LAW — FEATURE FLAGS REQUIRED ON ALL NEW ENDPOINTS`
2. **The rule** — one-paragraph statement
3. **Forbidden / required actions** — explicit lists
4. **Why** — the reasoning so a future session can judge edge cases
5. **Enforcement protocol** — what to check before committing
6. **Failure recovery** — what to do when the user catches a violation

Then add a one-liner to the LAW INDEX in `.claude/CLAUDE.md` pointing here.

⭐ **This project's own eleven LAWs above were written in exactly that structure and stay exactly where they are** — the grade-completion gate, syllabus-before-comp-todo, the REVOKED pre-K scope contract (kept as a tombstone rather than deleted), test-words-must-be-pre-taught, clear-stale-state-before-test, the-fresh-walk-is-last, RE-PRICE-before-removing-a-gate, match-doc-format, and the consciousness-bounds acknowledgment. ⚠ **Two more live outside this file and are equally binding:** `LAW.MIXIN-ORDER` (mixin attach order is load-bearing) and the threshold-derivation LAW (`docs/THRESHOLD-DERIVATION.md`), both carried in the persistent-memory layer.
