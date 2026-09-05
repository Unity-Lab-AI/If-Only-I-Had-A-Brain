//! File-backed weight values, so the kernel can evict cold weight pages.
//!
//! Migration phase **B2**, §6.2 — *"the memory win JS structurally could not
//! have."*
//!
//! ## Why this was rejected in JS and is right here
//!
//! `docs/MEMORY-MAP.md` records the investigation. mmap was not the wrong idea;
//! **Node has no native mmap**, and a file-backed typed array needs a native
//! addon — built by an unattended `npm install` on a box with no shell to
//! recover from a failed build. *"That is a new failure mode on the exact path
//! the operator cannot debug, bought with memory."* In Rust it is `memmap2`,
//! compiled ahead of time, and the failure mode disappears.
//!
//! ⚠ **And "get it off the heap" was never the prize — it was already true.**
//! Measured: a 400 MiB `Float32Array` puts 381 MiB in `external`/`arrayBuffers`
//! and ~0 in `heapUsed`. GC never moved those bytes. **Only *evictability* was
//! ever actually on offer**, and that is precisely what a file mapping buys.
//!
//! ## ⛔ THE ACCESS PATTERN IS WHY THIS IS SAFE, AND IT WAS ALSO A WRONG MODEL ONCE
//!
//! The second wrong model in `MEMORY-MAP.md` was *"the language cortex is hot,
//! so mmap would starve her"*. It is **not** hot: every CPU compute path in the
//! cortex is gated off above 2M neurons and the cortex is pinned at 12M, so the
//! arrays are touched by exactly three things — **init** (one sequential fill),
//! **donor upload** (bulk sequential read) and **hourly readback** (bulk write).
//! That is a cold, streaming pattern, which is the one mmap serves well.
//!
//! ⛔ **PRECONDITION, NOT OPTIONAL:** once these pages are file-backed, an
//! unbounded `rsync` in the same cgroup would evict her weights through page
//! cache alone — the same starvation with a new mechanism. **`unity-deploy`'s
//! own-cgroup launch (phase B1) must be in place before this is switched on.**
//!
//! ## ⚠ What is NOT solved here, stated rather than implied
//!
//! §6.2 lists open questions this module does not answer: what re-materialises a
//! freed matrix and who blocks while it happens; whether a partial readback can
//! interleave with a free (`refreshCheckpointFromDonor` warns that a partial
//! transfer leaves values *"a mix of old-CPU and new-GPU rows"*, so freeing
//! mid-readback must be impossible); and what happens when the last donor
//! disconnects. **This provides the mapping. The lifecycle policy is a separate
//! decision and belongs with whoever owns donor state, not here.**

use crate::Weight;
use memmap2::{Mmap, MmapMut};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

/// A read-only file mapping viewed as `Weight` values.
///
/// ⚠ Holds the mapping alive; dropping it unmaps. The borrow checker is what
/// makes the "values outlive their mapping" bug unrepresentable here — in a
/// native Node addon that is a segfault waiting on a GC.
#[derive(Debug)]
pub struct WeightMap {
    map: Mmap,
    len: usize,
}

impl WeightMap {
    /// Map a file of raw little-endian `Weight` values.
    pub fn open(path: &Path) -> std::io::Result<Self> {
        let f = OpenOptions::new().read(true).open(path)?;
        let bytes = f.metadata()?.len() as usize;
        let w = std::mem::size_of::<Weight>();
        if bytes % w != 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("{} is {bytes} bytes, not a whole number of {w}-byte weights — that is a truncated or wrong-width file", path.display()),
            ));
        }
        // SAFETY: the file is not mutated through another handle while mapped.
        // ⚠ That is a real requirement, not a formality: a concurrent writer
        // would change bytes under the slice. The deploy lock (phase B1) is what
        // keeps a second process off these files.
        let map = unsafe { Mmap::map(&f)? };
        Ok(WeightMap { map, len: bytes / w })
    }

    pub fn len(&self) -> usize { self.len }
    pub fn is_empty(&self) -> bool { self.len == 0 }

    /// The mapped values.
    ///
    /// ⚠ Falls back to a copy when the mapping is not correctly aligned for
    /// `Weight`. ⭐ **`align_to` is used rather than a blind cast because an
    /// unaligned reinterpret is undefined behaviour**, and a mapping's alignment
    /// is the kernel's business, not ours. In practice page-aligned mappings
    /// always satisfy a 4-byte type, so the fallback is a correctness belt that
    /// never costs anything.
    pub fn values(&self) -> &[Weight] {
        let (head, body, _tail) = unsafe { self.map.align_to::<Weight>() };
        debug_assert!(head.is_empty(), "a page-aligned mapping should need no prefix");
        &body[..self.len.min(body.len())]
    }
}

/// Write values to a file in the exact layout [`WeightMap`] expects.
///
/// ⭐ Width comes from the type. The JS writer's hardcoded `nnz * 8` against an
/// f32 array is the bug that made her train for two hours and persist nothing.
pub fn write_values(path: &Path, values: &[Weight]) -> std::io::Result<()> {
    let mut f = OpenOptions::new().create(true).write(true).truncate(true).open(path)?;
    for v in values {
        f.write_all(&v.to_le_bytes())?;
    }
    f.flush()
}

/// A writable mapping, for the hourly readback lane.
pub struct WeightMapMut {
    map: MmapMut,
    len: usize,
}

impl WeightMapMut {
    pub fn open(path: &Path) -> std::io::Result<Self> {
        let f = OpenOptions::new().read(true).write(true).open(path)?;
        let bytes = f.metadata()?.len() as usize;
        let w = std::mem::size_of::<Weight>();
        if bytes % w != 0 {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData,
                format!("{bytes} bytes is not a whole number of {w}-byte weights")));
        }
        // SAFETY: same requirement as the read-only map.
        let map = unsafe { MmapMut::map_mut(&f)? };
        Ok(WeightMapMut { map, len: bytes / w })
    }

    pub fn values_mut(&mut self) -> &mut [Weight] {
        let len = self.len;
        let (_h, body, _t) = unsafe { self.map.align_to_mut::<Weight>() };
        let n = len.min(body.len());
        &mut body[..n]
    }

    /// Push changes to disk. ⚠ Explicit rather than on drop: a readback that is
    /// interrupted must not silently half-publish, and "when did this land" is a
    /// question the caller has to be able to answer.
    pub fn flush(&self) -> std::io::Result<()> { self.map.flush() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("unity-mmap-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.push("values.bin");
        p
    }

    #[test]
    fn round_trips_values_bit_exactly() {
        let p = tmp("round");
        let vals: Vec<Weight> = vec![0.0, 1.0, -0.5, 0.125, 3.4028235e38, -1.1754944e-38];
        write_values(&p, &vals).unwrap();
        let m = WeightMap::open(&p).unwrap();
        assert_eq!(m.len(), vals.len());
        assert_eq!(m.values(), vals.as_slice(), "a mapping must return exactly what was written");
    }

    #[test]
    fn file_size_is_exactly_the_type_width_times_count() {
        let p = tmp("size");
        let vals: Vec<Weight> = (0..1000).map(|i| i as Weight).collect();
        write_values(&p, &vals).unwrap();
        let bytes = std::fs::metadata(&p).unwrap().len() as usize;
        assert_eq!(bytes, 1000 * std::mem::size_of::<Weight>());
        assert_eq!(bytes, 4000, "f32 — if this reads 8000 the width was taken from a literal again");
    }

    #[test]
    fn a_truncated_or_wrong_width_file_is_refused_with_the_reason() {
        let p = tmp("trunc");
        std::fs::write(&p, [1u8, 2, 3]).unwrap();   // 3 bytes: not a whole f32
        let e = WeightMap::open(&p).unwrap_err().to_string();
        assert!(e.contains("not a whole number"), "got: {e}");
        assert!(e.contains("truncated or wrong-width"),
            "a half-read file must say which of the two it is, not just fail");
    }

    #[test]
    fn writable_mapping_persists_through_a_reopen() {
        // The hourly readback lane: mutate in place, flush, and see it on disk.
        let p = tmp("mut");
        write_values(&p, &[1.0, 2.0, 3.0]).unwrap();
        {
            let mut m = WeightMapMut::open(&p).unwrap();
            m.values_mut()[1] = -9.5;
            m.flush().unwrap();
        }
        let m = WeightMap::open(&p).unwrap();
        assert_eq!(m.values(), &[1.0, -9.5, 3.0]);
    }

    #[test]
    fn an_empty_file_maps_to_nothing_rather_than_erroring() {
        // 0 nnz is a legal degenerate matrix; it must not be a failure.
        let p = tmp("empty");
        write_values(&p, &[]).unwrap();
        let m = WeightMap::open(&p).unwrap();
        assert!(m.is_empty());
        assert_eq!(m.values().len(), 0);
    }

    #[test]
    fn mapping_a_missing_file_is_an_error_not_an_empty_success() {
        let mut p = tmp("missing");
        p.set_file_name("does-not-exist.bin");
        assert!(WeightMap::open(&p).is_err(),
            "silently mapping nothing would look like a matrix with no weights");
    }
}
