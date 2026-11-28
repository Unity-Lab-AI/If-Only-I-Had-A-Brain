---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ This page is a DESIGN built from measurements. Every number on it came out
# of an instrument that is named beside it. Nothing here is implemented until
# the "Status" column says so.
status: draft
sources:
  - js/brain/cluster.js
  - js/brain/curriculum.js
  - js/brain/sparse-matrix.js
  - donor-app/src/shaders/plasticity.wgsl
  - donor-app/src/cuda_kernels.cu
  - server/brain-server.js
last-verified: "2026-11-27 — written from the instruments below; no code changed yet"
---

# Whole-Brain Design — how her cells learn, and what has to change

**The short version:** her cells were not learning what they were taught, anywhere — not only in speech. Three things cause it, each one measured, and all three have to change together.

---

## 1. What was measured on her real code

A 60,000-cell cortex, her real learning rule, her real word codes. Each pathway is taught pairs of patterns and then asked for them back.

| Pathway | 20 pairs, 24 repetitions | 100 pairs, 24 repetitions |
|---|---|---|
| sounds → meaning | 11 / 20 | 20 / 100 |
| letters → sounds | 8 / 20 | 7 / 100 |
| meaning → motor | 6 / 20 | **8 / 100** |
| meaning → grammar | 12 / 20 | 20 / 100 |
| best of all fourteen | 18 / 20 | 54 / 100 |

After **one** repetition every pathway recalls 1–5 of 100.

*Instrument: `.scratch/brain-check.mjs`.*

---

## 2. Why — three causes, each isolated in a model

The model is the same projection built by hand, so one thing can be changed at a time. It reproduces her real code: **9 / 100** where the real code measured 8 / 100.

### Cause 1 — the word code

Every word is written onto 300 slots, each slot a block of cells. The part meant to make a word *that word and no other* lives in only 50 of those slots, so each identity slot lights up for about one word in ten.

| Word code | Two random words overlap | Two words alike in meaning overlap | 400 pairs recalled (100 wires, present rule) |
|---|---|---|---|
| present | 9.7 % | 9.5 % | 41 |
| **split** — meaning in one half, identity spread over single cells in the other | 7.2 % | 10.8 % | **242** |

⚠ The present code carries **no meaning** in its overlap: words alike in meaning overlap no more than any two words. The split code does.

### Cause 2 — the learning rule

The present rule pulls a cell's wires toward whatever is active each time it is taught, so each new lesson partly overwrites the last. The replacement changes a wire **only when the cell is wrong**: a cell that should fire and is too weak gains on its active inputs; a cell that should stay quiet and is too strong loses on them.

| Rule | 400 pairs recalled (split code, 100 wires) |
|---|---|
| present | 242 |
| **only when wrong**, 4 passes | **400** |

### Cause 3 — the wiring

A target cell has 3–10 input wires. With a source pattern lighting under 3 % of its region, a cell with 6 wires sees an active input **0.16 times** per pattern — most cells see nothing at all.

| Wires per target cell | 400 pairs recalled (split code, only-when-wrong) |
|---|---|
| 6 | 57 |
| 30 | 309 |
| 100 | **400** |

### At the same memory, wires beat cells

A projection's memory is *target cells × wires*. Holding that product fixed and asking for 2,000 pairs:

| Shape | Recalled (of 334 asked) |
|---|---|
| 23,000 cells × 6 wires | 104 |
| 4,600 cells × 30 wires | 154 |
| 1,380 cells × 100 wires | 193 |
| 460 cells × 300 wires | **262** |

Fan-out was halved (20 → 10) in May to fit more cells. That trade went the wrong way.

*Instruments: `.scratch/brain-rule-sweep.mjs`, `.scratch/brain-codes-check.mjs`, `.scratch/brain-newcode-check.mjs`, `.scratch/brain-budget-check.mjs`.*

---

## 3. How much wiring her vocabulary needs

Split code, only-when-wrong, 300 wires per cell, 6 passes:

| Pairs taught | Weights in the projection | Target cells | Recalled |
|---|---|---|---|
| 2,000 | 552,000 | 1,840 | 334 / 334 |
| 2,000 | 2,208,000 | 7,360 | 334 / 334 |
| 3,000 | 828,000 | 2,760 | 288 / 300 |

So about **276 weights per taught pair** holds 2,000 pairs perfectly and 3,000 pairs at 96 % — close to a straight line, sagging slightly. The design uses **350 weights per pair** to stay above it.

### What that means for her size

| | Now | Design |
|---|---|---|
| Language cells | 20,000,000 | **2–3 million** |
| Wires per target cell | 3–10 | **300** |
| Pairs one pathway can hold | a few dozen | **200,000** (70 million weights, 233,000 target cells) |
| Card memory, fourteen pathways | 1.8 GB | **≈ 7.8 GB** |

⚠ These are sized from a model at thousands of pairs. The numbers for 200,000 are a straight-line reading of it, not a measurement.

---

## 4. The design

| Part | Change | Status |
|---|---|---|
| **Word code** | One function gives a word its cells: meaning (value-ranked embedding dimensions) in one part of a region, identity (cells chosen independently per word) in the other. Every lesson, every probe, every pathway uses it. | not built |
| **Learning rule** | "Only when wrong" as a new mode of the existing plasticity kernel — on the card (WGSL and CUDA) and on the host. The kernel already holds everything the rule needs; it has to visit every target cell instead of only the lit ones. | not built — needs a donor release |
| **Wiring** | 300 wires per target cell; language cortex sized from §3 instead of from free memory. | not built |
| **Speech** | The state she speaks from is activity in her own cells; the word she says is her word-motor cells firing; the host-side table is removed. **Test: silence her cells and she goes silent.** | not built |
| **Reading** | A pathway from letters to meaning that is taught and tested. | not designed yet |
| **Gates** | Every figure a gate prints measures what it names, on something she was not handed. | not built |

---

## 5. What is not known yet

- Whether the pathway *inside* a region (meaning → meaning, where definitions live) has the same fault. Not measured.
- Whether her neurons stay in range when they run together. One test saw a burst of 67 % of cells in a single step with no controller attached; that may be the test.
- Whether a brain built this way **composes** — answers what it was never taught word for word — or only recalls. Nothing above measures that.
