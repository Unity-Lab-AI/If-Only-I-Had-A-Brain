//! Assembling a matrix readback from a donor, and deciding whether it is whole.
//!
//! Ported from `gpu.js`'s `_applyValuesChunk` / `_settleValuesReadback`.
//!
//! ## Why this is worth its own type
//!
//! The readback is the one path that **writes into the CPU master**, and the
//! consequence of getting "is it complete?" wrong is not a crash — it is a
//! checkpoint that is *"a third brain"*: real trained weights, half old-CPU and
//! half new-GPU, coherent-looking and wrong. So completeness is a verdict with
//! five independent ways to be false, and every one of them is recorded rather
//! than collapsed into a bool.
//!
//! ## ⛔ THE ORDERING THAT LOOKS LIKE A BUG AND IS NOT
//!
//! **The hash accumulates BEFORE the overrun check**, so a chunk that runs past
//! the CPU array still contributes to the digest and is then *not written*.
//!
//! ⭐ That is correct, and inverting it would break verification: **the donor
//! hashes what it SENT.** For the two digests to be comparable the receiver must
//! hash everything that ARRIVED, including bytes it refuses to store. Hashing
//! only the accepted bytes would make a mismatch mean "we disagree about the
//! data" when it actually meant "we disagree about the length" — and the overrun
//! counter already answers the second question precisely.
//!
//! ## ⚠ A checksum, not a byte count
//!
//! `gpu.js` is explicit: *"the return value is the completeness proof, and it is
//! a CHECKSUM, not a byte count."* A byte count cannot detect reordering, and
//! `outOfOrder` is tracked separately precisely because a stream can arrive
//! complete, intact and **shuffled**.

use unity_weights::Weight;

/// FNV-1a-64 continued across chunks. The donor accumulates the same way over
/// the bytes it puts on the wire, in send order.
#[derive(Debug, Clone, Copy)]
pub struct RollingFnv(pub u64);

impl Default for RollingFnv {
    fn default() -> Self { RollingFnv(0xcbf2_9ce4_8422_2325) }
}

impl RollingFnv {
    pub fn update(&mut self, bytes: &[u8]) {
        // Seeding with the running value continues the same stream — FNV-1a is
        // defined that way, so chunk boundaries cannot change the digest.
        let mut h = self.0;
        for &b in bytes {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        self.0 = h;
    }
    pub fn finish(&self) -> u64 { self.0 }
}

/// One in-flight readback.
#[derive(Debug)]
pub struct Readback {
    pub name: String,
    pub chunks: u32,
    pub bytes: u64,
    pub next_offset: u64,
    /// Chunks whose offset did not continue the stream. ⚠ Tracked separately
    /// from the checksum because a stream can arrive complete and **shuffled**.
    pub out_of_order: u32,
    /// Chunks that would have written past the CPU array. Counted, refused.
    pub overrun: u32,
    hash: RollingFnv,
    values: Vec<Weight>,
}

/// Why a chunk was refused, if it was.
#[derive(Debug, PartialEq, Eq)]
pub enum ChunkOutcome {
    Applied,
    /// Ran past the end of the CPU array. Hashed (the donor sent it), not stored.
    Overrun,
    /// Byte offset is not a whole number of values — a framing fault.
    Misaligned,
}

/// The settle verdict. ⭐ A list of problems rather than a bool, because
/// *"it failed"* is not an actionable thing to put in a log at 3am.
#[derive(Debug, PartialEq, Eq)]
pub struct Verdict {
    pub ok: bool,
    pub problems: Vec<String>,
}

impl Readback {
    pub fn new(name: impl Into<String>, len: usize) -> Self {
        Readback {
            name: name.into(),
            chunks: 0, bytes: 0, next_offset: 0,
            out_of_order: 0, overrun: 0,
            hash: RollingFnv::default(),
            values: vec![0.0; len],
        }
    }

    pub fn values(&self) -> &[Weight] { &self.values }

    /// Apply one chunk of little-endian `Weight` values at `byte_offset`.
    pub fn apply_chunk(&mut self, byte_offset: u64, payload: &[u8]) -> ChunkOutcome {
        // Order matters and is documented above: gap detection, then HASH, then
        // the bounds check.
        if byte_offset != self.next_offset {
            self.out_of_order += 1;
        }

        // ⛔ HASH FIRST — the donor hashed what it SENT, so we hash what ARRIVED,
        // including a chunk we are about to refuse to store.
        self.hash.update(payload);

        let w = std::mem::size_of::<Weight>() as u64;
        if byte_offset % w != 0 || payload.len() % w as usize != 0 {
            // ⚠ Not an overrun — a different fault with a different cause, and
            // conflating them would send someone hunting a sizing bug when the
            // real one is framing.
            return ChunkOutcome::Misaligned;
        }

        let start = (byte_offset / w) as usize;
        let n = payload.len() / w as usize;
        if start + n > self.values.len() {
            self.overrun += 1;
            return ChunkOutcome::Overrun;
        }

        for k in 0..n {
            let o = k * 4;
            self.values[start + k] =
                Weight::from_le_bytes([payload[o], payload[o + 1], payload[o + 2], payload[o + 3]]);
        }
        self.chunks += 1;
        self.bytes += payload.len() as u64;
        self.next_offset = byte_offset + payload.len() as u64;
        ChunkOutcome::Applied
    }

    /// Settle against the donor's closing ack.
    ///
    /// ⛔ Every check is independent and every failure is NAMED. The JS version
    /// pushes exactly these five, and the reason they are five rather than one
    /// is that they have five different causes and five different fixes.
    pub fn settle(&self, found: bool, donor_error: Option<&str>, donor_chunks: u32, donor_checksum: u64) -> Verdict {
        let mut problems = Vec::new();
        if !found {
            problems.push(donor_error.unwrap_or("donor reported not found").to_string());
        }
        if donor_chunks != self.chunks {
            problems.push(format!("chunk count {} received vs {donor_chunks} sent", self.chunks));
        }
        if self.out_of_order > 0 {
            problems.push(format!("{} chunk(s) arrived out of order", self.out_of_order));
        }
        if self.overrun > 0 {
            problems.push(format!("{} chunk(s) ran past the CPU array", self.overrun));
        }
        let mine = self.hash.finish();
        if mine != donor_checksum {
            problems.push(format!("checksum {mine} != donor {donor_checksum}"));
        }
        Verdict { ok: problems.is_empty(), problems }
    }

    pub fn checksum(&self) -> u64 { self.hash.finish() }
}

#[cfg(test)]
mod tests {
    use super::*;
    // ⚠ Test-only: the rolling hasher is what the lib uses; this one-shot form
    // exists to state the expected digest independently of the rolling code, so
    // a bug in `RollingFnv` cannot make its own test pass.
    use unity_weights::residency::fnv1a64;

    fn bytes_of(vals: &[Weight]) -> Vec<u8> {
        vals.iter().flat_map(|v| v.to_le_bytes()).collect()
    }

    fn whole(vals: &[Weight]) -> (Readback, u64) {
        let mut rb = Readback::new("cortex.synapses", vals.len());
        let all = bytes_of(vals);
        rb.apply_chunk(0, &all);
        let donor = fnv1a64(&all);
        (rb, donor)
    }

    #[test]
    fn a_clean_single_chunk_readback_settles_ok() {
        let vals: Weight8 = [0.25, -0.5, 1.0, 0.125];
        let (rb, donor) = whole(&vals);
        assert_eq!(rb.values(), &vals);
        let v = rb.settle(true, None, 1, donor);
        assert!(v.ok, "problems: {:?}", v.problems);
    }
    type Weight8 = [Weight; 4];

    #[test]
    fn chunk_boundaries_do_not_change_the_digest() {
        // ⭐ The property the whole verification rests on: the donor may split
        // the stream however it likes.
        let vals: Vec<Weight> = (0..64).map(|i| i as Weight * 0.5).collect();
        let all = bytes_of(&vals);
        let donor = fnv1a64(&all);

        for chunk in [4usize, 8, 16, 64, 256] {
            let mut rb = Readback::new("m", vals.len());
            let mut off = 0u64;
            for part in all.chunks(chunk) {
                rb.apply_chunk(off, part);
                off += part.len() as u64;
            }
            assert_eq!(rb.checksum(), donor, "digest changed at chunk size {chunk}");
            assert_eq!(rb.values(), vals.as_slice());
            assert!(rb.settle(true, None, rb.chunks, donor).ok);
        }
    }

    #[test]
    fn an_overrunning_chunk_is_refused_but_still_hashed() {
        // ⛔ THE ORDERING TEST. The donor hashed what it SENT; we must hash what
        // ARRIVED even when we refuse to store it, or a length disagreement
        // would masquerade as a data disagreement.
        let vals: Vec<Weight> = vec![1.0, 2.0];
        let mut rb = Readback::new("m", vals.len());
        let too_much = bytes_of(&[1.0, 2.0, 3.0, 4.0]);
        assert_eq!(rb.apply_chunk(0, &too_much), ChunkOutcome::Overrun);
        assert_eq!(rb.overrun, 1);
        assert_eq!(rb.chunks, 0, "an overrunning chunk must not count as applied");
        assert_eq!(rb.values(), &[0.0, 0.0], "and must not be partially written");
        assert_eq!(rb.checksum(), fnv1a64(&too_much),
            "but it MUST be hashed — the donor hashed it on the way out");

        let v = rb.settle(true, None, 1, fnv1a64(&too_much));
        assert!(!v.ok);
        assert!(v.problems.iter().any(|p| p.contains("ran past the CPU array")),
            "the overrun must be named, not folded into the checksum: {:?}", v.problems);
    }

    #[test]
    fn out_of_order_is_detected_even_when_the_data_is_complete() {
        // ⭐ Exactly why a byte count is not a completeness proof: this stream
        // arrives whole, intact, and shuffled.
        let vals: Vec<Weight> = vec![1.0, 2.0, 3.0, 4.0];
        let all = bytes_of(&vals);
        let mut rb = Readback::new("m", vals.len());
        rb.apply_chunk(8, &all[8..]);   // second half first
        rb.apply_chunk(0, &all[..8]);
        assert_eq!(rb.values(), vals.as_slice(), "the DATA is all there");
        assert_eq!(rb.bytes, all.len() as u64, "and the byte count is perfect");
        assert!(rb.out_of_order > 0, "yet the stream was shuffled and that must be visible");
        let v = rb.settle(true, None, 2, rb.checksum());
        assert!(!v.ok, "a shuffled stream must not settle OK on byte count alone");
        assert!(v.problems.iter().any(|p| p.contains("out of order")));
    }

    #[test]
    fn a_shuffled_stream_also_breaks_the_digest_which_is_the_point() {
        // The donor hashes in SEND order; we hash in ARRIVAL order. Reordering
        // therefore shows up twice, which is belt and braces on purpose.
        let vals: Vec<Weight> = vec![1.0, 2.0, 3.0, 4.0];
        let all = bytes_of(&vals);
        let donor = fnv1a64(&all);
        let mut rb = Readback::new("m", vals.len());
        rb.apply_chunk(8, &all[8..]);
        rb.apply_chunk(0, &all[..8]);
        assert_ne!(rb.checksum(), donor, "arrival-order hashing is what makes reordering detectable");
    }

    #[test]
    fn each_of_the_five_failures_is_named_separately() {
        let vals: Vec<Weight> = vec![1.0, 2.0];
        let (rb, donor) = whole(&vals);

        let v = rb.settle(false, Some("matrix not resident on donor"), 1, donor);
        assert!(v.problems.iter().any(|p| p.contains("not resident")), "{:?}", v.problems);

        let v = rb.settle(true, None, 5, donor);
        assert!(v.problems.iter().any(|p| p.contains("chunk count")), "{:?}", v.problems);

        let v = rb.settle(true, None, 1, donor ^ 0xff);
        assert!(v.problems.iter().any(|p| p.contains("checksum")), "{:?}", v.problems);

        // And a clean one stays clean.
        assert!(rb.settle(true, None, 1, donor).ok);
    }

    #[test]
    fn all_problems_are_reported_together_not_just_the_first() {
        // An operator with no shell gets one line. It has to carry everything.
        let vals: Vec<Weight> = vec![1.0, 2.0];
        let mut rb = Readback::new("m", vals.len());
        rb.apply_chunk(4, &bytes_of(&[9.0]));                 // out of order
        rb.apply_chunk(0, &bytes_of(&[1.0, 2.0, 3.0]));       // overrun
        let v = rb.settle(false, Some("gone"), 99, 12345);
        assert!(v.problems.len() >= 4, "expected several, got {:?}", v.problems);
    }

    #[test]
    fn a_misaligned_offset_is_its_own_fault_not_an_overrun() {
        // Framing faults and sizing faults have different causes and different
        // fixes; conflating them sends someone hunting the wrong one.
        let mut rb = Readback::new("m", 4);
        assert_eq!(rb.apply_chunk(3, &bytes_of(&[1.0])), ChunkOutcome::Misaligned);
        assert_eq!(rb.overrun, 0, "a framing fault must not be reported as an overrun");
        let mut rb2 = Readback::new("m", 4);
        assert_eq!(rb2.apply_chunk(0, &[1, 2, 3]), ChunkOutcome::Misaligned,
            "a payload that is not a whole number of values is also framing");
    }

    /// ⭐⭐ CROSS-LANGUAGE PIN. These digests were produced by the **shipped**
    /// `_applyValuesChunk`, extracted from `server/brain-server/gpu.js` by
    /// brace-matched line range and run on these exact byte sequences.
    ///
    /// ⚠ The JS run also confirmed the ordering claim directly: the digest after
    /// a REFUSED overrunning chunk equalled the digest after an accepted one
    /// (`10352097795870096280` both ways), which is only true if the hash is
    /// accumulated before the bounds check. **A port that "tidied" that ordering
    /// would still pass every local test and silently disagree with every donor.**
    #[test]
    fn digests_match_the_shipped_javascript_assembler_byte_for_byte() {
        // In-order, one clean chunk of four values.
        let mut rb = Readback::new("m", 4);
        rb.apply_chunk(0, &bytes_of(&[0.25, -0.5, 1.0, 0.125]));
        assert_eq!(rb.checksum(), 6_861_181_660_107_991_221,
            "in-order digest must equal the shipped JS assembler's");

        // Shuffled: second half first. Arrival-order hashing makes this differ.
        let four = bytes_of(&[1.0, 2.0, 3.0, 4.0]);
        let mut sh = Readback::new("m", 4);
        sh.apply_chunk(8, &four[8..]);
        sh.apply_chunk(0, &four[..8]);
        assert_eq!(sh.checksum(), 16_787_698_341_258_038_776,
            "shuffled digest must equal the shipped JS assembler's");
        assert_eq!(sh.out_of_order, 2, "and the JS counts 2 here — both chunks broke the stream");
    }

    #[test]
    fn an_empty_readback_settles_ok_against_an_empty_donor_stream() {
        // 0 nnz is a legal degenerate matrix.
        let rb = Readback::new("m", 0);
        let v = rb.settle(true, None, 0, RollingFnv::default().finish());
        assert!(v.ok, "problems: {:?}", v.problems);
    }
}
