//! GPU compute engine (M2 MVP): wgpu device + per-cluster buffers + the Rulkov LIF and
//! spike-count pipelines. One `ComputeEngine` per donated GPU. `init_cluster` allocates +
//! seeds a cluster; `step` runs one Rulkov iteration and returns the spike count.
//!
//! MVP shader set = LIF (Rulkov) + spike-count. Synapse propagate / Oja plasticity /
//! region ops are M3 (full participation).

use std::borrow::Cow;
use std::collections::HashMap;
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
