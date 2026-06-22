//! M4 — eframe/egui desktop GUI. Per-GPU toggle + utilization slider, safe Start/Stop,
//! and a status panel (server + your contribution). Defaults: card 1 enabled @ 10%, and
//! NOTHING runs until ▶ Start (safe start). Multi-GPU: one donor (full replica) per
//! enabled card. Compiled only with the `gui` feature.

use std::sync::atomic::Ordering;
use std::thread::JoinHandle;
use std::time::Duration;

use eframe::egui;

use crate::config::DonorConfig;
use crate::donor::{self, Control};
use crate::gpu::GpuInfo;

/// One running donor (one GPU = one full replica).
struct RunningDonor {
    control: Control,
    handle: JoinHandle<()>,
    gpu_index: usize,
    gpu_name: String,
}

struct DonorApp {
    cfg: DonorConfig,
    gpus: Vec<GpuInfo>,
    enabled: Vec<bool>,
    util: Vec<f32>,
    donors: Vec<RunningDonor>,
}

impl DonorApp {
    fn new(cfg: DonorConfig, gpus: Vec<GpuInfo>) -> Self {
        // Default: card 1 (index 0) enabled @ 10%; everything else off @ 10%.
        let enabled: Vec<bool> = gpus.iter().enumerate().map(|(i, _)| i == 0).collect();
        let util: Vec<f32> = gpus.iter().map(|_| 10.0).collect();
        Self { cfg, gpus, enabled, util, donors: Vec::new() }
    }

    fn running(&self) -> bool {
        !self.donors.is_empty()
    }

    fn any_enabled(&self) -> bool {
        self.enabled.iter().any(|&e| e)
    }

    /// Launch one donor per enabled GPU.
    fn start(&mut self) {
        let mut donors = Vec::new();
        for (i, g) in self.gpus.iter().enumerate() {
            if !self.enabled[i] {
                continue;
            }
            let mut cfg = self.cfg.clone();
            cfg.utilization_pct = self.util[i].round().clamp(1.0, 100.0) as u8;
            let (control, handle) = donor::spawn_donor(cfg, g.clone());
            donors.push(RunningDonor { control, handle, gpu_index: g.index, gpu_name: g.name.clone() });
        }
        self.donors = donors;
    }

    fn stop(&mut self) {
        for d in &self.donors {
            d.control.stop.store(true, Ordering::Relaxed);
        }
    }
}

impl eframe::App for DonorApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint_after(Duration::from_millis(300));
        // Drop donors whose thread has finished (stopped / disconnected / failed) so
        // ▶ Start reappears when none remain.
        self.donors.retain(|d| !d.handle.is_finished());

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("unity-donor");
            ui.label(egui::RichText::new("Donate GPU compute to the Unity brain").weak());
            ui.add_space(8.0);

            let running = self.running();

            ui.horizontal(|ui| {
                ui.label("Server:");
                ui.add_enabled(!running, egui::TextEdit::singleline(&mut self.cfg.server).desired_width(280.0));
            });
            ui.add_space(8.0);

            ui.label(egui::RichText::new("GPUs  (one donor = one full replica per card)").strong());
            egui::Grid::new("gpus").num_columns(3).spacing([12.0, 6.0]).show(ui, |ui| {
                for (i, g) in self.gpus.iter().enumerate() {
                    ui.add_enabled(!running, egui::Checkbox::new(&mut self.enabled[i], ""));
                    ui.label(format!("[{}] {}  ({} MB binding cap)", g.index, g.name, g.max_storage_binding_mb));
                    ui.add_enabled(
                        !running,
                        egui::Slider::new(&mut self.util[i], 0.0..=100.0).suffix("%").text("util"),
                    );
                    ui.end_row();
                }
            });
            ui.add_space(10.0);

            ui.horizontal(|ui| {
                if !running {
                    if ui.add_enabled(self.any_enabled(), egui::Button::new("▶  Start")).clicked() {
                        self.start();
                    }
                } else if ui.button("⏹  Stop").clicked() {
                    self.stop();
                }
            });
            ui.add_space(12.0);
            ui.separator();
            ui.add_space(6.0);

            // Status — server + per-GPU contribution.
            ui.label(egui::RichText::new("Status").strong());
            ui.label(format!("Server:  {}", self.cfg.server));
            if self.donors.is_empty() {
                ui.label(egui::RichText::new("(idle — press Start)").weak());
            } else {
                let mut total_batches: u64 = 0;
                let mut total_spikes: u64 = 0;
                let mut connected = 0;
                for d in &self.donors {
                    let (conn, batches, spikes, note) = d
                        .control
                        .status
                        .lock()
                        .map(|s| (s.connected, s.batches, s.spikes_last, s.note.clone()))
                        .unwrap_or((false, 0, 0, String::new()));
                    if conn {
                        connected += 1;
                    }
                    total_batches += batches;
                    total_spikes += spikes;
                    let dot = if conn { "🟢" } else { "⚪" };
                    ui.label(format!("{dot} [{}] {} — {batches} batches · {spikes} spikes/batch  ({note})", d.gpu_index, d.gpu_name));
                }
                ui.add_space(4.0);
                ui.label(egui::RichText::new(format!(
                    "Your contribution:  {} GPU(s) connected · {total_batches} batches · {total_spikes} spikes/last-batch",
                    connected
                )).strong());
            }
        });
    }
}

/// Launch the GUI. Returns when the window closes.
pub fn run(cfg: DonorConfig, gpus: Vec<GpuInfo>) -> Result<(), String> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([520.0, 420.0]),
        ..Default::default()
    };
    eframe::run_native(
        "unity-donor",
        options,
        Box::new(|_cc| Ok(Box::new(DonorApp::new(cfg, gpus)))),
    )
    .map_err(|e| format!("GUI failed: {e}"))
}
