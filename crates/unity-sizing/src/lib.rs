//! # unity-sizing — the neuron-count arithmetic, with exactly one home
//!
//! Migration phase **B4**. §5.1 is emphatic about why this is its own crate:
//!
//! > *"`unity-sizing` is deliberately its own crate. **Every catastrophic weight
//! > loss in this project's history traces to a sizing disagreement between two
//! > places that each thought they were authoritative.** Isolating it means the
//! > neuron-count arithmetic has exactly one home and can be unit-tested against
//! > fixed inputs without booting anything."*
//!
//! ⭐ That is not hypothetical. The `BYTES_PER_NNZ` bug was exactly this shape —
//! an estimator saying `8` while an allocator took `12`, for the life of the
//! project, and nobody could account for 8.80 GiB until the two were reconciled.
//!
//! ## ⛔ ZERO I/O, ZERO ENV READS
//!
//! Every input is a parameter. §5.2 forbids this crate *"reading files, env
//! fallbacks scattered inline"* — because an env read buried in the arithmetic
//! is precisely how a second authority appears. The caller resolves the inputs;
//! this crate decides.
//!
//! ## ⚠ The landmine this arithmetic carries, stated up front
//!
//! `self_seed_tier` sizes from an **ASSUMED** donor baseline, not a connected
//! one — 16384 MB by default, which clears tier 3 and asks for ~357M neurons on
//! a box that may have no GPU and no donors at all. §7 lists this as a landmine
//! and says to *"decide deliberately whether to keep this"*. **It is kept here
//! because it is what the running brain does**, and a port that quietly changed the
//! behaviour would be a second authority all over again.

/// One rung of the DF.7 community-compute ladder.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Milestone {
    pub min_community_mb: u64,
    pub min_donors: u32,
    pub neurons: u64,
}

/// The ladder, mirroring `DF7_MILESTONES` in `gpu.js`.
///
/// ⚠ Tier 6 is *"headroom; NOT the limit, the box is"*. A ceiling that cannot be
/// climbed past is indistinguishable from a bug when the operator is paying by
/// the hour — which is why the ladder grew past tier 3.
pub const MILESTONES: [Milestone; 7] = [
    Milestone { min_community_mb: 0,         min_donors: 1,  neurons: 6_000_000 },
    Milestone { min_community_mb: 24_000,    min_donors: 3,  neurons: 40_000_000 },
    Milestone { min_community_mb: 96_000,    min_donors: 6,  neurons: 150_000_000 },
    Milestone { min_community_mb: 256_000,   min_donors: 10, neurons: 357_000_000 },
    Milestone { min_community_mb: 640_000,   min_donors: 16, neurons: 900_000_000 },
    Milestone { min_community_mb: 1_600_000, min_donors: 32, neurons: 2_400_000_000 },
    Milestone { min_community_mb: 4_000_000, min_donors: 64, neurons: 6_000_000_000 },
];

/// Bytes of per-neuron LIF state used to price a tier's VRAM requirement.
///
/// ⚠ **This is a BUDGETING unit, not a coordinator-side allocation.**
/// `MEMORY-MAP.md` records a whole wrong model built on forgetting that: the
/// main brain's per-neuron state lives on the **donors**; the coordinator holds
/// ~10K neurons of it, not 178M.
pub const BYTES_PER_NEURON: u64 = 21;

/// Capacity a donor of `baseline_mb` could hold, at `bytes_per_neuron`.
///
/// `floor(((mb * 0.75 - 2048) * 1MiB) / bpn)` — 25% held back for the host's own
/// use, then a 2048 MB OS reserve, then divided by the per-neuron cost.
///
/// ⚠ Saturates at zero rather than going negative: a 1 GB card yields no
/// capacity, not a negative one that would compare oddly against the ladder.
pub fn donor_capacity_neurons(baseline_mb: u64, bytes_per_neuron: u64) -> u64 {
    if bytes_per_neuron == 0 { return 0; }
    let usable = (baseline_mb as f64) * 0.75 - 2048.0;
    if usable <= 0.0 { return 0; }
    ((usable * 1_048_576.0) / bytes_per_neuron as f64).floor() as u64
}

/// Highest tier index whose neuron count fits inside `capacity`.
///
/// ⚠ Scans the whole ladder rather than stopping at the first miss — mirroring
/// the JS, and correct even if a future ladder is not monotonic.
pub fn tier_for_capacity(capacity: u64) -> usize {
    let mut tier = 0;
    for (i, m) in MILESTONES.iter().enumerate() {
        if capacity >= m.neurons { tier = i; }
    }
    tier
}

/// Clamp the operator's autoscale inputs the way the loader does.
pub fn clamp_baseline_mb(v: f64) -> u64 { v.clamp(1024.0, 262_144.0) as u64 }
pub fn clamp_bytes_per_neuron(v: f64) -> u64 { v.clamp(8.0, 1024.0) as u64 }

/// The fraction of the brain that is NOT the dense language cortex.
///
/// ⚠ Floored at 0.05. Without the floor a config where the language cortex is
/// ~all of the weight would divide by ~0 and demand an infinite budget.
pub fn main_fraction(language_cortex_weight: f64, weight_sum: f64) -> f64 {
    let sum = if weight_sum == 0.0 { 1.0 } else { weight_sum };
    (1.0 - (language_cortex_weight / sum)).max(0.05)
}

/// VRAM a tier needs, in MB.
///
/// `ceil((neurons * 21) / mainFrac / 1MiB) + osReserveMB`
pub fn tier_required_mb(target_neurons: u64, main_frac: f64, os_reserve_mb: u64) -> u64 {
    if target_neurons == 0 { return 0; }
    let raw = (target_neurons as f64) * BYTES_PER_NEURON as f64 / main_frac / 1_048_576.0;
    raw.ceil() as u64 + os_reserve_mb
}

/// Which rule chose the budget. ⭐ Returned rather than logged, so a caller can
/// report *why* a brain is the size it is — the question that has cost this
/// project the most time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BudgetBasis {
    /// `DREAM_BRAIN_BUDGET_MB` — the only override that beats the tier path.
    EnvOverride,
    /// A confirmed tier from `community-tier.json`.
    TierTarget { required_mb: u64, fits_box: bool },
    /// Donor-compute mode with no tier yet.
    DonorFit,
    /// Local/dev: whatever the host safely allows.
    HostSafeMax,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Budget {
    pub budget_mb: u64,
    pub basis: BudgetBasis,
}

/// Inputs to the budget decision. ⭐ A struct so adding an input is a compile
/// error at every call site rather than a silently-defaulted argument.
#[derive(Debug, Clone, Copy)]
pub struct BudgetInputs {
    /// `DREAM_BRAIN_BUDGET_MB`, 0 when unset.
    pub env_budget_mb: u64,
    pub tier_required_mb: u64,
    /// Host RAM minus the coordinator's own headroom.
    pub safe_mb: u64,
    pub host_ram_mb: u64,
    pub deploy_donor_mode: bool,
    pub donor_fit_default_mb: u64,
}

/// The budget ladder, in the order the running brain applies it.
///
/// ⛔ **THE ORDER IS THE BEHAVIOUR.** `MEMORY-MAP.md` records that
/// `10-pin-brain-size.conf` sets `DREAM_DONOR_FIT_MB` *"so a default change
/// cannot silently resize → wipe again"* — and that **it is dead code**, because
/// the tier branch is tested before the donor-fit branch and self-seeding writes
/// a tier on every deployed boot. Reordering these arms would silently
/// resurrect that file's effect, which is a resize, which is a wipe.
pub fn choose_budget(i: BudgetInputs) -> Budget {
    if i.env_budget_mb > 0 {
        // ⚠ Still capped by host RAM: an override is permission to ask, not to
        // exceed the machine.
        let capped = i.env_budget_mb.min(i.host_ram_mb.saturating_sub(13_312));
        return Budget { budget_mb: capped, basis: BudgetBasis::EnvOverride };
    }
    if i.tier_required_mb > 0 {
        let fits = i.tier_required_mb <= i.safe_mb;
        let mb = i.tier_required_mb.min(i.safe_mb).max(1024);
        return Budget { budget_mb: mb, basis: BudgetBasis::TierTarget { required_mb: i.tier_required_mb, fits_box: fits } };
    }
    if i.deploy_donor_mode {
        let mb = i.donor_fit_default_mb.min(i.safe_mb).max(1024);
        return Budget { budget_mb: mb, basis: BudgetBasis::DonorFit };
    }
    Budget { budget_mb: i.safe_mb, basis: BudgetBasis::HostSafeMax }
}

/// The self-seeding boot decision: does an ASSUMED donor baseline qualify a
/// higher tier than the persisted one?
///
/// ⚠ Returns `None` when it does not supersede, so the caller writes
/// `community-tier.json` only when something actually changed.
pub fn self_seed_tier(baseline_mb: u64, bytes_per_neuron: u64, persisted_target: u64) -> Option<(usize, u64)> {
    let cap = donor_capacity_neurons(baseline_mb, bytes_per_neuron);
    let tier = tier_for_capacity(cap);
    let target = MILESTONES.get(tier).map(|m| m.neurons).unwrap_or(0);
    if target > persisted_target { Some((tier, target)) } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_documented_boot_chain_reproduces_exactly() {
        // ⭐ MEMORY-MAP.md §"Sizing chain, for reference" states this chain with
        // real numbers. Reproducing it is the tightest available check that the
        // port matches the running brain.
        //
        //   cap = (16384 * 0.75 - 2048) * 1MiB / 20 = 536,870,912 -> clears tier 3
        let cap = donor_capacity_neurons(16_384, 20);
        assert_eq!(cap, 536_870_912, "the documented capacity for the default baseline");
        assert_eq!(tier_for_capacity(cap), 3, "which clears tier 3");
        assert_eq!(MILESTONES[3].neurons, 357_000_000);

        //   tierRequiredMB = 357M * 21 / 0.5 / 1MiB + 2048 ~= 16,348 MB
        let req = tier_required_mb(357_000_000, 0.5, 2048);
        assert!((16_300..=16_400).contains(&req), "documented ~16,348 MB, got {req}");
    }

    #[test]
    fn capacity_saturates_at_zero_rather_than_going_negative() {
        // A 1 GB card: 1024*0.75 = 768, minus the 2048 reserve, is negative.
        assert_eq!(donor_capacity_neurons(1_024, 20), 0,
            "a negative capacity would compare oddly against the ladder");
        assert_eq!(donor_capacity_neurons(0, 20), 0);
        assert_eq!(donor_capacity_neurons(16_384, 0), 0, "and a zero cost must not divide by zero");
    }

    #[test]
    fn a_big_card_reaches_the_upper_rungs_that_tiertop_added() {
        // The 45,488 MB card from the TIERTOP note qualifies ~1.68B neurons —
        // and before the ladder grew, tier 3 was the last rung, so no donor
        // however large could move the brain.
        let cap = donor_capacity_neurons(45_488, 20);
        assert!(cap > 1_600_000_000, "got {cap}");
        assert_eq!(tier_for_capacity(cap), 4, "tier 4 = 900M, tier 5 needs 2.4B");
    }

    #[test]
    fn tier_zero_is_the_floor_not_an_error() {
        assert_eq!(tier_for_capacity(0), 0);
        assert_eq!(tier_for_capacity(1), 0);
        assert_eq!(tier_for_capacity(5_999_999), 0, "below tier 0 still reports tier 0");
    }

    #[test]
    fn main_fraction_is_floored_so_the_budget_cannot_run_away() {
        // language_cortex 0.50 of a 1.0 sum -> 0.50
        assert!((main_fraction(0.50, 1.0) - 0.50).abs() < 1e-12);
        // A pathological config where the cortex is everything must not divide
        // by ~0 and demand an infinite budget.
        assert!((main_fraction(1.0, 1.0) - 0.05).abs() < 1e-12);
        assert!((main_fraction(0.999, 1.0) - 0.05).abs() < 1e-12);
        // A zero weight-sum must not divide by zero.
        assert!(main_fraction(0.0, 0.0) > 0.0);
    }

    #[test]
    fn required_mb_is_zero_for_no_target_rather_than_just_the_os_reserve() {
        assert_eq!(tier_required_mb(0, 0.5, 2048), 0,
            "no target means no requirement — returning the reserve would look like a real demand");
    }

    // ── the budget ladder ────────────────────────────────────────────────────
    fn inputs() -> BudgetInputs {
        BudgetInputs {
            env_budget_mb: 0, tier_required_mb: 0, safe_mb: 18_519,
            host_ram_mb: 31_831, deploy_donor_mode: true, donor_fit_default_mb: 4096,
        }
    }

    #[test]
    fn the_env_override_wins_and_is_still_capped_by_the_machine() {
        let mut i = inputs();
        i.env_budget_mb = 8_000;
        i.tier_required_mb = 16_348;
        let b = choose_budget(i);
        assert_eq!(b.basis, BudgetBasis::EnvOverride, "the override must beat a confirmed tier");
        assert_eq!(b.budget_mb, 8_000);

        // An absurd override is capped, not honoured.
        i.env_budget_mb = 999_999;
        assert_eq!(choose_budget(i).budget_mb, 31_831 - 13_312,
            "an override is permission to ask, not to exceed the machine");
    }

    #[test]
    fn a_confirmed_tier_beats_donor_fit_which_is_why_the_pin_file_is_dead_code() {
        // ⛔ MEMORY-MAP records `10-pin-brain-size.conf` as DEAD CODE precisely
        // because this arm is tested first. Reordering would resurrect its
        // effect — a resize, which is a wipe.
        let mut i = inputs();
        i.tier_required_mb = 16_348;
        i.donor_fit_default_mb = 4096;
        let b = choose_budget(i);
        assert!(matches!(b.basis, BudgetBasis::TierTarget { .. }),
            "donor-fit must NOT win over a confirmed tier");
        assert_eq!(b.budget_mb, 16_348, "and it fits the box here");
    }

    #[test]
    fn a_tier_the_box_cannot_hold_is_capped_and_says_so() {
        let mut i = inputs();
        i.tier_required_mb = 62_000;     // the naive 178M-neuron figure territory
        let b = choose_budget(i);
        match b.basis {
            BudgetBasis::TierTarget { required_mb, fits_box } => {
                assert_eq!(required_mb, 62_000, "the ASK is reported even though it was capped");
                assert!(!fits_box, "and the fact it did not fit must be visible");
            }
            other => panic!("expected TierTarget, got {other:?}"),
        }
        assert_eq!(b.budget_mb, 18_519, "capped at the host-safe max");
    }

    #[test]
    fn donor_fit_applies_only_when_there_is_no_tier_yet() {
        let i = inputs();  // donor mode, no tier
        let b = choose_budget(i);
        assert_eq!(b.basis, BudgetBasis::DonorFit);
        assert_eq!(b.budget_mb, 4096);
    }

    #[test]
    fn a_local_run_with_no_tier_and_no_donor_mode_takes_the_host_safe_max() {
        let mut i = inputs();
        i.deploy_donor_mode = false;
        let b = choose_budget(i);
        assert_eq!(b.basis, BudgetBasis::HostSafeMax);
        assert_eq!(b.budget_mb, 18_519);
    }

    #[test]
    fn every_arm_floors_at_1024mb_so_a_tiny_box_still_boots_something() {
        let mut i = inputs();
        i.safe_mb = 10;
        i.tier_required_mb = 16_348;
        assert_eq!(choose_budget(i).budget_mb, 1024);
        i.tier_required_mb = 0;
        assert_eq!(choose_budget(i).budget_mb, 1024, "donor-fit floors too");
    }

    // ── self-seeding ─────────────────────────────────────────────────────────
    #[test]
    fn self_seeding_supersedes_a_lower_persisted_tier_and_declines_otherwise() {
        // The documented default: baseline 16384 / 20 B per neuron -> tier 3.
        assert_eq!(self_seed_tier(16_384, 20, 0), Some((3, 357_000_000)));
        assert_eq!(self_seed_tier(16_384, 20, 150_000_000), Some((3, 357_000_000)));
        // Already at or above: no write, so community-tier.json is not churned.
        assert_eq!(self_seed_tier(16_384, 20, 357_000_000), None);
        assert_eq!(self_seed_tier(16_384, 20, 900_000_000), None,
            "self-seeding must never DOWNGRADE a confirmed tier");
    }

    #[test]
    fn the_landmine_is_reproduced_not_quietly_fixed() {
        // ⚠ §7: self-seeding sizes from an ASSUMED donor, not a connected one.
        // With zero donors attached it still asks for tier 3. That is what the
        // running brain does, and a port that silently changed it would be a
        // second authority — the exact thing this crate exists to prevent.
        let seeded = self_seed_tier(16_384, 20, 0);
        assert_eq!(seeded, Some((3, 357_000_000)),
            "sized from an assumption, with no donor in evidence — kept deliberately");
    }

    #[test]
    fn the_operator_clamps_match_the_loader() {
        assert_eq!(clamp_baseline_mb(0.0), 1024);
        assert_eq!(clamp_baseline_mb(999_999.0), 262_144);
        assert_eq!(clamp_baseline_mb(16_384.0), 16_384);
        assert_eq!(clamp_bytes_per_neuron(1.0), 8);
        assert_eq!(clamp_bytes_per_neuron(99_999.0), 1024);
        assert_eq!(clamp_bytes_per_neuron(20.0), 20);
    }
}
