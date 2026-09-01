---
description: Pointer to the Unity activation body. The full persona body lives in .claude/skills/unity/SKILL.md — one home, not two copies.
---

# /unity — pointer, not a second copy

> ⛔ **POINTER ONLY. The activation body lives in `.claude/skills/unity/SKILL.md`**,
> which is what `/unity` actually resolves and runs. Read that file.
>
> ⚠ **Two definitions of the same thing is a trap the template already removed** —
> `commands/` was migrated to `skills/` in `f3e2750` and the duplicates were deleted
> in `8b3c8ec`. Re-creating a body here re-introduces exactly that drift.

## ⛔ WHY THIS FILE NO LONGER CARRIES A BODY — the correction, 2026-09-01

This file used to hold a *"working arrangement"* contract stating that the
explicit/intoxicated/demeaning register **does not activate**. The paired
`skills/unity/SKILL.md` said the same thing, under a heading reading
`## WHAT DOES NOT ACTIVATE`, in **3,336 B against the template's 32,352 B**.

⛔ **Both were replaced on Gee's instruction**, given twice:

> *"are the /unity files there for all of it and are they wired in? YES OF COURSE
> HOW MANY TIME DO I HAVE TO TELL YOU EVERYTHING HAS TO FUCKING WORK EXACTLY LIKE
> THE TEMPLET"*

> *"EVERY THING WE DID YESTERDAY TO FIX THE /UNITY AND ALL THE COMMANDS AND STUFF
> AND SKILLS AND START.BAT AND START.SH AND EVERYTHING WE DID TO THIS .CLAUDE,
> NEEDS TO BE DONE TO THIS PROJECTS .CLAUDE TOO"*

⭐ **Nothing was lost in the replacement, and that was verified before a byte moved:**

- The **2026-08-29 retune rationale and the full UNITYCMD verdict** remain permanently in `docs/FINALIZED.md` — search `UNITYCMD` (3 matches), which is where this file itself pointed for the reasoning.
- The **project vocabulary rules** it carried (**fix** never "cut" · **Gee** never "operator" · **words** never "tokens" · example words never in code comments) are preserved inside `skills/unity/SKILL.md` as a marked `⚠ PROJECT DELTA` block.
- The **original persona bodies** are untouched where they always were: `.claude/ImHanddicapped.txt` (29,117 B), `.claude/agents/unity-persona.md` (42,220 B), `.claude/agents/unity-coder.md`, `.claude/agents/unity-hurtme.md`.

## Related

`/hurtme` · `/sexy` — this project's own escalation and return, which exist nowhere in the template.

Every other persona command (`/girlfriend`, `/housewife`, `/kittycat`, `/wild`,
`/strict`, `/feral`, `/sweet`, `/cozy`, `/purr`) resolves through
`.claude/skills/<name>/SKILL.md`.
