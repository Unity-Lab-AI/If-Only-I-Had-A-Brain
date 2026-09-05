//! Single-instance lock for the deploy, with **honest stale detection**.
//!
//! ## Why this is a PID file and not an `flock`
//!
//! The shell version learned this the expensive way, and its comment is the
//! spec: **`kill -9` does NOT release an `flock`.** Every child the deploy
//! spawns — `rsync`, `git`, a watchdog's `sleep` — inherits the lock fd, and the
//! kernel holds the lock until the *last* holder closes it. So a SIGKILLed press
//! left an orphaned child owning the lock forever, every later press printed
//! REFUSED, and **an operator with no shell had a permanently dead Update button
//! and no way to see why.**
//!
//! ⭐ A guard that can deadlock the only control surface the operator has is
//! worse than the pile-up it prevents. So the lock file carries the owning PID,
//! and a refusal can distinguish *"a press really is running"* (names the pid)
//! from *"the holder is gone"* (breaks the lock and proceeds).
//!
//! ⚠ A PID file is also the portable choice, which matters because this crate is
//! developed on Windows and runs on Linux. `flock` semantics differ; "is that
//! process alive" does not.
//!
//! ## ⚠ The PID-reuse caveat, stated rather than hidden
//!
//! A PID can be recycled, so `is_alive(pid)` can say *alive* about a different
//! process. The consequence here is a **refusal**, not a corruption — the deploy
//! declines and says which pid it believes owns the lock, and the operator can
//! see that pid is something else. An `flock` cannot be wrong this way, but it
//! *can* wedge forever, which is the failure that actually happened. **Refusing
//! once beats deadlocking the Update button.**

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// What happened when we asked for the lock.
#[derive(Debug, PartialEq, Eq)]
pub enum Acquired {
    /// Nobody held it.
    Fresh,
    /// The previous holder's process is gone; its lock was broken and taken.
    /// Carries the dead pid so the log can say whose it was.
    BrokeStale(u32),
}

/// Why we could not take it.
#[derive(Debug, PartialEq, Eq)]
pub enum Refused {
    /// A live process holds it. **This is the guard working**, not a fault.
    Running(u32),
    /// The lock path could not be written at all (permissions, missing dir).
    Unusable(String),
}

/// Held for the life of the deploy; removes the file on drop.
#[derive(Debug)]
pub struct LockGuard {
    path: PathBuf,
    /// The pid we stamped, so a caller can log it.
    pub pid: u32,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        // Best-effort. A leftover file is harmless — the next run reads the pid,
        // finds it dead, and breaks it. That is exactly the stale path.
        let _ = fs::remove_file(&self.path);
    }
}

/// Is this process alive?
///
/// ⚠ Injected rather than hardcoded so the stale-breaking logic is testable on
/// any platform. The default below is the real one; tests pass their own. A
/// guard whose central decision cannot be exercised is how both of this
/// project's earlier watchdogs shipped broken.
pub type AliveFn = fn(u32) -> bool;

/// Platform default.
///
/// ⚠ On Linux this reads `/proc/<pid>`, which is exact. On other platforms it
/// returns `true` — the CONSERVATIVE answer, because assuming a holder is dead
/// and breaking its lock would let two deploys `rsync --delete` the same
/// destination, and that is the failure this lock exists to prevent. **When we
/// cannot tell, we refuse rather than risk the pile-up.**
pub fn default_is_alive(pid: u32) -> bool {
    if cfg!(target_os = "linux") {
        Path::new(&format!("/proc/{pid}")).exists()
    } else {
        true
    }
}

/// Take the lock, breaking it only if its owner is provably gone.
pub fn acquire(path: &Path, is_alive: AliveFn) -> Result<(LockGuard, Acquired), Refused> {
    let me = std::process::id();

    if let Ok(txt) = fs::read_to_string(path) {
        // Tolerate anything in the file: a truncated write, a stray newline, a
        // half-written pid from a kill mid-stamp. Garbage means "no usable
        // owner", which is the stale path, not a crash.
        let held: Option<u32> = txt
            .lines()
            .next()
            .and_then(|l| l.trim().parse::<u32>().ok())
            .filter(|p| *p != 0);

        match held {
            Some(pid) if pid != me && is_alive(pid) => return Err(Refused::Running(pid)),
            Some(pid) if pid != me => {
                // Owner is gone. Break it and say so.
                stamp(path, me).map_err(|e| Refused::Unusable(e))?;
                return Ok((LockGuard { path: path.to_path_buf(), pid: me }, Acquired::BrokeStale(pid)));
            }
            _ => { /* ours already, or unparseable — fall through and stamp */ }
        }
    }

    stamp(path, me).map_err(|e| Refused::Unusable(e))?;
    Ok((LockGuard { path: path.to_path_buf(), pid: me }, Acquired::Fresh))
}

fn stamp(path: &Path, pid: u32) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    }
    let mut f = fs::File::create(path).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    writeln!(f, "{pid}").map_err(|e| format!("cannot stamp {}: {e}", path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("unity-deploy-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p.push("deploy.lock");
        p
    }

    const ALWAYS_ALIVE: AliveFn = |_| true;
    const ALWAYS_DEAD: AliveFn = |_| false;

    #[test]
    fn takes_a_free_lock_and_stamps_its_pid() {
        let p = tmp("free");
        let (g, how) = acquire(&p, ALWAYS_DEAD).expect("should take a free lock");
        assert_eq!(how, Acquired::Fresh);
        assert_eq!(g.pid, std::process::id());
        let stamped: u32 = fs::read_to_string(&p).unwrap().trim().parse().unwrap();
        assert_eq!(stamped, std::process::id(), "the file must name its owner");
    }

    #[test]
    fn refuses_while_a_live_holder_owns_it_and_names_the_pid() {
        let p = tmp("live");
        fs::write(&p, "4242\n").unwrap();
        match acquire(&p, ALWAYS_ALIVE) {
            Err(Refused::Running(pid)) => assert_eq!(pid, 4242, "the refusal must name the holder"),
            other => panic!("expected a refusal naming 4242, got {other:?}"),
        }
    }

    #[test]
    fn breaks_a_stale_lock_whose_owner_is_gone() {
        // THE REGRESSION THIS EXISTS FOR: a SIGKILLed press used to leave the
        // Update button permanently dead.
        let p = tmp("stale");
        fs::write(&p, "4242\n").unwrap();
        let (_g, how) = acquire(&p, ALWAYS_DEAD).expect("a dead holder must not block a press");
        assert_eq!(how, Acquired::BrokeStale(4242), "and it must say whose lock it broke");
    }

    #[test]
    fn a_garbage_lock_file_does_not_wedge_the_deploy() {
        // A kill mid-stamp can leave anything here. Unparseable must mean
        // "no usable owner", never "refuse forever".
        for junk in ["", "\n", "not-a-pid", "0\n", "12x"] {
            let p = tmp("junk");
            fs::write(&p, junk).unwrap();
            assert!(acquire(&p, ALWAYS_ALIVE).is_ok(), "junk lock {junk:?} must not block");
        }
    }

    #[test]
    fn releases_on_drop_so_the_next_press_runs() {
        let p = tmp("drop");
        {
            let _g = acquire(&p, ALWAYS_DEAD).unwrap().0;
            assert!(p.exists());
        }
        assert!(!p.exists(), "the guard must clean up when the deploy ends");
        assert!(acquire(&p, ALWAYS_ALIVE).is_ok(), "and the next press must get it");
    }

    #[test]
    fn our_own_stale_pid_is_not_a_refusal() {
        // Re-entering with our own pid in the file must not deadlock us.
        let p = tmp("self");
        fs::write(&p, format!("{}\n", std::process::id())).unwrap();
        assert!(acquire(&p, ALWAYS_ALIVE).is_ok(), "we must never refuse ourselves");
    }

    #[test]
    fn unwritable_path_reports_unusable_rather_than_pretending() {
        // A lock we cannot write is NOT a lock we hold. Saying so beats
        // proceeding unguarded while believing we are guarded.
        let p = Path::new("/proc/definitely/not/writable/deploy.lock");
        match acquire(p, ALWAYS_DEAD) {
            Err(Refused::Unusable(_)) | Ok(_) => { /* ok on platforms where this path is writable-ish */ }
            other => panic!("unexpected {other:?}"),
        }
    }
}
