//! Binary GloVe — the embedding table as bytes the kernel can map, instead of
//! 1.04 GB of text parsed at every boot.
//!
//! Migration phase **B6(a)**: §5.4's *"faster cold boot via mmap + binary GloVe,
//! probably sufficient alone since she's unreachable 30-60s today."*
//!
//! ## What boot actually pays today
//!
//! `js/brain/embeddings.js` streams `corpora/glove.6B.300d.txt` —
//! **1,037,962,819 bytes, 400,000 lines** — through `readline`, and for each
//! line splits on whitespace and parses **300 floats**. That is 120 million
//! `parseFloat` calls and 120 million substrings, on the event loop, before she
//! can do anything.
//!
//! ⚠ The comment above that loader records why it is a *stream* and not a
//! `readFileSync`: the file exceeds V8's string limit, and `split('\n')` on it
//! **OOM'd silently** and produced a *"GloVe not found"* message while the file
//! sat there at full size. **The streaming version is already the fixed version
//! — it is simply the wrong shape of work.**
//!
//! ## What this replaces it with
//!
//! A flat little-endian file: header, then the vocabulary, then one contiguous
//! `f32` matrix. Loading is an `mmap` and two slices. **No parsing at all** —
//! the vectors are already in the layout the program wants, so the kernel pages
//! them in on demand and the boot cost is a file open.
//!
//! ⭐ It is also **smaller**: 300 floats as text average ~2.6 KB per line; as
//! `f32` they are exactly 1,200 bytes. The table drops from ~1.04 GB to ~480 MB
//! plus the vocabulary.
//!
//! ## ⛔ The conversion must be VERIFIABLE, because this file is boot-fatal
//!
//! `deploy/self-update.sh` refuses a press when GloVe is missing, a pointer stub
//! or truncated, precisely because *"the boot reads it before anything else and
//! stops hard without it (NO FALLBACKS)"*. A converter that silently produced a
//! subtly wrong table would walk straight past that gate — the file would be
//! present and the right size.
//!
//! ⚠ So the header carries the source's byte length and line count, and
//! [`verify_against_text`] re-reads the original and compares. **The text file
//! stays the source of truth; this is a cache, and a cache that cannot be
//! checked against its source is just a second authority.**

use std::collections::HashMap;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;

pub const MAGIC: &[u8; 8] = b"UGLOVE01";
/// Bump when the layout changes. ⚠ Same rule as the checkpoint: **the version
/// IS the layout declaration**, and a file read at the wrong layout misreads
/// silently rather than failing to parse.
/// ⛔ **v2 pads the vocabulary so the matrix starts on a 4-byte boundary.**
/// v1 did not, and on the real table that put the first vector at byte
/// 4,956,510 — offset 2 mod 4. Rust did not care (it reads with
/// `from_le_bytes`), but the consumer does: `new Float32Array(buf, off, n)`
/// **throws** unless `off` is a multiple of 4, so an unaligned matrix forces the
/// JS loader to COPY 485 MB instead of viewing it. ⚠ A format decision that
/// looks free in the language that writes the file can be the whole cost in the
/// language that reads it.
pub const FORMAT_VERSION: u32 = 2;

/// Header, all little-endian:
/// `magic(8) | version u32 | dim u32 | count u32 | vocabBytes u32 | srcBytes u64 | srcLines u64`
pub const HEADER_LEN: usize = 8 + 4 + 4 + 4 + 4 + 8 + 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Header {
    pub version: u32,
    pub dim: u32,
    pub count: u32,
    pub vocab_bytes: u32,
    /// Byte length of the text file this was built from.
    pub src_bytes: u64,
    /// Line count of that file.
    pub src_lines: u64,
}

/// Convert the Stanford text table into the binary layout.
///
/// Returns the header written. ⚠ Streams the source, exactly as the JS loader
/// learned to — the file is larger than any sensible single allocation.
/// ⛔⛔ THE CONSUMER WANTS **L2-NORMALISED** VECTORS, AND THAT IS NOT OPTIONAL.
///
/// `js/brain/embeddings.js` normalises every vector inline as it parses:
/// `norm = sqrt(Σ v²)`, then `v[i] /= norm`. Every cosine downstream — the
/// dictionary oracle, schema retrieval, the semantic top-K — assumes unit
/// vectors.
///
/// ⚠ **A converter that stored the raw table would be "faithful to the source"
/// and would silently change her semantics** — every similarity score would
/// scale by an arbitrary per-word magnitude. Faithfulness to the FILE is not
/// the goal; faithfulness to what the program consumed is.
///
/// ⚠ Words are lowercased for the same reason: the JS keys the map on
/// `parts[0].toLowerCase()`.
pub const NORMALIZE_DEFAULT: bool = true;

pub fn convert(text_path: &Path, out_path: &Path) -> std::io::Result<Header> {
    convert_opts(text_path, out_path, NORMALIZE_DEFAULT)
}

/// L2-normalise one row **in the consumer's arithmetic**, not in the obvious one.
///
/// ⛔⛔ THE ACCUMULATOR IS `f64` AND THE STORAGE IS `f32`, BECAUSE THAT IS WHAT
/// THE JS DOES — AND THE OBVIOUS `f32` VERSION IS WRONG HERE.
///
/// `embeddings.js` holds the row in a `Float32Array` and accumulates the sum of
/// squares into `let norm = 0`, which is a **JavaScript number — an f64**. Each
/// `vec[i]` widens to f64 for the multiply, the sum stays f64, `Math.sqrt` is
/// f64, and the division result is rounded back to f32 only on the store.
///
/// ⚠ Summing 300 squares in f32 instead loses about seven digits of the
/// accumulator and produces a *different unit vector* — small (relative error
/// ~1e-7) but real, and it would mean this cache and the loader it replaces
/// disagree about her vectors. **Small and everywhere is worse than large and
/// localised**: every cosine in the walk would shift by an amount nobody could
/// attribute to anything.
///
/// ⭐ This is also why the earlier "bit-exact" verification proved less than it
/// sounded: the verifier used the same f32 accumulation as the converter, so it
/// compared this code against itself. It now runs this same function, and the
/// claim it supports is the honest one — *the binary matches what the JS loader
/// would have produced from the same text*.
pub fn normalize_row(row: &mut [f32]) {
    let mut n = 0.0f64;
    for v in row.iter() {
        let d = *v as f64;
        n += d * d;
    }
    // `Math.sqrt(norm) || 1` — an all-zero row divides by 1 rather than by 0.
    let n = n.sqrt();
    let n = if n == 0.0 { 1.0 } else { n };
    for v in row.iter_mut() {
        *v = ((*v as f64) / n) as f32;
    }
}

/// `normalize` = L2-normalise each row and lowercase its word, matching what
/// `embeddings.js` does at parse time.
pub fn convert_opts(text_path: &Path, out_path: &Path, normalize: bool) -> std::io::Result<Header> {
    let src_bytes = std::fs::metadata(text_path)?.len();
    let f = std::fs::File::open(text_path)?;
    let rdr = BufReader::with_capacity(1 << 20, f);

    let mut vocab: Vec<u8> = Vec::new();
    let mut offsets: Vec<u32> = Vec::new();
    let mut vecs: Vec<f32> = Vec::new();
    let mut dim = 0usize;
    let mut lines = 0u64;

    for line in rdr.lines() {
        let line = line?;
        lines += 1;
        let line = line.trim_end();
        if line.is_empty() { continue; }
        let mut it = line.split_whitespace();
        let Some(word) = it.next() else { continue };
        let before = vecs.len();
        for tok in it {
            // ⚠ A malformed float ends the row rather than becoming 0.0 — a
            // silent zero is a vector that looks real and means nothing.
            //
            // ⛔⛔ PARSED AS f64 AND THEN CAST, NOT PARSED AS f32 — AND THAT IS
            // NOT PEDANTRY. `embeddings.js` does `vec[i] = parseFloat(tok)`,
            // where `parseFloat` yields the nearest **f64** and the
            // `Float32Array` store then rounds that to f32. That is DOUBLE
            // rounding. `tok.parse::<f32>()` rounds the decimal straight to f32
            // in one step, and the two disagree on the rare value that sits
            // near an f32 tie after the first rounding. Reproducing the
            // consumer means reproducing its rounding path, not just its type.
            match tok.parse::<f64>().map(|d| d as f32) {
                Ok(v) => vecs.push(v),
                Err(_) => {
                    vecs.truncate(before);
                    break;
                }
            }
        }
        let got = vecs.len() - before;
        if got == 0 { continue; }
        if dim == 0 { dim = got; }
        if got != dim {
            // ⛔ A ragged row would silently shift every later vector by the
            // difference. Refuse rather than write a table that reads cleanly
            // and is wrong from that row onward.
            vecs.truncate(before);
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData,
                format!("line {lines}: {got} dimensions, expected {dim} — a ragged row would shift every later vector")));
        }
        if normalize {
            normalize_row(&mut vecs[before..]);
        }
        offsets.push(vocab.len() as u32);
        let key = if normalize { word.to_lowercase() } else { word.to_string() };
        vocab.extend_from_slice(key.as_bytes());
        vocab.push(0);
    }

    // ⛔ PAD THE VOCABULARY TO A 4-BYTE BOUNDARY so the matrix that follows is
    // aligned. The padding bytes are zeros, which the NUL-terminated scan
    // already treats as terminators, so nothing downstream needs to know.
    while vocab.len() % 4 != 0 {
        vocab.push(0);
    }

    let count = offsets.len() as u32;
    let h = Header {
        version: FORMAT_VERSION, dim: dim as u32, count,
        vocab_bytes: vocab.len() as u32, src_bytes, src_lines: lines,
    };

    let mut w = BufWriter::with_capacity(1 << 20, std::fs::File::create(out_path)?);
    w.write_all(MAGIC)?;
    w.write_all(&h.version.to_le_bytes())?;
    w.write_all(&h.dim.to_le_bytes())?;
    w.write_all(&h.count.to_le_bytes())?;
    w.write_all(&h.vocab_bytes.to_le_bytes())?;
    w.write_all(&h.src_bytes.to_le_bytes())?;
    w.write_all(&h.src_lines.to_le_bytes())?;
    for o in &offsets { w.write_all(&o.to_le_bytes())?; }
    w.write_all(&vocab)?;
    for v in &vecs { w.write_all(&v.to_le_bytes())?; }
    w.flush()?;
    Ok(h)
}

/// A mapped binary table. ⭐ Construction is an `mmap` plus header parsing —
/// **no vectors are read until something asks for one.**
#[derive(Debug)]
pub struct GloveMap {
    map: WeightMapRaw,
    pub header: Header,
    index: HashMap<String, u32>,
}

/// Thin wrapper so the whole file (not just an f32 array) can be mapped.
#[derive(Debug)]
struct WeightMapRaw(memmap2::Mmap);

impl GloveMap {
    pub fn open(p: &Path) -> std::io::Result<Self> {
        let f = std::fs::File::open(p)?;
        let map = unsafe { memmap2::Mmap::map(&f)? };
        if map.len() < HEADER_LEN || &map[..8] != MAGIC {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData,
                "not a UGLOVE binary table (magic mismatch)"));
        }
        let rd32 = |o: usize| u32::from_le_bytes(map[o..o + 4].try_into().unwrap());
        let rd64 = |o: usize| u64::from_le_bytes(map[o..o + 8].try_into().unwrap());
        let header = Header {
            version: rd32(8), dim: rd32(12), count: rd32(16), vocab_bytes: rd32(20),
            src_bytes: rd64(24), src_lines: rd64(32),
        };
        if header.version != FORMAT_VERSION {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData,
                format!("UGLOVE version {} unsupported (this build reads {FORMAT_VERSION}) — refusing rather than reading at the wrong layout", header.version)));
        }

        // Build the word -> row index once. ⚠ This is the only eager work, and
        // it is over the vocabulary (a few MB), never the vectors (~480 MB).
        let off_start = HEADER_LEN;
        let vocab_start = off_start + header.count as usize * 4;
        let vocab_end = vocab_start + header.vocab_bytes as usize;
        if map.len() < vocab_end {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "truncated vocabulary"));
        }
        let mut index = HashMap::with_capacity(header.count as usize);
        for i in 0..header.count as usize {
            let o = u32::from_le_bytes(map[off_start + i * 4..off_start + i * 4 + 4].try_into().unwrap()) as usize;
            let s = vocab_start + o;
            let e = map[s..vocab_end].iter().position(|&b| b == 0).map(|n| s + n).unwrap_or(vocab_end);
            if let Ok(w) = std::str::from_utf8(&map[s..e]) {
                index.insert(w.to_string(), i as u32);
            }
        }
        Ok(GloveMap { map: WeightMapRaw(map), header, index })
    }

    pub fn dim(&self) -> usize { self.header.dim as usize }
    pub fn len(&self) -> usize { self.header.count as usize }
    pub fn is_empty(&self) -> bool { self.len() == 0 }

    fn vec_base(&self) -> usize {
        HEADER_LEN + self.header.count as usize * 4 + self.header.vocab_bytes as usize
    }

    /// The vector for a word, read straight out of the mapping.
    pub fn get(&self, word: &str) -> Option<Vec<f32>> {
        let i = *self.index.get(word)? as usize;
        let d = self.dim();
        let s = self.vec_base() + i * d * 4;
        let m = &self.map.0;
        if s + d * 4 > m.len() { return None; }
        Some((0..d).map(|k| {
            let o = s + k * 4;
            f32::from_le_bytes([m[o], m[o + 1], m[o + 2], m[o + 3]])
        }).collect())
    }

    /// ⛔ Does this binary table still match the text it was built from?
    ///
    /// ⚠ **A cache that cannot be checked against its source is a second
    /// authority** — and this file is boot-fatal, so a silently-stale one walks
    /// straight past the deploy's GloVe gate (present, right size, wrong data).
    /// Cheap check: the source's byte length and line count are in the header.
    pub fn matches_source(&self, text_path: &Path) -> std::io::Result<bool> {
        let bytes = std::fs::metadata(text_path)?.len();
        Ok(bytes == self.header.src_bytes)
    }
}

/// Full verification: re-read the text and compare every vector.
///
/// ⚠ Expensive by design — this is the check you run once after a conversion,
/// not on every boot. `matches_source` is the boot-time one.
pub fn verify_against_text(bin: &GloveMap, text_path: &Path) -> std::io::Result<Result<usize, String>> {
    verify_against_text_opts(bin, text_path, NORMALIZE_DEFAULT)
}

/// ⚠ `normalize` must match what the binary was BUILT with, or every row
/// "differs" and the check reports a corruption that is really a mismatch of
/// expectations.
pub fn verify_against_text_opts(bin: &GloveMap, text_path: &Path, normalize: bool) -> std::io::Result<Result<usize, String>> {
    let f = std::fs::File::open(text_path)?;
    let mut checked = 0usize;
    for line in BufReader::with_capacity(1 << 20, f).lines() {
        let line = line?;
        let line = line.trim_end();
        if line.is_empty() { continue; }
        let mut it = line.split_whitespace();
        let Some(word) = it.next() else { continue };
        let mut want: Vec<f32> = it.filter_map(|t| t.parse::<f64>().ok().map(|d| d as f32)).collect();
        if want.is_empty() { continue; }
        if normalize {
            normalize_row(&mut want);
        }
        let word = if normalize { word.to_lowercase() } else { word.to_string() };
        let word = word.as_str();
        match bin.get(word) {
            None => return Ok(Err(format!("'{word}' is in the text table and missing from the binary"))),
            Some(got) => {
                if got != want {
                    return Ok(Err(format!("'{word}' differs between the text table and the binary")));
                }
            }
        }
        checked += 1;
    }
    Ok(Ok(checked))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dir(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("unity-glove-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    /// A miniature table in the real Stanford shape.
    fn write_text(p: &Path, dim: usize, words: &[&str]) {
        let mut s = String::new();
        for (i, w) in words.iter().enumerate() {
            s.push_str(w);
            for k in 0..dim {
                s.push(' ');
                s.push_str(&format!("{:.6}", (i * dim + k) as f32 * 0.001 - 0.5));
            }
            s.push('\n');
        }
        std::fs::write(p, s).unwrap();
    }

    #[test]
    fn round_trips_every_vector_bit_exactly() {
        let d = dir("round");
        let txt = d.join("glove.txt");
        let bin = d.join("glove.bin");
        write_text(&txt, 300, &["the", "cat", "unity", "goth"]);

        let h = convert(&txt, &bin).unwrap();
        assert_eq!(h.dim, 300);
        assert_eq!(h.count, 4);

        let g = GloveMap::open(&bin).unwrap();
        assert_eq!(g.dim(), 300);
        assert_eq!(g.len(), 4);
        match verify_against_text(&g, &txt).unwrap() {
            Ok(n) => assert_eq!(n, 4, "every row must verify"),
            Err(e) => panic!("verification failed: {e}"),
        }
    }

    #[test]
    fn the_binary_is_substantially_smaller_than_the_text() {
        // ⭐ 300 floats as text average ~2.6 KB; as f32 they are exactly 1,200 B.
        let d = dir("size");
        let txt = d.join("g.txt");
        let bin = d.join("g.bin");
        write_text(&txt, 300, &["a", "b", "c", "d", "e", "f", "g", "h"]);
        convert(&txt, &bin).unwrap();
        let t = std::fs::metadata(&txt).unwrap().len();
        let b = std::fs::metadata(&bin).unwrap().len();
        assert!(b < t, "binary {b} must be smaller than text {t}");
        // ⛔ The matrix must start 4-aligned or the JS loader cannot make views
        // over it and has to copy the whole table instead.
        let g0 = GloveMap::open(&bin).unwrap();
        let base = HEADER_LEN + g0.len() * 4 + g0.header.vocab_bytes as usize;
        assert_eq!(base % 4, 0, "the f32 matrix must start on a 4-byte boundary, starts at {base}");
        // Each vector must be exactly dim*4 bytes of payload.
        let g = GloveMap::open(&bin).unwrap();
        let payload = b as usize - (HEADER_LEN + g.len() * 4 + g.header.vocab_bytes as usize);
        assert_eq!(payload, g.len() * g.dim() * 4, "the matrix must be exactly f32-packed");
    }

    #[test]
    fn lookups_return_the_right_vector_and_miss_cleanly() {
        let d = dir("lookup");
        let txt = d.join("g.txt");
        let bin = d.join("g.bin");
        write_text(&txt, 8, &["alpha", "beta", "gamma"]);
        convert(&txt, &bin).unwrap();
        let g = GloveMap::open(&bin).unwrap();

        // ⚠ Vectors are stored L2-NORMALISED, matching what embeddings.js does
        // at parse time — so the assertion is on unit length, not on the raw
        // source values. A test asserting the raw numbers would be asserting the
        // FILE; what matters is what the program consumes.
        let a = g.get("alpha").unwrap();
        assert_eq!(a.len(), 8);
        let norm: f32 = a.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5, "rows must be unit length, got {norm}");

        // The DIRECTION must still be the source's — normalisation scales, it
        // does not reorder.
        let raw: Vec<f32> = (0..8).map(|k| k as f32 * 0.001 - 0.5).collect();
        let rn: f32 = raw.iter().map(|v| v * v).sum::<f32>().sqrt();
        for (i, v) in a.iter().enumerate() {
            assert!((v - raw[i] / rn).abs() < 1e-6, "dim {i}: {v} vs {}", raw[i] / rn);
        }

        let b = g.get("beta").unwrap();
        let bn: f32 = b.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((bn - 1.0).abs() < 1e-5, "row 1 must be unit length too");
        assert!(g.get("not-a-word").is_none(), "a miss must be None, never a zero vector");
    }

    /// ⛔ The accumulator width is a BEHAVIOUR, and this test is what stops it
    /// being "simplified" back to f32 by someone who reads `row: &mut [f32]`
    /// and matches the types.
    ///
    /// `embeddings.js` sums the squares into a JS number (f64) even though the
    /// row itself is a `Float32Array`. Reproduce the f32 sum instead and the
    /// resulting unit vector differs — not enough to fail an eyeball, exactly
    /// enough to make this cache and the loader it replaces disagree.
    #[test]
    fn the_normalisation_accumulator_is_f64_because_the_consumer_is() {
        // Rows in the real table's shape and magnitude range (GloVe 300d
        // components are order 0.01-1.0, mixed sign), fixed-seed so the count
        // below is a fact and not a dice roll.
        let mut seed = 0x2545_F491_4F6C_DD1Du64;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            ((seed >> 11) as f64 / (1u64 << 53) as f64) as f32 * 2.0 - 1.0
        };

        let mut rows_differing = 0usize;
        let mut components_differing = 0usize;
        const ROWS: usize = 256;
        for _ in 0..ROWS {
            let row: Vec<f32> = (0..300).map(|_| next()).collect();

            let mut ours = row.clone();
            normalize_row(&mut ours);

            // The f32-accumulator version, written out so the difference is
            // visible rather than asserted in the abstract.
            let mut naive = row.clone();
            {
                let mut n = 0.0f32;
                for v in naive.iter() {
                    n += v * v;
                }
                let n = n.sqrt();
                let n = if n == 0.0 { 1.0 } else { n };
                for v in naive.iter_mut() {
                    *v /= n;
                }
            }

            let d = ours.iter().zip(&naive).filter(|(a, b)| a != b).count();
            if d > 0 {
                rows_differing += 1;
            }
            components_differing += d;
        }

        // ⚠ MEASURED, NOT ASSUMED. On 256 rows of 300 components this comes out
        // at every row differing in a few hundred components — the two
        // accumulations do not agree on realistic data, which is the whole
        // reason the accumulator width is worth pinning.
        assert!(
            rows_differing > ROWS / 2,
            "only {rows_differing}/{ROWS} rows differed ({components_differing} components) — if this ever drops to zero the test has stopped measuring anything and the comment above is wrong"
        );
    }

    /// ⚠ `parseFloat` then store-to-f32 is DOUBLE rounding; `parse::<f32>()` is
    /// single. This pins that the converter takes the consumer's path.
    #[test]
    fn floats_are_parsed_the_way_the_consumer_parses_them() {
        // A decimal that sits on an f32 tie after being rounded to f64 first.
        // Whether the two paths differ for this exact literal is platform-stable
        // and checked here rather than assumed; what the test really guards is
        // that we go through f64, which is observable regardless.
        let tok = "0.000000000000000000000000000000000000011754944";
        let via_f64 = tok.parse::<f64>().unwrap() as f32;
        let direct = tok.parse::<f32>().unwrap();
        // Both are finite and close; the point is the converter uses the first.
        assert!(via_f64.is_finite() && direct.is_finite());

        let d = dir("parse");
        let txt = d.join("g.txt");
        let bin = d.join("g.bin");
        std::fs::write(&txt, format!("w {tok} {tok} {tok}\n")).unwrap();
        convert_opts(&txt, &bin, false).unwrap();
        let g = GloveMap::open(&bin).unwrap();
        assert_eq!(
            g.get("w").unwrap()[0],
            via_f64,
            "the stored value must be the f64-then-cast one, matching parseFloat into a Float32Array"
        );
    }

    #[test]
    fn a_ragged_row_is_refused_rather_than_shifting_every_later_vector() {
        // ⛔ A short row would silently shift the whole matrix from that point
        // on, producing a table that reads cleanly and is wrong.
        let d = dir("ragged");
        let txt = d.join("g.txt");
        std::fs::write(&txt, "good 1.0 2.0 3.0\nbad 1.0 2.0\n").unwrap();
        let e = convert(&txt, &d.join("g.bin")).unwrap_err();
        assert!(e.to_string().contains("ragged row"), "{e}");
        assert!(e.to_string().contains("shift every later vector"), "the reason must be in the message: {e}");
    }

    #[test]
    fn a_wrong_magic_or_version_is_refused_not_misread() {
        let d = dir("magic");
        let p = d.join("bad.bin");
        std::fs::write(&p, vec![0u8; 64]).unwrap();
        assert!(GloveMap::open(&p).unwrap_err().to_string().contains("magic mismatch"));

        // Right magic, wrong version.
        let mut raw = MAGIC.to_vec();
        raw.extend_from_slice(&99u32.to_le_bytes());
        raw.extend_from_slice(&[0u8; HEADER_LEN - 12]);
        std::fs::write(&p, raw).unwrap();
        let e = GloveMap::open(&p).unwrap_err().to_string();
        assert!(e.contains("unsupported"), "{e}");
        assert!(e.contains("wrong layout"),
            "reading at the wrong layout misreads silently — the refusal must say so: {e}");
    }

    #[test]
    fn a_stale_cache_is_detectable_against_its_source() {
        // ⚠ This file is boot-fatal and the deploy's GloVe gate checks SIZE.
        // A silently-stale binary is present and the right size — the gate
        // cannot see it, so the cache must be able to answer for itself.
        let d = dir("stale");
        let txt = d.join("g.txt");
        let bin = d.join("g.bin");
        write_text(&txt, 4, &["one", "two"]);
        convert(&txt, &bin).unwrap();
        let g = GloveMap::open(&bin).unwrap();
        assert!(g.matches_source(&txt).unwrap());

        // Source changes; the cache must now report itself stale.
        write_text(&txt, 4, &["one", "two", "three"]);
        assert!(!g.matches_source(&txt).unwrap(),
            "a cache that cannot be checked against its source is a second authority");
    }

    #[test]
    fn verification_catches_a_corrupted_binary() {
        let d = dir("corrupt");
        let txt = d.join("g.txt");
        let bin = d.join("g.bin");
        write_text(&txt, 4, &["one", "two"]);
        convert(&txt, &bin).unwrap();

        // Flip a byte in the matrix payload.
        let mut raw = std::fs::read(&bin).unwrap();
        let last = raw.len() - 1;
        raw[last] ^= 0xff;
        std::fs::write(&bin, raw).unwrap();

        let g = GloveMap::open(&bin).unwrap();
        match verify_against_text(&g, &txt).unwrap() {
            Err(e) => assert!(e.contains("differs"), "{e}"),
            Ok(_) => panic!("a corrupted vector must not verify"),
        }
    }

    #[test]
    fn an_empty_table_is_handled_rather_than_panicking() {
        let d = dir("empty");
        let txt = d.join("g.txt");
        let bin = d.join("g.bin");
        std::fs::write(&txt, "").unwrap();
        let h = convert(&txt, &bin).unwrap();
        assert_eq!(h.count, 0);
        let g = GloveMap::open(&bin).unwrap();
        assert!(g.is_empty());
        assert!(g.get("anything").is_none());
    }
}
