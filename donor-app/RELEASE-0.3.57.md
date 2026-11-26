# Donor 0.3.57

- **New frame: the run-length bucket probe (type 20).** The same propagate + on-card bucket-mean probe as type 15, with its pre indices sent as `(start, length)` runs instead of a raw `u32` list. Her sem patterns are tiled (long runs), so every word she reads off the card used to ship ~2.5 MB of indices (1,000+ such sends logged in one walk); the same probe is now a few KB. The runs are expanded in the decoder into the ordinary type-15 frame, so the card executes it exactly as before and answers with the same type-2 ack.
- A run longer than 2^24 is refused as malformed.
- A brain that never sends type 20 sees no change.
- **Lesson expansion overlaps the card.** Every lesson (types 17/18/19) used to be unpacked into its op list on the worker thread *before* it ran, so the card sat idle while each next lesson expanded — measured as 1–3 idle seconds of every 15 with the brain's lesson window full (`svcMs` ~2.1 s per merged lesson). Each lesson now starts expanding on its own thread the moment it arrives and keeps its place in the queue; the worker collects the finished op list and runs it straight after the lesson ahead. Same ops, same order.
