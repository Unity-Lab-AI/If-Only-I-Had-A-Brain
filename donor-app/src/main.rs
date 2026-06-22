// unity-donor — native GPU compute donor for the Unity brain.
//
// M0 scaffold: CLI flags + GPU enumeration + config + protocol types + embedded shaders.
// The WS donor loop (M1), GPU compute (M2), sparse frames (M3), and GUI (M4) follow —
// see BUILD-PLAN.md. Scaffold types/messages aren't all exercised yet:
#![allow(dead_code)]

mod cli;
mod config;
mod gpu;
mod protocol;

use clap::Parser;

fn main() {
    let cli = cli::Cli::parse();

    // --list-gpus: enumerate and exit.
    let gpus = gpu::enumerate();
    if cli.list_gpus {
        gpu::print_list(&gpus);
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

    if !cfg.headless {
        println!("\n(GUI lands in M4 — running headless meanwhile.)");
    }

    // Preview the gpu_register we'll send per GPU once the WS loop (M1) lands. This also
    // exercises the protocol + config + gpu modules end-to-end so they're compile-checked.
    if let Some(g) = selected.first() {
        let reg = protocol::GpuRegister::new(g.max_buffer_mb, g.max_storage_binding_mb, g.name.clone());
        if let Ok(j) = serde_json::to_string(&reg) {
            println!("\ngpu_register preview (M1 will send this on connect):\n  {j}");
        }
    }

    if cfg.autostart {
        println!(
            "\nautostart: would connect to {} and begin the donor loop — M1 (WS register) + M2 (compute) land next.",
            cfg.server
        );
    } else {
        println!("\nsafe-start: not connecting yet. The GUI \u{25b6} Start button (M4) or --autostart begins donation once M1 ships.");
    }
}
