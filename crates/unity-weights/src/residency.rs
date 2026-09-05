//! Weight residency: free a GPU-bound matrix, restream it, and never write an
//! incoherent one to a checkpoint.
//!
//! This closes `docs/RUST-MIGRATION.md` §6.2's three open questions. **The
//! answers were already in the code and in the operator's standing rules; they
//! were never actually open, only unwritten.**
//!
//! ## Q1 — what re-materialises a freed matrix, and who blocks?
//!
//! **The two consumers are the only answer needed, and `gpu.js` names both.**
//! An upload READS `matrix.values` to send to a donor; a readback WRITES into
//! `matrix.values` (`gpuReadbackMatrixValues` refuses outright with *"no CPU
//! master matrix '<name>' to write into"*). So a matrix must be [`Resident`]
//! before either runs, and the restream is a sequential read of the backing
//! file — **measured at the box's own 3248 MiB/s, ~1.3 s for the full 4.23 GiB
//! CSR**, against an upload that already takes far longer over the wire.
//!
//! ⚠ Who blocks: whoever asked. [`Residency::ensure_resident`] is synchronous
//! and returns only when the values are there, which is the honest shape —
//! a caller that proceeds on a not-yet-restreamed matrix is the bug.
//!
//! ## Q2 — can a partial readback interleave with a free?
//!
//! **It must be impossible, and here it is a state machine rather than a
//! convention.** `gpu.js` is unambiguous about the stakes:
//!
//! > *"ON FAILURE THE CALLER MUST NOT SAVE. A partial transfer leaves
//! > `matrix.values` a mix of old-CPU and new-GPU rows. That is not corrupt —
//! > both halves are real trained weights and Oja is robust to it — but it is
//! > not a coherent snapshot either, so a checkpoint written from it would be a
//! > **third brain**."*
//!
//! So: [`free`] is **refused** while a readback is in flight, and a readback
//! that ends without a verified checksum leaves the matrix [`Coherence::Torn`],
//! which [`Residency::checkpointable`] then refuses. ⭐ **An older coherent
//! snapshot beats a newer incoherent one** — and CHECKROT keeps three.
//!
//! ⚠ The completeness proof is a **checksum, not a byte count** — the donor
//! accumulates FNV-1a-64 over exactly the bytes it put on the wire, so *"did I
//! receive all of it, intact, in order"* is one question with one answer. A byte
//! count cannot detect reordering.
//!
//! ## Q3 — what happens when the LAST donor disconnects?
//!
//! **The walk stays at the current weights, and any donor that arrives runs from
//! the last save before they all dropped** (the operator's rule, 2026-09-05).
//!
//! ⭐ That makes the answer a *residency* rule rather than a failure path: losing
//! the last donor must never free, wipe or invalidate anything. The weights are
//! the brain; donors are interchangeable compute that borrow them.
//! [`Residency::on_last_donor_lost`] therefore **pins** the matrix — it may not
//! be freed while there is no donor, because a free is only safe when something
//! can ask for it back.
//!
//! ⚠ This deliberately does NOT contradict `cluster.js`'s
//! `requireGpuSubstrate` — a proxied brain still *requires* a proxy to compute.
//! Teaching stops. The weights simply survive it.

use crate::mmap_store::WeightMap;
use crate::Weight;
use std::path::{Path, PathBuf};

/// FNV-1a-64 over a byte stream — the donor's completeness proof.
///
/// ⚠ Matches `gpu.js`, which does the same arithmetic in two 32-bit limbs
/// (`hashHi`/`hashLo` seeded `0xcbf29ce4` / `0x84222325`) because JS has no u64.
/// A single `u64` here is the same function; [`tests`] checks them against known
/// vectors so "the same" is asserted rather than assumed.
pub fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// Where a matrix's values currently live.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Where {
    /// CPU arrays present and usable.
    Resident,
    /// CPU values freed; restreamable from the backing file.
    Freed,
}

/// Whether the values form a snapshot that may be persisted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Coherence {
    /// A complete, checksum-verified state.
    Coherent,
    /// A readback is in flight — values are being overwritten row by row.
    ReadbackInFlight,
    /// A readback ended without a verified checksum. ⛔ Real weights, but a mix
    /// of old-CPU and new-GPU rows: **a checkpoint written from this is a third
    /// brain.**
    Torn,
}

#[derive(Debug, PartialEq, Eq)]
pub enum FreeRefused {
    /// ⛔ Q2: freeing mid-readback is forbidden by construction.
    ReadbackInFlight,
    /// Freeing is only safe when the values can be got back.
    NoBacking,
    /// ⛔ Q3: with no donor there is nothing to restream *for*, and the walk
    /// stays at the current weights.
    NoDonor,
    /// Already freed.
    AlreadyFreed,
}

/// The lifecycle of one matrix's values.
#[derive(Debug)]
pub struct Residency {
    pub name: String,
    pub location: Where,
    pub coherence: Coherence,
    /// The file a freed matrix restreams from. `None` means freeing is refused.
    pub backing: Option<PathBuf>,
    /// Donors currently attached. ⭐ Q3 lives here.
    pub donors: usize,
    /// Values when resident.
    values: Vec<Weight>,
}

impl Residency {
    pub fn new(name: impl Into<String>, values: Vec<Weight>) -> Self {
        Residency {
            name: name.into(),
            location: Where::Resident,
            coherence: Coherence::Coherent,
            backing: None,
            donors: 0,
            values,
        }
    }

    pub fn with_backing(mut self, p: impl Into<PathBuf>) -> Self {
        self.backing = Some(p.into());
        self
    }

    pub fn values(&self) -> Option<&[Weight]> {
        match self.location {
            Where::Resident => Some(&self.values),
            Where::Freed => None,
        }
    }

    /// ⛔ **Q2 + Q3 enforced here.** Free the CPU values, keeping the structure.
    pub fn free(&mut self) -> Result<usize, FreeRefused> {
        if self.location == Where::Freed { return Err(FreeRefused::AlreadyFreed); }
        if self.coherence == Coherence::ReadbackInFlight { return Err(FreeRefused::ReadbackInFlight); }
        if self.backing.is_none() { return Err(FreeRefused::NoBacking); }
        // Q3: a free is only safe when something can ask for it back. With no
        // donor the walk holds at the current weights and waits.
        if self.donors == 0 { return Err(FreeRefused::NoDonor); }
        let freed = self.values.len() * std::mem::size_of::<Weight>();
        self.values = Vec::new();
        self.values.shrink_to_fit();
        self.location = Where::Freed;
        Ok(freed)
    }

    /// ⭐ **Q1.** Bring the values back. A no-op when already resident, so a
    /// caller may call it unconditionally before an upload or a readback.
    pub fn ensure_resident(&mut self) -> std::io::Result<()> {
        if self.location == Where::Resident { return Ok(()); }
        let p: &Path = self.backing.as_deref().ok_or_else(|| std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("'{}' is freed and has no backing file — it cannot be restreamed, which means freeing it was a bug", self.name),
        ))?;
        let m = WeightMap::open(p)?;
        self.values = m.values().to_vec();
        self.location = Where::Resident;
        Ok(())
    }

    /// A readback is starting: values will be overwritten row by row.
    ///
    /// ⚠ Restreams first if needed — `gpuReadbackMatrixValues` refuses with *"no
    /// CPU master matrix to write into"*, so arriving freed is a wasted round
    /// trip rather than an error worth surfacing.
    pub fn begin_readback(&mut self) -> std::io::Result<()> {
        self.ensure_resident()?;
        self.coherence = Coherence::ReadbackInFlight;
        Ok(())
    }

    /// A readback finished. **The checksum is the completeness proof**, not the
    /// byte count — a byte count cannot detect reordering.
    ///
    /// ⛔ Anything other than a verified match leaves the matrix [`Coherence::Torn`],
    /// and [`Self::checkpointable`] then refuses to persist it.
    pub fn complete_readback(&mut self, mine: u64, theirs: u64) -> bool {
        let ok = mine == theirs;
        self.coherence = if ok { Coherence::Coherent } else { Coherence::Torn };
        ok
    }

    /// ⭐ **Q3.** The last donor went away. The weights stay exactly as they are.
    pub fn on_last_donor_lost(&mut self) {
        self.donors = 0;
        // ⛔ Deliberately nothing else. No free, no wipe, no invalidation. The
        // walk holds at the current weights and the next donor runs from the
        // last save. If the values were freed while donors existed they stay
        // freed and restreamable — the backing file is the last save.
    }

    pub fn on_donor_joined(&mut self) { self.donors += 1; }

    /// May this be written to a checkpoint right now?
    ///
    /// ⛔ The one question that must never be answered optimistically. An older
    /// coherent snapshot beats a newer incoherent one.
    pub fn checkpointable(&self) -> Result<&[Weight], String> {
        match (&self.location, &self.coherence) {
            (Where::Freed, _) => Err(format!(
                "'{}' is freed — restream before writing a checkpoint, or the section would be written empty", self.name)),
            (_, Coherence::ReadbackInFlight) => Err(format!(
                "'{}' has a readback IN FLIGHT — its values are a mix of old-CPU and new-GPU rows right now", self.name)),
            (_, Coherence::Torn) => Err(format!(
                "'{}' is TORN: a readback ended without a verified checksum, so these values are a mix of old-CPU and new-GPU rows. \
                 Both halves are real trained weights, but a checkpoint written from them is a THIRD BRAIN. \
                 The previous slots survive untouched, which is the correct outcome.", self.name)),
            (Where::Resident, Coherence::Coherent) => Ok(&self.values),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mmap_store::write_values;

    fn tmpfile(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("unity-resid-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.push("values.bin");
        p
    }

    #[test]
    fn fnv1a64_matches_the_known_vectors_the_donor_uses() {
        // The seed the JS limbs are built from.
        assert_eq!(fnv1a64(b""), 0xcbf2_9ce4_8422_2325, "empty input must be the offset basis");
        // Canonical FNV-1a-64 test vectors.
        // ⚠ `foobar` was hand-typed WRONG here on the first pass and the test
        // caught it — the function returned the correct 0x85944171f73967e8 while
        // the assertion carried a mistyped constant. Verified against an
        // independent BigInt computation before being corrected, rather than
        // "fixed" by pasting whatever the code produced, which would have made
        // the test agree with any implementation including a broken one.
        assert_eq!(fnv1a64(b"a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(fnv1a64(b"foobar"), 0x8594_4171_f739_67e8);
    }

    #[test]
    fn fnv1a64_agrees_with_the_two_limb_javascript_arithmetic() {
        // ⭐ The JS does this in 32-bit limbs because it has no u64. "The same
        // function" is asserted here rather than assumed.
        let js = |bytes: &[u8]| -> u64 {
            let (mut hi, mut lo) = (0xcbf2_9ce4u64, 0x8422_2325u64);
            for &b in bytes {
                lo ^= b as u64;
                lo &= 0xffff_ffff;
                let l = lo * 0x1b3;
                let carry = l / 4_294_967_296;
                let nlo = l & 0xffff_ffff;
                hi = (hi.wrapping_mul(0x1b3) + lo * 0x100 + carry) & 0xffff_ffff;
                lo = nlo;
            }
            (hi << 32) | lo
        };
        for s in [b"".as_slice(), b"a", b"foobar", b"cortex.synapses", &[0u8, 255, 128, 7]] {
            assert_eq!(fnv1a64(s), js(s), "limb arithmetic must equal the u64 form for {s:?}");
        }
    }

    // ── Q2: freeing mid-readback is impossible ───────────────────────────────
    #[test]
    fn free_is_refused_while_a_readback_is_in_flight() {
        let p = tmpfile("inflight");
        write_values(&p, &[1.0, 2.0]).unwrap();
        let mut r = Residency::new("cortex.synapses", vec![1.0, 2.0]).with_backing(&p);
        r.on_donor_joined();
        r.begin_readback().unwrap();
        assert_eq!(r.free(), Err(FreeRefused::ReadbackInFlight),
            "freeing under a readback would drop rows the donor is still writing");
    }

    #[test]
    fn a_failed_readback_leaves_it_torn_and_uncheckpointable() {
        let p = tmpfile("torn");
        write_values(&p, &[1.0, 2.0]).unwrap();
        let mut r = Residency::new("cortex.synapses", vec![1.0, 2.0]).with_backing(&p);
        r.on_donor_joined();
        r.begin_readback().unwrap();
        assert!(!r.complete_readback(111, 222), "mismatched checksums are not a success");
        assert_eq!(r.coherence, Coherence::Torn);
        let e = r.checkpointable().unwrap_err();
        assert!(e.contains("THIRD BRAIN"), "the refusal must say WHY, not just decline: {e}");
    }

    #[test]
    fn a_verified_readback_restores_coherence_and_permits_a_save() {
        let p = tmpfile("verified");
        write_values(&p, &[1.0, 2.0]).unwrap();
        let mut r = Residency::new("cortex.synapses", vec![1.0, 2.0]).with_backing(&p);
        r.on_donor_joined();
        r.begin_readback().unwrap();
        assert!(r.complete_readback(0xdead_beef, 0xdead_beef));
        assert_eq!(r.coherence, Coherence::Coherent);
        assert!(r.checkpointable().is_ok());
    }

    #[test]
    fn an_in_flight_matrix_cannot_be_checkpointed_either() {
        let p = tmpfile("inflight2");
        write_values(&p, &[1.0]).unwrap();
        let mut r = Residency::new("m", vec![1.0]).with_backing(&p);
        r.on_donor_joined();
        r.begin_readback().unwrap();
        assert!(r.checkpointable().unwrap_err().contains("IN FLIGHT"));
    }

    // ── Q1: restream ─────────────────────────────────────────────────────────
    #[test]
    fn a_freed_matrix_restreams_from_its_backing_file_bit_exactly() {
        let p = tmpfile("restream");
        let vals: Vec<Weight> = vec![0.25, -0.5, 1.0, 0.125];
        write_values(&p, &vals).unwrap();
        let mut r = Residency::new("cortex.synapses", vals.clone()).with_backing(&p);
        r.on_donor_joined();

        let freed = r.free().unwrap();
        assert_eq!(freed, vals.len() * 4, "reports the bytes actually released");
        assert_eq!(r.location, Where::Freed);
        assert!(r.values().is_none(), "a freed matrix must not hand out stale values");

        r.ensure_resident().unwrap();
        assert_eq!(r.values().unwrap(), vals.as_slice(), "restream must be bit-exact");
    }

    #[test]
    fn ensure_resident_is_a_no_op_when_already_resident() {
        let p = tmpfile("noop");
        write_values(&p, &[9.0]).unwrap();
        let mut r = Residency::new("m", vec![1.0, 2.0, 3.0]).with_backing(&p);
        r.ensure_resident().unwrap();
        assert_eq!(r.values().unwrap(), &[1.0, 2.0, 3.0],
            "a redundant call must NOT clobber live values with the file's older copy");
    }

    #[test]
    fn freeing_without_a_backing_file_is_refused() {
        let mut r = Residency::new("m", vec![1.0]);
        r.on_donor_joined();
        assert_eq!(r.free(), Err(FreeRefused::NoBacking),
            "a free you cannot undo is a delete");
    }

    #[test]
    fn a_freed_matrix_cannot_be_checkpointed_as_empty() {
        let p = tmpfile("freedckpt");
        write_values(&p, &[1.0]).unwrap();
        let mut r = Residency::new("m", vec![1.0]).with_backing(&p);
        r.on_donor_joined();
        r.free().unwrap();
        assert!(r.checkpointable().unwrap_err().contains("written empty"));
    }

    // ── Q3: the last donor drops ─────────────────────────────────────────────
    #[test]
    fn losing_the_last_donor_changes_nothing_about_the_weights() {
        let p = tmpfile("lastdonor");
        let vals: Vec<Weight> = vec![0.5, -0.25];
        write_values(&p, &vals).unwrap();
        let mut r = Residency::new("cortex.synapses", vals.clone()).with_backing(&p);
        r.on_donor_joined();

        r.on_last_donor_lost();

        assert_eq!(r.location, Where::Resident, "the walk stays at the current weights");
        assert_eq!(r.coherence, Coherence::Coherent, "losing compute does not make a snapshot incoherent");
        assert_eq!(r.values().unwrap(), vals.as_slice(), "the weights are the brain; donors only borrow them");
        assert!(r.checkpointable().is_ok(), "and they must still be savable — that save IS what the next donor runs");
    }

    #[test]
    fn with_no_donor_a_free_is_refused_because_nothing_can_ask_for_it_back() {
        let p = tmpfile("nodonor");
        write_values(&p, &[1.0]).unwrap();
        let mut r = Residency::new("m", vec![1.0]).with_backing(&p);
        r.on_donor_joined();
        r.on_last_donor_lost();
        assert_eq!(r.free(), Err(FreeRefused::NoDonor),
            "freeing with nothing attached trades resident weights for a restream nobody asked for");
    }

    #[test]
    fn a_matrix_freed_while_donors_existed_stays_restreamable_after_they_all_drop() {
        // The operator's rule: any donor runs from the LAST SAVE before they all
        // dropped. That save is the backing file, so it must still work.
        let p = tmpfile("survives");
        let vals: Vec<Weight> = vec![7.0, 8.0];
        write_values(&p, &vals).unwrap();
        let mut r = Residency::new("m", vals.clone()).with_backing(&p);
        r.on_donor_joined();
        r.free().unwrap();

        r.on_last_donor_lost();
        assert_eq!(r.location, Where::Freed, "losing donors must not silently re-materialise anything");

        r.on_donor_joined();
        r.ensure_resident().unwrap();
        assert_eq!(r.values().unwrap(), vals.as_slice(),
            "the new donor runs from the last save, exactly as specified");
    }
}
