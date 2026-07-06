//! M1 — the WebSocket donor loop for a single GPU (MVP). Connects, registers, and runs
//! the JSON donor protocol: `gpu_init` → allocate/seed the cluster + ack; `compute_batch`
//! → run the Rulkov substep loop on the GPU + reply with spike counts. Binary sparse
//! frames (training) are M3 — logged and skipped for now.
//!
//! Multi-GPU = one `run_donor` task per selected GPU (M3+). MVP runs one.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

use crate::compute::{MultiEngine, StepJob};
use crate::config::DonorConfig;
use crate::frames::{self, Frame};
use crate::gpu::GpuInfo;
use crate::protocol::{
    ComputeBatch, ComputeBatchResult, GpuInit, GpuInitAck, GpuRegister, PerClusterResult,
    MatrixSample, ReadbackAck, ReadbackMatrixChecksumAck, RebindAck, ServerMessage,
};

/// Outbound keepalive cadence. We ping the brain on this interval so a quiet teach window never
/// lets the WS sit idle long enough for Starlink CGNAT / a reverse proxy to reap it — the flap
/// that surfaces as `Connection reset by peer` every few minutes. Well under any common idle-reap.
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);
/// If NO frame (incl. the brain's pong) arrives within this window while we're keepalive-pinging,
/// the link is half-open (satellite handover / proxy drop) — reconnect instead of waiting
/// minutes for the OS to surface the RST.
///
/// 45s → 150s: the coordinator's event loop legitimately goes quiet-to-this-socket for long
/// stretches during heavy synchronous teach (Hebbian grind pins the loop; the WS pong sits
/// queued until it frees). At 45s the donor declared those stretches a dead link and
/// reconnect-cycled every ~60-90s through an entire teach phase — dropping its replica and
/// forcing a full matrix re-upload each time. 150s matches the server's own busy-grace
/// heartbeat budget; genuine half-open links (satellite handover, proxy drop) still detect
/// in 2.5 min instead of 45 s, which costs nothing — reconnect latency was never the
/// bottleneck, replica re-upload is.
const IDLE_TIMEOUT: Duration = Duration::from_secs(150);

/// Live status the GUI reads (and headless ignores).
#[derive(Default)]
pub struct DonorStatus {
    pub connected: bool,
    pub gpu_name: String,
    pub batches: u64,
    pub spikes_last: u64,
    /// Teach operations processed (propagate + Hebbian frames). During the curriculum walk the
    /// brain sends THESE, not compute_batch — so without this the GUI showed a misleading
    /// "0 batches" while the GPU was busy teaching.
    pub teach_ops: u64,
    /// Last compute_batch throughput (billions of neuron-steps/sec) — matches compute.html's
    /// metric; the periodic gpu_telemetry reports it so the brain accrues leaderboard credit.
    pub gneurons_per_sec: f64,
    pub steps_computed: u64,
    pub note: String,
}

/// Start/stop + status handle shared with a donor task.
#[derive(Clone)]
pub struct Control {
    pub stop: Arc<AtomicBool>,
    pub status: Arc<Mutex<DonorStatus>>,
}

impl Control {
    pub fn new() -> Self {
        Self { stop: Arc::new(AtomicBool::new(false)), status: Arc::new(Mutex::new(DonorStatus::default())) }
    }
}

impl Default for Control {
    fn default() -> Self {
        Self::new()
    }
}

fn set_status(control: &Control, f: impl FnOnce(&mut DonorStatus)) {
    if let Ok(mut s) = control.status.lock() {
        f(&mut s);
    }
}

/// Spawn ONE donor for a host's whole GPU pool on its own thread (own tokio runtime).
/// Returns the Control (stop flag + live status) and the thread handle. The host registers
/// as a single compute unit and drives every GPU in `gpus` internally (see `MultiEngine`).
pub fn spawn_donor(cfg: DonorConfig, gpus: Vec<GpuInfo>, utils: Vec<u8>) -> (Control, std::thread::JoinHandle<()>) {
    let control = Control::new();
    let c2 = control.clone();
    let handle = std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                if let Ok(mut s) = c2.status.lock() { s.note = format!("runtime error: {e}"); }
                return;
            }
        };
        if let Err(e) = rt.block_on(run_donor_supervised(cfg, gpus, utils, c2.clone())) {
            if let Ok(mut s) = c2.status.lock() {
                s.note = format!("error: {e}");
                s.connected = false;
            }
        }
    });
    (control, handle)
}

/// In-progress chunked matrix upload (type=4), assembled until the last chunk.
struct PartialUpload {
    rows: u32,
    cols: u32,
    row_ptr: Vec<u32>,
    values: Vec<f32>,
    col_idx: Vec<u32>,
}

/// M3.3 — a unit of GPU work handed from the (async) WS loop to the GPU worker thread.
/// Keeps every blocking compute/readback off the socket task so liveness pings + replies
/// keep flowing during a heavy teach burst.
enum Work {
    Init(GpuInit),
    Batch(ComputeBatch),
    Frame(Frame),
    WriteSpike { cluster: String, region: String, indices: Vec<u32> },
    WriteCurrent { cluster: String, region: String, indices: Vec<u32>, values: Vec<f32>, psi: f32 },
    ClearSpike { cluster: String, region: String },
    Readback { req_id: u32, cluster: String, region: String, bucket_count: u32, sub_slice_len: u32, start_offset: u32 },
    // TU.19-D — GPU↔CPU parity: read back a resident matrix's weight digest.
    ChecksumMatrix { req_id: u32, name: String, sample_count: u32 },
}

/// A reply the worker produced; the WS loop sends it in receipt order.
enum Out {
    Text(String),
    Binary(Vec<u8>),
}

/// SUPERVISOR — run a donor session and, on an UNEXPECTED disconnect (the
/// connection dropped/closed or the initial connect failed — NOT a user Stop /
/// Ctrl+C), wait a short backoff and reconnect, indefinitely, when
/// `cfg.auto_restart_on_disconnect` is set (the default). This is the fix for
/// "it drops the connection and there's no auto-restart": before, a single
/// `run_donor` returned on any drop and the donor went dark until someone
/// pressed Start again. Now it rejoins on its own.
///
/// A user Stop sets `control.stop` (checked after each session AND during the
/// backoff wait) → we return without reconnecting. With auto-restart OFF the
/// supervisor is a passthrough (legacy single-session behavior).
///
/// Note: each reconnect rebuilds the GPU engine (engine ownership moves into
/// the per-session worker). Reconnects are infrequent, so the extra GPU init on
/// a drop is acceptable; a fresh engine after a drop is also the safer state.
pub async fn run_donor_supervised(
    cfg: DonorConfig,
    gpus: Vec<GpuInfo>,
    utils: Vec<u8>,
    control: Control,
) -> Result<(), String> {
    let mut backoff: u64 = 2;
    // Deterministic per-install reconnect jitter (0–1500 ms) derived from the donor id, so a brain
    // restart doesn't make every donor reconnect in lockstep (thundering herd) — each host offsets
    // its rejoin by a stable amount.
    let jitter_ms: u64 = crate::config::persistent_donor_id()
        .bytes()
        .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64))
        % 1500;
    loop {
        let result = run_donor(cfg.clone(), gpus.clone(), utils.clone(), control.clone()).await;

        // User Stop / Ctrl+C → never reconnect.
        if control.stop.load(Ordering::Relaxed) {
            return result;
        }
        // Auto-restart disabled → legacy behavior: surface the outcome and stop.
        if !cfg.auto_restart_on_disconnect {
            return result;
        }

        // Unexpected end. A clean session that simply dropped resets the backoff
        // (it was a real connection); a failed CONNECT grows it (brain likely down).
        let why = match &result {
            Ok(()) => {
                backoff = 2;
                "connection dropped".to_string()
            }
            Err(e) => format!("connect failed ({e})"),
        };
        set_status(&control, |s| {
            s.connected = false;
            s.note = format!("{why} — auto-reconnecting in {backoff}s…");
        });
        println!("[donor] {why} — auto-reconnecting in {backoff}s (disable with --no-auto-restart / the GUI toggle).");

        // Stop-aware backoff wait (500 ms granularity) so a Stop during the wait
        // cancels the reconnect promptly.
        let steps = backoff.saturating_mul(2);
        let mut i = 0u64;
        while i < steps {
            if control.stop.load(Ordering::Relaxed) {
                set_status(&control, |s| { s.connected = false; s.note = "stopped".into(); });
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
            i += 1;
        }
        // Staggered rejoin (see jitter_ms) — short, stop-aware, so donors don't reconnect in lockstep.
        if jitter_ms > 0 && !control.stop.load(Ordering::Relaxed) {
            tokio::time::sleep(Duration::from_millis(jitter_ms)).await;
        }
        if result.is_err() {
            backoff = backoff.saturating_mul(2).min(30);
        }
    }
}

/// Connect one donor for `gpu` and run until the connection closes, Ctrl+C, or
/// `control.stop` is set (the GUI Stop button). Updates `control.status` live.
pub async fn run_donor(cfg: DonorConfig, gpus: Vec<GpuInfo>, utils: Vec<u8>, control: Control) -> Result<(), String> {
    let indices: Vec<usize> = gpus.iter().map(|g| g.index).collect();
    println!("[donor] building multi-GPU engine over {} card(s): {:?} @ utils {:?}", gpus.len(), indices, utils);
    let engine = MultiEngine::new(&indices, &utils).await?;
    let label = engine.gpu_label();
    println!("[donor] backends: {}", engine.backend_summary());
    // A matrix lives on ONE local GPU, so advertise the SMALLEST per-binding cap across the
    // pool. CUDA engines report VRAM-sized caps (no 2 GB limit); wgpu engines report the
    // adapter's binding limit. The brain then won't hand us a binding bigger than any card holds.
    let binding_mb = engine.advertised_binding_mb();
    // Platform/backend telemetry — captured BEFORE `engine` moves into the worker thread, so the
    // register + every telemetry tick can report os / backend / driver / compute-capability.
    let os_platform = engine.os_platform();
    let engine_backend = engine.engine_backend();
    let driver_version = engine.driver_version();
    let compute_capability = engine.compute_capability();
    // DONATED CAPACITY for the brain's auto-scale tier gate (so it counts what this host actually
    // gives, not the full card). utilizationPct = the donation duty-cycle (avg of the per-GPU util
    // targets the GUI/CLI set, else the config default). donatedMB = an explicit VRAM cap if the
    // user set `--memory <MB>` (0 = unset → the brain falls back to fullVram × utilization).
    let utilization_pct: u8 = if !utils.is_empty() {
        (utils.iter().map(|&u| u as u32).sum::<u32>() / utils.len() as u32).min(100) as u8
    } else {
        cfg.utilization_pct
    };
    let donated_mb: u64 = match cfg.memory {
        crate::config::MemoryCap::MegaBytes(mb) => mb,
        crate::config::MemoryCap::All => 0,
    };
    let host_name = if gpus.len() > 1 { format!("{label} ({} GPUs)", gpus.len()) } else { label.clone() };

    println!("[donor] connecting to {} ...", cfg.server);
    set_status(&control, |s| s.note = "connecting…".into());
    // Retry the connect for ~60s so pressing Start before the brain is up still works.
    let mut attempt = 0u32;
    let ws = loop {
        if control.stop.load(Ordering::Relaxed) {
            set_status(&control, |s| { s.connected = false; s.note = "stopped".into(); });
            return Ok(());
        }
        match tokio_tungstenite::connect_async(&cfg.server).await {
            Ok((ws, _resp)) => break ws,
            Err(e) => {
                attempt += 1;
                if attempt >= 30 {
                    return Err(format!("connect failed after {attempt} tries: {e}"));
                }
                set_status(&control, |s| s.note = format!("waiting for brain at {} (retry {attempt})", cfg.server));
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    };
    let (mut tx, mut rx) = ws.split();

    // Leaderboard identity: a persistent donor id + the OPTIONAL display name (--name / GUI).
    // Same name across devices → one aggregated leaderboard row; empty name → anonymous.
    let donor_id = crate::config::persistent_donor_id();
    let donor_name: Option<String> = { let n = cfg.name.trim(); if n.is_empty() { None } else { Some(n.to_string()) } };

    // gpu_register — advertise the per-binding cap (the capability the brain gates on),
    // not the (unbounded on native) max_buffer_size. Carries the leaderboard id + name.
    let reg = GpuRegister::new(
        binding_mb,
        binding_mb,
        host_name.clone(),
        Some(donor_id.clone()),
        donor_name.clone(),
        os_platform.clone(),
        engine_backend.clone(),
        driver_version.clone(),
        compute_capability.clone(),
        utilization_pct,
        donated_mb,
        0.0, // WSQ.4 — link bandwidth unknown at register; telemetry reports it once data flows.
    );
    tx.send(Message::text(serde_json::to_string(&reg).unwrap()))
        .await
        .map_err(|e| format!("register send failed: {e}"))?;
    println!("[donor] registered as {} ({} MB binding cap) — leaderboard: {}. Donating at {}% utilization.", host_name, binding_mb, donor_name.as_deref().unwrap_or("anonymous"), cfg.utilization_pct);
    set_status(&control, |s| { s.connected = true; s.gpu_name = host_name.clone(); s.note = "registered".into(); });

    // M3.3 — GPU work runs on a dedicated worker thread. The async WS loop below never
    // blocks on a compute/readback: it forwards each message to the worker (unbounded, never
    // blocks the send), keeps draining the socket + answering pings (liveness), and streams
    // the worker's replies back in receipt order. So a heavy teach burst can't stall the
    // connection past the brain's liveness window.
    let (work_tx, work_rx) = std::sync::mpsc::channel::<Work>();
    let (reply_tx, mut reply_rx) = tokio::sync::mpsc::unbounded_channel::<Out>();
    let control_w = control.clone();
    // Count of QUEUED (not-yet-pulled) Work. The duty-cycle idle (run_substeps) aborts the
    // moment this is > 0, so the throttle never delays a matrix upload / its ack behind a
    // compute_batch's idle sleep — that starvation was timing out the brain's 45s sparse
    // uploads at low util and feeding the reconnect churn.
    let pending = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let pending_w = pending.clone();
    let worker = std::thread::spawn(move || {
        let mut engine = engine;
        let mut partials: HashMap<String, PartialUpload> = HashMap::new();
        let mut step_seed: u32 = 0x9e3779b9;
        while let Ok(work) = work_rx.recv() {
            pending_w.fetch_sub(1, Ordering::Relaxed); // pulled one off the queue
            // Stop promptly on request: DON'T drain the queued backlog (the brain can have many
            // compute_batch/frames buffered). Without this, join() blocks until the whole
            // backlog clears, so the GUI's ▶ Start never reappears after ⏹ Stop.
            if control_w.stop.load(Ordering::Relaxed) {
                break;
            }
            match work {
                Work::Init(init) => {
                    handle_gpu_init(&mut engine, &init);
                    let ack = GpuInitAck { msg_type: "gpu_init_ack", cluster_name: init.cluster_name.clone(), size: init.size };
                    let _ = reply_tx.send(Out::Text(serde_json::to_string(&ack).unwrap()));
                }
                Work::Batch(batch) => {
                    // Per-GPU duty-cycle now lives inside run_substeps (each card throttles to
                    // its own util target), so the worker just runs + replies. Pass the stop
                    // flag so a low-util idle bails fast on ⏹ Stop.
                    let _neurons: u64 = batch.clusters.iter().map(|c| c.size as u64).sum();
                    let _substeps = batch.substeps.max(1) as u64;
                    let _t0 = std::time::Instant::now();
                    let result = run_batch(&engine, &batch, &mut step_seed, &control_w.stop, &pending_w);
                    let _elapsed = _t0.elapsed().as_secs_f64().max(1e-6);
                    // Gneuron-steps/sec — same metric as compute.html: (Σ cluster sizes × substeps) / sec / 1e9.
                    let _gns = (_neurons as f64 * _substeps as f64) / _elapsed / 1e9;
                    let spikes: u64 = result.per_cluster.values().map(|p| p.spike_count_total).sum();
                    set_status(&control_w, |s| { s.batches += 1; s.spikes_last = spikes; s.gneurons_per_sec = _gns; s.steps_computed += _neurons * _substeps; s.note = "computing".into(); });
                    if let Ok(j) = serde_json::to_string(&result) {
                        let _ = reply_tx.send(Out::Text(j));
                    }
                }
                Work::Frame(frame) => {
                    // Count teach work (propagate / Hebbian) so the GUI reflects the curriculum
                    // walk — the brain sends these, not compute_batch, during teaching.
                    let is_teach = matches!(frame, Frame::Propagate { .. } | Frame::Hebbian { .. } | Frame::BatchedHebbian { .. });
                    if let Some(ack) = handle_frame(&mut engine, &mut partials, frame) {
                        let _ = reply_tx.send(Out::Binary(ack));
                    }
                    if is_teach {
                        set_status(&control_w, |s| { s.teach_ops += 1; s.note = "teaching".into(); });
                    }
                }
                // Region ops are best-effort (silently skipped before the cluster exists).
                Work::WriteSpike { cluster, region, indices } => {
                    let _ = engine.write_spike_slice(&cluster, &region, &indices);
                }
                Work::WriteCurrent { cluster, region, indices, values, psi } => {
                    let _ = engine.write_current_slice(&cluster, &region, &indices, &values, psi);
                }
                Work::ClearSpike { cluster, region } => {
                    let _ = engine.clear_spike_region(&cluster, &region);
                }
                Work::Readback { req_id, cluster, region, bucket_count, sub_slice_len, start_offset } => {
                    let counts = engine
                        .readback_letter_buckets(&cluster, &region, bucket_count, sub_slice_len, start_offset)
                        .unwrap_or_default();
                    let ack = ReadbackAck { msg_type: "readback_letter_buckets_ack", req_id, cluster_name: cluster, region_name: region, counts };
                    let _ = reply_tx.send(Out::Text(serde_json::to_string(&ack).unwrap()));
                }
                // TU.19-D — resident weight digest for GPU↔CPU parity. found=false
                // when the matrix isn't resident (server reads that as STALE, i.e.
                // uploaded-but-dropped, distinct from a checksum mismatch = diverged).
                Work::ChecksumMatrix { req_id, name, sample_count } => {
                    let ack = match engine.checksum_matrix(&name, sample_count) {
                        Some((nnz, checksum, samples)) => ReadbackMatrixChecksumAck {
                            msg_type: "readback_matrix_checksum_ack",
                            req_id,
                            name,
                            found: true,
                            nnz,
                            checksum: checksum.to_string(),
                            samples: samples.into_iter().map(|(idx, val)| MatrixSample { idx, val }).collect(),
                        },
                        None => ReadbackMatrixChecksumAck {
                            msg_type: "readback_matrix_checksum_ack",
                            req_id,
                            name,
                            found: false,
                            nnz: 0,
                            checksum: "0".to_string(),
                            samples: Vec::new(),
                        },
                    };
                    let _ = reply_tx.send(Out::Text(serde_json::to_string(&ack).unwrap()));
                }
            }
        }
    });

    // Ctrl+C OR control.stop → graceful stop (safe stop): clean WS close.
    let mut ctrlc = Box::pin(tokio::signal::ctrl_c());
    let mut stop_check = tokio::time::interval(Duration::from_millis(250));
    // Leaderboard telemetry every 5s (matches compute.html): report this host's last-batch
    // throughput so the brain accrues neuron-compute credit under our id / name.
    let mut telemetry_tick = tokio::time::interval(Duration::from_secs(5));
    // FLAP RESISTANCE — client-initiated keepalive so the link never goes idle long enough for
    // CGNAT / a reverse proxy to reap it, plus a heartbeat for fast dead-link detection.
    let mut keepalive_tick = tokio::time::interval(KEEPALIVE_INTERVAL);
    keepalive_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    // Last time ANY frame arrived from the brain (incl. its pong). Stale past IDLE_TIMEOUT while
    // we're actively pinging ⇒ the link is dead ⇒ reconnect now.
    let mut last_recv = std::time::Instant::now();
    // WSQ.4 — measured downlink: accumulate inbound bytes per telemetry window → megabits/sec,
    // peak-hold with slow decay so the reported value reflects link CAPACITY (seen during the
    // replica-sync burst), not the idle rate. The brain uses it to pace future syncs to this
    // link instead of guessing from RTT.
    let mut bytes_in_window: u64 = 0;
    let mut link_down_mbps: f64 = 0.0;
    let mut link_window_start = std::time::Instant::now();

    loop {
        tokio::select! {
            _ = stop_check.tick() => {
                if control.stop.load(Ordering::Relaxed) {
                    println!("[donor] stop requested (GUI) — closing connection cleanly.");
                    let _ = tx.send(Message::Close(None)).await;
                    break;
                }
            }
            _ = telemetry_tick.tick() => {
                let (gns, steps) = control.status.lock().map(|s| (s.gneurons_per_sec, s.steps_computed)).unwrap_or((0.0, 0));
                // WSQ.4 — fold this window's inbound byte count into the peak-hold downlink estimate.
                let _win_s = link_window_start.elapsed().as_secs_f64().max(1e-6);
                let _inst_mbps = (bytes_in_window as f64) * 8.0 / 1e6 / _win_s;
                link_down_mbps = _inst_mbps.max(link_down_mbps * 0.9); // jump up on a burst, decay 10%/tick when idle
                bytes_in_window = 0;
                link_window_start = std::time::Instant::now();
                let tele = crate::protocol::GpuTelemetry {
                    msg_type: "gpu_telemetry",
                    gpu_name: host_name.clone(),
                    vram_mb: binding_mb,
                    max_bind_mb: binding_mb,
                    gneurons_per_sec: gns,
                    steps_computed: steps,
                    donor_id: Some(donor_id.clone()),
                    donor_name: donor_name.clone(),
                    os_platform: os_platform.clone(),
                    engine_backend: engine_backend.clone(),
                    driver_version: driver_version.clone(),
                    compute_capability: compute_capability.clone(),
                    link_down_mbps,
                };
                if let Ok(j) = serde_json::to_string(&tele) {
                    let _ = tx.send(Message::text(j)).await;
                }
            }
            _ = keepalive_tick.tick() => {
                // Dead-link detection: we ping every KEEPALIVE_INTERVAL and the brain's WS stack
                // pongs; if NOTHING has arrived for IDLE_TIMEOUT, the connection is half-open —
                // bail now so the supervisor reconnects fast (don't wait for a write to error out).
                if last_recv.elapsed() > IDLE_TIMEOUT {
                    eprintln!("[donor] no traffic for {}s — link presumed dead, reconnecting.", last_recv.elapsed().as_secs());
                    break;
                }
                // Outbound keepalive — keeps NAT/proxy mappings warm during quiet teach windows.
                if tx.send(Message::Ping(Vec::new().into())).await.is_err() {
                    eprintln!("[donor] keepalive ping send failed — reconnecting.");
                    break;
                }
            }
            _ = &mut ctrlc => {
                println!("\n[donor] stop requested — closing connection cleanly (safe stop).");
                let _ = tx.send(Message::Close(None)).await;
                break;
            }
            // Worker reply → send over the socket, in receipt order.
            Some(out) = reply_rx.recv() => {
                match out {
                    Out::Text(t) => { let _ = tx.send(Message::text(t)).await; }
                    Out::Binary(b) => { let _ = tx.send(Message::Binary(b.into())).await; }
                }
            }
            maybe = rx.next() => {
                let msg = match maybe {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => { eprintln!("[donor] ws error: {e}"); break; }
                    None => { println!("[donor] connection closed by server."); break; }
                };
                // A frame arrived (text/binary/ping/pong/close) — the link is alive; reset the
                // dead-link timer so keepalive only trips on genuine silence.
                last_recv = std::time::Instant::now();
                // WSQ.4 — tally inbound bytes for the downlink-throughput estimate (folded in on the telemetry tick).
                bytes_in_window += match &msg {
                    Message::Text(t) => t.len() as u64,
                    Message::Binary(b) => b.len() as u64,
                    Message::Ping(p) | Message::Pong(p) => p.len() as u64,
                    _ => 0,
                };
                match msg {
                    Message::Text(t) => {
                        match serde_json::from_str::<ServerMessage>(t.as_str()) {
                            Ok(ServerMessage::GpuInit(init)) => { pending.fetch_add(1, Ordering::Relaxed); let _ = work_tx.send(Work::Init(init)); }
                            Ok(ServerMessage::ComputeBatch(batch)) => { pending.fetch_add(1, Ordering::Relaxed); let _ = work_tx.send(Work::Batch(batch)); }
                            Ok(ServerMessage::RebindSparse(rb)) => {
                                // Ack inline (no GPU work) so the brain doesn't hit its 30s
                                // rebind timeout. The matrix stays standalone (carried preSpikes
                                // path still works); cluster-slice binding is an M3.2 refinement.
                                let ack = RebindAck { msg_type: "rebind_sparse_ack", req_id: rb.req_id, name: rb.name, ok: true };
                                let _ = tx.send(Message::text(serde_json::to_string(&ack).unwrap())).await;
                            }
                            Ok(ServerMessage::WriteSpikeSlice(w)) => { pending.fetch_add(1, Ordering::Relaxed); let _ = work_tx.send(Work::WriteSpike { cluster: w.cluster_name, region: w.region_name, indices: w.sparse_indices }); }
                            Ok(ServerMessage::WriteCurrentSlice(w)) => { pending.fetch_add(1, Ordering::Relaxed); let _ = work_tx.send(Work::WriteCurrent { cluster: w.cluster_name, region: w.region_name, indices: w.sparse_indices, values: w.sparse_values, psi: w.psi }); }
                            Ok(ServerMessage::ClearSpikeRegion(w)) => { pending.fetch_add(1, Ordering::Relaxed); let _ = work_tx.send(Work::ClearSpike { cluster: w.cluster_name, region: w.region_name }); }
                            Ok(ServerMessage::ReadbackLetterBuckets(rb)) => { pending.fetch_add(1, Ordering::Relaxed); let _ = work_tx.send(Work::Readback { req_id: rb.req_id, cluster: rb.cluster_name, region: rb.region_name, bucket_count: rb.bucket_count, sub_slice_len: rb.sub_slice_len, start_offset: rb.start_offset }); }
                            Ok(ServerMessage::ReadbackMatrixChecksum(rc)) => { pending.fetch_add(1, Ordering::Relaxed); let _ = work_tx.send(Work::ChecksumMatrix { req_id: rc.req_id, name: rc.name, sample_count: rc.sample_count }); }
                            // TU.20.12 — the brain refused this binary as incompatible. Surface it
                            // and set stop so the supervisor does NOT reconnect-loop a version it
                            // already rejected. The user must download the current donor + restart.
                            Ok(ServerMessage::IncompatibleVersion(iv)) => {
                                let msg = if iv.message.is_empty() {
                                    format!("this donor binary (v{}) is too old — the brain requires v{}+. Download the current donor from git.unityailab.com and restart.", iv.your_version, iv.min_version)
                                } else { iv.message.clone() };
                                eprintln!("[donor] ⛔ INCOMPATIBLE: {msg}");
                                set_status(&control, |s| { s.connected = false; s.note = format!("INCOMPATIBLE — update to v{}+ (git.unityailab.com)", iv.min_version); });
                                control.stop.store(true, Ordering::Relaxed);
                                let _ = tx.send(Message::Close(None)).await;
                                break;
                            }
                            Ok(ServerMessage::Other) => { /* forward-compat: ignore unknown */ }
                            Err(_) => { /* non-JSON or unparseable — ignore */ }
                        }
                    }
                    Message::Binary(bytes) => {
                        if let Some(frame) = frames::decode(&bytes) {
                            pending.fetch_add(1, Ordering::Relaxed); let _ = work_tx.send(Work::Frame(frame));
                        }
                    }
                    Message::Ping(p) => { let _ = tx.send(Message::Pong(p)).await; }
                    Message::Close(_) => { println!("[donor] server closed the connection."); break; }
                    _ => {}
                }
            }
        }
    }
    // Stop the worker: dropping the work sender ends its recv loop; join it out.
    drop(work_tx);
    let _ = worker.join();
    set_status(&control, |s| { s.connected = false; s.note = "stopped".into(); });
    Ok(())
}

fn handle_gpu_init(engine: &mut MultiEngine, init: &GpuInit) {
    let regions: HashMap<String, (u32, u32)> =
        init.regions.iter().map(|(n, r)| (n.clone(), (r.start, r.end))).collect();
    engine.init_cluster(&init.cluster_name, init.size, &regions, init.tonic_drive, init.noise_amp);
    println!("[donor] gpu_init '{}' — {} neurons, {} regions", init.cluster_name, init.size, regions.len());
}

fn run_batch(engine: &MultiEngine, batch: &ComputeBatch, step_seed: &mut u32, stop: &AtomicBool, pending: &std::sync::atomic::AtomicUsize) -> ComputeBatchResult {
    let substeps = batch.substeps.max(1);
    let mut per_cluster = std::collections::HashMap::new();
    let mut jobs: Vec<StepJob> = Vec::with_capacity(batch.clusters.len());
    for c in &batch.clusters {
        if !engine.has_cluster(&c.name) {
            // not initialized (shouldn't happen post-init) — report zero, stay valid.
            per_cluster.insert(c.name.clone(), PerClusterResult::default());
            continue;
        }
        // effectiveDrive = tonic * driveBaseline * emotionalGate * gainMultiplier + errorCorrection
        let effective_drive =
            c.tonic_drive * c.drive_baseline * c.emotional_gate * c.gain_multiplier + c.error_correction;
        jobs.push(StepJob { name: c.name.clone(), size: c.size, drive: effective_drive, noise: c.noise_amp });
    }
    // Advance the batch seed once; MultiEngine derives a distinct per-GPU stream and runs
    // each card's clusters in parallel, returning per-cluster spike totals.
    *step_seed = step_seed.wrapping_mul(2654435761).wrapping_add(40503);
    let outs = engine.run_substeps(&jobs, substeps, *step_seed, stop, pending);
    for (name, so) in outs {
        per_cluster.insert(
            name,
            PerClusterResult { spike_count_total: so.total, last_spike_count: so.last, mean_voltage: None },
        );
    }
    ComputeBatchResult { msg_type: "compute_batch_result", batch_id: batch.batch_id, per_cluster }
}

/// Handle a decoded binary sparse frame; returns the SPRR ack bytes to send (if any).
fn handle_frame(engine: &mut MultiEngine, partials: &mut HashMap<String, PartialUpload>, frame: Frame) -> Option<Vec<u8>> {
    match frame {
        Frame::Upload { req_id, name, rows, cols, row_ptr, values, col_idx } => {
            engine.upload_sparse(&name, rows, cols, &row_ptr, &values, &col_idx);
            Some(frames::ack_simple(1, req_id))
        }
        Frame::Chunk { req_id, name, chunk_seq, total_chunks, first, values_offset, values, col_idx_offset, col_idx } => {
            if let Some(f) = first {
                partials.insert(
                    name.clone(),
                    PartialUpload {
                        rows: f.rows,
                        cols: f.cols,
                        row_ptr: f.row_ptr,
                        values: vec![0.0; f.nnz as usize],
                        col_idx: vec![0u32; f.nnz as usize],
                    },
                );
            }
            if let Some(p) = partials.get_mut(&name) {
                let vstart = (values_offset as usize) / 4;
                for (k, v) in values.iter().enumerate() {
                    if vstart + k < p.values.len() {
                        p.values[vstart + k] = *v;
                    }
                }
                let cstart = (col_idx_offset as usize) / 4;
                for (k, c) in col_idx.iter().enumerate() {
                    if cstart + k < p.col_idx.len() {
                        p.col_idx[cstart + k] = *c;
                    }
                }
            }
            // The server expects the SPRR ack only on the LAST chunk.
            if chunk_seq + 1 >= total_chunks {
                if let Some(p) = partials.remove(&name) {
                    engine.upload_sparse(&name, p.rows, p.cols, &p.row_ptr, &p.values, &p.col_idx);
                }
                Some(frames::ack_simple(1, req_id))
            } else {
                None
            }
        }
        Frame::Propagate { req_id, name, pre } => match engine.propagate(&name, &pre) {
            Ok(currents) => Some(frames::ack_propagate(req_id, &currents)),
            Err(e) => {
                eprintln!("[donor] propagate '{name}' failed: {e}");
                Some(frames::ack_propagate(req_id, &[]))
            }
        },
        Frame::Hebbian { req_id, name, pre, post, lr } => {
            if let Err(e) = engine.hebbian(&name, &pre, &post, lr) {
                eprintln!("[donor] hebbian '{name}' failed: {e}");
            }
            Some(frames::ack_simple(3, req_id))
        }
        Frame::BatchedHebbian { req_id, ops: _ } => {
            // type=5 carries only (name, lr) per op — spikes are resident from prior writes.
            // M3 refinement: track resident pre/post spikes per matrix. For now ack so the
            // brain doesn't stall (no incorrect weight change applied).
            Some(frames::ack_simple(5, req_id))
        }
    }
}
