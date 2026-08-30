# donor v0.3.36 — `readback_matrix_values`: the brain can finally checkpoint the weights the GPU trained

**One new opcode. No behaviour change to any existing verb.** An older brain never
sends it and this donor behaves exactly as 0.3.35 did; a newer brain negotiates it
per socket at `>= 0.3.36`.

## Why

The brain's checkpoint has always been written from its **CPU-side** arrays. Those
are not a lagging copy of the weights resident on this card — they are a
**different brain**:

- **94%** of plasticity arrives via `hebbian_bound`, which trains on the donor's
  **resident** spike state (`src_offset: b.src_start`) that the host never sees.
  Only `hebbian_reps` uses the pattern the host shipped.
- The host applies its own update **~49× less often** (measured live: 9,322 GPU
  dispatches against 190 CPU passes in the same window).
- Measured on the running brain, the two drift apart at **+0.0124 mean-magnitude
  ratio per minute**, monotonically, and never reconverge.

So every "Update & Savestart" restored weights that had not done the learning.

⭐ **The alternative was ruled out first, by reading both kernels rather than
assuming.** `shaders/plasticity.wgsl` computes `w = w*(1-eta) + eta*x` with
`eta = |lr| * reward`; the host's `ojaUpdate` computes `w += lr*y*x - lr*y²*w`,
and with the host's spike array a `Uint8Array` (`y ∈ {0,1}`, so `y² = y`) that is
the **identical function**. `reward` is hardcoded `1.0` at all four call sites here
and the clamps match exactly (`w_min: -2.0, w_max: 2.0` both sides). **The math
agrees. The inputs and the update counts do not.** That is what this opcode fixes —
not a numerical bug, a bookkeeping one.

## The op

Request (JSON): `{ type: "readback_matrix_values", reqId, name, chunkBytes }`

Reply: N × **type=7 `SPRR` binary chunks** in ascending offset order, then
`{ type: "readback_matrix_values_ack", reqId, name, found, nnz, byteLen, chunks,
chunkBytes, checksum, error? }`.

Chunk layout — **32-byte header** so the f32 payload lands 4- *and* 8-byte aligned:

```
'SPRR' | 7 | pad(3) | reqId@8 | chunkIdx@12 | totalChunks@16
       | byteOffsetLo@20 | byteOffsetHi@24 | payloadBytes@28 | payload@32
```

⚠ **`byteOffset` is split across two u32 deliberately.** The intra matrix is
already ~1.81 GB and the language cortex is on a growth ladder. A u32 byte offset
wraps silently at 4 GiB and would reassemble two chunks onto the same destination —
and **no per-chunk check would catch it, because each chunk is individually
valid.**

⚠ **Sliced on the device, both backends.** wgpu copies a byte range into a
chunk-sized staging buffer (`copy_buffer_to_buffer` at an offset, re-aligned to 4
here rather than trusted from the wire — this device's uncaptured-error handler
deliberately does not panic, so a misaligned copy would fail *silently* and hand
back a short buffer). CUDA takes a `CudaSlice` view; it never `memcpy_dtov`s the
whole buffer, which would allocate ~1.81 GB **per chunk** — the exact cost chunking
exists to avoid.

⚠ **Completeness is a checksum, not a byte count.** This donor accumulates
FNV-1a-64 over exactly the bytes it puts on the wire, in send order, and ships it
in the closing ack — the same digest `readback_matrix_checksum` already returns, so
both sides compare without a second read. A chunk that cannot be read **stops the
transfer and says so** rather than being skipped: a hole in a checkpoint that the
brain then writes to disk as a good save is the worst failure this op can have.

Queued in the **flood lane**, never the priority lane. It is a ~1.81 GB transfer
for the intra matrix and must never jump ahead of a deadline-bearing
`compute_batch` — that is precisely how the zombie-kick incident happened.

## Verified

- `cargo check` clean on **both** feature sets. `cudarc`'s `dynamic-loading` means
  the CUDA path compiles without the toolkit installed, so **neither backend ships
  compiler-unverified**.
- The frame layout is a **test**, not a comment (`frames.rs`), including a
  **5,000,000,000-byte** offset to prove the split u64 does not wrap. Run it with
  `unity-donor --self-test`.
- The bytes this donor emits were parsed by the **brain's own arithmetic** — a wire
  format verified only inside the language that wrote it is not verified at all.
- Brain-side reassembly harnessed against the real code: the happy path widens
  f32 → the host's f64 bit-exactly, and a flipped byte, a dropped chunk, an
  overrun, and a not-found are each caught with the reason named.

## Operator note

Nothing to do. Pods self-update from `releases/latest` at their next
start/restart. The brain gates the opcode at `>= 0.3.36` per socket, so a donor
that has not updated yet keeps donating normally on every other verb.
