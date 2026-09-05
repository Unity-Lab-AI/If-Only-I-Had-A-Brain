//! The `UBWT` binary weight checkpoint — **byte-compatible with the JS writer**.
//!
//! `docs/RUST-MIGRATION.md` §4 lists this among *"the contracts that must not
//! break"*, and it is the one with teeth: get it wrong and a multi-week walk is
//! unreadable. So this is written against `server/brain-server.js`'s actual
//! layout, not a re-imagining of it.
//!
//! ```text
//! Header (16 bytes): 'UBWT' (4) | formatVersion u32 | saveVersion u32 | sectionCount u32
//! Per section:       'SECT' (4) | nameLen u32 | name bytes (padded up to a u32 boundary)
//!                    | rows u32 | cols u32 | nnz u32
//!                    | rowPtr (rows+1) × u32
//!                    | colIdx nnz × u32
//!                    | values nnz × f32     ← v2.  v1 files are f64.
//! ```
//! All little-endian. The file is consumed on the machine that wrote it, so no
//! endianness swap is performed — matching the JS comment exactly.
//!
//! ## ⛔ THE VERSION *IS* THE DTYPE DECLARATION
//!
//! `BIN_FORMAT_VERSION` is a **different number** from the brain's
//! `WEIGHTS_FORMAT_VERSION`, and conflating them is a data-loss bug: the latter
//! describes geometry and gates resume-vs-wipe at boot, the former describes the
//! byte layout. **Bumping the brain's version does not gate this reader.**
//!
//! v1 = f64 values, v2 = f32. ⚠ **Read the wrong one and every section after the
//! first lands at the wrong offset — which does not surface as a parse error, it
//! surfaces as a brain that loaded successfully and holds garbage.**
//!
//! ⭐ v1 is **read and converted, not refused**: a v1 file is a valid f64
//! checkpoint holding real training, and discarding a walk to avoid one array
//! copy is the wrong trade.
//!
//! ## ⛔ WHY THE WRITE WIDTH IS DERIVED FROM THE TYPE
//!
//! The JS writer hardcoded `nnz * 8` as the values width. When the values array
//! narrowed to f32 that buffer became `nnz * 4`, and `Buffer.from(buf, off, len)`
//! **throws** rather than clamping — so the save aborted, fell back to the
//! previous checkpoint, and **she trained for two hours and persisted nothing,
//! while looking healthy.** Here the width comes from `size_of::<Weight>()`.

use crate::{Csr, Weight};
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

pub const MAGIC: &[u8; 4] = b"UBWT";
pub const SECT: &[u8; 4] = b"SECT";

/// This build writes v2 (f32 values) and reads v1 and v2.
pub const BIN_FORMAT_VERSION: u32 = 2;

/// Bytes per stored value for a given on-disk format version.
/// ⚠ Returns `None` for an unknown version — **refused, never guessed**.
pub fn value_width(version: u32) -> Option<usize> {
    match version {
        1 => Some(8), // f64
        2 => Some(4), // f32
        _ => None,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Section {
    pub name: String,
    pub matrix: Csr,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Checkpoint {
    pub format_version: u32,
    pub save_version: u32,
    pub sections: Vec<Section>,
}

fn pad4(n: usize) -> usize { n.div_ceil(4) * 4 }

fn rd_u32(r: &mut impl Read) -> std::io::Result<u32> {
    let mut b = [0u8; 4];
    r.read_exact(&mut b)?;
    Ok(u32::from_le_bytes(b))
}

fn err(msg: impl Into<String>) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, msg.into())
}

/// Write a checkpoint in the current format.
pub fn write(path: &Path, save_version: u32, sections: &[Section]) -> std::io::Result<()> {
    for s in sections {
        s.matrix.validate().map_err(|e| err(format!("section '{}' is not writable: {e}", s.name)))?;
    }
    let f = File::create(path)?;
    let mut w = BufWriter::new(f);

    w.write_all(MAGIC)?;
    w.write_all(&BIN_FORMAT_VERSION.to_le_bytes())?;
    w.write_all(&save_version.to_le_bytes())?;
    w.write_all(&(sections.len() as u32).to_le_bytes())?;

    for s in sections {
        let name = s.name.as_bytes();
        let padded = pad4(name.len());
        w.write_all(SECT)?;
        w.write_all(&(name.len() as u32).to_le_bytes())?;
        w.write_all(name)?;
        w.write_all(&vec![0u8; padded - name.len()])?;
        w.write_all(&(s.matrix.rows as u32).to_le_bytes())?;
        w.write_all(&(s.matrix.cols as u32).to_le_bytes())?;
        w.write_all(&(s.matrix.nnz() as u32).to_le_bytes())?;
        for v in &s.matrix.row_ptr { w.write_all(&v.to_le_bytes())?; }
        for v in &s.matrix.col_idx { w.write_all(&v.to_le_bytes())?; }
        // ⛔ Width from the TYPE. A literal here is the bug that stopped her
        // persisting for two hours.
        for v in &s.matrix.values { w.write_all(&v.to_le_bytes())?; }
    }
    w.flush()?;
    Ok(())
}

/// Read a checkpoint, converting v1 (f64) values down to [`Weight`].
pub fn read(path: &Path) -> std::io::Result<Checkpoint> {
    let f = File::open(path)?;
    let mut r = BufReader::new(f);

    let mut magic = [0u8; 4];
    r.read_exact(&mut magic)?;
    if &magic != MAGIC {
        return Err(err(format!("magic mismatch: got {:?}, expected UBWT", String::from_utf8_lossy(&magic))));
    }
    let format_version = rd_u32(&mut r)?;
    let save_version = rd_u32(&mut r)?;
    let section_count = rd_u32(&mut r)?;

    let vw = value_width(format_version).ok_or_else(|| err(format!(
        "binary weights format version {format_version} unsupported (this build reads 1 and 2, writes {BIN_FORMAT_VERSION}) — refusing rather than guessing the value width"
    )))?;

    let mut sections = Vec::with_capacity(section_count as usize);
    for i in 0..section_count {
        let mut sm = [0u8; 4];
        r.read_exact(&mut sm)?;
        if &sm != SECT {
            return Err(err(format!("section {i} magic mismatch — the file is torn or a preceding section was read at the wrong width")));
        }
        let name_len = rd_u32(&mut r)? as usize;
        let padded = pad4(name_len);
        let mut nb = vec![0u8; padded];
        r.read_exact(&mut nb)?;
        let name = String::from_utf8_lossy(&nb[..name_len]).into_owned();

        let rows = rd_u32(&mut r)? as usize;
        let cols = rd_u32(&mut r)? as usize;
        let nnz = rd_u32(&mut r)? as usize;

        let mut row_ptr = Vec::with_capacity(rows + 1);
        for _ in 0..rows + 1 { row_ptr.push(rd_u32(&mut r)?); }
        let mut col_idx = Vec::with_capacity(nnz);
        for _ in 0..nnz { col_idx.push(rd_u32(&mut r)?); }

        let mut values = Vec::with_capacity(nnz);
        let mut buf = vec![0u8; vw];
        for _ in 0..nnz {
            r.read_exact(&mut buf)?;
            values.push(match vw {
                4 => Weight::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]),
                // ⭐ v1 narrowing happens HERE, at the boundary, so nothing
                // downstream ever holds a mixed-width matrix. The JS apply path
                // assigned `m.values` directly and had to be taught to coerce.
                8 => f64::from_le_bytes([buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], buf[6], buf[7]]) as Weight,
                _ => unreachable!("value_width already refused every other width"),
            });
        }

        let m = Csr { rows, cols, row_ptr, col_idx, values };
        m.validate().map_err(|e| err(format!("section '{name}' failed validation after read: {e}")))?;
        sections.push(Section { name, matrix: m });
    }

    Ok(Checkpoint { format_version, save_version, sections })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("unity-weights-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p.push("brain-weights.bin");
        p
    }

    fn sample() -> Vec<Section> {
        vec![
            Section { name: "cortex.synapses".into(), matrix: Csr {
                rows: 3, cols: 4,
                row_ptr: vec![0, 2, 2, 4],
                col_idx: vec![0, 3, 1, 2],
                values: vec![0.25, -0.5, 1.0, 0.125],
            }},
            // A name whose length is NOT a multiple of 4, to exercise padding.
            Section { name: "cortex.crossProjections.sem_to_motor".into(), matrix: Csr {
                rows: 1, cols: 2,
                row_ptr: vec![0, 1],
                col_idx: vec![1],
                values: vec![-0.0625],
            }},
        ]
    }

    #[test]
    fn round_trips_bit_identically() {
        let p = tmp("roundtrip");
        let s = sample();
        write(&p, 7, &s).unwrap();
        let back = read(&p).unwrap();
        assert_eq!(back.format_version, 2);
        assert_eq!(back.save_version, 7);
        assert_eq!(back.sections, s, "a checkpoint must return exactly what it stored");
    }

    #[test]
    fn the_header_is_byte_exact_against_the_js_layout() {
        let p = tmp("header");
        write(&p, 9, &sample()).unwrap();
        let raw = std::fs::read(&p).unwrap();
        assert_eq!(&raw[0..4], MAGIC);
        assert_eq!(u32::from_le_bytes(raw[4..8].try_into().unwrap()), 2, "formatVersion at byte 4");
        assert_eq!(u32::from_le_bytes(raw[8..12].try_into().unwrap()), 9, "saveVersion at byte 8");
        assert_eq!(u32::from_le_bytes(raw[12..16].try_into().unwrap()), 2, "sectionCount at byte 12");
        assert_eq!(&raw[16..20], SECT, "the first section starts immediately after the 16-byte header");
    }

    #[test]
    fn file_size_matches_the_computed_layout_exactly() {
        // ⛔ THE SIZE IS THE CHECK THAT CATCHES A WRONG VALUE WIDTH. The JS
        // writer's `nnz * 8` against an f32 array is exactly this arithmetic
        // going wrong, and it threw instead of writing a short file.
        let p = tmp("size");
        let s = sample();
        write(&p, 1, &s).unwrap();
        let mut expect = 16usize;
        for sec in &s {
            let nl = sec.name.as_bytes().len();
            expect += 4 + 4 + pad4(nl) + 4 + 4 + 4;
            expect += (sec.matrix.rows + 1) * 4;
            expect += sec.matrix.nnz() * 4;
            expect += sec.matrix.nnz() * std::mem::size_of::<Weight>();
        }
        assert_eq!(std::fs::metadata(&p).unwrap().len() as usize, expect);
    }

    #[test]
    fn a_v1_f64_file_is_read_and_narrowed_not_refused() {
        // Hand-build a v1 file exactly as the pre-WEIGHTPREC JS writer did.
        let p = tmp("v1");
        let name = b"cortex.crossProjections.sem_to_motor";
        let vals_f64: Vec<f64> = vec![0.25, -0.5, 1.0];
        let mut raw = Vec::new();
        raw.extend_from_slice(MAGIC);
        raw.extend_from_slice(&1u32.to_le_bytes());   // v1
        raw.extend_from_slice(&3u32.to_le_bytes());
        raw.extend_from_slice(&1u32.to_le_bytes());
        raw.extend_from_slice(SECT);
        raw.extend_from_slice(&(name.len() as u32).to_le_bytes());
        raw.extend_from_slice(name);
        raw.extend(std::iter::repeat(0u8).take(pad4(name.len()) - name.len()));
        raw.extend_from_slice(&1u32.to_le_bytes());   // rows
        raw.extend_from_slice(&4u32.to_le_bytes());   // cols
        raw.extend_from_slice(&3u32.to_le_bytes());   // nnz
        for v in [0u32, 3u32] { raw.extend_from_slice(&v.to_le_bytes()); }      // rowPtr
        for v in [0u32, 1u32, 2u32] { raw.extend_from_slice(&v.to_le_bytes()); } // colIdx
        for v in &vals_f64 { raw.extend_from_slice(&v.to_le_bytes()); }
        std::fs::write(&p, &raw).unwrap();

        let c = read(&p).expect("a v1 checkpoint holds real training and must be READ, not discarded");
        assert_eq!(c.format_version, 1);
        assert_eq!(c.sections[0].matrix.values, vec![0.25f32, -0.5, 1.0],
            "v1 values must be narrowed at the boundary so nothing downstream holds a mixed-width matrix");
    }

    #[test]
    fn an_unknown_version_is_refused_rather_than_guessed() {
        let p = tmp("v9");
        let mut raw = Vec::new();
        raw.extend_from_slice(MAGIC);
        raw.extend_from_slice(&9u32.to_le_bytes());
        raw.extend_from_slice(&0u32.to_le_bytes());
        raw.extend_from_slice(&0u32.to_le_bytes());
        std::fs::write(&p, &raw).unwrap();
        let e = read(&p).unwrap_err().to_string();
        assert!(e.contains("unsupported"), "got: {e}");
        assert!(e.contains("refusing rather than guessing"),
            "reading a file at the wrong width misaligns every later section WITHOUT a parse error");
    }

    #[test]
    fn a_bad_magic_is_named_not_silently_parsed() {
        let p = tmp("magic");
        std::fs::write(&p, b"NOPEXXXXXXXXXXXX").unwrap();
        assert!(read(&p).unwrap_err().to_string().contains("magic mismatch"));
    }

    #[test]
    fn value_width_is_the_single_place_a_version_becomes_a_dtype() {
        assert_eq!(value_width(1), Some(8));
        assert_eq!(value_width(2), Some(4));
        assert_eq!(value_width(3), None, "a new width MUST bump the version and add a case here");
        assert_eq!(value_width(2).unwrap(), std::mem::size_of::<Weight>(),
            "the current version's width must equal the current Weight — if this fails, the format version was not bumped with the type");
    }

    #[test]
    fn a_torn_matrix_is_refused_at_write_rather_than_persisted() {
        let p = tmp("torn");
        let bad = vec![Section { name: "x".into(), matrix: Csr {
            rows: 2, cols: 2, row_ptr: vec![0, 1, 5], col_idx: vec![0], values: vec![1.0],
        }}];
        let e = write(&p, 1, &bad).unwrap_err().to_string();
        assert!(e.contains("not writable"), "got: {e}");
    }
}
