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
mod mindspace;
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

fn main() {
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
        let (_control, handle) = donor::spawn_donor(cfg.clone(), targets, utils);
        let _ = handle.join();
    } else {
        println!("\nsafe-start: not connecting. Use --autostart for headless donation, or run the GUI build.");
    }
}
