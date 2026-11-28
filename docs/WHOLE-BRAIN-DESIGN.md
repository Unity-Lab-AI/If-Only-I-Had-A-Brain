---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ This page is a DESIGN built from measurements. Every number on it came out
# of an instrument that is named beside it. Nothing here is implemented until
# the "Status" column says so.
status: verified
sources:
  - js/brain/cluster.js
  - js/brain/curriculum.js
  - js/brain/sparse-matrix.js
  - donor-app/src/shaders/plasticity.wgsl
  - donor-app/src/cuda_kernels.cu
  - server/brain-server.js
last-verified: "2026-11-27 (night) — §4 to §6 rewritten from the instruments after the design was built; she has not been started"
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

### All three together, on her real code

The real cluster, the real teaching call, the new word code, the only-when-wrong rule, four passes:

| Wires per target cell | 100 pairs — all fourteen pathways | 400 pairs — the five finished so far |
|---|---|---|
| 300 | **100 / 100 on every one** | 400 / 400 on every one |
| 100 | **100 / 100 on every one** | 400 / 400 on every one |
| 3–10 (today), old code and rule | 6–54 / 100 | — |

*Instrument: `.scratch/brain-check2.mjs`.*

### The wiring inside a region — where definitions and word order live

A word's cells in the meaning region taught to call up another word's cells in the same region, through her real inside-wiring teach call. 100 pairs:

| Wires per cell inside | Present code + present rule | New code + present rule | Present code + only-when-wrong | **New code + only-when-wrong** |
|---|---|---|---|---|
| **30** (what she is built with) | **8 / 100** | 31 | 27 | **100 / 100** |
| 100 | 8 | 49 | 24 | **100 / 100** |
| 300 | 17 | 70 | 33 | **100 / 100** |

Inside wiring is local — 27 of a meaning cell's 30 inside wires come from other meaning cells — so at 100 pairs it needs only the code and the rule. **At her vocabulary's size it needs more wires as well:**

| Pairs | Present code + present rule (30 wires) | New code + only-when-wrong, 30 wires | New code + only-when-wrong, 100 wires |
|---|---|---|---|
| 400 | 3 / 400 | 386 / 400 | **400 / 400** |
| 1,000 | **0 / 1,000** | 841 / 1,000 | **1,000 / 1,000** |

*Instrument: `.scratch/brain-intra-check.mjs`.*

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
| **Word code** | One function gives a word its cells: meaning (value-ranked embedding dimensions) in one part of a region, identity (cells chosen independently per word) in the other. Every lesson, every probe, every pathway uses it. | **built, and every lesson uses it.** A word lights 2.67 % of a region. It is the default for her language cortex. |
| **Learning rule** | "Only when wrong": a wire changes only when its cell is wrong, by as much as closes the gap (`docs/EQUATIONS.md` §4). | **built on the host and on the card, both backends; it is the rule for every pathway and for the wiring inside her cortex.** Card and host agree on all 11 test weights. |
| **Wiring** | 300 wires per target cell, inside a region and on every pathway, at full fan-out; a cell's inside wires drawn from its own region; her cell count derived from the card that holds her. | **built.** At her production size (1,328,482 cells) 95.8–100 % of taught cells pass threshold on every pathway and 99.9 % inside each region. |
| **Cells firing from wiring** | On the card each cell hears the cells that just fired (`docs/EQUATIONS.md` §3); her cortex cells rest silent. | **built on the card, both backends, and sent by the server.** From rest, 54.0 of 54 taught cells fire one step after their source pattern is lit, and 0.7 of 1,946 others. Reaches her with the next card release. |
| **Speech** | The state she speaks from is activity in her own cells — one cell for every unit of that state — and the word she says is read from the cells that are lit. **Test: silence her cells and she goes silent.** | **built.** Seven taught answers: 7 of 7; with her speech cells dark, 0 of 7; relit, 7 of 7. Naming 900 of 900. |
| **Reading** | A pathway from letters straight to a word's own meaning cells, taught inside her word lesson. Half of a written word's cells are the whole word at once, half its letters at their places. After each new word she goes back over earlier words and re-teaches one the new word broke. | **built.** Taught words read 200 of 200, untaught 0 of 200; three sets of 200 taught one after the other, each word met once: 198, 198 and 199 of 200 still read at the end where the server teaches, 200, 200 and 200 the way a card does it. With every cell of a written word shared with words spelled alike, the same test left 0, 12 and 112. |
| **Gates** | Every figure a gate prints measures what it names; beside it, the same questions asked of the lesson's own items before it taught them. | **built.** READ taught 200 / untaught 0 of 200; COMPREHEND taught 99.3 % / untaught 12.2 %; both list gates print the before-the-lesson figure and never gate on it. |

---

## 5. What was not known, and what was found

- **The wiring inside a region had the same fault** (8 of 100), and the same three changes fix it (§2). At her production size it now learns 99.9 %.
- **Her neurons, run together.** The 67 % burst was real, and it was the wiring: with every cell hearing every cell that fires, inside wiring at its old starting size set 85–88 % of a cluster firing from one lit pattern. Started near nothing (0.003–0.015), only the taught cells fire — 1.35 % at the peak over 400 steps.
- **Does she compose, or only recall?** She answers a taught question put in other words 50 times in 60. A sentence she was never taught, with one word left out, she completes 12 % of the time. So: she holds up under rewording of what she was taught; she does not yet produce what she was never taught. The gates print that second figure so it can be watched as she walks.
- **Why she only recalled, and what changed it.** Every line she made was a taught sentence word for word — 79 of 79. The cause was in the speaking state, not the wiring: the units that stand for an exact run of her words carried her down a taught sentence whatever she meant. They are now made from the run *and* the thing the line is about, and each step of her own line is also taught on what lines share. A line about a thing she was taught no line about is then a new line that ends; the next word of a never-taught sentence, said as her own line about its subject, went 18.9 % → 26.8 % and taught sentences 88.2 % → 92.3 % (2,400 of her sentences). The figure above — a never-taught sentence *said to her* with a word left out, 12 % — is a different path, was not touched, and re-measures the same.
- **Naming the thing she means.** A line about a thing she was taught no line about had that thing's word in it 2 % of the time: a word's own score is the same at every place in a line, so the taught patterns always won. One learned weight per unit — *say the thing here* — added to the word the line is about, learned from every sentence's own subject, took that to 100 %, named once.
- **A dictionary's part-of-speech label carries no word-order signal she can use** (31.8 % against 32.8 % for always guessing the commonest kind); the kinds her own lessons separate do (30–32 % against 17 %). So nothing was built on a label table.
- **Spelling carries a little meaning to words she was never taught to read.** After her reading lesson on 400 words, a never-taught word whose ending five or more taught words share brings up its own meaning cells over another word's 60.6 % of the time (51.9 % before the lesson; other never-taught words 45.3 % → 52.1 %). It is a lean, not a read: she still reads 0 of 200 untaught words, as she must.

---

## 6. What she is built as now

| | |
|---|---|
| Language cortex | sized from the card that holds her: 624,194 wired cells on a 4 GB card, 936,958 on 6 GB, 2,499,584 on 16 GB, plus 391,524 speech cells |
| Wires per cell | 300 inside its region, 300 on every pathway — 600 on the four pathways into and out of her motor cells (meaning ↔ motor, letters ↔ motor) |
| A word | 2.67 % of a region — half from its meaning, half its own |
| Learning | only when wrong, everywhere in the language cortex |
| At rest | silent; a cell fires when its wiring, a lesson or drive pushes it |
| A fresh cortex | comes out this way with no settings at all |
| Her own lines | a taught sentence word for word only when she means what it was about; otherwise put together from what lines share, with the thing she means named once |
| A word she does not know | looked up and given her whole word lesson and its definition; asked about by name when there is nothing to look up; the answer weighed before it is taken in |
