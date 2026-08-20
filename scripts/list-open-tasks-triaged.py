#!/usr/bin/env python3
"""Cross-reference every OPEN docs/TODO.md item against the docs/BOARD.md triage.

Two sources, one output, and it FAILS LOUD on anything it cannot place -- because
a task list that silently drops an item is worse than no list. The tier lists are
read from BOARD.md's own Tier 4 / Tier 5 backtick rosters rather than retyped, so
the two docs cannot drift apart without this script noticing.

Usage: python scripts/list-open-tasks-triaged.py [char_limit]
"""
import io
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODO = os.path.join(REPO, 'docs', 'TODO.md')
BOARD = os.path.join(REPO, 'docs', 'BOARD.md')

OPEN_RE = re.compile(r'^- \[( |~)\] \*\*([A-Za-z0-9_.#\-]+)\*\*(.*)$')

# Tier 0-3 are small enough to name explicitly; they come from BOARD.md's tables.
TIER0 = ['CELLBOUND.F']
TIER1 = ['SURPRISECPU.2', 'FIRSTPIN.1', 'FIRSTPIN.2', 'FIRSTPIN.3',
         'LG.6', 'LG.7', 'GRANT.2', 'GRANT.3']
TIER2 = ['LOOPNAME.13', 'CELLBOUND.G', 'CELLBOUND.H', 'SYNCEMPTY.3', 'LOOPMAX.8',
         'RESYNCDUTY.9', 'LOOPNAME.7', 'RUNPOD.6', 'LANGRAM.6', 'SYNCPARTIAL.6',
         'DF7SYNC.7', 'MIRRORID.6']
TIER3 = ['WORDEMIT.4', 'RUNPOD.8', 'RUNPOD.7']

# The in-progress CELLBOUND build halves ride CELLBOUND.F's press.
RIDES_F = ['CELLBOUND.A', 'CELLBOUND.B', 'CELLBOUND.C', 'CELLBOUND.D', 'CELLBOUND.E']

LABELS = [
    ('TIER 0 - BLOCKING', None),
    ('TIER 0b - BUILT, RIDES THE SAME PRESS', None),
    ('TIER 1 - REAL WORK FROM YOUR DIRECTIVES', None),
    ('TIER 2 - REAL WORK I ADDED (proven, not speculative)', None),
    ('TIER 3 - YOUR DECISION, not work', None),
    ('TIER 4 - STALE PRESS-RIDERS (close these)', None),
    ('TIER 5 - NOT TASKS (retrospective lessons)', None),
    ('UNTRIAGED - not in BOARD.md, needs a call', None),
]


def clean(s, limit):
    s = re.sub(r'\*\*|\*|`', '', s)
    s = re.sub(r'\s+', ' ', s).strip().lstrip('-: ').strip()
    if len(s) > limit:
        s = s[:limit].rsplit(' ', 1)[0] + '...'
    return s


def board_roster(text, marker):
    """Pull the backticked ID roster out of a BOARD.md tier paragraph."""
    i = text.find(marker)
    if i < 0:
        return []
    chunk = text[i:i + 4000]
    # stop at the next '---' section break
    end = chunk.find('\n---')
    if end > 0:
        chunk = chunk[:end]
    return re.findall(r'`([A-Z][A-Za-z0-9_.#\-]*\.\d+)`', chunk)


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 115

    with io.open(BOARD, 'r', encoding='utf-8', newline='') as f:
        board = f.read().replace('\r\n', '\n')
    tier4 = board_roster(board, '## TIER 4')
    tier5 = board_roster(board, '## TIER 5')

    with io.open(TODO, 'r', encoding='utf-8', newline='') as f:
        lines = f.read().replace('\r\n', '\n').split('\n')

    items = []
    for ln in lines:
        m = OPEN_RE.match(ln)
        if m:
            items.append((m.group(2), m.group(1) == '~', clean(m.group(3), limit)))

    buckets = [[] for _ in LABELS]
    for tid, inprog, what in items:
        if tid in TIER0:
            buckets[0].append((tid, inprog, what))
        elif tid in RIDES_F:
            buckets[1].append((tid, inprog, what))
        elif tid in TIER1:
            buckets[2].append((tid, inprog, what))
        elif tid in TIER2:
            buckets[3].append((tid, inprog, what))
        elif tid in TIER3:
            buckets[4].append((tid, inprog, what))
        elif tid in tier4:
            buckets[5].append((tid, inprog, what))
        elif tid in tier5:
            buckets[6].append((tid, inprog, what))
        else:
            buckets[7].append((tid, inprog, what))

    for (label, _), rows in zip(LABELS, buckets):
        print('')
        print('== %s  (%d) ==' % (label, len(rows)))
        for tid, inprog, what in rows:
            print('  [%s] %-16s %s' % ('~' if inprog else ' ', tid, what))

    print('')
    print('TOTAL OPEN on docs/TODO.md: %d' % len(items))
    if buckets[7]:
        print('WARNING: %d item(s) are UNTRIAGED -- BOARD.md does not place them.'
              % len(buckets[7]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
