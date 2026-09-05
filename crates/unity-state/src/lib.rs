//! # unity-state — flags, markers, and the boot decision they drive
//!
//! Migration phase **B4**. §5.2: this crate owns *"sqlite, markers, boot-reason
//! history, flag files"* and must **not** own *"business logic about **when** to
//! wipe"*.
//!
//! ⭐ That boundary is subtle and worth stating: [`decide_boot`] computes what
//! the flags **mean**, not what policy should be. It is a pure function of the
//! files on disk — and the reason it is pure is that this is the decision that
//! destroys a multi-week walk when it is wrong.
//!
//! ## ⛔⛔ `.force-fresh` IS THE MOST DANGEROUS FILE ON THE BOX
//!
//! `RUST-MIGRATION.md` §7 lists it first among the landmines, and every word
//! matters:
//!
//! > *"`.force-fresh` beats everything. The `/update` handler writes it BEFORE
//! > spawning the deploy. If it exists, the next restart from **any** cause
//! > wipes weights, and `DREAM_KEEP_STATE=1` does not protect you."*
//!
//! ⚠ **"Any cause" includes causes that have nothing to do with a deploy** — an
//! OOM kill, a power cut, a `systemctl restart` typed by hand. A press that
//! armed the flag and then aborted leaves a **trap** that fires on the next
//! reboot, whenever that happens to be.
//!
//! ⚠ And it is **consumed on read**: the flag is deleted as it is honoured, so
//! the wipe happens exactly once. An unreadable flag **still wipes** — the file
//! existing is the signal, not its contents.

use std::path::{Path, PathBuf};

/// What this boot is going to do to the trained state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BootMode {
    /// ⛔ Wipe. `.force-fresh` was armed, and it beats everything.
    ForceFresh { via: String },
    /// Resume the saved weights.
    Resume { reason: &'static str },
    /// Normal `start.*` behaviour — wipe, because nothing asked to keep.
    /// ⚠ **The DEFAULT is a wipe.** `DREAM_KEEP_STATE` unset means WIPE; only
    /// `Savestart` resumes. Getting this backwards costs the whole run.
    DefaultWipe,
}

/// The resume marker a clean shutdown leaves behind.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ResumeMarker {
    pub clean_shutdown: bool,
    pub format_version: Option<u32>,
    pub total_neurons: Option<u64>,
}

/// Inputs to the boot decision — all of them, so the decision is testable
/// without a filesystem.
#[derive(Debug, Clone)]
pub struct BootInputs {
    /// `.force-fresh` was present. ⚠ Presence IS the signal.
    pub force_fresh: bool,
    /// Its `via` field, when the JSON parsed. `None` = armed but unattributable.
    pub force_fresh_via: Option<String>,
    /// `DREAM_KEEP_STATE == "1"`.
    pub keep_state_env: bool,
    /// The consumed resume marker, if there was one.
    pub marker: Option<ResumeMarker>,
    /// The brain's current geometry, to check the marker against.
    pub current_format_version: u32,
    pub current_total_neurons: u64,
}

/// The boot decision.
///
/// ⛔ **ORDER IS THE BEHAVIOUR.** `.force-fresh` is tested FIRST and
/// unconditionally — before `DREAM_KEEP_STATE`, before the marker. Any other
/// order would let a Savestart quietly survive a flag that was armed to wipe,
/// which is the opposite of the guarantee the dashboard's Fresh Walk button
/// makes.
pub fn decide_boot(i: &BootInputs) -> BootMode {
    if i.force_fresh {
        return BootMode::ForceFresh {
            via: i.force_fresh_via.clone()
                .unwrap_or_else(|| "unknown writer (flag carried no via field)".into()),
        };
    }
    // Resume is requested by Savestart OR by a clean-shutdown marker.
    let keep_requested = i.keep_state_env
        || i.marker.as_ref().is_some_and(|m| m.clean_shutdown);
    if !keep_requested { return BootMode::DefaultWipe; }

    // ⚠ REQUESTED IS NOT GRANTED. A heavy update that changed the brain's SIZE
    // or weight FORMAT makes the saved weights unloadable, so a resume would
    // boot onto state that cannot be applied. Verify, then resume.
    if let Some(m) = &i.marker {
        if let Some(fv) = m.format_version {
            if fv != i.current_format_version {
                return BootMode::DefaultWipe;
            }
        }
        if let Some(n) = m.total_neurons {
            if n != i.current_total_neurons {
                return BootMode::DefaultWipe;
            }
        }
    }
    BootMode::Resume {
        reason: if i.keep_state_env { "DREAM_KEEP_STATE=1 (Savestart)" } else { "clean shutdown marker" },
    }
}

/// Filesystem access to the flags. Separated from [`decide_boot`] so the
/// decision can be tested exhaustively without touching a disk.
pub struct StateDir {
    root: PathBuf,
}

impl StateDir {
    pub fn new(root: impl Into<PathBuf>) -> Self { StateDir { root: root.into() } }

    pub fn force_fresh_path(&self) -> PathBuf { self.root.join(".force-fresh") }
    pub fn resume_marker_path(&self) -> PathBuf { self.root.join(".resume-marker.json") }

    /// Is a wipe armed right now? ⭐ A **read-only** check, so an operator can
    /// ask *"will the next restart wipe her?"* without triggering it — which is
    /// the question §7's landmine makes urgent and which had no answer before.
    pub fn force_fresh_armed(&self) -> bool { self.force_fresh_path().exists() }

    /// Consume `.force-fresh`: read its `via`, then delete it.
    ///
    /// ⚠ **Read before unlink, and an unreadable flag STILL WIPES.** The file
    /// existing is the signal; its contents only attribute it. A parse failure
    /// must not become "no wipe" — that would let a corrupted flag silently
    /// preserve state the operator asked to destroy.
    pub fn consume_force_fresh(&self) -> (bool, Option<String>) {
        let p = self.force_fresh_path();
        if !p.exists() { return (false, None); }
        let via = std::fs::read_to_string(&p).ok().and_then(|s| extract_via(&s));
        let _ = std::fs::remove_file(&p);
        (true, via)
    }

    /// Consume the resume marker — one resume per clean stop.
    pub fn consume_resume_marker(&self) -> Option<ResumeMarker> {
        let p = self.resume_marker_path();
        let txt = std::fs::read_to_string(&p).ok();
        // ⚠ Deleted even when unparseable: the marker is a one-shot, and leaving
        // a corrupt one behind would offer a resume on every subsequent boot.
        let _ = std::fs::remove_file(&p);
        let txt = txt?;
        Some(ResumeMarker {
            clean_shutdown: txt.contains("\"cleanShutdown\":true") || txt.contains("\"cleanShutdown\": true"),
            format_version: extract_num(&txt, "formatVersion").map(|v| v as u32),
            total_neurons: extract_num(&txt, "totalNeurons"),
        })
    }

    /// Arm a wipe. ⚠ `via` is mandatory here even though the reader tolerates
    /// its absence — an unattributed flag produced a boot record that *"named a
    /// button that was never pressed"*.
    pub fn arm_force_fresh(&self, via: &str) -> std::io::Result<()> {
        std::fs::write(self.force_fresh_path(), format!(r#"{{"via":"{}"}}"#, escape(via)))
    }

    /// Disarm. ⭐ The recovery path for an aborted press: a deploy that refuses
    /// at a gate MUST clear the flag it armed, or it leaves a trap that fires on
    /// the next restart from any cause.
    pub fn disarm_force_fresh(&self) -> bool {
        std::fs::remove_file(self.force_fresh_path()).is_ok()
    }
}

fn escape(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }

fn extract_via(json: &str) -> Option<String> {
    let i = json.find("\"via\"")? + 5;
    let rest = &json[i..];
    let q = rest.find('"')?;
    let rest = &rest[q + 1..];
    let e = rest.find('"')?;
    let v = &rest[..e];
    if v.is_empty() { None } else { Some(v.to_string()) }
}

fn extract_num(json: &str, key: &str) -> Option<u64> {
    let pat = format!("\"{key}\"");
    let i = json.find(&pat)? + pat.len();
    let rest = json[i..].trim_start().strip_prefix(':')?.trim_start();
    let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
    rest[..end].parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> BootInputs {
        BootInputs {
            force_fresh: false, force_fresh_via: None, keep_state_env: false,
            marker: None, current_format_version: 6, current_total_neurons: 411_216_550,
        }
    }

    // ── .force-fresh beats everything ────────────────────────────────────────
    #[test]
    fn force_fresh_beats_keep_state_and_a_clean_marker() {
        // ⛔ THE LANDMINE, as an assertion. "DREAM_KEEP_STATE=1 does not protect
        // you" — so a Savestart must NOT survive an armed flag.
        let mut i = base();
        i.force_fresh = true;
        i.force_fresh_via = Some("dashboard Update & Fresh Walk".into());
        i.keep_state_env = true;
        i.marker = Some(ResumeMarker { clean_shutdown: true, format_version: Some(6), total_neurons: Some(411_216_550) });
        assert_eq!(decide_boot(&i), BootMode::ForceFresh { via: "dashboard Update & Fresh Walk".into() },
            "an armed flag must wipe even with Savestart AND a clean marker");
    }

    #[test]
    fn an_unattributed_flag_still_wipes_and_says_it_is_unattributed() {
        let mut i = base();
        i.force_fresh = true;
        i.force_fresh_via = None;
        match decide_boot(&i) {
            BootMode::ForceFresh { via } => assert!(via.contains("unknown writer"),
                "the boot record must not name a button that was never pressed: {via}"),
            other => panic!("{other:?}"),
        }
    }

    // ── the default is a WIPE ────────────────────────────────────────────────
    #[test]
    fn nothing_requested_means_wipe_not_resume() {
        // ⚠ `DREAM_KEEP_STATE` unset = WIPE. start.* boots fresh; only Savestart
        // resumes. Getting this backwards costs the whole run.
        assert_eq!(decide_boot(&base()), BootMode::DefaultWipe);
    }

    #[test]
    fn savestart_resumes_and_a_clean_marker_resumes() {
        let mut i = base();
        i.keep_state_env = true;
        assert!(matches!(decide_boot(&i), BootMode::Resume { .. }));

        let mut i = base();
        i.marker = Some(ResumeMarker { clean_shutdown: true, ..Default::default() });
        assert!(matches!(decide_boot(&i), BootMode::Resume { .. }));
    }

    #[test]
    fn a_marker_that_is_not_a_clean_shutdown_does_not_resume() {
        let mut i = base();
        i.marker = Some(ResumeMarker { clean_shutdown: false, ..Default::default() });
        assert_eq!(decide_boot(&i), BootMode::DefaultWipe,
            "a marker from a HARD death is evidence of a crash, not permission to resume");
    }

    // ── requested is not granted ─────────────────────────────────────────────
    #[test]
    fn a_format_change_refuses_the_resume_even_when_asked_for() {
        // A heavy update that changed the weight FORMAT makes the saved weights
        // unloadable; resuming would boot onto state that cannot be applied.
        let mut i = base();
        i.keep_state_env = true;
        i.marker = Some(ResumeMarker { clean_shutdown: true, format_version: Some(5), total_neurons: None });
        assert_eq!(decide_boot(&i), BootMode::DefaultWipe);
    }

    #[test]
    fn a_neuron_count_change_refuses_the_resume() {
        let mut i = base();
        i.keep_state_env = true;
        i.marker = Some(ResumeMarker { clean_shutdown: true, format_version: Some(6), total_neurons: Some(306_458_816) });
        assert_eq!(decide_boot(&i), BootMode::DefaultWipe,
            "the neuron count is DERIVED at boot from free RAM — a mismatch means these weights do not fit this brain");
    }

    #[test]
    fn a_matching_marker_resumes() {
        let mut i = base();
        i.keep_state_env = true;
        i.marker = Some(ResumeMarker { clean_shutdown: true, format_version: Some(6), total_neurons: Some(411_216_550) });
        assert!(matches!(decide_boot(&i), BootMode::Resume { .. }));
    }

    // ── the files ────────────────────────────────────────────────────────────
    fn dir(name: &str) -> StateDir {
        let mut p = std::env::temp_dir();
        p.push(format!("unity-state-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        StateDir::new(p)
    }

    #[test]
    fn arming_is_visible_without_triggering_it() {
        // ⭐ The read-only question §7's landmine makes urgent: "will the next
        // restart wipe her?" — previously unanswerable without a boot.
        let d = dir("armed");
        assert!(!d.force_fresh_armed());
        d.arm_force_fresh("dashboard Reset Brain").unwrap();
        assert!(d.force_fresh_armed());
        assert!(d.force_fresh_armed(), "asking twice must not consume it");
    }

    #[test]
    fn consuming_reads_the_via_then_deletes_the_flag() {
        let d = dir("consume");
        d.arm_force_fresh("dashboard Update & Fresh Walk").unwrap();
        let (armed, via) = d.consume_force_fresh();
        assert!(armed);
        assert_eq!(via.as_deref(), Some("dashboard Update & Fresh Walk"));
        assert!(!d.force_fresh_armed(), "the wipe happens exactly once");
        assert_eq!(d.consume_force_fresh(), (false, None));
    }

    #[test]
    fn an_unreadable_flag_STILL_WIPES() {
        // ⛔ The file existing is the signal; its contents only attribute it. A
        // parse failure must never become "no wipe" — that would silently
        // preserve state the operator asked to destroy.
        let d = dir("malformed");
        std::fs::write(d.force_fresh_path(), b"{not json at all").unwrap();
        let (armed, via) = d.consume_force_fresh();
        assert!(armed, "a malformed flag must still wipe");
        assert_eq!(via, None, "and be honest that it cannot be attributed");
        assert!(!d.force_fresh_armed());
    }

    #[test]
    fn an_empty_flag_file_still_wipes() {
        let d = dir("empty");
        std::fs::write(d.force_fresh_path(), b"").unwrap();
        assert_eq!(d.consume_force_fresh(), (true, None));
    }

    #[test]
    fn disarming_is_the_recovery_path_for_an_aborted_press() {
        // ⭐ A deploy that refuses at a gate MUST clear the flag it armed, or it
        // leaves a trap that fires on the next restart from ANY cause.
        let d = dir("disarm");
        d.arm_force_fresh("update").unwrap();
        assert!(d.disarm_force_fresh());
        assert!(!d.force_fresh_armed());
    }

    #[test]
    fn the_resume_marker_is_one_shot_even_when_corrupt() {
        let d = dir("marker");
        std::fs::write(d.resume_marker_path(),
            r#"{"cleanShutdown":true,"formatVersion":6,"totalNeurons":411216550}"#).unwrap();
        let m = d.consume_resume_marker().unwrap();
        assert!(m.clean_shutdown);
        assert_eq!(m.format_version, Some(6));
        assert_eq!(m.total_neurons, Some(411_216_550));
        assert!(d.consume_resume_marker().is_none(), "one resume per clean stop");

        // A corrupt marker is consumed too — otherwise it would offer a resume
        // on every subsequent boot.
        std::fs::write(d.resume_marker_path(), b"garbage").unwrap();
        let m = d.consume_resume_marker().unwrap();
        assert!(!m.clean_shutdown, "unparseable must not read as a clean shutdown");
        assert!(d.consume_resume_marker().is_none(), "and it must be gone");
    }

    #[test]
    fn a_via_with_quotes_survives_the_round_trip() {
        let d = dir("escape");
        d.arm_force_fresh(r#"operator said "do it""#).unwrap();
        let (_, via) = d.consume_force_fresh();
        assert!(via.is_some(), "a quoted via must not corrupt the flag JSON");
    }
}
