//! Wire types for the brain donor protocol (JSON messages). Field names match the
//! server/compute.html contract exactly. Binary SPRS/SPRR sparse frames are handled
//! separately (M3); these cover the MVP JSON path (register → init → compute_batch).
//!
//! See ../BUILD-PLAN.md and the mapped spec for the full contract.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Donor → Server ───────────────────────────────────────────────

/// Sent on connect to join the donor pool.
#[derive(Debug, Clone, Serialize)]
pub struct GpuRegister {
    #[serde(rename = "type")]
    pub msg_type: &'static str, // "gpu_register"
    #[serde(rename = "vramMB")]
    pub vram_mb: u64,
    #[serde(rename = "maxStorageBindingMB")]
    pub max_storage_binding_mb: u64,
    #[serde(rename = "gpuName")]
    pub gpu_name: String,
}

impl GpuRegister {
    pub fn new(vram_mb: u64, max_storage_binding_mb: u64, gpu_name: String) -> Self {
        Self { msg_type: "gpu_register", vram_mb, max_storage_binding_mb, gpu_name }
    }
}

/// Acknowledges a `gpu_init` for one cluster.
#[derive(Debug, Clone, Serialize)]
pub struct GpuInitAck {
    #[serde(rename = "type")]
    pub msg_type: &'static str, // "gpu_init_ack"
    #[serde(rename = "clusterName")]
    pub cluster_name: String,
    pub size: u32,
}

/// Per-cluster spike result inside a `compute_batch_result`.
#[derive(Debug, Clone, Serialize, Default)]
pub struct PerClusterResult {
    #[serde(rename = "spikeCountTotal")]
    pub spike_count_total: u64,
    #[serde(rename = "lastSpikeCount")]
    pub last_spike_count: u64,
    #[serde(rename = "meanVoltage", skip_serializing_if = "Option::is_none")]
    pub mean_voltage: Option<f32>,
}

/// Reply to a `compute_batch`.
#[derive(Debug, Clone, Serialize)]
pub struct ComputeBatchResult {
    #[serde(rename = "type")]
    pub msg_type: &'static str, // "compute_batch_result"
    #[serde(rename = "batchId")]
    pub batch_id: u64,
    #[serde(rename = "perCluster")]
    pub per_cluster: HashMap<String, PerClusterResult>,
}

/// Periodic per-donor stats (every ~5 s).
#[derive(Debug, Clone, Serialize)]
pub struct GpuTelemetry {
    #[serde(rename = "type")]
    pub msg_type: &'static str, // "gpu_telemetry"
    #[serde(rename = "gpuName")]
    pub gpu_name: String,
    #[serde(rename = "vramMB")]
    pub vram_mb: u64,
    #[serde(rename = "maxBindMB")]
    pub max_bind_mb: u64,
    #[serde(rename = "gneuronsPerSec")]
    pub gneurons_per_sec: f64,
    #[serde(rename = "stepsComputed")]
    pub steps_computed: u64,
}

// ─── Server → Donor ───────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct Region {
    pub start: u32,
    pub end: u32,
    #[serde(default)]
    pub side: Option<String>,
}

/// Allocate buffers for one cluster.
#[derive(Debug, Clone, Deserialize)]
pub struct GpuInit {
    #[serde(rename = "clusterName")]
    pub cluster_name: String,
    pub size: u32,
    #[serde(rename = "tonicDrive", default)]
    pub tonic_drive: f32,
    #[serde(rename = "noiseAmp", default)]
    pub noise_amp: f32,
    #[serde(default)]
    pub regions: HashMap<String, Region>,
}

/// One cluster's modulation inputs within a `compute_batch`.
#[derive(Debug, Clone, Deserialize)]
pub struct ClusterParams {
    pub name: String,
    pub size: u32,
    #[serde(rename = "tonicDrive", default)]
    pub tonic_drive: f32,
    #[serde(rename = "noiseAmp", default)]
    pub noise_amp: f32,
    #[serde(rename = "gainMultiplier", default = "one")]
    pub gain_multiplier: f32,
    #[serde(rename = "emotionalGate", default = "one")]
    pub emotional_gate: f32,
    #[serde(rename = "driveBaseline", default = "one")]
    pub drive_baseline: f32,
    #[serde(rename = "errorCorrection", default)]
    pub error_correction: f32,
    #[serde(default)]
    pub reward: f32,
}

/// Batched multi-cluster step request.
#[derive(Debug, Clone, Deserialize)]
pub struct ComputeBatch {
    #[serde(rename = "batchId")]
    pub batch_id: u64,
    pub substeps: u32,
    #[serde(default)]
    pub psi: f32,
    pub clusters: Vec<ClusterParams>,
}

fn one() -> f32 {
    1.0
}

/// Rebind a sparse matrix to cluster sub-slices (we ack it; binding detail used later).
#[derive(Debug, Clone, Deserialize)]
pub struct RebindSparse {
    #[serde(rename = "reqId")]
    pub req_id: u32,
    pub name: String,
}

/// Ack for `rebind_sparse`.
#[derive(Debug, Clone, Serialize)]
pub struct RebindAck {
    #[serde(rename = "type")]
    pub msg_type: &'static str, // "rebind_sparse_ack"
    #[serde(rename = "reqId")]
    pub req_id: u32,
    pub name: String,
    pub ok: bool,
}

/// Tagged dispatch over the JSON messages a donor receives. Unknown types are ignored
/// (forward-compat, matching the browser donor).
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "gpu_init")]
    GpuInit(GpuInit),
    #[serde(rename = "compute_batch")]
    ComputeBatch(ComputeBatch),
    #[serde(rename = "rebind_sparse")]
    RebindSparse(RebindSparse),
    #[serde(other)]
    Other,
}
