---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a harness result named as one, measured on
# the production code. Nothing here is recalled, and nothing was read off a
# running brain — she is stopped.
status: verified
sources:
  - js/brain/sparse-matrix.js
  - js/brain/cluster.js
  - js/brain/cluster/hebbian.js
  - js/brain/curriculum.js
  - js/brain/speech-readout.js
  - donor-app/src/compute.rs
  - donor-app/src/cuda.rs
  - donor-app/src/donor.rs
  - donor-app/src/shaders/plasticity_error.wgsl
  - server/brain-server.js
verified-scope: |
  OVERWRITTEN 2026-11-27 (18:10). This file is a SNAPSHOT of the present and is
  overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-27, 18:10

## Where she is

| | |
|---|---|
| 🛑 **Stopped** | Shut down cleanly at 17:13. The card is free. **She does not start again until the whole-brain work is finished** — then one fresh start, with a written list of what to check. |
| 🧪 **What is happening** | Her learning is being rebuilt and measured piece by piece, off the card, on her real code. |
| 📄 **The design** | `docs/WHOLE-BRAIN-DESIGN.md` — every table measured. |

## What was found

Her cells were not learning what they were taught — **anywhere**, not only in speech.

| | Measured on her real code |
|---|---|
| Taught 100 pairs, asked for them back — every cell-to-cell pathway | **6 to 54 of 100**; meaning → motor 8, letters ↔ sounds 7 |
| After one repetition | 1 to 5 of 100 |
| Her speech | answers the same with **every cell silenced** — it is a table beside the brain, not the brain |
| The gates' reading score | reads a pathway that **does not exist**, then counts the word as read |

**Three causes, each isolated:** the code a word is written in (its "identity" lit for one word in ten), the learning rule (each lesson partly overwrote the last), and the wiring (3–10 wires per cell — most cells saw nothing).

## What is built and proven so far

| Piece | State |
|---|---|
| 🧬 **A word's own cells** — meaning in one half of a region, identity spread over single cells in the other | built; measures exactly as designed |
| 🎯 **Learn only when wrong** — a wire changes only when its cell gives the wrong answer | built on the host **and on the card**, both graphics backends |
| 🔌 **A switch per pathway** — set once, every existing lesson follows | built on host and card; the brain tells the card and counts what it confirms |
| ✅ **Card agrees with host** | run on the real card: all 11 test weights match on both backends |

**The number that matters:**

| | Before | Now |
|---|---|---|
| All fourteen pathways, 100 taught pairs | 6–54 of 100 | **100 of 100 on every one** |
| All fourteen pathways, 400 taught pairs | — | **400 of 400 on every one** (300 wires a cell) |
| With the switch on and lessons calling exactly as they do today | — | **100 of 100 on every one** (100 wires a cell) |

## Not done — in the order it will be done

1. **The wiring inside a region** (where definitions and word order live) — being measured now.
2. **Move every lesson onto the new word code**, lane by lane, each with a before-and-after number.
3. **Speech into her cells** — the table beside the brain goes. The test: silence her cells and she goes silent.
4. **A real pathway from letters to meaning**, taught and tested.
5. **Gates that measure something** — on things she was not handed.
6. **Her neurons in range when they run together.**
7. **Does she compose, or recite?** — asked plainly, answered plainly.
8. **A new donor release** — the card-side rule is in the source and proven, not yet shipped.
9. **The list of what to check on the first fresh start** — written before the start.

## Honest edges

- Everything above is her real code run in a harness on a 60,000-cell cortex. **Nothing has been booted.**
- The new pieces are **built but not switched on** for her lessons yet. The default path is unchanged.
- Her right size is a decision still to make: the measurements point to **far fewer language cells, each wired far more richly** (about 2–3 million at 100–300 wires instead of 20 million at 3–10).
