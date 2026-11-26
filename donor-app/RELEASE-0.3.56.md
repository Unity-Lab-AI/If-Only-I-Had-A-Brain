# Donor 0.3.56

- **New frame: the step lesson (type 19).** Each item carries its own short step list over one shared region/op table: clear a region, write a region's tiles, a bound op, or a masked op whose post rows are another region's tiles. It is for the teach lanes a pattern lesson cannot express:
  - a projection whitelist that changes per step (the card's plasticity pulls every post-active row toward its pre, so an op whose pre region is silent would decay it), and
  - the asymmetric intra step (pre = one region only, post = another region's cells): write the pre region, run the masked op, then write the post region.
- Word emission and phoneme blending now teach on the card through it, a rep's words in one frame, instead of one CPU intra pass per letter. Acked as a lesson (type 17), so the brain's lesson window paces it.
- **`free_matrices` can free neuron state too.** It now takes an optional `clusters` list and drops each named cluster's resident state (the buffers `gpu_init` allocated). A card a cluster had moved off used to keep those buffers for good. The ack reports `freedClusters` and the clusters the card still holds. A brain that sends no `clusters` gets exactly the old behaviour.
- Checked: the brain's encoder output decodes on the donor to the same tables and step sequence, and the masked rows come out as the post region's cells at its absolute row start.
