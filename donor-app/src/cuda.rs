//! CUDA compute backend (NVIDIA) — the high-control sibling of the wgpu `ComputeEngine`.
//!
//! Same brain protocol, same math (the four compute kernels are line-for-line ports of the
//! WGSL in `shaders/`, so a CUDA donor and a browser/wgpu donor return byte-identical
//! results — the brain can't tell them apart). What CUDA buys: no 2 GB per-binding cap
//! (device pointers are sized only by VRAM), real streams, and a much higher ceiling.
//! Teach patterns (spike/current writes, clears, plasticity pre/post sets) scatter
//! DEVICE-SIDE via the fill_zero_* / scatter_* kernels — the host uploads only sparse
//! index lists, never dense region-sized vectors.
//!
//! Built only with the `cuda` feature. cudarc is loaded with `dynamic-loading`, so the
//! binary links without CUDA and this whole module no-ops gracefully on non-NVIDIA hosts —
//! `MultiEngine` falls back to wgpu there. Every entry point that touches the driver is
//! wrapped so a missing libcuda can't crash the app.

use std::collections::HashMap;
use std::sync::Arc;

use cudarc::driver::{CudaContext, CudaFunction, CudaSlice, CudaStream, LaunchConfig, PushKernelArg};
use cudarc::nvrtc::Ptx;

use crate::frames::Binding;

const THREADS: u32 = 256;

/// Precompiled PTX for the nine kernels (see cuda_kernels.cu). Loaded via the driver
/// (`cuModuleLoadData`) — NO nvrtc at runtime, so a host needs only libcuda, and we sidestep
/// the nvrtc ABI-version mismatch between toolkit releases. The driver JITs this PTX to
/// whatever NVIDIA arch the host actually has.
///
/// ⛔ REGENERATION IS VERSION-PINNED, and the pin is a shipped fix, not a preference.
/// This PTX is `.version 8.0` / `.target sm_75`, built with CUDA 12.0.140 — the ISA 8.0
/// pin is v0.3.21 ("the CUDA path comes back on r570 hosts"): a newer toolkit emits a
/// newer PTX ISA that older drivers cannot JIT, and the module load fails WHOLE — every
/// kernel, not just the new one — kicking that donor to wgpu (headless pods often have
/// no Vulkan, so that can mean no compute at all). Regenerate ONLY with a CUDA 12.0
/// toolchain, e.g.:
///   docker run --rm -v <this dir>:/w nvidia/cuda:12.0.1-devel-ubuntu22.04 \
///     nvcc -ptx -arch=sm_75 -o /w/kernels.ptx /w/cuda_kernels.cu
/// then diff against the previous PTX: with labels normalized, pre-existing kernels
/// must come out byte-identical (same compiler build = same codegen).
const KERNELS_PTX: &str = include_str!("kernels.ptx");

fn cfg(n: u32) -> LaunchConfig {
    let blocks = n.max(1).div_ceil(THREADS);
    LaunchConfig { grid_dim: (blocks, 1, 1), block_dim: (THREADS, 1, 1), shared_mem_bytes: 0 }
}

/// Device names by CUDA ordinal (empty if CUDA is unavailable). Wrapped so a missing libcuda
/// on a non-NVIDIA host returns empty instead of crashing.
pub fn device_names() -> Vec<String> {
    std::panic::catch_unwind(|| {
        use cudarc::driver::result;
        let count = match CudaContext::device_count() { Ok(c) => c, Err(_) => return Vec::new() };
        let mut names = Vec::new();
        for ord in 0..count {
            match result::device::get(ord).and_then(result::device::get_name) {
                Ok(name) => names.push(name),
                Err(_) => names.push(String::new()),
            }
        }
        names
    })
    .unwrap_or_default()
}

/// Total VRAM (MB) for CUDA device `ordinal`, or 0 when the query fails. RUNPOD.6 needs this
/// BEFORE any engine exists: on a CUDA-only host (no Vulkan/DX adapter at all — the default
/// state of most datacenter GPU containers) the donor has to describe its cards to the brain
/// without going through wgpu, and `CudaEngine::binding_mb()` is only available after a full
/// engine + NVRTC compile. Same `total_mem` call the engine uses, same catch_unwind guard so a
/// non-NVIDIA host returns 0 instead of crashing.
pub fn device_vram_mb(ordinal: usize) -> u64 {
    std::panic::catch_unwind(|| {
        use cudarc::driver::result;
        match result::device::get(ordinal as i32).and_then(|d| unsafe { result::device::total_mem(d) }) {
            Ok(bytes) => (bytes as u64) / (1024 * 1024),
            Err(_) => 0,
        }
    })
    .unwrap_or(0)
}

/// CUDA compute capability for device `ordinal` as "major.minor" (e.g. "8.9"). Empty string on
/// any failure (missing libcuda, query error). Wrapped in catch_unwind so a non-NVIDIA host or a
/// driver-API mismatch can't crash the donor.
fn query_compute_capability(ordinal: usize) -> String {
    std::panic::catch_unwind(|| {
        use cudarc::driver::{result, sys};
        let dev = match result::device::get(ordinal as i32) {
            Ok(d) => d,
            Err(_) => return String::new(),
        };
        let major = unsafe {
            result::device::get_attribute(dev, sys::CUdevice_attribute::CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MAJOR)
        }
        .unwrap_or(0);
        let minor = unsafe {
            result::device::get_attribute(dev, sys::CUdevice_attribute::CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MINOR)
        }
        .unwrap_or(0);
        if major > 0 {
            format!("{major}.{minor}")
        } else {
            String::new()
        }
    })
    .unwrap_or_default()
}

struct CudaCluster {
    size: u32,
    state: CudaSlice<f32>,        // 2*n interleaved (x,y)
    spikes: CudaSlice<u32>,       // n
    currents: CudaSlice<f32>,     // n
    region_gates: CudaSlice<f32>, // 4 * numRegions
    num_regions: u32,
    regions: HashMap<String, (u32, u32)>,
}

struct CudaSparse {
    rows: u32,
    cols: u32,
    nnz: u32,
    values: CudaSlice<f32>,
    col_idx: CudaSlice<u32>,
    row_ptr: CudaSlice<u32>,
    pre_spikes: CudaSlice<u32>,    // cols
    post_currents: CudaSlice<f32>, // rows
    post_spikes: CudaSlice<u32>,   // rows
    /// v0.3.15 — cluster-slice binding: when set, batched-hebbian (type 5) reads the
    /// bound clusters' resident spike buffers at the bound offsets.
    binding: Option<Binding>,
}

/// One NVIDIA GPU driven through the CUDA driver API. Mirrors `compute::ComputeEngine`'s
/// public surface so it slots behind the same `Backend` enum.
pub struct CudaEngine {
    ctx: Arc<CudaContext>,
    stream: Arc<CudaStream>,
    name: String,
    vram_mb: u64,
    compute_capability: String,
    f_lif: CudaFunction,
    f_spike: CudaFunction,
    /// GOTCHA.3b (v0.3.32) — voltage-mean reduction, the CUDA twin of
    /// `shaders/voltage_mean.wgsl`.
    ///
    /// ⛔ `Option`, and this is the whole reason the CUDA half is safe to ship.
    /// The kernels are NOT compiled from `cuda_kernels.cu` at build time — they
    /// are loaded from `include_str!("kernels.ptx")`, a PRECOMPILED PTX checked
    /// into the repo. So adding a kernel to the `.cu` does nothing until that
    /// PTX is regenerated with `nvcc`, and a hard `load_function("voltage_mean")?`
    /// would have failed against the current PTX and taken ALL of
    /// `CudaEngine::new` down with it — breaking every CUDA donor outright for
    /// the sake of one telemetry field.
    ///
    /// ⭐ v0.3.33 — the PTX WAS regenerated, with the toolchain matched rather
    /// than upgraded: the same CUDA 12.0.140 compiler build (via the
    /// nvidia/cuda:12.0.1-devel container) at the same `sm_75` / ISA 8.0, so the
    /// compatibility envelope is unchanged and the eight pre-existing kernels
    /// came out byte-identical under label normalization. `voltage_mean` is in
    /// the shipped PTX and this loads `Some` — the code path below needed no
    /// change, exactly as designed.
    ///
    /// The `Option` STAYS: it is what makes any future PTX regeneration unable
    /// to take `CudaEngine::new` down over one telemetry kernel, and a
    /// diagnostic that can refuse to start the compute backend is worse than no
    /// diagnostic.
    f_volt: Option<CudaFunction>,
    f_prop: CudaFunction,
    f_hebb: CudaFunction,
    // Device-side pattern ops: zero a span / scatter sparse indices in-place. These replace
    // the host-side dense-vector + full-span memcpy per teach frame (up to megabytes of
    // mostly-zeros over PCIe, synchronously, per frame) with a ~KB index upload + async
    // kernel launches — the teach-drain fix. Stream order preserves clear→write→plasticity.
    f_fill_u32: CudaFunction,
    f_fill_f32: CudaFunction,
    f_scatter_u32: CudaFunction,
    f_scatter_f32: CudaFunction,
    clusters: HashMap<String, CudaCluster>,
    sparse: HashMap<String, CudaSparse>,
}

impl CudaEngine {
    /// Build an engine on CUDA device `ordinal`. Returns Err (never panics) if CUDA is
    /// unavailable or NVRTC can't compile — the caller then falls back to wgpu.
    pub fn new(ordinal: usize) -> Result<Self, String> {
        std::panic::catch_unwind(|| Self::new_inner(ordinal))
            .unwrap_or_else(|_| Err("CUDA driver unavailable (libcuda not loadable)".to_string()))
    }

    fn new_inner(ordinal: usize) -> Result<Self, String> {
        let ctx = CudaContext::new(ordinal).map_err(|e| format!("CUDA context {ordinal}: {e}"))?;
        let stream = ctx.default_stream();
        let name = ctx.name().unwrap_or_else(|_| format!("CUDA device {ordinal}"));
        let vram_mb = {
            use cudarc::driver::result;
            result::device::get(ordinal as i32)
                .and_then(|d| unsafe { result::device::total_mem(d) })
                .map(|b| (b as u64) / (1024 * 1024))
                .unwrap_or(0)
        };
        let compute_capability = query_compute_capability(ordinal);
        // LOUD on PTX load failure: a driver too old to JIT this PTX to the host arch (or a
        // missing/mismatched libnvrtc) would otherwise look like a silent 0-throughput donor.
        // Make cuModuleLoadData failure scream so it's never mistaken for "registered but idle".
        let module = ctx.load_module(Ptx::from_src(KERNELS_PTX)).map_err(|e| {
            eprintln!("[cuda] ⚠⚠ PTX MODULE LOAD FAILED (cuModuleLoadData) on device {ordinal} '{name}' (cc {}): {e}", if compute_capability.is_empty() { "?" } else { &compute_capability });
            eprintln!("[cuda] ⚠⚠ the precompiled kernels.ptx could not be JIT-compiled for this GPU/driver — this card FALLS BACK to wgpu (it will NOT silently compute 0). Update the NVIDIA driver/CUDA runtime if you want the CUDA path.");
            format!("load PTX (cuModuleLoadData) on '{name}' cc {compute_capability}: {e}")
        })?;
        let f_lif = module.load_function("lif").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'lif' load failed on '{name}': {e}"); format!("load lif: {e}") })?;
        let f_spike = module.load_function("spike_count").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'spike_count' load failed on '{name}': {e}"); format!("load spike_count: {e}") })?;
        // GOTCHA.3b — OPTIONAL load. Absent from the shipped PTX means the
        // voltage mean is simply not reported by this donor (the server then
        // reads `unreported-by-this-donor`, which is exactly what
        // `meanVoltageSource` was built to say). It must NEVER fail engine
        // construction: a diagnostic that can refuse to start the compute
        // backend is worse than no diagnostic.
        let f_volt = match module.load_function("voltage_mean") {
            Ok(f) => Some(f),
            Err(_) => {
                eprintln!("[cuda] note: kernel 'voltage_mean' not present in this PTX on '{name}' — mean_voltage will read unreported for this donor (GOTCHA.3b; regenerate kernels.ptx to enable)");
                None
            }
        };
        let f_prop = module.load_function("synapse_propagate").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'synapse_propagate' load failed on '{name}': {e}"); format!("load propagate: {e}") })?;
        let f_hebb = module.load_function("plasticity").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'plasticity' load failed on '{name}': {e}"); format!("load plasticity: {e}") })?;
        let f_fill_u32 = module.load_function("fill_zero_u32").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'fill_zero_u32' load failed on '{name}': {e}"); format!("load fill_zero_u32: {e}") })?;
        let f_fill_f32 = module.load_function("fill_zero_f32").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'fill_zero_f32' load failed on '{name}': {e}"); format!("load fill_zero_f32: {e}") })?;
        let f_scatter_u32 = module.load_function("scatter_ones_u32").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'scatter_ones_u32' load failed on '{name}': {e}"); format!("load scatter_ones_u32: {e}") })?;
        let f_scatter_f32 = module.load_function("scatter_vals_f32").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'scatter_vals_f32' load failed on '{name}': {e}"); format!("load scatter_vals_f32: {e}") })?;
        Ok(Self {
            ctx,
            stream,
            name,
            vram_mb,
            compute_capability,
            f_lif,
            f_spike,
            f_volt,
            f_prop,
            f_hebb,
            f_fill_u32,
            f_fill_f32,
            f_scatter_u32,
            f_scatter_f32,
            clusters: HashMap::new(),
            sparse: HashMap::new(),
        })
    }

    pub fn adapter_name(&self) -> &str {
        &self.name
    }

    /// CUDA compute capability of this device ("8.9" Ada, "7.5" Turing, "12.0" Blackwell …).
    /// Empty if the attribute query failed. Surfaced to the brain so the Clients table shows it.
    pub fn compute_capability(&self) -> &str {
        &self.compute_capability
    }

    /// Per-matrix binding capacity to advertise — CUDA has no 2 GB cap, so this is the card's
    /// VRAM (in MB). Falls back to a conservative 4096 if the query failed.
    pub fn binding_mb(&self) -> u64 {
        if self.vram_mb > 0 { self.vram_mb } else { 4096 }
    }

    pub fn init_cluster(&mut self, name: &str, size: u32, regions: &HashMap<String, (u32, u32)>, _tonic: f32, _noise: f32) {
        let n = size as usize;
        const PHI: f32 = 1.618_034;
        let mut state: Vec<f32> = Vec::with_capacity(2 * n.max(1));
        for i in 0..n {
            let t = ((i as f32) * PHI).fract();
            let x = -1.5 + t;
            let y = -3.2 + (((i as f32) * PHI * PHI).fract()) * 0.4;
            state.push(x);
            state.push(y);
        }
        if state.is_empty() {
            state.push(0.0);
            state.push(0.0);
        }
        let num_regions = regions.len() as u32;
        let mut gates = vec![0f32; (num_regions.max(1) as usize) * 4];
        for (i, (_n, (start, end))) in regions.iter().enumerate() {
            gates[i * 4] = *start as f32;
            gates[i * 4 + 1] = *end as f32;
            gates[i * 4 + 2] = 1.0;
        }
        let res: Result<CudaCluster, String> = (|| {
            let state_buf = self.stream.memcpy_stod(&state).map_err(|e| e.to_string())?;
            let spikes = self.stream.alloc_zeros::<u32>(n.max(1)).map_err(|e| e.to_string())?;
            let currents = self.stream.alloc_zeros::<f32>(n.max(1)).map_err(|e| e.to_string())?;
            let region_gates = self.stream.memcpy_stod(&gates).map_err(|e| e.to_string())?;
            Ok(CudaCluster {
                size,
                state: state_buf,
                spikes,
                currents,
                region_gates,
                num_regions,
                regions: regions.clone(),
            })
        })();
        match res {
            Ok(c) => { self.clusters.insert(name.to_string(), c); }
            Err(e) => eprintln!("[cuda] init_cluster '{name}' failed: {e}"),
        }
    }

    pub fn has_cluster(&self, name: &str) -> bool {
        self.clusters.contains_key(name)
    }

    /// RHYTHM3S.2 (v0.3.34) — overwrite this cluster's `[start,end,gate,pad]`
    /// table with the host-built one (Ψ hemisphere gate × attention gains).
    /// Replaces the device slice rather than copying into it: memcpy_stod is
    /// the one upload primitive this file already proves everywhere, the table
    /// is ~256 bytes, and `step()` reads `c.region_gates` fresh per launch so
    /// the swap is safe. Entry count follows the packed table (the kernel
    /// scans `num_regions` entries carrying their own start/end).
    pub fn update_region_gates(&mut self, name: &str, packed: &[f32]) {
        let entries = packed.len() / 4;
        if entries == 0 { return; }
        let Some(c) = self.clusters.get_mut(name) else { return };
        match self.stream.memcpy_stod(&packed[..entries * 4]) {
            Ok(buf) => {
                c.region_gates = buf;
                c.num_regions = entries as u32;
            }
            Err(e) => eprintln!("[cuda] update_region_gates '{name}' failed (gates keep previous values): {e}"),
        }
    }

    pub fn step(&self, name: &str, effective_drive: f32, noise_amp: f32, seed: u32) -> Result<u32, String> {
        let c = self.clusters.get(name).ok_or_else(|| format!("cluster '{name}' not initialized"))?;
        let n = c.size;
        if n == 0 {
            return Ok(0);
        }
        let launch_cfg = cfg(n);
        // LIF step — writes state + spikes through the device pointers (GPU-side mutation, so
        // shared refs are fine, exactly like wgpu's queue.submit).
        let mut b = self.stream.launch_builder(&self.f_lif);
        b.arg(&n)
            .arg(&effective_drive)
            .arg(&noise_amp)
            .arg(&seed)
            .arg(&c.num_regions)
            .arg(&c.state)
            .arg(&c.spikes)
            .arg(&c.currents)
            .arg(&c.region_gates);
        unsafe { b.launch(launch_cfg) }.map_err(|e| format!("lif launch: {e}"))?;

        // Spike count into a fresh zeroed counter.
        let mut count = self.stream.alloc_zeros::<u32>(1).map_err(|e| e.to_string())?;
        let mut b2 = self.stream.launch_builder(&self.f_spike);
        b2.arg(&n).arg(&c.spikes).arg(&mut count);
        unsafe { b2.launch(launch_cfg) }.map_err(|e| format!("spike launch: {e}"))?;

        let host = self.stream.memcpy_dtov(&count).map_err(|e| e.to_string())?;
        self.stream.synchronize().map_err(|e| e.to_string())?;
        Ok(*host.first().unwrap_or(&0))
    }

    /// GOTCHA.3b (v0.3.32) — mean of the Rulkov fast variable, CUDA half.
    ///
    /// Mirrors `ComputeEngine::voltage_mean` exactly: fixed partial slots, host
    /// sums them, host divides by the REAL `n`. ⛔ `None` on any failure, never
    /// `Some(0.0)` — `0.0` is a legitimate mean for a population straddling
    /// zero, so a zero-on-error is indistinguishable from a real quiet cluster,
    /// which is the precise failure this field exists to end.
    ///
    /// ⛔ Call ONCE PER TICK, not per substep.
    pub fn voltage_mean(&self, name: &str) -> Option<f32> {
        let c = self.clusters.get(name)?;
        let n = c.size;
        if n == 0 { return None; }
        // Must match VOLT_PARTIALS in compute.rs — the two halves are compared
        // line-for-line and a divergence here would show up as a backend-
        // dependent mean, which is the hardest kind of number to disbelieve.
        const PARTIALS: u32 = 256;
        let chunk = (n + PARTIALS - 1) / PARTIALS;
        // Absent kernel ⇒ not reported. See the `f_volt` field note.
        let f = self.f_volt.as_ref()?;
        let mut partials = self.stream.alloc_zeros::<f32>(PARTIALS as usize).ok()?;
        let mut b = self.stream.launch_builder(f);
        b.arg(&n).arg(&chunk).arg(&c.state).arg(&mut partials);
        unsafe { b.launch(cfg(PARTIALS)) }.ok()?;
        let host = self.stream.memcpy_dtov(&partials).ok()?;
        self.stream.synchronize().ok()?;
        // f64 accumulator for the same reason as the wgpu half: 256 partials
        // each holding tens of thousands of summed f32s is exactly where f32
        // accumulation starts shedding low-order bits.
        let sum: f64 = host.iter().map(|v| *v as f64).sum();
        let mean = (sum / (n as f64)) as f32;
        if mean.is_finite() { Some(mean) } else { None }
    }

    pub fn has_sparse(&self, name: &str) -> bool {
        self.sparse.contains_key(name)
    }

    /// Zero `dst[offset .. offset+len]` on the device (u32) — async on the stream. Replaces
    /// the host-side zero-vec + full-span memcpy that cost megabytes of PCIe per teach frame.
    fn dev_zero_u32(&self, dst: &CudaSlice<u32>, offset: u32, len: u32) -> Result<(), String> {
        let mut b = self.stream.launch_builder(&self.f_fill_u32);
        b.arg(&len).arg(&offset).arg(dst);
        unsafe { b.launch(cfg(len)) }.map(|_| ()).map_err(|e| format!("fill_zero_u32 launch: {e}"))
    }

    /// Zero `dst[offset .. offset+len]` on the device (f32) — async on the stream.
    fn dev_zero_f32(&self, dst: &CudaSlice<f32>, offset: u32, len: u32) -> Result<(), String> {
        let mut b = self.stream.launch_builder(&self.f_fill_f32);
        b.arg(&len).arg(&offset).arg(dst);
        unsafe { b.launch(cfg(len)) }.map(|_| ()).map_err(|e| format!("fill_zero_f32 launch: {e}"))
    }

    /// Set `dst[offset + idx] = 1` for every in-bounds index — uploads ONLY the sparse
    /// index list (a few hundred bytes) and scatters on the device. The index buffer drops
    /// after launch; cudarc frees it stream-ordered, i.e. after the kernel consumes it.
    fn dev_scatter_ones(&self, indices: &[u32], dst: &CudaSlice<u32>, offset: u32, len: u32) -> Result<(), String> {
        if indices.is_empty() {
            return Ok(());
        }
        let idx_buf = self.stream.memcpy_stod(indices).map_err(|e| e.to_string())?;
        let count = indices.len() as u32;
        let mut b = self.stream.launch_builder(&self.f_scatter_u32);
        b.arg(&count).arg(&offset).arg(&len).arg(&idx_buf).arg(dst);
        unsafe { b.launch(cfg(count)) }.map(|_| ()).map_err(|e| format!("scatter_ones_u32 launch: {e}"))
    }

    pub fn upload_sparse(&mut self, name: &str, rows: u32, cols: u32, row_ptr: &[u32], values: &[f32], col_idx: &[u32], binding: Option<Binding>) {
        let nnz = values.len() as u32;
        // rowPtr must have rows+1 entries (the kernel reads rowPtr[i+1]); pad with nnz so a
        // short/empty CSR can't read out of bounds (CUDA OOB = crash, not a validation error).
        let mut rp: Vec<u32> = row_ptr.to_vec();
        if rp.len() < (rows as usize + 1) {
            let fill = rp.last().copied().unwrap_or(nnz);
            rp.resize(rows as usize + 1, fill);
        }
        let v: Vec<f32> = if values.is_empty() { vec![0.0] } else { values.to_vec() };
        let ci: Vec<u32> = if col_idx.is_empty() { vec![0] } else { col_idx.to_vec() };
        let res: Result<CudaSparse, String> = (|| {
            let values_buf = self.stream.memcpy_stod(&v).map_err(|e| e.to_string())?;
            let col_idx_buf = self.stream.memcpy_stod(&ci).map_err(|e| e.to_string())?;
            let row_ptr_buf = self.stream.memcpy_stod(&rp).map_err(|e| e.to_string())?;
            let pre_spikes = self.stream.alloc_zeros::<u32>(cols.max(1) as usize).map_err(|e| e.to_string())?;
            let post_currents = self.stream.alloc_zeros::<f32>(rows.max(1) as usize).map_err(|e| e.to_string())?;
            let post_spikes = self.stream.alloc_zeros::<u32>(rows.max(1) as usize).map_err(|e| e.to_string())?;
            Ok(CudaSparse { rows, cols, nnz, values: values_buf, col_idx: col_idx_buf, row_ptr: row_ptr_buf, pre_spikes, post_currents, post_spikes, binding: binding.clone() })
        })();
        match res {
            Ok(m) => { self.sparse.insert(name.to_string(), m); }
            Err(e) => eprintln!("[cuda] upload_sparse '{name}' failed: {e}"),
        }
    }

    pub fn propagate(&mut self, name: &str, pre_indices: &[u32]) -> Result<Vec<f32>, String> {
        let (rows, cols, nnz) = match self.sparse.get(name) {
            Some(m) => (m.rows, m.cols, m.nnz),
            None => return Err(format!("sparse '{name}' not uploaded")),
        };
        if rows == 0 || nnz == 0 {
            return Ok(vec![0.0; rows as usize]);
        }
        let m = self.sparse.get(name).unwrap();
        // Device-side zero + scatter (no dense host vectors, no full-span PCIe copies).
        self.dev_zero_u32(&m.pre_spikes, 0, cols)?;
        self.dev_zero_f32(&m.post_currents, 0, rows)?;
        self.dev_scatter_ones(pre_indices, &m.pre_spikes, 0, cols)?;
        let (src_off, dst_off) = (0u32, 0u32);
        let mut b = self.stream.launch_builder(&self.f_prop);
        b.arg(&rows)
            .arg(&src_off)
            .arg(&dst_off)
            .arg(&m.values)
            .arg(&m.col_idx)
            .arg(&m.row_ptr)
            .arg(&m.pre_spikes)
            .arg(&m.post_currents);
        unsafe { b.launch(cfg(rows)) }.map_err(|e| format!("propagate launch: {e}"))?;
        let out = self.stream.memcpy_dtov(&m.post_currents).map_err(|e| e.to_string())?;
        self.stream.synchronize().map_err(|e| e.to_string())?;
        Ok(out)
    }

    pub fn hebbian(&mut self, name: &str, pre_indices: &[u32], post_indices: &[u32], lr: f32) -> Result<(), String> {
        let (rows, cols, nnz) = match self.sparse.get(name) {
            Some(m) => (m.rows, m.cols, m.nnz),
            None => return Err(format!("sparse '{name}' not uploaded")),
        };
        if rows == 0 || nnz == 0 {
            return Ok(());
        }
        let m = self.sparse.get(name).unwrap();
        // Device-side zero + scatter. On a 1.5M-row cortex matrix the old path built TWO
        // 6MB dense host vectors and blocking-copied both over PCIe — per plasticity frame.
        // Now: two async zero kernels + index-only uploads. Stream order keeps the
        // plasticity launch below reading exactly these patterns.
        self.dev_zero_u32(&m.pre_spikes, 0, cols)?;
        self.dev_zero_u32(&m.post_spikes, 0, rows)?;
        self.dev_scatter_ones(pre_indices, &m.pre_spikes, 0, cols)?;
        self.dev_scatter_ones(post_indices, &m.post_spikes, 0, rows)?;
        let (reward, w_min, w_max, src_off, dst_off) = (1.0f32, -2.0f32, 2.0f32, 0u32, 0u32);
        let mut b = self.stream.launch_builder(&self.f_hebb);
        b.arg(&rows)
            .arg(&lr)
            .arg(&reward)
            .arg(&w_min)
            .arg(&w_max)
            .arg(&src_off)
            .arg(&dst_off)
            .arg(&m.values)
            .arg(&m.col_idx)
            .arg(&m.row_ptr)
            .arg(&m.pre_spikes)
            .arg(&m.post_spikes);
        unsafe { b.launch(cfg(rows)) }.map_err(|e| format!("hebbian launch: {e}"))?;
        // No readback — ack-only, like the wgpu path (don't block the worker).
        Ok(())
    }

    /// v0.3.19 — rep-dose hebbian: zero + scatter the STATIC pattern ONCE, then
    /// launch the plasticity kernel `reps` times stream-ordered (sequential math
    /// identical to reps separate calls). v0.3.18's executor looped the whole
    /// hebbian() per rep — re-zeroing two region-sized buffers (2 × 12M u32 at
    /// the intra) every rep buried the stream in zero-bandwidth and starved the
    /// LIF compute batches behind it.
    pub fn hebbian_reps(&mut self, name: &str, pre_indices: &[u32], post_indices: &[u32], lr: f32, reps: u32) -> Result<(), String> {
        let (rows, cols, nnz) = match self.sparse.get(name) {
            Some(m) => (m.rows, m.cols, m.nnz),
            None => return Err(format!("sparse '{name}' not uploaded")),
        };
        if rows == 0 || nnz == 0 {
            return Ok(());
        }
        let m = self.sparse.get(name).unwrap();
        self.dev_zero_u32(&m.pre_spikes, 0, cols)?;
        self.dev_zero_u32(&m.post_spikes, 0, rows)?;
        self.dev_scatter_ones(pre_indices, &m.pre_spikes, 0, cols)?;
        self.dev_scatter_ones(post_indices, &m.post_spikes, 0, rows)?;
        let (reward, w_min, w_max, src_off, dst_off) = (1.0f32, -2.0f32, 2.0f32, 0u32, 0u32);
        for _ in 0..reps.max(1) {
            let mut b = self.stream.launch_builder(&self.f_hebb);
            b.arg(&rows)
                .arg(&lr)
                .arg(&reward)
                .arg(&w_min)
                .arg(&w_max)
                .arg(&src_off)
                .arg(&dst_off)
                .arg(&m.values)
                .arg(&m.col_idx)
                .arg(&m.row_ptr)
                .arg(&m.pre_spikes)
                .arg(&m.post_spikes);
            unsafe { b.launch(cfg(rows)) }.map_err(|e| format!("hebbian-reps launch: {e}"))?;
        }
        Ok(())
    }

    /// v0.3.15 — resident bound-hebbian: plasticity on a cluster-BOUND matrix reading
    /// the bound clusters' resident spike buffers at the bound offsets (the state the
    /// type-7/9 pattern frames established). Ok(true) = applied; Ok(false) = skipped
    /// (unbound / clusters not resident / windows don't fit — never a crash).
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
        // buffers (CUDA OOB = crash, not a validation error).
        if (b.src_start as u64) + (m.cols as u64) > (src.spikes.len() as u64) { return Ok(false); }
        if (b.dst_start as u64) + (m.rows as u64) > (dst.spikes.len() as u64) { return Ok(false); }
        let rows = m.rows;
        let (reward, w_min, w_max) = (1.0f32, -2.0f32, 2.0f32);
        let (src_off, dst_off) = (b.src_start, b.dst_start);
        let mut bld = self.stream.launch_builder(&self.f_hebb);
        bld.arg(&rows)
            .arg(&lr)
            .arg(&reward)
            .arg(&w_min)
            .arg(&w_max)
            .arg(&src_off)
            .arg(&dst_off)
            .arg(&m.values)
            .arg(&m.col_idx)
            .arg(&m.row_ptr)
            .arg(&src.spikes)
            .arg(&dst.spikes);
        unsafe { bld.launch(cfg(rows)) }.map(|_| ()).map_err(|e| format!("bound hebbian launch: {e}"))?;
        Ok(true)
    }

    /// v0.3.26 — MASKED bound plasticity: pre reads the RESIDENT bound src-cluster
    /// spikes at the bound offset (zero transfer), post is an explicit sparse row
    /// mask zeroed + scattered device-side into the matrix's own post buffer
    /// (the same dev_zero_u32 + dev_scatter_ones primitives the standalone hebbian
    /// uses). The plasticity kernel runs unchanged with src_off = bound src start,
    /// dst_off = 0 — the pre≠post shape neither hebbian_bound (pre==post on an
    /// intra matrix) nor hebbian (ships both sides over the wire) can express.
    /// `reps` loops the kernel stream-ordered (the v0.3.19 rep-dose pattern).
    pub fn hebbian_bound_masked(&mut self, name: &str, lr: f32, reps: u32, post_idx: &[u32]) -> Result<bool, String> {
        let m = match self.sparse.get(name) { Some(m) => m, None => return Ok(false) };
        if m.rows == 0 || m.nnz == 0 || post_idx.is_empty() {
            return Ok(false);
        }
        let b = match &m.binding { Some(b) => b.clone(), None => return Ok(false) };
        let rows = m.rows;
        // Pre window must fit the src cluster buffer (CUDA OOB = crash, not a
        // validation error — same guard as hebbian_bound).
        {
            let src = match self.clusters.get(&b.src_cluster) { Some(c) => c, None => return Ok(false) };
            if (b.src_start as u64) + (m.cols as u64) > (src.spikes.len() as u64) { return Ok(false); }
        }
        // Zero-then-scatter the post mask, device-side, stream-ordered ahead of
        // the plasticity launches below.
        {
            let m = self.sparse.get(name).unwrap();
            self.dev_zero_u32(&m.post_spikes, 0, rows)?;
            self.dev_scatter_ones(post_idx, &m.post_spikes, 0, rows)?;
        }
        let m = self.sparse.get(name).unwrap();
        let src = self.clusters.get(&b.src_cluster).unwrap();
        let (reward, w_min, w_max) = (1.0f32, -2.0f32, 2.0f32);
        let (src_off, dst_off) = (b.src_start, 0u32);
        for _ in 0..reps.max(1) {
            let mut bld = self.stream.launch_builder(&self.f_hebb);
            bld.arg(&rows)
                .arg(&lr)
                .arg(&reward)
                .arg(&w_min)
                .arg(&w_max)
                .arg(&src_off)
                .arg(&dst_off)
                .arg(&m.values)
                .arg(&m.col_idx)
                .arg(&m.row_ptr)
                .arg(&src.spikes)
                .arg(&m.post_spikes);
            unsafe { bld.launch(cfg(rows)) }.map_err(|e| format!("masked bound hebbian launch: {e}"))?;
        }
        Ok(true)
    }

    pub fn write_spike_slice(&mut self, cluster: &str, region: &str, indices: &[u32]) -> Result<(), String> {
        let (start, end) = match self.region(cluster, region) { Some(r) => r, None => return Ok(()) };
        let len = end - start;
        let c = self.clusters.get(cluster).unwrap();
        // Zero the region span then scatter the sparse pattern — both device-side, async.
        // Same semantics as the old dense write (everything outside `indices` reads 0).
        self.dev_zero_u32(&c.spikes, start, len)?;
        self.dev_scatter_ones(indices, &c.spikes, start, len)
    }

    pub fn clear_spike_region(&mut self, cluster: &str, region: &str) -> Result<(), String> {
        let (start, end) = match self.region(cluster, region) { Some(r) => r, None => return Ok(()) };
        let c = self.clusters.get(cluster).unwrap();
        self.dev_zero_u32(&c.spikes, start, end - start)
    }

    pub fn write_current_slice(&mut self, cluster: &str, region: &str, indices: &[u32], values: &[f32], psi: f32) -> Result<(), String> {
        let (start, end) = match self.region(cluster, region) { Some(r) => r, None => return Ok(()) };
        let len = end - start;
        let c = self.clusters.get(cluster).unwrap();
        self.dev_zero_f32(&c.currents, start, len)?;
        if indices.is_empty() {
            return Ok(());
        }
        let idx_buf = self.stream.memcpy_stod(indices).map_err(|e| e.to_string())?;
        // A shorter `values` reads as 0.0 past its end (vcount guard in the kernel — same
        // as the old host path's values.get(k).unwrap_or(0.0)). Empty values uploads one
        // dummy element (no zero-size alloc) that vcount=0 keeps the kernel from reading.
        let vcount = values.len() as u32;
        let val_src: &[f32] = if values.is_empty() { &[0.0] } else { values };
        let val_buf = self.stream.memcpy_stod(val_src).map_err(|e| e.to_string())?;
        let count = indices.len() as u32;
        let mut b = self.stream.launch_builder(&self.f_scatter_f32);
        b.arg(&count).arg(&vcount).arg(&start).arg(&len).arg(&psi).arg(&idx_buf).arg(&val_buf).arg(&c.currents);
        unsafe { b.launch(cfg(count)) }.map(|_| ()).map_err(|e| format!("scatter_vals_f32 launch: {e}"))
    }

    pub fn readback_letter_buckets(&self, cluster: &str, region: &str, bucket_count: u32, sub_slice_len: u32, start_offset: u32) -> Result<Vec<u32>, String> {
        let c = self.clusters.get(cluster).ok_or_else(|| format!("cluster '{cluster}' missing"))?;
        let (start, _end) = *c.regions.get(region).ok_or_else(|| format!("region '{region}' missing"))?;
        let len = sub_slice_len.max(1) as usize;
        let lo = (start + start_offset) as usize;
        let hi = (lo + len).min(c.spikes.len());
        if lo >= hi {
            return Ok(vec![0u32; bucket_count.max(1) as usize]);
        }
        let view = c.spikes.slice(lo..hi);
        let spikes = self.stream.memcpy_dtov(&view).map_err(|e| e.to_string())?;
        self.stream.synchronize().map_err(|e| e.to_string())?;
        let actual = spikes.len();
        let bc = bucket_count.max(1) as usize;
        let bucket_size = (actual / bc).max(1);
        let mut buckets = vec![0u32; bc];
        for (b, slot) in buckets.iter_mut().enumerate() {
            let blo = b * bucket_size;
            let bhi = ((b + 1) * bucket_size).min(actual);
            if blo < bhi {
                *slot = spikes[blo..bhi].iter().filter(|&&s| s != 0).count() as u32;
            }
        }
        Ok(buckets)
    }

    /// TU.19-D — read back a resident sparse matrix's weight digest for GPU↔CPU
    /// parity. Mirrors the wgpu ComputeEngine::checksum_matrix EXACTLY (same
    /// FNV-1a-64 over little-endian f32 bytes) so a CUDA donor and a wgpu/browser
    /// donor produce the same checksum for identical resident weights (F10). CUDA
    /// resident weights ARE mappable (memcpy_dtov, same path readback_letter_buckets
    /// uses), so — no wrinkle — this returns a real digest, not a graceful None.
    pub fn checksum_matrix(&self, name: &str, sample_count: u32) -> Option<(u32, u64, Vec<(u32, f32)>)> {
        let m = self.sparse.get(name)?;
        let nnz = m.nnz;
        if nnz == 0 {
            return Some((0, 0xcbf29ce484222325, Vec::new())); // FNV offset basis over empty
        }
        let vals = self.stream.memcpy_dtov(&m.values).ok()?;
        self.stream.synchronize().ok()?;
        let n = (nnz as usize).min(vals.len());
        // FNV-1a 64 over the little-endian f32 bytes — byte-for-byte identical to
        // the wgpu path (both build targets are x86-64 LE, and the browser reads
        // the same LE buffer bytes).
        let mut hash: u64 = 0xcbf29ce484222325;
        for &v in &vals[..n] {
            for &b in &v.to_le_bytes() {
                hash ^= b as u64;
                hash = hash.wrapping_mul(0x100000001b3);
            }
        }
        let cap = sample_count.min(64) as usize;
        let mut samples = Vec::with_capacity(cap);
        if cap > 0 {
            let step = (n / cap).max(1);
            let mut i = 0usize;
            while i < n && samples.len() < cap {
                samples.push((i as u32, vals[i]));
                i += step;
            }
        }
        Some((nnz, hash, samples))
    }

    /// `SHADOWCOST.3` — CUDA twin of `ComputeEngine::read_values_chunk`. Same
    /// contract, same byte semantics: a little-endian f32 byte range of the
    /// resident values buffer, so a CUDA donor and a wgpu donor hand the brain
    /// byte-identical checkpoint data (both targets are x86-64 LE, the same
    /// property F10 already relies on for the parity digest).
    ///
    /// ⚠ SLICED ON THE DEVICE, not copied whole and then cut. `memcpy_dtov` over
    /// the full buffer would allocate ~1.81 GB on the host for EVERY chunk of the
    /// intra matrix — the exact cost the chunking exists to avoid. `CudaSlice`
    /// views a sub-range without moving anything, and only that range crosses.
    pub fn read_values_chunk(&self, name: &str, byte_offset: u64, byte_len: u64) -> Option<Vec<u8>> {
        let m = self.sparse.get(name)?;
        let total = (m.nnz as u64) * 4;
        if total == 0 || byte_offset >= total { return None; }
        let off = byte_offset & !3u64;
        let len = (byte_len.min(total - off)) & !3u64;
        if len == 0 { return None; }
        // Element indices — the wire talks bytes, cudarc slices elements.
        let start = (off / 4) as usize;
        let end = start + (len / 4) as usize;
        let view = m.values.slice(start..end);
        let vals = self.stream.memcpy_dtov(&view).ok()?;
        self.stream.synchronize().ok()?;
        let mut out = Vec::with_capacity(vals.len() * 4);
        for v in &vals { out.extend_from_slice(&v.to_le_bytes()); }
        Some(out)
    }

    /// Total byte length of a resident matrix's values buffer (nnz * 4).
    pub fn values_byte_len(&self, name: &str) -> Option<u64> {
        self.sparse.get(name).map(|m| (m.nnz as u64) * 4)
    }

    fn region(&self, cluster: &str, region: &str) -> Option<(u32, u32)> {
        self.clusters.get(cluster).and_then(|c| c.regions.get(region).copied())
    }
}

// (The host-side dense scatter helpers are gone — pattern scatter now runs on the device;
// see fill_zero_* / scatter_* in cuda_kernels.cu and the dev_* helpers above.)
