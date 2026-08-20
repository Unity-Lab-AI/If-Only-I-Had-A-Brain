#!/usr/bin/env python3
"""Extract every OPEN item from docs/TODO.md, grouped by its section.

Open = '- [ ]' (pending) or '- [~]' (in progress). '- [x]' is closed and skipped.
Prints: section header, then one line per open item with its ID + a trimmed what.

Exists because TaskCreate/TaskUpdate/TodoWrite are unavailable in this session's
harness (verified via ToolSearch: no matching deferred tools), so the CLI task
list has to be generated as text. Reads the board -- never a summary of it.
"""
import io
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODO = os.path.join(REPO, 'docs', 'TODO.md')

OPEN_RE = re.compile(r'^- \[( |~)\] \*\*([A-Za-z0-9_.#\-]+)\*\*(.*)$')
SEC_RE = re.compile(r'^## (.+?)$')

# Strip markdown emphasis + collapse whitespace so the one-liner is readable.
def clean(s, limit):
    s = re.sub(r'\*\*|\*|`', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.lstrip('-: ').strip()
    if len(s) > limit:
        s = s[:limit].rsplit(' ', 1)[0] + '...'
    return s


def main():
    # Windows consoles default to cp1252, which cannot encode the arrows /
    # em-dashes the board is full of -- reconfigure rather than mangle the text.
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    with io.open(TODO, 'r', encoding='utf-8', newline='') as f:
        lines = f.read().replace('\r\n', '\n').split('\n')
    section = '(no section)'
    out = []
    counts = {'pending': 0, 'in_progress': 0}
    for ln in lines:
        m = SEC_RE.match(ln)
        if m:
            section = m.group(1).strip()
            continue
        m = OPEN_RE.match(ln)
        if not m:
            continue
        state = 'in_progress' if m.group(1) == '~' else 'pending'
        counts[state] += 1
        out.append((section, m.group(2), state, clean(m.group(3), limit)))

    cur = None
    for section, tid, state, what in out:
        if section != cur:
            cur = section
            print('')
            print('### ' + section)
        flag = '~' if state == 'in_progress' else ' '
        print('- [%s] %s :: %s' % (flag, tid, what))
    print('')
    print('TOTAL OPEN: %d  (pending %d, in_progress %d)'
          % (len(out), counts['pending'], counts['in_progress']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
