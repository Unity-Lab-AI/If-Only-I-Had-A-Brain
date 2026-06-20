// Cluster probe mixin — extracted from cluster.js per the per-module
// split (see js/brain/cluster/README.md). Attached to NeuronCluster.prototype
// via Object.assign at cluster.js entry-point bottom.
//
// Methods in this mixin:
//   diagnoseReadoutForEmbedding(emb, ticks, langStart) — pipe an embedding
//     through mapToCortex + tick the cluster + return semantic readout.
//     Used by T13.1-style before/after training verification probes.
//   synapseStats() — return mean / RMS / maxAbs / nnz over the intra-
//     cluster synapse matrix's non-zero weights. Used for before/after
//     training-verification probes + dashboard telemetry.
//
// Other probe-family methods (computePhi, getTrainedCapability,
// workingMemoryReadout/Await, injectWorkingMemory) stay on the main
// NeuronCluster.prototype in cluster.js because they're tightly bound
// to cluster construction-time state and intermixed with other core
// methods in the source layout. P4.2.d closes the contiguous probe
// tail-block; the rest of the probe family can migrate in a future
// follow-up bite if/when their neighbours are also extracted.
//
// All methods reference cluster state via `this.` — fully prototype-chain
// compatible.

import { sharedEmbeddings } from '../embeddings.js';

export const CLUSTER_PROBE_MIXIN = {
  diagnoseReadoutForEmbedding(emb, ticks = 10, langStart = 150) {
    const currents = sharedEmbeddings.mapToCortex(emb, this.size, langStart);
    this.injectCurrent(currents);
    for (let t = 0; t < ticks; t++) this.step(0.001);
    return this.getSemanticReadout(sharedEmbeddings, langStart);
  },

  /**
   * Cluster synapse weight stats — used for T13.1 before/after training
   * verification. Returns mean, RMS, max magnitude over active (non-zero)
   * weights, plus the non-zero count.
   */
  synapseStats() {
    const { values, nnz } = this.synapses;
    let sum = 0, sumSq = 0, maxAbs = 0;
    for (let k = 0; k < nnz; k++) {
      const a = Math.abs(values[k]);
      sum += a;
      sumSq += values[k] * values[k];
      if (a > maxAbs) maxAbs = a;
    }
    const count = nnz || 1;
    return {
      mean: sum / count,
      rms: Math.sqrt(sumSq / count),
      maxAbs,
      nnz,
    };
  },
};
