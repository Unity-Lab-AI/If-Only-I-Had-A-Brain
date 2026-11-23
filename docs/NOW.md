---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-server/chat.js
  - server/brain-server/visual-memory.js
  - server/drawable-taxonomy.js
  - server/brain-server/eye-style.js
  - js/brain/mindspace/gpu.js
  - windows/start.bat
verified-scope: |
  OVERWRITTEN 2026-11-23, night. This file is a SNAPSHOT of the present and is
  overwritten, never appended. The previous snapshot (the evening's two boots)
  is in git: git log -p docs/NOW.md.
---

# NOW — 2026-11-23, night

## Where she is

| | |
|---|---|
| state | **DOWN** — stopped by the operator during the evening boot; no boot since |
| code | `main` **ca0b766f** on both remotes (`origin` Forgejo, `github`) |
| next launch | **a FRESHSTART** (`start.bat` — boots fresh; the operator's call, to carry nothing over from earlier sessions) |
| donor | **0.3.42** in the repo root and published |
| board | `docs/TODO.md` = template + the one open watch row |

## The last field read (the evening boot, before she was stopped)

- `/health` 200, **199,728,759 neurons** on that boot, RTX 4070 Ti SUPER holding all
  8 clusters, `runningFloorMB` 8,064, ports 7526 / 5123 / 5124 answering.
- Her renderer had done **0** renders and **0** look-ups; she drew 9 times from
  shapes she already held. The walk was at ELA kindergarten pre-vocabulary; no
  gate probe yet.
- A freshstart derives its own neuron count from free RAM at boot — the number
  above belongs to that boot only.

## What changed since that read (code only — no live read exists yet)

| | |
|---|---|
| **her inventions** | ONE fused new thing, never old drawings side by side. Her thoughts supply the words; how they join (a quality, a kind, a place, a substance) is read from WordNet's own categories. Her renderer pictures the idea as one image, two renders must agree, she learns its shape under its own name, then paints it |
| **her eye** | the backdrop is the border colour families present on ≥3 sides, so a subject that runs off the frame no longer teaches her its own colours are background; a backdrop must also be smooth; frames are skipped, stands dropped by colour, thin parts kept |
| **her hand** | paints the WHOLE picture she learned — scene and subject — as smooth surfaces from colour layouts kept at 3× the shape grid. Nothing cut out, no grain, no fog |
| **her judgement** | a piece is shown only when it looks more like its own thing than anything else she remembers, by silhouette and by percept |

Judged on renders through the production code (a harness on the real mixins, the
worker proxy and her renderer — not a live boot): eight of eight read as what
they are, and the operator called the last set perfect.

## What to watch on the freshstart

- **Her first looks** — `ownArt.imageEngine.ok` and `ownArt.lookups.grounded`
  climbing, with `vramTightSkips` (not `vramUnreadable`) carrying any deferrals.
- **Her inventions** — `canvas:imagine:<idea>` frames that are one thing, and
  `ownArt.imageEngine.inventions` / `inventionsDeclined`.
- **Her judgement** — `ownArt.eyeJudge`: `passed`, `refused`, and on the last
  verdict `beaten` (shape) and `sightBeaten` (percept). Early on, with almost
  nothing in her memory, she has little to rank against and passes most pieces.
- **A known gap** — a fused picture can come back missing one of its things,
  and nothing in her can tell yet; it needs recognition of parts within a
  picture.
- **Her voice** is still started from another project's tree — the operator's
  call.
