//! `unity-deploy` — the Unity brain's deploy worker. Migration phase **B1**.
//!
//! ## What this is, and deliberately what it is not yet
//!
//! `docs/RUST-MIGRATION.md` §5.3 argues this is the clear first win: the deploy
//! is *already* a separate process, *already* needs its own cgroup, and is the
//! thing most likely to change while the brain must keep running.
//!
//! ⭐ **The structural prize is self-replacement.** The shell version has to
//! **re-exec itself mid-run** to pick up its own fix (see the `SELFFIRST` block
//! in `deploy/self-update.sh` and the byte-offset trap it documents — a running
//! `bash` reads its script incrementally, so editing it underneath is a real
//! hazard). A standalone binary is replaced by **rename**, and the *next*
//! invocation is the new one. No re-exec, no self-modification, no partially
//! read script.
//!
//! ⛔⛔ **THIS VERSION ORCHESTRATES; IT DOES NOT YET REIMPLEMENT THE DEPLOY —
//! AND THAT IS A DECISION, NOT AN UNFINISHED EDGE.**
//!
//! `deploy/self-update.sh` is **1,449 lines: 544 of code and 880 of comments**,
//! carrying **84 branches, 35 WARN/FATAL paths and 13 env knobs.** Those 880
//! comment lines are the *specification* — nearly every one records an outage
//! that earned its guard: `kill -9` not releasing an flock; `pgrep` matching a
//! wrapper shell and then a short-lived sibling; a bare `--scope` prompting
//! polkit; page cache starving the brain; `write_bytes` lying in two opposite
//! directions. **A port that drops a comment drops a guard.**
//!
//! ⚠ And the acceptance gate is not ours to grant: *"Keep the shell script
//! working until this has done a real deploy on a real box."* A deploy binary
//! that has never deployed is exactly the artifact class this project keeps
//! being burned by — a press that looks green and does nothing.
//!
//! ⭐ So this binary takes the three responsibilities that are **structurally
//! better here and independently testable** — the single-instance lock, the
//! staging decision, and the own-cgroup launch — and hands the 84 branches to
//! the script that has survived them. The logic then ports **branch by branch,
//! against a binary that already works**, which is the strangler pattern §2 asks
//! for rather than a big-bang rewrite of the one script that can delete the
//! corpus.

mod gates;
mod guards;
mod lock;
mod scope;
mod staging;

use clap::{Parser, Subcommand};
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;

#[derive(Parser)]
#[command(name = "unity-deploy", version, about = "Unity brain deploy worker (migration phase B1)")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Run a deploy: take the lock, choose staging, launch in our own cgroup.
    Run {
        /// Backend directory (default: $UAL_BACKEND_DIR, else /opt/unity-brain).
        #[arg(long)]
        backend: Option<PathBuf>,
        /// The deploy script to execute. Kept explicit so a caller can point at
        /// a candidate build without replacing the installed one.
        #[arg(long)]
        script: Option<PathBuf>,
        /// Resume the trained weights instead of wiping (Update & Savestart).
        #[arg(long)]
        keep_state: bool,
        /// Skip the 114 GB field payload. ⚠ An emergency hatch — the fields are
        /// WANTED and every normal press fetches them.
        #[arg(long)]
        skip_fields: bool,
        /// Memory ceiling for the deploy's own cgroup scope.
        #[arg(long, default_value = "2G")]
        mem_max: String,
        /// Interpreter to run the script with.
        ///
        /// ⚠ Not cosmetic. A box may ship `sh` and not `bash`, and hardcoding an
        /// interpreter is the same class of assumption as hardcoding a path.
        /// ⭐ It is also what makes the success path TESTABLE — with `bash`
        /// hardcoded, a host where bash cannot run the script returns 1 for
        /// every input, and "correctly propagates failure" is indistinguishable
        /// from "always fails".
        #[arg(long, default_value = "bash")]
        interpreter: String,
        /// Resolve and print the plan without doing anything.
        #[arg(long)]
        dry_run: bool,
    },
    /// Answer "would a restart actually boot?" without deploying anything.
    ///
    /// ⭐ Read-only, and worth having as its own verb because the dangerous
    /// question is asked at the wrong time otherwise. `.force-fresh` means the
    /// next restart from ANY cause wipes the weights, so *"is the box in a state
    /// where a boot completes?"* is something an operator needs to be able to
    /// ask **before** touching anything — and with no shell, they currently
    /// cannot.
    ///
    /// ⚠ These are the same two gates the deploy runs, checked against the
    /// directories the server actually reads rather than any step's exit code.
    Preflight {
        #[arg(long)]
        backend: Option<PathBuf>,
        /// Override the GloVe floor. The real table is ~1.04 GB.
        #[arg(long)]
        glove_min_bytes: Option<u64>,
    },
    /// Report whether a deploy currently holds the lock, and whose it is.
    /// ⭐ Exists because "is a press running?" had no answer an operator with no
    /// shell could get.
    LockStatus {
        #[arg(long)]
        backend: Option<PathBuf>,
    },
}

fn backend_dir(explicit: Option<PathBuf>) -> PathBuf {
    explicit
        .or_else(|| std::env::var_os("UAL_BACKEND_DIR").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("/opt/unity-brain"))
}

fn main() -> ExitCode {
    match Cli::parse().cmd {
        Cmd::Preflight { backend, glove_min_bytes } => {
            let b = backend_dir(backend);
            let (corpora, glove) = gates::default_paths(&b);
            let floor = glove_min_bytes.unwrap_or(gates::GLOVE_MIN_BYTES);
            // ⛔⛔ THE OTHER HALF OF THE QUESTION. "Would a restart boot?" and
            // "would a restart WIPE?" are both live on this box, and the second
            // one is the expensive surprise: `.force-fresh` means the next
            // restart from ANY cause — an OOM kill, a power cut, a hand-typed
            // systemctl — wipes the trained weights, and DREAM_KEEP_STATE=1 does
            // NOT protect you. A press that armed it and then aborted leaves a
            // trap that fires whenever the next reboot happens to be.
            //
            // ⭐ Checked READ-ONLY, so asking does not consume the flag.
            let server_dir = b.join("server");
            let armed = unity_state::StateDir::new(&server_dir).force_fresh_armed()
                || unity_state::StateDir::new(&b).force_fresh_armed();
            if armed {
                println!("[unity-deploy] ⚠ .force-fresh IS ARMED — the next restart from ANY cause will WIPE the trained weights \
                          (DREAM_KEEP_STATE=1 does NOT protect you). If that is not what you intend, disarm it before restarting.");
            } else {
                println!("[unity-deploy] ✓ no wipe armed — a restart resumes or starts per the usual rules.");
            }

            match gates::preflight(&corpora, &glove, floor) {
                Ok(ok) => {
                    for line in ok { println!("[unity-deploy] ✓ {line}"); }
                    if armed {
                        // ⚠ Still a PASS — the gates are satisfied. But the
                        // headline must not read "all clear" while a wipe is
                        // pending, because that is the sentence someone acts on.
                        println!("[unity-deploy] PREFLIGHT PASS — a restart has what it needs to boot, ⚠ AND IT WILL WIPE (.force-fresh armed).");
                    } else {
                        println!("[unity-deploy] PREFLIGHT PASS — a restart has what it needs to boot.");
                    }
                    ExitCode::SUCCESS
                }
                Err(why) => {
                    // ⛔ Non-zero, so a caller can gate on it rather than parse prose.
                    eprintln!("[unity-deploy] PREFLIGHT REFUSE — {why}");
                    ExitCode::from(1)
                }
            }
        }
        Cmd::LockStatus { backend } => {
            let b = backend_dir(backend);
            let p = b.join(".unity-deploy.lock");
            match std::fs::read_to_string(&p) {
                Err(_) => { println!("no deploy is holding the lock ({})", p.display()); ExitCode::SUCCESS }
                Ok(txt) => {
                    let pid = txt.lines().next().and_then(|l| l.trim().parse::<u32>().ok());
                    match pid {
                        Some(pid) if lock::default_is_alive(pid) =>
                            { println!("a deploy IS running — pid {pid} ({})", p.display()); ExitCode::SUCCESS }
                        Some(pid) =>
                            { println!("STALE lock from pid {pid} — its owner is gone; the next press will break it and proceed", pid = pid); ExitCode::SUCCESS }
                        None =>
                            { println!("lock file present but unreadable — treated as stale, the next press proceeds"); ExitCode::SUCCESS }
                    }
                }
            }
        }
        Cmd::Run { backend, script, keep_state, skip_fields, mem_max, interpreter, dry_run } => {
            let b = backend_dir(backend);
            let script = script
                .or_else(|| std::env::var_os("UAL_SELF_UPDATE_SCRIPT").map(PathBuf::from))
                .unwrap_or_else(|| b.join("deploy/self-update.sh"));

            // ── staging first: the decision must be made BEFORE anything large
            // is written, because the failure it prevents is writing into RAM.
            let stage = staging::choose(&b, std::env::var("UAL_STAGE_DIR").ok().as_deref());
            let mut env: Vec<(String, String)> = Vec::new();
            match &stage {
                staging::Choice::Unusable(why) => {
                    // ⚠ NOT fatal. A deploy that still works and uses RAM beats a
                    // box that cannot deploy at all — but it must SAY so, because
                    // under PrivateTmp the fallback is ~12 GB of unreclaimable
                    // tmpfs that starves the brain.
                    eprintln!("[unity-deploy] WARN — no usable disk staging ({why}). Falling back to the script's own default. \
                               ⚠ Under PrivateTmp=true that is a RAM-backed tmpfs; expect heavy memory pressure. Set UAL_STAGE_DIR.");
                }
                c => {
                    let p = c.path().unwrap();
                    println!("[unity-deploy] staging to DISK at {} (never /tmp — PrivateTmp makes that RAM, and tmpfs pages are unreclaimable)", p.display());
                    env.extend(staging::child_env(p));
                }
            }

            if keep_state { env.push(("UAL_KEEP_STATE".into(), "1".into())); }
            if skip_fields { env.push(("UAL_FIELDS".into(), "0".into())); }

            let mut inner: Vec<OsString> = vec![interpreter.clone().into(), script.clone().into_os_string()];
            if !script.exists() {
                eprintln!("[unity-deploy] FATAL — deploy script not found at {}. Refusing: a press that runs nothing must not report success.", script.display());
                return ExitCode::from(2);
            }
            inner.truncate(2);

            let unit = format!("unity-brain-selfupdate-{}", std::process::id());

            if dry_run {
                println!("[unity-deploy] DRY RUN — nothing executed");
                println!("  backend : {}", b.display());
                println!("  script  : {}", script.display());
                println!("  staging : {:?}", stage);
                println!("  env     : {env:?}");
                println!("  scope   : systemd-run {:?}", scope::wrap(&unit, &mem_max, &inner)
                    .iter().map(|s| s.to_string_lossy().into_owned()).collect::<Vec<_>>());
                println!("  systemd-run available: {}", scope::available());
                return ExitCode::SUCCESS;
            }

            // ── the lock, taken as late as possible so a dry run never holds it
            let lock_path = b.join(".unity-deploy.lock");
            let _guard = match lock::acquire(&lock_path, lock::default_is_alive) {
                Ok((g, lock::Acquired::Fresh)) => {
                    println!("[unity-deploy] lock acquired ({}, pid {})", lock_path.display(), g.pid);
                    g
                }
                Ok((g, lock::Acquired::BrokeStale(dead))) => {
                    println!("[unity-deploy] WARN — lock was held by pid {dead}, which is GONE. That is a KILLED press; \
                              breaking the stale lock and proceeding, because refusing forever would leave the Update button \
                              permanently dead with no shell to clear it.");
                    g
                }
                Err(lock::Refused::Running(pid)) => {
                    eprintln!("[unity-deploy] REFUSED — a deploy is ALREADY RUNNING (pid {pid}). ⭐ This is the guard working: \
                               three concurrent presses were observed on 2026-09-05, each staging ~12 GB and all three \
                               rsyncing --delete into the SAME destination.");
                    return ExitCode::SUCCESS; // a refusal is not a failure
                }
                Err(lock::Refused::Unusable(why)) => {
                    eprintln!("[unity-deploy] FATAL — cannot take the deploy lock: {why}. Refusing rather than running \
                               unguarded, because concurrent rsync --delete into one destination is the failure this prevents.");
                    return ExitCode::from(3);
                }
            };

            match scope::run(&unit, &mem_max, &inner, Some(&b), &env) {
                Ok((scope::Launch::Scoped, st)) => {
                    println!("[unity-deploy] deploy ran in its own cgroup scope (MemoryMax={mem_max}) → {st}");
                    if st.success() { ExitCode::SUCCESS } else { ExitCode::from(1) }
                }
                Ok((scope::Launch::FellBack(why), st)) => {
                    eprintln!("[unity-deploy] WARN — ran WITHOUT its own cgroup: {why}. The deploy still happened, but it \
                               spent the brain's memory budget, which is the root cause of three separate incidents.");
                    if st.success() { ExitCode::SUCCESS } else { ExitCode::from(1) }
                }
                Err(e) => {
                    eprintln!("[unity-deploy] FATAL — could not execute the deploy: {e}");
                    ExitCode::from(4)
                }
            }
        }
    }
}
