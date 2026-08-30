//! GPU compute engine (M2 MVP): wgpu device + per-cluster buffers + the Rulkov LIF and
//! spike-count pipelines. One `ComputeEngine` per donated GPU. `init_cluster` allocates +
//! seeds a cluster; `step` runs one Rulkov iteration and returns the spike count.
//!
//! MVP shader set = LIF (Rulkov) + spike-count. Synapse propagate / Oja plasticity /
//! region ops are M3 (full participation).

use std::borrow::Cow;
use std::collections::HashMap;
use std::time::Instant;
use wgpu::util::DeviceExt;

use crate::frames::Binding;
use crate::gpu::{BUCKET_MEAN_SHADER, CURRENT_MAX_SHADER, LIF_SHADER, PLASTICITY_SHADER, PREDICTIVE_ERROR_SHADER, SCATTER_ONES_SHADER, SPIKE_COUNT_SHADER, SYNAPSE_PROPAGATE_SHADER, VOLTAGE_MEAN_SHADER};

const WORKGROUP: u32 = 256;
const MAX_WG_DIM: u32 = 65535;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct LifParams {
    n: u32,
    tau: f32,
    v_rest: f32,
    v_thresh: f32,
    v_reset: f32,
    dt: f32,
    r: f32,
    effective_drive: f32,
    noise_amp: f32,
    seed: u32,
    grid_x: u32,
    num_regions: u32,
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct SpikeParams {
    n: u32,
    grid_x: u32,
}

/// GOTCHA.3b (v0.3.32) — params for the voltage-mean reduction.
/// ⚠ `_pad` is REQUIRED, not cosmetic: a WGSL uniform block is 16-byte aligned,
/// and three `u32`s would leave the Rust side 4 bytes short of what the shader
/// reads. The shader declares the same `_pad` so both sides agree by inspection.
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct VoltParams {
    n: u32,
    chunk: u32,
    grid_x: u32,
    _pad: u32,
}

/// GOTCHA.3b — fixed partial-sum slot count. WGSL has no atomic float add, so
/// the reduction is one serial sum per slot and the host adds the slots. Fixed
/// (not derived from cluster size) so the readback is a constant ~1KB whether
/// the cluster is 50K or 12M — the board's own cost note for this field is
/// "one reduction + one small readback per tick, not a hot path".
const VOLT_PARTIALS: u32 = 256;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct PropagateParams {
    rows: u32,
    cols: u32,
    nnz: u32,
    src_offset: u32,
    dst_offset: u32,
}

/// GPUVERB.3 (v0.3.28) — max-reduction params.
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct MaxParams {
    n: u32,
    grid_x: u32,
}

/// GPUVERB.3 (v0.3.28) — predictive-error correction params.
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct PredErrParams {
    rows: u32,
    nnz: u32,
    lr: f32,
    max_p: f32,
    w_min: f32,
    w_max: f32,
    src_offset: u32,
    dst_offset: u32,
    grid_x: u32,
    _pad: [u32; 3],
}

/// GATEGPU.2 (v0.3.28) — bucket-mean reduction params.
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct BucketParams {
    bucket_count: u32,
    bucket_size: u32,
    rows: u32,
    grid_x: u32,
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct HebbParams {
    rows: u32,
    nnz: u32,
    lr: f32,
    reward: f32,
    w_min: f32,
    w_max: f32,
    src_offset: u32,
    dst_offset: u32,
}

/// v0.3.26 — uniform block for the masked-scatter pass (scatter_ones.wgsl).
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ScatterParams {
    count: u32,
    limit: u32,
}

/// A standalone CSR sparse matrix resident on the GPU (cross-projection or intra-synapse).
/// Cluster-bound mode (src/dst offsets into cluster slices) is a later refinement; MVP
/// uses standalone pre-spike / post-current buffers.
struct SparseMatrix {
    rows: u32,
    cols: u32,
    nnz: u32,
    values: wgpu::Buffer,
    col_idx: wgpu::Buffer,
    row_ptr: wgpu::Buffer,
    pre_spikes: wgpu::Buffer,    // u32 × cols
    post_currents: wgpu::Buffer, // f32 × rows
    post_spikes: wgpu::Buffer,   // u32 × rows
    currents_staging: wgpu::Buffer,
    /// v0.3.15 — cluster-slice binding: when set, batched-hebbian (type 5) reads the
    /// bound clusters' resident spike buffers at the bound offsets instead of the
    /// standalone pre/post buffers above.
    binding: Option<Binding>,
}

struct Cluster {
    size: u32,
    state: wgpu::Buffer,        // vec2<f32> per neuron
    spikes: wgpu::Buffer,       // u32 per neuron
    currents: wgpu::Buffer,     // f32 per neuron
    region_gates: wgpu::Buffer, // [start,end,gate,pad] f32 per region (≥1 dummy)
    num_regions: u32,
    regions: HashMap<String, (u32, u32)>, // name → (start, end) for region ops
    count: wgpu::Buffer,        // atomic<u32> [1]
    count_staging: wgpu::Buffer,
    noise_amp: f32,
    tonic_drive: f32,
}

pub struct ComputeEngine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    adapter_name: String,
    lif_pipeline: wgpu::ComputePipeline,
    spike_pipeline: wgpu::ComputePipeline,
    propagate_pipeline: wgpu::ComputePipeline,
    plasticity_pipeline: wgpu::ComputePipeline,
    scatter_pipeline: wgpu::ComputePipeline,
    /// GATEGPU.2 (v0.3.28) — reduces post currents to per-word-bucket means on the card.
    bucket_mean_pipeline: wgpu::ComputePipeline,
    /// GPUVERB.3 (v0.3.28) — max over post currents + the predictive-error write.
    current_max_pipeline: wgpu::ComputePipeline,
    predictive_error_pipeline: wgpu::ComputePipeline,
    /// GOTCHA.3b (v0.3.32) — voltage-mean reduction + its two buffers.
    /// ⭐ ENGINE-LEVEL, not per-cluster, and deliberately: `step_cluster` reduces
    /// one cluster at a time, so a single fixed VOLT_PARTIALS-slot buffer serves
    /// every cluster and adds ~1KB total instead of ~1KB × clusters. It also
    /// means adding this field touched no `Cluster` allocation site.
    voltage_mean_pipeline: wgpu::ComputePipeline,
    volt_partials: wgpu::Buffer,
    volt_staging: wgpu::Buffer,
    clusters: HashMap<String, Cluster>,
    sparse: HashMap<String, SparseMatrix>,
}

fn dispatch_dims(n: u32) -> (u32, u32, u32) {
    // i = gid.x + gid.y * grid_x * WORKGROUP ; grid_x = workgroups in x.
    let total_wg = n.div_ceil(WORKGROUP).max(1);
    let wg_x = total_wg.min(MAX_WG_DIM);
    let wg_y = total_wg.div_ceil(wg_x).max(1);
    (wg_x, wg_y, wg_x) // (dispatch x, dispatch y, grid_x uniform)
}

impl ComputeEngine {
    /// Build an engine on the adapter at `adapter_index` (from `gpu::enumerate` order).
    pub async fn new(adapter_index: usize) -> Result<Self, String> {
        // Same filtered list as gpu::enumerate (PRIMARY backend, non-CPU) so the index
        // here matches what the GUI/CLI showed.
        let adapter = crate::gpu::select_adapters()
            .into_iter()
            .nth(adapter_index)
            .ok_or_else(|| format!("no GPU adapter at index {adapter_index}"))?;
        Self::from_adapter(adapter).await
    }

    /// Build an engine on an already-selected adapter. `MultiEngine` uses this so every GPU
    /// shares ONE wgpu instance (fewer Vulkan contexts → cleaner teardown).
    pub async fn from_adapter(adapter: wgpu::Adapter) -> Result<Self, String> {
        let adapter_name = adapter.get_info().name;

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("unity-donor"),
                required_features: wgpu::Features::empty(),
                required_limits: adapter.limits(),
                memory_hints: wgpu::MemoryHints::Performance,
            }, None)
            .await
            .map_err(|e| format!("request_device failed: {e}"))?;

        // Don't let a wgpu validation error hard-panic the donor thread — log + continue
        // (the brain validates results and will drop us if compute is actually broken).
        device.on_uncaptured_error(Box::new(|e| {
            eprintln!("[gpu] wgpu error (non-fatal, continuing): {e}");
        }));

        let lif_pipeline = build_pipeline(&device, "lif", LIF_SHADER);
        let spike_pipeline = build_pipeline(&device, "spike_count", SPIKE_COUNT_SHADER);
        let propagate_pipeline = build_pipeline(&device, "synapse_propagate", SYNAPSE_PROPAGATE_SHADER);
        let plasticity_pipeline = build_pipeline(&device, "plasticity", PLASTICITY_SHADER);
        let scatter_pipeline = build_pipeline(&device, "scatter_ones", SCATTER_ONES_SHADER);
        let bucket_mean_pipeline = build_pipeline(&device, "bucket_mean", BUCKET_MEAN_SHADER);
        let current_max_pipeline = build_pipeline(&device, "current_max", CURRENT_MAX_SHADER);
        let predictive_error_pipeline = build_pipeline(&device, "predictive_error", PREDICTIVE_ERROR_SHADER);
        let voltage_mean_pipeline = build_pipeline(&device, "voltage_mean", VOLTAGE_MEAN_SHADER);
        // GOTCHA.3b — one fixed partials buffer for every cluster (see the field note).
        let volt_partials = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("volt-partials"),
            size: (VOLT_PARTIALS as u64) * 4,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let volt_staging = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("volt-staging"),
            size: (VOLT_PARTIALS as u64) * 4,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Ok(Self {
            device,
            queue,
            adapter_name,
            lif_pipeline,
            spike_pipeline,
            propagate_pipeline,
            plasticity_pipeline,
            scatter_pipeline,
            bucket_mean_pipeline,
            current_max_pipeline,
            predictive_error_pipeline,
            voltage_mean_pipeline,
            volt_partials,
            volt_staging,
            clusters: HashMap::new(),
            sparse: HashMap::new(),
        })
    }

    pub fn adapter_name(&self) -> &str {
        &self.adapter_name
    }

    /// Allocate + seed a cluster's GPU buffers. Seeds Rulkov (x,y) at golden-ratio
    /// quasi-random points inside the bursting attractor basin (matches the browser donor).
    pub fn init_cluster(
        &mut self,
        name: &str,
        size: u32,
        regions: &HashMap<String, (u32, u32)>,
        tonic_drive: f32,
        noise_amp: f32,
    ) {
        let num_regions = regions.len() as u32;
        let n = size as usize;
        // CPU-seed the state; golden-ratio low-discrepancy (x in [-1.5,-0.5], y near -3).
        const PHI: f32 = 1.618_034;
        let mut state: Vec<[f32; 2]> = Vec::with_capacity(n);
        for i in 0..n {
            let t = ((i as f32) * PHI).fract();
            let x = -1.5 + t; // [-1.5, -0.5]
            let y = -3.2 + (((i as f32) * PHI * PHI).fract()) * 0.4;
            state.push([x, y]);
        }
        let state_buf = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some(&format!("{name}-state")),
            contents: bytemuck::cast_slice(&state),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });
        let zero_u32 = vec![0u32; n.max(1)];
        let spikes = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some(&format!("{name}-spikes")),
            contents: bytemuck::cast_slice(&zero_u32),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });
        let zero_f32 = vec![0f32; n.max(1)];
        let currents = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some(&format!("{name}-currents")),
            contents: bytemuck::cast_slice(&zero_f32),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });
        // region_gates packed [start, end, gate, pad] per region; gate defaults to 1.0
        // (psi modulation is a later refinement). Needs ≥1 entry (no zero-size binding).
        let mut gates = vec![0f32; (num_regions.max(1) as usize) * 4];
        for (i, (_n, (start, end))) in regions.iter().enumerate() {
            gates[i * 4] = *start as f32;
            gates[i * 4 + 1] = *end as f32;
            gates[i * 4 + 2] = 1.0;
        }
        let region_gates = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some(&format!("{name}-region-gates")),
            contents: bytemuck::cast_slice(&gates),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });
        let count = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(&format!("{name}-count")),
            size: 4,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let count_staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(&format!("{name}-count-staging")),
            size: 4,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        self.clusters.insert(
            name.to_string(),
            Cluster {
                size,
                state: state_buf,
                spikes,
                currents,
                region_gates,
                num_regions,
                regions: regions.clone(),
                count,
                count_staging,
                noise_amp,
                tonic_drive,
            },
        );
    }

    /// Region op — write a spike pattern into a cluster sub-region (clears the region then
    /// sets 1 at each sparse index, relative to the region start). For curriculum teach.
    pub fn write_spike_slice(&self, cluster: &str, region: &str, indices: &[u32]) -> Result<(), String> {
        let c = self.clusters.get(cluster).ok_or_else(|| format!("cluster '{cluster}' missing"))?;
        // Dynamic regions (word_motor + per-subject bands) aren't in gpu_init — no-op for
        // now (M3.3: register them). Silent so the teach frame-flood isn't spammed.
        let (start, end) = match c.regions.get(region) { Some(r) => *r, None => return Ok(()) };
        let len = (end - start) as usize;
        let mut dense = vec![0u32; len.max(1)];
        for &idx in indices {
            if (idx as usize) < len {
                dense[idx as usize] = 1;
            }
        }
        self.queue.write_buffer(&c.spikes, (start as u64) * 4, bytemuck::cast_slice(&dense));
        Ok(())
    }

    /// Region op — zero a cluster sub-region's spike buffer.
    pub fn clear_spike_region(&self, cluster: &str, region: &str) -> Result<(), String> {
        let c = self.clusters.get(cluster).ok_or_else(|| format!("cluster '{cluster}' missing"))?;
        let (start, end) = match c.regions.get(region) { Some(r) => *r, None => return Ok(()) };
        let zeros = vec![0u32; ((end - start) as usize).max(1)];
        self.queue.write_buffer(&c.spikes, (start as u64) * 4, bytemuck::cast_slice(&zeros));
        Ok(())
    }

    /// Region op — write injected currents into a cluster sub-region (sparse → dense over
    /// the region, scaled by psi).
    pub fn write_current_slice(&self, cluster: &str, region: &str, indices: &[u32], values: &[f32], psi: f32) -> Result<(), String> {
        let c = self.clusters.get(cluster).ok_or_else(|| format!("cluster '{cluster}' missing"))?;
        let (start, end) = match c.regions.get(region) { Some(r) => *r, None => return Ok(()) };
        let len = (end - start) as usize;
        let mut dense = vec![0f32; len.max(1)];
        for (k, &idx) in indices.iter().enumerate() {
            if (idx as usize) < len {
                dense[idx as usize] = values.get(k).copied().unwrap_or(0.0) * psi;
            }
        }
        self.queue.write_buffer(&c.currents, (start as u64) * 4, bytemuck::cast_slice(&dense));
        Ok(())
    }

    /// Region op — reduce a region's spike sub-slice into `bucket_count` buckets (the
    /// letter-bucket argmax readback the curriculum uses). Reads the slice back to CPU.
    pub fn readback_letter_buckets(&self, cluster: &str, region: &str, bucket_count: u32, sub_slice_len: u32, start_offset: u32) -> Result<Vec<u32>, String> {
        let c = self.clusters.get(cluster).ok_or_else(|| format!("cluster '{cluster}' missing"))?;
        let (start, _end) = *c.regions.get(region).ok_or_else(|| format!("region '{region}' missing"))?;
        let len = sub_slice_len.max(1) as usize;
        let byte_off = ((start + start_offset) as u64) * 4;
        let staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback-staging"),
            size: (len as u64) * 4,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("readback") });
        enc.copy_buffer_to_buffer(&c.spikes, byte_off, &staging, 0, (len as u64) * 4);
        self.queue.submit(std::iter::once(enc.finish()));
        let (tx, rx) = std::sync::mpsc::channel();
        staging.slice(..).map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        rx.recv().map_err(|_| "map channel dropped".to_string())?.map_err(|e| format!("map failed: {e:?}"))?;
        let data = staging.slice(..).get_mapped_range();
        let spikes: &[u32] = bytemuck::cast_slice(&data[..len * 4]);
        let bc = bucket_count.max(1) as usize;
        let bucket_size = (len / bc).max(1);
        let mut buckets = vec![0u32; bc];
        for (b, slot) in buckets.iter_mut().enumerate() {
            let lo = b * bucket_size;
            let hi = ((b + 1) * bucket_size).min(len);
            *slot = spikes[lo..hi].iter().filter(|&&s| s != 0).count() as u32;
        }
        drop(data);
        staging.unmap();
        Ok(buckets)
    }

    pub fn has_cluster(&self, name: &str) -> bool {
        self.clusters.contains_key(name)
    }

    /// Run ONE Rulkov step on a cluster and return the spike count. Blocking on the GPU
    /// readback (per-tick) — acceptable for the MVP single-GPU donor.
    pub fn step(&self, name: &str, effective_drive: f32, noise_amp: f32, seed: u32) -> Result<u32, String> {
        let c = self.clusters.get(name).ok_or_else(|| format!("cluster '{name}' not initialized"))?;
        let (dx, dy, grid_x) = dispatch_dims(c.size);

        let lif_params = LifParams {
            n: c.size,
            tau: 20.0,
            v_rest: -65.0,
            v_thresh: -50.0,
            v_reset: -70.0,
            dt: 1.0,
            r: 1.0,
            effective_drive,
            noise_amp,
            seed,
            grid_x,
            num_regions: c.num_regions,
        };
        let lif_ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("lif-params"),
            contents: bytemuck::bytes_of(&lif_params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let lif_bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("lif-bg"),
            layout: &self.lif_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: lif_ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: c.state.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: c.spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: c.currents.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: c.region_gates.as_entire_binding() },
            ],
        });

        let spike_params = SpikeParams { n: c.size, grid_x };
        let spike_ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("spike-params"),
            contents: bytemuck::bytes_of(&spike_params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let spike_bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("spike-bg"),
            layout: &self.spike_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: spike_ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: c.spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: c.count.as_entire_binding() },
            ],
        });

        // zero the spike counter
        self.queue.write_buffer(&c.count, 0, &0u32.to_le_bytes());

        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("step") });
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("lif"), timestamp_writes: None });
            cp.set_pipeline(&self.lif_pipeline);
            cp.set_bind_group(0, &lif_bg, &[]);
            cp.dispatch_workgroups(dx, dy, 1);
        }
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("spike-count"), timestamp_writes: None });
            cp.set_pipeline(&self.spike_pipeline);
            cp.set_bind_group(0, &spike_bg, &[]);
            cp.dispatch_workgroups(dx, dy, 1);
        }
        enc.copy_buffer_to_buffer(&c.count, 0, &c.count_staging, 0, 4);
        self.queue.submit(std::iter::once(enc.finish()));

        // Block on the readback (MVP). Maintain::Wait fires the map callback.
        let (tx, rx) = std::sync::mpsc::channel();
        c.count_staging.slice(..).map_async(wgpu::MapMode::Read, move |res| {
            let _ = tx.send(res);
        });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        rx.recv().map_err(|_| "map_async channel dropped".to_string())?.map_err(|e| format!("map failed: {e:?}"))?;
        let data = c.count_staging.slice(..).get_mapped_range();
        let count = u32::from_le_bytes(data[0..4].try_into().unwrap());
        drop(data);
        c.count_staging.unmap();
        Ok(count)
    }

    /// GOTCHA.3b (v0.3.32) — mean of the Rulkov FAST variable across a cluster.
    ///
    /// Closes `donor.rs`'s hardcoded `mean_voltage: None`. The wire field
    /// (`protocol.rs:129`), the server's EMA blend (`brain-server.js:6282`) and
    /// the `state.js` publish were all already in place; the browser donor
    /// proves the shape. This is the only piece that was missing.
    ///
    /// ⛔ Call ONCE PER TICK, never per substep. `compute.html` carries the same
    /// rule with its own comment saying per-substep "would be wasteful", and
    /// this is a diagnostic, not part of the step.
    ///
    /// Returns `None` when the cluster is unknown or the readback fails — never
    /// `Some(0.0)` on failure. ⚠ That distinction is the whole point: `0.0` is a
    /// legitimate mean for a Rulkov population straddling zero, so returning it
    /// on error would be indistinguishable from a real quiet cluster, and this
    /// field exists precisely because a `null` that looked like a number wasted
    /// months.
    /// RHYTHM3S.2 (v0.3.34) — overwrite a cluster's `[start,end,gate,pad]`
    /// table with a host-built one (Ψ hemisphere gate × attention gains, built
    /// in donor.rs where the regions' `side` metadata lives). Capped at the
    /// capacity allocated at init: the table always carries the same region
    /// set, so a longer packed slice means a caller bug, and truncating loudly
    /// beats writing past the buffer.
    pub fn update_region_gates(&mut self, name: &str, packed: &[f32]) {
        let Some(c) = self.clusters.get_mut(name) else { return };
        let cap_entries = (c.num_regions.max(1)) as usize;
        let entries = (packed.len() / 4).min(cap_entries);
        if entries == 0 { return; }
        let slice = &packed[..entries * 4];
        self.queue.write_buffer(&c.region_gates, 0, bytemuck::cast_slice(slice));
        c.num_regions = entries as u32;
    }

    pub fn voltage_mean(&self, name: &str) -> Option<f32> {
        let c = self.clusters.get(name)?;
        if c.size == 0 { return None; }

        // Ceiling division so the last slot covers the remainder; the host
        // divides by the REAL n, so a short final chunk cannot skew the mean.
        let chunk = (c.size + VOLT_PARTIALS - 1) / VOLT_PARTIALS;
        let (dx, dy, grid_x) = dispatch_dims(VOLT_PARTIALS);
        let params = VoltParams { n: c.size, chunk, grid_x, _pad: 0 };
        let ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("volt-params"),
            contents: bytemuck::bytes_of(&params),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("volt-bg"),
            layout: &self.voltage_mean_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: c.state.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: self.volt_partials.as_entire_binding() },
            ],
        });

        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("volt") });
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("voltage-mean"), timestamp_writes: None });
            cp.set_pipeline(&self.voltage_mean_pipeline);
            cp.set_bind_group(0, &bg, &[]);
            cp.dispatch_workgroups(dx, dy, 1);
        }
        enc.copy_buffer_to_buffer(&self.volt_partials, 0, &self.volt_staging, 0, (VOLT_PARTIALS as u64) * 4);
        self.queue.submit(std::iter::once(enc.finish()));

        let (tx, rx) = std::sync::mpsc::channel();
        self.volt_staging.slice(..).map_async(wgpu::MapMode::Read, move |res| { let _ = tx.send(res); });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        // Any failure here unmaps and reports None. ⚠ The unmap must happen on
        // every path or the buffer stays mapped and the NEXT tick's map_async
        // fails too — one bad tick would poison the field permanently.
        match rx.recv() {
            Ok(Ok(())) => {}
            _ => { self.volt_staging.unmap(); return None; }
        }
        let data = self.volt_staging.slice(..).get_mapped_range();
        // f64 accumulator: 256 partials each holding up to ~47K summed f32s is
        // exactly where f32 accumulation starts losing low-order bits, and this
        // number is compared against a CPU shadow computed in f64.
        let mut sum: f64 = 0.0;
        for k in 0..(VOLT_PARTIALS as usize) {
            let o = k * 4;
            sum += f32::from_le_bytes(data[o..o + 4].try_into().unwrap()) as f64;
        }
        drop(data);
        self.volt_staging.unmap();
        let mean = (sum / (c.size as f64)) as f32;
        if mean.is_finite() { Some(mean) } else { None }
    }

    pub fn has_sparse(&self, name: &str) -> bool {
        self.sparse.contains_key(name)
    }

    /// Upload (or replace) a CSR sparse matrix on the GPU (standalone, or cluster-bound
    /// when `binding` is provided — see SparseMatrix.binding).
    pub fn upload_sparse(&mut self, name: &str, rows: u32, cols: u32, row_ptr: &[u32], values: &[f32], col_idx: &[u32], binding: Option<Binding>) {
        let nnz = values.len() as u32;
        let dev = &self.device;
        let su = wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST;
        // guard against zero-size bindings
        // Guard every buffer to ≥1 element — wgpu rejects a zero-size storage binding.
        let v: &[f32] = if values.is_empty() { &[0.0] } else { values };
        let ci: &[u32] = if col_idx.is_empty() { &[0] } else { col_idx };
        let rp: &[u32] = if row_ptr.is_empty() { &[0] } else { row_ptr };
        // TU.19-D — values buffer gets COPY_SRC so the GPU↔CPU parity harness can
        // read back the ACTUAL resident weights (checksum + samples) to attribute a
        // "shadow DIRTY" flag to stale-upload vs wrong-compute vs wrong-math.
        let values_buf = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(v), usage: su | wgpu::BufferUsages::COPY_SRC });
        let col_idx_buf = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(ci), usage: su });
        let row_ptr_buf = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(rp), usage: su });
        let pre = vec![0u32; cols.max(1) as usize];
        let pre_spikes = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(&pre), usage: su });
        let postf = vec![0f32; rows.max(1) as usize];
        let post_currents = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(&postf), usage: su | wgpu::BufferUsages::COPY_SRC });
        let postu = vec![0u32; rows.max(1) as usize];
        let post_spikes = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(&postu), usage: su });
        let currents_staging = dev.create_buffer(&wgpu::BufferDescriptor { label: Some(name), size: (rows.max(1) as u64) * 4, usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        self.sparse.insert(name.to_string(), SparseMatrix { rows, cols, nnz, values: values_buf, col_idx: col_idx_buf, row_ptr: row_ptr_buf, pre_spikes, post_currents, post_spikes, currents_staging, binding });
    }

    /// v0.3.15 — resident bound-hebbian: run plasticity on a cluster-BOUND matrix
    /// reading the bound clusters' resident spike buffers at the bound offsets
    /// (the state the type-7/9 pattern frames established). Returns Ok(true) when
    /// applied, Ok(false) when skipped (unbound / clusters not resident / degenerate).
    pub fn hebbian_bound(&self, name: &str, lr: f32) -> Result<bool, String> {
        let m = match self.sparse.get(name) { Some(m) => m, None => return Ok(false) };
        if m.rows == 0 || m.nnz == 0 {
            return Ok(false);
        }
        let b = match &m.binding { Some(b) => b, None => return Ok(false) };
        let src = match self.clusters.get(&b.src_cluster) { Some(c) => c, None => return Ok(false) };
        let dst = match self.clusters.get(&b.dst_cluster) { Some(c) => c, None => return Ok(false) };
        // The kernel reads preSpikes[srcOffset + colIdx[k]] (colIdx < cols) and
        // postSpikes[dstOffset + i] (i < rows) — both windows must fit the cluster
        // buffers or the dispatch would read out of bounds.
        if (b.src_start as u64) + (m.cols as u64) > (src.size as u64) { return Ok(false); }
        if (b.dst_start as u64) + (m.rows as u64) > (dst.size as u64) { return Ok(false); }
        let params = HebbParams { rows: m.rows, nnz: m.nnz, lr, reward: 1.0, w_min: -2.0, w_max: 2.0, src_offset: b.src_start, dst_offset: b.dst_start };
        let ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("hebb-bound-params"), contents: bytemuck::bytes_of(&params), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("hebb-bound-bg"),
            layout: &self.plasticity_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.values.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.col_idx.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: m.row_ptr.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: src.spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 5, resource: dst.spikes.as_entire_binding() },
            ],
        });
        let wg = (m.rows.div_ceil(WORKGROUP)).max(1).min(MAX_WG_DIM);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("hebbian-bound") });
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("hebbian-bound"), timestamp_writes: None });
            cp.set_pipeline(&self.plasticity_pipeline);
            cp.set_bind_group(0, &bg, &[]);
            cp.dispatch_workgroups(wg, 1, 1);
        }
        self.queue.submit(std::iter::once(enc.finish()));
        // No blocking readback — same fire-and-forget contract as standalone hebbian.
        Ok(true)
    }

    /// GPUVERB.3 (v0.3.28) — PREDICTIVE-ERROR CORRECTION, ENTIRELY ON THE CARD.
    ///
    /// The last signed-magnitude CPU training lane. Its post term is a per-row
    /// FLOAT error in [-1,1] — no existing verb could carry it (every spike
    /// buffer is 0/1 u32) and it could not be shipped as a mask either, because
    /// the error vector is DENSE: ~48MB per pair at the 12M cortex, worse than
    /// computing it on the CPU. So the whole three-step computation moves here
    /// and the wire carries a ~60-byte command:
    ///   1. propagate the resident bound spikes through the matrix,
    ///   2. reduce max(currents) for the normaliser (floored at 1e-6, exactly
    ///      like the server's `maxP` seed),
    ///   3. per row, form `clamp(target - current/maxP, -1, 1)` and apply
    ///      `w += lr·e·pre` clamped to [wMin, wMax].
    /// All three chain in ONE encoder, so there is no host round trip between
    /// them and nothing partially-applied can be observed.
    ///
    /// Fire-and-forget like every other bound plasticity verb. Returns false —
    /// never an error — on any not-ready condition, so the caller runs its CPU
    /// pass in full and nothing is ever silently dropped.
    pub fn predictive_error(&self, name: &str, lr: f32, w_min: f32, w_max: f32) -> Result<bool, String> {
        let m = match self.sparse.get(name) { Some(m) => m, None => return Ok(false) };
        if m.rows == 0 || m.nnz == 0 { return Ok(false); }
        let b = match &m.binding { Some(b) => b, None => return Ok(false) };
        let src = match self.clusters.get(&b.src_cluster) { Some(c) => c, None => return Ok(false) };
        let dst = match self.clusters.get(&b.dst_cluster) { Some(c) => c, None => return Ok(false) };
        // Same window guards as hebbian_bound: the kernels read
        // preSpikes[srcOffset + colIdx[k]] and postSpikes[dstOffset + i].
        if (b.src_start as u64) + (m.cols as u64) > (src.size as u64) { return Ok(false); }
        if (b.dst_start as u64) + (m.rows as u64) > (dst.size as u64) { return Ok(false); }

        // ── 1. propagate the resident spikes into the matrix's own current buffer
        let zeros = vec![0f32; m.rows.max(1) as usize];
        self.queue.write_buffer(&m.post_currents, 0, bytemuck::cast_slice(&zeros));
        let pparams = PropagateParams { rows: m.rows, cols: m.cols, nnz: m.nnz, src_offset: b.src_start, dst_offset: 0 };
        let pub_ = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("pe-prop-params"), contents: bytemuck::bytes_of(&pparams), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let pbg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pe-prop-bg"),
            layout: &self.propagate_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: pub_.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.values.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.col_idx.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: m.row_ptr.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: src.spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 5, resource: m.post_currents.as_entire_binding() },
            ],
        });

        // ── 2. max over the currents (u32 atomic over the bit pattern)
        let max_buf = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("pe-max"),
            contents: bytemuck::cast_slice(&[0u32]),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC | wgpu::BufferUsages::COPY_DST,
        });
        let max_staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("pe-max-staging"), size: 4,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let (mdx, mdy, mgrid) = dispatch_dims(m.rows);
        let mparams = MaxParams { n: m.rows, grid_x: mgrid };
        let mub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("pe-max-params"), contents: bytemuck::bytes_of(&mparams), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let mbg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pe-max-bg"),
            layout: &self.current_max_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: mub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.post_currents.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: max_buf.as_entire_binding() },
            ],
        });

        let wg = (m.rows.div_ceil(WORKGROUP)).max(1).min(MAX_WG_DIM);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("predictive-error-a") });
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("pe-propagate"), timestamp_writes: None });
            cp.set_pipeline(&self.propagate_pipeline);
            cp.set_bind_group(0, &pbg, &[]);
            cp.dispatch_workgroups(wg, 1, 1);
        }
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("pe-max"), timestamp_writes: None });
            cp.set_pipeline(&self.current_max_pipeline);
            cp.set_bind_group(0, &mbg, &[]);
            cp.dispatch_workgroups(mdx, mdy, 1);
        }
        enc.copy_buffer_to_buffer(&max_buf, 0, &max_staging, 0, 4);
        self.queue.submit(std::iter::once(enc.finish()));

        // maxP must be a UNIFORM value for the error pass, so it is read back —
        // 4 bytes, the only host round trip in the verb.
        let (tx, rx) = std::sync::mpsc::channel();
        max_staging.slice(..).map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        rx.recv().map_err(|_| "pe max channel dropped".to_string())?.map_err(|e| format!("pe max map failed: {e:?}"))?;
        let bits = {
            let d = max_staging.slice(..).get_mapped_range();
            u32::from_le_bytes([d[0], d[1], d[2], d[3]])
        };
        max_staging.unmap();
        // The server seeds `maxP = 1e-6` and only ever raises it, so the floor is
        // part of the rule, not a guard against division by zero.
        let max_p = f32::from_bits(bits).max(1e-6);

        // ── 3. error + weight update
        let (edx, edy, egrid) = dispatch_dims(m.rows);
        let eparams = PredErrParams {
            rows: m.rows, nnz: m.nnz, lr, max_p, w_min, w_max,
            src_offset: b.src_start, dst_offset: b.dst_start, grid_x: egrid, _pad: [0; 3],
        };
        let eub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("pe-params"), contents: bytemuck::bytes_of(&eparams), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let ebg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pe-bg"),
            layout: &self.predictive_error_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: eub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.values.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.col_idx.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: m.row_ptr.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: src.spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 5, resource: dst.spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 6, resource: m.post_currents.as_entire_binding() },
            ],
        });
        let mut enc2 = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("predictive-error-b") });
        {
            let mut cp = enc2.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("pe-write"), timestamp_writes: None });
            cp.set_pipeline(&self.predictive_error_pipeline);
            cp.set_bind_group(0, &ebg, &[]);
            cp.dispatch_workgroups(edx, edy, 1);
        }
        self.queue.submit(std::iter::once(enc2.finish()));
        Ok(true)
    }

    /// v0.3.26 — MASKED bound plasticity: pre reads the RESIDENT bound src-cluster
    /// spikes at the bound offset (the state the teach-frame twins keep current —
    /// zero transfer), post is an explicit sparse row mask scattered device-side
    /// into the matrix's own post buffer (clear_buffer zero-fill + scatter kernel;
    /// no dense host vector at any size). The plasticity kernel runs unchanged with
    /// src_offset = bound src start, dst_offset = 0 — the pre≠post shape neither
    /// hebbian_bound (pre==post on an intra matrix) nor hebbian (ships both sides
    /// over the wire) can express. `reps` loops the kernel stream-ordered in ONE
    /// encoder (the v0.3.19 rep-dose pattern: pattern written once, kernel looped).
    pub fn hebbian_bound_masked(&self, name: &str, lr: f32, reps: u32, post_idx: &[u32]) -> Result<bool, String> {
        let m = match self.sparse.get(name) { Some(m) => m, None => return Ok(false) };
        if m.rows == 0 || m.nnz == 0 || post_idx.is_empty() {
            return Ok(false);
        }
        let b = match &m.binding { Some(b) => b, None => return Ok(false) };
        let src = match self.clusters.get(&b.src_cluster) { Some(c) => c, None => return Ok(false) };
        // Pre window must fit the src cluster buffer (same guard as hebbian_bound).
        if (b.src_start as u64) + (m.cols as u64) > (src.size as u64) { return Ok(false); }

        // Mask index list → small storage buffer (~4B per masked row).
        let idx_buf = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("masked-post-idx"),
            contents: bytemuck::cast_slice(post_idx),
            usage: wgpu::BufferUsages::STORAGE,
        });
        let sp = ScatterParams { count: post_idx.len() as u32, limit: m.rows };
        let sp_ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("masked-scatter-params"),
            contents: bytemuck::bytes_of(&sp),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let scatter_bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("masked-scatter-bg"),
            layout: &self.scatter_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: sp_ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: idx_buf.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.post_spikes.as_entire_binding() },
            ],
        });

        let params = HebbParams { rows: m.rows, nnz: m.nnz, lr, reward: 1.0, w_min: -2.0, w_max: 2.0, src_offset: b.src_start, dst_offset: 0 };
        let ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("hebb-masked-params"), contents: bytemuck::bytes_of(&params), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("hebb-masked-bg"),
            layout: &self.plasticity_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.values.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.col_idx.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: m.row_ptr.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: src.spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 5, resource: m.post_spikes.as_entire_binding() },
            ],
        });
        let scatter_wg = ((post_idx.len() as u32).div_ceil(WORKGROUP)).max(1).min(MAX_WG_DIM);
        let wg = (m.rows.div_ceil(WORKGROUP)).max(1).min(MAX_WG_DIM);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("hebbian-bound-masked") });
        // Zero-then-scatter the post mask, all device-side. WebGPU orders
        // same-resource work within a queue submission, so the plasticity
        // dispatches below read exactly this mask.
        enc.clear_buffer(&m.post_spikes, 0, None);
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("masked-scatter"), timestamp_writes: None });
            cp.set_pipeline(&self.scatter_pipeline);
            cp.set_bind_group(0, &scatter_bg, &[]);
            cp.dispatch_workgroups(scatter_wg, 1, 1);
        }
        for _ in 0..reps.max(1) {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("hebbian-masked"), timestamp_writes: None });
            cp.set_pipeline(&self.plasticity_pipeline);
            cp.set_bind_group(0, &bg, &[]);
            cp.dispatch_workgroups(wg, 1, 1);
        }
        self.queue.submit(std::iter::once(enc.finish()));
        // Fire-and-forget: no blocking readback, same contract as hebbian_bound.
        Ok(true)
    }

    /// Scatter sparse spike indices into a dense u32 buffer (set 1 at each index).
    fn write_dense_spikes(&self, buf: &wgpu::Buffer, n: u32, indices: &[u32]) {
        let mut dense = vec![0u32; n.max(1) as usize];
        for &idx in indices {
            if (idx as usize) < dense.len() {
                dense[idx as usize] = 1;
            }
        }
        self.queue.write_buffer(buf, 0, bytemuck::cast_slice(&dense));
    }

    /// Run sparse propagate: scatter pre-spikes, matmul, return the post currents.
    pub fn propagate(&self, name: &str, pre_indices: &[u32]) -> Result<Vec<f32>, String> {
        let m = self.sparse.get(name).ok_or_else(|| format!("sparse '{name}' not uploaded"))?;
        // Empty/degenerate matrix → all-zero currents (no dispatch, no bind group).
        if m.rows == 0 || m.nnz == 0 {
            return Ok(vec![0.0; m.rows as usize]);
        }
        self.write_dense_spikes(&m.pre_spikes, m.cols, pre_indices);
        // zero post_currents
        let zeros = vec![0f32; m.rows.max(1) as usize];
        self.queue.write_buffer(&m.post_currents, 0, bytemuck::cast_slice(&zeros));

        let params = PropagateParams { rows: m.rows, cols: m.cols, nnz: m.nnz, src_offset: 0, dst_offset: 0 };
        let ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("prop-params"), contents: bytemuck::bytes_of(&params), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("prop-bg"),
            layout: &self.propagate_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.values.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.col_idx.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: m.row_ptr.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: m.pre_spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 5, resource: m.post_currents.as_entire_binding() },
            ],
        });
        let wg = (m.rows.div_ceil(WORKGROUP)).max(1).min(MAX_WG_DIM);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("propagate") });
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("propagate"), timestamp_writes: None });
            cp.set_pipeline(&self.propagate_pipeline);
            cp.set_bind_group(0, &bg, &[]);
            cp.dispatch_workgroups(wg, 1, 1);
        }
        enc.copy_buffer_to_buffer(&m.post_currents, 0, &m.currents_staging, 0, (m.rows.max(1) as u64) * 4);
        self.queue.submit(std::iter::once(enc.finish()));

        let (tx, rx) = std::sync::mpsc::channel();
        m.currents_staging.slice(..).map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        rx.recv().map_err(|_| "map channel dropped".to_string())?.map_err(|e| format!("map failed: {e:?}"))?;
        let data = m.currents_staging.slice(..).get_mapped_range();
        let out: Vec<f32> = bytemuck::cast_slice(&data[..(m.rows as usize) * 4]).to_vec();
        drop(data);
        m.currents_staging.unmap();
        Ok(out)
    }

    /// GATEGPU.2 (v0.3.28) — PROPAGATE, THEN REDUCE ON THE CARD.
    ///
    /// Identical propagate to the method above, but the post currents are
    /// reduced to per-word-bucket MEANS in a second dispatch and only those
    /// means are read back. The brain's emission argmax consumed exactly this
    /// reduction — after pulling the entire current vector over the wire: one
    /// spoken word dragged 720,000 floats (~2.9MB) so the server could turn
    /// them into ~2,500 bucket means. Now the ack is kilobytes.
    ///
    /// The divisor is each bucket's REAL span (the last bucket may be short),
    /// matching the server's `sum / cellCount` exactly.
    pub fn propagate_bucket_means(
        &self,
        name: &str,
        pre_indices: &[u32],
        bucket_size: u32,
        bucket_count: u32,
    ) -> Result<Vec<f32>, String> {
        let m = self.sparse.get(name).ok_or_else(|| format!("sparse '{name}' not uploaded"))?;
        let bc = bucket_count.max(1) as usize;
        let bs = bucket_size.max(1);
        if m.rows == 0 || m.nnz == 0 {
            return Ok(vec![0.0; bc]);
        }
        self.write_dense_spikes(&m.pre_spikes, m.cols, pre_indices);
        let zeros = vec![0f32; m.rows.max(1) as usize];
        self.queue.write_buffer(&m.post_currents, 0, bytemuck::cast_slice(&zeros));

        let params = PropagateParams { rows: m.rows, cols: m.cols, nnz: m.nnz, src_offset: 0, dst_offset: 0 };
        let ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("prop-params"), contents: bytemuck::bytes_of(&params), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("prop-bg"),
            layout: &self.propagate_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.values.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.col_idx.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: m.row_ptr.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: m.pre_spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 5, resource: m.post_currents.as_entire_binding() },
            ],
        });

        // Reduction target + its readback staging — bucket_count floats, not rows.
        let means_buf = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("bucket-means"),
            size: (bc as u64) * 4,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });
        let means_staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("bucket-means-staging"),
            size: (bc as u64) * 4,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let (bdx, bdy, bgrid) = dispatch_dims(bc as u32);
        let bparams = BucketParams { bucket_count: bc as u32, bucket_size: bs, rows: m.rows, grid_x: bgrid };
        let bub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("bucket-params"), contents: bytemuck::bytes_of(&bparams), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let bbg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("bucket-bg"),
            layout: &self.bucket_mean_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: bub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.post_currents.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: means_buf.as_entire_binding() },
            ],
        });

        let wg = (m.rows.div_ceil(WORKGROUP)).max(1).min(MAX_WG_DIM);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("propagate-bucket") });
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("propagate"), timestamp_writes: None });
            cp.set_pipeline(&self.propagate_pipeline);
            cp.set_bind_group(0, &bg, &[]);
            cp.dispatch_workgroups(wg, 1, 1);
        }
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("bucket-mean"), timestamp_writes: None });
            cp.set_pipeline(&self.bucket_mean_pipeline);
            cp.set_bind_group(0, &bbg, &[]);
            cp.dispatch_workgroups(bdx, bdy, 1);
        }
        enc.copy_buffer_to_buffer(&means_buf, 0, &means_staging, 0, (bc as u64) * 4);
        self.queue.submit(std::iter::once(enc.finish()));

        let (tx, rx) = std::sync::mpsc::channel();
        means_staging.slice(..).map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        rx.recv().map_err(|_| "map channel dropped".to_string())?.map_err(|e| format!("map failed: {e:?}"))?;
        let data = means_staging.slice(..).get_mapped_range();
        let out: Vec<f32> = bytemuck::cast_slice(&data[..bc * 4]).to_vec();
        drop(data);
        means_staging.unmap();
        Ok(out)
    }

    /// TU.19-D — read back a resident sparse matrix's weight digest for GPU↔CPU
    /// parity. Returns (nnz, FNV-1a-64 checksum over the bit-exact f32 value bytes,
    /// evenly-spaced (flat-index, value) samples). Copies the resident `values`
    /// buffer to a fresh MAP_READ staging buffer and maps it — same pattern as the
    /// currents readback above. `None` if no matrix by that name is resident.
    pub fn checksum_matrix(&self, name: &str, sample_count: u32) -> Option<(u32, u64, Vec<(u32, f32)>)> {
        let m = self.sparse.get(name)?;
        let nnz = m.nnz;
        if nnz == 0 {
            return Some((0, 0xcbf29ce484222325, Vec::new())); // FNV offset basis over empty
        }
        let byte_len = (nnz as u64) * 4;
        let staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("matrix-checksum-staging"),
            size: byte_len,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("matrix-checksum") });
        enc.copy_buffer_to_buffer(&m.values, 0, &staging, 0, byte_len);
        self.queue.submit(std::iter::once(enc.finish()));
        let (tx, rx) = std::sync::mpsc::channel();
        staging.slice(..).map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        if rx.recv().ok().and_then(|r| r.ok()).is_none() {
            return None;
        }
        let data = staging.slice(..).get_mapped_range();
        // FNV-1a 64 over the raw value bytes (bit-exact — matches the CPU-side digest).
        let mut hash: u64 = 0xcbf29ce484222325;
        for &b in &data[..(nnz as usize) * 4] {
            hash ^= b as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        let vals: &[f32] = bytemuck::cast_slice(&data[..(nnz as usize) * 4]);
        let cap = sample_count.min(64) as usize;
        let mut samples = Vec::with_capacity(cap);
        if cap > 0 {
            let step = (nnz as usize / cap).max(1);
            let mut i = 0usize;
            while i < nnz as usize && samples.len() < cap {
                samples.push((i as u32, vals[i]));
                i += step;
            }
        }
        drop(data);
        staging.unmap();
        Some((nnz, hash, samples))
    }

    /// `SHADOWCOST.3` — read a BYTE RANGE of a resident matrix's values back to the
    /// host, so the brain can checkpoint the weights the GPU actually trained.
    ///
    /// WHY THIS EXISTS: the server's checkpoint writes `cortex.synapses` from its
    /// CPU array, and the CPU array is not a lagging copy of this buffer — it is a
    /// different brain. 94% of the GPU's plasticity arrives via `hebbian_bound`,
    /// which trains on the RESIDENT spike state the host never sees, at ~49x the
    /// host's update rate. Measured live, the two drift apart at +0.0124 mean-
    /// magnitude ratio per minute and never reconverge. Without this op every
    /// Savestart silently restores the wrong weights.
    ///
    /// WHY IT IS CHUNKED and not one call: the intra matrix is ~452M nnz = ~1.81 GB
    /// of f32. That is too big for one staging allocation to be sane and far too big
    /// for one WebSocket frame (the donor's frame ceiling is ~16 MiB). The caller
    /// walks byte ranges and streams each one.
    ///
    /// `COPY_SRC` on the values buffers already exists — TU.19-D added it for the
    /// parity digest, so no upload path changes.
    ///
    /// ⚠ `copy_buffer_to_buffer` requires 4-byte-aligned offset AND size
    /// (COPY_BUFFER_ALIGNMENT). f32 is 4 bytes so any whole-element range is legal,
    /// but the range is clamped and re-aligned here rather than trusted from the
    /// wire — a misaligned copy is a validation error, and this runs on a device
    /// whose uncaptured-error handler deliberately does NOT panic, so it would
    /// otherwise fail silently and hand back a short buffer.
    pub fn read_values_chunk(&self, name: &str, byte_offset: u64, byte_len: u64) -> Option<Vec<u8>> {
        let m = self.sparse.get(name)?;
        let total = (m.nnz as u64) * 4;
        if total == 0 || byte_offset >= total { return None; }
        let off = byte_offset & !3u64;
        let len = (byte_len.min(total - off)) & !3u64;
        if len == 0 { return None; }
        let staging = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("matrix-values-readback-staging"),
            size: len,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("matrix-values-readback") });
        enc.copy_buffer_to_buffer(&m.values, off, &staging, 0, len);
        self.queue.submit(std::iter::once(enc.finish()));
        let (tx, rx) = std::sync::mpsc::channel();
        staging.slice(..).map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        if rx.recv().ok().and_then(|r| r.ok()).is_none() { return None; }
        let data = staging.slice(..).get_mapped_range();
        let out = data.to_vec();
        drop(data);
        staging.unmap();
        Some(out)
    }

    /// Total byte length of a resident matrix's values buffer (nnz * 4), so the
    /// caller can plan its chunk walk without guessing at nnz.
    pub fn values_byte_len(&self, name: &str) -> Option<u64> {
        self.sparse.get(name).map(|m| (m.nnz as u64) * 4)
    }

    /// Run Oja/anti-Hebbian plasticity on a sparse matrix (in place).
    pub fn hebbian(&self, name: &str, pre_indices: &[u32], post_indices: &[u32], lr: f32) -> Result<(), String> {
        let m = self.sparse.get(name).ok_or_else(|| format!("sparse '{name}' not uploaded"))?;
        if m.rows == 0 || m.nnz == 0 {
            return Ok(());
        }
        self.write_dense_spikes(&m.pre_spikes, m.cols, pre_indices);
        self.write_dense_spikes(&m.post_spikes, m.rows, post_indices);
        let params = HebbParams { rows: m.rows, nnz: m.nnz, lr, reward: 1.0, w_min: -2.0, w_max: 2.0, src_offset: 0, dst_offset: 0 };
        let ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("hebb-params"), contents: bytemuck::bytes_of(&params), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("hebb-bg"),
            layout: &self.plasticity_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.values.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.col_idx.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: m.row_ptr.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: m.pre_spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 5, resource: m.post_spikes.as_entire_binding() },
            ],
        });
        let wg = (m.rows.div_ceil(WORKGROUP)).max(1).min(MAX_WG_DIM);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("hebbian") });
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("hebbian"), timestamp_writes: None });
            cp.set_pipeline(&self.plasticity_pipeline);
            cp.set_bind_group(0, &bg, &[]);
            cp.dispatch_workgroups(wg, 1, 1);
        }
        self.queue.submit(std::iter::once(enc.finish()));
        // No blocking readback — hebbian only needs an ack; the GPU runs the dispatch
        // asynchronously. Blocking poll(Wait) here per-frame starved the WS reader during
        // the teach frame-flood and the brain reset the donor.
        Ok(())
    }

    /// v0.3.19 — rep-dose hebbian: the STATIC pattern is written ONCE and the
    /// plasticity kernel dispatches `reps` times in one encoder (WebGPU orders
    /// same-resource dispatches within/across passes, so the reps are
    /// sequential — identical math to reps separate calls). v0.3.18's executor
    /// looped the whole hebbian() per rep, re-writing two dense region-sized
    /// pattern buffers each time (~48MB × 2 × reps at the 12M intra — gigabytes
    /// of queue writes per dose) — the donor's GPU queue drowned and compute
    /// batches starved behind it (live: donor 'seen' climbed to ~300s).
    pub fn hebbian_reps(&self, name: &str, pre_indices: &[u32], post_indices: &[u32], lr: f32, reps: u32) -> Result<(), String> {
        let m = self.sparse.get(name).ok_or_else(|| format!("sparse '{name}' not uploaded"))?;
        if m.rows == 0 || m.nnz == 0 {
            return Ok(());
        }
        self.write_dense_spikes(&m.pre_spikes, m.cols, pre_indices);
        self.write_dense_spikes(&m.post_spikes, m.rows, post_indices);
        let params = HebbParams { rows: m.rows, nnz: m.nnz, lr, reward: 1.0, w_min: -2.0, w_max: 2.0, src_offset: 0, dst_offset: 0 };
        let ub = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("hebb-reps-params"), contents: bytemuck::bytes_of(&params), usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST });
        let bg = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("hebb-reps-bg"),
            layout: &self.plasticity_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: ub.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: m.values.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: m.col_idx.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: m.row_ptr.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 4, resource: m.pre_spikes.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 5, resource: m.post_spikes.as_entire_binding() },
            ],
        });
        let wg = (m.rows.div_ceil(WORKGROUP)).max(1).min(MAX_WG_DIM);
        let mut enc = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("hebbian-reps") });
        for _ in 0..reps.max(1) {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("hebbian-rep"), timestamp_writes: None });
            cp.set_pipeline(&self.plasticity_pipeline);
            cp.set_bind_group(0, &bg, &[]);
            cp.dispatch_workgroups(wg, 1, 1);
        }
        self.queue.submit(std::iter::once(enc.finish()));
        Ok(())
    }
}

fn build_pipeline(device: &wgpu::Device, label: &str, src: &str) -> wgpu::ComputePipeline {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some(label),
        source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(src)),
    });
    device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some(label),
        layout: None,
        module: &module,
        entry_point: Some("main"),
        compilation_options: wgpu::PipelineCompilationOptions::default(),
        cache: None,
    })
}

/// A host's local GPU pool presented to the brain as ONE compute unit. Holds one
/// `ComputeEngine` per selected GPU and routes each cluster / matrix to a GPU (round-robin),
/// so a SINGLE donor connection drives every GPU in the box — like a mining worker or a
/// data-parallel AI training node. The brain never sees the individual cards; it just sees
/// one big donor. `run_substeps` executes each GPU's clusters IN PARALLEL (one OS thread per
/// engine), so a compute_batch finishes in ~max-per-GPU time, not the sum → real speedup.
/// One GPU's compute backend. CUDA on NVIDIA (no 2 GB cap, more control); wgpu everywhere
/// else (AMD/Intel/Apple) — and as the fallback if CUDA init fails. Both expose the same
/// surface so `MultiEngine` is backend-agnostic. Host-write methods take `&mut self` (CUDA
/// needs it for memcpy-into-buffer); `step`/`has_*`/`readback` take `&self` so a batch can
/// run every GPU's clusters in parallel.
enum Backend {
    Wgpu(ComputeEngine),
    #[cfg(feature = "cuda")]
    Cuda(crate::cuda::CudaEngine),
}

impl Backend {
    fn adapter_name(&self) -> &str {
        match self {
            Backend::Wgpu(e) => e.adapter_name(),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.adapter_name(),
        }
    }
    fn kind(&self) -> &'static str {
        match self {
            Backend::Wgpu(_) => "wgpu",
            #[cfg(feature = "cuda")]
            Backend::Cuda(_) => "CUDA",
        }
    }
    fn init_cluster(&mut self, name: &str, size: u32, regions: &HashMap<String, (u32, u32)>, tonic: f32, noise: f32) {
        match self {
            Backend::Wgpu(e) => e.init_cluster(name, size, regions, tonic, noise),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.init_cluster(name, size, regions, tonic, noise),
        }
    }
    /// GOTCHA.3b (v0.3.32) — voltage mean, per backend.
    ///
    /// ⭐ BOTH BACKENDS, as the board's own cost note required: the reduction
    /// "must be written TWICE, once for wgpu and once for CUDA". `voltage_mean`
    /// exists in `shaders/voltage_mean.wgsl` and in `cuda_kernels.cu`, and the
    /// two Rust halves mirror each other line-for-line (fixed partial slots,
    /// host sums, host divides by the real `n`) precisely so a divergence would
    /// show up as a backend-dependent number rather than hiding.
    /// ⛔ Either half returns `None` on failure, never `Some(0.0)`.
    fn voltage_mean(&self, name: &str) -> Option<f32> {
        match self {
            Backend::Wgpu(e) => e.voltage_mean(name),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.voltage_mean(name),
        }
    }
    /// RHYTHM3S.2 (v0.3.34) — per-batch Ψ-gate table rewrite, per backend.
    fn update_region_gates(&mut self, name: &str, packed: &[f32]) {
        match self {
            Backend::Wgpu(e) => e.update_region_gates(name, packed),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.update_region_gates(name, packed),
        }
    }
    fn has_cluster(&self, name: &str) -> bool {
        match self {
            Backend::Wgpu(e) => e.has_cluster(name),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.has_cluster(name),
        }
    }
    fn step(&self, name: &str, drive: f32, noise: f32, seed: u32) -> Result<u32, String> {
        match self {
            Backend::Wgpu(e) => e.step(name, drive, noise, seed),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.step(name, drive, noise, seed),
        }
    }
    fn has_sparse(&self, name: &str) -> bool {
        match self {
            Backend::Wgpu(e) => e.has_sparse(name),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.has_sparse(name),
        }
    }
    fn upload_sparse(&mut self, name: &str, rows: u32, cols: u32, row_ptr: &[u32], values: &[f32], col_idx: &[u32], binding: Option<Binding>) {
        match self {
            Backend::Wgpu(e) => e.upload_sparse(name, rows, cols, row_ptr, values, col_idx, binding),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.upload_sparse(name, rows, cols, row_ptr, values, col_idx, binding),
        }
    }
    /// v0.3.15 — resident bound-hebbian (see engine impls).
    /// GPUVERB.3 (v0.3.28) — predictive-error correction. CUDA has no kernel for
    /// it yet, so it honestly reports "not carried" and the brain runs its CPU
    /// pass in full rather than silently skipping the correction.
    fn predictive_error(&mut self, name: &str, lr: f32, w_min: f32, w_max: f32) -> Result<bool, String> {
        match self {
            Backend::Wgpu(e) => e.predictive_error(name, lr, w_min, w_max),
            #[cfg(feature = "cuda")]
            Backend::Cuda(_) => Ok(false),
        }
    }
    fn hebbian_bound(&self, name: &str, lr: f32) -> Result<bool, String> {
        match self {
            Backend::Wgpu(e) => e.hebbian_bound(name, lr),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.hebbian_bound(name, lr),
        }
    }
    /// v0.3.26 — masked bound plasticity (resident pre, explicit sparse post mask).
    fn hebbian_bound_masked(&mut self, name: &str, lr: f32, reps: u32, post_idx: &[u32]) -> Result<bool, String> {
        match self {
            Backend::Wgpu(e) => e.hebbian_bound_masked(name, lr, reps, post_idx),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.hebbian_bound_masked(name, lr, reps, post_idx),
        }
    }
    fn propagate(&mut self, name: &str, pre: &[u32]) -> Result<Vec<f32>, String> {
        match self {
            Backend::Wgpu(e) => e.propagate(name, pre),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.propagate(name, pre),
        }
    }
    /// GATEGPU.2 (v0.3.28) — reduced readout. The CUDA backend has no bucket
    /// kernel yet, so it propagates and reduces the SAME arithmetic on the host
    /// (identical means; it saves the wire, not the CUDA readback) — an honest
    /// equivalent rather than a silent capability gap that would make a
    /// CUDA-donor emission disagree with a wgpu-donor emission.
    fn propagate_bucket_means(&mut self, name: &str, pre: &[u32], bucket_size: u32, bucket_count: u32) -> Result<Vec<f32>, String> {
        match self {
            Backend::Wgpu(e) => e.propagate_bucket_means(name, pre, bucket_size, bucket_count),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => {
                let currents = e.propagate(name, pre)?;
                let bc = bucket_count.max(1) as usize;
                let bs = bucket_size.max(1) as usize;
                let rows = currents.len();
                let mut means = vec![0.0f32; bc];
                for (b, slot) in means.iter_mut().enumerate() {
                    let start = b * bs;
                    if start >= rows { break; }
                    let end = (start + bs).min(rows);
                    let sum: f32 = currents[start..end].iter().sum();
                    *slot = sum / ((end - start) as f32);
                }
                Ok(means)
            }
        }
    }
    fn hebbian(&mut self, name: &str, pre: &[u32], post: &[u32], lr: f32) -> Result<(), String> {
        match self {
            Backend::Wgpu(e) => e.hebbian(name, pre, post, lr),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.hebbian(name, pre, post, lr),
        }
    }
    fn hebbian_reps(&mut self, name: &str, pre: &[u32], post: &[u32], lr: f32, reps: u32) -> Result<(), String> {
        match self {
            Backend::Wgpu(e) => e.hebbian_reps(name, pre, post, lr, reps),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.hebbian_reps(name, pre, post, lr, reps),
        }
    }
    fn write_spike_slice(&mut self, cluster: &str, region: &str, indices: &[u32]) -> Result<(), String> {
        match self {
            Backend::Wgpu(e) => e.write_spike_slice(cluster, region, indices),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.write_spike_slice(cluster, region, indices),
        }
    }
    fn write_current_slice(&mut self, cluster: &str, region: &str, indices: &[u32], values: &[f32], psi: f32) -> Result<(), String> {
        match self {
            Backend::Wgpu(e) => e.write_current_slice(cluster, region, indices, values, psi),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.write_current_slice(cluster, region, indices, values, psi),
        }
    }
    fn clear_spike_region(&mut self, cluster: &str, region: &str) -> Result<(), String> {
        match self {
            Backend::Wgpu(e) => e.clear_spike_region(cluster, region),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.clear_spike_region(cluster, region),
        }
    }
    fn readback_letter_buckets(&self, cluster: &str, region: &str, bucket_count: u32, sub_slice_len: u32, start_offset: u32) -> Result<Vec<u32>, String> {
        match self {
            Backend::Wgpu(e) => e.readback_letter_buckets(cluster, region, bucket_count, sub_slice_len, start_offset),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.readback_letter_buckets(cluster, region, bucket_count, sub_slice_len, start_offset),
        }
    }
    /// `SHADOWCOST.3` — byte range of a resident matrix's values, for checkpointing
    /// the weights the GPU actually trained.
    fn read_values_chunk(&self, name: &str, byte_offset: u64, byte_len: u64) -> Option<Vec<u8>> {
        match self {
            Backend::Wgpu(e) => e.read_values_chunk(name, byte_offset, byte_len),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.read_values_chunk(name, byte_offset, byte_len),
        }
    }
    /// `SHADOWCOST.3` — nnz * 4 for a resident matrix, so the caller can plan chunks.
    fn values_byte_len(&self, name: &str) -> Option<u64> {
        match self {
            Backend::Wgpu(e) => e.values_byte_len(name),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.values_byte_len(name),
        }
    }
    /// TU.19-D — resident weight digest for GPU↔CPU parity (checksum + samples).
    fn checksum_matrix(&self, name: &str, sample_count: u32) -> Option<(u32, u64, Vec<(u32, f32)>)> {
        match self {
            Backend::Wgpu(e) => e.checksum_matrix(name, sample_count),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.checksum_matrix(name, sample_count),
        }
    }
}

pub struct MultiEngine {
    engines: Vec<Backend>,
    /// Per-engine utilization % (1..=100) — each GPU duty-cycles to ITS own target so you can
    /// e.g. run a display GPU gently and a spare GPU hard, independently.
    util: Vec<f64>,
    /// Per-engine per-binding cap in MB (CUDA → VRAM, wgpu → adapter limit).
    binding_mb: Vec<u64>,
    /// Per-engine backend tag ("cuda" / "vulkan" / "dx12" / "metal" / "gl") — telemetry.
    backends: Vec<String>,
    /// Per-engine driver version string (from the wgpu adapter info) — telemetry.
    drivers: Vec<String>,
    /// Per-engine CUDA compute capability ("8.9", "12.0", …); empty on non-CUDA — telemetry.
    ccs: Vec<String>,
    cluster_gpu: HashMap<String, usize>,
    matrix_gpu: HashMap<String, usize>,
    next_cluster: usize,
    next_matrix: usize,
}

/// One cluster's per-batch stepping parameters (effective drive already folded in).
pub struct StepJob {
    pub name: String,
    pub size: u32,
    pub drive: f32,
    pub noise: f32,
}

#[derive(Default, Clone, Copy)]
pub struct StepOut {
    pub total: u64,
    pub last: u64,
    /// GOTCHA.3b (v0.3.32) — mean of the Rulkov fast variable, sampled ONCE at
    /// the end of the substep run rather than per substep. `None` means "not
    /// measured this run", never "zero" — see `voltage_mean()` for why that
    /// distinction is load-bearing.
    pub mean_voltage: Option<f32>,
}

impl MultiEngine {
    /// Build one engine per GPU index (filtered `gpu::enumerate` order), each with its own
    /// utilization target (`utils[k]` pairs with `indices[k]`; missing → 10%). All engines
    /// share ONE wgpu instance (the adapters from a single `select_adapters` call).
    pub async fn new(indices: &[usize], utils: &[u8]) -> Result<Self, String> {
        if indices.is_empty() {
            return Err("no GPUs selected".into());
        }
        let mut adapters: Vec<Option<wgpu::Adapter>> =
            crate::gpu::select_adapters().into_iter().map(Some).collect();
        // CUDA device names by ordinal, consumed as we match them to wgpu adapters (so two
        // identical cards map 1:1 in order). Empty when the `cuda` feature is off or no CUDA.
        #[cfg(feature = "cuda")]
        let mut cuda_names: Vec<Option<String>> =
            crate::cuda::device_names().into_iter().map(Some).collect();

        let mut engines = Vec::with_capacity(indices.len());
        let mut util = Vec::with_capacity(indices.len());
        let mut binding_mb = Vec::with_capacity(indices.len());
        let mut backends: Vec<String> = Vec::with_capacity(indices.len());
        let mut drivers: Vec<String> = Vec::with_capacity(indices.len());
        let mut ccs: Vec<String> = Vec::with_capacity(indices.len());
        for (k, &idx) in indices.iter().enumerate() {
            let adapter_slot = adapters.get_mut(idx).and_then(|o| o.take());
            // RUNPOD.6 — the CUDA path used to REQUIRE a wgpu adapter twice over: once for this
            // lookup, and again because the CUDA ordinal was found by NAME-MATCHING the adapter.
            // On a CUDA-only host (no Vulkan/DX adapter at all — most cloud GPU containers) both
            // failed, so a perfectly good card could never compute. With no adapter at this slot,
            // go straight to CUDA by ordinal. wgpu-visible hosts never reach this branch, so the
            // name-matched preference below (which keeps two identical cards mapped 1:1) is
            // unchanged. Driver string and wgpu backend tag are genuinely unavailable here — they
            // are reported empty rather than guessed.
            #[cfg(feature = "cuda")]
            if adapter_slot.is_none() {
                match crate::cuda::CudaEngine::new(idx) {
                    Ok(e) => {
                        let cap = e.binding_mb();
                        let cc = e.compute_capability().to_string();
                        let nm = e.adapter_name().to_string();
                        println!("[multi] GPU slot {idx} '{nm}' → CUDA-ONLY host (no wgpu adapter; ordinal {idx}, {cap} MB cap, no 2GB binding limit, cc {})", if cc.is_empty() { "?" } else { &cc });
                        if idx < cuda_names.len() {
                            cuda_names[idx] = None;
                        }
                        binding_mb.push(cap);
                        backends.push("cuda".to_string());
                        drivers.push(String::new());
                        ccs.push(cc);
                        engines.push(Backend::Cuda(e));
                        util.push((utils.get(k).copied().unwrap_or(10) as f64).clamp(1.0, 100.0));
                        continue;
                    }
                    Err(e) => {
                        return Err(format!(
                            "no GPU adapter at index {idx} and CUDA ordinal {idx} failed to init ({e}) — nothing can compute on this slot"
                        ));
                    }
                }
            }
            let adapter = adapter_slot
                .ok_or_else(|| format!("no GPU adapter at index {idx} (or selected twice)"))?;
            // Capture adapter info BEFORE the wgpu path consumes the adapter — driver string +
            // wgpu backend tag are valid for the CUDA card too (same physical NVIDIA driver).
            let ainfo = adapter.get_info();
            let aname = ainfo.name.clone();
            let driver_str = if !ainfo.driver_info.is_empty() { ainfo.driver_info.clone() } else { ainfo.driver.clone() };
            let wgpu_backend_tag: String = match ainfo.backend {
                wgpu::Backend::Vulkan => "vulkan",
                wgpu::Backend::Dx12 => "dx12",
                wgpu::Backend::Metal => "metal",
                wgpu::Backend::Gl => "gl",
                wgpu::Backend::BrowserWebGpu => "webgpu",
                _ => "unknown",
            }
            .to_string();
            let wgpu_cap = (adapter.limits().max_storage_buffer_binding_size as u64) / (1024 * 1024);

            // Prefer CUDA on a name-matched NVIDIA card; fall back to wgpu on any failure.
            #[cfg_attr(not(feature = "cuda"), allow(unused_mut))]
            let mut backend: Option<Backend> = None;
            #[cfg(feature = "cuda")]
            {
                if let Some(ord) = cuda_names.iter().position(|n| n.as_deref() == Some(aname.as_str())) {
                    match crate::cuda::CudaEngine::new(ord) {
                        Ok(e) => {
                            let cap = e.binding_mb();
                            let cc = e.compute_capability().to_string();
                            println!("[multi] GPU slot {idx} '{aname}' → CUDA (ordinal {ord}, {cap} MB cap, no 2GB binding limit, cc {})", if cc.is_empty() { "?" } else { &cc });
                            cuda_names[ord] = None;
                            binding_mb.push(cap);
                            backends.push("cuda".to_string());
                            drivers.push(driver_str.clone());
                            ccs.push(cc);
                            backend = Some(Backend::Cuda(e));
                        }
                        Err(e) => eprintln!("[multi] CUDA init for '{aname}' failed ({e}); using wgpu"),
                    }
                }
            }
            let backend = match backend {
                Some(b) => b,
                None => {
                    println!("[multi] GPU slot {idx} '{aname}' → wgpu/{wgpu_backend_tag} ({wgpu_cap} MB binding cap)");
                    binding_mb.push(wgpu_cap);
                    backends.push(wgpu_backend_tag);
                    drivers.push(driver_str);
                    ccs.push(String::new());
                    Backend::Wgpu(ComputeEngine::from_adapter(adapter).await?)
                }
            };
            engines.push(backend);
            util.push((utils.get(k).copied().unwrap_or(10) as f64).clamp(1.0, 100.0));
        }
        Ok(Self {
            engines,
            util,
            binding_mb,
            backends,
            drivers,
            ccs,
            cluster_gpu: HashMap::new(),
            matrix_gpu: HashMap::new(),
            next_cluster: 0,
            next_matrix: 0,
        })
    }

    pub fn gpu_count(&self) -> usize {
        self.engines.len()
    }

    /// The per-binding cap to advertise to the brain = the SMALLEST across the pool (a matrix
    /// lives on one GPU). All-CUDA pools advertise VRAM-sized caps (no 2 GB limit).
    pub fn advertised_binding_mb(&self) -> u64 {
        self.binding_mb.iter().copied().min().unwrap_or(2047)
    }

    /// One-line backend summary, e.g. "RTX 4070 SUPER [CUDA] + RTX 2060 [CUDA]".
    pub fn backend_summary(&self) -> String {
        self.engines.iter().map(|e| format!("{} [{}]", e.adapter_name(), e.kind())).collect::<Vec<_>>().join(" + ")
    }

    /// Combined label, e.g. "NVIDIA GeForce RTX 4070 + NVIDIA GeForce RTX 2060".
    pub fn gpu_label(&self) -> String {
        self.engines.iter().map(|e| e.adapter_name()).collect::<Vec<_>>().join(" + ")
    }

    /// Host OS for the Clients table ("linux" / "windows" / "macos" / …).
    pub fn os_platform(&self) -> String {
        std::env::consts::OS.to_string()
    }

    /// Backend tag(s) across the pool, e.g. "cuda" or "cuda+vulkan" — distinct, "+"-joined.
    pub fn engine_backend(&self) -> String {
        let mut seen: Vec<String> = Vec::new();
        for b in &self.backends {
            if !b.is_empty() && !seen.contains(b) {
                seen.push(b.clone());
            }
        }
        seen.join("+")
    }

    /// First non-empty GPU driver version across the pool.
    pub fn driver_version(&self) -> String {
        self.drivers.iter().find(|d| !d.is_empty()).cloned().unwrap_or_default()
    }

    /// First non-empty CUDA compute capability across the pool (empty if all-wgpu).
    pub fn compute_capability(&self) -> String {
        self.ccs.iter().find(|c| !c.is_empty()).cloned().unwrap_or_default()
    }

    fn cluster_engine(&mut self, name: &str) -> usize {
        if let Some(&g) = self.cluster_gpu.get(name) {
            return g;
        }
        let g = self.next_cluster % self.engines.len();
        self.next_cluster += 1;
        self.cluster_gpu.insert(name.to_string(), g);
        g
    }

    fn matrix_engine(&mut self, name: &str) -> usize {
        if let Some(&g) = self.matrix_gpu.get(name) {
            return g;
        }
        let g = self.next_matrix % self.engines.len();
        self.next_matrix += 1;
        self.matrix_gpu.insert(name.to_string(), g);
        g
    }

    pub fn init_cluster(&mut self, name: &str, size: u32, regions: &HashMap<String, (u32, u32)>, tonic: f32, noise: f32) {
        let g = self.cluster_engine(name);
        let placed = self.engines[g].adapter_name().to_string();
        self.engines[g].init_cluster(name, size, regions, tonic, noise);
        println!("[multi] cluster '{name}' → GPU {g} ({placed})");
    }

    /// RHYTHM3S.2 (v0.3.34) — route the per-batch Ψ-gate table rewrite to the
    /// GPU that holds the cluster. No-op for unknown clusters.
    pub fn update_region_gates(&mut self, name: &str, packed: &[f32]) {
        if let Some(&g) = self.cluster_gpu.get(name) {
            self.engines[g].update_region_gates(name, packed);
        }
    }

    pub fn has_cluster(&self, name: &str) -> bool {
        self.cluster_gpu.get(name).map(|&g| self.engines[g].has_cluster(name)).unwrap_or(false)
    }

    pub fn has_sparse(&self, name: &str) -> bool {
        self.matrix_gpu.get(name).map(|&g| self.engines[g].has_sparse(name)).unwrap_or(false)
    }

    pub fn upload_sparse(&mut self, name: &str, rows: u32, cols: u32, row_ptr: &[u32], values: &[f32], col_idx: &[u32], binding: Option<Binding>) {
        // v0.3.15 — ENGINE AFFINITY: a cluster-bound matrix's plasticity reads its
        // clusters' resident spike buffers, so the matrix MUST live on the same GPU
        // as those clusters. Route it there; if the two clusters somehow live on
        // DIFFERENT GPUs, the binding is dropped loudly (standalone behavior) rather
        // than dispatched across devices. Single-GPU hosts are unaffected.
        let mut bind = binding;
        if let Some(b) = &bind {
            let src_g = self.cluster_gpu.get(&b.src_cluster).copied();
            let dst_g = self.cluster_gpu.get(&b.dst_cluster).copied();
            match (src_g, dst_g) {
                (Some(sg), Some(dg)) if sg == dg => { self.matrix_gpu.insert(name.to_string(), sg); }
                (Some(_), Some(_)) => {
                    eprintln!("[multi] matrix '{name}' binds clusters on DIFFERENT GPUs — binding dropped; it stays standalone (bound hebbian skips it).");
                    bind = None;
                }
                _ => { /* cluster(s) not initialized yet — keep the binding; hebbian_bound skips until they are resident on this matrix's engine */ }
            }
        }
        let g = self.matrix_engine(name);
        self.engines[g].upload_sparse(name, rows, cols, row_ptr, values, col_idx, bind);
    }

    /// v0.3.15 — resident bound-hebbian for a type-5 batch op. Routes to the engine
    /// holding the matrix; Ok(false) = skipped (not resident / unbound), never an error.
    /// GPUVERB.3 (v0.3.28) — predictive-error correction on the engine holding the matrix.
    pub fn predictive_error(&mut self, name: &str, lr: f32, w_min: f32, w_max: f32) -> Result<bool, String> {
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(false) };
        self.engines[g].predictive_error(name, lr, w_min, w_max)
    }

    pub fn hebbian_bound(&self, name: &str, lr: f32) -> Result<bool, String> {
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(false) };
        self.engines[g].hebbian_bound(name, lr)
    }

    /// v0.3.26 — masked bound plasticity for a type-13 frame. Routes to the engine
    /// holding the matrix; Ok(false) = skipped (not resident / unbound), never an error.
    pub fn hebbian_bound_masked(&mut self, name: &str, lr: f32, reps: u32, post_idx: &[u32]) -> Result<bool, String> {
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(false) };
        self.engines[g].hebbian_bound_masked(name, lr, reps, post_idx)
    }

    pub fn propagate(&mut self, name: &str, pre: &[u32]) -> Result<Vec<f32>, String> {
        // Not resident yet (the brain sends propagate before the upload lands). Best-effort
        // zero-contribution — matches the browser donor's gpuReady gate. No spam.
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(Vec::new()) };
        self.engines[g].propagate(name, pre)
    }

    /// GATEGPU.2 (v0.3.28) — propagate + on-card bucket-mean reduction. Same
    /// not-resident posture as `propagate`: an empty Vec, which the brain reads
    /// as "no answer" and grades on its own CPU path instead.
    pub fn propagate_bucket_means(&mut self, name: &str, pre: &[u32], bucket_size: u32, bucket_count: u32) -> Result<Vec<f32>, String> {
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(Vec::new()) };
        self.engines[g].propagate_bucket_means(name, pre, bucket_size, bucket_count)
    }

    pub fn hebbian(&mut self, name: &str, pre: &[u32], post: &[u32], lr: f32) -> Result<(), String> {
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(()) };
        self.engines[g].hebbian(name, pre, post, lr)
    }

    /// v0.3.19 — rep-dose hebbian (pattern written once, kernel looped).
    pub fn hebbian_reps(&mut self, name: &str, pre: &[u32], post: &[u32], lr: f32, reps: u32) -> Result<(), String> {
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(()) };
        self.engines[g].hebbian_reps(name, pre, post, lr, reps)
    }

    /// TU.19-D — resident weight digest for GPU↔CPU parity. Routes to the engine
    /// that actually holds the matrix (matrix_gpu), same as propagate. `None` when
    /// the matrix isn't resident on any donor GPU — the server reads that as STALE
    /// (uploaded-but-dropped) vs a real checksum mismatch.
    pub fn checksum_matrix(&self, name: &str, sample_count: u32) -> Option<(u32, u64, Vec<(u32, f32)>)> {
        let g = *self.matrix_gpu.get(name)?;
        self.engines[g].checksum_matrix(name, sample_count)
    }

    /// `SHADOWCOST.3` — values readback, routed to the engine that actually holds
    /// the matrix (`matrix_gpu`), exactly like propagate and the parity digest.
    /// `None` when no donor GPU holds it, which the server reads as "cannot
    /// checkpoint from the GPU" and reports rather than papering over.
    pub fn read_values_chunk(&self, name: &str, byte_offset: u64, byte_len: u64) -> Option<Vec<u8>> {
        let g = *self.matrix_gpu.get(name)?;
        self.engines[g].read_values_chunk(name, byte_offset, byte_len)
    }

    /// `SHADOWCOST.3` — nnz * 4 for a resident matrix, routed the same way.
    pub fn values_byte_len(&self, name: &str) -> Option<u64> {
        let g = *self.matrix_gpu.get(name)?;
        self.engines[g].values_byte_len(name)
    }

    pub fn write_spike_slice(&mut self, cluster: &str, region: &str, indices: &[u32]) -> Result<(), String> {
        let g = match self.cluster_gpu.get(cluster) { Some(&g) => g, None => return Ok(()) };
        self.engines[g].write_spike_slice(cluster, region, indices)
    }

    pub fn write_current_slice(&mut self, cluster: &str, region: &str, indices: &[u32], values: &[f32], psi: f32) -> Result<(), String> {
        let g = match self.cluster_gpu.get(cluster) { Some(&g) => g, None => return Ok(()) };
        self.engines[g].write_current_slice(cluster, region, indices, values, psi)
    }

    pub fn clear_spike_region(&mut self, cluster: &str, region: &str) -> Result<(), String> {
        let g = match self.cluster_gpu.get(cluster) { Some(&g) => g, None => return Ok(()) };
        self.engines[g].clear_spike_region(cluster, region)
    }

    pub fn readback_letter_buckets(&self, cluster: &str, region: &str, bucket_count: u32, sub_slice_len: u32, start_offset: u32) -> Result<Vec<u32>, String> {
        let g = match self.cluster_gpu.get(cluster) { Some(&g) => g, None => return Ok(Vec::new()) };
        self.engines[g].readback_letter_buckets(cluster, region, bucket_count, sub_slice_len, start_offset)
    }

    /// Run `substeps` Rulkov iterations for every job, with each GPU's clusters executed in
    /// parallel on its own thread. Returns per-cluster spike totals keyed by cluster name.
    /// `stop` lets a long per-GPU duty-cycle idle (low util) bail promptly on ⏹ Stop instead
    /// of pinning the worker for seconds.
    pub fn run_substeps(&self, jobs: &[StepJob], substeps: u32, base_seed: u32, stop: &std::sync::atomic::AtomicBool, pending: &std::sync::atomic::AtomicUsize) -> HashMap<String, StepOut> {
        let substeps = substeps.max(1);
        let mut by_engine: Vec<Vec<usize>> = vec![Vec::new(); self.engines.len()];
        let mut out: HashMap<String, StepOut> = HashMap::new();
        for (i, job) in jobs.iter().enumerate() {
            match self.cluster_gpu.get(&job.name) {
                Some(&g) => by_engine[g].push(i),
                None => { out.insert(job.name.clone(), StepOut::default()); }
            }
        }
        // One thread per engine → GPUs run concurrently. Each thread owns a distinct engine
        // (no aliasing — step takes &self and devices are independent) and its own RNG seed
        // (the seed only drives stochastic noise; cross-GPU determinism isn't required).
        let results: Vec<Vec<(String, StepOut)>> = std::thread::scope(|scope| {
            let mut handles = Vec::new();
            for (g, idxs) in by_engine.iter().enumerate() {
                if idxs.is_empty() {
                    continue;
                }
                let engine = &self.engines[g];
                let seed0 = base_seed.wrapping_add((g as u32).wrapping_mul(0x9e3779b9));
                let util_g = self.util.get(g).copied().unwrap_or(100.0);
                let handle = scope.spawn(move || {
                    let t0 = Instant::now();
                    let mut seed = seed0;
                    let mut local = Vec::with_capacity(idxs.len());
                    for &i in idxs {
                        let job = &jobs[i];
                        let mut total: u64 = 0;
                        let mut last: u64 = 0;
                        for _ in 0..substeps {
                            seed = seed.wrapping_mul(2654435761).wrapping_add(40503);
                            match engine.step(&job.name, job.drive, job.noise, seed) {
                                Ok(count) => {
                                    let count = (count as u64).min(job.size as u64);
                                    total += count;
                                    last = count;
                                }
                                Err(e) => eprintln!("[donor] step error on '{}': {e}", job.name),
                            }
                        }
                        // GOTCHA.3b — sample the voltage mean ONCE per run, after
                        // the substep loop, not inside it. Per-substep would be
                        // one extra dispatch + blocking readback per substep on
                        // the hot path for a number the dashboard reads at ~1Hz.
                        let mean_voltage = engine.voltage_mean(&job.name);
                        local.push((job.name.clone(), StepOut { total, last, mean_voltage }));
                    }
                    // Per-GPU duty-cycle: idle a slice so THIS card's busy-fraction ≈ util_g%.
                    // (Independent per GPU — a gentle display card + a hard spare card coexist.)
                    // Sleep in small chunks so a ⏹ Stop during a long low-util idle is noticed
                    // fast (instead of pinning the worker for the whole idle slice).
                    if util_g < 100.0 {
                        let mut remaining = t0.elapsed().mul_f64((100.0 - util_g) / util_g);
                        let chunk = std::time::Duration::from_millis(50);
                        while remaining > std::time::Duration::ZERO {
                            // Bail the idle immediately on ⏹ Stop OR when new work is queued
                            // (an upload/ack/batch waiting) — never make the brain wait out a
                            // throttle sleep for its sparse-upload acks.
                            if stop.load(std::sync::atomic::Ordering::Relaxed)
                                || pending.load(std::sync::atomic::Ordering::Relaxed) > 0
                            {
                                break;
                            }
                            let nap = remaining.min(chunk);
                            std::thread::sleep(nap);
                            remaining -= nap;
                        }
                    }
                    local
                });
                handles.push(handle);
            }
            handles.into_iter().map(|h| h.join().unwrap_or_default()).collect()
        });
        for group in results {
            for (name, so) in group {
                out.insert(name, so);
            }
        }
        out
    }
}

/// Local self-test: build an engine on `gpu_index`, init a synthetic cluster, run `steps`
/// Rulkov iterations, print spike counts. Verifies the GPU compute path with NO brain.
pub async fn self_test(gpu_index: usize, neurons: u32, steps: u32, drive: f32) -> Result<(), String> {
    println!("self-test: building engine on GPU [{gpu_index}]...");
    let mut eng = ComputeEngine::new(gpu_index).await?;
    println!("self-test: device on '{}' — seeding {} neurons", eng.adapter_name(), neurons);
    eng.init_cluster("selftest", neurons, &HashMap::new(), drive, 0.05);
    for s in 0..steps {
        let count = eng.step("selftest", drive, 0.05, s.wrapping_mul(2654435761))?;
        let pct = (count as f64 / neurons as f64) * 100.0;
        println!("  step {s:>3}: {count:>10} spikes ({pct:.2}% of {neurons})");
    }

    // Sparse propagate check: a known 4x4 CSR, fire neurons {0,2}, verify currents.
    // dense rows: r0=[1,0,2,0] r1=[0,3,0,0] r2=[0,0,0,4] r3=[5,0,0,0]
    // CSR: row_ptr=[0,2,3,4,5] values=[1,2,3,4,5] col_idx=[0,2,1,3,0]
    // pre={0,2} → expected currents [1+2, 0, 0, 5] = [3,0,0,5]
    println!("self-test: sparse propagate (known 4x4 CSR)...");
    eng.upload_sparse("probe", 4, 4, &[0, 2, 3, 4, 5], &[1.0, 2.0, 3.0, 4.0, 5.0], &[0, 2, 1, 3, 0], None);
    let currents = eng.propagate("probe", &[0, 2])?;
    let expected = [3.0_f32, 0.0, 0.0, 5.0];
    println!("  currents = {currents:?} (expected {expected:?})");
    let ok = currents.len() == 4 && currents.iter().zip(expected.iter()).all(|(a, b)| (a - b).abs() < 1e-4);
    if !ok {
        return Err(format!("propagate mismatch: got {currents:?}, expected {expected:?}"));
    }

    // Plasticity smoke: one Oja step shouldn't error or NaN the weights.
    eng.hebbian("probe", &[0, 2], &[0], 0.1)?;

    // ── GPUVERB.3 PARITY (v0.3.28) — the predictive-error verb writes WEIGHTS, so
    // "it ran" is not verification. Compute the server's rule independently on the
    // host and require the GPU to have produced the same matrix.
    //
    // Setup: a 4-neuron bound cluster whose spikes are the pre AND post state
    // (the intra-matrix shape this verb exists for), and a known 4x4 CSR.
    println!("self-test: predictive-error parity (GPUVERB.3)...");
    {
        let mut regions = HashMap::new();
        regions.insert("all".to_string(), (0u32, 4u32));
        eng.init_cluster("pecluster", 4, &regions, 0.0, 0.0);
        eng.write_spike_slice("pecluster", "all", &[0, 2])?;   // target = [1,0,1,0]

        let row_ptr = [0u32, 2, 3, 4, 5];
        let values = [0.5f32, -0.25, 0.75, 1.5, -1.0];
        let col_idx = [0u32, 2, 1, 3, 0];
        let binding = crate::frames::Binding {
            src_cluster: "pecluster".to_string(), dst_cluster: "pecluster".to_string(),
            src_start: 0, src_end: 4, dst_start: 0, dst_end: 4,
        };
        eng.upload_sparse("pemat", 4, 4, &row_ptr, &values, &col_idx, Some(binding));

        let lr = 0.1f32;
        let (w_min, w_max) = (-2.0f32, 2.0f32);

        // ── the server's rule, computed here on the host ──
        let target = [1.0f32, 0.0, 1.0, 0.0];
        let mut predicted = [0.0f32; 4];
        for i in 0..4usize {
            let (s, e) = (row_ptr[i] as usize, row_ptr[i + 1] as usize);
            let mut sum = 0.0f32;
            for k in s..e {
                if target[col_idx[k] as usize] != 0.0 { sum += values[k]; }
            }
            predicted[i] = sum;
        }
        let mut max_p = 1e-6f32;
        for v in predicted.iter() { if *v > max_p { max_p = *v; } }
        let mut want = values;
        for i in 0..4usize {
            let mut err = target[i] - predicted[i] / max_p;
            if err > 1.0 { err = 1.0; }
            if err < -1.0 { err = -1.0; }
            if err == 0.0 { continue; }
            let (s, e) = (row_ptr[i] as usize, row_ptr[i + 1] as usize);
            for k in s..e {
                if target[col_idx[k] as usize] != 0.0 {
                    let mut w = want[k] + lr * err;
                    if w > w_max { w = w_max; }
                    if w < w_min { w = w_min; }
                    want[k] = w;
                }
            }
        }

        let carried = eng.predictive_error("pemat", lr, w_min, w_max)?;
        if !carried { return Err("predictive_error refused a properly bound matrix".to_string()); }

        // Read the weights back through propagate: with every pre neuron firing,
        // currents[i] is row i's full sum, so all five stored values are covered.
        // A second view with a partial pre set disambiguates within-row offsets.
        let check = |pre: &[u32], eng: &ComputeEngine| -> Result<(), String> {
            let got = eng.propagate("pemat", pre)?;
            let mut exp = [0.0f32; 4];
            for i in 0..4usize {
                let (s, e) = (row_ptr[i] as usize, row_ptr[i + 1] as usize);
                let mut sum = 0.0f32;
                for k in s..e { if pre.contains(&col_idx[k]) { sum += want[k]; } }
                exp[i] = sum;
            }
            let bad = got.len() != 4 || got.iter().zip(exp.iter()).any(|(a, b)| (a - b).abs() > 1e-4);
            if bad { return Err(format!("predictive-error parity MISMATCH for pre={pre:?}: gpu={got:?} host={exp:?}")); }
            println!("  pre={pre:?} -> {got:?} (host rule: {exp:?})");
            Ok(())
        };
        check(&[0, 1, 2, 3], &eng)?;
        check(&[0], &eng)?;
        check(&[1, 3], &eng)?;
        println!("  predictive-error parity OK — the card reproduced the server's rule exactly.");
    }

    println!("self-test: OK — Rulkov LIF + spike-count + sparse propagate + plasticity + predictive-error parity ran on the GPU.");
    Ok(())
}
