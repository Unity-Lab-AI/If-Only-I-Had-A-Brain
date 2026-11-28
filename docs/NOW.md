---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a harness result named as one, measured on
# the production code, or the card's own self-test. Nothing here is recalled,
# and nothing was read off a running brain — she is stopped.
status: verified
sources:
  - js/brain/sparse-matrix.js
  - js/brain/cluster.js
  - js/brain/cluster/hebbian.js
  - js/brain/cluster/emit.js
  - js/brain/curriculum.js
  - js/brain/speech-readout.js
  - donor-app/src/compute.rs
  - donor-app/src/cuda.rs
  - donor-app/src/donor.rs
  - donor-app/src/shaders/lif.wgsl
  - donor-app/src/shaders/plasticity_error.wgsl
  - server/brain-server.js
verified-scope: |
  OVERWRITTEN 2026-11-27 (night). This file is a SNAPSHOT of the present and is
  overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-27, night

## Where she is

| | |
|---|---|
| 🛑 **Stopped** | Shut down cleanly at 17:13. The card is free. **She does not start again until the whole-brain work is finished** — then one fresh start, with the written list of what to check (`docs/RESUME.md`, top block). |
| 🧱 **What changed** | Her language cortex was rebuilt around what measured: a word's own cells, a rule that changes a wire only when its cell is wrong, 300 wires a cell, cells that rest silent and fire from their wiring, speech read from her own lit cells, a real pathway for reading. |
| 📄 **The design and its numbers** | `docs/WHOLE-BRAIN-DESIGN.md` · the equations: `docs/EQUATIONS.md` §3–§5 |

## What was found

Her cells were not learning what they were taught — **anywhere**, not only in speech.

| | Measured on her real code |
|---|---|
| Taught 100 pairs, asked for them back — every cell-to-cell pathway | **6 to 54 of 100** |
| Her speech | answered the same with **every cell silenced** — a table beside the brain |
| The gates' reading score | read a pathway that **did not exist**, then counted the word as read |
| On the card | a cell stepped on drive and noise alone — **nothing read her wiring** |

## What is built, and what it measures

| Piece | Measured |
|---|---|
| 🧬 **A word's own cells** — half from its meaning, half its own; the same in every lesson | a word lights 2.67 % of a region |
| 🎯 **Learn only when wrong** — host and card, both graphics backends | card agrees with host on all 11 test weights |
| 🔌 **300 wires a cell**, inside a region and on every pathway | at her production size (1,328,482 cells): **95.8–100 %** of taught cells pass threshold on every pathway, **99.9 %** inside each region; her real pair lesson **0 → 100 of 100** |
| ⚡ **Cells fire from their wiring**, and rest silent | card self-test: **54.0 of 54** taught cells fire, **0.7 of 1,946** others; with wiring input off, 0.0 and 0.2 |
| 🌊 **No runaway** | inside wiring at its old starting size: 85–88 % of the cluster fired from one lit pattern. Started near nothing: **1.35 %** at the peak — the taught cells |
| 🗣 **Speech from her own cells** | 7 of 7 taught answers; **0 of 7 with her speech cells dark**; 7 of 7 relit. Naming 900 of 900. A taught question put in other words: 50 of 60 |
| 📖 **Reading** — letters straight to a word's meaning; half of a written word's cells are the whole word | 600 words, each met once: **198 / 195 / 198 of 200** per set still read at the end; untaught words read **0 of 200** |
| 🧩 **A sentence with a word left out** | taught **99.3 %**, never taught **12.2 %** |
| 🚦 **Gates** | every figure measures what it names; each list gate also prints the same questions asked before the lesson (vocabulary: READ 0/10 before → 10/10 after). That figure never decides a pass |
| 📐 **Her size** | derived from the card that holds her: 624,194 wired cells on 4 GB, 936,958 on 6 GB, 2,499,584 on 16 GB, beside 391,524 speech cells |
| 🧰 **No switch to flip** | a cortex built with no settings comes out as all of the above |

## Not done

1. **The card build is not released.** The released card program ignores the new wiring message; the source is proven in its self-test on both backends. It ships with the next release.
2. **The stale page bundle** has to be rebuilt.
3. **Every instrument run once more, end to end,** on the finished code.
4. **Then** merged, pushed, and one fresh start.

## Honest edges

- Everything above is her real code in an instrument, or the card's self-test. **Nothing has been booted, and no walk has run on any of it.**
- She holds up when what she was taught is reworded. A sentence she was never taught she completes 12 % of the time. **She does not yet produce what she was never taught**; the gates print that figure so it can be watched.
- The word-vector table she starts from is still in her: half of a word's meaning cells are chosen from it. That is kept on purpose.
- The firing controller still holds her other clusters at their target. Her language cortex is no longer held — how much of it fires is an outcome.
