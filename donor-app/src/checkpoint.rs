// checkpoint.rs — the donor's own on-disk copy of the weights it is training.
//
// WHY THIS EXISTS: most of her plasticity runs on the donor's RESIDENT
// matrices, which the brain host does not see until it pulls them back. A
// donor that crashed lost everything learned since the brain's last pull.
// So the donor writes those trained values to its own disk on a timer and
// when it stops, and hands them back the next time it serves the SAME brain.
//
// "Same brain" is the LINEAGE the brain sends (her RNG seed: it carries across
// a Savestart and changes on a fresh walk). A checkpoint is only ever offered
// back to a brain of that lineage, only when it is NEWER than the brain's last
// save, and only into a matrix of exactly the same byte length — a checkpoint
// of a different geometry is a different matrix and is refused.
//
// Every file is written to a temporary name and renamed into place, and the
// manifest is written LAST: a crash mid-write leaves the previous checkpoint
// whole rather than a half-written one that claims to be current.

use crate::compute::MultiEngine;
use std::io::Write;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MatrixEntry {
    pub name: String,
    #[serde(rename = "byteLen")]
    pub byte_len: u64,
    pub checksum: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Manifest {
    pub lineage: String,
    #[serde(rename = "savedAt")]
    pub saved_at: u64,
    pub matrices: Vec<MatrixEntry>,
}

fn dir() -> std::path::PathBuf {
    crate::config::data_dir().join("checkpoint")
}

fn file_for(name: &str) -> std::path::PathBuf {
    let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).collect();
    dir().join(format!("{safe}.bin"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn fnv(bytes: &[u8], mut h: u64) -> u64 {
    for &b in bytes { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    h
}

/// Write every resident matrix's values to disk under `lineage`.
/// Returns (matrices written, bytes) or the reason it could not.
pub fn save(engine: &MultiEngine, lineage: &str) -> Result<(usize, u64), String> {
    if lineage.is_empty() { return Err("no lineage from the brain yet".into()); }
    let d = dir();
    std::fs::create_dir_all(&d).map_err(|e| format!("create {}: {e}", d.display()))?;
    let mut entries = Vec::new();
    let mut total = 0u64;
    for name in engine.resident_matrices() {
        let len = match engine.values_byte_len(&name) { Some(n) if n > 0 => n, _ => continue };
        let path = file_for(&name);
        let tmp = path.with_extension("bin.tmp");
        let mut f = std::fs::File::create(&tmp).map_err(|e| format!("create {}: {e}", tmp.display()))?;
        let mut h: u64 = 0xcbf29ce484222325;
        let mut off = 0u64;
        while off < len {
            let chunk = engine.read_values_chunk(&name, off, 8 * 1024 * 1024)
                .ok_or_else(|| format!("read '{name}' failed at byte {off}"))?;
            if chunk.is_empty() { return Err(format!("read '{name}' returned nothing at byte {off}")); }
            h = fnv(&chunk, h);
            f.write_all(&chunk).map_err(|e| format!("write '{name}': {e}"))?;
            off += chunk.len() as u64;
        }
        f.sync_all().map_err(|e| format!("sync '{name}': {e}"))?;
        drop(f);
        std::fs::rename(&tmp, &path).map_err(|e| format!("rename '{name}': {e}"))?;
        entries.push(MatrixEntry { name, byte_len: off, checksum: h.to_string() });
        total += off;
    }
    if entries.is_empty() { return Err("no resident matrices to checkpoint".into()); }
    let man = Manifest { lineage: lineage.to_string(), saved_at: now_ms(), matrices: entries };
    let mp = d.join("manifest.json");
    let mtmp = d.join("manifest.json.tmp");
    std::fs::write(&mtmp, serde_json::to_vec_pretty(&man).map_err(|e| e.to_string())?).map_err(|e| format!("manifest: {e}"))?;
    std::fs::rename(&mtmp, &mp).map_err(|e| format!("manifest rename: {e}"))?;
    Ok((man.matrices.len(), total))
}

pub fn manifest() -> Option<Manifest> {
    let bytes = std::fs::read(dir().join("manifest.json")).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Restore every checkpointed matrix into the engine when the checkpoint is
/// this brain's (same lineage) and newer than its last save. Returns the
/// names restored and, for each one not restored, why.
pub fn restore(engine: &mut MultiEngine, lineage: &str, brain_saved_at: u64) -> (Vec<String>, Vec<String>) {
    let mut done = Vec::new();
    let mut skipped = Vec::new();
    let Some(man) = manifest() else { skipped.push("no checkpoint on this donor".into()); return (done, skipped); };
    if man.lineage != lineage { skipped.push(format!("checkpoint belongs to lineage {} (brain is {lineage})", man.lineage)); return (done, skipped); }
    if man.saved_at <= brain_saved_at { skipped.push(format!("checkpoint ({}) is not newer than the brain's last save ({brain_saved_at})", man.saved_at)); return (done, skipped); }
    for m in &man.matrices {
        let bytes = match std::fs::read(file_for(&m.name)) { Ok(b) => b, Err(e) => { skipped.push(format!("{}: read failed ({e})", m.name)); continue; } };
        if bytes.len() as u64 != m.byte_len || fnv(&bytes, 0xcbf29ce484222325).to_string() != m.checksum {
            skipped.push(format!("{}: file does not match its manifest checksum", m.name));
            continue;
        }
        match engine.restore_values(&m.name, &bytes) {
            Ok(()) => done.push(m.name.clone()),
            Err(e) => skipped.push(format!("{}: {e}", m.name)),
        }
    }
    (done, skipped)
}
