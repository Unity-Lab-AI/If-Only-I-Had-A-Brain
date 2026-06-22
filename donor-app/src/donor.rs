//! M1 — the WebSocket donor loop for a single GPU (MVP). Connects, registers, and runs
//! the JSON donor protocol: `gpu_init` → allocate/seed the cluster + ack; `compute_batch`
//! → run the Rulkov substep loop on the GPU + reply with spike counts. Binary sparse
//! frames (training) are M3 — logged and skipped for now.
//!
//! Multi-GPU = one `run_donor` task per selected GPU (M3+). MVP runs one.

use std::time::Instant;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

use crate::compute::ComputeEngine;
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

/// In-progress chunked matrix upload (type=4), assembled until the last chunk.
struct PartialUpload {
    rows: u32,
    cols: u32,
    row_ptr: Vec<u32>,
    values: Vec<f32>,
    col_idx: Vec<u32>,
}

/// Connect one donor for `gpu` and run until the connection closes, Ctrl+C, or
/// `control.stop` is set (the GUI Stop button). Updates `control.status` live.
pub async fn run_donor(cfg: DonorConfig, gpu: GpuInfo, control: Control) -> Result<(), String> {
    println!("[donor] building GPU engine on [{}] {}...", gpu.index, gpu.name);
    let mut engine = ComputeEngine::new(gpu.index).await?;

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
    let reg = GpuRegister::new(gpu.max_storage_binding_mb, gpu.max_storage_binding_mb, gpu.name.clone());
    tx.send(Message::text(serde_json::to_string(&reg).unwrap()))
        .await
        .map_err(|e| format!("register send failed: {e}"))?;
    println!("[donor] registered as '{}' ({} MB binding cap). Donating at {}% utilization.", cfg.name, gpu.max_storage_binding_mb, cfg.utilization_pct);
    set_status(&control, |s| { s.connected = true; s.gpu_name = gpu.name.clone(); s.note = "registered".into(); });

    let util = cfg.utilization_pct.clamp(1, 100) as f64;
    let mut step_seed: u32 = 0x9e3779b9;
    let mut partials: HashMap<String, PartialUpload> = HashMap::new();

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
            maybe = rx.next() => {
                let msg = match maybe {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => { eprintln!("[donor] ws error: {e}"); break; }
                    None => { println!("[donor] connection closed by server."); break; }
                };
                match msg {
                    Message::Text(t) => {
                        match serde_json::from_str::<ServerMessage>(t.as_str()) {
                            Ok(ServerMessage::GpuInit(init)) => {
                                handle_gpu_init(&mut engine, &init);
                                let ack = GpuInitAck { msg_type: "gpu_init_ack", cluster_name: init.cluster_name.clone(), size: init.size };
                                let _ = tx.send(Message::text(serde_json::to_string(&ack).unwrap())).await;
                            }
                            Ok(ServerMessage::ComputeBatch(batch)) => {
                                let t0 = Instant::now();
                                let result = run_batch(&engine, &batch, &mut step_seed);
                                let spikes: u64 = result.per_cluster.values().map(|p| p.spike_count_total).sum();
                                set_status(&control, |s| { s.batches += 1; s.spikes_last = spikes; s.note = "computing".into(); });
                                if let Ok(j) = serde_json::to_string(&result) {
                                    let _ = tx.send(Message::text(j)).await;
                                }
                                // Utilization duty-cycle: idle a slice so busy-fraction ≈ util%.
                                if util < 100.0 {
                                    let busy = t0.elapsed();
                                    let idle = busy.mul_f64((100.0 - util) / util);
                                    tokio::time::sleep(idle).await;
                                }
                            }
                            Ok(ServerMessage::RebindSparse(rb)) => {
                                // Ack so the brain doesn't hit its 30s rebind timeout. The
                                // matrix stays standalone for now (the carried preSpikes path
                                // still works); cluster-slice binding is an M3.2 refinement.
                                let ack = RebindAck { msg_type: "rebind_sparse_ack", req_id: rb.req_id, name: rb.name, ok: true };
                                let _ = tx.send(Message::text(serde_json::to_string(&ack).unwrap())).await;
                            }
                            Ok(ServerMessage::WriteSpikeSlice(w)) => {
                                if let Err(e) = engine.write_spike_slice(&w.cluster_name, &w.region_name, &w.sparse_indices) {
                                    eprintln!("[donor] write_spike_slice failed: {e}");
                                }
                            }
                            Ok(ServerMessage::WriteCurrentSlice(w)) => {
                                if let Err(e) = engine.write_current_slice(&w.cluster_name, &w.region_name, &w.sparse_indices, &w.sparse_values, w.psi) {
                                    eprintln!("[donor] write_current_slice failed: {e}");
                                }
                            }
                            Ok(ServerMessage::ClearSpikeRegion(w)) => {
                                if let Err(e) = engine.clear_spike_region(&w.cluster_name, &w.region_name) {
                                    eprintln!("[donor] clear_spike_region failed: {e}");
                                }
                            }
                            Ok(ServerMessage::ReadbackLetterBuckets(rb)) => {
                                let counts = engine
                                    .readback_letter_buckets(&rb.cluster_name, &rb.region_name, rb.bucket_count, rb.sub_slice_len, rb.start_offset)
                                    .unwrap_or_default();
                                let ack = ReadbackAck { msg_type: "readback_letter_buckets_ack", req_id: rb.req_id, cluster_name: rb.cluster_name, region_name: rb.region_name, counts };
                                let _ = tx.send(Message::text(serde_json::to_string(&ack).unwrap())).await;
                            }
                            Ok(ServerMessage::Other) => { /* forward-compat: ignore unknown */ }
                            Err(_) => { /* non-JSON or unparseable — ignore */ }
                        }
                    }
                    Message::Binary(bytes) => {
                        if let Some(frame) = frames::decode(&bytes) {
                            if let Some(ack) = handle_frame(&mut engine, &mut partials, frame) {
                                let _ = tx.send(Message::Binary(ack.into())).await;
                            }
                        }
                    }
                    Message::Ping(p) => { let _ = tx.send(Message::Pong(p)).await; }
                    Message::Close(_) => { println!("[donor] server closed the connection."); break; }
                    _ => {}
                }
            }
        }
    }
    set_status(&control, |s| { s.connected = false; s.note = "stopped".into(); });
    Ok(())
}

fn handle_gpu_init(engine: &mut ComputeEngine, init: &GpuInit) {
    let regions: HashMap<String, (u32, u32)> =
        init.regions.iter().map(|(n, r)| (n.clone(), (r.start, r.end))).collect();
    engine.init_cluster(&init.cluster_name, init.size, &regions, init.tonic_drive, init.noise_amp);
    println!("[donor] gpu_init '{}' — {} neurons, {} regions", init.cluster_name, init.size, regions.len());
}

fn run_batch(engine: &ComputeEngine, batch: &ComputeBatch, step_seed: &mut u32) -> ComputeBatchResult {
    let mut per_cluster = std::collections::HashMap::new();
    let substeps = batch.substeps.max(1);
    for c in &batch.clusters {
        if !engine.has_cluster(&c.name) {
            // not initialized (shouldn't happen post-init) — report zero, stay valid.
            per_cluster.insert(c.name.clone(), PerClusterResult::default());
            continue;
        }
        // effectiveDrive = tonic * driveBaseline * emotionalGate * gainMultiplier + errorCorrection
        let effective_drive =
            c.tonic_drive * c.drive_baseline * c.emotional_gate * c.gain_multiplier + c.error_correction;
        let mut total: u64 = 0;
        let mut last: u64 = 0;
        for _ in 0..substeps {
            *step_seed = step_seed.wrapping_mul(2654435761).wrapping_add(40503);
            match engine.step(&c.name, effective_drive, c.noise_amp, *step_seed) {
                Ok(count) => {
                    // clamp to [0, size] — the brain validates this; never feed it garbage.
                    let count = (count as u64).min(c.size as u64);
                    total += count;
                    last = count;
                }
                Err(e) => {
                    eprintln!("[donor] step error on '{}': {e}", c.name);
                }
            }
        }
        per_cluster.insert(
            c.name.clone(),
            PerClusterResult { spike_count_total: total, last_spike_count: last, mean_voltage: None },
        );
    }
    ComputeBatchResult { msg_type: "compute_batch_result", batch_id: batch.batch_id, per_cluster }
}

/// Handle a decoded binary sparse frame; returns the SPRR ack bytes to send (if any).
fn handle_frame(engine: &mut ComputeEngine, partials: &mut HashMap<String, PartialUpload>, frame: Frame) -> Option<Vec<u8>> {
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
