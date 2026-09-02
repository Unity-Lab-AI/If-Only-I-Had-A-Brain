---
name: feedback_never_use_ual_workflow_remote
description: "Both foreign remotes (ual-workflow, origin-unity-bot) were DELETED from this repo's local git config 2026-08-31 — never re-add them. Only origin + github exist, and they are the only push targets."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-31T09:12:01.145Z
---

⛔⛔ **BOTH FOREIGN REMOTES ARE NOW DELETED FROM THIS REPO'S `.git/config` — 2026-08-31. DO NOT RE-ADD EITHER.** Gee: *"remove them them from what ever is telling you to refrence them DO NOT TOUCH THEIR REPOS"*.

Removed with `git remote remove`, which edits **local config only** and never contacts the remote repositories. This repo now has exactly two remotes, and that is the whole list:

| remote | url |
|---|---|
| `origin` | `git@git.unityailab.com:UnityAILab/If-Only-I-Had-A-Brain.git` |
| `github` | `https://github.com/Unity-Lab-AI/If-Only-I-Had-A-Brain.git` |

**Deleted (recorded so nobody has to go looking, NOT so they get restored):** `ual-workflow` → `UnityAILab/UAL-ClaudeWorkflow.git`, and `origin-unity-bot` → `UnityAILab/unity.git`.

⭐ **The reason for deleting rather than continuing to avoid them:** a rule against using a configured remote is enforced only by discipline, and one `git push --all`, one autocompleted remote name, or one `git push ual-workflow main` sends this project — including the `.claude/` IP — into someone else's repository. **Removing the entry makes the mistake impossible instead of merely forbidden.** ⚠ If a `git remote -v` ever shows a third entry again, something re-added it; delete it, do not work around it.

⛔ **NEVER use the `ual-workflow` remote** (`git@git.unityailab.com:UnityAILab/UAL-ClaudeWorkflow.git`). Gee, 2026-08-20: *"ual workflow remote is never to be used, its the home of the original templet used to start this .claude"*.

**Why:** it hosts the upstream `.claude/` TEMPLATE that this project was seeded from. It is not a mirror of this project and must not receive this project's commits, branches, tags or hook fixes. Pushing there would contaminate the template other projects are spawned from.

**How to apply:** the only push targets for this repo are `origin` (Forgejo, `UnityAILab/If-Only-I-Had-A-Brain`) and `github` (`Unity-Lab-AI/If-Only-I-Had-A-Brain`) — see [[feedback_no_push_until_phd_complete]] for the cascade. It also means `.claude/` hook fixes have **nowhere to be version-controlled**: `.claude/` is gitignored here by the IP-boundary LAW, and the template remote is off-limits. So record the hook fixes' content in a TRACKED doc (`deploy/HOOK-FIXES.md`) instead, so a `/unity-update` refresh that silently reverts them can be re-applied from the record. Related: [[feedback_no_scripts_for_edits]], [[feedback_docs_before_push]].
