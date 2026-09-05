//! Launch the deploy in **its own cgroup**, so it spends its own memory budget
//! and not the brain's.
//!
//! ## The root cause this replaces
//!
//! `spawn(..., { detached: true })` starts a new **session**, not a new
//! **cgroup**. The self-update child stayed inside `unity-brain.service` and
//! shared her `MemoryHigh=20G`, so every heavy thing a deploy did was charged to
//! the brain and the kernel throttled the whole cgroup, node included.
//!
//! ⭐ It is the single root cause of **three** incidents that were each patched
//! separately inside the script: the wedged `git lfs pull` (2.07 TB read, 0
//! written, event loop 2% serviced), the fields rsync pulling 12.4 GB of page
//! cache into the cgroup, and the ~12 GB tmpfs staging. **Same bug three times —
//! work that is not the brain, spending the brain's budget.**
//!
//! ⚠ It is also a **precondition for the weight mmap** (migration phase B2):
//! once those pages are file-backed, an unbounded rsync in the same cgroup would
//! evict her weights through page-cache pressure alone — the same failure with a
//! new mechanism.
//!
//! ## ⛔ THREE TRAPS, ALL FOUND BY RUNNING IT. Do not "simplify" any of them.
//!
//! **1. `--user` IS MANDATORY.** A bare `--scope` targets the **system** manager,
//!    so a non-root caller hits polkit — six probe runs produced six password
//!    prompts on a dev machine. From the box it is far worse: `User=unity`,
//!    `NoNewPrivileges=true`, spawned from an HTTP handler with **no terminal**,
//!    so the prompt asks nobody and the Update button hangs or no-ops.
//!    `--no-ask-password` is a permanent interlock: if a future edit ever lands
//!    on a prompting path it must fail fast and fall back. **NEVER remove it.**
//!
//! **2. INVALID PROPERTIES SILENTLY DEPLOY NOTHING.** A first draft passed
//!    `IOSchedulingClass=idle` (that is `ionice`'s syscall interface, **not** a
//!    unit property — the cgroup-v2 spelling is `IOWeight`) and
//!    `MemoryAccounting=true` (implicit under v2, *"Access denied"* on a
//!    transient scope). systemd rejects the invocation, the unit never starts,
//!    and the press printed its cheerful *"deploy spawned"* line while deploying
//!    **absolutely nothing.** Probe before adding any property:
//!    `systemd-run --user --scope --collect --quiet --unit=probe-$RANDOM --property='X=y' true`
//!
//! **3. TWO FAILURE MODES NEED TWO HANDLERS.** A missing binary fails one way
//!    (ENOENT). A **present-but-refusing** `systemd-run` spawns fine, never
//!    errors, and **exits non-zero having started nothing.** Only the first
//!    handler existed at first, which is exactly how trap 2 got through.

use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

/// The properties we pass. Kept as data so the set is greppable and testable,
/// and so a bad addition is caught by a test rather than by a silent no-op deploy.
pub fn properties(mem_max: &str) -> Vec<String> {
    vec![
        format!("MemoryMax={mem_max}"),
        // cgroup-v2 spelling. `IOSchedulingClass` is ionice's, not systemd's.
        "IOWeight=10".to_string(),
        "CPUWeight=10".to_string(),
    ]
}

/// Build the `systemd-run` argv that wraps `inner`.
///
/// ⚠ Returned rather than executed so the exact argument list is unit-testable.
/// The traps above are all *argument* mistakes, and an argument mistake that can
/// only be caught by deploying is one that ships.
pub fn wrap(unit_name: &str, mem_max: &str, inner: &[OsString]) -> Vec<OsString> {
    let mut v: Vec<OsString> = vec![
        "--user".into(),
        "--scope".into(),
        "--collect".into(),
        "--quiet".into(),
        "--no-ask-password".into(),
        OsString::from(format!("--unit={unit_name}")),
    ];
    for p in properties(mem_max) {
        v.push(OsString::from(format!("--property={p}")));
    }
    v.extend(inner.iter().cloned());
    v
}

/// Is `systemd-run` even present? A missing binary is a normal condition on a
/// dev box and must degrade, not fail.
pub fn available() -> bool {
    Command::new("systemd-run")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// How the launch went, so the caller can log the honest thing.
#[derive(Debug, PartialEq, Eq)]
pub enum Launch {
    /// Ran inside its own scope, as intended.
    Scoped,
    /// `systemd-run` was absent or refused; ran the payload directly instead.
    /// ⚠ The deploy still happens — it just shares the brain's budget again,
    /// which is a degradation worth a WARN and never worth aborting a press for.
    FellBack(String),
}

/// Run `inner`, preferring its own cgroup scope.
pub fn run(unit_name: &str, mem_max: &str, inner: &[OsString], cwd: Option<&Path>,
           env: &[(String, String)]) -> std::io::Result<(Launch, std::process::ExitStatus)> {
    if available() {
        let args = wrap(unit_name, mem_max, inner);
        let mut c = Command::new("systemd-run");
        c.args(&args);
        if let Some(d) = cwd { c.current_dir(d); }
        for (k, v) in env { c.env(k, v); }
        match c.status() {
            // ⛔ TRAP 3: a REFUSING systemd-run spawns fine and exits non-zero
            // having started nothing. Success here is not "it ran", it is
            // "it ran AND systemd accepted the invocation".
            Ok(st) if st.success() => return Ok((Launch::Scoped, st)),
            Ok(st) => {
                let why = format!("systemd-run exited {} — it started nothing (a rejected property does this)", st);
                return run_direct(inner, cwd, env).map(|s| (Launch::FellBack(why), s));
            }
            Err(e) => {
                let why = format!("systemd-run could not be executed: {e}");
                return run_direct(inner, cwd, env).map(|s| (Launch::FellBack(why), s));
            }
        }
    }
    run_direct(inner, cwd, env).map(|s| (Launch::FellBack("systemd-run not present on this host".into()), s))
}

fn run_direct(inner: &[OsString], cwd: Option<&Path>, env: &[(String, String)]) -> std::io::Result<std::process::ExitStatus> {
    let (head, rest) = inner.split_first().expect("inner argv must not be empty");
    let mut c = Command::new(head);
    c.args(rest);
    if let Some(d) = cwd { c.current_dir(d); }
    for (k, v) in env { c.env(k, v); }
    c.status()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(v: &[OsString]) -> Vec<String> {
        v.iter().map(|s| s.to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn user_scope_is_mandatory_a_bare_scope_prompts_for_a_password() {
        let a = argv(&wrap("u", "2G", &["true".into()]));
        assert!(a.contains(&"--user".to_string()),
            "a bare --scope targets the SYSTEM manager and hits polkit — from an HTTP handler the prompt asks nobody");
        assert!(a.contains(&"--scope".to_string()));
    }

    #[test]
    fn no_ask_password_is_a_permanent_interlock() {
        let a = argv(&wrap("u", "2G", &["true".into()]));
        assert!(a.contains(&"--no-ask-password".to_string()),
            "if a future edit lands on a prompting path it MUST fail fast rather than hang the Update button");
    }

    #[test]
    fn uses_the_cgroup_v2_spelling_and_never_ionices_syscall_name() {
        let props = properties("2G");
        assert!(props.iter().any(|p| p.starts_with("IOWeight=")),
            "cgroup-v2 spelling");
        assert!(!props.iter().any(|p| p.contains("IOSchedulingClass")),
            "IOSchedulingClass is ionice's interface, not a unit property — systemd rejects it and the deploy silently does nothing");
        assert!(!props.iter().any(|p| p.contains("MemoryAccounting")),
            "implicit under cgroup v2 and 'Access denied' on a transient scope — same silent-no-op failure");
    }

    #[test]
    fn carries_the_memory_bound_that_is_the_whole_point() {
        let a = argv(&wrap("u", "2G", &["true".into()]));
        assert!(a.iter().any(|s| s == "--property=MemoryMax=2G"),
            "without its own MemoryMax the deploy spends the brain's budget — the root cause of three incidents");
    }

    #[test]
    fn the_payload_comes_last_and_intact() {
        let inner: Vec<OsString> = vec!["bash".into(), "/opt/x/self-update.sh".into(), "--keep".into()];
        let a = argv(&wrap("unit-1", "4G", &inner));
        let tail = &a[a.len() - 3..];
        assert_eq!(tail, &["bash".to_string(), "/opt/x/self-update.sh".to_string(), "--keep".to_string()],
            "systemd-run takes its own flags first; the payload must survive unchanged");
    }

    #[test]
    fn the_unit_is_named_so_a_running_deploy_can_be_found() {
        let a = argv(&wrap("unity-brain-selfupdate-123", "2G", &["true".into()]));
        assert!(a.iter().any(|s| s == "--unit=unity-brain-selfupdate-123"));
        assert!(a.contains(&"--collect".to_string()), "--collect so a finished scope does not linger");
    }

    #[test]
    fn falling_back_still_deploys_and_says_why() {
        // A dev box with no systemd must still be able to run a deploy.
        let inner: Vec<OsString> = if cfg!(windows) {
            vec!["cmd".into(), "/C".into(), "exit 0".into()]
        } else {
            vec!["true".into()]
        };
        let (how, st) = run("probe", "2G", &inner, None, &[]).expect("must not error out");
        assert!(st.success(), "the payload has to run either way — a missing systemd-run is not a failed deploy");
        if !available() {
            match how {
                Launch::FellBack(w) => assert!(w.contains("not present"), "and it must SAY it degraded: {w}"),
                Launch::Scoped => panic!("claimed a scope on a host with no systemd-run"),
            }
        }
    }
}
