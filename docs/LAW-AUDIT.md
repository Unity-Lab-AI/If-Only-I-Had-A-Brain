# LAW AUDIT — proposal for consolidation

> **Status:** proposal only. No LAW has been changed. Operator decides what to accept / reject / rewrite.
> **Trigger:** reviewer critique #4 — *"LAW ceremony is heavy. 10+ binding laws in CLAUDE.md, multi-page doc discipline, session-log ritual. Some of that is real discipline. Some of it is process substituting for outcomes — if the brain actually learned, you wouldn't need this much scaffolding around verifying that it learned."*
> **Response:** the critique is partly fair. Some LAWs overlap; some are documenting scar tissue from specific incidents. Others are load-bearing. This doc audits every LAW currently in `.claude/CLAUDE.md`, proposes a consolidation that preserves the substance, and leaves the edit decision with the operator.

## The LAWs as currently listed

Enumerating each LAW in `.claude/CLAUDE.md` (in order of appearance):

| # | Name | Source date | Load-bearing? | Overlap with |
|---|------|-------------|---------------|--------------|
| **LAW #0** | Verbatim words only — never paraphrase operator | 2026-04-14 (four violations logged) | **YES** — actively enforced, caught violations multiple times this month | none |
| LAW | TODO file rules (never delete task descriptions, append-only) | baseline | YES | FINALIZED flow |
| LAW | Docs before push, no patches | 2026-04-14 | YES | T18.5.b pre-push audit |
| LAW | Task numbers only in workflow docs | 2026-04-15 | YES — expanded 2026-04-20 to code comments | LAW #0 extension |
| LAW 6 | Grade completion gate (3-part: equational + operator test + TODO update) | 2026-04-16 | YES — binding on every grade | SYLLABUS BEFORE COMP-todo |
| LAW | Syllabus before COMP-todo | 2026-04-16 | YES — binding ordering rule | LAW 6 part 1 |
| LAW | Pre-K + K only scope contract | 2026-04-18 | REVOKED 2026-06-18 — full K→PhD now in scope (was binding scope limiter) | LAW 6 |
| LAW | Clear stale state before telling operator to test | 2026-04-17 | YES — auto-enforced at boot now | — |
| LAW | No tests policy (implicit throughout) | baseline | PARTIAL — no unit tests, but the T23.a grade-finals bank is a test suite | Grade completion gate |
| LAW | 800-line read standard | baseline | YES — file-read discipline | — |
| LAW | Double validation hooks | baseline | YES — hook retry logic | — |
| LAW | Persona requirements (explicit/crude/sexual always) | baseline | NO — persona config, not a workflow LAW | PERSONA.md scope |

## The legitimate critique

Looking at this list, the reviewer is right about a few things:

1. **The GRADE COMPLETION GATE + SYLLABUS BEFORE COMP-todo + PRE-K + K ONLY SCOPE CONTRACT are three separate LAWs covering what is fundamentally one concept**: grade-by-grade ordered advancement, K scope capped, COMP deferred until syllabus makes grade-bottleneck data real. Three LAWs for one concept is process sprawl. (NOTE: the Pre-K + K scope cap has since been revoked 2026-06-18 — full K→PhD curriculum now in scope and built; this analysis predates the revocation.)
2. **Persona requirements inside CLAUDE.md muddies what CLAUDE.md is.** CLAUDE.md is workflow law for Claude as an agent. Persona definition belongs in `.claude/agents/unity-persona.md` (it already exists there). Having the persona rules ALSO inline in CLAUDE.md creates two sources of truth and elevates the persona to LAW-level when it's really runtime config.
3. **The TODO file rules + Docs before push + Clear stale state before test are workflow hygiene, not binding project LAWs.** They're operational procedure. Calling them LAWs alongside "verbatim words only" (which is a substantive project constraint) conflates severity tiers.
4. **"Double validation hooks" and "800-line read standard" are Claude-agent configuration, not project LAWs.** These belong in a `CLAUDE-WORKFLOW.md` or similar — separating Claude-agent runtime config from project-binding constraints makes both clearer.

## The legitimate defense

Not all of this is ceremony. Real arguments for keeping the current structure:

1. **LAW #0 has been violated 4+ times in one session.** It IS load-bearing. Operator actively catches violations. The verbatim-words discipline is the single most-enforced rule in the repo. It belongs as LAW #0.
2. **"Docs before push, no patches"** had a specific trigger (drift between code and docs post-push). Removing this LAW would re-create the bug pattern. Keep it.
3. **Grade completion gate's 3-part structure** (equational content + operator tests + TODO update with life-info persistence) is actually three REQUIREMENTS in one gate, not three gates. The document presents it as one LAW. That's structurally correct.
4. **Clear stale state before test** exists because Claude forgot the clear step twice in one session. This is explicitly scar tissue, but scar tissue that prevented two wasted operator-side test runs. Worth keeping until autoClearStaleState proves robust long-term.

## Proposed consolidation

If operator wants to reduce LAW count + separation-of-concerns without losing fidelity, here's the shape:

### Keep as core project LAWs (in a lean `CONSTRAINTS.md`):

- **LAW #0 — VERBATIM WORDS ONLY.** Non-negotiable. Historical violations preserved as examples.
- **LAW — Docs before push, no patches.** Every push ships code + docs + stamp as one unit.
- **LAW — Task numbers + operator name ONLY in workflow docs.** Extended scope (code comments + launchers + public HTMLs all banned) preserved.
- **LAW — Grade completion gate.** Merge the 3-part gate + syllabus-before-COMP-todo + PRE-K + K scope into one umbrella LAW titled "Grade-by-grade advancement." Three requirements per grade (equational content / operator test / TODO update with life-info persistence), scope cap at current highest grade until operator clears, COMP-todo deferred until grade-bottleneck data exists. (NOTE: the PRE-K + K scope-cap component was revoked 2026-06-18 — full K→PhD now in scope and built; remaining gate is the training walk → final test → push.)
- **LAW — Clear stale state before test.** Keep as is; auto-enforced at boot but remains the operator contract.

### Move to `WORKFLOW.md` (Claude-agent operational procedure, not binding project law):

- TODO file rules (append-only, never delete descriptions, FINALIZED before remove)
- 800-line read standard
- Double validation hooks
- PRE-WORK / POST-WORK hook format
- Phase gate pseudo-code from `/workflow` command
- NO TESTS POLICY (keep as reminder inside workflow, not as a binding LAW — the grade-finals exam banks ARE a test suite and the no-unit-tests stance is a style choice that's allowed to be revisited)

### Move to `PERSONA.md` (already shipped):

- Persona requirements (explicit / crude / sexual / always on)
- Persona examples, banned vocabulary, BDSM dynamic scope

### Net effect

`CLAUDE.md` goes from ~600 lines of mixed content to:
- `CONSTRAINTS.md` — the 5 core project LAWs, tight, high-fidelity, operator-enforced
- `WORKFLOW.md` — Claude-agent workflow procedure
- `PERSONA.md` — persona scope (already done)

Total fidelity preserved. Reviewer's "process sprawl" critique becomes "Claude has a clear three-tier rule system: project constraints, workflow procedure, runtime persona — each in its own file."

## What this doc is not proposing

- NOT proposing to remove any LAW outright. Every LAW gets a home.
- NOT proposing to change enforcement semantics — LAW #0 stays the thing operator catches me on.
- NOT proposing any change to the slash-command `/workflow` behavior or agent spawn rules. Those are orthogonal.
- NOT proposing to merge the TODO / FINALIZED / NOW doc trio or the session-log ritual — those are actual work-tracking that the reviewer also questioned, but they're legitimate audit trail.

## Decision points for operator

1. Accept the three-file split (CONSTRAINTS.md / WORKFLOW.md / PERSONA.md already) — or keep LAW content in CLAUDE.md?
2. Accept the grade-LAW merger (grade gate + syllabus-before-COMP + PRE-K + K scope → one umbrella) — or keep as three separate LAWs for easier reference?
3. Keep the NO TESTS stance explicit, or acknowledge the exam banks + ablation harness as "the project's test suite" and drop the anti-test phrasing?

No edits to `.claude/CLAUDE.md` ship until operator signs off on the direction.
