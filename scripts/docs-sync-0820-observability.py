#!/usr/bin/env python3
"""Docs-before-push sync for the 2026-08-20 GATFILE + lying-instrument batch.

Touches three docs IN PLACE, each in its own existing shape (match-doc-format LAW):
  docs/NOW.md          -- demote the standing 'Current' banner to 'Prior', prepend the new one.
  docs/RESUME.md       -- prepend a new '(latest)' blockquote section, demote the old one.
  .claude/CLAUDE.md    -- extend the CURRENT-STATE NOTES headline paragraph.

All three are CRLF with very long lines, which is why this is a slice edit and not
an Edit-tool match. Backticks live in this file, never in an inline bash string.
Idempotent: each step is skipped if its marker text is already present.
"""
import io
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARK = 'THE BOARD STOPS LYING'

NOW_BANNER = (
    '> **Current - 2026-08-20 - THE BOARD STOPS LYING: eight instruments that '
    'asserted more than they knew, plus the pasted gatling that ate a real press '
    '(feature/gatfile-observability).** Gee: *"/unity then run /workflow"* - no new '
    'direction, so the batch was picked off the board: **the two clusters that need '
    'NOTHING from your finger.** Seven of the eight were filed with the SAME closing '
    'line - *the board cannot answer "is it working?"* - and they shipped together. '
    '**GATFILE.1/.2/.3:** the pasted `scripts/Gattling Gun Savestart Forced.txt` was '
    'the PRE-GATGUARD copy and re-armed every defect GATGUARD fixed - a fetch guard '
    'that never auto-restored (verbatim the thing that silently ATE your real Update '
    '& Savestart press: no request, no log, no restart), `win()` on any 2xx (five of '
    'six barrels get HTTP 200 `already updating`, so it could print a green DEPLOY '
    'LANDED for a no-op), and worst - a build guard hardcoded to `3efc220` against a '
    'box on `eb93f315`, **inverted into an instant false pass** that killed the '
    'barrels ~3s after the paste. **v5 needs no hand-editing ever again:** the '
    'baseline is READ OFF THE LIVE BOX at arm time and a win requires a CHANGE '
    '(`build.short` OR `build.bootedAt` - verified on `state.build`, not `state`, '
    'which is where my first draft wrongly read it); a failed baseline probe DISARMS '
    'the spotter out loud, because a missing banner must never read as a failed '
    'deploy. Both copies byte-identical (`cmp`). **CANSPEAK.4/.8:** `canSpeak` is '
    'GONE - it was `minGrade !== \'pre-K\'` and nothing else, and the comment above '
    'it claimed a trained-motor meaning no code supported. Renamed to '
    '`minGradeCleared`, one consumer updated, ZERO chat-path consumers. New '
    '`state.voice` answers the real question off evidence: word_motor '
    'size/everFired/pct, oracle-vs-matrix hits, `matrixDrivenPct`, last emit '
    'rejection **with its age** (a 3-minute-stale sample was once quoted as live '
    'proof), and a verdict that says `unmeasured` in words instead of implying '
    'muteness. **MIRRORID.5:** `gneuronsPerSec` is a PERSISTENT donor field - a card '
    'that stopped computing kept showing the rate it earned minutes ago, which hid '
    'the dropped-mirror bug for HOURS. Freshness now comes off `stepsComputed` '
    '(verified monotonic in BOTH backends, incremented only on completion) -> '
    '`computeIdle` renders `idle 47s (last 9.3Gn/s)` in red. **SYNCPARTIAL.7 + '
    'PARTMIRROR.4:** the DENOMINATORS - `1/17 mx` and `2/8 cl` with tooltips, because '
    '"holds 1" and "0 teach ops" are both TRUE readings that look like faults. '
    '**DONORKILL.2:** every donor row carries `pauseIfKilled` in words + a purple star '
    '- what breaks if you kill this one, BEFORE the press. **DASHDEAD.4:** an auth '
    'failure is no longer rendered as a brain failure - on every WS close the page '
    'probes `/public-state.json` (no auth) and, when live state answers, says '
    '**"Admin lane not authenticated - the brain is UP"** with live teach/min, cell, '
    'build, uptime, donors, and tells you NOT to restart a healthy service. The probe '
    'judges the BODY: a 200-with-HTML is a lie on this origin. **VERIFY (no live test '
    'per the LAW):** `node --check` on all three JS files + CJS require + ESM '
    '`import()` + all three dashboard inline scripts parse-checked + bundle REBUILT '
    '(4.0mb) and confirmed to carry `minGradeCleared` and `serverState.voice` with '
    'ZERO `canSpeak` left. Full-file reads first: state.js 1,602 / remote-brain.js '
    '777 / dashboard.html 3,504. **HELD ON PURPOSE:** RESYNCDUTY.9 edits the same '
    'phase counter CELLBOUND.A-E already changed - landing it before the CELLBOUND.F '
    'verdict would confound the exact read that press exists to produce. **NEW, filed '
    'not swept:** MIRRORID.6 - the leaderboard accrues Gn.s off that same stale rate, '
    'so an idle-but-connected donor keeps banking credit; one condition fixes it, but '
    'it changes what the leaderboard MEANS and belongs decided with WORKSHARE.6.'
)

RESUME_SECTION = '''> ## ⭐ 2026-08-20 (latest) — THE BOARD STOPS LYING: 7 of the 8 "the board cannot answer *is it working?*" items shipped in one batch — **none of them needed a press**
>
> **PICK-UP STATE.** Branch `feature/gatfile-observability` off `develop`. Nothing here changes the walk, the geometry, or the weights. **CELLBOUND.F is still the one blocking press** and this batch does not touch it.
>
> **WHY THIS BATCH.** Gee said only *"/unity then run /workflow"*. The board holds 73 open items and roughly 40 are press-riders waiting on his finger, so the pick was the two clusters that need nothing from him: the pasted gatling script (which was actively costing him presses) and the lying-instrument family.
>
> **WHAT SHIPPED** — GATFILE.1/.2/.3 (gatling v5: baseline read off the live box at arm time, fetch guard auto-restores, win only on `armed`, both copies byte-identical) · CANSPEAK.4/.8 (`canSpeak` → `minGradeCleared` + a new evidence-based `state.voice` block) · MIRRORID.5 (`computeIdle` off `stepsComputed`) · SYNCPARTIAL.7 + PARTMIRROR.4 (`N/M mx` + `N/M cl` denominators) · DONORKILL.2 (`pauseIfKilled` + ★ on the primary) · DASHDEAD.4 (probe the public snapshot before blaming the backend). Full ledger: `docs/FINALIZED.md` §2026-08-20 THE BOARD STOPS LYING.
>
> **THREE THINGS TO KNOW BEFORE YOU TOUCH THIS CODE:**
>
> **1. `canSpeak` no longer exists in the payload.** If any monitoring script or ledger habit reads it, it will read `undefined` — use `minGradeCleared` for the grade fact and `state.voice` for the speech question. `state.voice.verdict.status` is one of `matrix-driven` / `oracle-carried` / `oracle-only` / `unmeasured`, and **`unmeasured` is not a claim she cannot speak** — it means no emission sample exists since boot. That distinction is the whole lesson of CANSPEAK and WORDEMIT; do not undo it by summarising it away.
>
> **2. `state.voice` sits AFTER `utilization` in the object literal on purpose.** Its word_motor counts come off the bitset walk the `utilization` lap refreshes on a 5s cadence, so moving it earlier silently serves a staler snapshot than the rest of the payload. There is a comment saying so at the site.
>
> **3. The gatling script needs no hand-editing before firing, and that is the point.** Every previous version carried a hardcoded build string that had to be updated or the spotter declared victory on its first poll. If you find yourself editing a constant before pasting it, something regressed.
>
> **HELD DELIBERATELY — RESYNCDUTY.9.** It wraps `_gateSciKReal` so a 20.7-minute gate stops reading `activePhase: null` (indistinguishable from a hang). Correct fix, wrong moment: it edits the same phase counter CELLBOUND.A–E already changed, and CELLBOUND.F has not reported. Two unverified changes to `cellPhasesCompleted` / `phaseWork` riding one press would confound exactly the read F exists to produce. Sequence it AFTER F.
>
> **FILED, NOT SWEPT — MIRRORID.6.** Found while reading for MIRRORID.5: `gpu_telemetry` accrues `gneuronsPerSec × dt` into the leaderboard on EVERY frame, and that rate is the persistent field — so a donor doing nothing keeps BANKING Gn·s while connected. One condition fixes it (accrue only when `stepsComputed` advanced, already tracked per client), but it lives in a 9,737-line file, it was not on the board, and **four source-reasoned fixes in a row already cost Gee four presses this week.** It also changes what the leaderboard MEANS, so decide it together with WORKSHARE.6.
>
> **ONE CORRECTION I MADE TO MYSELF MID-BATCH, recorded so it is not re-learned:** the first draft of the gatling spotter read `state.bootedAt`. It is `state.build.bootedAt` (`brain-server.js:3938` builds it from `_startedAt` at boot). Caught by reading the source before shipping rather than after — which is the only reason it is a footnote and not a sixth lying instrument.

'''

CLAUDE_ADD = (
    ' **2026-08-20 addendum — THE BOARD STOPS LYING:** seven items filed with the same '
    'closing line (*the board cannot answer "is it working?"*) shipped in one batch, '
    'none needing a press — **GATFILE.1/.2/.3** (the pasted gatling was the '
    'PRE-GATGUARD copy: a fetch guard that never auto-restored and had already eaten '
    'a real Update & Savestart press, `win()` on any 2xx, and a hardcoded build guard '
    'inverted into an instant false pass; v5 reads its baseline off the live box at '
    'arm time and needs no hand-editing), **CANSPEAK.4/.8** (`canSpeak` was pure grade '
    'arithmetic wearing a capability name — renamed `minGradeCleared`, replaced by an '
    'evidence-based `state.voice` block carrying word_motor everFired, '
    '`matrixDrivenPct`, and the last emit rejection WITH ITS AGE), **MIRRORID.5** '
    '(donor Gn/s is a persistent field; freshness now derives from `stepsComputed`, so '
    'a stalled card reads `idle` instead of showing a rate it earned minutes ago), '
    '**SYNCPARTIAL.7 + PARTMIRROR.4** (the missing denominators — `1/17 mx`, `2/8 cl`), '
    '**DONORKILL.2** (`pauseIfKilled` on every donor row, so an irreversible press '
    'surfaces its consequence first), **DASHDEAD.4** (an auth failure no longer renders '
    'as a brain failure — the page probes the no-auth public snapshot and reports '
    '"admin lane not authenticated, brain is UP"). RESYNCDUTY.9 HELD until the '
    'CELLBOUND.F verdict lands (it edits the same phase counter). New: MIRRORID.6 — '
    'the leaderboard banks Gn·s off that same stale rate. Ledger: FINALIZED '
    '§2026-08-20.'
)


def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write(p, s):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def crlf(s):
    return s.replace('\r\n', '\n').replace('\n', '\r\n')


def do_now():
    p = os.path.join(REPO, 'docs', 'NOW.md')
    s = read(p)
    if MARK in s:
        print('SKIP docs/NOW.md (already synced)')
        return
    anchor = '> **Current - 2026-08-19'
    alt = '> **Current — 2026-08-19'
    use = anchor if anchor in s else (alt if alt in s else None)
    if use is None:
        print('FAIL docs/NOW.md: no Current-2026-08-19 banner found')
        return 1
    demoted = use.replace('**Current', '**Prior')
    s = s.replace(use, crlf(NOW_BANNER) + '\r\n\r\n' + demoted, 1)
    write(p, s)
    print('OK docs/NOW.md: new Current banner prepended, prior demoted')
    return 0


def do_resume():
    p = os.path.join(REPO, 'docs', 'RESUME.md')
    s = read(p)
    if MARK in s:
        print('SKIP docs/RESUME.md (already synced)')
        return 0
    anchor = '> ## ⭐⭐⭐ 2026-08-20 (latest)'
    if anchor not in s:
        print('FAIL docs/RESUME.md: no "(latest)" anchor found')
        return 1
    demoted = anchor.replace(' (latest)', ' (prior)')
    s = s.replace(anchor, crlf(RESUME_SECTION) + demoted, 1)
    write(p, s)
    print('OK docs/RESUME.md: new latest section prepended, prior demoted')
    return 0


def do_claude():
    p = os.path.join(REPO, '.claude', 'CLAUDE.md')
    s = read(p)
    if MARK in s:
        print('SKIP .claude/CLAUDE.md (already synced)')
        return 0
    tail = 'war ledger in FINALIZED §2026-08-18.'
    if tail not in s:
        print('FAIL .claude/CLAUDE.md: CURRENT-STATE tail sentence not found')
        return 1
    s = s.replace(tail, tail + CLAUDE_ADD, 1)
    write(p, s)
    print('OK .claude/CLAUDE.md: CURRENT-STATE headline extended')
    return 0


if __name__ == '__main__':
    rc = 0
    for fn in (do_now, do_resume, do_claude):
        rc = (fn() or 0) or rc
    sys.exit(rc)
