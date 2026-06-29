# V2 MILESTONE WATCHDOG — Filter Spec (Claude's monitoring instrument during Gee's test runs)

> **Purpose:** canonical, current filter pattern that produces `v2-milestone-watchdog.log` in repo root. **This log is Claude's monitoring instrument while Gee runs the brain.** Gee fires `start.bat` (or Savestart) and runs the external `tail -f` pipeline that filters `server/server.log` through the regex alternation below into `v2-milestone-watchdog.log`. Claude tails THAT file during the test and reports milestone events / saturation halts / anomalies back to Gee in real time. The log is small (milestones only — CELL ALIVE 10s heartbeat noise excluded), so Claude can watch it without context bloat. **Update this file every time the codebase ships new log signatures so the watchdog filter stays current.**

> **Last updated:** 2026-05-09 (post-fk + fl sweep — added equational-emergence signatures, removed dead `TEMPLATED` token; ownership framing corrected from "Gee monitors" to "Claude monitors during Gee's test runs").

---

## Why this doc exists

Pre-2026-05-09, the V2 watchdog filter pattern lived only in:
- The header line of `v2-milestone-watchdog.log` (whatever pattern was active for the current run)
- Historical FINALIZED entries (Session 114.19cv + 114.19cw + iter9-K)

That meant whenever Gee or future-Claude needed to update the filter (after a code sweep adds new log signatures), there was NO canonical source-of-truth — just historical artifacts. Operator caught it 2026-05-09: *"is the V2 watchdog upto date? if not why the fuck are none of our supposrt files being updated?"* + *"its suppose to be for you to monitor when i test AND when i want you to monitor"*. This file fixes the gap AND makes the ownership explicit (Claude monitors during test runs Gee initiates).

**Maintenance rule:** every code sweep that adds a new milestone-worthy log signature appends to this file. Every dead signature gets removed. The filter stays current with reality.

---

## Current filter pattern (post-fk + fl sweep — 2026-05-09)

### PowerShell (windows)

```powershell
Get-Content server\server.log -Wait -Tail 0 | Select-String -Pattern '(Phase START|Phase DONE|GATE|K-DIAG|K-STUDENT|K-VOCAB|⚠|⚠⚠|🚨|💥|⛔|ERROR|Error|TypeError|Traceback|FAIL|crash|hung|timeout|OVERLOAD|graduated|grade-advance|signoff|Brain restored|saveWeights|LEAK|climb|OOM|composeSentence|coherence sample|SatHealth|sentenceGenRate|SENTENCE-GEN|SATURATION HALT|FORCE-ADVANCE|capability evidence|inner-thought|showcase|💤|☀|UNSET|cappedInjections)' -NotMatch '(CELL ALIVE)' | Tee-Object -FilePath v2-milestone-watchdog.log -Append
```

### Bash (linux)

```bash
tail -f -n 0 server/server.log \
  | grep -E '(Phase START|Phase DONE|GATE|K-DIAG|K-STUDENT|K-VOCAB|⚠|🚨|💥|⛔|ERROR|Error|TypeError|Traceback|FAIL|crash|hung|timeout|OVERLOAD|graduated|grade-advance|signoff|Brain restored|saveWeights|LEAK|climb|OOM|composeSentence|coherence sample|SatHealth|sentenceGenRate|SENTENCE-GEN|SATURATION HALT|FORCE-ADVANCE|capability evidence|inner-thought|showcase|💤|☀|UNSET|cappedInjections)' \
  | grep -v 'CELL ALIVE' \
  | tee -a v2-milestone-watchdog.log
```

---

## What each token catches

### Curriculum lifecycle (always-relevant)

| Token | Catches | Source |
|-------|---------|--------|
| `Phase START` | Curriculum phase entry banner | `Curriculum._phasedTeach` |
| `Phase DONE` | Curriculum phase exit banner | `Curriculum._phasedTeach` |
| `GATE` | Gate result lines (PASS/FAIL/REFUSED) | gate methods |
| `K-DIAG` | Per-letter LETTER→MOTOR identity diag | `_teachLetterNaming` |
| `K-STUDENT` | K-grade student-test battery results | `_runStudentBattery` |
| `K-VOCAB` | Vocab-exposure phase progress | curriculum |
| `graduated` | Grade pass + advance event | `_advanceSubGrade` |
| `grade-advance` | Manual grade-advance via POST /grade-advance | brain-server |
| `signoff` | Operator LAW 6 signoff via POST /grade-signoff | brain-server |
| `saveWeights` | Brain state checkpoint | persistence |
| `Brain restored` | Boot-time state hydrate event | persistence |

### Severity icons

| Icon | Meaning | Source |
|------|---------|--------|
| `⚠` | Warning (single-tier) | various |
| `⚠⚠` | Warning (double-tier — basin saturation, training collapse) | curriculum + cluster |
| `🚨` | Critical alert | brain-server + curriculum |
| `💥` | Crash / unrecoverable | server |
| `⛔` | Block / halt | curriculum (saturation halt) |

### Error patterns

| Token | Catches |
|-------|---------|
| `ERROR` / `Error` | console.error lines |
| `TypeError` | JS type errors |
| `Traceback` | Stack-trace headers |
| `FAIL` | Generic failure marker |
| `crash` / `hung` / `timeout` | Lifecycle breakages |
| `OVERLOAD` | Basin overload warnings |
| `LEAK` / `climb` / `OOM` | Memory growth signals |

### fk + fl equational-emergence signatures (NEW 2026-05-09 — post-fk sweep)

| Token | Catches | Source |
|-------|---------|--------|
| `composeSentence` | composeSentence call-site logs (warns + errors only — not per-emission) | cluster.js |
| `coherence sample` | First-10 coherence-cosine calibration logs per session | cluster.js (fj.6) |
| `SatHealth` | First-5 saturation-health calibration logs per session | cluster.js (fj.7) |
| `sentenceGenRate` | Per-cell sentence-gen probe rate in gate metrics | curriculum.js + kindergarten.js |
| `SENTENCE-GEN` | Reason-string `SENTENCE-GEN N/total (X%)` from non-ELA gate result blocks (fl.5) | kindergarten.js gates |
| `SATURATION HALT` | Curriculum-walk halt event (windowed 3-of-5 OR consecutive 3-streak per fj.11) | curriculum.js |
| `FORCE-ADVANCE` | Force-advance promotion event (PASSED / SKIPPED / REFUSED variants) | curriculum.js |
| `capability evidence` | Force-advance capability-evidence summary line | curriculum.js |
| `UNSET` | Diagnostic warn for `_lastUserInputText` regression (fj.1) | language-cortex.js |
| `cappedInjections` | composeSentence injection-cap counter spike (fj.10 — should be rare under fk.1's reduced-injection profile) | cluster.js |

### Inner-voice + dream-window signatures (existing)

| Token | Catches | Source |
|-------|---------|--------|
| `inner-thought` | Per-tick inner-thought emission line | brain-server |
| `showcase` | Showcase-fallback emission (≥50 trained words) | brain-server |
| `💤` | Inner-voice paused (dream window entered) | brain-server |
| `☀` | Inner-voice resumed (dream window cleared) | brain-server |

### REMOVED tokens (dead post-fk)

| Token | Why removed |
|-------|-------------|
| `TEMPLATED` | fk.1 ripped out the templated-composeSentence emission path. The `[TEMPLATED]` diag log line (added in iter9-K) is no longer fired by the brain. Keep grep happy by dropping the dead token. |

### Excluded (filtered OUT)

| Pattern | Why excluded |
|---------|--------------|
| `CELL ALIVE` | 10-second heartbeat. Floods the log with phase=name + memory snapshot. Useful for liveness check but drowns milestones. Excluded per v2→v3 noise-filter learning (Session 114.19cv). |

---

## Maintenance protocol

When a code sweep adds a new milestone-worthy log signature:

1. Add the signature token to the **PowerShell** + **Bash** filter blocks above.
2. Add a row to the appropriate "What each token catches" subsection.
3. If a sweep DELETES a log signature (e.g. fk.1 deleted templated emission), MOVE that token's row to "REMOVED tokens (dead post-X)" with the reason.
4. Bump the `> Last updated:` line at top.
5. Update is part of the SAME atomic commit as the code change (per docs-before-push LAW).

---

## How to use the filter

### Live monitoring during a 20hr K test (Gee runs filter, Claude tails the output)

**Gee's side (one-time setup per test run):**

```powershell
# Window 1 — fire the brain:
.\windows\start.bat

# Window 2 — start the watchdog filter pipeline. This APPENDS to
# v2-milestone-watchdog.log so Claude can tail the same file:
cd C:\Users\gfour\Desktop\If-Only-I-Had-A-Brain
Get-Content server\server.log -Wait -Tail 0 | Select-String -Pattern '<paste pattern from above>' -NotMatch '(CELL ALIVE)' | Tee-Object -FilePath v2-milestone-watchdog.log -Append
```

**Claude's side (when Gee says "monitor"):**

Claude opens a background `tail -f v2-milestone-watchdog.log` (via `Bash run_in_background` + the `Monitor` tool to stream new lines as notifications). Each new line surfaces in Claude's context as a notification; Claude flags anomalies / saturation halts / probe failures / `UNSET` warnings back to Gee in real time. Claude does NOT tail `server/server.log` directly — that file is too noisy (CELL ALIVE every 10s) and would flood context. The filtered milestone log is the right granularity.

### Post-run review

After a 20hr run, `v2-milestone-watchdog.log` contains the milestone catalog: every phase boundary, every gate outcome, every saturation halt, every force-advance, every coherence/saturation calibration sample. Either Gee OR Claude scans this file (NOT the full 100MB+ server.log) for the pattern that emerged.

### Common patterns to look for post-fk

- **Sentences emerging cleanly** → `[Curriculum] _probeSentenceGeneration[subject=ela] — N/5 natural-language seeds emitted ≥2 unique words (rate=X%)`. Look for rate ≥ 60% per cell.
- **Saturation halt** → `⛔ SATURATION HALT — trip cause: windowed (3/5-of-5)` or `consecutive-streak (3/3)`. If this fires, fk.7 work resumes (deepen training).
- **Force-advance refused** → `FORCE-ADVANCE <cellKey> REFUSED — capability minimums not met`. Means brain learned phases but can't emit; operator review required.
- **Coherence trending up** → `[composeSentence] coherence sample N/10 cosine=X.XXX` first-10 log lines per session. If cosines trend > 0.3, sentences are coherent under their seed; if < 0.10, training depth is insufficient.
- **Saturation health trending healthy** → `[SatHealth] sample N/5` first-5 log lines per session. If `meanCos` stays < 0.6 + `ratio` > 2.0, basins are healthy; if `meanCos` > 0.7 OR `ratio` < 1.5, basins are collapsing.
- **`UNSET` warn** → `[LanguageCortex] ⚠ composeSentence chat path entered with cluster._lastUserInputText UNSET`. SHOULD NEVER FIRE under fk.1+fj.1 (server-side `_lastUserInputText` set in processAndRespond entry). If it fires once, regression — investigate.

---

## Reference: prior watchdog filter generations

- **V2 milestone-only watchdog** (Session 114.19cv, 2026-05-04) — added `TEMPLATED` + `OVERLOAD` tokens; excluded `CELL ALIVE` heartbeat noise (v2→v3 learning).
- **V3 hardening** (Session 114.19cw, 2026-05-04) — added `LEAK` / `climb` / `OOM` memory tokens.
- **fk + fl sweep** (Session 114.19fk + fl, 2026-05-09) — REMOVED `TEMPLATED` (dead post-rip-out); ADDED `composeSentence` / `coherence sample` / `SatHealth` / `sentenceGenRate` / `SENTENCE-GEN` / `SATURATION HALT` / `FORCE-ADVANCE` / `capability evidence` / `UNSET` / `cappedInjections` signatures.
