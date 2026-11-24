# unity-donor 0.3.44 — the lesson runs on the card

One change: the brain can hand the donor a whole rep of a lesson at once.

## Lessons (SPRS type 17)

Until now the brain built every word pair of a lesson itself, one pair at a
time, on its one main thread, and sent the card about twenty small steps per
pair. The card finished each step almost instantly and then waited for the
next — measured at about 5% busy while she was being taught.

Now the brain sends one lesson frame per rep with every pair's active
dimensions (about 80 bytes a pair). The donor expands it into exactly the same
steps the brain used to send — the region clears, the pattern writes and their
language-cortex copies, the relation tag, the learning ops in the same order,
the lateral-inhibition mask (computed on the donor), and the contrastive pass —
and runs them back to back.

- **Same math, same order.** The expansion is checked against a recording of the
  brain's own per-pair path for the same pairs, step for step.
- A malformed lesson is rejected whole, so half a lesson can never run.
- Older brains never send type 17, and every other frame is handled exactly as
  0.3.43 did.
