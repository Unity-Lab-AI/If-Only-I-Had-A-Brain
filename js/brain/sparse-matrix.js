/**
 * sparse-matrix.js — Compressed Sparse Row (CSR) Matrix
 *
 * Biologically realistic: real neurons have ~1000-10000 connections
 * out of millions of possible targets. Dense NxN wastes 90%+ memory
 * on zeros and 90%+ compute iterating over them.
 *
 * CSR stores only non-zero entries:
 *   values[]    — the weight of each connection
 *   colIdx[]    — which neuron each connection comes FROM (pre-synaptic)
 *   rowPtr[]    — where each neuron's connections start in values/colIdx
 *
 * Memory: O(connections) instead of O(N²)
 * Propagate: O(connections) instead of O(N²)
 * At 12% connectivity, 1000 neurons: 120K ops vs 1M ops
 * At 3% connectivity, 10K neurons: 3M ops vs 100M ops
 *
 * Drop-in replacement for SynapseMatrix. Same API, different guts.
 */

export class SparseMatrix {
  /**
   * @param {number} rows — number of post-synaptic neurons
   * @param {number} cols — number of pre-synaptic neurons (defaults to rows)
   * @param {object} [opts]
   * @param {number} [opts.wMin=-Infinity]
   * @param {number} [opts.wMax=Infinity]
   */
  constructor(rows, cols, opts = {}) {
    this.rows = rows;
    this.cols = cols ?? rows;
    this.wMin = opts.wMin ?? -Infinity;
    this.wMax = opts.wMax ?? Infinity;

    // CSR arrays — start empty, populated by init methods
    this.values = new Float64Array(0);   // non-zero weights
    this.colIdx = new Uint32Array(0);    // column indices (pre-synaptic neuron)
    this.rowPtr = new Uint32Array(rows + 1); // row start pointers
    this.nnz = 0; // number of non-zero entries
  }

  // ── Initialization ─────────────────────────────────────────────

  /**
   * Initialize with random sparse connectivity.
   * @param {number} density — connection probability (0-1)
   * @param {number} excitatoryRatio — fraction of positive weights
   * @param {number} strength — initial weight magnitude
   */
  initRandom(density, excitatoryRatio = 0.8, strength = 0.3) {
    const { rows, cols } = this;
    const noSelfConnect = (rows === cols);

    // T14.21 (2026-04-14) — rewritten to sample in O(nnz) instead of
    // O(rows * cols). The old algorithm walked a nested loop over every
    // matrix cell and ran Math.random() per cell to decide inclusion:

    //   for i in 0..rows:
    //     for j in 0..cols:
    //       if random() < density: include (i, j)

    // At 10K * 10K that's 100M iterations per cluster. At 100K * 100K
    // it's 10B iterations — won't finish in human timescales. Biological
    // scale (1M+ neurons) is completely unreachable via the nested scan.

    // New algorithm: for each row, compute target k = round(cols * density),
    // then sample k unique column indices via rejection (Set-dedup). At
    // sparse densities (d < 0.1) rejection is efficient because the
    // probability of picking a repeat column stays small. Total work
    // is O(nnz) with a small constant — at 10K * 300 fanout that's 3M
    // ops (~60ms) instead of 100M ops (~2-5s). 50-100x faster, exact
    // same output shape.
    // Rewrite — allocate directly into typed arrays, no transient
    // {j, w} objects per entry. At 100K-neuron cortex, the prior
    // version created ~30M { j, w } objects (~1.2GB of V8 heap) just
    // for intra-cluster + cross-projection init, which GC-thrashed
    // Node into an apparent hang. Direct typed-array fills cut that
    // to the final ~360MB footprint plus a per-row Uint32 scratch for
    // sorting column indices.

    // Per row: sample kPerRow unique column indices into a scratch
    // Uint32Array, in-place radix-ish sort (actually plain Array sort
    // on a sliced typed-array view), then fill values + colIdx
    // slots directly.

    // Pre-compute total entries so we can allocate final typed arrays
    // up front (no temp row arrays accumulated).
    let totalPre = 0;
    const perRowK = new Uint32Array(rows);
    for (let i = 0; i < rows; i++) {
      const kPerRow = Math.min(Math.round(cols * density), Math.max(0, cols - (noSelfConnect ? 1 : 0)));
      perRowK[i] = kPerRow;
      totalPre += kPerRow;
    }

    this.values = new Float64Array(totalPre);
    this.colIdx = new Uint32Array(totalPre);
    this.rowPtr = new Uint32Array(rows + 1);
    this.nnz = totalPre;

    // Scratch column buffer, reused across rows to avoid per-row
    // allocation. Sized to the largest kPerRow on this matrix.
    let maxK = 0;
    for (let i = 0; i < rows; i++) if (perRowK[i] > maxK) maxK = perRowK[i];
    const scratchCols = new Uint32Array(maxK);
    const seen = new Set();

    let idx = 0;
    this.rowPtr[0] = 0;
    for (let i = 0; i < rows; i++) {
      const kPerRow = perRowK[i];
      if (kPerRow <= 0) {
        this.rowPtr[i + 1] = idx;
        continue;
      }
      // Reset Set for this row. Clearing is faster than reconstructing.
      seen.clear();
      let count = 0;
      while (count < kPerRow) {
        const j = Math.floor(Math.random() * cols);
        if (noSelfConnect && i === j) continue;
        if (seen.has(j)) continue;
        seen.add(j);
        scratchCols[count++] = j;
      }
      // Sort the kPerRow filled slice of scratchCols in-place. Was
      // `subarray + .slice() + .sort()` which allocated a fresh
      // typed array per row — at biological scale (216M cortex × density
      // × per-row), that's millions of throwaway typed-array allocs
      // during init alone (Problems.md Low finding). The same in-place
      // pair-insertion sort the topographic init below uses (lines
      // 212-223) is the right pattern, working directly against
      // scratchCols.subarray(0, kPerRow).
      for (let a = 1; a < kPerRow; a++) {
        const keyCol = scratchCols[a];
        let b = a - 1;
        while (b >= 0 && scratchCols[b] > keyCol) {
          scratchCols[b + 1] = scratchCols[b];
          b--;
        }
        scratchCols[b + 1] = keyCol;
      }
      // Fill final typed arrays for this row.
      for (let k = 0; k < kPerRow; k++) {
        this.colIdx[idx] = scratchCols[k];
        const sign = Math.random() < excitatoryRatio ? 1 : -1;
        this.values[idx] = sign * (0.1 + Math.random() * 0.4) * strength;
        idx++;
      }
      this.rowPtr[i + 1] = idx;
    }
  }

  /**
   * Topographic connectivity — each neuron connects to its `fanout`
   * physically-adjacent neighbors in a 1D ring topology with wrap-
   * around at the boundaries. Same functional shape as the cortical-
   * column model (local lateral connections dominate; distant ones
   * are sparse or absent). Critically, nnz scales LINEARLY with size
   * at a fixed fanout — the random-init scaling is `density × rows²`
   * which blows up past 100M neurons, topographic stays `rows ×
   * fanout` so 100M × 30 = 3 B entries (~12 GB at 12 B each) is
   * achievable where random is 100M × 100M × tiny-density ≈ tens of
   * terabytes.
   *
   * Implementation: for each row i, open a window of `fanout` column
   * indices centered on i, skipping the self-connection when
   * rows === cols. Weights split per `excitatoryRatio` same as
   * `initRandom`. Ring wrap-around handles boundary neurons so the
   * fanout stays constant instead of degrading at the ends.
   *
   * `fanout` should be even-ish so half the connections go each
   * side; odd values just put one extra on the upper side.
   */
  initTopographic(fanout, excitatoryRatio = 0.8, strength = 0.3) {
    const { rows, cols } = this;
    const noSelfConnect = (rows === cols);
    const effFanout = Math.min(Math.max(0, fanout | 0), cols - (noSelfConnect ? 1 : 0));
    if (effFanout <= 0) {
      // Degenerate — empty matrix with valid CSR layout.
      this.values = new Float64Array(0);
      this.colIdx = new Uint32Array(0);
      this.rowPtr = new Uint32Array(rows + 1);
      this.nnz = 0;
      return;
    }
    const totalPre = rows * effFanout;
    this.values = new Float64Array(totalPre);
    this.colIdx = new Uint32Array(totalPre);
    this.rowPtr = new Uint32Array(rows + 1);
    this.nnz = totalPre;
    // Window geometry — half the connections below i, the other half
    // (+1 on odd fanout) above, wrap-around at boundaries. When the
    // matrix is square (noSelfConnect) we expand the upper side by 1
    // so that skipping the d=0 self-entry still lands the full
    // fanout count per row.
    const half = Math.floor(effFanout / 2);
    const upper = effFanout - half + (noSelfConnect ? 1 : 0);
    let idx = 0;
    this.rowPtr[0] = 0;
    for (let i = 0; i < rows; i++) {
      // Fill colIdx for this row with indices [i - half, i + upper)
      // excluding self when noSelfConnect. Ring-wrap via modulo.
      let filled = 0;
      for (let d = -half; d < upper && filled < effFanout; d++) {
        if (d === 0 && noSelfConnect) continue;
        let col = i + d;
        if (col < 0) col += cols;
        else if (col >= cols) col -= cols;
        this.colIdx[idx + filled] = col;
        const sign = Math.random() < excitatoryRatio ? 1 : -1;
        this.values[idx + filled] = sign * (0.1 + Math.random() * 0.4) * strength;
        filled++;
      }
      // Sort the row's col indices so CSR contract (colIdx ascending
      // per row) holds — ring-wrap can put a wrapped-low column after
      // a wrapped-high column so we need the sort for downstream code
      // that assumes sorted columns (e.g. binary-search probes).
      if (filled > 1) {
        const sliceValues = this.values.subarray(idx, idx + filled);
        const sliceCols = this.colIdx.subarray(idx, idx + filled);
        // Pair-sort: keep (col, value) together. Simple insertion sort
        // since filled is always `fanout` (typically 30), so O(n²) is
        // fine and cheaper than allocating index arrays.
        for (let a = 1; a < filled; a++) {
          const keyCol = sliceCols[a];
          const keyVal = sliceValues[a];
          let b = a - 1;
          while (b >= 0 && sliceCols[b] > keyCol) {
            sliceCols[b + 1] = sliceCols[b];
            sliceValues[b + 1] = sliceValues[b];
            b--;
          }
          sliceCols[b + 1] = keyCol;
          sliceValues[b + 1] = keyVal;
        }
      }
      idx += filled;
      this.rowPtr[i + 1] = idx;
    }
    // Tighten nnz if some rows couldn't fill (shouldn't happen with
    // modulo wrap, but safety).
    this.nnz = idx;
  }

  /**
   *  — Small-world topology (Watts-Strogatz hybrid via 3-tier
   * locality biased sampling). For each pre-neuron `i`, pick `fanout`
   * post-targets distributed across:
   *   - 70% local: uniform from [i ± radiusLocal] excluding self
   *   - 25% medium: uniform from [i ± radiusMed] excluding the inner ring
   *   -  5% long-range: uniform from full [0, cols) (Watts-Strogatz rewire)
   *
   * Yields clustering coefficient ~0.3 (real cortex range) + mean path
   * length ~6-8 (small-world). Random `initRandom` produces clustering
   * ~0.001 + path length ~log(N) (no basin formation, pure smearing).
   * Pure `initTopographic` produces high clustering but path length
   * ~N/(2·fanout) (basins isolated, no global integration).
   *
   * Functional approximation per operator binding "WE DONT WANT JUST
   * RANDOM FIRING" — locality-biased sampling produces directed voltage
   * propagation along functional pathways instead of random-walk smearing.
   *
   * Uses index-position as the spatial dimension — neurons are arrayed
   * along a 1D line and "distance" = |i - j|. No physical 3D substrate
   * needed; the 1D ring captures small-world topology adequately.
   *
   * @param {number} fanout — total post-targets per pre-neuron
   * @param {number} excitatoryRatio — fraction of edges with positive weights
   * @param {number} strength — weight magnitude scale
   * @param {object} [opts]
   * @param {number} [opts.radiusLocal=50] — half-window for local 70%
   * @param {number} [opts.radiusMed=200] — half-window for medium 25%
   * @param {number} [opts.localFrac=0.70]
   * @param {number} [opts.medFrac=0.25]
   * @param {number} [opts.longFrac=0.05]
   */
  initSmallWorld(fanout, excitatoryRatio = 0.8, strength = 0.3, opts = {}) {
    const { rows, cols } = this;
    const noSelfConnect = (rows === cols);
    const effFanout = Math.min(Math.max(0, fanout | 0), cols - (noSelfConnect ? 1 : 0));
    if (effFanout <= 0) {
      this.values = new Float64Array(0);
      this.colIdx = new Uint32Array(0);
      this.rowPtr = new Uint32Array(rows + 1);
      this.nnz = 0;
      return;
    }
    const radiusLocal = Math.min(opts.radiusLocal ?? 50, Math.floor(cols / 4));
    const radiusMed = Math.min(opts.radiusMed ?? 200, Math.floor(cols / 2));
    const localFrac = opts.localFrac ?? 0.70;
    const medFrac = opts.medFrac ?? 0.25;
    // longFrac = 1 - localFrac - medFrac (5% Watts-Strogatz rewire)
    const localCount = Math.max(1, Math.round(effFanout * localFrac));
    const medCount = Math.max(0, Math.round(effFanout * medFrac));
    const longCount = Math.max(0, effFanout - localCount - medCount);

    const totalPre = rows * effFanout;
    this.values = new Float64Array(totalPre);
    this.colIdx = new Uint32Array(totalPre);
    this.rowPtr = new Uint32Array(rows + 1);
    this.nnz = totalPre;

    // Reusable per-row buffers — picks are unique-deduped via Set.
    const picks = new Set();
    const rowBufCol = new Uint32Array(effFanout);
    const rowBufVal = new Float64Array(effFanout);

    let idx = 0;
    this.rowPtr[0] = 0;
    for (let i = 0; i < rows; i++) {
      picks.clear();
      let filled = 0;

      // Tier 1: local — sample localCount from [i-radiusLocal, i+radiusLocal]
      let attempts = 0;
      const maxAttempts = effFanout * 6;
      while (filled < localCount && attempts < maxAttempts) {
        const offset = Math.floor((Math.random() * 2 - 1) * radiusLocal);
        let col = i + offset;
        if (col < 0) col += cols;
        else if (col >= cols) col -= cols;
        if (col === i && noSelfConnect) { attempts++; continue; }
        if (picks.has(col)) { attempts++; continue; }
        picks.add(col);
        rowBufCol[filled] = col;
        const sign = Math.random() < excitatoryRatio ? 1 : -1;
        rowBufVal[filled] = sign * (0.1 + Math.random() * 0.4) * strength;
        filled++;
        attempts++;
      }

      // Tier 2: medium — sample medCount from [i-radiusMed, i+radiusMed]
      attempts = 0;
      while (filled < localCount + medCount && attempts < maxAttempts) {
        const offset = Math.floor((Math.random() * 2 - 1) * radiusMed);
        let col = i + offset;
        if (col < 0) col += cols;
        else if (col >= cols) col -= cols;
        if (col === i && noSelfConnect) { attempts++; continue; }
        if (picks.has(col)) { attempts++; continue; }
        picks.add(col);
        rowBufCol[filled] = col;
        const sign = Math.random() < excitatoryRatio ? 1 : -1;
        rowBufVal[filled] = sign * (0.1 + Math.random() * 0.4) * strength;
        filled++;
        attempts++;
      }

      // Tier 3: long-range — uniform from full [0, cols) (Watts-Strogatz)
      attempts = 0;
      while (filled < effFanout && attempts < maxAttempts) {
        const col = Math.floor(Math.random() * cols);
        if (col === i && noSelfConnect) { attempts++; continue; }
        if (picks.has(col)) { attempts++; continue; }
        picks.add(col);
        rowBufCol[filled] = col;
        const sign = Math.random() < excitatoryRatio ? 1 : -1;
        rowBufVal[filled] = sign * (0.1 + Math.random() * 0.4) * strength;
        filled++;
        attempts++;
      }

      // Sort row's col indices ascending per CSR contract.
      for (let a = 1; a < filled; a++) {
        const keyCol = rowBufCol[a];
        const keyVal = rowBufVal[a];
        let b = a - 1;
        while (b >= 0 && rowBufCol[b] > keyCol) {
          rowBufCol[b + 1] = rowBufCol[b];
          rowBufVal[b + 1] = rowBufVal[b];
          b--;
        }
        rowBufCol[b + 1] = keyCol;
        rowBufVal[b + 1] = keyVal;
      }

      // Copy row to CSR storage.
      for (let k = 0; k < filled; k++) {
        this.colIdx[idx + k] = rowBufCol[k];
        this.values[idx + k] = rowBufVal[k];
      }
      idx += filled;
      this.rowPtr[i + 1] = idx;
    }
    this.nnz = idx;
  }

  /**
   *  — Topographic cross-projection construction. For each
   * dest (row), sample col targets centered on the topographically-
   * mapped source position `i × cols / rows`. 70% of fanout from
   * within ±radiusTopo of center, 30% random spread (Watts-Strogatz
   * scattering for cross-region long-range routes).
   *
   * Preserves spatial-feature continuity across regions — letter
   * region's 'a' bucket (low neuron index) maps to motor 'a' bucket
   * (low motor neuron index), 'z' bucket maps to motor 'z' bucket
   * automatically. Hebbian doesn't have to discover the alignment
   * from scratch; it just refines the topographic prior.
   *
   * Use when source and dest regions have ordered/aligned feature
   * spaces (sem ↔ motor, letter ↔ motor, letter ↔ phon, etc).
   * For unaligned spaces (sem ↔ fineType where fineType is one-hot
   * tags), keep `initRandom`.
   *
   * @param {number} density — connection density
   * @param {number} excitatoryRatio — fraction with positive weights
   * @param {number} strength — weight magnitude scale
   * @param {object} [opts]
   * @param {number} [opts.radiusTopo=30] — topographic radius
   * @param {number} [opts.localFrac=0.70] — fraction from topographic center
   */
  initTopographicProjection(density, excitatoryRatio = 0.7, strength = 0.2, opts = {}) {
    const { rows, cols } = this;
    const fanout = Math.min(Math.max(1, Math.round(density * cols)), cols);
    const radiusTopo = opts.radiusTopo ?? 30;
    const localFrac = opts.localFrac ?? 0.70;
    const localCount = Math.max(1, Math.round(fanout * localFrac));
    // Layer-constrained cross-projection endpoints.
    // opts.srcLayerMask = Uint8Array[cols] flagging valid pre-neurons
    // (e.g. L2/3 of source region). opts.dstLayerMask = Uint8Array[rows]
    // flagging valid post-neurons (e.g. L4 of dest region). When set,
    // skip rows/cols not in masks. Preserves Felleman & Van Essen 1991
    // hierarchical connectivity at construction.
    const srcLayerMask = opts.srcLayerMask || null;
    const dstLayerMask = opts.dstLayerMask || null;

    const totalPre = rows * fanout;
    this.values = new Float64Array(totalPre);
    this.colIdx = new Uint32Array(totalPre);
    this.rowPtr = new Uint32Array(rows + 1);
    this.nnz = totalPre;

    const picks = new Set();
    const rowBufCol = new Uint32Array(fanout);
    const rowBufVal = new Float64Array(fanout);

    let idx = 0;
    this.rowPtr[0] = 0;
    for (let i = 0; i < rows; i++) {
      // skip dest rows not in the dest layer mask.
      // Empty rows produce no connections (rowPtr[i+1] = rowPtr[i]).
      if (dstLayerMask && !dstLayerMask[i]) {
        this.rowPtr[i + 1] = idx;
        continue;
      }
      picks.clear();
      let filled = 0;
      // Topographic center: where in cols this dest row maps to.
      const center = Math.floor(i * cols / Math.max(1, rows));

      // Tier 1: localCount targets within ±radiusTopo of center
      let attempts = 0;
      const maxAttempts = fanout * 6;
      while (filled < localCount && attempts < maxAttempts) {
        const offset = Math.floor((Math.random() * 2 - 1) * radiusTopo);
        let col = center + offset;
        if (col < 0) col += cols;
        else if (col >= cols) col -= cols;
        if (picks.has(col)) { attempts++; continue; }
        // skip cols not in the src layer mask.
        if (srcLayerMask && !srcLayerMask[col]) { attempts++; continue; }
        picks.add(col);
        rowBufCol[filled] = col;
        const sign = Math.random() < excitatoryRatio ? 1 : -1;
        rowBufVal[filled] = sign * (0.1 + Math.random() * 0.4) * strength;
        filled++;
        attempts++;
      }

      // Tier 2: random spread (30% Watts-Strogatz scattering)
      attempts = 0;
      while (filled < fanout && attempts < maxAttempts) {
        const col = Math.floor(Math.random() * cols);
        if (picks.has(col)) { attempts++; continue; }
        if (srcLayerMask && !srcLayerMask[col]) { attempts++; continue; }
        picks.add(col);
        rowBufCol[filled] = col;
        const sign = Math.random() < excitatoryRatio ? 1 : -1;
        rowBufVal[filled] = sign * (0.1 + Math.random() * 0.4) * strength;
        filled++;
        attempts++;
      }

      // Sort row's cols ascending per CSR contract
      for (let a = 1; a < filled; a++) {
        const keyCol = rowBufCol[a];
        const keyVal = rowBufVal[a];
        let b = a - 1;
        while (b >= 0 && rowBufCol[b] > keyCol) {
          rowBufCol[b + 1] = rowBufCol[b];
          rowBufVal[b + 1] = rowBufVal[b];
          b--;
        }
        rowBufCol[b + 1] = keyCol;
        rowBufVal[b + 1] = keyVal;
      }

      for (let k = 0; k < filled; k++) {
        this.colIdx[idx + k] = rowBufCol[k];
        this.values[idx + k] = rowBufVal[k];
      }
      idx += filled;
      this.rowPtr[i + 1] = idx;
    }
    this.nnz = idx;
  }

  /**
   * Build from an existing dense matrix (for migration).
   * @param {Float64Array} W — dense row-major matrix (rows × cols)
   * @param {number} threshold — minimum |weight| to keep
   */
  static fromDense(W, rows, cols, threshold = 0.001, opts = {}) {
    const sparse = new SparseMatrix(rows, cols, opts);

    // Count non-zeros
    let nnz = 0;
    for (let i = 0; i < W.length; i++) {
      if (Math.abs(W[i]) > threshold) nnz++;
    }

    sparse.values = new Float64Array(nnz);
    sparse.colIdx = new Uint32Array(nnz);
    sparse.rowPtr = new Uint32Array(rows + 1);
    sparse.nnz = nnz;

    let idx = 0;
    sparse.rowPtr[0] = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const w = W[i * cols + j];
        if (Math.abs(w) > threshold) {
          sparse.values[idx] = w;
          sparse.colIdx[idx] = j;
          idx++;
        }
      }
      sparse.rowPtr[i + 1] = idx;
    }

    return sparse;
  }

  // ── Propagation ─────────────────────────────────────────────────

  /**
   * Compute post-synaptic currents: I_i = Σ_j W_ij * s_j
   * Only iterates over actual connections — O(nnz) not O(N²).
   *
   * @param {Uint8Array|Float64Array} spikes — pre-synaptic activity
   * @returns {Float64Array} currents — post-synaptic currents
   */
  propagate(spikes) {
    const { rows, values, colIdx, rowPtr } = this;
    // Defensive null-CSR guard. At biological scale some matrices get
    // their CPU CSR arrays freed to save external memory once GPU-bound
    // — calling propagate on such a matrix used to crash with "Cannot
    // read properties of null". Now returns a zero-filled current
    // vector of the correct size. One-shot warn during probe windows
    // (flag set by curriculum gate blocks) so silent GPU-bound falls
    // are visible in the probe log without spamming the main tick.
    if (!values || !colIdx || !rowPtr) {
      if (typeof globalThis !== 'undefined' && globalThis._probeWindowPropagate && !this._nullCsrWarned) {
        this._nullCsrWarned = true;
        const nm = this._name || this.name || '(unnamed)';
        console.warn(`[SparseMatrix] propagate called with null CPU CSR on ${nm} (values=${!!values} colIdx=${!!colIdx} rowPtr=${!!rowPtr}) — returning zeros. Matrix is likely GPU-bound with CPU arrays freed.`);
      }
      return new Float64Array(rows || 0);
    }
    const I = new Float64Array(rows);

    for (let i = 0; i < rows; i++) {
      let sum = 0;
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        sum += values[k] * spikes[colIdx[k]];
      }
      I[i] = sum;
    }
    return I;
  }

  // ── Learning Rules ──────────────────────────────────────────────

  /**
   * Reward-modulated Hebbian: ΔW = η · δ · post · pre
   * Only updates existing connections — O(nnz).
   */
  rewardModulatedUpdate(preSpikes, postSpikes, reward, lr) {
    const factor = lr * reward;
    if (factor === 0) return;

    const { rows, values, colIdx, rowPtr, wMin, wMax } = this;

    for (let i = 0; i < rows; i++) {
      if (!postSpikes[i]) continue;
      const scaled = factor * postSpikes[i];
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        values[k] += scaled * preSpikes[colIdx[k]];
        if (values[k] > wMax) values[k] = wMax;
        else if (values[k] < wMin) values[k] = wMin;
      }
    }
  }

  /**
   * Hebbian: ΔW = η · post · pre
   */
  hebbianUpdate(preSpikes, postSpikes, lr) {
    const { rows, values, colIdx, rowPtr, wMin, wMax } = this;
    // Null-CSR guard — post CPU CSR free this call would crash at
    // `rowPtr[i]` / `values[k]`. Silent no-op keeps teach paths safe
    // when the GPU-fast path owns the weights and a stale CPU write
    // accidentally fires. Same shape as the `normalizeRows` null guard.
    if (!values || !rowPtr || !colIdx) return;

    for (let i = 0; i < rows; i++) {
      if (!postSpikes[i]) continue;
      const scaled = lr * postSpikes[i];
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        values[k] += scaled * preSpikes[colIdx[k]];
        if (values[k] > wMax) values[k] = wMax;
        else if (values[k] < wMin) values[k] = wMin;
      }
    }
  }

  /**
   * Oja's rule (Oja 1982, J Math Biol 15:267) — Hebbian with an intrinsic
   * weight-decay term proportional to y²·w. Keeps weights bounded without
   * the clamp doing all the work, AND pushes the weight matrix toward the
   * principal components of the pre-pattern distribution.
   *
   *   Δw[i,j] = lr × y[j] × (x[i] - y[j] × w[i,j])
   *
   * Where:
   *   x[i]    — pre-synaptic activity at column i
   *   y[j]    — post-synaptic activity at row j
   *   w[i,j]  — current weight
   *
   * Effects vs bare Hebbian:
   *   - No runaway growth — weights self-stabilize via the y²·w subtraction
   *   - Basis vectors orthogonalize — converges to principal components
   *   - Decorrelates new patterns from old ones, so sep-probe mean-cosine
   *     drops instead of climbing toward saturation
   *   - Directly counters the overlap-collapse behaviour that produced the
   *     stuck-motor-at-'l' symptom
   *
   * Same null-CSR safety + row-iteration shape as `hebbianUpdate`. Drop-in
   * replacement for the per-projection Hebbian call in the teach paths.
   */
  ojaUpdate(preSpikes, postSpikes, lr, opts) {
    const { rows, values, colIdx, rowPtr, wMin, wMax } = this;
    if (!values || !rowPtr || !colIdx) return;

    // Per-update hub neurons / theta-gamma oscillations / per-layer plasticity wiring via opts.kScales.
    // Caller passes cluster-wide layerId / hubMask + region start offsets
    // so the per-row / per-col lookup gets the correct absolute cluster
    // index. When opts undefined or missing fields, falls back to plain
    // Oja (backward-compatible — old callers see no behavior change).
    const kScales = opts && opts.kScales;
    const layerScales = kScales && kScales.layerScales;        // [0.3,1.0,0.7,1.0,0.3]
    const dstLayerId = kScales && kScales.dstLayerId;          // Uint8Array (cluster-wide)
    const srcLayerId = kScales && kScales.srcLayerId;          // Uint8Array (cluster-wide)
    const srcHubMask = kScales && kScales.srcHubMask;          // Uint8Array (cluster-wide)
    const dstStart = kScales && typeof kScales.dstStart === 'number' ? kScales.dstStart : 0;
    const srcStart = kScales && typeof kScales.srcStart === 'number' ? kScales.srcStart : 0;
    const hubMult = kScales && typeof kScales.hubMult === 'number' ? kScales.hubMult : 1.0;
    const gammaScale = kScales && typeof kScales.gammaScale === 'number' ? kScales.gammaScale : 1.0;
    const haveLayer = !!(layerScales && dstLayerId);
    const haveHub = !!srcHubMask;

    for (let i = 0; i < rows; i++) {
      const y = postSpikes[i];
      if (!y) continue;
      // per-layer plasticity per-row layer plasticity scale (post-neuron's absolute layer)
      let lrPostScale = 1.0;
      if (haveLayer) {
        const lyr = dstLayerId[dstStart + i];
        const s = layerScales[lyr];
        if (typeof s === 'number') lrPostScale = s;
      }
      // theta-gamma oscillations gamma scale (curriculum-controlled snapshot)
      lrPostScale *= gammaScale;
      const y2 = y * y;
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        const col = colIdx[k];
        const x = preSpikes[col];
        // hub neurons per-pre hub multiplier (source-neuron rich-club boost)
        let lrPreScale = 1.0;
        if (haveHub && srcHubMask[srcStart + col]) lrPreScale = hubMult;
        const lrEff = lr * lrPostScale * lrPreScale;
        // Oja: Δw = lr × y × (x - y × w) = lr·y·x - lr·y²·w
        values[k] += lrEff * y * x - lrEff * y2 * values[k];
        if (values[k] > wMax) values[k] = wMax;
        else if (values[k] < wMin) values[k] = wMin;
      }
    }
  }

  /**
   * Anti-Hebbian negative-pair update.
   *
   * Explicit depressive pressure: weights DECREASE where pre and post
   * co-activate. Called immediately after a positive-pair Oja/Hebbian
   * update, but with a SAMPLED WRONG pair (X, Y') where Y' ≠ the correct
   * answer Y. The paired-opposite push pulls non-matching patterns apart
   * in weight space while the positive pair pulls the correct pair
   * together — push-pull discrimination instead of passive superposition.
   */
  antiHebbianUpdate(preSpikes, postSpikes, lr) {
    const { rows, values, colIdx, rowPtr, wMin, wMax } = this;
    if (!values || !rowPtr || !colIdx) return;

    for (let i = 0; i < rows; i++) {
      if (!postSpikes[i]) continue;
      const scaled = -lr * postSpikes[i]; // negative — weights depress
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        values[k] += scaled * preSpikes[colIdx[k]];
        if (values[k] > wMax) values[k] = wMax;
        else if (values[k] < wMin) values[k] = wMin;
      }
    }
  }

  /**
   * BCM plasticity rule (Bienenstock, Cooper, Munro 1982 — J Neurosci
   * 2:32) — sliding-threshold Hebbian where the sign of the update
   * depends on whether the post neuron's activity crosses a per-neuron
   * threshold θ:
   *
   *   Δw[i,j] = lr × y[i] × (y[i] − θ[i]) × x[j]
   *
   * When y > θ → LTP (the neuron is firing above its moving average,
   * reinforce the inputs that caused it). When y < θ → LTD (neuron
   * under-firing, weaken the inputs driving it). θ is a separate
   * per-neuron state that the caller updates externally (typically as
   * a low-pass filter on y²). This method is stateless — it only
   * applies the rule; theta tracking belongs to the owning cluster.
   *
   * Complements Oja: Oja's y²w term gives a fixed normalization
   * target per input dim, BCM's (y − θ) term gives per-neuron
   * homeostatic scaling against firing-rate drift. Shippable as an
   * additive pass after the primary Oja update.
   */
  bcmUpdate(preSpikes, postSpikes, theta, lr) {
    const { rows, values, colIdx, rowPtr, wMin, wMax } = this;
    if (!values || !rowPtr || !colIdx || !theta) return;

    for (let i = 0; i < rows; i++) {
      const y = postSpikes[i];
      if (!y) continue;
      const thetaI = theta[i] || 0;
      const factor = lr * y * (y - thetaI);
      if (factor === 0) continue;
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        const x = preSpikes[colIdx[k]];
        if (!x) continue;
        values[k] += factor * x;
        if (values[k] > wMax) values[k] = wMax;
        else if (values[k] < wMin) values[k] = wMin;
      }
    }
  }

  /**
   * Per-row L2 normalization — rescales each row's values so its
   * Euclidean norm hits `targetNorm`. Prevents weight runaway /
   * saturation when many teach phases accumulate Hebbian updates
   * into the same projection without any decay step. Empty rows
   * (nnz=0) and zero-norm rows are left untouched.
   *
   * In-place. Preserves sparsity pattern (rowPtr + colIdx
   * unchanged). Only `values[]` is rewritten.
   *
   * Skipped when the CSR arrays are null (post-T24.a selective
   * CPU CSR free — normalization on those projections happens GPU-
   * side via the shader pipeline, not here).
   */
  normalizeRows(targetNorm = 1.0) {
    const { rows, rowPtr, wMin, wMax } = this;
    const values = this.values;
    if (!values || values.length === 0) return 0;
    const tn = Number.isFinite(targetNorm) && targetNorm > 0 ? targetNorm : 1.0;
    // Clamp-aware scale cap. If the naive scale would push any
    // weight past wMax or wMin, the post-clamp distribution no
    // longer has targetNorm anyway AND the distinguishing
    // magnitudes carved by training get flattened uniformly to
    // the clamp. Prior behaviour was:
    //   scale = targetNorm / sqrt(sumSq)    (could be ≫1)
    //   foreach k: value[k] *= scale; clamp to [wMin, wMax]
    // which flattened post-Hebbian row signatures into uniform
    // ±wMax magnitudes whenever targetNorm > row-max · sqrt(nnz).

    // Clamp-aware variant:
    //   naiveScale = targetNorm / sqrt(sumSq)
    //   maxAllowed = min(wMax / maxAbs, |wMin| / maxAbs)
    //   scale = min(naiveScale, maxAllowed)    (never clamps)
    // If the cap is tighter than the naive scale, the row ends
    // up with L2-norm < targetNorm but preserves relative
    // magnitudes — which is what L2 normalization is FOR (to
    // keep directions while bounding magnitudes). That is the
    // behaviour every downstream consumer expects; the prior
    // clamp-after was silently giving them something different.
    let rowsNormalized = 0;
    const wBound = Math.min(Math.abs(wMin), Math.abs(wMax));
    for (let i = 0; i < rows; i++) {
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      if (end <= start) continue;
      let sumSq = 0, maxAbs = 0;
      for (let k = start; k < end; k++) {
        const v = values[k];
        sumSq += v * v;
        const a = v < 0 ? -v : v;
        if (a > maxAbs) maxAbs = a;
      }
      if (sumSq <= 0) continue;
      let scale = tn / Math.sqrt(sumSq);
      if (maxAbs > 0 && scale * maxAbs > wBound) {
        scale = wBound / maxAbs;
      }
      if (scale === 1) continue;
      for (let k = start; k < end; k++) {
        values[k] = values[k] * scale;
      }
      rowsNormalized += 1;
    }
    return rowsNormalized;
  }

  /**
   * STDP: timing-dependent update on existing connections.
   */
  stdpUpdate(preSpikes, postSpikes, preTimes, postTimes, params) {
    const { aPlus, aMinus, tauPlus, tauMinus } = params;
    const { rows, values, colIdx, rowPtr, wMin, wMax } = this;

    for (let i = 0; i < rows; i++) {
      if (!postSpikes[i]) continue;
      const tPost = postTimes[i];
      const start = rowPtr[i];
      const end = rowPtr[i + 1];

      for (let k = start; k < end; k++) {
        const j = colIdx[k];
        if (!preSpikes[j]) continue;
        const dt = tPost - preTimes[j];
        if (dt > 0) {
          values[k] += aPlus * Math.exp(-dt / tauPlus);
        } else if (dt < 0) {
          values[k] -= aMinus * Math.exp(dt / tauMinus);
        }
        if (values[k] > wMax) values[k] = wMax;
        else if (values[k] < wMin) values[k] = wMin;
      }
    }
  }

  // ── Synaptogenesis & Pruning ────────────────────────────────────

  /**
   * Prune weak connections (|w| < threshold).
   * Rebuilds CSR arrays without the pruned entries.
   *
   * @param {number} threshold — minimum |weight| to keep
   * @returns {number} — number of connections removed
   */
  prune(threshold = 0.01) {
    const { rows, values, colIdx, rowPtr } = this;
    const oldNnz = this.nnz;

    // Count survivors
    let newNnz = 0;
    for (let k = 0; k < this.nnz; k++) {
      if (Math.abs(values[k]) >= threshold) newNnz++;
    }

    if (newNnz === oldNnz) return 0; // nothing to prune

    const newValues = new Float64Array(newNnz);
    const newColIdx = new Uint32Array(newNnz);
    const newRowPtr = new Uint32Array(rows + 1);

    let idx = 0;
    newRowPtr[0] = 0;
    for (let i = 0; i < rows; i++) {
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        if (Math.abs(values[k]) >= threshold) {
          newValues[idx] = values[k];
          newColIdx[idx] = colIdx[k];
          idx++;
        }
      }
      newRowPtr[i + 1] = idx;
    }

    this.values = newValues;
    this.colIdx = newColIdx;
    this.rowPtr = newRowPtr;
    this.nnz = newNnz;

    return oldNnz - newNnz;
  }

  /**
   * Multiply every weight by `factor` in place. Used as a post-phase
   * rescale to break basin collapse: when the matrix has saturated to
   * `wMax` at near-uniform values, multiplying every weight by 0.5
   * drops saturated values from `wMax` to `wMax/2` — giving the next
   * phase's anti-Hebbian and positive Oja both directional headroom
   * to bite. Discrimination between trained pairs is preserved
   * (relative magnitudes scale together); only absolute saturation
   * resets. Density unchanged. Faster than rebuilding CSR; just walks
   * the values array.
   *
   * @param {number} factor — multiplier; typically 0.3-0.7
   * @returns {{ before: {mean, max}, after: {mean, max} }} — weight stats
   */
  scale(factor) {
    if (!Number.isFinite(factor) || factor === 1) {
      return { before: null, after: null };
    }
    let beforeSum = 0, beforeMax = 0;
    let afterSum = 0, afterMax = 0;
    for (let k = 0; k < this.nnz; k++) {
      const v = this.values[k];
      const a = v < 0 ? -v : v;
      beforeSum += a;
      if (a > beforeMax) beforeMax = a;
      const scaled = v * factor;
      this.values[k] = scaled;
      const sa = scaled < 0 ? -scaled : scaled;
      afterSum += sa;
      if (sa > afterMax) afterMax = sa;
    }
    const N = Math.max(1, this.nnz);
    return {
      before: { mean: beforeSum / N, max: beforeMax },
      after: { mean: afterSum / N, max: afterMax },
    };
  }

  /**
   * Top-K-per-row pruning. For each output neuron (row), keep only the
   * K connections with the largest |weight| and zero out the rest by
   * rebuilding CSR with just the survivors. Used to break basin
   * collapse: when every cross-projection cell has saturated to near
   * `wMax` at full density, each post neuron responds equally to every
   * pre, so different inputs produce 90%-cosine-overlapping outputs.
   * Pruning to top-K per row forces each post neuron to respond to its
   * K most-trained pre neurons only, restoring discriminability.
   *
   * @param {number} k — keep top-K entries per row (by |weight|)
   * @returns {number} — number of connections removed
   */
  pruneTopKPerRow(k) {
    if (!Number.isFinite(k) || k <= 0) return 0;
    const { rows, values, colIdx, rowPtr } = this;
    const oldNnz = this.nnz;

    // First pass — count survivors so we can allocate new typed arrays
    // exactly. Each row contributes min(k, rowEntries) survivors.
    let newNnz = 0;
    for (let i = 0; i < rows; i++) {
      const rowLen = rowPtr[i + 1] - rowPtr[i];
      newNnz += Math.min(k, rowLen);
    }
    if (newNnz === oldNnz) return 0; // nothing to prune

    const newValues = new Float64Array(newNnz);
    const newColIdx = new Uint32Array(newNnz);
    const newRowPtr = new Uint32Array(rows + 1);

    // Per-row scratch — pairs of (absVal, originalIdx) for partial sort.
    // Allocated once at max row width, reused across rows.
    let maxRowLen = 0;
    for (let i = 0; i < rows; i++) {
      const rl = rowPtr[i + 1] - rowPtr[i];
      if (rl > maxRowLen) maxRowLen = rl;
    }
    const scratch = new Array(maxRowLen);
    for (let s = 0; s < maxRowLen; s++) scratch[s] = { abs: 0, idx: 0 };

    let outIdx = 0;
    newRowPtr[0] = 0;
    for (let i = 0; i < rows; i++) {
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      const rowLen = end - start;
      if (rowLen <= k) {
        // Row already fits within K — keep all entries.
        for (let kk = start; kk < end; kk++) {
          newValues[outIdx] = values[kk];
          newColIdx[outIdx] = colIdx[kk];
          outIdx++;
        }
      } else {
        // Partial-sort to find top-K by |weight|.
        for (let kk = 0; kk < rowLen; kk++) {
          scratch[kk].abs = Math.abs(values[start + kk]);
          scratch[kk].idx = start + kk;
        }
        // Descending sort on the rowLen-prefix of scratch.
        scratch.length = rowLen; // bound the sort to live entries
        scratch.sort((a, b) => b.abs - a.abs);
        // Restore length for next iteration's reuse.
        scratch.length = maxRowLen;
        // Survivors = first K. Re-sort survivors by colIdx ascending so
        // the output CSR keeps its sorted-cols-per-row contract.
        const surv = new Array(k);
        for (let s = 0; s < k; s++) {
          const orig = scratch[s].idx;
          surv[s] = { col: colIdx[orig], val: values[orig] };
        }
        surv.sort((a, b) => a.col - b.col);
        for (let s = 0; s < k; s++) {
          newValues[outIdx] = surv[s].val;
          newColIdx[outIdx] = surv[s].col;
          outIdx++;
        }
      }
      newRowPtr[i + 1] = outIdx;
    }

    this.values = newValues;
    this.colIdx = newColIdx;
    this.rowPtr = newRowPtr;
    this.nnz = newNnz;
    return oldNnz - newNnz;
  }

  /**
   * Synaptogenesis — grow new connections where pre and post fire together.
   * New connections form probabilistically when co-active neurons lack a synapse.
   *
   * @param {Uint8Array} preSpikes
   * @param {Uint8Array} postSpikes
   * @param {number} probability — chance of forming new synapse per co-active pair
   * @param {number} initialWeight — weight of new synapse
   * @param {number} maxNnz — cap total connections (prevent runaway growth)
   * @returns {number} — number of new connections formed
   */
  grow(preSpikes, postSpikes, probability = 0.001, initialWeight = 0.1, maxNnz = Infinity) {
    if (this.nnz >= maxNnz) return 0;

    const { rows, cols } = this;
    const noSelfConnect = (rows === cols);

    // Find co-active pairs that don't have a connection
    const newEntries = []; // [row, col, weight]

    for (let i = 0; i < rows; i++) {
      if (!postSpikes[i]) continue;
      // Build set of existing connections for this row
      const existing = new Set();
      const start = this.rowPtr[i];
      const end = this.rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        existing.add(this.colIdx[k]);
      }

      for (let j = 0; j < cols; j++) {
        if (noSelfConnect && i === j) continue;
        if (!preSpikes[j]) continue;
        if (existing.has(j)) continue; // already connected
        if (Math.random() < probability) {
          newEntries.push([i, j, initialWeight]);
          if (this.nnz + newEntries.length >= maxNnz) break;
        }
      }
      if (this.nnz + newEntries.length >= maxNnz) break;
    }

    if (newEntries.length === 0) return 0;

    // Rebuild CSR with new entries merged in
    const totalNnz = this.nnz + newEntries.length;
    const newValues = new Float64Array(totalNnz);
    const newColIdx = new Uint32Array(totalNnz);
    const newRowPtr = new Uint32Array(rows + 1);

    // Sort new entries by row
    newEntries.sort((a, b) => a[0] - b[0]);

    let idx = 0;
    let newIdx = 0;
    newRowPtr[0] = 0;

    for (let i = 0; i < rows; i++) {
      // Copy existing entries for this row
      const start = this.rowPtr[i];
      const end = this.rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        newValues[idx] = this.values[k];
        newColIdx[idx] = this.colIdx[k];
        idx++;
      }
      // Add new entries for this row
      while (newIdx < newEntries.length && newEntries[newIdx][0] === i) {
        newValues[idx] = newEntries[newIdx][2];
        newColIdx[idx] = newEntries[newIdx][1];
        idx++;
        newIdx++;
      }
      newRowPtr[i + 1] = idx;
    }

    this.values = newValues;
    this.colIdx = newColIdx;
    this.rowPtr = newRowPtr;
    this.nnz = totalNnz;

    return newEntries.length;
  }

  // ── Serialization ───────────────────────────────────────────────

  /**
   * Serialize to a compact format for persistence.
   * @returns {object} — { rows, cols, nnz, values, colIdx, rowPtr }
   */
  serialize() {
    return {
      rows: this.rows,
      cols: this.cols,
      nnz: this.nnz,
      values: Array.from(this.values),
      colIdx: Array.from(this.colIdx),
      rowPtr: Array.from(this.rowPtr),
    };
  }

  /**
   * Deserialize from saved format.
   * @param {object} data
   * @returns {SparseMatrix}
   */
  static deserialize(data, opts = {}) {
    const m = new SparseMatrix(data.rows, data.cols, opts);
    m.values = new Float64Array(data.values);
    m.colIdx = new Uint32Array(data.colIdx);
    m.rowPtr = new Uint32Array(data.rowPtr);
    m.nnz = data.nnz;
    return m;
  }

  // ── Compatibility ───────────────────────────────────────────────

  /**
   * Get the dense weight matrix (for visualization/debugging).
   * WARNING: O(N²) memory — only use for small matrices or debugging.
   */
  toDense() {
    const { rows, cols, values, colIdx, rowPtr } = this;
    const W = new Float64Array(rows * cols);
    for (let i = 0; i < rows; i++) {
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let k = start; k < end; k++) {
        W[i * cols + colIdx[k]] = values[k];
      }
    }
    return W;
  }

  /**
   * Get memory usage in bytes.
   */
  get memoryBytes() {
    return this.values.byteLength + this.colIdx.byteLength + this.rowPtr.byteLength;
  }

  /**
   * Get density (fraction of non-zero entries).
   */
  get density() {
    return this.nnz / (this.rows * this.cols);
  }

  /**
   * Get stats string for logging.
   */
  stats() {
    const dense = this.rows * this.cols * 8; // Float64Array bytes
    const sparse = this.memoryBytes;
    const ratio = dense / sparse;
    return `${this.rows}×${this.cols} | ${this.nnz} connections (${(this.density*100).toFixed(1)}%) | ${(sparse/1024).toFixed(1)}KB sparse vs ${(dense/1024).toFixed(1)}KB dense (${ratio.toFixed(1)}× reduction)`;
  }
}
