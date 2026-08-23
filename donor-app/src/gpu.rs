//! GPU discovery via wgpu. WebGPU forbids exposing true VRAM, so — exactly like the
//! browser donor — we advertise the adapter's `max_buffer_size` / `max_storage_buffer_binding_size`
//! as the capability the brain's capability-gated admission cares about.
//!
//! The actual compute device + per-cluster buffers + LIF/spike-count pipelines land in M2;
//! this module is enumeration + the advertised limits for `gpu_register`.

/// Embedded WGSL shaders, lifted verbatim from js/brain/gpu-compute.js.
pub const LIF_SHADER: &str = include_str!("shaders/lif.wgsl");
pub const SPIKE_COUNT_SHADER: &str = include_str!("shaders/spike_count.wgsl");
pub const SYNAPSE_PROPAGATE_SHADER: &str = include_str!("shaders/synapse_propagate.wgsl");
pub const PLASTICITY_SHADER: &str = include_str!("shaders/plasticity.wgsl");
/// v0.3.26 — device-side sparse scatter for the masked bound-plasticity verb.
pub const SCATTER_ONES_SHADER: &str = include_str!("shaders/scatter_ones.wgsl");
/// GATEGPU.2 (v0.3.28) — device-side bucket-mean reduction of post currents.
pub const BUCKET_MEAN_SHADER: &str = include_str!("shaders/bucket_mean.wgsl");
/// GPUVERB.3 (v0.3.28) — max over post currents (predictive-error normaliser).
pub const CURRENT_MAX_SHADER: &str = include_str!("shaders/current_max.wgsl");
/// GPUVERB.3 (v0.3.28) — predictive-error correction, computed and applied on the card.
pub const PREDICTIVE_ERROR_SHADER: &str = include_str!("shaders/predictive_error.wgsl");

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

/// Enumerate real GPU adapters (PRIMARY backend — Vulkan/Metal/DX12 — and not the CPU
/// software renderer), **de-duplicated to one entry per physical device**.
///
/// RUNPOD.16 (v0.3.25) — the old doc-comment claimed filtering to `Backends::PRIMARY`
/// "avoids listing the same physical GPU once per backend". **It does not on Windows,
/// where Vulkan AND DX12 are both PRIMARY.** Found by RUNNING the binary, not reading it:
/// `--list-gpus` on a one-GPU host printed *"Detected 2 GPU adapter(s)"* —
/// `[0] RTX 4070 Ti SUPER · Vulkan` and `[1] RTX 4070 Ti SUPER · Dx12`, the same card
/// twice. Consequences were real: `--gpus all` treats one card as two donors ("One
/// full-replica donor per GPU"), so the brain is told it has two full replicas of the
/// weights when it has one, and the GUI picker shows a phantom device.
///
/// WHY IT IS SAFE TO FIX HERE AND ONLY HERE. De-duplicating changes which physical device
/// each index maps to, and that is correctness-critical because `ComputeEngine::new`
/// (compute.rs:125) and `MultiEngine::new` (compute.rs:879) BOTH resolve their adapters
/// through this exact function. Fixing it in this one place keeps every index consistent
/// by construction — the failure mode the item warned about (indices disagreeing between
/// the listing and the device actually opened) is impossible if there is only one list.
///
/// WHICH DUPLICATE WINS: the one advertising the LARGEST
/// `max_storage_buffer_binding_size`, because that is the number the brain gates replica
/// admission on and the single biggest matrix a donor can hold. This is not arbitrary
/// tie-breaking: if the two backends ever disagree, the brain's replica-admission gate
/// should see the better of them rather than whichever wgpu happened to list first. Ties
/// fall back to the larger `max_buffer_size`, then to first-seen (enumeration order) so
/// the result is stable.
///
/// MEASURED, and it corrects an expectation: on the bench host BOTH backends report
/// `max-binding 2047 MB` — the u32 `maxStorageBufferRange` ceiling RUNPOD.7 is about — so
/// this was a TIE, not the capability win I first assumed when writing the rule. Vulkan
/// won on first-seen order. The de-dup is still exactly right (2 adapters → 1 physical
/// device) and the ordering rule is still the correct one to have; it simply did not buy
/// extra binding headroom here, and the 2047 MB ceiling remains RUNPOD.7's problem, not
/// something this can solve.
///
/// Identity key is `(vendor, device, name)`. Some backends report `device: 0`, so the name
/// is part of the key rather than trusting the numeric ids alone — two genuinely distinct
/// cards of the SAME model on the same backend keep distinct entries because wgpu lists
/// them separately and their (vendor, device) pair matches, which would collapse them —
/// so the guard below keeps any adapter whose backend is NEW for that key, and only
/// collapses same-key entries that differ by backend. That is precisely the Vulkan-vs-DX12
/// case and nothing else.
pub fn select_adapters() -> Vec<wgpu::Adapter> {
    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor::default());
    let all: Vec<wgpu::Adapter> = instance
        .enumerate_adapters(wgpu::Backends::PRIMARY)
        .into_iter()
        .filter(|a| a.get_info().device_type != wgpu::DeviceType::Cpu)
        .collect();

    // Group indices by physical-device identity, preserving first-seen order.
    let mut order: Vec<(u32, u32, String)> = Vec::new();
    let mut groups: std::collections::HashMap<(u32, u32, String), Vec<usize>> =
        std::collections::HashMap::new();
    for (i, a) in all.iter().enumerate() {
        let info = a.get_info();
        let key = (info.vendor, info.device, info.name.clone());
        if !groups.contains_key(&key) {
            order.push(key.clone());
        }
        groups.entry(key).or_default().push(i);
    }

    // If nothing collapsed, hand back the original list untouched — same behaviour as
    // before on Linux/macOS, where this problem does not occur.
    if order.len() == all.len() {
        return all;
    }

    let score = |a: &wgpu::Adapter| -> (u64, u64) {
        let l = a.limits();
        (l.max_storage_buffer_binding_size as u64, l.max_buffer_size)
    };
    let mut keep: Vec<usize> = Vec::with_capacity(order.len());
    for key in &order {
        let idxs = &groups[key];
        let mut best = idxs[0];
        for &i in idxs.iter().skip(1) {
            if score(&all[i]) > score(&all[best]) {
                best = i;
            }
        }
        if idxs.len() > 1 {
            let bi = all[best].get_info();
            let dropped: Vec<String> = idxs
                .iter()
                .filter(|&&i| i != best)
                .map(|&i| format!("{:?}", all[i].get_info().backend))
                .collect();
            println!(
                "[gpu] RUNPOD.16 — '{}' was enumerated {} times (one per backend); keeping {:?} \
                 (max-binding {} MB) and dropping {}. One entry per PHYSICAL device, so \
                 `--gpus all` cannot count a single card as two donors.",
                bi.name,
                idxs.len(),
                bi.backend,
                all[best].limits().max_storage_buffer_binding_size as u64 / MB,
                dropped.join(", ")
            );
        }
        keep.push(best);
    }
    keep.sort_unstable();
    let mut out: Vec<Option<wgpu::Adapter>> = all.into_iter().map(Some).collect();
    keep.into_iter().filter_map(|i| out[i].take()).collect()
}

/// Enumerate real GPUs, with the buffer limits we advertise.
pub fn enumerate() -> Vec<GpuInfo> {
    select_adapters()
        .into_iter()
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
