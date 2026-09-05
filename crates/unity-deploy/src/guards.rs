//! The two transfer guards, as decision functions.
//!
//! Ported from `deploy/self-update.sh`. Both were built the same day and they
//! encode one lesson between them, which is the reason they live together:
//!
//! ⛔⛔ **`write_bytes` IS THE RIGHT SIGNAL FOR A BOUND AND THE WRONG SIGNAL FOR
//! A DETECTOR.** Page cache makes the counter lag reality.
//!
//! - For a **ceiling**, that lag is harmless and self-correcting — it can only
//!   make the guard fire LATE, never early, so a healthy transfer is never
//!   killed by it.
//! - For a **stall detector**, the same lag is fatal: *"not accounted yet"* and
//!   *"not happening"* become one reading. A perfectly healthy fields rsync was
//!   measured at `write_bytes == 0` while its destination grew 4.5G → 28G, and
//!   **a working transfer was killed on that reading.**
//!
//! ⭐ **A conservative-late bound is safe; a conservative-late detector is a
//! lie.** So the ceiling uses bytes written, and the wedge detector uses
//! **destination growth** — the outcome itself, not a proxy for it.
//!
//! ⚠ These are pure functions on sampled numbers. The sampling loop belongs to
//! the caller; **the decision is what was wrong twice, not the polling.**

/// Default: kill the LFS pull once it has written more than this percentage of
/// the store it is reading from.
pub const DEFAULT_MAX_WRITE_PCT: u64 = 150;

/// Default: five minutes of zero destination growth is a wedge, not slowness.
pub const DEFAULT_FIELDS_STALL_SEC: u64 = 300;

#[derive(Debug, PartialEq, Eq)]
pub enum Ceiling {
    /// Under the bound, or unarmed.
    Ok,
    /// Written more than the allowed share of the source store.
    Runaway { written: u64, store: u64, cap: u64 },
    /// ⚠ The store could not be sized, so there IS no bound — said out loud
    /// rather than silently assumed safe.
    Unarmed(String),
}

/// Bound the LFS pull by **bytes written against the size of the store it reads
/// from**.
///
/// ⛔ The stall watchdog is structurally blind to this: a runaway is writes
/// climbing beautifully, forever, so a no-progress counter sits at zero for the
/// entire event. **Two opposite pathologies; neither guard catches the other.**
///
/// Measured 2026-09-05: the pull wrote **212 GB from a 110 GB store** at a
/// textbook 4.7 GB/10 s — every progress signal read healthy.
pub fn lfs_ceiling(written: u64, store_bytes: Option<u64>, pct: u64) -> Ceiling {
    if pct == 0 { return Ceiling::Unarmed("UAL_LFS_MAX_WRITE_PCT=0 — only the wall clock bounds a runaway".into()); }
    let Some(store) = store_bytes.filter(|s| *s > 0) else {
        return Ceiling::Unarmed(
            "could not size the LFS store (not found, or not readable — /var/lib/forgejo is mode 750 git:git, \
             so this is a PERMISSIONS result on a box where the service user is not in the git group). \
             The wall clock is the only bound on a runaway.".into());
    };
    // ⚠ Integer division deliberately: store/100*pct loses at most 99*pct bytes,
    // which is nothing at these scales and cannot overflow at 64 bits.
    let cap = store / 100 * pct;
    if written > cap { Ceiling::Runaway { written, store, cap } } else { Ceiling::Ok }
}

/// Rolling destination-growth tracker for the fields rsync.
///
/// ⛔ **Deliberately NOT `write_bytes`.** See the module header: a healthy rsync
/// reads zero there while its destination grows, because writes sit in page
/// cache until writeback. **The signal that cannot lie is destination growth** —
/// if the destination is bigger than it was, work happened, whatever any counter
/// says.
#[derive(Debug)]
pub struct GrowthWatch {
    last_size: Option<u64>,
    flat_for: u64,
    stall_sec: u64,
    sample_sec: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Growth {
    Growing,
    /// Flat, but not yet long enough to call it.
    Flat { for_sec: u64 },
    /// ⛔ Wedged: no growth for the whole window while the process is alive.
    Wedged { for_sec: u64, size: u64 },
}

impl GrowthWatch {
    pub fn new(stall_sec: u64, sample_sec: u64) -> Self {
        GrowthWatch { last_size: None, flat_for: 0, stall_sec, sample_sec: sample_sec.max(1) }
    }

    /// Feed one sample of the destination's total size.
    pub fn observe(&mut self, size: u64) -> Growth {
        let grew = match self.last_size {
            None => true,                 // first sample establishes a baseline
            Some(prev) => size != prev,
        };
        self.last_size = Some(size);
        if grew {
            self.flat_for = 0;
            return Growth::Growing;
        }
        self.flat_for += self.sample_sec;
        if self.stall_sec > 0 && self.flat_for >= self.stall_sec {
            Growth::Wedged { for_sec: self.flat_for, size }
        } else {
            Growth::Flat { for_sec: self.flat_for }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GB: u64 = 1_073_741_824;

    // ── the ceiling ──────────────────────────────────────────────────────────
    #[test]
    fn the_observed_runaway_is_caught() {
        // 212 GB written from a 110 GB store — the real event.
        match lfs_ceiling(212 * GB, Some(110 * GB), DEFAULT_MAX_WRITE_PCT) {
            Ceiling::Runaway { written, store, cap } => {
                assert_eq!(written, 212 * GB);
                assert_eq!(store, 110 * GB);
                assert!(cap < written, "the cap must be below what was written");
            }
            other => panic!("the 2026-09-05 runaway must be caught, got {other:?}"),
        }
    }

    #[test]
    fn a_legitimate_full_hydrate_is_not_killed() {
        // Pulling the whole 110 GB store is normal and must pass.
        assert_eq!(lfs_ceiling(110 * GB, Some(110 * GB), DEFAULT_MAX_WRITE_PCT), Ceiling::Ok);
        // Even a bit of overhead above the store size is fine at 150%.
        assert_eq!(lfs_ceiling(140 * GB, Some(110 * GB), DEFAULT_MAX_WRITE_PCT), Ceiling::Ok);
    }

    #[test]
    fn an_unsizeable_store_reports_unarmed_rather_than_inventing_a_number() {
        match lfs_ceiling(999 * GB, None, DEFAULT_MAX_WRITE_PCT) {
            Ceiling::Unarmed(w) => assert!(w.contains("PERMISSIONS"),
                "the likeliest cause must be named — /var/lib/forgejo is mode 750: {w}"),
            other => panic!("expected Unarmed, got {other:?}"),
        }
        // A zero-size store is the same condition, not a cap of zero.
        assert!(matches!(lfs_ceiling(1, Some(0), 150), Ceiling::Unarmed(_)),
            "a zero-byte store must NOT produce a cap of 0 that kills every pull instantly");
    }

    #[test]
    fn pct_zero_is_an_explicit_documented_off_switch() {
        assert!(matches!(lfs_ceiling(u64::MAX, Some(GB), 0), Ceiling::Unarmed(_)));
    }

    #[test]
    fn the_arithmetic_holds_at_64_bits() {
        let store = 110 * GB;
        let cap = store / 100 * 150;
        assert!(cap > 2_147_483_647, "must not wrap at 2^31");
        // within a MiB of the exact 1.5x
        assert!((store * 3 / 2) - cap < 1_048_576);
    }

    // ── the growth watch ─────────────────────────────────────────────────────
    #[test]
    fn a_growing_destination_is_never_called_wedged() {
        // ⭐ THE FALSE POSITIVE THAT KILLED A WORKING TRANSFER. This is the case
        // that matters most.
        let mut w = GrowthWatch::new(300, 30);
        let mut size = 4 * GB;
        for _ in 0..40 {
            size += 512 * 1024 * 1024;
            assert_eq!(w.observe(size), Growth::Growing);
        }
    }

    #[test]
    fn a_frozen_destination_is_wedged_only_after_the_full_window() {
        let mut w = GrowthWatch::new(300, 30);
        assert_eq!(w.observe(28 * GB), Growth::Growing);   // baseline
        for i in 1..10 {
            let expect_sec = i * 30;
            match w.observe(28 * GB) {
                Growth::Flat { for_sec } => assert_eq!(for_sec, expect_sec),
                other => panic!("at {expect_sec}s expected Flat, got {other:?}"),
            }
        }
        // 10th flat sample reaches 300s.
        assert_eq!(w.observe(28 * GB), Growth::Wedged { for_sec: 300, size: 28 * GB });
    }

    #[test]
    fn slow_but_real_progress_resets_the_counter() {
        // At an 80M bwlimit a live transfer moves ~24 GB in five minutes, so the
        // window is generous on purpose — but ANY growth must reset it.
        let mut w = GrowthWatch::new(300, 30);
        w.observe(10 * GB);
        for _ in 0..9 { assert!(matches!(w.observe(10 * GB), Growth::Flat { .. })); }
        assert_eq!(w.observe(10 * GB + 1), Growth::Growing, "one byte of progress is still progress");
        for _ in 0..9 { assert!(matches!(w.observe(10 * GB + 1), Growth::Flat { .. })); }
        assert!(matches!(w.observe(10 * GB + 1), Growth::Wedged { .. }));
    }

    #[test]
    fn a_shrinking_destination_counts_as_change_not_as_a_stall() {
        // rsync --delete can shrink the destination. That is work happening.
        let mut w = GrowthWatch::new(60, 30);
        w.observe(10 * GB);
        assert_eq!(w.observe(9 * GB), Growth::Growing,
            "a destination that CHANGED is not frozen, even if it got smaller");
    }

    #[test]
    fn stall_sec_zero_disables_the_watch() {
        let mut w = GrowthWatch::new(0, 30);
        w.observe(1);
        for _ in 0..1000 {
            assert!(matches!(w.observe(1), Growth::Flat { .. }), "disabled must never declare a wedge");
        }
    }

    #[test]
    fn the_two_guards_catch_opposite_pathologies() {
        // A runaway: writes climbing beautifully, forever. The growth watch sees
        // a growing destination and correctly says nothing.
        // ⚠ 53 x 4 GB = 212 GB — the ACTUAL observed runaway. A first version of
        // this test ran 20 iterations for 80 GB, which is comfortably UNDER the
        // 165 GB cap, so it asserted a runaway that had not happened yet. The
        // arithmetic was mine, not the guard's.
        let mut w = GrowthWatch::new(300, 30);
        let mut size = 0u64;
        for _ in 0..53 { size += 4 * GB; assert_eq!(w.observe(size), Growth::Growing); }
        assert!(size > 200 * GB, "should have reached the observed ~212 GB, got {}", size / GB);
        // ...while the ceiling is what catches it.
        assert!(matches!(lfs_ceiling(size, Some(110 * GB), 150), Ceiling::Runaway { .. }),
            "the ceiling must catch what the growth watch cannot even see");
    }
}
