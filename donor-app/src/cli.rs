use clap::Parser;

/// Native GPU compute donor for the Unity brain.
///
/// GUI by default; `--headless` (or the `--no-default-features` build) runs without a
/// window for servers/RunPod. Donate specific GPUs or all, at a chosen utilization.
#[derive(Parser, Debug, Clone)]
#[command(name = "unity-donor", version, about)]
pub struct Cli {
    /// Brain WebSocket URL (e.g. ws://localhost:7525 or wss://host/ws).
    #[arg(long, default_value = "ws://localhost:7525")]
    pub server: String,

    /// Donor label shown in the admin telemetry.
    #[arg(long, default_value = "native-donor")]
    pub name: String,

    /// List detected GPUs (index, name, VRAM, max buffer) and exit.
    #[arg(long)]
    pub list_gpus: bool,

    /// Which GPUs to donate: a comma list of indices, or "all". Default: card 1 (index 0).
    #[arg(long, default_value = "0")]
    pub gpus: String,

    /// Target compute utilization per GPU via duty-cycling: a percent 0-100, or "all" (=100).
    #[arg(long, default_value = "10")]
    pub utilization: String,

    /// GPU memory cap per GPU in MB, or "all" (no cap). Default: all.
    #[arg(long, default_value = "all")]
    pub memory: String,

    /// Run without the GUI (GUI build only; the no-default-features build is always headless).
    #[arg(long)]
    pub headless: bool,

    /// Begin donating immediately on launch (headless implies true; GUI defaults to false —
    /// the operator must press Start).
    #[arg(long)]
    pub autostart: bool,

    /// Local GPU self-test: run the Rulkov LIF + spike-count shaders on a synthetic
    /// cluster (no brain needed) to verify the compute path, then exit.
    #[arg(long)]
    pub self_test: bool,

    /// Neuron count for --self-test.
    #[arg(long, default_value_t = 1_000_000)]
    pub self_test_neurons: u32,
}
