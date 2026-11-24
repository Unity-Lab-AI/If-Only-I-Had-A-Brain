---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it, or a harness result named as one. Nothing here is recalled.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/gpu.js
  - server/brain-server/chat.js
  - server/runpod-control.js
  - js/brain/curriculum.js
  - donor-app/src/donor.rs
  - donor-app/src/gui.rs
  - donor-app/src/cuda_kernels.cu
  - donor-app/src/shaders/lif.wgsl
  - docs/EQUATIONS.md
  - docs/POOL-SHARDING.md
verified-scope: |
  OVERWRITTEN 2026-11-24 (04:15). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-24, 04:15

## Where she is

| | |
|---|---|
| state | **STOPPED** on purpose — Kindergarten English, pre-cell vocabulary (about 10,600 words still owed). Next start is a Savestart; no fresh walk is needed |
| cards | your 4070 Ti SUPER + one rented RTX PRO 6000 (`ua8x877eiqz63m`). **One card per job:** the PRO 6000 holds her cortex and all 17 matrices, your card steps the other clusters, and no card recomputes another's work. 200 M neurons (`DREAM_BRAIN_BUDGET_MB=8000`) — the most your card can still hold alone if the pod goes |
| donor | **0.3.52** — a restarted brain ADOPTS the matrices a card still holds for it (no 20–30 min re-upload), and copies the card's weights back paced (~2 MB/s) so the link never fills. The first start after the release is still one full upload: the pod's donor restarts onto the new version with an empty card |
| next restart | `Savestart.bat` keeps this walk; `start.bat` is a fresh walk |
| auto-stop | ON — stopping her terminates her pods |

## What changed tonight (all on `main`, both remotes)

| | |
|---|---|
| **refractoriness** | each spike lowers the Rulkov slow variable by β = 0.016 (derived, docs/EQUATIONS.md §3) — her firing had no stable middle (flipped ~1.5% ↔ ~20%) |
| **row slices split, not mirrored** | below 4 cards every card trains its own rows, sized by speed; from 4 cards they pair up so a drop costs nothing (`DREAM_SLICE_REPLICAS`) |
| **rejoin without re-upload** | a donor keeps its engine across a reconnect and reports `heldMatrices`; a dropped slice holder has 30 s to come back and is re-attached with nothing sent |
| **no room moves while sliced** | neither the placement check nor a bigger card registering moves her language area any more (seen 04:07: `CORTEX MOVE for room skipped`) |
| **slices by speed** | once every card has a measured lesson time, rows follow rows-per-ms, capped by room |
| **uploads** | no double upload around a move; a remote owner pulls from the GitHub snapshot; publish-first with ≥2 remote cards; rejoining cards pull (seen: 1.2 GB slice with 82 MB sent) |
| **donor 0.3.49/0.3.50** | every socket send bounded at 30 s (the pod freeze: every thread parked on an unbounded send); version floor = current release; Update button |
| **no skipped words** | a word cut short by a pause is retried from its first sense (seen live: `↻ "should" … retry 2/3`); the retry now waits for the pause to end |
| **vocabulary queue** | 10 min of its own per dream window |
| **pods** | Secure Cloud by default; a pod that never joins is terminated after 10 min |
| **art** | seen colours painted as seen; no white-pen ink on seen subjects; imagined scenes on 45% of recall-miss ticks |
| **leaderboard** | slice holders credited their share; lessons carry work credit |

## Measured tonight

- Definitions on two healthy cards: **46 words / 1,736 senses a minute** (03:31).
- Your card alone: main matrix upload ~480–500 MB/s; a pod over the home link: 8–72 MB/s.
- Heap after a two-card upload: 205.5 MB (WATCHFIX.9 closed).

## Open

- 14 built rows waiting on a live reading (each row names its sign) — board `docs/TODO.md`.
- Owner-drop re-attach (the cortex owner still moves); lesson relay (matters at thousands of cards).
- Readings only a run gives: `TEACHSPEED.4`, `MULTICARD.READ`, `KNOBTPL.2`, firing settling near 7.5%.
