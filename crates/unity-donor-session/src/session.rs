//! Donor sessions: who is PRIMARY, who holds which matrices, and what happens
//! when they leave.
//!
//! §5.2 — this crate owns *"WebSocket sessions, upload/readback lifecycle,
//! `_gpuBound` state"* and must **not** own *"HTTP routing, checkpoint policy"*.
//! So there are no sockets and no save decisions here: this is the state machine
//! those things drive.
//!
//! ## ⛔ THE PARTIAL-REPLICA TRAP, WHICH LOOKS EXACTLY LIKE HEALTH
//!
//! `donor-app/README.md` states it plainly: *"if your card cannot hold the FULL
//! running brain it will never be PRIMARY, and the canonical weight upload only
//! ever targets the PRIMARY — so it joins as a partial replica and **receives no
//! matrices at all, while still showing healthy cluster coverage and a real
//! Gn/s rate**."*
//!
//! ⭐ That is the whole reason eligibility is a first-class verdict here rather
//! than a boolean buried in a join handler: a donor that is doing nothing while
//! reporting a real compute rate is indistinguishable from a working one unless
//! something says so out loud. [`Registry::join`] returns *why*.
//!
//! ⚠ **The gate is `max_storage_buffer_binding_size`, not VRAM.** That is a
//! driver/API limit, and plenty of large cards report a small one — 32 GB you
//! cannot bind in one buffer buys nothing. The donor advertises the per-binding
//! cap for exactly this reason.
//!
//! ## ⭐ Losing the last donor is not a failure path
//!
//! The operator's rule (2026-09-05): **the walk stays at the current weights and
//! any donor that arrives runs from the last save before they all dropped.** So
//! [`Registry::leave`] never invalidates weights — it reports that compute
//! stopped. Teaching halts because `requireGpuSubstrate` means a proxied brain
//! *requires* its proxy; the weights survive it untouched.

use std::collections::{BTreeMap, BTreeSet};

/// Why a donor is or is not eligible to be PRIMARY.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Eligibility {
    /// Can hold the full brain in one binding.
    Primary,
    /// ⛔ Joins and computes, but **receives no matrices** — the canonical
    /// upload only ever targets the PRIMARY. Carries the shortfall so the log
    /// can print `N GB SHORT of PRIMARY` instead of a healthy-looking row.
    PartialReplica { short_mb: u64 },
}

#[derive(Debug, Clone)]
pub struct Donor {
    pub id: String,
    /// `max_storage_buffer_binding_size` in MB — **the number the brain gates
    /// on**, not VRAM.
    pub binding_mb: u64,
    pub version: String,
    pub eligibility: Eligibility,
    /// `_gpuBound` — matrices resident on this donor.
    pub bound: BTreeSet<String>,
}

#[derive(Debug, Default)]
pub struct Registry {
    donors: BTreeMap<String, Donor>,
    primary: Option<String>,
    /// What a donor must be able to bind to hold the full brain.
    pub required_mb: u64,
}

/// What changed when a donor left.
#[derive(Debug, PartialEq, Eq)]
pub enum Departure {
    /// Someone left; a primary is still attached.
    StillServed,
    /// The PRIMARY left and another eligible donor was promoted.
    PrimaryPromoted { new_primary: String },
    /// ⭐ The last donor left. **Teaching stops; the weights do not change.**
    LastDonorGone,
    Unknown,
}

impl Registry {
    pub fn new(required_mb: u64) -> Self {
        Registry { donors: BTreeMap::new(), primary: None, required_mb }
    }

    pub fn count(&self) -> usize { self.donors.len() }
    pub fn primary(&self) -> Option<&str> { self.primary.as_deref() }
    pub fn get(&self, id: &str) -> Option<&Donor> { self.donors.get(id) }

    fn eligibility_for(&self, binding_mb: u64) -> Eligibility {
        if binding_mb >= self.required_mb {
            Eligibility::Primary
        } else {
            Eligibility::PartialReplica { short_mb: self.required_mb - binding_mb }
        }
    }

    /// Register a donor. Returns its eligibility so the caller can SAY so.
    pub fn join(&mut self, id: impl Into<String>, binding_mb: u64, version: impl Into<String>) -> Eligibility {
        let id = id.into();
        let elig = self.eligibility_for(binding_mb);
        self.donors.insert(id.clone(), Donor {
            id: id.clone(), binding_mb, version: version.into(),
            eligibility: elig.clone(), bound: BTreeSet::new(),
        });
        // First eligible donor becomes PRIMARY. ⚠ An ineligible one never does,
        // no matter how long it waits or how fast it computes.
        if self.primary.is_none() && elig == Eligibility::Primary {
            self.primary = Some(id);
        }
        elig
    }

    /// Record that a matrix is now resident on a donor (`_gpuBound`).
    ///
    /// ⛔ Refuses for a non-primary: the canonical upload only ever targets the
    /// PRIMARY, so a partial replica claiming a bound matrix is a bookkeeping
    /// lie that would make the dashboard report residency nobody has.
    pub fn mark_bound(&mut self, id: &str, matrix: impl Into<String>) -> Result<(), String> {
        if self.primary.as_deref() != Some(id) {
            return Err(format!(
                "'{id}' is not the PRIMARY, and the canonical upload only ever targets the PRIMARY — \
                 recording a bound matrix here would report residency that does not exist"));
        }
        self.donors.get_mut(id)
            .ok_or_else(|| format!("unknown donor '{id}'"))?
            .bound.insert(matrix.into());
        Ok(())
    }

    /// Matrices resident on the PRIMARY. ⚠ The denominator that made `0/17 mx`
    /// readable — a count with no total is not an instrument.
    pub fn primary_bound(&self) -> BTreeSet<String> {
        self.primary.as_deref()
            .and_then(|p| self.donors.get(p))
            .map(|d| d.bound.clone())
            .unwrap_or_default()
    }

    /// A donor disconnected.
    pub fn leave(&mut self, id: &str) -> Departure {
        if self.donors.remove(id).is_none() { return Departure::Unknown; }
        if self.primary.as_deref() == Some(id) {
            self.primary = None;
            // Promote the first still-eligible donor.
            if let Some(next) = self.donors.values()
                .find(|d| d.eligibility == Eligibility::Primary)
                .map(|d| d.id.clone())
            {
                self.primary = Some(next.clone());
                // ⚠ The new PRIMARY holds NOTHING yet. Bound state belongs to the
                // donor that was uploaded to, and promotion does not transfer it —
                // claiming otherwise is how a dashboard shows residency nobody has.
                return Departure::PrimaryPromoted { new_primary: next };
            }
        }
        if self.donors.is_empty() { Departure::LastDonorGone } else { Departure::StillServed }
    }

    /// Does this donor speak an opcode introduced at `min`?
    ///
    /// ⚠ Version-gated because an older donor **silently ignores** an unknown
    /// opcode — the request then rides its timeout and *"burns 10 minutes
    /// proving nothing"*. A capability check is cheaper than a timeout.
    pub fn supports(&self, id: &str, min: &str) -> bool {
        self.donors.get(id).is_some_and(|d| version_at_least(&d.version, min))
    }
}

/// Semver-ish compare over dot-separated numbers. ⚠ Deliberately numeric:
/// string comparison puts `0.3.9` above `0.3.36`, which is exactly the kind of
/// gate that fails open on the newest donors.
pub fn version_at_least(have: &str, min: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.').map(|p| p.trim_matches(|c: char| !c.is_ascii_digit()).parse().unwrap_or(0)).collect()
    };
    let (h, m) = (parse(have), parse(min));
    for i in 0..h.len().max(m.len()) {
        let a = h.get(i).copied().unwrap_or(0);
        let b = m.get(i).copied().unwrap_or(0);
        if a != b { return a > b; }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reg() -> Registry { Registry::new(16_384) }

    #[test]
    fn a_card_that_can_hold_the_brain_becomes_primary() {
        let mut r = reg();
        assert_eq!(r.join("a", 32_768, "0.3.36"), Eligibility::Primary);
        assert_eq!(r.primary(), Some("a"));
    }

    #[test]
    fn a_small_card_joins_and_computes_but_is_never_primary() {
        // ⛔ THE TRAP: it shows healthy coverage and a real Gn/s rate while
        // receiving no matrices at all.
        let mut r = reg();
        let e = r.join("small", 8_192, "0.3.36");
        assert_eq!(e, Eligibility::PartialReplica { short_mb: 8_192 },
            "the shortfall must be carried so the log can print 'N GB SHORT of PRIMARY'");
        assert_eq!(r.primary(), None, "an ineligible donor must never be promoted, however long it waits");
        assert_eq!(r.count(), 1, "but it IS attached — it just receives nothing");
    }

    #[test]
    fn the_gate_is_the_binding_cap_not_vram() {
        // A 32 GB card whose driver caps a single binding at 4 GB is NOT primary
        // eligible. This is the whole reason the donor advertises the binding cap.
        let mut r = Registry::new(16_384);
        assert!(matches!(r.join("big-card-small-binding", 4_096, "0.3.36"),
            Eligibility::PartialReplica { .. }));
    }

    #[test]
    fn exactly_meeting_the_requirement_is_eligible() {
        let mut r = reg();
        assert_eq!(r.join("exact", 16_384, "0.3.36"), Eligibility::Primary,
            ">= not >; a card that exactly fits must not be rejected");
    }

    #[test]
    fn bound_state_is_refused_for_a_non_primary() {
        let mut r = reg();
        r.join("p", 32_768, "0.3.36");
        r.join("small", 1_024, "0.3.36");
        assert!(r.mark_bound("p", "cortex.synapses").is_ok());
        let e = r.mark_bound("small", "cortex.synapses").unwrap_err();
        assert!(e.contains("only ever targets the PRIMARY"),
            "recording residency on a replica is a bookkeeping lie: {e}");
    }

    #[test]
    fn losing_the_primary_promotes_an_eligible_donor_and_does_not_forge_its_residency() {
        let mut r = reg();
        r.join("p", 32_768, "0.3.36");
        r.join("q", 24_576, "0.3.36");
        r.mark_bound("p", "cortex.synapses").unwrap();
        assert_eq!(r.primary_bound().len(), 1);

        assert_eq!(r.leave("p"), Departure::PrimaryPromoted { new_primary: "q".into() });
        assert_eq!(r.primary(), Some("q"));
        assert!(r.primary_bound().is_empty(),
            "the new PRIMARY holds NOTHING until it is uploaded to — promotion must not inherit residency");
    }

    #[test]
    fn losing_the_primary_with_only_ineligible_donors_left_leaves_no_primary() {
        let mut r = reg();
        r.join("p", 32_768, "0.3.36");
        r.join("small", 512, "0.3.36");
        assert_eq!(r.leave("p"), Departure::StillServed);
        assert_eq!(r.primary(), None,
            "a partial replica must not be promoted just because it is the only one left");
    }

    #[test]
    fn the_last_donor_leaving_is_reported_as_its_own_thing() {
        // ⭐ Not a failure. The walk stays at the current weights and any donor
        // that arrives runs from the last save.
        let mut r = reg();
        r.join("p", 32_768, "0.3.36");
        assert_eq!(r.leave("p"), Departure::LastDonorGone);
        assert_eq!(r.count(), 0);
        assert_eq!(r.primary(), None);
    }

    #[test]
    fn an_unknown_donor_leaving_is_not_mistaken_for_the_last_one() {
        let mut r = reg();
        r.join("p", 32_768, "0.3.36");
        assert_eq!(r.leave("ghost"), Departure::Unknown,
            "a spurious disconnect must not report the fleet as empty");
        assert_eq!(r.primary(), Some("p"));
    }

    #[test]
    fn version_gating_is_numeric_not_lexicographic() {
        // ⛔ String compare puts "0.3.9" above "0.3.36" — a gate that fails open
        // on exactly the newest donors.
        assert!(version_at_least("0.3.36", "0.3.36"));
        assert!(version_at_least("0.3.37", "0.3.36"));
        assert!(!version_at_least("0.3.9", "0.3.36"));
        assert!(!version_at_least("0.3.35", "0.3.36"));
        assert!(version_at_least("0.4.0", "0.3.36"));
        assert!(version_at_least("1.0", "0.3.36"));
    }

    #[test]
    fn supports_gates_the_readback_opcode_per_donor() {
        // An older donor silently ignores the opcode and the request burns its
        // full timeout proving nothing.
        let mut r = reg();
        r.join("new", 32_768, "0.3.36");
        r.join("old", 32_768, "0.3.20");
        assert!(r.supports("new", "0.3.36"));
        assert!(!r.supports("old", "0.3.36"));
        assert!(!r.supports("absent", "0.3.36"), "an unknown donor supports nothing");
    }
}
