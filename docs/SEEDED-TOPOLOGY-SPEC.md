---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
status: draft
sources:
  - js/brain/cluster.js
  - js/brain/sparse-matrix.js
  - donor-app/src/compute.rs
last-verified: "a2a2b0ec 2026-08-25"
---

# SEEDED TOPOLOGY — spec for donor-side structure generation

**Written 2026-08-18.** Spec only. **Nothing here is implemented, and none of it should be bolted onto an unrelated batch.**

> The operator (verbatim): *"can the synaptic construction be built into the doner or is it always changeing? idk im trying of thingking how to limit the start up time"*

---

## The question, answered

**It is not "always changing."** The intra topology is built once at construction and then fixed — only the *values* learn. Structural plasticity prunes and rescales existing entries; it does not rewire the graph.

**But it IS randomly regenerated on every boot**, because construction draws from unseeded `Math.random()` (`js/brain/sparse-matrix.js` — `initSmallWorld`, `initTopographic`, `initTopographicProjection`, `initRandom` all call it directly). Two boots of the same brain produce two different graphs.

That single fact is what blocks donor-side generation: **Rust cannot reproduce a JS `Math.random()` sequence.**

---

## What was already taken WITHOUT this work

The cheap half of the startup win did not need determinism and shipped in the WALKFIX batch:

- On a savestart resume the ~45s construction was **pure waste** — `_applyPendingCortexWeights` does `cortex.synapses = m`, replacing `rowPtr`, `colIdx` **and** `values` with the checkpoint's own.
- Construction is now deferred as a thunk when a geometry-matching checkpoint is queued, with `ensureIntraTopology()` as the safety net if the restore does not deliver.
- Measured at 60,000 neurons: 192ms → 0ms. At the 12M cortex that is the full **~45s off every resume boot**.

**What remains unsolved is the upload**, which is the real startup cost: **~2,792MB, roughly 12 minutes at the observed ~4MB/s wire.**

---

## The three prizes seeding would unlock

| # | Prize | Size of the win |
|---|---|---|
| 1 | **Donor generates structure locally on a fresh walk** | The fresh-walk upload approaches zero — on a fresh walk the *values* are initial draws too, so seed + params reproduce the entire matrix donor-side |
| 2 | **Checkpoints stop storing `colIdx` + `rowPtr`** | Structure is ~**1.49GB of the ~4.4GB** file (**34%**) — smaller saves, shorter save windows, less save-wedge exposure, smaller resume uploads |
| 3 | **Reproducible wiring** | Two runs become comparable; an ablation can change one variable instead of also reshuffling the graph. This is a genuine scientific gain, not just an engineering one |

Prize 2 also directly reduces the blast radius of the checkpoint-integrity class of bug that cost a morning of training on 2026-08-18.

---

## The risk, stated plainly

**If the JS and Rust generators ever diverge by a single draw, the learned weights land on the wrong synapses and she is silently brain-damaged.**

There is no loud failure mode. The matrices would still be the right *shape*, the upload would still succeed, the gates would still run — she would simply be wired wrong, and every downstream measurement would quietly become garbage. This is why it does not get bolted onto a batch of small fixes.

---

## What implementation would require

1. **A deterministic PRNG in place of `Math.random()`** — splitmix64 or xorshift128+, chosen for exact 64-bit integer reproducibility. Implemented **identically** in JS and Rust, with the same seeding and the same draw order.
2. **Draw order becomes load-bearing API.** Today the loops draw in an incidental order (`initSmallWorld` tiers, the retry/`attempts` paths, the `picks` dedup rejections). Every rejected draw still consumes a number, so **the retry logic itself is part of the contract**. It must be specified, not merely mirrored.
3. **A seed that travels.** Per-matrix seed derived from a stable key — `hash(clusterName, matrixName, rows, cols, fanout, formatVersion)` — persisted in the checkpoint so a resume regenerates the *same* structure.
4. **A parity harness** — the non-negotiable gate. Generate the same matrix in JS and in Rust at several sizes and assert `rowPtr`, `colIdx` are **byte-identical**. Run it in CI on every donor release. Without this, do not ship.
5. **A format-version bump** so a checkpoint written without structure can never be read by a build that expects it.
6. **A donor protocol addition** (structure-from-seed message) and therefore a new donor binary.

---

## Recommended sequencing

1. Land the PRNG + parity harness **first**, with the generator still running server-side. Prove byte-identical output across languages before anything depends on it.
2. Then drop `colIdx`/`rowPtr` from checkpoints (prize 2) — server-side only, no donor risk, and it is the largest immediate win.
3. Only then move generation to the donor (prize 1), behind a flag, with the server able to fall back to shipping structure.

**Do not start at step 3.**

---

## Honest assessment

Prize 2 is worth doing on its own merits and carries far less risk than prize 1, because the structure is regenerated by the *same* engine that wrote it — no cross-language parity needed at all if the server regenerates from the seed. **If only one piece of this is ever built, build that one.**

Prize 1 is the headline number, but the fresh-walk upload happens once per fresh walk, while checkpoint size is paid on **every single save**.

---

## Related: why the 4.1GB CPU-side CSR is NOT a candidate for the same treatment

**Added 2026-08-18** after the operator killed a bad idea before it got built.

> The operator (verbatim): *"This woundnt work tho becasueu of ransom or user controlled drop outs, right?"*

The WALKFIX.5 investigation described a values-only donor readback frame as "the real cure" for the 4,165.6MB CPU-side `cortex_intraSynapses` copy. **That framing was wrong, and this is the correction.**

The donor is a **volunteer GPU in a browser tab that can vanish mid-tick with no notice**. Freeing the CPU array makes that tab the *sole custodian* of her intra weights. A readback-on-demand save then requires the donor to be alive **at save time** — and if it dies first, every bit of learning since the last save dies with it. That converts a memory cost into a **durability** cost, which is the one cost this system cannot pay.

**The correct model, stated so it does not get re-litigated:**

- The **CPU-side copy is the authoritative master.** The box is the only machine we control.
- The **donor is an accelerator, not the system of record.**

The only variant that survives the objection is **periodic streaming readback** — pulling values in chunks straight to disk on a timer, never holding all 2.88GB at once. That is genuinely cheaper in RAM, but it still loses the delta since the last pull when a donor drops, so it only becomes reasonable once weights are **replicated across several donors** (DF.7 data-parallel). At one live donor there is no redundancy to lean on.

**Note how this interacts with the seeding work above:** seeding shrinks the *structure* (`colIdx` + `rowPtr`, ~1.49GB), which is deterministic and therefore genuinely regenerable without any donor. It does **not** touch `values` (~2.88GB), which are learned and must be durably held by the box. The two ideas are not the same shape, and only one of them is safe.
