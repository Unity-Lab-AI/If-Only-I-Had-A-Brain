# unity-donor 0.3.43 — teaching arrives in bundles

One change, on the receive side.

## Bundled teach frames (SPRS type 16)

While she is being taught, every pair-teach used to arrive as ten to twenty
separate WebSocket messages: region clears, spike patterns, their twins, the
masked lateral op, the bound Hebbian batch. The card finishes each of those in
microseconds and then waits for the next message, which is why a donor read
busy only a fraction of the time during teaching.

The brain now sends those frames as one message per turn of its event loop. The
donor unpacks the bundle and runs every frame inside it through exactly the path
it took when it arrived alone, in the same order. The GPU does the same work in
the same order; only the per-message cost is gone.

- A bundle never nests, and a malformed frame anywhere inside it rejects the
  whole bundle, so half a lesson can never run.
- Older brains never send type 16, and this donor handles every older frame
  exactly as 0.3.42 did.

## Also in the brain (no donor change needed)

The brain now flushes its queued bound-Hebbian ops before it sends the next
pattern. Those ops read whatever pattern is on the card when they run, and they
used to wait up to 20 ms while the next pattern went out immediately, so some
were applied to the wrong pair. That fix applies to every donor version.
