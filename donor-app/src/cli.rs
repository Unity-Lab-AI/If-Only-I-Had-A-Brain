use clap::Parser;

/// Native GPU compute donor for the Unity brain.
///
/// GUI by default; `--headless` (or the `--no-default-features` build) runs without a
/// window for servers/RunPod. Donate specific GPUs or all, at a chosen utilization.
#[derive(Parser, Debug, Clone)]
#[command(name = "unity-donor", version, about)]
pub struct Cli {
    /// Brain WebSocket URL — overrides everything. Default (no flag) = the production server;
    /// use --local for a local brain. e.g. wss://host/ws or ws://localhost:7525
    #[arg(long)]
    pub server: Option<String>,

    /// Point at a LOCAL brain (ws://localhost:7525) instead of production. Ignored if --server is set.
    #[arg(long)]
    pub local: bool,

    /// Your name on the public compute leaderboard (OPTIONAL). The same name across devices and
    /// apps (browser + native + many) aggregates all your compute into ONE leaderboard entry.
    /// Empty = anonymous. No password/verification — it's just the "who is contributing" label.
    #[arg(long, default_value = "")]
    pub name: String,

    /// List detected GPUs (index, name, VRAM, max buffer) and exit.
    #[arg(long)]
    pub list_gpus: bool,

    /// Which GPUs to donate: a comma list of indices, or "all". Default: card 1 (index 0).
    #[arg(long, default_value = "0")]
    pub gpus: String,

    /// Share of each GPU you are donating: a percent 0-100, or "all" (=100, the default).
    ///
    /// UTILDEFAULT (v0.3.24) — this defaulted to "10" and the old help text called it
    /// "target compute utilization via duty-cycling". BOTH were wrong, and together they
    /// throttled every donor that did not pass the flag:
    ///
    ///   * There is NO duty-cycling. Nothing in compute.rs or cuda.rs ever reads this
    ///     value — the card always computes flat out. It is DECLARED to the brain, not
    ///     enforced here.
    ///   * What it actually does is shrink the capacity the brain will USE: the server
    ///     sizes this donor at `fullVram * pct/100` (gpu.js `eff`). At the old default a
    ///     24GB card announced itself as 2.4GB, could not hold the cortex, and was handed
    ///     almost no work — a volunteer donating a whole GPU and seeing it sit idle.
    ///
    /// So the default is "all". Someone who wants to hold back says so explicitly, which
    /// is the right way round: donating your card should not require a flag to work.
    #[arg(long, default_value = "all")]
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

    /// Disable auto-reconnect. If set, an unexpected disconnect ENDS the session
    /// (the old behavior). Default (unset) = auto-reconnect ON — a dropped donor
    /// rejoins on its own after a short backoff.
    #[arg(long)]
    pub no_auto_restart: bool,

    /// Local GPU self-test: run the Rulkov LIF + spike-count shaders on a synthetic
    /// cluster (no brain needed) to verify the compute path, then exit.
    #[arg(long)]
    pub self_test: bool,

    /// Neuron count for --self-test.
    #[arg(long, default_value_t = 1_000_000)]
    pub self_test_neurons: u32,
}
