# unity-donor 0.3.48 — every card teaches

## Slices of her main matrix

The brain can now split her biggest learning matrix into row slices across
every connected card. This donor holds its slice and learns only its rows:

- `slice_base {name, rowBase, rowCount}` tells it which rows it holds; every
  frame that names rows (the side step of a lesson, explicit Hebbian, ranges) is
  shifted into the slice, and rows another card holds are dropped.
- Lessons and teach frames arrive at every slice holder; each applies them to
  its own rows. The brain waits for every holder before sending more.

## Building a slice from her published weights

- `slice_from_snapshot` hands the donor the blocks of a GitHub release that cover
  its rows. It downloads only those (`curl`), checks each block's SHA-256, builds
  the slice and loads it — so the gigabytes come from the release host, not the
  operator's home upload. Then `slice_patch` writes only the rows that changed
  since the snapshot (`patch_values`, new on both GPU backends).

## Her pictures

- If her renderer runs on this machine (a pod's launcher starts it), the donor
  says so and renders her looks and drawings when asked — same request, same
  PNG. It re-checks every minute, since a pod's renderer comes up minutes later.

## Tunnelling and entanglement (modelled)

- The neuron kernels (CUDA + WGSL) take three new numbers per cluster: a
  sub-threshold neuron can cross with a WKB-shaped probability, and each neuron
  shares part of its noise with its twin in the other hemisphere. All three 0,
  or an older brain, = the plain step, bit-identical. See docs/EQUATIONS.md §2.

## Also

- A float literal warning fixed, and the release build keeps its crash line
  tables again (the workspace's release profile had drifted to `strip = true`).

Older brains send none of this; every other frame is handled as in 0.3.47.
