#!/usr/bin/env python3
"""Record the todoFeatureEnabled diagnosis in FINALIZED + RESUME.

CRLF slice edits; backticks live in this file, never an inline bash string.
Idempotent on a marker.
"""
import io
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = 'todoFeatureEnabled'

FINALIZED_ADD = '''
## 2026-08-20 - THE TASK-LIST GATE NAMED: `todoFeatureEnabled` - a settings key that was never set, on a default that resolves to OFF

Gee (verbatim): *"now how do we fix claude to be able to list the items to be done here in the cli?"* and, when I first answered with a markdown list, Gee (verbatim): *"do you understand what i mean by task list? why cant u build one? you build them hundreds of times before"* - **he meant the live checklist PANEL, not a markdown list, and he was right that it used to work: 408 uses across past sessions (138 TaskCreate + 270 TaskUpdate).**

**RULED OUT FIRST, by reading rather than guessing.** No `deny` entry in `.claude/settings.json`, `.claude/settings.local.json` or `~/.claude/settings.json` (all three `deny` arrays are empty). No `disallowedTools` / `allowedTools` anywhere in the repo. No `PreToolUse` hook matching the task tools (the only PreToolUse matcher is `Bash`). The launcher is a bare `claude --dangerously-skip-permissions "/unity then run /workflow"` with no tool flags.

**THE BINARY STILL HAS THE TOOLS.** A stale npm global install (`2.0.51`) is NOT what runs - `which claude` resolves to the native-installer build at `~/.local/bin/claude.exe` (324MB, `2.1.234`). Grepping THAT binary: `TodoWrite` x28, `TaskCreate` x44, `TaskUpdate` x35. So nothing was removed. And the exclusion is SELECTIVE - `TaskOutput` and `TaskStop` are handed to this session while `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate` / `TodoWrite` are not - which is the shape of a deliberate toggle, not a missing feature.

**THE KEY, quoted from the binary schema itself:** `todoFeatureEnabled: boolean().optional().describe("Enable the todo / task tracking panel")` - sitting in the same Zod settings schema as the documented `terminalProgressBarEnabled`, alongside a companion `showExpandedTodos`. **Both were ABSENT from every settings file and from `~/.claude.json`**, so the session was riding whatever the 2.1.234 default resolves to. Set explicitly to `true` in `.claude/settings.json`.

**WHAT IS NOT PROVEN, stated plainly instead of sold as a fix.** The description says *panel*. It is therefore UNCONFIRMED whether this key gates TOOL EXPOSURE or only the UI rendering of a list the tools populate - and I have not proven the 2.1.234 default is `false`, only that the key was unset. **The verdict needs a CLI restart** (the tool set is assembled at session start, so it cannot be tested from inside this session). If the tools are still absent after a relaunch, the next lever is the interactive `/config` - which writes the toggle authoritatively wherever it actually belongs - and after that, the stale npm 2.0.51 / `DISABLE_AUTOUPDATER=1` pair is worth clearing so the CLI can move forward on its own. **A wrong-shaped claim here would be the eighth lying instrument of the day; this one gets to stay honest.**

**MEANWHILE the list is not blocked on any of that** - `scripts/list-open-tasks-triaged.py` prints all 76 open items against the BOARD tiers and fails loud on anything it cannot place.
'''

RESUME_ADD = '''>
> **THE TASK-LIST PANEL - A CANDIDATE FIX IS IN PLACE BUT UNVERIFIED.** The prior handoff said `TaskCreate`/`TaskUpdate`/`TodoWrite` are disabled and to stop trying. That was accurate but incomplete. Diagnosed properly this session: nothing in this repo gates them (every `deny` array empty, no `disallowedTools`, no PreToolUse matcher, bare launcher), and the RUNNING binary still contains them (`~/.local/bin/claude.exe`, 2.1.234 — the npm 2.0.51 install is a stale decoy; `TaskCreate` appears 44 times). The exclusion is SELECTIVE — `TaskOutput`/`TaskStop` are granted, the task-*list* family is not — which is a toggle, not a missing feature. The binary's own settings schema names it: **`todoFeatureEnabled` — "Enable the todo / task tracking panel"**, with a companion `showExpandedTodos`. Both were absent from every settings file and from `~/.claude.json`, so we were riding a default. **Now set to `true` in `.claude/settings.json`.** ⚠ **UNPROVEN** — the description says *panel*, so it may gate only the UI and not tool exposure, and the default's actual value was never confirmed. **The tool set is built at session start, so the verdict needs a RELAUNCH.** If the tools are still missing after one, try the interactive `/config` (it writes the toggle authoritatively), then consider clearing the stale npm 2.0.51 install and the `DISABLE_AUTOUPDATER=1` env pin. Until it works, `python scripts/list-open-tasks-triaged.py` prints all 76 open items triaged, and fails loud rather than silently dropping any.
'''


def read(p):
    return io.open(p, 'r', encoding='utf-8', newline='').read()


def crlf(s):
    return s.replace('\r\n', '\n').replace('\n', '\r\n')


def main():
    fin = os.path.join(REPO, 'docs', 'FINALIZED.md')
    s = read(fin)
    if MARK in s:
        print('SKIP FINALIZED (already synced)')
    else:
        io.open(fin, 'a', encoding='utf-8', newline='').write(crlf(FINALIZED_ADD))
        print('OK docs/FINALIZED.md appended')

    res = os.path.join(REPO, 'docs', 'RESUME.md')
    s = read(res)
    if MARK in s:
        print('SKIP RESUME (already synced)')
        return 0
    anchor = '> **THREE THINGS TO KNOW BEFORE YOU TOUCH THIS CODE:**'
    if anchor not in s:
        print('FAIL RESUME: anchor not found')
        return 1
    s = s.replace(anchor, crlf(RESUME_ADD).lstrip('\r\n') + anchor, 1)
    io.open(res, 'w', encoding='utf-8', newline='').write(s)
    print('OK docs/RESUME.md patched')
    return 0


if __name__ == '__main__':
    sys.exit(main())
