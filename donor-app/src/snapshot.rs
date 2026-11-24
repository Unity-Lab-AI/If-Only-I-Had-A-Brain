//! v0.3.48 — BUILD A SLICE FROM HER PUBLISHED WEIGHTS.
//!
//! The brain publishes her intra matrix as row blocks on a GitHub release
//! (`server/brain-server/weights-publish.js`). A card that is handed rows
//! [a, b) downloads ONLY the blocks covering them, verifies each block's
//! SHA-256 against the manifest, and builds its slice locally — so the gigabytes
//! cross the release host's link, not the operator's home upload. The brain
//! then sends only the rows that changed since the snapshot.
//!
//! Block file: 'UNSB' | u32 version=1 | u32 rowStart | u32 rowEnd | u32 cols |
//! u32 nnz | rowPtr u32×(rows+1) (block-relative) | colIdx u32×nnz | values f32×nnz.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub struct Block {
    pub url: String,
    pub sha256: String,
    pub row_start: u32,
    pub row_end: u32,
}

pub struct Slice {
    pub rows: u32,
    pub cols: u32,
    pub row_ptr: Vec<u32>,
    pub col_idx: Vec<u32>,
    pub values: Vec<f32>,
}

fn cache_dir() -> PathBuf {
    let d = std::env::temp_dir().join("unity-donor-weights");
    let _ = std::fs::create_dir_all(&d);
    d
}

fn sha256_file(p: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut f = std::fs::File::open(p).map_err(|e| format!("open: {e}"))?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 8 << 20];
    loop {
        let n = f.read(&mut buf).map_err(|e| format!("read: {e}"))?;
        if n == 0 { break; }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Download (or reuse a cached, hash-matching copy of) one block.
fn fetch(b: &Block) -> Result<PathBuf, String> {
    let name = b.url.rsplit('/').next().unwrap_or("block.unsb").to_string();
    let path = cache_dir().join(&name);
    if path.exists() && sha256_file(&path).map(|h| h == b.sha256).unwrap_or(false) {
        return Ok(path);
    }
    let part = path.with_extension("part");
    let st = std::process::Command::new("curl")
        .args(["-fsSL", "-m", "3600", "-o"])
        .arg(&part)
        .arg(&b.url)
        .status()
        .map_err(|e| format!("curl: {e}"))?;
    if !st.success() { let _ = std::fs::remove_file(&part); return Err(format!("download failed: {}", b.url)); }
    let got = sha256_file(&part)?;
    if got != b.sha256 { let _ = std::fs::remove_file(&part); return Err(format!("hash mismatch on {name}: {got}")); }
    std::fs::rename(&part, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(path)
}

fn u32s(b: &[u8]) -> Vec<u32> { b.chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect() }
fn f32s(b: &[u8]) -> Vec<f32> { b.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect() }

/// Rows [a, b) assembled from the blocks that cover them.
pub fn load_slice(blocks: &[Block], a: u32, b: u32) -> Result<Slice, String> {
    let mut row_ptr: Vec<u32> = vec![0];
    let mut col_idx: Vec<u32> = Vec::new();
    let mut values: Vec<f32> = Vec::new();
    let mut cols = 0u32;
    let mut covered = a;
    let mut sorted: Vec<&Block> = blocks.iter().filter(|x| x.row_end > a && x.row_start < b).collect();
    sorted.sort_by_key(|x| x.row_start);
    for blk in sorted {
        let path = fetch(blk)?;
        let raw = std::fs::read(&path).map_err(|e| format!("read block: {e}"))?;
        if raw.len() < 24 || &raw[0..4] != b"UNSB" { return Err("not a weights block".into()); }
        let rd = |o: usize| u32::from_le_bytes([raw[o], raw[o + 1], raw[o + 2], raw[o + 3]]);
        let (rs, re, c, nnz) = (rd(8), rd(12), rd(16), rd(20) as usize);
        cols = c;
        let nrows = (re - rs) as usize;
        let rp_off = 24;
        let ci_off = rp_off + (nrows + 1) * 4;
        let va_off = ci_off + nnz * 4;
        if raw.len() < va_off + nnz * 4 { return Err("weights block is short".into()); }
        let rp = u32s(&raw[rp_off..ci_off]);
        let lo = covered.max(rs);
        let hi = b.min(re);
        if lo != covered { return Err(format!("blocks leave a gap at row {covered}")); }
        let (r0, r1) = ((lo - rs) as usize, (hi - rs) as usize);
        let (k0, k1) = (rp[r0] as usize, rp[r1] as usize);
        col_idx.extend(u32s(&raw[ci_off + k0 * 4..ci_off + k1 * 4]));
        values.extend(f32s(&raw[va_off + k0 * 4..va_off + k1 * 4]));
        let base = *row_ptr.last().unwrap();
        for r in r0 + 1..=r1 { row_ptr.push(base + (rp[r] - rp[r0])); }
        covered = hi;
        if covered >= b { break; }
    }
    if covered != b { return Err(format!("the snapshot does not cover rows {covered}..{b}")); }
    Ok(Slice { rows: b - a, cols, row_ptr, col_idx, values })
}

/// Round trip against the brain's REAL publisher: `.scratch/snapshot-roundtrip.cjs`
/// writes blocks + the expected slice; `UNITY_SNAP_TEST=<case.json>` points here.
/// Skipped (passes trivially) when the variable is unset.
#[cfg(test)]
mod roundtrip {
    #[test]
    fn rebuilds_the_publishers_rows() {
        let Ok(case) = std::env::var("UNITY_SNAP_TEST") else { return; };
        let j: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(case).unwrap()).unwrap();
        let blocks: Vec<super::Block> = j["blocks"].as_array().unwrap().iter().map(|b| super::Block {
            url: b["url"].as_str().unwrap().to_string(), sha256: b["sha256"].as_str().unwrap().to_string(),
            row_start: b["rowStart"].as_u64().unwrap() as u32, row_end: b["rowEnd"].as_u64().unwrap() as u32,
        }).collect();
        let (a, b) = (j["a"].as_u64().unwrap() as u32, j["b"].as_u64().unwrap() as u32);
        let s = super::load_slice(&blocks, a, b).expect("load_slice");
        let e = &j["expect"];
        let u = |k: &str| -> Vec<u32> { e[k].as_array().unwrap().iter().map(|x| x.as_u64().unwrap() as u32).collect() };
        let f: Vec<f32> = e["values"].as_array().unwrap().iter().map(|x| x.as_f64().unwrap() as f32).collect();
        assert_eq!(s.rows, b - a);
        assert_eq!(s.row_ptr, u("rowPtr"), "rowPtr differs");
        assert_eq!(s.col_idx, u("colIdx"), "colIdx differs");
        assert_eq!(s.values.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), f.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), "values differ");
        println!("ROUNDTRIP OK — {} rows, {} weights, byte-identical", s.rows, s.values.len());
    }
}
