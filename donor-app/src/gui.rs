//! eframe/egui desktop GUI — "Unity Brain Donor".
//!
//! Tabbed redesign (Sponge spec DA.1–DA.13): Donate / Settings / Dashboard /
//! Leaderboard / About, 1280×720 resizable, brain+GPU icon, Live/Local server
//! radio, green/red Start-Stop, verbose status, per-GPU visibility. The host
//! still registers as ONE compute unit that drives every enabled GPU internally;
//! nothing runs until ▶ Start (safe start). Compiled only with the `gui` feature.
//!
//! THEME (Gee 2026-06-28): Light / Dark / System radios under Settings. Default
//! FOLLOWS THE OS (dark OS → dark, light OS → light) and can be overridden. Both
//! palettes are tuned for readability. Every changeable setting (theme, name,
//! server, per-GPU enable/%, auto-reconnect) PERSISTS to disk via
//! `config::DonorSettings`, so it's load-up-and-go with no reconfiguration.

use std::sync::atomic::Ordering;
use std::thread::JoinHandle;
use std::time::Duration;

use eframe::egui;

use crate::config::{self, DonorConfig, LOCAL_SERVER, PROD_SERVER};
use crate::donor::{self, Control};
use crate::gpu::GpuInfo;

const LEGEND_URL: &str = "https://if-only-i-had-a-brain.git.unityailab.com/html/legend.html";
const DASHBOARD_URL: &str = "https://if-only-i-had-a-brain.git.unityailab.com/html/dashboard-public.html";
const LEADERBOARD_URL: &str = "https://if-only-i-had-a-brain.git.unityailab.com/html/dashboard-public.html";

/// Runtime colour palette — replaces the old module-level `const`s so the same
/// widgets read correctly in BOTH light and dark themes. `Copy` so each `ui_*`
/// method can pull a local `let pal = self.pal;` and use it freely inside
/// closures without fighting the borrow checker against `&mut self`.
#[derive(Clone, Copy)]
struct Pal {
    accent: egui::Color32,
    accent_dim: egui::Color32,
    go_green: egui::Color32,
    stop_red: egui::Color32,
    text_bright: egui::Color32,
    text_dim: egui::Color32,
    warn: egui::Color32,
    panel: egui::Color32,
    window: egui::Color32,
}

fn pal(dark: bool) -> Pal {
    if dark {
        // DARK — near-white text on deep panels; light violet accent reads on dark.
        Pal {
            accent: egui::Color32::from_rgb(0xa7, 0x8b, 0xfa),     // light violet
            accent_dim: egui::Color32::from_rgb(0x4c, 0x3a, 0x80), // muted violet selection/hover fill
            go_green: egui::Color32::from_rgb(0x22, 0xc5, 0x5e),   // green-500
            stop_red: egui::Color32::from_rgb(0xef, 0x44, 0x44),   // red-500
            text_bright: egui::Color32::from_rgb(0xe8, 0xe8, 0xf0),// near-white primary text
            text_dim: egui::Color32::from_rgb(0xa1, 0xa1, 0xaa),   // zinc-400 secondary
            warn: egui::Color32::from_rgb(0xfb, 0xbf, 0x24),       // amber-400
            panel: egui::Color32::from_rgb(0x15, 0x15, 0x1c),      // deep panel
            window: egui::Color32::from_rgb(0x0d, 0x0d, 0x12),     // near-black window
        }
    } else {
        // LIGHT — near-black text on near-white panels; deep violet accent reads on white.
        Pal {
            accent: egui::Color32::from_rgb(0x6d, 0x28, 0xd9),     // deep violet
            accent_dim: egui::Color32::from_rgb(0xa7, 0x8b, 0xfa), // light violet selection/hover fill
            go_green: egui::Color32::from_rgb(0x15, 0x80, 0x3d),   // green-700 (white text legible)
            stop_red: egui::Color32::from_rgb(0xb9, 0x1c, 0x1c),   // red-700
            text_bright: egui::Color32::from_rgb(0x18, 0x18, 0x27),// near-black primary text
            text_dim: egui::Color32::from_rgb(0x52, 0x52, 0x5b),   // slate-600 secondary
            warn: egui::Color32::from_rgb(0xb4, 0x53, 0x09),       // amber-700 (readable on white)
            panel: egui::Color32::from_rgb(0xf7, 0xf7, 0xfb),      // off-white panel
            window: egui::Color32::from_rgb(0xff, 0xff, 0xff),     // pure white window
        }
    }
}

#[derive(PartialEq, Clone, Copy)]
enum Tab {
    Donate,
    Settings,
    Dashboard,
    Leaderboard,
    About,
}

#[derive(PartialEq, Clone, Copy)]
enum ServerMode {
    Live,
    Local,
    Custom,
}

/// Theme preference. `System` follows the OS (the default); Light/Dark force it.
#[derive(PartialEq, Clone, Copy)]
enum ThemeChoice {
    System,
    Light,
    Dark,
}

impl ThemeChoice {
    fn from_str(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "light" => ThemeChoice::Light,
            "dark" => ThemeChoice::Dark,
            _ => ThemeChoice::System,
        }
    }
    fn as_str(self) -> &'static str {
        match self {
            ThemeChoice::System => "system",
            ThemeChoice::Light => "light",
            ThemeChoice::Dark => "dark",
        }
    }
    /// Resolve to a concrete dark/light boolean. `System` reads the OS theme that
    /// the windowing backend reports (`raw.system_theme`); unknown → dark.
    fn resolve_dark(self, ctx: &egui::Context) -> bool {
        match self {
            ThemeChoice::Light => false,
            ThemeChoice::Dark => true,
            ThemeChoice::System => match ctx.input(|i| i.raw.system_theme) {
                Some(egui::Theme::Light) => false,
                Some(egui::Theme::Dark) => true,
                None => true, // OS theme not reported → default dark
            },
        }
    }
}

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
    tab: Tab,
    server_mode: ServerMode,
    theme: ThemeChoice,
    pal: Pal,
    /// Last dark/light actually pushed to egui — re-applied only on change (no per-frame churn).
    applied_dark: Option<bool>,
    /// Serialized snapshot of the last persisted settings — used to save only on real change.
    last_saved: String,
}

impl DonorApp {
    fn new(cfg: DonorConfig, gpus: Vec<GpuInfo>) -> Self {
        // Safe default: enable only the LAST card @ 10%. GPU 0 is almost always the primary
        // DISPLAY GPU — running compute on it hitches the desktop — so we default to the
        // highest-indexed card (usually a spare). Single-GPU machines just enable that one.
        let last = gpus.len().saturating_sub(1);
        let enabled: Vec<bool> = gpus.iter().enumerate().map(|(i, _)| i == last).collect();
        let util: Vec<f32> = gpus.iter().map(|_| 10.0).collect();
        let server_mode = if cfg.server == PROD_SERVER {
            ServerMode::Live
        } else if cfg.server == LOCAL_SERVER {
            ServerMode::Local
        } else {
            ServerMode::Custom
        };
        let mut app = Self {
            cfg,
            gpus,
            enabled,
            util,
            host: None,
            tab: Tab::Donate,
            server_mode,
            theme: ThemeChoice::System,
            pal: pal(true),
            applied_dark: None,
            last_saved: String::new(),
        };
        // "Load up and use it" — overlay any persisted settings on top of the CLI defaults.
        if let Some(s) = config::load_settings() {
            app.apply_settings(&s);
        }
        app.last_saved = serde_json::to_string(&app.current_settings()).unwrap_or_default();
        app
    }

    /// Build a `DonorSettings` snapshot of the current GUI state (for persistence).
    fn current_settings(&self) -> config::DonorSettings {
        config::DonorSettings {
            theme: self.theme.as_str().to_string(),
            server_mode: match self.server_mode {
                ServerMode::Live => "live",
                ServerMode::Local => "local",
                ServerMode::Custom => "custom",
            }
            .to_string(),
            server: self.cfg.server.clone(),
            name: self.cfg.name.clone(),
            enabled: self.enabled.clone(),
            util: self.util.clone(),
            auto_restart: self.cfg.auto_restart_on_disconnect,
        }
    }

    /// Apply persisted settings over the current state. Per-GPU arrays are applied
    /// only when their length matches the detected GPU count (same machine layout).
    fn apply_settings(&mut self, s: &config::DonorSettings) {
        self.theme = ThemeChoice::from_str(&s.theme);
        self.server_mode = match s.server_mode.as_str() {
            "local" => ServerMode::Local,
            "custom" => ServerMode::Custom,
            _ => ServerMode::Live,
        };
        self.cfg.server = match self.server_mode {
            ServerMode::Live => PROD_SERVER.to_string(),
            ServerMode::Local => LOCAL_SERVER.to_string(),
            ServerMode::Custom => {
                if s.server.trim().is_empty() {
                    self.cfg.server.clone()
                } else {
                    s.server.clone()
                }
            }
        };
        self.cfg.name = s.name.clone();
        self.cfg.auto_restart_on_disconnect = s.auto_restart;
        if s.enabled.len() == self.enabled.len() && !s.enabled.is_empty() {
            self.enabled = s.enabled.clone();
        }
        if s.util.len() == self.util.len() && !s.util.is_empty() {
            self.util = s.util.iter().map(|u| u.clamp(1.0, 100.0)).collect();
        }
    }

    /// Persist current settings if they changed since the last save (called each frame end).
    fn save_if_changed(&mut self) {
        let snap = self.current_settings();
        if let Ok(json) = serde_json::to_string(&snap) {
            if json != self.last_saved {
                config::save_settings(&snap);
                self.last_saved = json;
            }
        }
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

    /// Snapshot the live donor status (or a stopped default).
    fn status_snapshot(&self) -> (bool, String, u64, u64, u64, String) {
        match &self.host {
            None => (false, String::new(), 0, 0, 0, String::new()),
            Some(h) => h
                .control
                .status
                .lock()
                .map(|s| (s.connected, s.gpu_name.clone(), s.batches, s.spikes_last, s.teach_ops, s.note.clone()))
                .unwrap_or((false, String::new(), 0, 0, 0, String::new())),
        }
    }

    /// DA.8 — derive a human task-state from the raw status fields.
    fn task_state(&self, pal: Pal, conn: bool, batches: u64, teach: u64, note: &str) -> (&'static str, egui::Color32) {
        if self.host.is_none() {
            return ("Idle — press Start", pal.text_dim);
        }
        if !conn {
            if note.contains("reconnect") {
                return ("Reconnecting…", pal.warn);
            }
            return ("Connecting…", pal.warn);
        }
        let n = note.to_lowercase();
        if teach > 0 && (batches == 0 || n.contains("teach") || n.contains("hebbian")) {
            return ("Working — teaching task (Hebbian / propagate)", pal.go_green);
        }
        if n.contains("comput") || batches > 0 {
            return ("Working — compute task (brain tick)", pal.go_green);
        }
        if n.contains("regist") {
            return ("Registered — waiting for the brain to hand out work", pal.accent);
        }
        ("Connected — idle, waiting for a task", pal.accent)
    }

    /// TU.20.10 — the BRAIN SERVER's status as this donor sees it from the
    /// connect/register handshake. Gee: "Brain status: accepting GPUs / NOT
    /// active". Connected + registered ⇒ the brain is up and taking donor GPUs;
    /// a running host that can't connect ⇒ the brain is NOT active (down / not
    /// reachable); no host ⇒ nothing to report yet.
    fn brain_status(&self, pal: Pal, conn: bool, note: &str) -> (String, egui::Color32) {
        // TU.20.12 — refused as an incompatible/out-of-date binary. Distinct from
        // "can't reach the brain" — the brain IS up, it rejected this version.
        if note.to_lowercase().contains("incompatible") {
            return (format!("Brain status: refused — {note}"), pal.warn);
        }
        if self.host.is_none() {
            return ("Brain status: — (press Start to connect)".to_string(), pal.text_dim);
        }
        if conn {
            let n = note.to_lowercase();
            // Connected and past registration = the brain accepted us into the pool.
            if n.contains("regist") || n.contains("teach") || n.contains("comput") || n.contains("hebbian") {
                return ("Brain status: accepting GPUs ✓".to_string(), pal.go_green);
            }
            return ("Brain status: accepting GPUs (registering…)".to_string(), pal.go_green);
        }
        if note.to_lowercase().contains("reconnect") {
            return ("Brain status: NOT active — reconnecting…".to_string(), pal.warn);
        }
        ("Brain status: NOT active — can't reach the brain".to_string(), pal.warn)
    }
}

impl eframe::App for DonorApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint_after(Duration::from_millis(300));

        // Resolve + apply the theme. System mode tracks the OS live (a mid-session
        // OS light↔dark switch repaints correctly); manual modes pin it.
        let dark = self.theme.resolve_dark(ctx);
        self.pal = pal(dark);
        if self.applied_dark != Some(dark) {
            apply_theme(ctx, dark, self.pal);
            self.applied_dark = Some(dark);
        }

        // Drop the host once its thread finishes (stopped / disconnected / failed) so
        // ▶ Start reappears. With auto-reconnect ON the thread stays alive across drops,
        // so this only fires on a genuine Stop / fatal exit.
        if self.host.as_ref().map(|h| h.handle.is_finished()).unwrap_or(false) {
            self.host = None;
        }

        // ── Tab bar (DA.6) ────────────────────────────────────────────────
        egui::TopBottomPanel::top("tabs").show(ctx, |ui| {
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.add_space(6.0);
                ui.selectable_value(&mut self.tab, Tab::Donate, egui::RichText::new("  Donate  ").size(15.0));
                ui.selectable_value(&mut self.tab, Tab::Settings, egui::RichText::new("  Settings  ").size(15.0));
                ui.selectable_value(&mut self.tab, Tab::Dashboard, egui::RichText::new("  Dashboard  ").size(15.0));
                ui.selectable_value(&mut self.tab, Tab::Leaderboard, egui::RichText::new("  Leaderboard  ").size(15.0));
                ui.selectable_value(&mut self.tab, Tab::About, egui::RichText::new("  About  ").size(15.0));
            });
            ui.add_space(4.0);
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| match self.tab {
                Tab::Donate => self.ui_donate(ui),
                Tab::Settings => self.ui_settings(ui),
                Tab::Dashboard => self.ui_dashboard(ui),
                Tab::Leaderboard => self.ui_leaderboard(ui),
                Tab::About => self.ui_about(ui),
            });
        });

        // Persist any setting the user changed this frame (theme, name, server,
        // per-GPU enable/%, auto-reconnect) — debounced to real changes only.
        self.save_if_changed();
    }
}

impl DonorApp {
    // ── DA.7 — Donate tab ─────────────────────────────────────────────────
    fn ui_donate(&mut self, ui: &mut egui::Ui) {
        let pal = self.pal;
        let running = self.running();

        ui.add_space(10.0);
        ui.vertical_centered(|ui| {
            ui.label(egui::RichText::new("Brain Donor").size(30.0).strong().color(pal.accent));
            ui.label(egui::RichText::new("Donate your GPU compute to the Unity Brain").size(14.0).color(pal.text_dim));
            ui.hyperlink_to(egui::RichText::new("📖 How it works / legend").color(pal.accent), LEGEND_URL);
        });
        ui.add_space(14.0);

        // Hard-coded server with Live/Local radio (DA.7).
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(egui::RichText::new("Server").strong().color(pal.text_bright));
            ui.horizontal(|ui| {
                let prev = self.server_mode;
                ui.add_enabled_ui(!running, |ui| {
                    ui.radio_value(&mut self.server_mode, ServerMode::Live, "Live (production brain)");
                    ui.radio_value(&mut self.server_mode, ServerMode::Local, "Local (localhost:7525)");
                });
                if self.server_mode != prev {
                    match self.server_mode {
                        ServerMode::Live => self.cfg.server = PROD_SERVER.to_string(),
                        ServerMode::Local => self.cfg.server = LOCAL_SERVER.to_string(),
                        ServerMode::Custom => {}
                    }
                }
            });
            ui.label(egui::RichText::new(&self.cfg.server).small().color(pal.text_dim));
        });
        ui.add_space(10.0);

        // Leaderboard name — bigger field + bigger helper text (DA.7).
        ui.horizontal(|ui| {
            ui.label(egui::RichText::new("Leaderboard name:").size(15.0).color(pal.text_bright));
            ui.add_enabled(!running, egui::TextEdit::singleline(&mut self.cfg.name).hint_text("(optional — anonymous)").desired_width(260.0));
        });
        ui.label(egui::RichText::new(
            "Use the same name here + in the browser / other devices to combine all your compute into ONE leaderboard entry. No sign-up.",
        ).size(13.0).color(pal.text_dim));
        ui.add_space(12.0);

        // Read-only summary of the selected GPU config (DA.7 — editing lives in Settings).
        let sel: Vec<String> = self
            .gpus
            .iter()
            .enumerate()
            .filter(|(i, _)| self.enabled[*i])
            .map(|(i, g)| format!("[{}] {} @ {}%", g.index, g.name, self.util[i].round() as u8))
            .collect();
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(egui::RichText::new("Selected GPUs (edit in Settings)").strong().color(pal.text_bright));
            if sel.is_empty() {
                ui.label(egui::RichText::new("none — enable a card in Settings").color(pal.stop_red));
            } else {
                for s in &sel {
                    ui.label(egui::RichText::new(format!("• {s}")).color(pal.text_bright));
                }
                ui.label(egui::RichText::new(format!("{} card(s) acting as ONE compute unit", sel.len())).small().color(pal.text_dim));
            }
        });
        ui.add_space(14.0);

        // Green Start / red Stop (DA.7).
        ui.vertical_centered(|ui| {
            if !running {
                let btn = egui::Button::new(egui::RichText::new("▶  Start donating").size(17.0).color(egui::Color32::WHITE)).fill(pal.go_green).min_size(egui::vec2(220.0, 40.0));
                if ui.add_enabled(self.any_enabled(), btn).clicked() {
                    self.start();
                }
            } else {
                let btn = egui::Button::new(egui::RichText::new("⏹  Stop").size(17.0).color(egui::Color32::WHITE)).fill(pal.stop_red).min_size(egui::vec2(220.0, 40.0));
                if ui.add(btn).clicked() {
                    self.stop();
                }
            }
        });
        ui.add_space(12.0);
        ui.separator();
        ui.add_space(8.0);

        // ── Verbose status (DA.8) + per-GPU visibility (DA.5) ──────────────
        let (conn, gpu_name, batches, spikes, teach, note) = self.status_snapshot();
        let (state_label, state_color) = self.task_state(pal, conn, batches, teach, &note);
        ui.horizontal(|ui| {
            ui.label(egui::RichText::new(if conn { "🟢" } else if self.host.is_some() { "🟡" } else { "⚪" }).size(16.0));
            ui.label(egui::RichText::new(state_label).strong().color(state_color));
        });
        // TU.20.10 — brain server status line (accepting GPUs / NOT active).
        let (brain_label, brain_color) = self.brain_status(pal, conn, &note);
        ui.label(egui::RichText::new(brain_label).strong().color(brain_color));
        if !gpu_name.is_empty() {
            ui.label(egui::RichText::new(format!("Unit: {gpu_name}")).color(pal.text_dim));
        }
        ui.label(egui::RichText::new(format!(
            "Your contribution:  {batches} compute batches · {teach} teach ops · {spikes} spikes/last-batch",
        )).color(pal.text_bright));
        if !note.is_empty() {
            ui.label(egui::RichText::new(format!("({note})")).small().color(pal.text_dim));
        }

        // Per-GPU rows — what each card is doing (DA.5). The aggregate work
        // counters above are host-wide (the cards register as one unit);
        // per-card live throughput needs an engine-side counter (noted in the
        // About tab). Here we show each enabled card + its configured share.
        ui.add_space(6.0);
        ui.label(egui::RichText::new("Per-GPU").strong().color(pal.text_bright));
        egui::Grid::new("donate-pergpu").num_columns(3).spacing([14.0, 4.0]).striped(true).show(ui, |ui| {
            for (i, g) in self.gpus.iter().enumerate() {
                if !self.enabled[i] {
                    continue;
                }
                let dot = if running && conn { egui::RichText::new("●").color(pal.go_green) } else { egui::RichText::new("○").color(pal.text_dim) };
                ui.label(dot);
                ui.label(egui::RichText::new(format!("[{}] {}", g.index, g.name)).color(pal.text_bright));
                ui.label(egui::RichText::new(format!("{}% share", self.util[i].round() as u8)).color(pal.text_dim));
                ui.end_row();
            }
        });
    }

    // ── DA.9 — Settings tab (all the editable config) ─────────────────────
    fn ui_settings(&mut self, ui: &mut egui::Ui) {
        let pal = self.pal;
        let running = self.running();
        ui.add_space(8.0);
        ui.label(egui::RichText::new("Settings").size(22.0).strong().color(pal.accent));
        ui.label(egui::RichText::new("Everything here is saved on this machine — set it once, just launch and donate next time.").size(13.0).color(pal.text_dim));
        if running {
            ui.label(egui::RichText::new("Stop donating to change GPU selection / server.").color(pal.warn));
        }
        ui.add_space(10.0);

        // ── Theme (Light / Dark / System) — readable in both; System follows the OS ──
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(egui::RichText::new("Theme").strong().color(pal.text_bright));
            ui.horizontal(|ui| {
                ui.radio_value(&mut self.theme, ThemeChoice::System, "System (follow OS)");
                ui.radio_value(&mut self.theme, ThemeChoice::Light, "Light");
                ui.radio_value(&mut self.theme, ThemeChoice::Dark, "Dark");
            });
            let now = if self.applied_dark == Some(true) { "dark" } else { "light" };
            ui.label(egui::RichText::new(format!("Currently showing: {now}")).small().color(pal.text_dim));
        });
        ui.add_space(12.0);

        ui.label(egui::RichText::new("GPUs (enabled cards form ONE compute unit; each throttles to its own %)").strong().color(pal.text_bright));
        egui::Grid::new("settings-gpus").num_columns(3).spacing([12.0, 6.0]).show(ui, |ui| {
            for (i, g) in self.gpus.iter().enumerate() {
                ui.add_enabled(!running, egui::Checkbox::new(&mut self.enabled[i], ""));
                let tag = if i == 0 { "  ⚠ likely your display GPU" } else { "" };
                ui.label(egui::RichText::new(format!("[{}] {}{}", g.index, g.name, tag)).color(pal.text_bright));
                ui.add_enabled(!running, egui::Slider::new(&mut self.util[i], 1.0..=100.0).suffix("%"));
                ui.end_row();
            }
        });
        ui.label(egui::RichText::new(
            "⚠ Running compute on your display GPU (usually [0]) can lag your desktop, even at low %. \
             Prefer a spare card. The per-matrix limit (~2047 MB) is a GPU/WebGPU hardware cap, \
             not a limit on how much you contribute — the brain splits large data to fit.",
        ).size(13.0).color(pal.text_dim));
        ui.add_space(12.0);

        ui.add_enabled(
            !running,
            egui::Checkbox::new(&mut self.cfg.auto_restart_on_disconnect, "Auto-reconnect if the connection drops"),
        );
        ui.add_space(8.0);

        ui.horizontal(|ui| {
            ui.label(egui::RichText::new("Leaderboard name:").color(pal.text_bright));
            ui.add_enabled(!running, egui::TextEdit::singleline(&mut self.cfg.name).hint_text("(optional — anonymous)").desired_width(240.0));
        });
        ui.add_space(8.0);

        ui.label(egui::RichText::new("Server").strong().color(pal.text_bright));
        ui.add_enabled_ui(!running, |ui| {
            let prev = self.server_mode;
            ui.radio_value(&mut self.server_mode, ServerMode::Live, "Live (production brain)");
            ui.radio_value(&mut self.server_mode, ServerMode::Local, "Local (localhost:7525)");
            ui.radio_value(&mut self.server_mode, ServerMode::Custom, "Custom");
            if self.server_mode != prev {
                match self.server_mode {
                    ServerMode::Live => self.cfg.server = PROD_SERVER.to_string(),
                    ServerMode::Local => self.cfg.server = LOCAL_SERVER.to_string(),
                    ServerMode::Custom => {}
                }
            }
            ui.add_enabled(
                self.server_mode == ServerMode::Custom,
                egui::TextEdit::singleline(&mut self.cfg.server).desired_width(320.0),
            );
        });
    }

    // ── DA.10 — Dashboard tab (mini public dashboard) ─────────────────────
    fn ui_dashboard(&mut self, ui: &mut egui::Ui) {
        let pal = self.pal;
        ui.add_space(8.0);
        ui.label(egui::RichText::new("Dashboard").size(22.0).strong().color(pal.accent));
        ui.add_space(6.0);
        let (conn, gpu_name, batches, spikes, teach, note) = self.status_snapshot();
        let (state_label, state_color) = self.task_state(pal, conn, batches, teach, &note);
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(egui::RichText::new("This machine").strong().color(pal.text_bright));
            ui.label(egui::RichText::new(state_label).color(state_color));
            ui.label(egui::RichText::new(format!("Unit: {}", if gpu_name.is_empty() { "—".into() } else { gpu_name })).color(pal.text_dim));
            ui.label(egui::RichText::new(format!("{batches} compute batches · {teach} teach ops · {spikes} spikes/last-batch")).color(pal.text_bright));
            ui.label(egui::RichText::new(format!("Server: {}", self.cfg.server)).small().color(pal.text_dim));
        });
        ui.add_space(10.0);
        ui.label(egui::RichText::new(
            "Live brain-wide stats (grades, neuron count, donor pool, basin health) stream on the full public dashboard:",
        ).color(pal.text_dim));
        ui.hyperlink_to(egui::RichText::new("🧠 Open the live public dashboard").color(pal.accent), DASHBOARD_URL);
    }

    // ── DA.11 — Leaderboard tab ───────────────────────────────────────────
    fn ui_leaderboard(&mut self, ui: &mut egui::Ui) {
        let pal = self.pal;
        ui.add_space(8.0);
        ui.label(egui::RichText::new("Leaderboard").size(22.0).strong().color(pal.accent));
        ui.add_space(6.0);
        let label = if self.cfg.name.trim().is_empty() {
            "anonymous (set a name in Settings to climb the board)".to_string()
        } else {
            self.cfg.name.clone()
        };
        let (_, _, batches, _, teach, _) = self.status_snapshot();
        egui::Frame::group(ui.style()).show(ui, |ui| {
            ui.label(egui::RichText::new("You").strong().color(pal.text_bright));
            ui.label(egui::RichText::new(format!("name: {label}")).color(pal.accent));
            ui.label(egui::RichText::new(format!("this session: {batches} compute batches · {teach} teach ops")).color(pal.text_bright));
            ui.label(egui::RichText::new(
                "Everyone using the SAME name (browser + every device) is summed into one row.",
            ).small().color(pal.text_dim));
        });
        ui.add_space(10.0);
        ui.label(egui::RichText::new("Full neuron-contribution leaderboard (all donors):").color(pal.text_dim));
        ui.hyperlink_to(egui::RichText::new("🏆 Open the live leaderboard").color(pal.accent), LEADERBOARD_URL);
    }

    // ── DA.12 — About tab ─────────────────────────────────────────────────
    fn ui_about(&mut self, ui: &mut egui::Ui) {
        let pal = self.pal;
        ui.add_space(8.0);
        ui.label(egui::RichText::new("Unity Brain Donor").size(22.0).strong().color(pal.accent));
        ui.label(egui::RichText::new(format!("v{}", env!("CARGO_PKG_VERSION"))).color(pal.text_dim));
        ui.add_space(8.0);
        ui.label(egui::RichText::new(
            "A native GPU compute donor for the Unity Brain — a living, always-on equational \
             neural simulation. Your GPU runs the same brain math the browser donor does, with \
             bigger buffers, no tab-sleep drops, multi-GPU support, and an optional CUDA backend \
             for NVIDIA cards (automatic WebGPU fallback otherwise).",
        ).color(pal.text_bright));
        ui.add_space(8.0);
        ui.label(egui::RichText::new("Nothing is uploaded from your machine — your GPU only does math the server hands it; the brain weights stay on the server.").size(13.0).color(pal.text_dim));
        ui.add_space(10.0);
        ui.hyperlink_to(egui::RichText::new("📖 How it works / legend").color(pal.accent), LEGEND_URL);
        ui.hyperlink_to(egui::RichText::new("🧠 Public dashboard").color(pal.accent), DASHBOARD_URL);
        ui.add_space(10.0);
        ui.label(egui::RichText::new(
            "Note: per-GPU live throughput and the in-app dashboard/leaderboard show this machine's \
             own data + link to the full web views; brain-wide live numbers are on the public dashboard.",
        ).size(13.0).color(pal.text_dim));
    }
}

/// Apply the resolved theme to egui — base light/dark visuals plus the palette's
/// accent/selection/panel colours so both themes stay high-contrast + readable.
fn apply_theme(ctx: &egui::Context, dark: bool, pal: Pal) {
    let mut v = if dark { egui::Visuals::dark() } else { egui::Visuals::light() };
    v.override_text_color = Some(pal.text_bright);
    v.hyperlink_color = pal.accent;
    v.selection.bg_fill = pal.accent_dim;
    v.selection.stroke = egui::Stroke::new(1.0, pal.accent);
    v.widgets.hovered.bg_fill = pal.accent_dim;
    v.widgets.active.bg_fill = pal.accent_dim;
    v.panel_fill = pal.panel;
    v.window_fill = pal.window;
    ctx.set_visuals(v);
}

/// DA.4 — procedural brain+GPU icon (no asset/dep): a violet brain disc with a
/// darker GPU card rectangle inside it, on transparent background. 64×64 RGBA.
fn brain_gpu_icon() -> egui::IconData {
    let w: i32 = 64;
    let h: i32 = 64;
    let mut rgba = vec![0u8; (w * h * 4) as usize];
    let cx = 32.0_f32;
    let cy = 30.0_f32;
    let r = 27.0_f32;
    for y in 0..h {
        for x in 0..w {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            let idx = ((y * w + x) * 4) as usize;
            if dist <= r {
                // brain disc — violet, brighter toward the centre
                let t = (1.0 - dist / r).clamp(0.0, 1.0);
                let (br, bg, bb) = (0x7c, 0x3a, 0xed);
                let (lr, lg, lb) = (0xc0, 0x84, 0xfc);
                rgba[idx] = (br as f32 + (lr - br) as f32 * t) as u8;
                rgba[idx + 1] = (bg as f32 + (lg - bg) as f32 * t) as u8;
                rgba[idx + 2] = (bb as f32 + (lb - bb) as f32 * t) as u8;
                rgba[idx + 3] = 255;
            }
            // GPU card rectangle inside the brain (dark slab + green strip)
            if (16..48).contains(&x) && (26..40).contains(&y) {
                rgba[idx] = 0x10;
                rgba[idx + 1] = 0x10;
                rgba[idx + 2] = 0x18;
                rgba[idx + 3] = 255;
                if (36..39).contains(&y) {
                    rgba[idx] = 0x22;
                    rgba[idx + 1] = 0xc5;
                    rgba[idx + 2] = 0x5e;
                }
            }
        }
    }
    egui::IconData { rgba, width: w as u32, height: h as u32 }
}

/// Launch the GUI. Returns when the window closes.
pub fn run(cfg: DonorConfig, gpus: Vec<GpuInfo>) -> Result<(), String> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1280.0, 720.0])      // DA.1
            .with_min_inner_size([900.0, 560.0])
            .with_resizable(true)                   // DA.1
            .with_title("Unity Brain Donor")        // DA.2
            .with_app_id("unity-brain-donor")       // DA.3 — Wayland/Linux display id
            .with_icon(brain_gpu_icon()),           // DA.4
        ..Default::default()
    };
    let r = eframe::run_native(
        "Unity Brain Donor", // DA.2 — window/app name
        options,
        Box::new(|cc| {
            let app = DonorApp::new(cfg, gpus);
            // Paint the right theme on the very first frame (no flash): resolve the
            // app's preference against the OS theme the backend already reported.
            let dark = app.theme.resolve_dark(&cc.egui_ctx);
            apply_theme(&cc.egui_ctx, dark, pal(dark));
            Ok(Box::new(app))
        }),
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
