---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/gpu.js
  - server/runpod-control.js
  - crates/unity-protocol/src/frames.rs
  - donor-app/src/donor.rs
  - js/brain/curriculum.js
  - server/server.log
verified-scope: |
  OVERWRITTEN 2026-11-24. This file is a SNAPSHOT of the present and is
  overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-24

## Where she is

| | |
|---|---|
| state | **DOWN** — stopped by the operator after the eye-verdict boot |
| next launch | **a FRESHSTART** (`start.bat`) — GPU learning was landing on the wrong pair before this round (below), so a walk trained under it should start over |
| donor | **0.3.43** — new: it unpacks bundled teach frames. 0.3.42 still works, unbundled |

## The last field read (the pre-cell vocabulary pass, previous boot)

- **300 words in 649.5 s, 67,556 association-pair updates** — about 9.6 ms a
  pair-teach and 2.2 s a word, from `server/server.log`.
- The dream trickle: 11–13 words per 184 s window, ~17 ms a pair-teach — the
  same per-pair cost, so the lever is the pair, not the call.
- A brain tick's GPU compute 18 ms against ~180 ms server-side around it.

## What changed since that read (code — no live read yet)

| | |
|---|---|
| **GPU learning order** | the queued bound-Hebbian ops now go to the card before the next pattern does. They read whatever pattern is on the card when they run, and they used to wait up to 20 ms while the next pair's pattern went out at once — so some trained the wrong pair. Every donor version |
| **teach frames** | on a 0.3.43 donor they ride one message per event-loop turn instead of one per frame, in the same order, through the same handlers |
| **the CPU mirror** | the lateral-inhibition and predictive-error mirrors no longer run on intermediate reps when the card carried the update, the rule every other lane already followed |
| **Runpod** | an admin page (`html/runpod.html`) can rent a card that joins her pool as a donor and terminate it. **Nothing has been rented**: renting waits until a card measurably stays busy |

## Still open — what to watch on the freshstart

- **Teach speed** — the pre-cell line `N words taught … in Ts` and the trickle
  line `N words processed in Ts` against the reads above;
  `_boundHebbianOrderFlushes` climbing; the `TEACH BUNDLE on` boot line once the
  0.3.43 donor connects.
- **Her firing** — bistable; a steady middle needs a change to her neuron
  dynamics, the operator's decision.
- **A card joining** — `Post-upload V8 memory` should stay near ~1.1 GB.
- **The 39-second freeze** while her cortex is wired at boot.
