# unity-donor 0.3.46 — a card that loses the cortex gives its memory back

## The problem

When the brain moved her cortex from the operator's 16 GB card to a rented
96 GB one, the 16 GB card kept its whole copy of the cortex — 17 matrices,
12.7 GB of VRAM in use — after the move. That copy stopped being current the
moment the move finished, and it left her own image renderer (which shares
that card) under its free-VRAM floor, so her looks were refused
(`LOOK FAILED at stage=vramTight`).

## The fix

- A new `free_matrices` message names the matrices to drop. The donor removes
  them from its engine — their GPU buffers are released — stops checkpointing
  a set it no longer holds, and replies `free_matrices_ack` with what it freed.
- The brain sends it only after the NEW card holds every matrix, so until then
  the old copy is still there as the fallback.

Older brains never send it; older donors ignore it. Every other frame is
handled exactly as 0.3.45 did.
