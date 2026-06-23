use crate::cli::Cli;

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
}

impl DonorConfig {
    pub fn from_cli(cli: &Cli) -> Result<Self, String> {
        Ok(DonorConfig {
            server: cli.server.clone(),
            name: cli.name.clone(),
            gpus: parse_gpus(&cli.gpus)?,
            utilization_pct: parse_utilization(&cli.utilization)?,
            memory: parse_memory(&cli.memory)?,
            headless: cli.headless,
            // Headless donors autostart by default (no operator to press Start); the GUI
            // defaults to NOT autostarting (safe start — must press ▶ Start).
            autostart: cli.autostart || cli.headless,
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
