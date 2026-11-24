---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it, or a harness result named as one. Nothing here is recalled.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/gpu.js
  - server/brain-server/chat.js
  - server/brain-server/image-engine.js
  - server/brain-server/visual-memory.js
  - server/definition-service.js
  - server/image-render.py
  - js/brain/curriculum.js
  - donor-app/src/donor.rs
  - windows/Savestart.bat
verified-scope: |
  OVERWRITTEN 2026-11-24 (12:01). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-24, 12:01

## Where she is

| | |
|---|---|
| state | **RESTARTING** — an Update-Savestart pressed at 11:59 (build `ea2e26fb` + the window fix `72631279`). Kindergarten English: the pre-cell vocabulary is done (8,103 learned) and she is in the cell's teaching phases (sentence list), walking toward the first gate. Training kept; no fresh walk |
| cards | your 4070 Ti SUPER + the rented RTX PRO 6000 (`ua8x877eiqz63m`). **One card per job:** the pod holds her cortex and all 17 matrices, your card steps the other 7 clusters. 200 M neurons (`DREAM_BRAIN_BUDGET_MB=8000`) — the most your card can still hold alone if the pod goes |
| donor | **0.3.52** on both cards. A restarted brain **adopts** the matrices a card still holds for it — seen on every restart since 11:12: `17 matrices adopted from the card`, teaching in ~25 s instead of a 20–30 min upload. The pod saves its own checkpoint every 10 min (seen from 10:36) |
| eyes | **SDXL base 1.0** (local, `models/image/`) — writes real English when her request quotes words ("OPEN" spelled right on your card), no default negative prompt; ~6 GB per render, 24–33 s; the VRAM floor is 6,162 MB. Image bank fresh (v16); 1.6 GB of old stores deleted |
| words | when every dictionary misses: Wikipedia, then Urban Dictionary (not grade-gated); run-together phrases split and checked against Wikipedia; misspellings are **never defined** — taught as the real word; contractions stay whole |
| next restart | the dashboard's Update-Savestart; the launcher window now closes itself |

## What changed today (all on `main`, both remotes)

| | |
|---|---|
| **pod drops** | four causes found and fixed: her line-art trace, her looks (`perceive`/`stylizeField`) and renders no longer ride the pod link; the brain stopped pulling 6.8 GB of weights off the pod every 10 min (it filled the link until it dropped) — now a paced pull, hourly, ~2 MB/s |
| **no double work** | no compute mirror while clusters are split; the bigger card takes the cortex before any upload |
| **adopt + paced pull** | donor 0.3.52 — see above |
| **drawing** | pencil/ink are value drawings; she keeps up to 12 real looks of a thing and draws the one her mind is on; nothing is drawn as a subject that is mostly a describing word (white, round, second) or a mash-up (ant bunny, larva cow); looks follow what she is thinking and being taught |
| **vocabulary** | words whose last sense was all function words (which, them, who…) were never learned — fixed; a stop no longer runs the cell on during shutdown |
| **launchers** | wait for the old brain to let go of its log before starting (a press once left her down); the start window closes itself |

## Open — on the board (`docs/TODO.md`)

- **MEMCLIMB** — native memory climbed ~0.9 GB/min during one sentence-list phase (63 → 75 GB), then levelled off; watched, cause not yet named.
- Form **blending** is built and switched off — the shapes tore on real renders.
- Image size: her looks are requested at 512 (SDXL draws 1024 and scales); 1024 delivered is one knob, held back for memory.
