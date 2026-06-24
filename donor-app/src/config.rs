use crate::cli::Cli;

/// Public production donor endpoint — the nginx `/ws` lane on the box, the same URL the
/// browser donor (compute.html) connects to. This is the DEFAULT so a distributed binary
/// donates to the live brain out of the box.
pub const PROD_SERVER: &str = "wss://if-only-i-had-a-brain.git.unityailab.com/ws";
/// Local brain for testing (`--local`).
pub const LOCAL_SERVER: &str = "ws://localhost:7525";

/// Which GPUs to donate.
#[derive(Debug, Clone, PartialEq)]
pub enum GpuSelection {
    All,
    Indices(Vec<usize>),
}

/// Per-GPU memory cap.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MemoryCap {
    All,
    MegaBytes(u64),
}

/// Resolved donor configuration — produced from CLI flags, or mutated live by the GUI.
#[derive(Debug, Clone)]
pub struct DonorConfig {
    pub server: String,
    pub name: String,
    pub gpus: GpuSelection,
    /// Target compute utilization per GPU, 0–100 (duty-cycle target).
    pub utilization_pct: u8,
    pub memory: MemoryCap,
    pub headless: bool,
    pub autostart: bool,
    /// Auto-reconnect after an UNEXPECTED disconnect (default ON). A user Stop /
    /// Ctrl+C never reconnects; only a dropped/closed/failed connection does.
    pub auto_restart_on_disconnect: bool,
}

impl DonorConfig {
    pub fn from_cli(cli: &Cli) -> Result<Self, String> {
        // Precedence: explicit --server > --local > production default.
        let server = cli.server.clone().unwrap_or_else(|| {
            if cli.local { LOCAL_SERVER.to_string() } else { PROD_SERVER.to_string() }
        });
        Ok(DonorConfig {
            server,
            name: cli.name.clone(),
            gpus: parse_gpus(&cli.gpus)?,
            utilization_pct: parse_utilization(&cli.utilization)?,
            memory: parse_memory(&cli.memory)?,
            headless: cli.headless,
            // Headless donors autostart by default (no operator to press Start); the GUI
            // defaults to NOT autostarting (safe start — must press ▶ Start).
            autostart: cli.autostart || cli.headless,
            // Default ON — a dropped donor rejoins on its own. `--no-auto-restart` opts out.
            auto_restart_on_disconnect: !cli.no_auto_restart,
        })
    }

    /// Does this config include the given adapter index?
    pub fn includes(&self, idx: usize) -> bool {
        match &self.gpus {
            GpuSelection::All => true,
            GpuSelection::Indices(v) => v.contains(&idx),
        }
    }
}

fn parse_gpus(s: &str) -> Result<GpuSelection, String> {
    let t = s.trim();
    if t.eq_ignore_ascii_case("all") {
        return Ok(GpuSelection::All);
    }
    let mut out = Vec::new();
    for part in t.split(',') {
        let p = part.trim();
        if p.is_empty() {
            continue;
        }
        let n: usize = p
            .parse()
            .map_err(|_| format!("invalid --gpus entry '{p}' (expected indices or 'all')"))?;
        if !out.contains(&n) {
            out.push(n);
        }
    }
    if out.is_empty() {
        return Err("--gpus produced no indices".into());
    }
    Ok(GpuSelection::Indices(out))
}

fn parse_utilization(s: &str) -> Result<u8, String> {
    let t = s.trim();
    if t.eq_ignore_ascii_case("all") {
        return Ok(100);
    }
    let n: u32 = t
        .trim_end_matches('%')
        .parse()
        .map_err(|_| format!("invalid --utilization '{s}' (expected 0-100 or 'all')"))?;
    if n > 100 {
        return Err("--utilization must be 0-100".into());
    }
    Ok(n as u8)
}

fn parse_memory(s: &str) -> Result<MemoryCap, String> {
    let t = s.trim();
    if t.eq_ignore_ascii_case("all") {
        return Ok(MemoryCap::All);
    }
    let mb: u64 = t
        .trim_end_matches("MB")
        .trim_end_matches("mb")
        .trim()
        .parse()
        .map_err(|_| format!("invalid --memory '{s}' (expected MB or 'all')"))?;
    Ok(MemoryCap::MegaBytes(mb))
}

/// A persistent per-install donor id — keys this host's cumulative leaderboard total across
/// restarts (separate from the optional display name). Stored in the user's data dir; generated
/// from time+pid on first run. Ephemeral fallback if the file can't be written (still works for
/// the session). The brain aggregates by NAME when set, else by this id.
pub fn persistent_donor_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let base = std::env::var("XDG_DATA_HOME")
        .ok()
        .or_else(|| std::env::var("HOME").ok().map(|h| format!("{h}/.local/share")))
        .or_else(|| std::env::var("APPDATA").ok())
        .or_else(|| std::env::var("USERPROFILE").ok())
        .unwrap_or_else(|| ".".to_string());
    let dir = std::path::Path::new(&base).join("unity-donor");
    let path = dir.join("donor-id");
    if let Ok(s) = std::fs::read_to_string(&path) {
        let t = s.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let id = format!("native-{nanos:x}-{:x}", std::process::id());
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&path, &id);
    id
}
