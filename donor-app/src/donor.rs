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
    ReadbackAck, RebindAck, ServerMessage,
};

/// Live status the GUI reads (and headless ignores).
#[derive(Default)]
pub struct DonorStatus {
    pub connected: bool,
    pub gpu_name: String,
    pub batches: u64,
    pub spikes_last: u64,
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
        if let Err(e) = rt.block_on(run_donor(cfg, gpus, utils, c2.clone())) {
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
}

/// A reply the worker produced; the WS loop sends it in receipt order.
enum Out {
    Text(String),
    Binary(Vec<u8>),
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

    // gpu_register — advertise the per-binding cap (the capability the brain gates on),
    // not the (unbounded on native) max_buffer_size.
    let reg = GpuRegister::new(binding_mb, binding_mb, host_name.clone());
    tx.send(Message::text(serde_json::to_string(&reg).unwrap()))
        .await
        .map_err(|e| format!("register send failed: {e}"))?;
    println!("[donor] registered as '{}' = {} ({} MB binding cap). Donating at {}% utilization.", cfg.name, host_name, binding_mb, cfg.utilization_pct);
    set_status(&control, |s| { s.connected = true; s.gpu_name = host_name.clone(); s.note = "registered".into(); });

    // M3.3 — GPU work runs on a dedicated worker thread. The async WS loop below never
    // blocks on a compute/readback: it forwards each message to the worker (unbounded, never
    // blocks the send), keeps draining the socket + answering pings (liveness), and streams
    // the worker's replies back in receipt order. So a heavy teach burst can't stall the
    // connection past the brain's liveness window.
    let (work_tx, work_rx) = std::sync::mpsc::channel::<Work>();
    let (reply_tx, mut reply_rx) = tokio::sync::mpsc::unbounded_channel::<Out>();
    let control_w = control.clone();
    let worker = std::thread::spawn(move || {
        let mut engine = engine;
        let mut partials: HashMap<String, PartialUpload> = HashMap::new();
        let mut step_seed: u32 = 0x9e3779b9;
        while let Ok(work) = work_rx.recv() {
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
                    let result = run_batch(&engine, &batch, &mut step_seed, &control_w.stop);
                    let spikes: u64 = result.per_cluster.values().map(|p| p.spike_count_total).sum();
                    set_status(&control_w, |s| { s.batches += 1; s.spikes_last = spikes; s.note = "computing".into(); });
                    if let Ok(j) = serde_json::to_string(&result) {
                        let _ = reply_tx.send(Out::Text(j));
                    }
                }
                Work::Frame(frame) => {
                    if let Some(ack) = handle_frame(&mut engine, &mut partials, frame) {
                        let _ = reply_tx.send(Out::Binary(ack));
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
            }
        }
    });

    // Ctrl+C OR control.stop → graceful stop (safe stop): clean WS close.
    let mut ctrlc = Box::pin(tokio::signal::ctrl_c());
    let mut stop_check = tokio::time::interval(Duration::from_millis(250));

    loop {
        tokio::select! {
            _ = stop_check.tick() => {
                if control.stop.load(Ordering::Relaxed) {
                    println!("[donor] stop requested (GUI) — closing connection cleanly.");
                    let _ = tx.send(Message::Close(None)).await;
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
                match msg {
                    Message::Text(t) => {
                        match serde_json::from_str::<ServerMessage>(t.as_str()) {
                            Ok(ServerMessage::GpuInit(init)) => { let _ = work_tx.send(Work::Init(init)); }
                            Ok(ServerMessage::ComputeBatch(batch)) => { let _ = work_tx.send(Work::Batch(batch)); }
                            Ok(ServerMessage::RebindSparse(rb)) => {
                                // Ack inline (no GPU work) so the brain doesn't hit its 30s
                                // rebind timeout. The matrix stays standalone (carried preSpikes
                                // path still works); cluster-slice binding is an M3.2 refinement.
                                let ack = RebindAck { msg_type: "rebind_sparse_ack", req_id: rb.req_id, name: rb.name, ok: true };
                                let _ = tx.send(Message::text(serde_json::to_string(&ack).unwrap())).await;
                            }
                            Ok(ServerMessage::WriteSpikeSlice(w)) => { let _ = work_tx.send(Work::WriteSpike { cluster: w.cluster_name, region: w.region_name, indices: w.sparse_indices }); }
                            Ok(ServerMessage::WriteCurrentSlice(w)) => { let _ = work_tx.send(Work::WriteCurrent { cluster: w.cluster_name, region: w.region_name, indices: w.sparse_indices, values: w.sparse_values, psi: w.psi }); }
                            Ok(ServerMessage::ClearSpikeRegion(w)) => { let _ = work_tx.send(Work::ClearSpike { cluster: w.cluster_name, region: w.region_name }); }
                            Ok(ServerMessage::ReadbackLetterBuckets(rb)) => { let _ = work_tx.send(Work::Readback { req_id: rb.req_id, cluster: rb.cluster_name, region: rb.region_name, bucket_count: rb.bucket_count, sub_slice_len: rb.sub_slice_len, start_offset: rb.start_offset }); }
                            Ok(ServerMessage::Other) => { /* forward-compat: ignore unknown */ }
                            Err(_) => { /* non-JSON or unparseable — ignore */ }
                        }
                    }
                    Message::Binary(bytes) => {
                        if let Some(frame) = frames::decode(&bytes) {
                            let _ = work_tx.send(Work::Frame(frame));
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

fn run_batch(engine: &MultiEngine, batch: &ComputeBatch, step_seed: &mut u32, stop: &AtomicBool) -> ComputeBatchResult {
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
    let outs = engine.run_substeps(&jobs, substeps, *step_seed, stop);
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
