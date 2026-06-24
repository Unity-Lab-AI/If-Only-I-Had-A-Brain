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
    util: Vec<f32>,
    host: Option<RunningHost>,
}

impl DonorApp {
    fn new(cfg: DonorConfig, gpus: Vec<GpuInfo>) -> Self {
        // Safe default: enable only the LAST card @ 10%. GPU 0 is almost always the primary
        // DISPLAY GPU — running compute on it hitches the desktop — so we default to the
        // highest-indexed card (usually a spare). Single-GPU machines just enable that one.
        let last = gpus.len().saturating_sub(1);
        let enabled: Vec<bool> = gpus.iter().enumerate().map(|(i, _)| i == last).collect();
        let util: Vec<f32> = gpus.iter().map(|_| 10.0).collect();
        Self { cfg, gpus, enabled, util, host: None }
    }

    fn running(&self) -> bool {
        self.host.is_some()
    }

    fn any_enabled(&self) -> bool {
        self.enabled.iter().any(|&e| e)
    }

    /// Launch ONE donor that aggregates every enabled GPU into a single compute unit.
    fn start(&mut self) {
        let mut targets: Vec<GpuInfo> = Vec::new();
        let mut utils: Vec<u8> = Vec::new();
        for (i, g) in self.gpus.iter().enumerate() {
            if self.enabled[i] {
                targets.push(g.clone());
                utils.push(self.util[i].round().clamp(1.0, 100.0) as u8);
            }
        }
        if targets.is_empty() {
            return;
        }
        let count = targets.len();
        let (control, handle) = donor::spawn_donor(self.cfg.clone(), targets, utils);
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
            ui.hyperlink_to("📖 How it works / legend", "https://if-only-i-had-a-brain.git.unityailab.com/html/legend.html");
            ui.add_space(8.0);

            let running = self.running();

            ui.horizontal(|ui| {
                ui.label("Server:");
                ui.add_enabled(!running, egui::TextEdit::singleline(&mut self.cfg.server).desired_width(280.0));
            });
            // Auto-reconnect toggle — when ON (default), a dropped/closed connection
            // auto-rejoins after a short backoff instead of going dark. Editable only
            // while stopped (it's read when the session starts), matching the Server field.
            ui.add_enabled(
                !running,
                egui::Checkbox::new(&mut self.cfg.auto_restart_on_disconnect, "Auto-reconnect if the connection drops"),
            );
            ui.horizontal(|ui| {
                ui.label("Leaderboard name:");
                ui.add_enabled(!running, egui::TextEdit::singleline(&mut self.cfg.name).hint_text("(optional — anonymous)").desired_width(200.0));
            });
            ui.label(egui::RichText::new("Use the same name here + in the browser/other devices to combine your compute into one leaderboard entry. No sign-up.").weak().small());
            ui.add_space(8.0);

            ui.label(egui::RichText::new("GPUs  (enabled cards form ONE compute unit; each throttles to its own %)").strong());
            egui::Grid::new("gpus").num_columns(3).spacing([12.0, 6.0]).show(ui, |ui| {
                for (i, g) in self.gpus.iter().enumerate() {
                    ui.add_enabled(!running, egui::Checkbox::new(&mut self.enabled[i], ""));
                    let tag = if i == 0 { "  ⚠ likely your display GPU" } else { "" };
                    ui.label(format!("[{}] {}{}", g.index, g.name, tag));
                    ui.add_enabled(!running, egui::Slider::new(&mut self.util[i], 1.0..=100.0).suffix("%"));
                    ui.end_row();
                }
            });
            ui.label(egui::RichText::new(
                "⚠ Running compute on your display GPU (usually [0]) can lag your desktop, even at low %. \
                 Prefer a spare card. The per-matrix limit (~2047 MB) is a GPU/WebGPU hardware cap, \
                 not a limit on how much you contribute — the brain splits large data to fit."
            ).weak().small());
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
                    let (conn, gpu_name, batches, spikes, teach, note) = h
                        .control
                        .status
                        .lock()
                        .map(|s| (s.connected, s.gpu_name.clone(), s.batches, s.spikes_last, s.teach_ops, s.note.clone()))
                        .unwrap_or((false, String::new(), 0, 0, 0, String::new()));
                    let dot = if conn { "🟢" } else { "⚪" };
                    ui.label(format!("{dot} {} GPU(s) as one unit — {}", h.gpu_count, gpu_name));
                    ui.label(format!("    {batches} compute batches · {teach} teach ops · {spikes} spikes/last-batch  ({note})"));
                    ui.add_space(4.0);
                    ui.label(egui::RichText::new(format!(
                        "Your contribution:  {} · {batches} compute batches + {teach} teach ops",
                        if conn { "connected" } else { "connecting…" },
                    )).strong());
                    if conn && batches == 0 && teach > 0 {
                        ui.label(egui::RichText::new(
                            "(brain is in its teaching phase — your GPU runs the Hebbian/propagate work, not compute batches)"
                        ).weak().small());
                    }
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
    let r = eframe::run_native(
        "unity-donor",
        options,
        Box::new(|_cc| Ok(Box::new(DonorApp::new(cfg, gpus)))),
    )
    .map_err(|e| format!("GUI failed: {e}"));
    // The GUI (egui) and the compute engine each hold their own wgpu/Vulkan context. Tearing
    // them down together on exit can segfault inside the driver. The window is closed and the
    // process is ending anyway, so exit hard and let the OS reclaim everything — skip the
    // destructor race entirely.
    if r.is_ok() {
        std::process::exit(0);
    }
    r
}
