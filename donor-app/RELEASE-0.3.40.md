# donor v0.3.40 — the brain's two halves, counted

**Protocol change, backward-compatible in both directions.** This release counts
spikes in each half of every cluster and can step the two halves on different
drives. It is the first piece of the Seed Crystal (the brain's hemispheric
contest for dopamine around a central oscillator — `docs/EQUATION-REPAIR-AND-SEED-CRYSTAL.md`),
and it is the piece everything else in that design waits on: without a donor
that counts both halves, the brain's `state.crystal` reads `measured: false`
and nothing in the design moves.

## What changed on the wire

- `compute_batch_result.perCluster[name]` carries two new fields beside
  `lastSpikeCount`: **`lastSpikeCountL`** and **`lastSpikeCountR`** — the last
  substep's spike count for neurons with index `< half` and `>= half`. Their sum
  is `lastSpikeCount`, so nothing that read the total changes meaning.
- `compute_batch.clusters[i]` accepts two new optional fields: **`tonicDriveR`**
  (the right half's tonic drive) and **`half`** (the split index). Absent →
  both halves step on `tonicDrive` and `half = size / 2`. An older brain never
  sends them; an older donor ignores them.

## What changed on the card

- `spike_count` (WGSL and CUDA) keeps two atomic counters instead of one.
- The Rulkov kernel (`lif`, WGSL and CUDA) reads `effectiveDrive` for
  `i < half` and `effectiveDriveR` otherwise. With equal values the arithmetic
  is byte-identical to v0.3.39.
- `kernels.ptx` regenerated (`nvcc -ptx -arch=sm_75`) for the new `lif` and
  `spike_count` signatures — ⛔ the old PTX would fail the `lif` launch with an
  argument-count mismatch, so do not mix this binary with an older PTX.
- Uniform blocks grew: `LifParams` 48 → 64 bytes, `SpikeParams` 8 → 16 bytes,
  padded on both sides and declared in the same order in Rust and WGSL.

## Cost

Two atomics per spiking neuron instead of one (same kernel, one branch), one
extra `u32` in the count read-back, 2 × 8 bytes of JSON per cluster per ack.
No new buffers beyond 4 bytes per cluster.

## Self-test

`--self-test` now prints `L {n} / R {n}` beside each step's total.
