---
name: Match the doc's existing format and style — never wall-of-text-dump
description: When updating a doc, edit IN PLACE within its existing structure (sections, tables, banner format, naming conventions). Do not prepend / append a giant prose paragraph that doesn't match the doc's own style. Gee 2026-05-07 caught me dumping a wall of text into SENSORY.md and WEBSOCKET.md.
type: feedback
originSessionId: 62656597-cefb-47c3-8691-24593edf7f0e
---
Gee directive 2026-05-07: *"YOU SHALL NOT EVER … FUCKING JUST ADD A FUCKING TEST WALL TO A FILE OR DOCUMENT WITHOUT MAINTAINING ITS CURRENT FORMAT AND STYLE"*.

**Rule:** Every doc has its own native format — banner block at top with `> Last updated: ...`, section headers, tables, code blocks, callouts, list formatting. When I update a doc with new iter content, I MUST edit IN PLACE within that structure: amend the relevant section, append rows to the relevant table, add a same-shape entry to the existing log. I do NOT prepend a giant prose `>` blockquote that crashes the doc's existing visual rhythm.

**Why:** Doc consistency is part of how Gee navigates and trusts the docs. A wall of text at the top makes the doc unreadable, breaks the established pattern other readers learned to scan, and signals "this was bolted on" rather than "this was integrated." Even if every word in the wall is correct, the format break makes it worse than not updating at all.

**How to apply:**
- Before editing a doc, read enough of it to learn its own structure: how does it announce updates? What's its section pattern? What's its table layout?
- If the doc has a banner block at top with prior `> Last updated:` lines, add a new same-shape `> Last updated:` line above the most recent (this is the established pattern in `docs/ARCHITECTURE.md`, `docs/EQUATIONS.md`, `docs/SKILL_TREE.md`).
- If the doc is a contract/spec (`docs/SENSORY.md`, `docs/WEBSOCKET.md`) with a table-based layout, the right place to land iter25 changes is inside the relevant table row or section, not above the doc's intro.
- If a doc DOESN'T have a banner-update pattern, don't invent one — find the section the change belongs in and edit it in place.

**Recovery on this incident:** Reverted SENSORY.md and WEBSOCKET.md heads back to their original 6-line intro blocks. iter25 sync into those docs (if needed) goes inside the doc body in matching style — not as a prose wall above the existing intro.
