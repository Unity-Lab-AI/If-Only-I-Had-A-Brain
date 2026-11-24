# Donor 0.3.55

- **Association-pair lessons now run like pattern lessons.** These are the type-17 lessons that carry association pairs, self-framed lines and definitions. Their sem and motor writes now go to the card as tiles (`tile_ones_u32`, added in 0.3.54) instead of full cell lists built and uploaded by the host.
- **Each lesson's pairs are expanded on every CPU core.** They are split across all cores, expanded in parallel, and joined back in pair order. Each pair's steps depend only on that pair, so the step sequence is the same.
- The lateral mask still reads the motor cells, and they are built only when the lesson carries a lateral op.
- The wire format is unchanged. The parity check against the brain's recorded per-pair path passes with the tiles expanded to cells.
