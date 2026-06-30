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
    /// Persistent per-install donor id — keys this host's cumulative leaderboard total.
    #[serde(rename = "donorId", skip_serializing_if = "Option::is_none")]
    pub donor_id: Option<String>,
    /// Optional leaderboard display name. Same name across devices → ONE aggregated row.
    #[serde(rename = "donorName", skip_serializing_if = "Option::is_none")]
    pub donor_name: Option<String>,
    /// Host OS ("linux" / "windows" / "macos") — so a 0-Gn/s donor's platform is visible in the
    /// Clients table instead of reverse-engineered from logs.
    #[serde(rename = "osPlatform", skip_serializing_if = "String::is_empty")]
    pub os_platform: String,
    /// Compute backend actually in use ("cuda" / "vulkan" / "dx12" / "metal" / "gl", or a
    /// "+"-joined mix for a multi-GPU pool). Distinguishes a CUDA donor from a wgpu one at a glance.
    #[serde(rename = "engineBackend", skip_serializing_if = "String::is_empty")]
    pub engine_backend: String,
    /// GPU driver version string (as reported by the wgpu adapter, e.g. "550.xx").
    #[serde(rename = "driverVersion", skip_serializing_if = "String::is_empty")]
    pub driver_version: String,
    /// CUDA compute capability ("8.9" Ada, "7.5" Turing, "12.0" Blackwell …) — empty on non-CUDA.
    #[serde(rename = "computeCapability", skip_serializing_if = "String::is_empty")]
    pub compute_capability: String,
    /// Donation duty-cycle (0–100). How much of this host's compute TIME is donated — the brain
    /// weights the community-compute tier by this so auto-scale counts DONATED capacity, not the
    /// full card. (Throughput knob; NOT a VRAM-held commitment.)
    #[serde(rename = "utilizationPct")]
    pub utilization_pct: u8,
    /// Explicit donated-VRAM cap in MB if the donor set one (`--memory`); 0 = unset (the brain then
    /// falls back to fullVram × utilization). This is the size-relevant number for data-parallel.
    #[serde(rename = "donatedMB")]
    pub donated_mb: u64,
    /// WSQ.4 — measured downlink throughput hint (megabits/sec; peak-hold with slow decay;
    /// 0 = unknown / not yet measured). Lets the brain pace replica-sync to this donor's REAL
    /// link capacity instead of an RTT proxy, so a low-bandwidth uplink (Starlink) isn't flooded.
    #[serde(rename = "linkDownMbps")]
    pub link_down_mbps: f64,
}

impl GpuRegister {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        vram_mb: u64,
        max_storage_binding_mb: u64,
        gpu_name: String,
        donor_id: Option<String>,
        donor_name: Option<String>,
        os_platform: String,
        engine_backend: String,
        driver_version: String,
        compute_capability: String,
        utilization_pct: u8,
        donated_mb: u64,
        link_down_mbps: f64,
    ) -> Self {
        Self {
            msg_type: "gpu_register",
            vram_mb,
            max_storage_binding_mb,
            gpu_name,
            donor_id,
            donor_name,
            os_platform,
            engine_backend,
            driver_version,
            compute_capability,
            utilization_pct,
            donated_mb,
            link_down_mbps,
        }
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
    #[serde(rename = "donorId", skip_serializing_if = "Option::is_none")]
    pub donor_id: Option<String>,
    #[serde(rename = "donorName", skip_serializing_if = "Option::is_none")]
    pub donor_name: Option<String>,
    /// Platform/backend re-reported on every telemetry tick so the Clients table stays correct
    /// even if the register frame was missed (e.g. reconnect race).
    #[serde(rename = "osPlatform", skip_serializing_if = "String::is_empty")]
    pub os_platform: String,
    #[serde(rename = "engineBackend", skip_serializing_if = "String::is_empty")]
    pub engine_backend: String,
    #[serde(rename = "driverVersion", skip_serializing_if = "String::is_empty")]
    pub driver_version: String,
    #[serde(rename = "computeCapability", skip_serializing_if = "String::is_empty")]
    pub compute_capability: String,
    /// WSQ.4 — measured downlink throughput (megabits/sec) re-reported each tick so the brain's
    /// sync pacing tracks the donor's real link capacity as it changes (Starlink varies).
    #[serde(rename = "linkDownMbps")]
    pub link_down_mbps: f64,
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

// ─── Region ops (M3.2 — curriculum teach/probe) ───────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct WriteSpikeSlice {
    #[serde(rename = "clusterName")]
    pub cluster_name: String,
    #[serde(rename = "regionName")]
    pub region_name: String,
    #[serde(rename = "sparseIndices", default)]
    pub sparse_indices: Vec<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WriteCurrentSlice {
    #[serde(rename = "clusterName")]
    pub cluster_name: String,
    #[serde(rename = "regionName")]
    pub region_name: String,
    #[serde(rename = "sparseIndices", default)]
    pub sparse_indices: Vec<u32>,
    #[serde(rename = "sparseValues", default)]
    pub sparse_values: Vec<f32>,
    #[serde(default = "one")]
    pub psi: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClearSpikeRegion {
    #[serde(rename = "clusterName")]
    pub cluster_name: String,
    #[serde(rename = "regionName")]
    pub region_name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReadbackLetterBuckets {
    #[serde(rename = "reqId")]
    pub req_id: u32,
    #[serde(rename = "clusterName")]
    pub cluster_name: String,
    #[serde(rename = "regionName")]
    pub region_name: String,
    #[serde(rename = "bucketCount")]
    pub bucket_count: u32,
    #[serde(rename = "subSliceLen")]
    pub sub_slice_len: u32,
    #[serde(rename = "startOffset", default)]
    pub start_offset: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadbackAck {
    #[serde(rename = "type")]
    pub msg_type: &'static str, // "readback_letter_buckets_ack"
    #[serde(rename = "reqId")]
    pub req_id: u32,
    #[serde(rename = "clusterName")]
    pub cluster_name: String,
    #[serde(rename = "regionName")]
    pub region_name: String,
    pub counts: Vec<u32>,
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
    #[serde(rename = "write_spike_slice")]
    WriteSpikeSlice(WriteSpikeSlice),
    #[serde(rename = "write_current_slice")]
    WriteCurrentSlice(WriteCurrentSlice),
    #[serde(rename = "clear_spike_region")]
    ClearSpikeRegion(ClearSpikeRegion),
    #[serde(rename = "readback_letter_buckets")]
    ReadbackLetterBuckets(ReadbackLetterBuckets),
    #[serde(other)]
    Other,
}
