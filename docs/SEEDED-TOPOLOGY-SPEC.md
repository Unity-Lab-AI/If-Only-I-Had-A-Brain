---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
status: draft
sources:
  - js/brain/cluster.js
  - js/brain/sparse-matrix.js
  - donor-app/src/compute.rs
  # ADDED 2026-08-27 by the new sources-coverage check: this page cites
  # brain-server.js:7546 (_applyPendingCortexWeights) twice as load-bearing
  # evidence and did not declare the file.
  - server/brain-server.js
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4, 12 of 22):
    - ⭐ "Nothing here is implemented" CONFIRMED, not assumed: 22 Math.random()
      calls in sparse-matrix.js, ZERO deterministic PRNG in it or cluster.js;
      all four named init fns exist at :50/:175/:278/:414;
      ensureIntraTopology() at cluster.js:4266 and
      _applyPendingCortexWeights() at brain-server.js:7546 (now :7879 — the
      2026-08-28 FIREKNOB/PSITEACH additions above it shifted the line; the
      function body is unchanged, re-checked 2026-08-29) behave as described.
      The spec's reasoning and risk analysis are intact.
    - ⛔ CORRECTED: "~12 minutes at the observed ~4MB/s wire". The 4MB/s is a
      myth KI-24 already marked FIXED (it was the pump, not the link; post-fix
      75-350 MB/s), and KI-24's own note warns that doc comments inherited its
      shadow - this was one. Same 2.79GB matrix measures 58.0s -> 39.7s.
    - ⛔ CORRECTED: checkpoint "~4.4GB" -> 5,460 MB measured on disk
      (server/brain-weights.bin = 5,724,850,936 bytes), so structure is ~27%
      of it, not 34%.
    - ⭐ RE-PRICED: prize 1 is worth ~40s once per fresh walk, an ~18x
      de-valuation; prize 2 untouched. This STRENGTHENS the page's own
      "build prize 2" conclusion.
  NOT CHECKED — do not read this page as authority on:
    - the ~1.49GB structure figure. Only the DENOMINATOR was re-measured; the
      numerator is carried forward unverified.
    - ⭐ UPGRADED 2026-08-27 (second pass): donor-app/src/compute.rs HAS now been
      read, during the GOTCHA.3b donor work. Two things confirmed:
        (1) The donor does NOT generate topology. `upload_sparse` RECEIVES a CSR
            triple (row_ptr / values / col_idx) and binds buffers; there is no
            construction path on that side. So "nothing here is implemented"
            holds on the Rust half too, not just the JS half.
        (2) ⭐ A DETERMINISTIC PRNG PRECEDENT ALREADY EXISTS IN THE DONOR and
            this spec does not mention it: `run_substeps` advances noise with
            `seed = seed.wrapping_mul(2654435761).wrapping_add(40503)`, and
            per-GPU streams are decorrelated with `base_seed.wrapping_add(g *
            0x9e3779b9)` (the golden-ratio constant). So requirement 1 of "what
            implementation would require" — a reproducible integer generator
            implemented identically both sides — has a working, shipping
            reference in this very file rather than needing splitmix64 from
            scratch. ⚠ It is a plain LCG, NOT splitmix64/xorshift128+, and it is
            used for NOISE not TOPOLOGY, so it is a precedent for the mechanism
            and not a drop-in for the requirement.
      ⚠ Still NOT verified: the protocol-addition claim (a structure-from-seed
      message), and whether the JS and Rust integer arithmetic would agree
      bit-for-bit across the draw ORDER, which is requirement 2 and the hard
      half.
    - the "60,000 neurons: 192ms -> 0ms" WALKFIX measurement.
    - whether the 39.7s upload figure still holds on the CURRENT build. It is
      taken from the SCALEWALK record, not re-measured - and no upload
      happened this pass to measure.
last-verified: "58510f6d 2026-08-29"
---

# SEEDED TOPOLOGY — spec for donor-side structure generation

**Written 2026-08-18.** Spec only. **Nothing here is implemented, and none of it should be bolted onto an unrelated batch.**

> **Re-verified 2026-08-27 (DOCPROV.4, 12 of 22).** ⭐ **"Nothing here is implemented" is STILL TRUE, and that was checked rather than assumed:** `js/brain/sparse-matrix.js` holds **22 `Math.random()` calls** and **zero** deterministic PRNG (no splitmix, no xorshift, no seeded generator) in either it or `cluster.js`; all four named constructors exist (`initRandom:50`, `initTopographic:175`, `initSmallWorld:278`, `initTopographicProjection:414`); `ensureIntraTopology()` is at `cluster.js:4266` and `_applyPendingCortexWeights()` at `brain-server.js:7879` (re-pointed 2026-08-29 — was `:7546`; the 2026-08-28 FIREKNOB/PSITEACH additions above it shifted the line, the function body is unchanged), both behaving as described. The only donor-side movement since the previous stamp is RHYTHM3S.2's `update_region_gates` in `compute.rs` — a Ψ-gate table writer, **not** a construction path, so *"nothing here is implemented"* still holds on the Rust half. **So the spec's REASONING is intact and its risk analysis stands unchanged.**
>
> ⛔ **What was wrong was its PRICING, and the correction is ~18×.** The motivating cost — *"roughly 12 minutes at the observed ~4MB/s wire"* — rests on a rate this project's own `KNOWN_ISSUES` **KI-24 has marked 🟢 FIXED and explicitly labelled a myth**: the 4MB/s was the *pump*, never the link. **KI-24's note even predicts this page:** *"Every doc comment that treated 4MB/s as the physical link inherited the pump's shadow."* The same 2.79GB matrix now measures **39.7s**. ⛔ **Also corrected: the checkpoint is ~5,460 MB (measured on disk), not ~4.4GB, so structure is ~27% of it rather than 34%.**
>
> ⭐ **The pleasing part: correcting the numbers makes this page's OWN recommendation stronger.** It already concluded *"if only one piece of this is ever built, build that one"* about prize 2 — and with prize 1 now worth ~40 seconds once per fresh walk against prize 2's saving on **every single save**, that conclusion goes from sensible to decisive. **A stale number did not just misinform; it made the page's best argument look closer than it was.**

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

**What remains unsolved is the upload**, which is the real startup cost: ⛔ **CORRECTED 2026-08-27 — it is ~40 SECONDS, not ~12 minutes, and this re-prices the whole spec.**

⛔ **The "~4MB/s wire" was a MYTH, and this project's own ledger says so.** `KNOWN_ISSUES` **KI-24 is 🟢 FIXED**: *"The '~4MB/s box uplink' was never the link — it was the pump."* The chunked-upload loop kept ≤~14MB in flight on an event loop the gates pinned in 3-4s slabs, so the wire drained early and idled — *"~14MB per ~3.5s cycle ≈ the measured 4MB/s."* Post-fix reads were **75-350 MB/s**. ⛔ **KI-24's own note warns about exactly this page: *"Every doc comment that treated 4MB/s as the physical link inherited the pump's shadow."*** This is one of those comments.

**The measured figure for this same matrix:** `2.79GB` uploaded in **58.0s → 39.7s** (SCALEWALK, and the improvement came with *no upload-code change* — the CPU walks had been throttling the network). `2,792MB / 39.7s ≈ 70 MB/s`, consistent with KI-24's post-fix range. ⚠ The old arithmetic was internally consistent — `2,792MB ÷ 4MB/s ≈ 11.6 min` — **it was the rate that was false, which is why the number looked trustworthy.**

⭐ **What this does to the three prizes below — and note it STRENGTHENS this page's own conclusion rather than undermining it:** **Prize 1 ("the fresh-walk upload approaches zero") is now worth ~40 seconds, once per fresh walk — an ~18× de-valuation.** Prize 2 (checkpoint size, paid on **every single save**) is untouched. ⭐ **The "Honest assessment" section already argues precisely this — *"Prize 1 is the headline number, but the fresh-walk upload happens once per fresh walk, while checkpoint size is paid on every single save"* — and the corrected numbers make that argument decisive instead of merely sensible. Build prize 2.**

---

## The three prizes seeding would unlock

| # | Prize | Size of the win |
|---|---|---|
| 1 | **Donor generates structure locally on a fresh walk** | The fresh-walk upload approaches zero — on a fresh walk the *values* are initial draws too, so seed + params reproduce the entire matrix donor-side |
| 2 | **Checkpoints stop storing `colIdx` + `rowPtr`** | ⛔ **DENOMINATOR CORRECTED 2026-08-27: the file is ~5,460 MB, not ~4.4GB** — measured on disk, `server/brain-weights.bin` = `5,724,850,936` bytes. So structure is ~**1.49GB of ~5.46GB ≈ 27%**, not 34%. ⭐ **The absolute win (~1.49GB per save) is unchanged and is still the reason to build this** — only the share moved, and it moved because the *file grew*, which makes save cost worse, not better. ⚠ **The ~1.49GB numerator was NOT re-measured this pass** — only the denominator was. Smaller saves, shorter save windows, less save-wedge exposure, smaller resume uploads |
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
