//! GPU discovery via wgpu. WebGPU forbids exposing true VRAM, so — exactly like the
//! browser donor — we advertise the adapter's `max_buffer_size` / `max_storage_buffer_binding_size`
//! as the capability the brain's capability-gated admission cares about.
//!
//! The actual compute device + per-cluster buffers + LIF/spike-count pipelines land in M2;
//! this module is enumeration + the advertised limits for `gpu_register`.

/// Embedded WGSL shaders, lifted verbatim from js/brain/gpu-compute.js (used in M2).
pub const LIF_SHADER: &str = include_str!("shaders/lif.wgsl");
pub const SPIKE_COUNT_SHADER: &str = include_str!("shaders/spike_count.wgsl");

#[derive(Debug, Clone)]
pub struct GpuInfo {
    pub index: usize,
    pub name: String,
    pub backend: String,
    pub device_type: String,
    /// max_buffer_size in MB — the per-buffer ceiling the brain gates replica admission on.
    pub max_buffer_mb: u64,
    /// max_storage_buffer_binding_size in MB — the single biggest matrix a donor can hold.
    pub max_storage_binding_mb: u64,
}

const MB: u64 = 1024 * 1024;

/// Enumerate every GPU adapter wgpu can see, with the buffer limits we advertise.
pub fn enumerate() -> Vec<GpuInfo> {
    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
    instance
        .enumerate_adapters(wgpu::Backends::all())
        .iter()
        .enumerate()
        .map(|(index, adapter)| {
            let info = adapter.get_info();
            let limits = adapter.limits();
            GpuInfo {
                index,
                name: info.name,
                backend: format!("{:?}", info.backend),
                device_type: format!("{:?}", info.device_type),
                max_buffer_mb: limits.max_buffer_size / MB,
                max_storage_binding_mb: (limits.max_storage_buffer_binding_size as u64) / MB,
            }
        })
        .collect()
}

/// Pretty `--list-gpus` output.
pub fn print_list(gpus: &[GpuInfo]) {
    if gpus.is_empty() {
        println!("No GPU adapters detected. (No WebGPU/Vulkan/Metal/DX adapter available.)");
        return;
    }
    println!("Detected {} GPU adapter(s):", gpus.len());
    for g in gpus {
        println!(
            "  [{}] {}  · {} · {}  · max-buffer {} MB · max-binding {} MB",
            g.index, g.name, g.device_type, g.backend, g.max_buffer_mb, g.max_storage_binding_mb
        );
    }
    println!("\nDonate a subset with --gpus 0,1  (or --gpus all). One full-replica donor per GPU.");
}
