---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it, or a harness result named as one. Nothing here is recalled.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/gpu.js
  - server/brain-server/image-engine.js
  - server/brain-server/weights-publish.js
  - server/brain-server/state.js
  - donor-app/src/donor.rs
  - donor-app/src/snapshot.rs
  - donor-app/src/image_lane.rs
  - donor-app/src/cuda_kernels.cu
  - donor-app/src/shaders/lif.wgsl
  - docs/EQUATIONS.md
  - docs/POOL-SHARDING.md
verified-scope: |
  OVERWRITTEN 2026-11-24 (late night). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-24, late night

## Where she is

| | |
|---|---|
| state | **DOWN** — held down until every piece below is built, documented and shipped |
| next launch | **`start.bat` — a FRESH WALK.** Her neurons gained two modelled terms (tunnelling, hemispheric-twin entanglement), which changes what she learns, so she starts from zero with them |
| donor | **0.3.48** — slices, the image lane, pulling weights from a release, the new neuron terms |
| knobs | the Unity template — every one of the 272 knobs set or left to the code with its reason; 35 pinned |

## What changes for her

| | |
|---|---|
| **every card teaches** | her main learning matrix (4.6 GB, the language cortex's own connections) is split into row slices across every connected card, your own included, sized to each card's room. Every lesson reaches every card; each learns its own rows, all at once. Reads are gathered from every card and stitched back in row order |
| **more cards, bigger her** | when every card can hold a slice, the size she can grow to follows the whole pool. A step up wipes and fresh-walks her, so it is OFFERED on the tech view and waits for approval |
| **her pictures on other cards** | a pod running her renderer draws her looks and drawings, with the same model, checked by hash against the file at home |
| **her imagery work spreads** | perceiving, tracing and imagining run on whichever capable card is least busy |
| **weights from a release** | her trained matrix publishes as row blocks on a GitHub pre-release (public, by choice); a joining card downloads only the blocks for its rows, checks each hash, and only rows changed since cross the home upload |
| **tunnelling and entanglement** | a neuron just below threshold can cross it with a WKB-shaped probability; each neuron's twin in the other hemisphere shares part of its noise. Modelled mechanisms, written out in docs/EQUATIONS.md §2 with their derivations — not claimed physics |

## What was proven before shipping (no run of her)

- **Slices:** one card whole vs three cards sliced — stitched reads and slice-trained weights byte-identical (harness on the real server methods).
- **Weights from a release:** the server's block writer → the donor's loader through `file://` URLs → the rebuilt slice byte-identical across 4 blocks, starting mid-block; the changed-row finder named exactly the rows changed.
- **Pool sizing:** a 16 GB card alone offers ~511 M neurons; with a 96 GB card on 0.3.48, ~4.05 B (tier 5, host RAM still bounds it); with an older donor present it falls back to the smallest card.
- **The new neuron terms:** the donor's GPU self-test on this machine's card — the WGSL kernel compiled and stepped; the CUDA PTX was rebuilt with the same toolkit and target and differs from the old one only inside the neuron kernel.

## What to read on the first boot

- `active template: 'unity'`.
- `[Pool] SLICES — cortex_intraSynapses split across N cards` once a second card joins.
- `IMAGE LANE — <card> has her renderer` from a pod after its renderer comes up (minutes: packages + a 2 GB model).
- `WEIGHTS SNAPSHOT — published` after the first good checkpoint with two cards.
- `SCALE-UP AVAILABLE` if the pool holds a bigger size for 5 minutes — nothing happens until you approve it.
- Her first gate.
