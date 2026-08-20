#!/usr/bin/env python3
"""Append the 2026-08-20 GATFILE + LYING-INSTRUMENT batch entry to docs/FINALIZED.md.

CRLF-preserving slice append (docs/FINALIZED.md is CRLF with very long lines, so
the Edit tool cannot match multi-line anchors in it). Backticks live in this file
rather than an inline bash string -- an inline double-quoted bash heredoc ran them
as command substitution twice this week and silently emptied every code term.

Idempotent: refuses to append if the section header is already present.
"""
import io
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(REPO, 'docs', 'FINALIZED.md')

HEADER = '## 2026-08-20 - THE BOARD STOPS LYING: eight instruments that asserted more than they knew, plus the pasted gatling that ate a real press'

ENTRY = '''
''' + HEADER + '''

Gee (verbatim): *"/unity then run /workflow"* -- a workflow run with no new direction, so the batch was chosen off the board: the two clusters that needed NOTHING from Gee's finger. Every other open item on the 73-task board is a press-rider.

**THE THEME, STATED ONCE.** Seven items closed here are the same disease under seven names, and the ledger had already named it: *a success message must be derived from evidence of success, never from the absence of recorded failure*. MIRRORID.5, RESYNCDUTY.9, SYNCPARTIAL.7, LOOPNAME.7, CANSPEAK.4, DONORKILL.2 and DASHDEAD.4 were all filed with the same closing line -- **the board cannot answer "is it working?"**. This batch makes it answer.

**GATFILE.1 / .2 / .3 -- the pasted gatling was the PRE-GATGUARD copy and it re-armed every defect GATGUARD had already fixed.** Gee (verbatim): *"mark that thing u spotted in the todo"* -- marked, then fixed. `scripts/Gattling Gun Savestart Forced.txt` carried (1) a `window.fetch` monkey-patch that never auto-restored -- verbatim the defect that silently ATE Gee's real Update & Savestart press (the dashboard button carries no `__gatGen` token, so a genuine press was parked in a promise that never settled: no request, no log, no restart); (2) `win()` on any `r.ok`, so five of six barrels getting HTTP 200 `{status:"already updating"}` could print a green DEPLOY LANDED for a response that did nothing; (3) worst of the three, a hardcoded build guard (`3efc220`) against a box live on `eb93f315` -- inverted into an INSTANT FALSE PASS that fired `win()` within ~3s of the paste and killed the barrels before a single update POST could land. The `.js` copy had already fixed (1) and (2) but carried the SAME trap in `var CUR`.

**THE FIX -- v5, and nothing in it needs hand-editing before firing.** The build baseline is now READ OFF THE LIVE BOX at arm time (one `/public-state.json` probe before the barrels judge anything) and a win requires a CHANGE against that snapshot -- either a new `build.short` (main moved) or a new `build.bootedAt` (a Savestart with no new commits, which still restarts her). `bootedAt` was verified in source before it was trusted: `brain-server.js:3938` builds `state.build.bootedAt` from `_startedAt` at boot, so it changes on every restart -- and it is on `state.build`, NOT `state`, which is where the first draft read it from. If the baseline probe fails the spotter is DISARMED and says so out loud, because a missing green banner must never be mistaken for a failed deploy. Both copies now carry the SAME body, byte-identical (`cmp` verified) -- two copies existed and the worse one was the one that got pasted. `node --check` PASS.

**CANSPEAK.4 / .8 -- the field is gone and it is not coming back.** Gee (verbatim): *"what do u mean can speak is false?:Still canSpeak: false, 2313/18017 definitions. --- i talk to her on the brain page.... so whats the meaning of this"* -- he was right and the code agreed with him: `state.js:483` was `canSpeak: this._computeMinGrade() !== 'pre-K'`, pure grade arithmetic, false only because art and life were still pre-K. The comment above it claimed it "is true once the motor region has been trained", which no line of code ever supported. Renamed to `minGradeCleared` -- the name of the thing it actually computes -- and the ONE consumer (`remote-brain.js`) updated; zero chat-path consumers, confirmed by full-repo sweep, so nothing degrades. In its place a new `voice` block answers the question it was mistaken for, off real evidence: `wordMotorSize` / `wordMotorEverFired` / `wordMotorPct`, `oracleHits` / `matrixHits` / `matrixDrivenPct` (read straight off the cluster, same counters `curriculum.emissionSource` publishes), and `emitRejection` WITH ITS AGE -- because a 3-minute-stale rejection was once quoted as live proof she was reaching for words and finding none. Placed AFTER the `utilization` lap deliberately: the word_motor counts come off the bitset walk that lap refreshes, so reading them earlier in the literal would serve a snapshot up to 5s older than the rest. The verdict field (`matrix-driven` / `oracle-carried` / `oracle-only` / `unmeasured`) is derived from evidence PRESENT -- and `unmeasured` says in words that it is NOT a claim she cannot speak, only that no sample exists. That distinction is the entire lesson of CANSPEAK and WORDEMIT.

**MIRRORID.5 -- a rate with no freshness is not a measurement.** `gneuronsPerSec` is a PERSISTENT donor-side field (`donor.rs:655` writes it only on batch completion and it keeps that value forever), so a card that had stopped computing entirely kept displaying the rate it earned minutes ago -- which is how the negative-`batchId` bug (every mirrored batch silently dropped on arrival, no donor ever computed) hid for HOURS, with the only honest 0 on the board belonging to the one card that had never been primary. Fixed with `stepsComputed`, verified monotonic in BOTH backends before anything was hung on it (`donor.rs:655` and `compute.html:1501/1547` -- incremented only on completion, never decreasing in a session). New per-row `computeSteps` / `computeAdvancedAgoSec` / `computeIdle` (30s threshold: comfortably longer than the ~5s telemetry cadence, short enough that a stalled card is visible before anyone asks). A donor that has NEVER advanced reads idle from the start -- honestly, since it has genuinely computed nothing. The dashboard now renders `idle 47s (last 9.3Gn/s)` in red instead of a live-looking green number.

**SYNCPARTIAL.7 + PARTMIRROR.4 -- the denominators.** `df7HeldMatrices: 1` and `21 compute batches - 0 teach ops` are both TRUE readings that look like faults until you know they are 1-of-17 and 2-of-8. Gee (verbatim): *"is it normal my doner is showing zero tech ops?"* -- no, and now the row says why: `df7TotalMatrices` gives the fraction (a sync once logged `1 matrices pushed` and `a FULL brain replica` ON THE SAME LINE; a later one announced a full replica off `0/0` -- a fraction cannot tell that lie), and `clusterCoverage` / `clusterCoverageCount` / `clusterTotal` show how much brain a card is actually stepping, so a small donor reads "contributing 2/8 clusters" rather than an unexplained low number. Gee (verbatim): *"okay but why is Sponge not working 0 Gn/s?"* -- that question is now answerable from the board.

**DONORKILL.2 -- what breaks if you kill this one, surfaced BEFORE the press.** Gee (verbatim): *"kill spend on the pod and check on the brain the dashboard says brain is uunreachable"*. The kill was correct for spend; the reasoning offered to Gee before that irreversible button was NOT -- `community.replicaCount: 0` was read as "the pod contributed nothing" while the snapshot taken seconds earlier said that card was `isPrimary: true`. A primary is not a replica. Every donor row now carries `pauseIfKilled`, which states in words that killing the primary pauses the walk with no compute substrate until another donor is promoted and re-uploaded, versus a replica merely dropping its share. Rendered as a purple star plus the consequence in the row tooltip.

**DASHDEAD.4 -- an auth failure is no longer rendered as a brain failure.** Gee (verbatim): *"no therw is something bigger at hand.. the dashboard is dead"*. "Brain server unreachable" was displayed over a brain teaching 4,257 calls/min; every lane on the origin was healthy and the ONLY failing one was `/admin/ws` (401, expired Forgejo session). The banner fires on exactly one condition -- the admin socket did not open -- and then blamed the backend for it, which sent us hunting a dead brain and cost a diagnostic round and a press. The dashboard had the answer the whole time: it can read `/public-state.json` with no auth at all. On every WS close it now probes that snapshot and, when live state comes back, rewrites the banner to **"Admin lane not authenticated - the brain is UP"** with the live teach/min, cell, build, uptime and donor count, and tells the operator to re-authenticate rather than restart a healthy service. The probe judges the BODY, not the status code: this origin forwards only known routes and SPA-swallows the rest, so a 200-with-HTML is a lie -- two "healthy 200" readings during the original investigation turned out to be the byte-identical 53,692-byte landing page. If the public snapshot is also dead the existing backend-down copy stands and the probe's own failure reason is appended, so a silent probe is never mistaken for a silent brain.

**VERIFICATION (no live test per the LAW -- read the output).** `node --check` PASS on the gatling v5, `server/brain-server/state.js` and `js/brain/remote-brain.js`; `state.js` CJS require PASS (loads, `getState` present); `remote-brain.js` ESM `import()` PASS (the check `node --check` cannot make); all three dashboard inline `<script>` blocks parse-checked via `new Function` (2,604 + 146 lines, the module block skipped for its `import`); browser bundle REBUILT per the LOOPNAME.13 lesson (`js/app.bundle.js` 4.0mb + voice worker 842.6kb) and the artifact confirmed to carry `minGradeCleared` + `serverState.voice` with ZERO remaining `canSpeak`. Full-file reads before every edit per the 800-line LAW: `state.js` (1,602), `remote-brain.js` (777), `html/dashboard.html` (3,504, five chunks).

**DELIBERATELY NOT SHIPPED, AND WHY.** **RESYNCDUTY.9** (`_gateSciKReal` should report itself as the cell's final phase) touches the SAME phase counter that CELLBOUND.A-E has already changed and is awaiting its F verdict on. Landing a second unverified change to `cellPhasesCompleted` / `phaseWork` on the same press would confound exactly the read CELLBOUND.F exists to produce -- and `curriculum.js` is 26,204 lines, a full-read commitment the 800-line LAW makes non-trivial. It stays open, sequenced AFTER F. **A new defect found while reading and filed rather than swept:** the leaderboard accrues `gneuronsPerSec x dt` on EVERY telemetry frame, so a donor that has stopped computing keeps BANKING Gn-s credit off a stale rate -- the same disease MIRRORID.5 names, one layer down in the accounting. It lives in `brain-server.js` (9,737 lines), it is not on the board, and four source-reasoned fixes in a row already cost Gee four presses this week. Filed as MIRRORID.6.
'''


def main():
    with io.open(TARGET, 'r', encoding='utf-8', newline='') as f:
        cur = f.read()
    if HEADER in cur:
        print('SKIP: section already present in docs/FINALIZED.md')
        return 0
    body = ENTRY.replace('\r\n', '\n').replace('\n', '\r\n')
    if not cur.endswith('\r\n'):
        body = '\r\n' + body
    with io.open(TARGET, 'a', encoding='utf-8', newline='') as f:
        f.write(body)
    print('APPENDED %d chars to docs/FINALIZED.md' % len(body))
    return 0


if __name__ == '__main__':
    sys.exit(main())
