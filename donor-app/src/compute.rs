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

use crate::gpu::{LIF_SHADER, PLASTICITY_SHADER, SPIKE_COUNT_SHADER, SYNAPSE_PROPAGATE_SHADER};

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

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct PropagateParams {
    rows: u32,
    cols: u32,
    nnz: u32,
    src_offset: u32,
    dst_offset: u32,
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

        Ok(Self {
            device,
            queue,
            adapter_name,
            lif_pipeline,
            spike_pipeline,
            propagate_pipeline,
            plasticity_pipeline,
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

    pub fn has_sparse(&self, name: &str) -> bool {
        self.sparse.contains_key(name)
    }

    /// Upload (or replace) a standalone CSR sparse matrix on the GPU.
    pub fn upload_sparse(&mut self, name: &str, rows: u32, cols: u32, row_ptr: &[u32], values: &[f32], col_idx: &[u32]) {
        let nnz = values.len() as u32;
        let dev = &self.device;
        let su = wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST;
        // guard against zero-size bindings
        // Guard every buffer to ≥1 element — wgpu rejects a zero-size storage binding.
        let v: &[f32] = if values.is_empty() { &[0.0] } else { values };
        let ci: &[u32] = if col_idx.is_empty() { &[0] } else { col_idx };
        let rp: &[u32] = if row_ptr.is_empty() { &[0] } else { row_ptr };
        let values_buf = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(v), usage: su });
        let col_idx_buf = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(ci), usage: su });
        let row_ptr_buf = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(rp), usage: su });
        let pre = vec![0u32; cols.max(1) as usize];
        let pre_spikes = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(&pre), usage: su });
        let postf = vec![0f32; rows.max(1) as usize];
        let post_currents = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(&postf), usage: su | wgpu::BufferUsages::COPY_SRC });
        let postu = vec![0u32; rows.max(1) as usize];
        let post_spikes = dev.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some(name), contents: bytemuck::cast_slice(&postu), usage: su });
        let currents_staging = dev.create_buffer(&wgpu::BufferDescriptor { label: Some(name), size: (rows.max(1) as u64) * 4, usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        self.sparse.insert(name.to_string(), SparseMatrix { rows, cols, nnz, values: values_buf, col_idx: col_idx_buf, row_ptr: row_ptr_buf, pre_spikes, post_currents, post_spikes, currents_staging });
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
    fn upload_sparse(&mut self, name: &str, rows: u32, cols: u32, row_ptr: &[u32], values: &[f32], col_idx: &[u32]) {
        match self {
            Backend::Wgpu(e) => e.upload_sparse(name, rows, cols, row_ptr, values, col_idx),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.upload_sparse(name, rows, cols, row_ptr, values, col_idx),
        }
    }
    fn propagate(&mut self, name: &str, pre: &[u32]) -> Result<Vec<f32>, String> {
        match self {
            Backend::Wgpu(e) => e.propagate(name, pre),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.propagate(name, pre),
        }
    }
    fn hebbian(&mut self, name: &str, pre: &[u32], post: &[u32], lr: f32) -> Result<(), String> {
        match self {
            Backend::Wgpu(e) => e.hebbian(name, pre, post, lr),
            #[cfg(feature = "cuda")]
            Backend::Cuda(e) => e.hebbian(name, pre, post, lr),
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
            let adapter = adapters
                .get_mut(idx)
                .and_then(|o| o.take())
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

    pub fn has_cluster(&self, name: &str) -> bool {
        self.cluster_gpu.get(name).map(|&g| self.engines[g].has_cluster(name)).unwrap_or(false)
    }

    pub fn has_sparse(&self, name: &str) -> bool {
        self.matrix_gpu.get(name).map(|&g| self.engines[g].has_sparse(name)).unwrap_or(false)
    }

    pub fn upload_sparse(&mut self, name: &str, rows: u32, cols: u32, row_ptr: &[u32], values: &[f32], col_idx: &[u32]) {
        let g = self.matrix_engine(name);
        self.engines[g].upload_sparse(name, rows, cols, row_ptr, values, col_idx);
    }

    pub fn propagate(&mut self, name: &str, pre: &[u32]) -> Result<Vec<f32>, String> {
        // Not resident yet (the brain sends propagate before the upload lands). Best-effort
        // zero-contribution — matches the browser donor's gpuReady gate. No spam.
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(Vec::new()) };
        self.engines[g].propagate(name, pre)
    }

    pub fn hebbian(&mut self, name: &str, pre: &[u32], post: &[u32], lr: f32) -> Result<(), String> {
        let g = match self.matrix_gpu.get(name) { Some(&g) => g, None => return Ok(()) };
        self.engines[g].hebbian(name, pre, post, lr)
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
                        local.push((job.name.clone(), StepOut { total, last }));
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
    eng.upload_sparse("probe", 4, 4, &[0, 2, 3, 4, 5], &[1.0, 2.0, 3.0, 4.0, 5.0], &[0, 2, 1, 3, 0]);
    let currents = eng.propagate("probe", &[0, 2])?;
    let expected = [3.0_f32, 0.0, 0.0, 5.0];
    println!("  currents = {currents:?} (expected {expected:?})");
    let ok = currents.len() == 4 && currents.iter().zip(expected.iter()).all(|(a, b)| (a - b).abs() < 1e-4);
    if !ok {
        return Err(format!("propagate mismatch: got {currents:?}, expected {expected:?}"));
    }

    // Plasticity smoke: one Oja step shouldn't error or NaN the weights.
    eng.hebbian("probe", &[0, 2], &[0], 0.1)?;

    println!("self-test: OK — Rulkov LIF + spike-count + sparse propagate + plasticity ran on the GPU.");
    Ok(())
}
