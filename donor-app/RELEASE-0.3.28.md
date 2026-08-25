# donor-v0.3.28 — the card reduces the word readout, and the last CPU training lane moves onto it

Two changes ship together in this version.

---

## 1. The argmax never wanted the field, only the means — so the card reduces now

**What it fixes:** every word she says ran this shape — propagate `sem → word_motor` on the donor, ship the **ENTIRE post region back** (720,000 `f32` ≈ **2.9MB**), then have the server collapse it to ~2,500 per-word bucket means before taking an argmax.

The reduction was always the thing wanted. The field was freight.

**The change.** `bucket_mean.wgsl` runs **one thread per bucket**, with the divisor being that bucket's own cell count, and the donor returns the means. A spoken word costs **kilobytes instead of megabytes**.

⚠ Note how this pairs with SPARSEACK in v0.3.27: that made a large result cheaper to *ship*, this removes the need to ship it at all. The general principle — **push the reduction to where the data already lives** — is worth more than either individual fix.

---

## 2. The last CPU training lane moves to the card, and the card proves it got the arithmetic right

> Gee: *"are you positive every phase, every cell, every grade's vocab AND ALL TRAINIUNG(ALL TRAIniNG + INCLUDES VOCAB) is now properly handled by the doner GPUS!!!?!?!?!?!"*

**What it fixes:** the 2026-08-21 audit left exactly two signed-magnitude lanes on the CPU, and **predictive-error correction** was the expensive one — a full-matrix propagate PLUS a full-matrix weight write, once per pair, at 12M rows.

**Why no existing verb could carry it.** Every GPU spike buffer is `0/1 u32`, while this op's post term is a **per-row FLOAT error in [-1, 1]**. It is not a mask, and it could not be shipped as one.

**The proof requirement.** Because the term is signed and continuous, a subtly wrong kernel would not crash — it would train slightly wrong, forever, invisibly. So the card **verifies its own arithmetic** rather than being trusted.

**Compatibility.** Older donors never receive the new verb (per-donor version gate) and keep the full CPU pass — behaviourally identical to v0.3.27.

⚠ **The pod takes this on its next restart** — the supervisor only re-resolves the release when the donor process exits.
