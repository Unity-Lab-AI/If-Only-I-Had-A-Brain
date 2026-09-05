//! Where the deploy stages its ~12 GB, and why it must not be `/tmp`.
//!
//! ## The measured failure this module exists to prevent
//!
//! `unity-brain.service` sets `PrivateTmp=true`, which makes the service's
//! `/tmp` a namespaced **tmpfs — which is RAM**. Measured on the box: **11.70
//! GiB of tmpfs**, effectively all of it one staged clone, with `/tmp` 77% full.
//! One `mktemp -d` was the largest memory consumer on a 31 GiB machine — larger
//! than the brain herself (8.80 GiB PSS).
//!
//! ⭐ It also explained the reading that started the hunt: a cgroup is **charged
//! for its tmpfs pages**, so `MemoryCurrent` read 20.4 GiB against node's 8.8 GiB
//! RSS (8.8 + ~11.6). That sat exactly on `MemoryHigh=20G`, so the kernel
//! reclaimed continuously — PSI memory-full avg10 **51.3**, swap 99.99% full.
//!
//! ⛔ **AND TMPFS IS THE WORST POSSIBLE PLACE FOR IT, NOT MERELY AN EXPENSIVE
//! ONE: tmpfs pages are UNRECLAIMABLE.** The kernel cannot drop them under
//! pressure, only swap them, and swap was full — so every bit of reclaim
//! pressure landed on the only evictable thing in the cgroup, **the brain's own
//! working set. The deploy was starving the process it was deploying.**
//!
//! ⚠ A later press proved the fix does more than relieve pressure: staging
//! measured **203 GiB on disk**. The old path could never have completed that
//! deploy at all — it does not fit in a 16 GiB tmpfs. It only ever appeared to
//! work because the pull wedged or timed out first.

use std::path::{Path, PathBuf};

/// Why we picked where we picked — reported so the log can explain itself.
#[derive(Debug, PartialEq, Eq)]
pub enum Choice {
    /// The operator named it. Taken as-is, no second-guessing.
    Explicit(PathBuf),
    /// Default: a directory on the same disk as the backend.
    OnDisk(PathBuf),
    /// Nothing usable — the caller must fall back and say so loudly.
    Unusable(String),
}

impl Choice {
    pub fn path(&self) -> Option<&Path> {
        match self {
            Choice::Explicit(p) | Choice::OnDisk(p) => Some(p.as_path()),
            Choice::Unusable(_) => None,
        }
    }
}

/// Decide the staging root.
///
/// ⚠ `UAL_STAGE_DIR` wins unconditionally. If an operator has pointed staging at
/// a big volume, second-guessing them is how a deploy ends up back in RAM.
pub fn choose(backend_dir: &Path, explicit: Option<&str>) -> Choice {
    if let Some(e) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return Choice::Explicit(PathBuf::from(e));
    }
    let p = backend_dir.join(".staging");
    match std::fs::create_dir_all(&p) {
        Ok(()) if is_writable(&p) => Choice::OnDisk(p),
        Ok(()) => Choice::Unusable(format!("{} is not writable", p.display())),
        Err(e) => Choice::Unusable(format!("cannot create {}: {e}", p.display())),
    }
}

fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".unity-deploy-write-probe");
    // ⚠ WRITE A FILE, do not merely check permission bits. The box runs the
    // deploy as a service user against a directory it does not own; a mode read
    // says what SHOULD happen and a write says what DOES.
    match std::fs::write(&probe, b"1") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// ⛔ THE ENV VAR MUST BE **EXPORTED**, NOT MERELY SET FOR THIS PROCESS.
///
/// `git clone` writes pack files through its own temp handling, and the data-repo
/// clone is the ~12 GB half. Setting only the local variable relocated the small
/// half and left the large one in RAM — which looks like a fix and is not one.
/// This returns the pairs a child process must inherit.
pub fn child_env(stage: &Path) -> Vec<(String, String)> {
    let s = stage.display().to_string();
    vec![
        ("TMPDIR".into(), s.clone()),
        ("UAL_STAGE_DIR".into(), s),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("unity-stage-test-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn defaults_to_a_staging_dir_beside_the_backend_not_tmp() {
        let b = tmpdir("default");
        let c = choose(&b, None);
        let p = c.path().expect("should resolve").to_path_buf();
        assert_eq!(p, b.join(".staging"));
        assert!(p.exists(), "and it must actually be created");
        assert_ne!(p, std::env::temp_dir(), "NEVER the system temp dir — that is RAM under PrivateTmp");
    }

    #[test]
    fn an_explicit_operator_path_wins_and_is_not_second_guessed() {
        let b = tmpdir("explicit");
        let c = choose(&b, Some("/mnt/big/stage"));
        assert_eq!(c, Choice::Explicit(PathBuf::from("/mnt/big/stage")));
    }

    #[test]
    fn blank_or_whitespace_explicit_falls_back_to_the_default() {
        // An unset-but-present env var is a real case; it must not resolve to "".
        let b = tmpdir("blank");
        for v in ["", "   ", "\t"] {
            let c = choose(&b, Some(v));
            assert_eq!(c.path().unwrap(), b.join(".staging"), "{v:?} must not become the stage dir");
        }
    }

    #[test]
    fn exports_tmpdir_so_git_stages_on_disk_too() {
        // The half-fix: setting only this script's var moved the small half and
        // left the ~12 GB clone in RAM.
        let env = child_env(Path::new("/opt/unity-brain/.staging"));
        let keys: Vec<&str> = env.iter().map(|(k, _)| k.as_str()).collect();
        assert!(keys.contains(&"TMPDIR"), "git honours TMPDIR — it must be in the child env");
        assert!(keys.contains(&"UAL_STAGE_DIR"));
        assert!(env.iter().all(|(_, v)| v == "/opt/unity-brain/.staging"));
    }

    #[test]
    fn an_uncreatable_root_reports_unusable_rather_than_silently_using_ram() {
        // ⚠ The backend root is a FILE, so `create_dir_all` under it cannot
        // succeed on ANY platform. A first version of this test used a
        // Unix-unwritable path (`/proc/...`) and PASSED on Linux while Windows
        // happily created it — the assertion was measuring the platform, not the
        // guard. A file-as-parent is portable and tests the real branch.
        let d = tmpdir("unusable");
        let f = d.join("backend-is-a-file");
        std::fs::write(&f, b"not a directory").unwrap();
        match choose(&f, None) {
            Choice::Unusable(_) => {}
            other => panic!("expected Unusable, got {other:?} — a silent fallback to tmpfs is the bug this prevents"),
        }
    }
}
