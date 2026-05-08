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

This is binding law.

## The rule

Task numbers, session numbers, and milestone identifiers (`T14.0`, `T13.7`, `Session 106`, `Task #3`, etc.) + the user's name (`Gee`) are **BANNED** from all non-workflow-doc files. Allowed **ONLY** in internal workflow documents and task lists.

## Where task numbers + the user's name ARE allowed

| File | Why |
|------|-----|
| `docs/TODO.md` | Active task list |
| `docs/FINALIZED.md` | Completed task archive |
| `docs/NOW.md` | Session snapshot / task list |
| `docs/ARCHITECTURE.md` | Workflow system doc |
| `docs/ROADMAP.md` | Workflow milestone doc |
| `docs/SKILL_TREE.md` | Workflow capability doc |
| `docs/EQUATIONS.md` | Workflow equation reference |
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
