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
| state | **DOWN** — stopped by the operator so the fixes below could land |
| next launch | `Savestart.bat` keeps her learning (nothing in this round changes what she is taught); `start.bat` is a fresh walk |
| donor | **0.3.45** for paced lessons (local + rented); 0.3.44 still works, unpaced |
| rented card | Runpod RTX PRO 5000 Blackwell (48 GB, $0.82/hr) — the pod's launcher picks up 0.3.45 on its own within ~5 min |

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

## What to read on the next boot

- `[Pool] CORTEX MOVE` soon after the rented card connects, then the upload time.
- The time per word-pair on the rented card against 0.94 ms, and its round trip
  (it should stay near ~200 ms now its queue is bounded).
- Any `GPU donor … CLOSED` line — it now names its own cause.
- Her first gate.
