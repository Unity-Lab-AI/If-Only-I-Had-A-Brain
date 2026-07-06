//! CUDA compute backend (NVIDIA) — the high-control sibling of the wgpu `ComputeEngine`.
//!
//! Same brain protocol, same math (the four kernels below are line-for-line ports of the
//! WGSL in `shaders/`, so a CUDA donor and a browser/wgpu donor return byte-identical
//! results — the brain can't tell them apart). What CUDA buys: no 2 GB per-binding cap
//! (device pointers are sized only by VRAM), real streams, and a much higher ceiling.
//!
//! Built only with the `cuda` feature. cudarc is loaded with `dynamic-loading`, so the
//! binary links without CUDA and this whole module no-ops gracefully on non-NVIDIA hosts —
//! `MultiEngine` falls back to wgpu there. Every entry point that touches the driver is
//! wrapped so a missing libcuda can't crash the app.

use std::collections::HashMap;
use std::sync::Arc;

use cudarc::driver::{CudaContext, CudaFunction, CudaSlice, CudaStream, LaunchConfig, PushKernelArg};
use cudarc::nvrtc::Ptx;

const THREADS: u32 = 256;

/// Precompiled PTX for the four kernels (see cuda_kernels.cu). Loaded via the driver
/// (`cuModuleLoadData`) — NO nvrtc at runtime, so a host needs only libcuda, and we sidestep
/// the nvrtc ABI-version mismatch between toolkit releases. The driver JITs this PTX
/// (built for compute_60) to whatever NVIDIA arch the host actually has.
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
    f_prop: CudaFunction,
    f_hebb: CudaFunction,
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
        let f_prop = module.load_function("synapse_propagate").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'synapse_propagate' load failed on '{name}': {e}"); format!("load propagate: {e}") })?;
        let f_hebb = module.load_function("plasticity").map_err(|e| { eprintln!("[cuda] ⚠⚠ kernel 'plasticity' load failed on '{name}': {e}"); format!("load plasticity: {e}") })?;
        Ok(Self {
            ctx,
            stream,
            name,
            vram_mb,
            compute_capability,
            f_lif,
            f_spike,
            f_prop,
            f_hebb,
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

    pub fn has_sparse(&self, name: &str) -> bool {
        self.sparse.contains_key(name)
    }

    pub fn upload_sparse(&mut self, name: &str, rows: u32, cols: u32, row_ptr: &[u32], values: &[f32], col_idx: &[u32]) {
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
            Ok(CudaSparse { rows, cols, nnz, values: values_buf, col_idx: col_idx_buf, row_ptr: row_ptr_buf, pre_spikes, post_currents, post_spikes })
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
        let dense_pre = scatter(cols, pre_indices);
        let zeros = vec![0f32; rows as usize];
        // Host writes need &mut on the buffers.
        {
            let m = self.sparse.get_mut(name).unwrap();
            self.stream.memcpy_htod(&dense_pre, &mut m.pre_spikes).map_err(|e| e.to_string())?;
            self.stream.memcpy_htod(&zeros, &mut m.post_currents).map_err(|e| e.to_string())?;
        }
        let m = self.sparse.get(name).unwrap();
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
        let dense_pre = scatter(cols, pre_indices);
        let dense_post = scatter(rows, post_indices);
        {
            let m = self.sparse.get_mut(name).unwrap();
            self.stream.memcpy_htod(&dense_pre, &mut m.pre_spikes).map_err(|e| e.to_string())?;
            self.stream.memcpy_htod(&dense_post, &mut m.post_spikes).map_err(|e| e.to_string())?;
        }
        let m = self.sparse.get(name).unwrap();
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

    pub fn write_spike_slice(&mut self, cluster: &str, region: &str, indices: &[u32]) -> Result<(), String> {
        let (start, end) = match self.region(cluster, region) { Some(r) => r, None => return Ok(()) };
        let len = (end - start) as usize;
        let dense = scatter_len(len, indices);
        let c = self.clusters.get_mut(cluster).unwrap();
        let mut view = c.spikes.slice_mut(start as usize..end as usize);
        self.stream.memcpy_htod(&dense, &mut view).map_err(|e| e.to_string())
    }

    pub fn clear_spike_region(&mut self, cluster: &str, region: &str) -> Result<(), String> {
        let (start, end) = match self.region(cluster, region) { Some(r) => r, None => return Ok(()) };
        let zeros = vec![0u32; ((end - start) as usize).max(1)];
        let c = self.clusters.get_mut(cluster).unwrap();
        let mut view = c.spikes.slice_mut(start as usize..end as usize);
        self.stream.memcpy_htod(&zeros, &mut view).map_err(|e| e.to_string())
    }

    pub fn write_current_slice(&mut self, cluster: &str, region: &str, indices: &[u32], values: &[f32], psi: f32) -> Result<(), String> {
        let (start, end) = match self.region(cluster, region) { Some(r) => r, None => return Ok(()) };
        let len = (end - start) as usize;
        let mut dense = vec![0f32; len.max(1)];
        for (k, &idx) in indices.iter().enumerate() {
            if (idx as usize) < len {
                dense[idx as usize] = values.get(k).copied().unwrap_or(0.0) * psi;
            }
        }
        let c = self.clusters.get_mut(cluster).unwrap();
        let mut view = c.currents.slice_mut(start as usize..end as usize);
        self.stream.memcpy_htod(&dense[..len.max(1)], &mut view).map_err(|e| e.to_string())
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

    fn region(&self, cluster: &str, region: &str) -> Option<(u32, u32)> {
        self.clusters.get(cluster).and_then(|c| c.regions.get(region).copied())
    }
}

/// Scatter sparse 1-indices into a dense u32 buffer of length `n` (min 1).
fn scatter(n: u32, indices: &[u32]) -> Vec<u32> {
    scatter_len(n.max(1) as usize, indices)
}

fn scatter_len(len: usize, indices: &[u32]) -> Vec<u32> {
    let mut dense = vec![0u32; len.max(1)];
    for &idx in indices {
        if (idx as usize) < dense.len() {
            dense[idx as usize] = 1;
        }
    }
    dense
}
