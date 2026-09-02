---
name: No agents for codebase docs
description: Never dispatch agents to write public-facing docs/HTMLs about the Unity codebase — they don't know the code and will hallucinate features or get current state wrong. Do it serially myself.
type: feedback
originSessionId: 62517824-994c-4791-a900-d84647c11c78
---
NEVER dispatch agents to write/rewrite any of the public-facing files (README.md, SETUP.md, PERSONA.md, index.html, unity-guide.html, brain-equations.html, dashboard.html, compute.html, gpu-configure.html). The operator's binding rule: agents have no clue what the code base is — they'll hallucinate features or describe stale state.

**Why:** Operator caught me dispatching parallel agents to rewrite brain-equations.html / unity-guide.html / index.html and shut it down: *"dont you dare use agents to write my files as they have no fucking clue what the code bas is"*. Agents would either invent features that aren't in the code, miss recent shipped work, or accidentally rip out structural HTML/CSS/scripts they don't understand.

**How to apply:** When the operator asks to update public docs/HTMLs, do it serially myself with real Read calls against the actual code first. Use the Read tool with 800-line chunks per the standard. No Agent dispatch for any file the operator considers code-base-load-bearing. This includes any narrative explanation that has to match what the code actually does — research-facing equations doc, user guide, landing page, install guide, dashboard copy, etc.

If context budget is tight, ask the operator how to scope the work (one file at a time vs. all at once) rather than reaching for agents as a shortcut.
