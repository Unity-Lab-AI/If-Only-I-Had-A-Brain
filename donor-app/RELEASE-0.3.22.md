# donor-v0.3.22 — DELTAIDX: colIdx ships delta-varint encoded, 68% off the biggest half of every upload

**What it fixes:** `colIdx` is **half the canonical payload** — 1,373MB of 2,792MB at the 12M cortex — and it was shipping as raw u32. Every replica sync therefore moved ~2.8GB over a single ~4MB/s box uplink, which is why adding a second and third donor produced ten `sparse chunked upload ... timed out after 180000ms` lines and zero completed syncs (see SYNCSERIAL, same batch).

**Why delta-varint pays here — measured from the topology, not assumed.** The intra is built by `SparseMatrix` with the Watts-Strogatz hybrid (`cluster.js`): **70% local (radius 50) + 25% medium (radius 200) + 5% long-range**, and each row's indices are sorted ascending (`sparse-matrix.js`: *"Sort row's col indices ascending per CSR contract"*). So 95% of consecutive deltas are single-digit-to-low-hundreds and fit **one** varint byte instead of four. Only the 5% long-range hops and the single negative delta per row boundary cost more.

**Measured on topology matching the real generator** (deterministic PRNG, 1.8M nnz across 3 chunks):

```
colIdx      6.87MB raw -> 2.19MB delta-varint    68.1% saved, 1.28 bytes/entry (raw = 4.00)
round-trip  BYTE-EXACT on every chunk

projected onto the real 12M intra (360M nnz):
payload     2,792MB -> 1,857MB                    33.5% saved
per replica 11.6 min -> 7.7 min at 4MB/s
```

**Wire format.** Chunked-upload (type 4) gains **flags bit 2 (value 4)** = colIdx is delta-varint encoded. Entry 0 of each chunk is an UNSIGNED varint of the absolute index — chunks split mid-row, so a chunk cannot assume it begins at a row boundary. Entries 1.. are ZIGZAG varints of the delta from the previous index; zigzag because a row boundary steps backwards. The entry COUNT is derived from the values slice (values and colIdx are 1:1 in CSR), so no extra field was added and the header layout is unchanged.

**Compatibility — nothing else has to move.** The server gates per TARGET donor (`_donorDeltaColIdxOk`), not on the primary, because a replica sync targets an arbitrary donor and a pool can be mixed-version. A donor reporting no `appVersion` — **every browser donor** — returns false and receives the byte-identical raw u32 stream it always did, so `compute.html` needs no change. Older native donors likewise never see flag 4. Kill-switch: `DREAM_DELTA_COLIDX=0`.

**Cross-language parity is enforced, not hoped for.** `frames.rs` gains a `#[cfg(test)] mod tests` whose vector was produced by the SERVER's `_encodeDeltaColIdx`, not by the Rust side's own logic — so the test fails if *either* implementation drifts. It exercises a leading zero, small positive deltas, a long-range jump, a negative delta (row boundary), and a second long jump. Plus a truncation test (must return `None`, never a partial Vec) and a raw-path test. This is deliberately stricter than a normal unit test because the failure mode is silent: a mismatch puts learned weights on the WRONG SYNAPSES with the right shape, a successful upload, and gates that still run — every downstream measurement quietly worthless. `SEEDED-TOPOLOGY-SPEC.md` calls for exactly this harness for exactly this reason.

```
running 3 tests
test frames::tests::delta_cols_matches_server_encoder ... ok
test frames::tests::raw_col_idx_path_unchanged ... ok
test frames::tests::delta_cols_rejects_truncated_stream ... ok
```

**Verify on deploy:** the server logs `[Brain] DELTAIDX <matrix> — colIdx X MB raw -> Y MB delta-varint (Z% saved, N bytes/entry)` once per upload to a >=0.3.22 donor. Replica sync wall-time should fall by roughly a third; `sparse chunked upload ... timed out` should not reappear.

**Build:** `cargo check --release` clean on all three feature sets (default gui+cuda, `--no-default-features --features cuda`, `--no-default-features`). `cargo test` 3/3. No kernel changes, no PTX regeneration, no protocol change to any existing frame type — only a previously-unused flag bit on type 4.
