# donor-v0.3.17 — TEMPLATE SPIKE frames (SPRS type 11): the t7 wire river collapsed

**What it fixes:** at the 12M language cortex, the teach loop's tiled spike mirrors (`write_spike_slice`, SPRS type 7) shipped fully-expanded u32 index lists — ~3MB per sem-region frame, **403MB in ~12 minutes** measured live: the last uncompressed lane on the box→donor wire and the driver of pattern-lane staling (`hebbianSuppressedStale` climbing ~250/word).

**The frame (type 11):** header name = `cluster/region`, then `rowStart u32 + groupSize u32 + count u32 + f32 values` (no psi — spikes carry none). The donor expands at receive into the IDENTICAL `Work::WriteSpike` the expanded t7 frame produces: dim `d` with `value > 0` sets spikes over `[rowStart + d*groupSize, +groupSize)`; region-end clipping stays engine-side. ~300 bytes replaces ~3MB (~10,000× on sem-region frames).

**Negotiation:** the server gates on the announced `appVersion >= 0.3.17` (same TU.20.12 pattern as types 7/8/9/10/12). Older donors keep receiving expanded t7 — no fallback, version-gated selection. The server also skips BUILDING the expanded index arrays once the capability is stamped (same-flag law — encoder and builder consult the same flag).

**Verify on deploy:** the server logs `teach-frame TEMPLATE spikes for PRIMARY donor: ON (SPRS 11)` at first teach; `wsPressure.teachOutByType.t11` appears and `t7.bytes` stops growing; `hebbianSuppressedStale` growth collapses.

**Build:** `cargo check` clean on default + `--features cuda`. No kernel changes, no protocol changes to existing types.
