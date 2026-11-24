---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/gpu.js
  - server/brain-server/state.js
  - js/brain/curriculum.js
  - crates/unity-protocol/src/frames.rs
  - donor-app/src/donor.rs
  - server/server.log
verified-scope: |
  OVERWRITTEN 2026-11-24 (night). This file is a SNAPSHOT of the present and
  is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-24, night

## Where she is

| | |
|---|---|
| state | **DOWN** — stopped by the operator after a run with her cortex on a rented RTX PRO 6000 (96 GB), so the fixes below could land |
| next launch | `Savestart.bat` keeps her learning (the knob template pins only the values she already ran on); `start.bat` is a fresh walk |
| donor | **0.3.46** frees a card's stale cortex after a move; 0.3.45 paces lessons; 0.3.44 still works, unpaced |
| knobs | the **Unity template** is the default — every one of the 262 knobs set or left to the code with its reason; the first boot seeds it and says so |
| rented card | Runpod — the pod's launcher picks up a new donor on its own within ~5 min |

## The last field reads

| | per word-pair | first 300 words |
|---|---|---|
| start of the day | 9.6 ms | 649.5 s |
| her own 4070 Ti SUPER, lessons on the card | 1.71 ms | 184.6 s |
| **with her cortex on the rented card** | **0.94 ms** | **91–110 s** |

- Moving her cortex to the rented card took ~18 min (≈ 6 GB at 5.8–18 MB/s over
  the home uplink, teaching paused throughout); the weights were pulled off the
  old card first and every checksum matched.
- The rented card's round trip read ~1.1 s under load, ~207 ms idle.

## What changed since that read (code — no live read yet)

| | |
|---|---|
| **lesson pacing** | a card holds at most 4 queued lessons; the donor replies when each one finishes. Before, the queue was unbounded and her local card's ping replies reached 7 s |
| **the heartbeat** | a card that has sent anything in the last 30 s is never killed for a slow ping. It had killed her live local card while it held the cortex |
| **cortex placement** | a new, bigger card takes the cortex at once; a card that DROPPED and came back waits 5 min; at most one move per 30 min; never while an upload runs |
| **weight pulls** | every 10 min while the cortex is on a card that is not this machine's GPU (30 min otherwise) |
| **the wire** | state snapshots no longer go to GPU donors or to a viewer more than 4 MB behind |
| **dream vocabulary** | no per-rep probe on lessons that do not train what it probes; one dream word at a time |
| **a donor closing** | the log now says why: close code, last heard, round trip, backlog |
| **the RTX PRO 6000 run** | the cortex moved the moment the card joined; the 4.9 GB main matrix went up in 582 s (~8 MB/s), teaching resumed on the rented card at a 192 ms round trip |
| **after a cortex move** | the old card is told to free its copy once the new one holds every matrix — the stale copy had left her own image renderer short of VRAM and refusing looks |
| **lesson window** | sized to the link instead of a fixed 4: enough in flight to cover one round trip (4 on her own card, ~30 on a rented one), still bounded. `state.lessonPacing` |
| **gate batteries** | no battery-wide clock — a slow card no longer fails a gate on time; each question keeps its 45 s hang guard |
| **knob templates** | load a whole set from the teach view: preview, then apply; live knobs change now, and she restarts ONCE for all boot-frozen ones |

## What to read on the next boot

- `[Pool] CORTEX MOVE` soon after the rented card connects, then the upload time.
- The time per word-pair on the rented card against 0.94 ms, and its round trip
  (it should stay near ~200 ms now its queue is bounded).
- Any `GPU donor … CLOSED` line — it now names its own cause.
- `the 'unity' template was SEEDED` and `active template: 'unity'` at boot.
- `state.lessonPacing.window` on a rented card, and the card's utilisation.
- `CORTEX MOVE done — told … to free its 17 stale cortex matrices` after a move.
- Her first gate.
