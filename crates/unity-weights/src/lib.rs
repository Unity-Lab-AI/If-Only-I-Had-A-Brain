//! # unity-weights — CSR weight storage, f32 stored and f64 summed
//!
//! Migration phase **B2** (`docs/RUST-MIGRATION.md` §6.1). Owns *"CSR layout,
//! `Weight = f32`, checkpoint format + version, mmap/free-restream"* and must
//! **not** own *"knowing what a donor is"* (§5.2).
//!
//! ⭐ That boundary is the single most valuable one in the whole migration.
//! Today `gpu.js` mixes transport, weight lifetime and checkpoint policy in one
//! 5,702-line file, **which is exactly why a dtype change could silently break
//! persistence in a file nobody associated with dtypes** — the `nnz * 8` write
//! that threw on every Float32 array and left her training for two hours while
//! persisting nothing.
//!
//! ## The bug this crate's type system is designed to make unrepresentable
//!
//! `server/brain-server.js` budgeted the entire brain at `BYTES_PER_NNZ = 8`
//! ("Float32 value + Uint32 colIdx") while `js/brain/sparse-matrix.js` allocated
//! `Float64Array` — a real cost of **12 B/nnz**. Every sizing decision was made
//! against a footprint **1.5× smaller than what was allocated**, and that gap is
//! why the box's 8.80 GiB could not be accounted for.
//!
//! ⭐ Here the constant is **derived from the type**, so the estimator and the
//! allocator *cannot* drift:
//!
//! ```
//! # use unity_weights::{Weight, BYTES_PER_NNZ};
//! assert_eq!(BYTES_PER_NNZ, std::mem::size_of::<Weight>() + std::mem::size_of::<u32>());
//! ```
//!
//! ⚠ And the JS fix needed **twelve** correct edits plus a harness reading back
//! `values.constructor.name` per code path, because the type was restated at
//! twelve allocation sites. `pub type Weight = f32` has one home; a stray
//! `Vec<f64>` is a compile error, not a matrix that quietly disagrees with its
//! siblings.
//!
//! ## ⛔ MIXED PRECISION IS THE DESIGN. DO NOT "TIDY" IT.
//!
//! **Storage is `f32`. Summation is `f64`.** Rounding error compounds in the
//! **sum** across ~300 fanout terms, not in one stored weight — so precision is
//! spent where it accumulates and saved where it does not.
//!
//! ⚠ **In JS the f64 accumulator was free and invisible** (`let sum = 0` is a
//! double). **In Rust it must be written**, and writing `let mut sum: f32` would
//! look tidier and be a real numerical regression. §6.1 flags this precisely
//! because the language stops doing it for you.
//!
//! ⭐ The donors are `f32` end to end and cannot be otherwise — WGSL has no f64
//! storage type at all — which is the strongest argument that f32 *storage*
//! costs nothing: these weights were rounded to f32 the instant they left the
//! process, whatever the CPU array's type happened to be.

pub mod checkpoint;
pub mod glove;
pub mod mmap_store;
pub mod residency;

/// The stored weight type. **One home.** Everything else derives from it.
pub type Weight = f32;

/// Bytes on the wire and on disk per non-zero: one value plus one `u32` column
/// index. **Derived, never restated** — this is the constant the sizing chain
/// budgets on, and restating it is what cost 1.5× of the brain's footprint.
pub const BYTES_PER_NNZ: usize = std::mem::size_of::<Weight>() + std::mem::size_of::<u32>();

/// Compressed Sparse Row weights.
///
/// ⚠ `row_ptr` has `rows + 1` entries; `col_idx` and `values` have `nnz`. The
/// checkpoint format depends on exactly that, so a violated invariant is a
/// corrupt file rather than a panic — [`Csr::validate`] exists to catch it at
/// the boundary instead.
#[derive(Debug, Clone, PartialEq)]
pub struct Csr {
    pub rows: usize,
    pub cols: usize,
    pub row_ptr: Vec<u32>,
    pub col_idx: Vec<u32>,
    pub values: Vec<Weight>,
}

impl Csr {
    pub fn new(rows: usize, cols: usize) -> Self {
        Csr { rows, cols, row_ptr: vec![0; rows + 1], col_idx: Vec::new(), values: Vec::new() }
    }

    pub fn nnz(&self) -> usize { self.values.len() }

    /// Resident bytes of the three arrays. ⭐ Uses [`BYTES_PER_NNZ`] rather than
    /// a literal so this number and the allocator can never disagree.
    pub fn memory_bytes(&self) -> usize {
        self.nnz() * BYTES_PER_NNZ + (self.rows + 1) * std::mem::size_of::<u32>()
    }

    /// Structural check. Called before a write and after a read, because the two
    /// places a bad CSR can enter the system are a bug upstream and a corrupt
    /// file — and both should be named at the boundary.
    pub fn validate(&self) -> Result<(), String> {
        if self.row_ptr.len() != self.rows + 1 {
            return Err(format!("row_ptr has {} entries, expected rows+1 = {}", self.row_ptr.len(), self.rows + 1));
        }
        if self.col_idx.len() != self.values.len() {
            return Err(format!("col_idx ({}) and values ({}) disagree — that is a torn matrix", self.col_idx.len(), self.values.len()));
        }
        if let Some(&last) = self.row_ptr.last() {
            if last as usize != self.nnz() {
                return Err(format!("row_ptr ends at {last} but nnz is {} — rows do not cover the values", self.nnz()));
            }
        }
        if self.row_ptr.windows(2).any(|w| w[1] < w[0]) {
            return Err("row_ptr is not monotonic — rows would overlap or run backwards".into());
        }
        if let Some(&bad) = self.col_idx.iter().find(|&&c| c as usize >= self.cols) {
            return Err(format!("column index {bad} is outside cols={}", self.cols));
        }
        Ok(())
    }

    /// `I_i = Σ_j W_ij · s_j`
    ///
    /// ⛔⛔ **THE ACCUMULATOR IS `f64` AND MUST STAY `f64`.** Making it `f32` to
    /// "match" the values array is the one edit that turns a free 33% storage
    /// saving into a real numerical regression: at fanout 300 an f32 accumulator
    /// loses roughly half its significant digits to cancellation across the row,
    /// and the Oja/Hebbian updates downstream read these currents.
    ///
    /// ⚠ The output is `f64` for the same reason — it is integrator state.
    pub fn propagate(&self, spikes: &[f64], out: &mut [f64]) {
        assert_eq!(out.len(), self.rows, "output buffer must be one entry per row");
        for i in 0..self.rows {
            let start = self.row_ptr[i] as usize;
            let end = self.row_ptr[i + 1] as usize;
            // THE LOAD-BEARING LINE. `f64`, deliberately, explicitly.
            let mut sum: f64 = 0.0;
            for k in start..end {
                sum += self.values[k] as f64 * spikes[self.col_idx[k] as usize];
            }
            out[i] = sum;
        }
    }
}

/// Deterministic xorshift64*, so the precision probe asserts a floor rather than
/// rolling dice. ⚠ A probabilistic test that fails occasionally teaches people
/// to re-run it instead of reading it.
#[doc(hidden)]
pub struct Rng(pub u64);
impl Rng {
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12; x ^= x << 25; x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    /// Uniform in [0, 1).
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytes_per_nnz_is_derived_and_resolves_to_eight() {
        assert_eq!(BYTES_PER_NNZ, 8);
        assert_eq!(BYTES_PER_NNZ, std::mem::size_of::<Weight>() + std::mem::size_of::<u32>());
        // ⛔ The JS bug in one assertion: the estimator said 8 while the
        // allocator took 12. Here the two cannot be different numbers.
        assert_eq!(std::mem::size_of::<Weight>(), 4, "Weight is f32; if this changes, the checkpoint format version must move too");
    }

    fn tiny() -> Csr {
        // 3x3: row0 -> {0:1.0, 2:2.0}, row1 -> {}, row2 -> {1:-0.5}
        Csr {
            rows: 3, cols: 3,
            row_ptr: vec![0, 2, 2, 3],
            col_idx: vec![0, 2, 1],
            values: vec![1.0, 2.0, -0.5],
        }
    }

    #[test]
    fn propagate_matches_hand_arithmetic_including_an_empty_row() {
        let m = tiny();
        let spikes = [1.0, 1.0, 1.0];
        let mut out = [0.0; 3];
        m.propagate(&spikes, &mut out);
        assert_eq!(out, [3.0, 0.0, -0.5], "an empty row must yield 0, not skip a slot");
    }

    #[test]
    fn the_accumulator_is_f64_and_it_is_measurable() {
        // A row of many small terms that an f32 accumulator loses. Each value is
        // representable in f32; the SUM is what needs the width.
        let n = 4096usize;
        let m = Csr {
            rows: 1, cols: n,
            row_ptr: vec![0, n as u32],
            col_idx: (0..n as u32).collect(),
            // 1.0 once, then a long tail of tiny terms.
            values: std::iter::once(1.0f32).chain(std::iter::repeat(1e-6f32).take(n - 1)).collect(),
        };
        let spikes = vec![1.0f64; n];
        let mut out = [0.0f64; 1];
        m.propagate(&spikes, &mut out);
        let expect = 1.0 + 1e-6 * (n - 1) as f64;
        assert!((out[0] - expect).abs() < 1e-9, "f64 accumulation must keep the tail: got {}, want {expect}", out[0]);

        // The same sum done in f32 loses a measurable part of that tail — which
        // is the regression the doc comment forbids.
        let mut f32sum = 0.0f32;
        for v in &m.values { f32sum += *v; }
        assert!(((f32sum as f64) - expect).abs() > 1e-9,
            "if an f32 accumulator were lossless here the test would prove nothing");
    }

    #[test]
    fn validate_names_each_way_a_matrix_can_be_torn() {
        assert!(tiny().validate().is_ok());

        let mut m = tiny(); m.values.pop();
        assert!(m.validate().unwrap_err().contains("torn matrix"));

        let mut m = tiny(); m.row_ptr = vec![0, 2, 2];
        assert!(m.validate().unwrap_err().contains("row_ptr has"));

        let mut m = tiny(); m.row_ptr = vec![0, 2, 1, 3];
        assert!(m.validate().unwrap_err().contains("monotonic"));

        let mut m = tiny(); m.col_idx[0] = 99;
        assert!(m.validate().unwrap_err().contains("outside cols"));

        let mut m = tiny(); m.row_ptr = vec![0, 2, 2, 2];
        assert!(m.validate().unwrap_err().contains("do not cover"));
    }

    #[test]
    fn memory_bytes_uses_the_derived_constant() {
        let m = tiny();
        assert_eq!(m.memory_bytes(), 3 * 8 + 4 * 4);
    }

    /// ⭐ THE PRECISION PROBE, ported from `tools/weight-precision-probe.mjs`.
    ///
    /// ⚠ The original cannot run anywhere but its author's machine — its first
    /// line is an absolute path into `/run/media/sponge/External/...`. Porting it
    /// here makes the claim reproducible by anyone, which is the point of having
    /// it at all.
    ///
    /// ⛔ **THE TRAP THE ORIGINAL RECORDS AGAINST ITSELF, PRESERVED:** building
    /// the f64 "reference" by *widening* an already-f32 array measures exactly
    /// zero deviation **by construction**. That is a tautology, not a result. The
    /// values are drawn at f64 and a copy is rounded DOWN.
    #[test]
    fn f32_storage_holds_the_snr_floor_at_the_real_fanout() {
        let rows = 20_000usize;
        let cols = 20_000usize;
        let fanout = 300usize;

        let mut rng = Rng(0x5EED_1234_ABCD_0001);
        let mut row_ptr = Vec::with_capacity(rows + 1);
        let mut col_idx = Vec::with_capacity(rows * fanout);
        row_ptr.push(0u32);
        for _ in 0..rows {
            for _ in 0..fanout {
                col_idx.push((rng.next_f64() * cols as f64) as u32 % cols as u32);
            }
            row_ptr.push(col_idx.len() as u32);
        }
        let nnz = col_idx.len();

        // Drawn at FULL precision, then rounded down — never widened.
        let f64_vals: Vec<f64> = (0..nnz).map(|_| (rng.next_f64() * 2.0 - 1.0) * 0.3).collect();
        let f32_vals: Vec<Weight> = f64_vals.iter().map(|&v| v as f32).collect();

        let spikes: Vec<f64> = (0..cols).map(|_| if rng.next_f64() < 0.05 { 1.0 } else { 0.0 }).collect();

        let prop = |vals: &dyn Fn(usize) -> f64| -> Vec<f64> {
            let mut out = vec![0.0f64; rows];
            for i in 0..rows {
                let mut s = 0.0f64;
                for k in row_ptr[i] as usize..row_ptr[i + 1] as usize {
                    s += vals(k) * spikes[col_idx[k] as usize];
                }
                out[i] = s;
            }
            out
        };
        let a = prop(&|k| f32_vals[k] as f64);
        let b = prop(&|k| f64_vals[k]);

        let mut sum_sq = 0.0f64;
        let mut mag_sq = 0.0f64;
        for i in 0..rows {
            let d = a[i] - b[i];
            sum_sq += d * d;
            mag_sq += b[i] * b[i];
        }
        let rms = (sum_sq / rows as f64).sqrt();
        let sig = (mag_sq / rows as f64).sqrt();
        let rel = rms / sig;
        let snr_db = 20.0 * (sig / rms).log10();

        let flips = (0..rows).filter(|&i| (a[i] >= sig) != (b[i] >= sig)).count();

        println!("nnz={nnz} fanout~{fanout}  rel RMS={rel:.3e}  SNR={snr_db:.1} dB  flips={flips}/{rows}");

        // The floors. Measured on the real geometry: rel RMS 2.7e-8, SNR 151.4 dB,
        // 0 threshold flips in 20,000 neurons. Asserted with headroom so this
        // fails on a REGRESSION, not on a different machine's rounding.
        assert!(rel < 1e-6, "relative RMS error {rel:.3e} exceeds the floor — f32 storage is no longer safe");
        assert!(snr_db > 120.0, "SNR {snr_db:.1} dB below the floor");
        assert_eq!(flips, 0, "a spike-threshold flip means f32 storage changed which neurons fire");
    }
}
