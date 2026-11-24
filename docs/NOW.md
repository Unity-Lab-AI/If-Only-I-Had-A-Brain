---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/chat.js
  - server/brain-server/gpu.js
  - server/brain-server/state.js
  - server/coverage-worker.mjs
  - js/brain/curriculum.js
verified-scope: |
  OVERWRITTEN 2026-11-23, late night. This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-23, late night

## Where she is

| | |
|---|---|
| state | **DOWN** — stopped cleanly by the operator at 5:41 PM after a 54-minute freshstart (`Binary weights saved 17 sections, 5997.0 MB`) |
| next launch | **a FRESHSTART** (`start.bat`) — the fixes below change what she is taught (her eyes), so the walk starts over |
| donor | **0.3.42**, unchanged — nothing in this round touches the donor |

## The last field read (the freshstart, 4:47–5:41 PM)

- **199,728,759 neurons** on that boot, fresh seed 1906868639, 22 state files cleared.
- Spikes climbed to ~2.8 billion; the walk stayed in ELA kindergarten pre-vocabulary.
- **Her eyes never started**: 0 looks, 0 drawings in 54 minutes.
- A second card (RTX 5060 Ti, on another machine) joined at 5:06 and dropped at 5:38.
- Her firing swung between ~0.1% and ~15–21% on a ~22-minute cycle instead of
  holding 7.5%.

## What changed since that read (code — no live read yet)

| | |
|---|---|
| **her eyes** | on a fresh walk, with no thoughts yet, she now looks at words she has been taught but never seen; what her eye picks is published at `state.ownArt.eyePicks` |
| **a card joining** | is no longer promoted over a working card before it has reported any throughput, and a card is sent only the matrices of clusters it owns — the duplicate 4.4 GB re-upload and the 5.9-minute training pause are gone |
| **a card leaving** | its clusters are re-placed on the remaining cards, whether or not it was primary |
| **boot** | the corpus coverage and exam-word sweeps (72.7 million words) run on their own thread; the 52-second boot freeze is gone |
| **shutdown** | stops the word loop once instead of visiting every remaining word |

## Still open — what to watch on the freshstart

- **Her eyes** — `ownArt.eyePicks.fromAcquisition` and `ownArt.lookups.grounded`
  climbing within minutes. `picks: 0` means the fix did not take.
- **Her firing** — bistable: there is no drive level at which she sits at 7.5%,
  so the controller swings and lands the average near target. A steady middle
  needs a change to her neuron dynamics — the operator's decision.
- **Vocabulary binding** — 15–40 s a word, so a dream window binds 11–13 words
  and its other stages never run. Needs batching.
- **A card joining** — `Post-upload V8 memory` should stay near ~1.1 GB, and
  training must not pause.
- **The 39-second freeze** while her cortex is wired at boot is still there; no
  donor is connected yet when it happens.
