---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - js/brain/curriculum.js
  - server/brain-server/gpu.js
  - crates/unity-protocol/src/frames.rs
  - donor-app/src/donor.rs
  - server/server.log
verified-scope: |
  OVERWRITTEN 2026-11-24 (late). This file is a SNAPSHOT of the present and is
  overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-24, late

## Where she is

| | |
|---|---|
| state | **DOWN** — stopped by the operator so the card-side lesson could be finished |
| next launch | **a FRESHSTART** (`start.bat`) — her relation tags are written for the first time, which changes what she is taught |
| donor | **0.3.44 required** for the lesson frame; 0.3.43 still works, one pair at a time |

## The last field read (build `ec4c4000`)

- First vocabulary pass, 300 words: **192.8 s** — against 649.5 s at the start of
  the day (417.2 → 220.3 → 192.8 across the boots in between).
- Every association call took the card-held path (7,982 calls, 0 on the CPU path).
- The 4070 Ti SUPER read **5% busy** while she was taught: the card was waiting on
  the brain building each pair on its one main thread.

## What changed since that read (code — no live read yet)

| | |
|---|---|
| **the lesson** | one frame per rep carries every pair; the card expands it into the same steps the brain used to send one pair at a time, checked step for step against a recording of the per-pair code |
| **relation tags** | written to the card and the CPU copy for the first time — before, a 0.5 into a byte array stored 0 and nothing was sent |

## What to read on the freshstart

- `stageProfile.cardLesson.lessons` climbing and `lessonRefused` near zero.
- The first vocabulary pass against 192.8 s.
- The card's utilisation during a pair phase — the number that says whether a
  rented card would be kept busy.
