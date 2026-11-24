# unity-donor 0.3.45 — lessons are paced, so a card cannot be buried

## The problem

Lessons (0.3.44) were sent fire-and-forget, so nothing limited how many a card
could be handed. Under teaching, the operator's local card answered pings 7 s
late and the brain's heartbeat killed it while it was still working — and the
donor's network loop was unpacking every lesson itself, so a large lesson also
delayed its ping replies.

## The fix

- A lesson is now ONE work item. The worker unpacks it and runs the same steps
  in the same order as 0.3.44 (the parity-tested `expand_lesson`), so the
  network loop stays free to answer pings.
- When the worker finishes a lesson it sends a small "done" reply. The brain
  keeps only a few lessons in flight per card (4 by default) and waits for a
  reply before sending more, so the card works flat out and its queue never
  grows.

Older brains never ask for the reply, and every other frame is handled exactly
as 0.3.44 did.
