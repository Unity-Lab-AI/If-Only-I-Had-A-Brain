//! GPU compute engine (M2 MVP): wgpu device + per-cluster buffers + the Rulkov LIF and
//! spike-count pipelines. One `ComputeEngine` per donated GPU. `init_cluster` allocates +
//! seeds a cluster; `step` runs one Rulkov iteration and returns the spike count.
//!
//! MVP shader set = LIF (Rulkov) + spike-count. Synapse propagate / Oja plasticity /
//! region ops are M3 (full participation).

use std::borrow::Cow;
use std::collections::HashMap;
use wgpu::util::DeviceExt;

use crate::gpu::{LIF_SHADER, SPIKE_COUNT_SHADER};

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

struct Cluster {
    size: u32,
    state: wgpu::Buffer,        // vec2<f32> per neuron
    spikes: wgpu::Buffer,       // u32 per neuron
    currents: wgpu::Buffer,     // f32 per neuron
    region_gates: wgpu::Buffer, // [start,end,gate,pad] f32 per region (≥1 dummy)
    num_regions: u32,
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
    clusters: HashMap<String, Cluster>,
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
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
        let adapters = instance.enumerate_adapters(wgpu::Backends::all());
        let adapter = adapters
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

        let lif_pipeline = build_pipeline(&device, "lif", LIF_SHADER);
        let spike_pipeline = build_pipeline(&device, "spike_count", SPIKE_COUNT_SHADER);

        Ok(Self {
            device,
            queue,
            adapter_name,
            lif_pipeline,
            spike_pipeline,
            clusters: HashMap::new(),
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
        num_regions: u32,
        tonic_drive: f32,
        noise_amp: f32,
    ) {
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
        // region_gates needs ≥1 entry (4 floats) even with 0 regions (no zero-size binding).
        let gates = vec![0f32; (num_regions.max(1) as usize) * 4];
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
                count,
                count_staging,
                noise_amp,
                tonic_drive,
            },
        );
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
    eng.init_cluster("selftest", neurons, 0, drive, 0.05);
    for s in 0..steps {
        let count = eng.step("selftest", drive, 0.05, s.wrapping_mul(2654435761))?;
        let pct = (count as f64 / neurons as f64) * 100.0;
        println!("  step {s:>3}: {count:>10} spikes ({pct:.2}% of {neurons})");
    }
    println!("self-test: OK — Rulkov LIF + spike-count ran on the GPU.");
    Ok(())
}
