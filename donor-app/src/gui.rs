//! M4 — eframe/egui desktop GUI. Per-GPU include toggles + one host utilization slider,
//! safe Start/Stop, and a status panel (server + your contribution). Defaults: card 1
//! enabled @ 10%, and NOTHING runs until ▶ Start (safe start). The host registers as ONE
//! compute unit that drives every enabled GPU internally. Compiled only with `gui`.

use std::sync::atomic::Ordering;
use std::thread::JoinHandle;
use std::time::Duration;

use eframe::egui;

use crate::config::DonorConfig;
use crate::donor::{self, Control};
use crate::gpu::GpuInfo;

/// The single running host donor (drives all enabled GPUs internally).
struct RunningHost {
    control: Control,
    handle: JoinHandle<()>,
    gpu_count: usize,
}

struct DonorApp {
    cfg: DonorConfig,
    gpus: Vec<GpuInfo>,
    enabled: Vec<bool>,
    util: f32,
    host: Option<RunningHost>,
}

impl DonorApp {
    fn new(cfg: DonorConfig, gpus: Vec<GpuInfo>) -> Self {
        // Default: card 1 (index 0) enabled; host @ 10%. Nothing runs until ▶ Start.
        let enabled: Vec<bool> = gpus.iter().enumerate().map(|(i, _)| i == 0).collect();
        Self { cfg, gpus, enabled, util: 10.0, host: None }
    }

    fn running(&self) -> bool {
        self.host.is_some()
    }

    fn any_enabled(&self) -> bool {
        self.enabled.iter().any(|&e| e)
    }

    /// Launch ONE donor that aggregates every enabled GPU into a single compute unit.
    fn start(&mut self) {
        let targets: Vec<GpuInfo> = self
            .gpus
            .iter()
            .enumerate()
            .filter(|(i, _)| self.enabled[*i])
            .map(|(_, g)| g.clone())
            .collect();
        if targets.is_empty() {
            return;
        }
        let mut cfg = self.cfg.clone();
        cfg.utilization_pct = self.util.round().clamp(1.0, 100.0) as u8;
        let count = targets.len();
        let (control, handle) = donor::spawn_donor(cfg, targets);
        self.host = Some(RunningHost { control, handle, gpu_count: count });
    }

    fn stop(&mut self) {
        if let Some(h) = &self.host {
            h.control.stop.store(true, Ordering::Relaxed);
        }
    }
}

impl eframe::App for DonorApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint_after(Duration::from_millis(300));
        // Drop the host once its thread finishes (stopped / disconnected / failed) so
        // ▶ Start reappears.
        if self.host.as_ref().map(|h| h.handle.is_finished()).unwrap_or(false) {
            self.host = None;
        }

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

            ui.label(egui::RichText::new("GPUs  (all enabled cards form ONE compute unit)").strong());
            egui::Grid::new("gpus").num_columns(2).spacing([12.0, 6.0]).show(ui, |ui| {
                for (i, g) in self.gpus.iter().enumerate() {
                    ui.add_enabled(!running, egui::Checkbox::new(&mut self.enabled[i], ""));
                    ui.label(format!("[{}] {}  ({} MB binding cap)", g.index, g.name, g.max_storage_binding_mb));
                    ui.end_row();
                }
            });
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                ui.label("Host utilization:");
                ui.add_enabled(!running, egui::Slider::new(&mut self.util, 1.0..=100.0).suffix("%"));
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

            // Status — server + this host's contribution.
            ui.label(egui::RichText::new("Status").strong());
            ui.label(format!("Server:  {}", self.cfg.server));
            match &self.host {
                None => {
                    ui.label(egui::RichText::new("(idle — press Start)").weak());
                }
                Some(h) => {
                    let (conn, gpu_name, batches, spikes, note) = h
                        .control
                        .status
                        .lock()
                        .map(|s| (s.connected, s.gpu_name.clone(), s.batches, s.spikes_last, s.note.clone()))
                        .unwrap_or((false, String::new(), 0, 0, String::new()));
                    let dot = if conn { "🟢" } else { "⚪" };
                    ui.label(format!("{dot} {} GPU(s) as one unit — {}", h.gpu_count, gpu_name));
                    ui.label(format!("    {batches} batches · {spikes} spikes/last-batch  ({note})"));
                    ui.add_space(4.0);
                    ui.label(egui::RichText::new(format!(
                        "Your contribution:  {} · {total} compute batches done",
                        if conn { "connected" } else { "connecting…" },
                        total = batches
                    )).strong());
                }
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
