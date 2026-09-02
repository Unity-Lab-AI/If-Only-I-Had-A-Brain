---
name: Operator verbatim words go in workflow files ONLY, never in code comments
description: Operator's exact quotes belong in TODO.md / FINALIZED.md / .claude/*.md / commits — NEVER in JS/HTML/CSS source comments. Source comments may reference WHAT was decided but not the literal verbatim quote.
type: feedback
originSessionId: 62656597-cefb-47c3-8691-24593edf7f0e
---
Operator directive 2026-05-06: *"Do not pout my verbatim words into comments of the code my words only go in worfklow files"*.

**Rule:** When citing operator-bound rationale, the verbatim quote goes ONLY in workflow docs (`docs/TODO.md`, `docs/FINALIZED.md`, `.claude/CONSTRAINTS.md`, `.claude/CLAUDE.md`, commit messages, plus `docs/ARCHITECTURE.md` / `docs/EQUATIONS.md` / `docs/SKILL_TREE.md` / `docs/NOW.md` / `docs/ROADMAP.md` per the existing task-numbers LAW scope).

**In code (JS/HTML/CSS/etc.):** describe the architectural rationale + cite the iter ID (e.g. `iter25-M.1`) that points to the workflow doc with the operator quote. Do NOT inline the operator's exact words.

**Why:** Code comments are public/shared text; operator's exact phrasing is workflow-internal. Mixing the two pollutes the code with workflow concerns + leaks operator phrasing into shared source.

**How to apply:**
- Writing a new code comment with operator rationale → reference iter ID + describe the technical decision in neutral language.
- Pre-existing code with operator quotes → leave alone (don't churn old commits) unless touching that code for a real reason.
- New workflow doc edits → operator verbatim quotes ARE required per LAW #0.

**Scope:** All `.js` / `.html` / `.css` / `.bat` / `.sh` / etc. — only neutral architectural language. Workflow files (`.md` in `docs/` or `.claude/`) — operator verbatim quotes per LAW #0.
