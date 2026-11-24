# Donor 0.3.54

- **The card fills each word's pattern itself.** In a pattern lesson, the cells for a word are each active dimension times its tile width. Version 0.3.53 had one CPU thread build that full list of cells for every word and upload it, so on a rented card that one thread sat at 100% while the GPU waited (measured: one donor thread at 99.9% CPU, GPU at 0–35%). Now only the active dimensions and the tile width go to the card, and a new kernel, `tile_ones_u32`, sets the same cells. These are the same cells as before, clipped the same way. The self-test checks the tiled write against the listed write.
- **Lesson steps are built on every core.** A pattern lesson's items are split across all CPU cores, expanded in parallel, and joined back in their original order. The step sequence is unchanged.
- The protocol is unchanged: the brain sends the same type-18 frame.
