# donor-v0.3.31 — the donor reports its own time

> Gee: *"so ur telling me u cant build a doner?"* / *"then why arent u doing the todo items?"*

## What changed

**A `compute_batch_result` now carries `phaseTimingMs`, so the brain can split its round trip instead of attributing all of it to the wire.**

```json
"phaseTimingMs": { "totalMs": 412.5, "queueWaitMs": 388.1, "computeMs": 24.4 }
```

- `queueWaitMs` — how long the batch sat in the donor's work queue before the GPU worker picked it up. Measured from the moment the WebSocket task pushed it, not from the top of `run_batch`, because measuring inside the worker would report ~0 by construction and look healthy.
- `computeMs` — time inside `run_substeps`. The actual GPU math.
- `totalMs` — queue + compute. From the brain's point of view both are time the donor held the request, so what remains after subtracting it is genuinely wire plus blocked event loop.

## Why it was needed

The brain has always measured dispatch → reply and called it `roundTripMs`. The native donor reported nothing, so `donorReports` was `false` and the whole number was indistinguishable between three very different causes: **wire**, **queueing on the donor**, and **the math itself**.

That was tolerable while the donor was a remote pod behind a ~205ms link, because the wire was known to dominate — KI-23 measured exactly that. **It stopped being tolerable when the donor moved to localhost.**

Measured on the live local brain before this change:

| | |
|---|---|
| `roundTripEmaMs` | **724** |
| `roundTripMs` | 1301 |
| `donorComputeMs` | `null` |
| `donorReports` | **false** |
| donor | localhost, RTX 4070 Ti SUPER, 90% util |

**724ms of round trip on a loopback link is not wire.** It is queueing or compute, and nothing in the system could say which.

⛔ **This matters because the fixes are opposite.** `COMP.1(d)` — "fatter teach batches to amortize the ~200ms RTT" — is aimed at wire time. If the 724ms turns out to be queue, batching and scheduling are the answer. If it is compute, only the kernels are. Building the batching work without this measurement would have been designing against a bottleneck nobody had confirmed still exists.

## Design notes

**⭐ No new dependency, no new frame type, no protocol version.** `phaseTimingMs` is an added optional field on a message that already exists, in the shape the brain has *already been parsing since before this release* — `server/brain-server/gpu.js` reads `value.phaseTimingMs.totalMs` and has done all along, with a comment saying the split *"needs a browser donor or a donor-side port"*. This release is that port.

**⛔ Optional, so absence stays absence.** `phase_timing_ms` is `Option<PhaseTimingMs>` with `skip_serializing_if = "Option::is_none"`. A path that cannot time itself omits the field rather than sending a zero — a zero here would read as *"the donor did no work"*, and the brain would subtract it from the round trip and attribute the whole thing to the wire. That is the lying-instrument failure this project keeps paying for, and it would be self-inflicted in a field whose entire purpose is honesty about where time goes.

**⚠ The queue instant is carried on the work item, not sampled in the worker.** `Work::Batch` gained an `Instant` set where the batch is pushed. Sampling inside the worker would have measured the time from pickup to completion and called it queue wait — always ~0, always green.

## Compatibility

- **Fully additive, both directions.** An older brain ignores the new field. This donor against today's server works unchanged — the server's parser already tolerated the field being absent and now simply finds it present.
- **No wire-format change to any binary frame.** No new frame types, no SPRS type constants touched, no change to `gpu_register`, `gpu_init`, or any sparse lane.
- **No brain restart required for the donor side** — but the server-side split (`donorQueueWaitMs` / `donorComputeOnlyMs` and the dashboard row) ships with the server and lands on its next restart.

## Verified

- `cargo build --release` clean. The one warning is pre-existing and unrelated (`gui.rs` f32 literal fallback).
- `--version` reports **`unity-donor 0.3.31`**.
- `--self-test` **passes on the real GPU**: Rulkov LIF + spike-count + sparse propagate (known 4×4 CSR, `[3,0,0,5]` exact) + plasticity + predictive-error parity (the card reproduced the server's rule exactly across three pre-index sets).
- **Serde rename literals confirmed present in the compiled binary** — `phaseTimingMs`, `totalMs`, `queueWaitMs`, `computeMs`.
- **Cross-language parity, the same standard `COMP.1a`/`SPARSEACK` was held to: 5/5.** The exact JSON this donor now emits was fed through the brain's real parser expression, extracted verbatim from `gpu.js` rather than retyped — server reads `412.5`, unaccounted resolves to `311.5ms`, `donorReports` flips true, and an absent or malformed field still yields `null` and never `0`.
- Dashboard row harnessed against the real source, **7/7**: no-samples, old-donor (names the absence, fabricates no split), and queue- / compute- / wire-dominated all name the correct dominant term.

⚠ **Not verified against a live brain.** The donor side is here; the server side lands on its next restart. The first real reading is the `batch round-trip` row naming which of the three the 724ms actually was.

## Release

⏳ Pending. The tag is pushed as part of this work per the standing rule.

⛔ **`DREAM_RECOMMENDED_DONOR_VERSION` deliberately left at `0.3.30`.** Setting it ahead of a published tag makes every donor exit, reinstall the same older `releases/latest`, be told again, and download forever instead of donating. The 0.3.30 anti-loop marker is a net, not a licence. It moves **with** the tag, never ahead of it.
