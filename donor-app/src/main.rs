// unity-donor — native GPU compute donor for the Unity brain.
//
// M0 scaffold: CLI flags + GPU enumeration + config + protocol types + embedded shaders.
// The WS donor loop (M1), GPU compute (M2), sparse frames (M3), and GUI (M4) follow —
// see BUILD-PLAN.md. Scaffold types/messages aren't all exercised yet:
// Windows GUI build: suppress the console window that otherwise pops up behind
// the GUI when the app is launched from Explorer (Gee 2026-06-27: "the donor
// application needs its terminal when open to open headless"). Only the GUI
// feature build detaches from the console; the pure-headless
// (--no-default-features) CLI build keeps its console so server/RunPod
// operators still see stdout.
#![cfg_attr(all(windows, feature = "gui"), windows_subsystem = "windows")]
#![allow(dead_code)]

mod checkpoint;
mod cli;
mod compute;
mod config;
#[cfg(feature = "cuda")]
mod cuda;
mod donor;
mod gpu;
#[cfg(feature = "gui")]
mod gui;
mod mindspace;

// ⭐ `frames` and `protocol` MOVED OUT on 2026-09-05 (migration phase B0) into
// the shared `unity-protocol` crate, so a Rust coordinator can depend on the
// same wire definitions instead of restating them — the protocol existed twice
// (Rust + JS) and was kept in step by hand.
//
// ⚠ RE-EXPORTED AT THE CRATE ROOT ON PURPOSE. Every existing `crate::frames::…`
// and `crate::protocol::…` path across this binary keeps resolving unchanged,
// so the extraction is a MOVE and not a rewrite — which is the whole reason it
// can be verified by building. Changing ten call sites in the same commit that
// relocates the code would have meant a compile failure could not distinguish
// "the move is wrong" from "a call site is wrong".
pub use unity_protocol::{frames, protocol};

use clap::Parser;

/// First GPU index to use (for --self-test / single-GPU MVP): first entry of --gpus,
/// or 0 for "all", clamped to what's actually present.
fn first_selected_index(cli: &cli::Cli, gpus: &[gpu::GpuInfo]) -> usize {
    let want = if cli.gpus.trim().eq_ignore_ascii_case("all") {
        0
    } else {
        cli.gpus.split(',').next().and_then(|s| s.trim().parse::<usize>().ok()).unwrap_or(0)
    };
    if gpus.is_empty() {
        want
    } else {
        want.min(gpus.len() - 1)
    }
}

/// RUNPOD.6 — describe CUDA devices as donatable GPUs when wgpu enumerates nothing.
///
/// The advertised caps come from `total_mem` (the same figure `CudaEngine::binding_mb()` reports
/// once an engine exists) because the CUDA path has no 2 GB storage-binding limit — that ceiling
/// is a Vulkan-on-NVIDIA artifact of `maxStorageBufferRange` being u32. Probing here costs one
/// driver query per device: no context, no NVRTC compile, nothing that can fail loudly at
/// startup. A device whose VRAM query fails still gets listed with a conservative 4096 MB, the
/// same floor the engine uses, so a driver quirk cannot make a real card invisible.
#[cfg(feature = "cuda")]
fn cuda_only_gpus() -> Vec<gpu::GpuInfo> {
    let names = cuda::device_names();
    if names.is_empty() {
        return Vec::new();
    }
    println!(
        "[gpu] no wgpu adapter found, but CUDA reports {} device(s) — donating over CUDA (no Vulkan/X11 stack needed).",
        names.len()
    );
    names
        .into_iter()
        .enumerate()
        .map(|(index, name)| {
            let vram = cuda::device_vram_mb(index);
            let cap = if vram > 0 { vram } else { 4096 };
            gpu::GpuInfo {
                index,
                name: if name.is_empty() { format!("CUDA device {index}") } else { name },
                backend: "Cuda".to_string(),
                device_type: "DiscreteGpu".to_string(),
                max_buffer_mb: cap,
                max_storage_binding_mb: cap,
            }
        })
        .collect()
}

/// CRASH LOG — a panic writes its own reason down before the process unwinds
/// or aborts. On 2026-10-18 the Windows donor died with `0xc0000409` (an abort)
/// two seconds after its brain went dark; the GUI build detaches from the
/// console, so the panic text Rust prints to stderr went nowhere, the dump
/// held no message, and the stripped binary made the fault offset unnameable.
/// A donor that dies without a word cannot be fixed. This hook appends the
/// time, the version, the message, the source location and a backtrace to
/// `<data dir>/unity-donor/crash.log` — the same directory as `settings.json`
/// — and then hands off to the default hook so stderr still gets it when there
/// is a console. Best-effort by construction: a hook that itself fails must
/// never hide the panic it was asked to record.
fn install_crash_log() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let when = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let thread = std::thread::current();
        let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "(non-string panic payload)".to_string()
        };
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "(unknown location)".to_string());
        let bt = std::backtrace::Backtrace::force_capture();
        let entry = format!(
            "---- unity-donor v{} panic at unix {} on thread '{}' ----\n{}\n  at {}\n{}\n\n",
            env!("CARGO_PKG_VERSION"),
            when,
            thread.name().unwrap_or("?"),
            msg,
            loc,
            bt
        );
        let dir = config::data_dir();
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("crash.log")) {
            use std::io::Write;
            let _ = f.write_all(entry.as_bytes());
        }
        default_hook(info);
    }));
}

/// SUPERVISOR — the reason an ABORT is recorded at all.
///
/// The panic hook above cannot see an abort. Rust's `abort_internal` is reached
/// WITHOUT the hook by a stack overflow, an allocation the OS refuses, or a
/// double panic, and Windows then reports only `0xc0000409`; both 2026-10-18
/// deaths were that class and left no `crash.log`. A process cannot write down
/// its own abort, so the donor runs itself as a CHILD and this parent waits:
/// the child's stderr streams through (and its last lines are kept), and when
/// the child exits with anything but success, the parent appends the exit code,
/// the platform's name for it, and that stderr tail to the same `crash.log`.
/// Returns `None` in the child (or when supervision is off); `Some(code)` in
/// the parent, which then exits with the child's code.
fn supervise() -> Option<i32> {
    if std::env::var_os("UNITY_DONOR_CHILD").is_some() || std::env::var_os("UNITY_DONOR_NO_SUPERVISOR").is_some() {
        return None;
    }
    let exe = std::env::current_exe().ok()?;
    let mut cmd = std::process::Command::new(exe);
    cmd.args(std::env::args_os().skip(1))
        .env("UNITY_DONOR_CHILD", "1")
        .stdin(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — the GUI build must not flash a console
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return None, // cannot supervise — run unsupervised rather than not at all
    };
    let tail = std::sync::Arc::new(std::sync::Mutex::new(std::collections::VecDeque::<String>::new()));
    let reader = child.stderr.take().map(|err| {
        let tail = tail.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, Write};
            for line in std::io::BufReader::new(err).lines().map_while(Result::ok) {
                let _ = writeln!(std::io::stderr(), "{line}");
                if let Ok(mut t) = tail.lock() {
                    t.push_back(line);
                    while t.len() > 80 {
                        t.pop_front();
                    }
                }
            }
        })
    });
    let status = child.wait();
    if let Some(r) = reader {
        let _ = r.join();
    }
    let code = match status {
        Ok(s) => s.code().unwrap_or(-1),
        Err(_) => -1,
    };
    if code != 0 {
        let raw = code as u32;
        let name = match raw {
            0xC000_0409 => "STATUS_STACK_BUFFER_OVERRUN / fail-fast — Rust abort (stack overflow, refused allocation, or double panic)",
            0xC000_00FD => "STATUS_STACK_OVERFLOW",
            0xC000_0005 => "STATUS_ACCESS_VIOLATION",
            0xC000_0017 => "STATUS_NO_MEMORY",
            0xC000_013A => "STATUS_CONTROL_C_EXIT",
            _ => "",
        };
        let when = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let lines: Vec<String> = tail.lock().map(|t| t.iter().cloned().collect()).unwrap_or_default();
        let entry = format!(
            "---- unity-donor v{} EXITED at unix {} — code {} (0x{:08X}) {} ----\nlast {} stderr line(s):\n{}\n\n",
            env!("CARGO_PKG_VERSION"),
            when,
            code,
            raw,
            name,
            lines.len(),
            lines.join("\n")
        );
        let dir = config::data_dir();
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("crash.log")) {
            use std::io::Write;
            let _ = f.write_all(entry.as_bytes());
        }
    }
    Some(code)
}

fn main() {
    install_crash_log();
    if let Some(code) = supervise() {
        std::process::exit(code);
    }
    let cli = cli::Cli::parse();

    // --list-gpus: enumerate and exit.
    // RUNPOD.6 — a CUDA card with no Vulkan stack IS a donatable GPU. `gpu::enumerate()` only
    // sees wgpu adapters (Vulkan/Metal/DX12), which is the state most datacenter and cloud GPU
    // containers do NOT ship: they have libcuda and nothing else. Every such host used to die
    // below on "No GPU adapter detected — nothing to donate", so renting a headless GPU meant
    // installing a GLVND/X11 package pile purely to satisfy an enumeration call the CUDA path
    // never uses. When the cuda feature is compiled in and wgpu finds nothing, describe the CUDA
    // devices directly instead. wgpu-visible hosts are untouched — this only fires on an
    // otherwise-empty list.
    let gpus = {
        let found = gpu::enumerate();
        #[cfg(feature = "cuda")]
        let found = if found.is_empty() { cuda_only_gpus() } else { found };
        found
    };
    if cli.list_gpus {
        gpu::print_list(&gpus);
        return;
    }

    // --self-test: verify the GPU compute path + frame codec locally (no brain), then exit.
    if cli.self_test {
        match frames::self_check() {
            Ok(()) => println!("self-test: binary frame codec round-trip OK"),
            Err(e) => {
                eprintln!("self-test FAILED (frame codec): {e}");
                std::process::exit(1);
            }
        }
        let idx = first_selected_index(&cli, &gpus);
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        if let Err(e) = rt.block_on(compute::self_test(idx, cli.self_test_neurons, 20, 22.0)) {
            eprintln!("self-test FAILED: {e}");
            std::process::exit(1);
        }
        return;
    }

    let cfg = match config::DonorConfig::from_cli(&cli) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("config error: {e}");
            std::process::exit(2);
        }
    };

    println!(
        "unity-donor v{} — server {} — name '{}'",
        env!("CARGO_PKG_VERSION"),
        cfg.server,
        cfg.name
    );

    if gpus.is_empty() {
        eprintln!("No GPU adapter detected — nothing to donate. (Try --list-gpus.)");
        std::process::exit(1);
    }

    let selected: Vec<&gpu::GpuInfo> = gpus.iter().filter(|g| cfg.includes(g.index)).collect();
    if selected.is_empty() {
        eprintln!("--gpus selected no detected adapter. Available:");
        gpu::print_list(&gpus);
        std::process::exit(1);
    }

    println!(
        "Donating {} GPU(s) at {}% utilization (memory: {:?}):",
        selected.len(),
        cfg.utilization_pct,
        cfg.memory
    );
    for g in &selected {
        println!(
            "  [{}] {} · max-buffer {} MB · max-binding {} MB",
            g.index, g.name, g.max_buffer_mb, g.max_storage_binding_mb
        );
    }

    // GUI build, interactive (not --headless): open the window. Defaults card 1 @ 10%;
    // nothing donates until ▶ Start (safe start).
    #[cfg(feature = "gui")]
    if !cfg.headless {
        if let Err(e) = gui::run(cfg.clone(), gpus.clone()) {
            eprintln!("{e}");
            std::process::exit(1);
        }
        return;
    }

    // Headless donor loop (the --no-default-features build is always here).
    if cfg.autostart {
        // ONE donor for the whole host: all selected GPUs are aggregated into a single
        // compute unit (round-robin per cluster, parallel per batch). Ctrl+C stops it.
        let targets: Vec<gpu::GpuInfo> = selected.iter().map(|g| (*g).clone()).collect();
        let utils: Vec<u8> = targets.iter().map(|_| cfg.utilization_pct).collect();
        println!("donating {} GPU(s) as ONE compute unit @ {}% each — Ctrl+C to stop:", targets.len(), cfg.utilization_pct);
        for g in &targets {
            println!("  → [{}] {}", g.index, g.name);
        }
        // ⛔ HEADLESS ONLY, DELIBERATELY. The wedge watchdog ends the process when
        // the donor is neither receiving nor trying — correct for an unattended pod,
        // wrong for a person sitting at a GUI who has deliberately not started
        // donating. An interactive idle is a choice; an unattended silence is a fault.
        donor::start_wedge_watchdog();
        let (_control, handle) = donor::spawn_donor(cfg.clone(), targets, utils);
        let _ = handle.join();
    } else {
        println!("\nsafe-start: not connecting. Use --autostart for headless donation, or run the GUI build.");
    }
}
