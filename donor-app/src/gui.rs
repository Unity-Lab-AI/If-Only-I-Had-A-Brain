//! M4 — eframe/egui desktop GUI. Per-GPU toggle + utilization slider, safe Start/Stop,
//! and a status panel (server + your contribution). Defaults: card 1 enabled @ 10%, and
//! NOTHING runs until ▶ Start (safe start). Compiled only with the `gui` feature.

use std::thread::JoinHandle;
use std::time::Duration;

use eframe::egui;

use crate::config::DonorConfig;
use crate::donor::{self, Control};
use crate::gpu::GpuInfo;

struct DonorApp {
    cfg: DonorConfig,
    gpus: Vec<GpuInfo>,
    enabled: Vec<bool>,
    util: Vec<f32>,
    control: Option<Control>,
    handle: Option<JoinHandle<()>>,
    running: bool,
}

impl DonorApp {
    fn new(cfg: DonorConfig, gpus: Vec<GpuInfo>) -> Self {
        // Default: card 1 (index 0) enabled @ 10%; everything else off @ 10%.
        let enabled: Vec<bool> = gpus.iter().enumerate().map(|(i, _)| i == 0).collect();
        let util: Vec<f32> = gpus.iter().map(|_| 10.0).collect();
        Self { cfg, gpus, enabled, util, control: None, handle: None, running: false }
    }

    fn first_enabled(&self) -> Option<usize> {
        self.enabled.iter().position(|&e| e)
    }

    fn start(&mut self) {
        let Some(idx) = self.first_enabled() else { return };
        let mut cfg = self.cfg.clone();
        cfg.utilization_pct = self.util[idx].round().clamp(1.0, 100.0) as u8;
        let gpu = self.gpus[idx].clone();
        let control = Control::new();
        let c2 = control.clone();
        let handle = std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
            if let Err(e) = rt.block_on(donor::run_donor(cfg, gpu, c2.clone())) {
                if let Ok(mut s) = c2.status.lock() {
                    s.note = format!("error: {e}");
                    s.connected = false;
                }
            }
        });
        self.control = Some(control);
        self.handle = Some(handle);
        self.running = true;
    }

    fn stop(&mut self) {
        if let Some(c) = &self.control {
            c.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        self.running = false;
    }
}

impl eframe::App for DonorApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Live-refresh the status panel while running.
        ctx.request_repaint_after(Duration::from_millis(300));

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("unity-donor");
            ui.label(egui::RichText::new("Donate GPU compute to the Unity brain").weak());
            ui.add_space(8.0);

            ui.horizontal(|ui| {
                ui.label("Server:");
                ui.add_enabled(!self.running, egui::TextEdit::singleline(&mut self.cfg.server).desired_width(280.0));
            });
            ui.add_space(8.0);

            ui.label(egui::RichText::new("GPUs").strong());
            egui::Grid::new("gpus").num_columns(3).spacing([12.0, 6.0]).show(ui, |ui| {
                for (i, g) in self.gpus.iter().enumerate() {
                    ui.add_enabled(!self.running, egui::Checkbox::new(&mut self.enabled[i], ""));
                    ui.label(format!("[{}] {}  ({} MB cap)", g.index, g.name, g.max_storage_binding_mb));
                    ui.add_enabled(
                        !self.running,
                        egui::Slider::new(&mut self.util[i], 0.0..=100.0).suffix("%").text("util"),
                    );
                    ui.end_row();
                }
            });
            ui.add_space(10.0);

            ui.horizontal(|ui| {
                if !self.running {
                    let can_start = self.first_enabled().is_some();
                    if ui.add_enabled(can_start, egui::Button::new("▶  Start")).clicked() {
                        self.start();
                    }
                } else if ui.button("⏹  Stop").clicked() {
                    self.stop();
                }
            });
            ui.add_space(12.0);
            ui.separator();

            // Status panel — server + your contribution.
            ui.add_space(6.0);
            ui.label(egui::RichText::new("Status").strong());
            let (connected, gpu_name, batches, spikes, note) = self
                .control
                .as_ref()
                .and_then(|c| c.status.lock().ok())
                .map(|s| (s.connected, s.gpu_name.clone(), s.batches, s.spikes_last, s.note.clone()))
                .unwrap_or((false, String::new(), 0, 0, "idle".into()));

            ui.label(format!("Server:  {}  —  {}", self.cfg.server, if connected { "connected" } else { "not connected" }));
            if self.running || batches > 0 {
                ui.label(format!("Your contribution:  {}", if gpu_name.is_empty() { "(starting…)".into() } else { gpu_name }));
                ui.label(format!("    {batches} compute batches · {spikes} spikes/last-batch"));
            }
            ui.label(egui::RichText::new(format!("({note})")).weak());
        });
    }
}

/// Launch the GUI. Returns when the window closes.
pub fn run(cfg: DonorConfig, gpus: Vec<GpuInfo>) -> Result<(), String> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([460.0, 380.0]),
        ..Default::default()
    };
    eframe::run_native(
        "unity-donor",
        options,
        Box::new(|_cc| Ok(Box::new(DonorApp::new(cfg, gpus)))),
    )
    .map_err(|e| format!("GUI failed: {e}"))
}
