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

mod cli;
mod compute;
mod config;
#[cfg(feature = "cuda")]
mod cuda;
mod donor;
mod frames;
mod gpu;
#[cfg(feature = "gui")]
mod gui;
mod protocol;

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

fn main() {
    let cli = cli::Cli::parse();

    // --list-gpus: enumerate and exit.
    let gpus = gpu::enumerate();
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
        let (_control, handle) = donor::spawn_donor(cfg.clone(), targets, utils);
        let _ = handle.join();
    } else {
        println!("\nsafe-start: not connecting. Use --autostart for headless donation, or run the GUI build.");
    }
}
