# donor-v0.3.27 — SPARSEACK: propagate acks go sparse, and 48MB of mostly-zeros becomes the pairs the server already parses

**What it fixes:** every propagate the donor answered shipped the ENTIRE post region back as a dense `f32` field — **~48MB per round at the 12M intra matrix** — when the result was overwhelmingly zeros and the server already knew how to read a sparse form. The freight was the bytes, not the arithmetic.

**The change.** `ack_propagate_sparse()` encodes the non-zero `(index, value)` pairs instead of the dense vector.

**The guard that makes it safe to always try.** `sparse_ack_is_smaller()` performs an **exact byte-count comparison** before choosing a form:

```
sparse:  20 + 8·nnz
dense:   16 + 4·len
```

If the result is dense-ish, the **dense frame is kept**. This is the point worth carrying forward — a "sparse optimisation" that cannot lose is one that measures both encodings and picks the smaller, rather than assuming sparsity. The change can never inflate a payload.

**Verification.**

- The real binary's `--self-test` passes the codec round-trip, extended to cover the sparse encoder, its header, its exact length, and a **refusal on a fully-dense vector**.
- Cross-language parity against the server decoder, same discipline as `DELTAIDX` and type 13: a silent layout drift here would scatter values onto the WRONG INDICES with no loud failure.

**Compatibility.** A v0.3.27 donor works against the deployed server unchanged; the server accepts either ack form. Older donors keep sending dense acks and are correct — byte-identical behaviour to v0.3.26.

⚠ **The pod takes this on its next restart, not immediately** — the supervisor only re-resolves the release when the donor process exits. See `deploy/runpod-donor-launcher.sh` for the upgrade watchdog that closes that steady-state gap.
