# Donor 0.3.50

- **A reconnect no longer costs a re-upload.** When the link drops (not a GPU hang, not a stop), the donor keeps its engine and every matrix still on the card, and tells the brain what it holds when it reconnects. A brain that kept the card's place re-attaches it with nothing sent.
- **Refractoriness in the neuron step.** Each spike lowers the slow variable by β (the brain sends it; 0.016 by default), so a neuron that just fired recovers before firing again. Her firing had no stable middle (it flipped between ~1.5% and ~20%); this gives it one. Written out in docs/EQUATIONS.md §2. The CUDA kernel and the WGSL shader both carry it.
- Sends made just before a deliberate disconnect are bounded without marking the link stalled (clears five build warnings).
