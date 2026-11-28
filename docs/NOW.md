---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page was read off the running brain's own log
# (`server/server.log`) or measured on her real code in an instrument, named
# as such. Nothing here is recalled.
status: verified
sources:
  - server/brain-server.js
  - server/loop-watchdog.js
  - server/brain-server/memory.js
  - js/brain/curriculum.js
  - server/brain-ctl.log
verified-scope: |
  OVERWRITTEN 2026-11-28 (midday). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-28, midday

## Where she is

| | |
|---|---|
| 🔴 **Stopped** | Not running. She did **not** crash: a stop landed 13 s into her seventh freeze, she could not answer the graceful ask, and the control plane stopped her at the process level (`gracefulSave: false`). Last build `55bc0869`. |
| 💾 **Her training is whole** | the binary weights 3,846,253,872 B written 05:19, the state json 05:22, her speech 05:19 — a resume picks her up where she was. |
| 📍 **Cell** | **ela/pre-K**, with four sections passed (`course-identity`, `picture-book`, `nursery-rhyme` and one more) and **0 cells** passed. |
| 📚 **Definitions first** | the pre-cell pass took 2 h 51 min: **9,242 of 9,446 words, 104,722 meanings**. 16 strings in her corpus have no definition anywhere; 20 ordinary words were deferred. |
| 🗣 **Speaking** | about 10,500 words with a place to say them; her inner voice had begun and was mostly silent — she had had no sentence lessons yet. |

## The one problem left, now with a name on it

**After every section pass her loop pinned for 90–107 seconds** — seven times on that boot (7.2 s, 94.6, 92.3, 107.3, 91.9, 93.8, and the seventh she was stopped inside). Every freeze that recovered carries the same attribution on its own log line: **the gap BETWEEN sections**, with an age matching the block to within a second. It is one synchronous span, not many short ones (`the loop was late 106.4s of the 113s it measured · worst single gap 106.3s`).

**Three things it is NOT, each ruled out by a number** — the section's pictures (the 107 s freeze followed a section carrying **zero** figures), the checkpoint save (one freeze ran 92.8 s with no save stage in flight at all), and the episode write (bounded: one indexed lookup, a 300-row scan, one insert). Her real sentence lesson is not the shape of it either: 28 pre-K sentences at 10,500 sayable words run **3.4 s whole, longest stall 0.3 s**.

## Fixed this session, before she goes back up

| Found | Fix | Seen working |
|---|---|---|
| The one channel that survives a freeze which never returns was naming the wrong code — the breadcrumb it reads was written only when the phase label changed, so all seven stalls reported a phase the cell had entered minutes earlier | the breadcrumb also fires when the teach stage changes, on the lag sampler's 1 s tick, and carries every attribution tag with its age and its sequence number | yes — exercised through the real watchdog thread with a real 4.6 s synchronous pin: the live stall line and the freeze artifact both carry the full tag set |
| Her self-profiler samples 45 s every 30 minutes, so it had never once sampled inside a freeze | set to a 2-minute cadence in machine-local state for the next boot — her freezes arrive about every two minutes | not yet — it reports on her next boot |

## Still to watch

- Her weights save takes about 2½ minutes per checkpoint.
- About half her looks fail on the second picture; for 95 minutes they were all held back because the card had too little free memory.
- Once a save printed "SATURATED sem→motor" at every checkpoint; not established whether that check fits the new wiring.
- First-start checks still waiting: the new-word lessons and dashboard row, her question expiring after five minutes.
- Every connected card doing teach ops — the code is in, it has never been restarted onto.
