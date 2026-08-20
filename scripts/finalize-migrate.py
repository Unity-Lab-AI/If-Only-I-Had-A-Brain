#!/usr/bin/env python3
"""
finalize-migrate.py — move every COMPLETE ([x]) task out of docs/TODO.md into
docs/FINALIZED.md, VERBATIM, honoring the FINALIZED-BEFORE-DELETE law.

Rules encoded here (all from .claude/CONSTRAINTS.md):
  * LAW #0 — task text is transferred byte-for-byte. Nothing is re-worded,
    shortened, summarized or re-numbered. This script never generates prose
    for a task; it only MOVES lines.
  * FINALIZED BEFORE DELETE — FINALIZED.md is written and re-verified from
    disk BEFORE a single byte is removed from TODO.md.
  * NEVER DELETE TODO INFO — only the completed task LINES are removed. Every
    section header, every Gee verbatim quote block, and every analysis
    paragraph stays in TODO.md whenever that section still holds open work.
    A section whose tasks are ALL complete is removed whole (its full text,
    context included, is in the archive).
  * MATCH DOC FORMAT — FINALIZED.md is newest-first: the new entry is inserted
    directly after the banner separator, in the archive's own heading style.

Usage:  python scripts/finalize-migrate.py [--apply]
Without --apply it is a dry run and writes nothing.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODO = os.path.join(ROOT, 'docs', 'TODO.md')
FINAL = os.path.join(ROOT, 'docs', 'FINALIZED.md')

NL = '\r\n'
DONE_RE = re.compile(r'^- \[x\] ')
OPEN_RE = re.compile(r'^- \[[ ~]\] ')
HEAD_RE = re.compile(r'^## ')

ENTRY_TITLE = (
    '## 2026-08-20 - TODO MIGRATION: every COMPLETE task moved out of the board '
    'into the archive, verbatim - feature/todo-finalize-migration-0820'
)
GEE_VERBATIM = (
    'finalize whats in the todo that complete moving it to finalized since '
    'youve been slacking by not doing it correctly all the time, transfering '
    'the information verbatium'
)


def read(path):
    with open(path, 'r', encoding='utf-8', newline='') as fh:
        return fh.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(text)


def split_sections(lines):
    """Return (preamble_lines, [(header_index, section_lines), ...])."""
    heads = [i for i, ln in enumerate(lines) if HEAD_RE.match(ln)]
    if not heads:
        return lines, []
    preamble = lines[:heads[0]]
    sections = []
    for n, start in enumerate(heads):
        end = heads[n + 1] if n + 1 < len(heads) else len(lines)
        sections.append((start, lines[start:end]))
    return preamble, sections


def trim_trailing_blanks(block):
    while block and block[-1].strip() == '':
        block.pop()
    return block


def main():
    apply_changes = '--apply' in sys.argv

    todo_raw = read(TODO)
    final_raw = read(FINAL)
    lines = todo_raw.split(NL)

    preamble, sections = split_sections(lines)

    all_done = [ln for ln in lines if DONE_RE.match(ln)]
    all_open = [ln for ln in lines if OPEN_RE.match(ln)]
    print('TODO sections: %d | complete: %d | open: %d'
          % (len(sections), len(all_done), len(all_open)))

    archive_blocks = []   # verbatim section copies destined for FINALIZED
    kept_sections = []    # sections that survive in TODO
    dropped_whole = []    # section titles removed entirely

    for _, sec in sections:
        done = [ln for ln in sec if DONE_RE.match(ln)]
        opn = [ln for ln in sec if OPEN_RE.match(ln)]

        if done:
            # archive copy: header + ALL context, minus the still-open task lines
            copy = [ln for ln in sec if not OPEN_RE.match(ln)]
            copy = trim_trailing_blanks(copy)
            while copy and copy[-1].strip() == '---':
                copy.pop()
                copy = trim_trailing_blanks(copy)
            archive_blocks.append(copy)

        if opn:
            # TODO copy: header + ALL context, minus the completed task lines
            keep = [ln for ln in sec if not DONE_RE.match(ln)]
            kept_sections.append(keep)
        elif done:
            dropped_whole.append(sec[0])
        else:
            kept_sections.append(list(sec))  # no tasks at all — untouched

    # ---------------- build the FINALIZED entry ----------------
    entry = []
    entry.append(ENTRY_TITLE)
    entry.append('')
    entry.append('### Gee ask (verbatim per LAW #0)')
    entry.append('')
    entry.append('> *"%s"*' % GEE_VERBATIM)
    entry.append('')
    entry.append(
        'Every task below was already marked COMPLETE on `docs/TODO.md` and had '
        'not been migrated. **%d completed tasks** across **%d sections** are '
        'transferred here VERBATIM — task text, section headers, Gee quote '
        'blocks and the analysis paragraphs that give each task its context are '
        'reproduced byte-for-byte, not summarized. %d sections whose every task '
        'was complete are removed from the board entirely (their full text lives '
        'below); sections still holding open work keep their header, their Gee '
        'quotes and all their prose on the board so the open items keep their '
        'context, with only the completed task lines lifted out. **%d open tasks '
        'remain on `docs/TODO.md`.**'
        % (len(all_done), len(archive_blocks), len(dropped_whole), len(all_open))
    )
    entry.append('')
    entry.append(
        'Some of these tasks were narrated in earlier FINALIZED entries as '
        'prose. This entry is the VERBATIM task record, which is what was '
        'missing — the archive now carries both.'
    )
    entry.append('')
    entry.append('---')
    entry.append('')
    entry.append('### Migrated verbatim from docs/TODO.md')
    entry.append('')

    for blk in archive_blocks:
        # demote the section heading one level so it nests under this entry
        head = blk[0]
        entry.append('#' + head)
        entry.extend(blk[1:])
        entry.append('')
        entry.append('---')
        entry.append('')

    entry = trim_trailing_blanks(entry)
    while entry and entry[-1].strip() == '---':
        entry.pop()
        entry = trim_trailing_blanks(entry)
    entry.append('')

    entry_text = NL.join(entry) + NL

    # insert after the banner separator (FINALIZED is newest-first)
    anchor = '# FINALIZED — Completed Tasks Archive' + NL + NL + \
             '> IF ONLY I HAD A BRAIN' + NL + '> Unity AI Lab' + NL + NL + \
             '---' + NL + NL
    if not final_raw.startswith(anchor):
        raise SystemExit('FINALIZED.md banner does not match the expected shape '
                         '- refusing to write blind.')
    new_final = anchor + entry_text + NL + final_raw[len(anchor):]

    # ---------------- build the new TODO ----------------
    new_lines = list(preamble)
    for keep in kept_sections:
        new_lines.extend(keep)
    new_todo = NL.join(new_lines)
    if not new_todo.endswith(NL):
        new_todo += NL

    # ---------------- verification (before any write) ----------------
    problems = []
    for ln in all_done:
        if ln not in entry_text:
            problems.append('MISSING FROM ARCHIVE: ' + ln[:90])
    for ln in all_open:
        if ln not in new_todo:
            problems.append('LOST FROM TODO: ' + ln[:90])
    leftover = [ln for ln in new_todo.split(NL) if DONE_RE.match(ln)]
    if leftover:
        problems.append('COMPLETED LINES STILL ON THE BOARD: %d' % len(leftover))
    still_open = [ln for ln in new_todo.split(NL) if OPEN_RE.match(ln)]
    if len(still_open) != len(all_open):
        problems.append('OPEN COUNT DRIFT: %d -> %d' % (len(all_open), len(still_open)))

    print('archive sections: %d | sections dropped whole: %d | sections kept: %d'
          % (len(archive_blocks), len(dropped_whole), len(kept_sections)))
    print('verification problems: %d' % len(problems))
    for p in problems[:20]:
        print('  !! ' + p)
    if problems:
        raise SystemExit('REFUSING TO WRITE - verification failed.')

    if not apply_changes:
        print('DRY RUN - nothing written. Re-run with --apply.')
        return

    # FINALIZED FIRST, verified from disk, THEN the TODO removal.
    write(FINAL, new_final)
    check = read(FINAL)
    missing = [ln for ln in all_done if ln not in check]
    if missing:
        raise SystemExit('FINALIZED write did not land %d task line(s) - '
                         'TODO left untouched.' % len(missing))
    print('FINALIZED.md written and re-verified from disk: %d/%d task lines present.'
          % (len(all_done) - len(missing), len(all_done)))

    write(TODO, new_todo)
    back = read(TODO)
    print('TODO.md rewritten: %d lines, %d complete remaining, %d open remaining.'
          % (len(back.split(NL)),
             len([l for l in back.split(NL) if DONE_RE.match(l)]),
             len([l for l in back.split(NL) if OPEN_RE.match(l)])))


if __name__ == '__main__':
    main()
