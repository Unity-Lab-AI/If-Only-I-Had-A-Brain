//! Binary sparse-frame codec (M3). Decodes the server's `SPRS` frames and encodes the
//! donor's `SPRR` ack frames, byte-for-byte per the mapped spec. Header (all frames):
//!   'SPRS' | typeByte(1) | reqId(u32 LE) | nameLen(u16 LE) | name(UTF-8) | pad→4B align
//! Types: 1=upload, 2=propagate, 3=hebbian, 4=chunked-upload, 5=batched-hebbian,
//! 7=write-spike-slice, 8=write-current-slice, 9=clear-spike-region (7-9: v0.3.13
//! binary teach patterns - fire-and-forget, no ack; name field carries "cluster/region"),
//! 12=repeat (v0.3.15: the server detected a byte-identical teach payload and sends this
//! ~30-byte frame instead of re-shipping ~150-700KB — the donor re-executes its cached
//! copy; payload = origType(u8); type-3 repeats carry a real reqId and are acked as type 3).
//!
//! Chunked-upload flags: 1=first chunk (carries rows/cols/nnz + rowPtr), 2=binding block
//! follows rowPtr, 4=colIdx is DELTA-VARINT encoded (v0.3.22 DELTAIDX — see `delta_cols`).
//!
//! Cluster-binding metadata (chunked flag bit 2) is CAPTURED as of v0.3.15 (was parsed +
//! discarded): a bound matrix's batched-hebbian (type 5) reads resident cluster spike
//! state at the bound offsets instead of acking a stub.

const MAGIC_SPRS: &[u8; 4] = b"SPRS";

#[derive(Debug)]
pub enum Frame {
    Upload {
        req_id: u32,
        name: String,
        rows: u32,
        cols: u32,
        row_ptr: Vec<u32>,
        values: Vec<f32>,
        col_idx: Vec<u32>,
    },
    /// One chunk of a large matrix (type=4). The donor accumulates chunks until the last.
    Chunk {
        req_id: u32,
        name: String,
        chunk_seq: u32,
        total_chunks: u32,
        first: Option<ChunkFirst>,
        values_offset: u32,
        values: Vec<f32>,
        col_idx_offset: u32,
        col_idx: Vec<u32>,
    },
    Propagate { req_id: u32, name: String, pre: Vec<u32> },
    Hebbian { req_id: u32, name: String, pre: Vec<u32>, post: Vec<u32>, lr: f32 },
    BatchedHebbian { req_id: u32, ops: Vec<(String, f32)> },
    /// v0.3.13 binary teach patterns (types 7-9). These replace the ~153KB JSON
    /// write_spike_slice / write_current_slice / clear_spike_region frames whose
    /// serde_json parse on the single receive thread was the teach-drain
    /// bottleneck (fresh donor drained 19MB in seconds; during teach ~KB/s).
    /// Fire-and-forget: the JSON versions never acked and neither do these.
    WriteSpikeSlice { cluster: String, region: String, indices: Vec<u32> },
    WriteCurrentSlice { cluster: String, region: String, indices: Vec<u32>, values: Vec<f32>, psi: f32 },
    ClearSpikeRegion { cluster: String, region: String },
    /// v0.3.15 — re-execute the cached payload of the last (orig_type, name) frame.
    Repeat { req_id: u32, orig_type: u8, name: String },
    /// v0.3.16 — TEMPLATE current write: the server ships the group-tiled
    /// template (~KB) instead of the expanded (idx,val) pairs (measured at
    /// ~840KB per frame = 99.5% of all box→donor bytes at the 1.5M cortex).
    /// Expansion at receive reproduces the IDENTICAL write_current work item:
    /// dim d's value fills rows [row_start + d*group_size, +group_size),
    /// clipped at the region end; zero-valued dims are skipped (they read as
    /// 0 from the zero-then-scatter semantics anyway).
    WriteCurrentTemplate { cluster: String, region: String, row_start: u32, group_size: u32, values: Vec<f32>, psi: f32 },
    /// v0.3.17 — TEMPLATE SPIKE write (type 11): the t7 fix. The teach loop's
    /// tiled spike patterns are fully determined by {row_start, group_size,
    /// values} — the expanded t7 index list was ~3MB per sem-region frame at
    /// the 12M cortex (403MB in 12min, the last raw wire river). Expansion at
    /// receive reproduces the IDENTICAL write_spike work item: dim d with
    /// value > 0 sets spikes over rows [row_start + d*group_size, +group_size),
    /// clipped at the region end engine-side; non-positive dims are skipped.
    WriteSpikeTemplate { cluster: String, region: String, row_start: u32, group_size: u32, values: Vec<f32> },
}

/// Cluster-slice binding for a sparse matrix (chunk flags bit 2): the matrix's pre
/// spikes live in `src_cluster`'s spike buffer at [src_start..src_end] and its post
/// side in `dst_cluster`'s at [dst_start..dst_end] — offsets are cluster-absolute,
/// exactly the compute.html semantics.
#[derive(Debug, Clone)]
pub struct Binding {
    pub src_cluster: String,
    pub dst_cluster: String,
    pub src_start: u32,
    pub src_end: u32,
    pub dst_start: u32,
    pub dst_end: u32,
}

#[derive(Debug)]
pub struct ChunkFirst {
    pub rows: u32,
    pub cols: u32,
    pub nnz: u32,
    pub row_ptr: Vec<u32>,
    pub binding: Option<Binding>,
}

struct Reader<'a> {
    b: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(b: &'a [u8]) -> Self {
        Self { b, pos: 0 }
    }
    fn u8(&mut self) -> Option<u8> {
        let v = *self.b.get(self.pos)?;
        self.pos += 1;
        Some(v)
    }
    fn u16(&mut self) -> Option<u16> {
        let s = self.b.get(self.pos..self.pos + 2)?;
        self.pos += 2;
        Some(u16::from_le_bytes(s.try_into().ok()?))
    }
    fn u32(&mut self) -> Option<u32> {
        let s = self.b.get(self.pos..self.pos + 4)?;
        self.pos += 4;
        Some(u32::from_le_bytes(s.try_into().ok()?))
    }
    fn f32(&mut self) -> Option<f32> {
        Some(f32::from_bits(self.u32()?))
    }
    fn bytes(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.b.get(self.pos..self.pos + n)?;
        self.pos += n;
        Some(s)
    }
    fn align4(&mut self) {
        while self.pos % 4 != 0 {
            self.pos += 1;
        }
    }
    fn u32_vec(&mut self, n: usize) -> Option<Vec<u32>> {
        let mut v = Vec::with_capacity(n);
        for _ in 0..n {
            v.push(self.u32()?);
        }
        Some(v)
    }
    fn f32_vec(&mut self, n: usize) -> Option<Vec<f32>> {
        let mut v = Vec::with_capacity(n);
        for _ in 0..n {
            v.push(self.f32()?);
        }
        Some(v)
    }
    /// v0.3.22 DELTAIDX — LEB128 unsigned varint, bounded by `limit` so a truncated or
    /// corrupt stream returns None instead of walking off the end of the frame.
    fn varint(&mut self, limit: usize) -> Option<u64> {
        let mut result: u64 = 0;
        let mut shift: u32 = 0;
        loop {
            if self.pos >= limit {
                return None;
            }
            let b = *self.b.get(self.pos)?;
            self.pos += 1;
            result |= ((b & 0x7f) as u64) << shift;
            if b & 0x80 == 0 {
                break;
            }
            shift += 7;
            if shift > 63 {
                return None;
            }
        }
        Some(result)
    }
    /// v0.3.22 DELTAIDX — decode `n` column indices from a delta-varint stream of
    /// `byte_len` bytes. Mirrors the server's `_encodeDeltaColIdx` exactly: entry 0 is an
    /// UNSIGNED varint of the absolute index (chunks split mid-row, so a chunk cannot
    /// assume it starts at a row boundary); entries 1.. are ZIGZAG varints of the delta
    /// from the previous index (zigzag because a row boundary steps backwards). Lossless
    /// and exactly invertible — the reconstructed Vec<u32> is byte-identical to what the
    /// raw path would have produced.
    fn delta_cols(&mut self, n: usize, byte_len: usize) -> Option<Vec<u32>> {
        let end = self.pos.checked_add(byte_len)?;
        if end > self.b.len() {
            return None;
        }
        let mut out = Vec::with_capacity(n);
        let mut prev: i64 = 0;
        for i in 0..n {
            let rawv = self.varint(end)?;
            let v: i64 = if i == 0 {
                rawv as i64
            } else {
                // zigzag decode: even -> +n/2, odd -> -(n+1)/2
                let zz = ((rawv >> 1) as i64) ^ -((rawv & 1) as i64);
                prev.checked_add(zz)?
            };
            if v < 0 || v > u32::MAX as i64 {
                return None;
            }
            out.push(v as u32);
            prev = v;
        }
        // Skip to the declared end so any trailing padding cannot desync the reader.
        self.pos = end;
        Some(out)
    }
}

/// Decode an `SPRS` frame. Returns None if not a sparse frame or malformed.
pub fn decode(data: &[u8]) -> Option<Frame> {
    let mut r = Reader::new(data);
    if r.bytes(4)? != MAGIC_SPRS {
        return None;
    }
    let type_byte = r.u8()?;
    let req_id = r.u32()?;
    let name_len = r.u16()? as usize;
    let name = String::from_utf8_lossy(r.bytes(name_len)?).into_owned();
    r.align4();

    match type_byte {
        1 => {
            let rows = r.u32()?;
            let cols = r.u32()?;
            let nnz = r.u32()?;
            let row_ptr = r.u32_vec(rows as usize + 1)?;
            let values = r.f32_vec(nnz as usize)?;
            let col_idx = r.u32_vec(nnz as usize)?;
            Some(Frame::Upload { req_id, name, rows, cols, row_ptr, values, col_idx })
        }
        2 => {
            let pre_len = r.u32()? as usize;
            let pre = r.u32_vec(pre_len)?;
            Some(Frame::Propagate { req_id, name, pre })
        }
        3 => {
            let pre_len = r.u32()? as usize;
            let pre = r.u32_vec(pre_len)?;
            let post_len = r.u32()? as usize;
            let post = r.u32_vec(post_len)?;
            let lr = r.f32()?;
            Some(Frame::Hebbian { req_id, name, pre, post, lr })
        }
        4 => {
            let chunk_seq = r.u32()?;
            let total_chunks = r.u32()?;
            let flags = r.u32()?;
            let first = if flags & 1 != 0 {
                let rows = r.u32()?;
                let cols = r.u32()?;
                let nnz = r.u32()?;
                let row_ptr_len = r.u32()? as usize;
                let row_ptr = r.u32_vec(row_ptr_len)?;
                r.align4();
                // v0.3.15 — cluster-binding metadata is CAPTURED (used to be skipped):
                // it is what lets batched-hebbian run on resident cluster spike state.
                let binding = if flags & 2 != 0 {
                    let src_len = r.u16()? as usize;
                    let src_cluster = String::from_utf8_lossy(r.bytes(src_len)?).into_owned();
                    r.align4();
                    let dst_len = r.u16()? as usize;
                    let dst_cluster = String::from_utf8_lossy(r.bytes(dst_len)?).into_owned();
                    r.align4();
                    let (src_start, src_end, dst_start, dst_end) = (r.u32()?, r.u32()?, r.u32()?, r.u32()?);
                    Some(Binding { src_cluster, dst_cluster, src_start, src_end, dst_start, dst_end })
                } else {
                    None
                };
                Some(ChunkFirst { rows, cols, nnz, row_ptr, binding })
            } else {
                None
            };
            let values_offset = r.u32()?;
            let values_byte_len = r.u32()? as usize;
            let values = r.f32_vec(values_byte_len / 4)?;
            let col_idx_offset = r.u32()?;
            let col_idx_byte_len = r.u32()? as usize;
            // v0.3.22 DELTAIDX — flags bit 2 (value 4) means colIdx arrived delta-varint
            // encoded. colIdx is HALF the canonical payload (1373MB of 2792MB at the 12M
            // cortex) and the small-world topology makes 95% of consecutive deltas fit one
            // byte, so this is ~68% off colIdx / ~34% off the whole upload — measured, not
            // assumed. Entry count comes from the values slice: values and colIdx are 1:1
            // in CSR, so no extra count field was added and the header layout is unchanged.
            // An older donor never sees the flag and takes the raw path below, byte-identical.
            let col_idx = if flags & 4 != 0 {
                r.delta_cols(values.len(), col_idx_byte_len)?
            } else {
                r.u32_vec(col_idx_byte_len / 4)?
            };
            Some(Frame::Chunk { req_id, name, chunk_seq, total_chunks, first, values_offset, values, col_idx_offset, col_idx })
        }
        5 => {
            // header name is empty for batched; ops follow.
            let op_count = r.u16()? as usize;
            let _pad = r.u16()?;
            let mut ops = Vec::with_capacity(op_count);
            for _ in 0..op_count {
                let op_name_len = r.u16()? as usize;
                let _p = r.u16()?;
                let op_name = String::from_utf8_lossy(r.bytes(op_name_len)?).into_owned();
                r.align4();
                let lr = r.f32()?;
                ops.push((op_name, lr));
            }
            Some(Frame::BatchedHebbian { req_id, ops })
        }
        // v0.3.13 teach patterns: header name = "cluster/region".
        7 => {
            let (cluster, region) = split_cluster_region(&name)?;
            let count = r.u32()? as usize;
            let indices = r.u32_vec(count)?;
            Some(Frame::WriteSpikeSlice { cluster, region, indices })
        }
        8 => {
            let (cluster, region) = split_cluster_region(&name)?;
            let count = r.u32()? as usize;
            let indices = r.u32_vec(count)?;
            let vcount = r.u32()? as usize;
            let values = r.f32_vec(vcount)?;
            let psi = r.f32()?;
            Some(Frame::WriteCurrentSlice { cluster, region, indices, values, psi })
        }
        9 => {
            let (cluster, region) = split_cluster_region(&name)?;
            Some(Frame::ClearSpikeRegion { cluster, region })
        }
        // v0.3.16 — template current write: rowStart + groupSize + count + f32 values + psi.
        10 => {
            let (cluster, region) = split_cluster_region(&name)?;
            let row_start = r.u32()?;
            let group_size = r.u32()?.max(1);
            let count = r.u32()? as usize;
            let values = r.f32_vec(count)?;
            let psi = r.f32()?;
            Some(Frame::WriteCurrentTemplate { cluster, region, row_start, group_size, values, psi })
        }
        // v0.3.17 — template spike write: rowStart + groupSize + count + f32 values (no psi).
        11 => {
            let (cluster, region) = split_cluster_region(&name)?;
            let row_start = r.u32()?;
            let group_size = r.u32()?.max(1);
            let count = r.u32()? as usize;
            let values = r.f32_vec(count)?;
            Some(Frame::WriteSpikeTemplate { cluster, region, row_start, group_size, values })
        }
        // v0.3.15 — repeat: name = the original frame's name field, payload = origType.
        12 => {
            let orig_type = r.u8()?;
            Some(Frame::Repeat { req_id, orig_type, name })
        }
        _ => None,
    }
}

/// Split the header name of a type 7/8/9 frame into (cluster, region).
/// Region names never contain '/', so the FIRST '/' is the separator.
fn split_cluster_region(name: &str) -> Option<(String, String)> {
    let idx = name.find('/')?;
    let (c, r) = name.split_at(idx);
    if c.is_empty() || r.len() < 2 {
        return None;
    }
    Some((c.to_string(), r[1..].to_string()))
}

// ─── SPRR ack encoders ────────────────────────────────────────────

/// 9-byte ack for type=1/3/5: 'SPRR' | type | reqId(u32 @5).
pub fn ack_simple(type_byte: u8, req_id: u32) -> Vec<u8> {
    let mut v = Vec::with_capacity(9);
    v.extend_from_slice(b"SPRR");
    v.push(type_byte);
    v.extend_from_slice(&req_id.to_le_bytes());
    v
}

/// type=2 ack: 'SPRR' | 2 | pad(3) | reqId(u32 @8) | clen(u32 @12) | currents f32[@16].
pub fn ack_propagate(req_id: u32, currents: &[f32]) -> Vec<u8> {
    let mut v = Vec::with_capacity(16 + currents.len() * 4);
    v.extend_from_slice(b"SPRR");
    v.push(2);
    v.extend_from_slice(&[0u8, 0, 0]); // pad bytes 5..7
    v.extend_from_slice(&req_id.to_le_bytes()); // 8..11
    v.extend_from_slice(&(currents.len() as u32).to_le_bytes()); // 12..15
    for c in currents {
        v.extend_from_slice(&c.to_bits().to_le_bytes());
    }
    v
}

/// Round-trip self-check used by `--self-test`: encode a type=1 upload + decode it back.
pub fn self_check() -> Result<(), String> {
    // Build a type=1 SPRS frame for a tiny matrix and decode it.
    let name = "probe";
    let rows = 2u32;
    let cols = 2u32;
    let row_ptr = [0u32, 1, 2];
    let values = [1.5f32, 2.5];
    let col_idx = [0u32, 1];
    let mut f = Vec::new();
    f.extend_from_slice(b"SPRS");
    f.push(1);
    f.extend_from_slice(&7u32.to_le_bytes()); // reqId
    f.extend_from_slice(&(name.len() as u16).to_le_bytes());
    f.extend_from_slice(name.as_bytes());
    while f.len() % 4 != 0 {
        f.push(0);
    }
    f.extend_from_slice(&rows.to_le_bytes());
    f.extend_from_slice(&cols.to_le_bytes());
    f.extend_from_slice(&(values.len() as u32).to_le_bytes());
    for x in row_ptr {
        f.extend_from_slice(&x.to_le_bytes());
    }
    for x in values {
        f.extend_from_slice(&x.to_bits().to_le_bytes());
    }
    for x in col_idx {
        f.extend_from_slice(&x.to_le_bytes());
    }
    match decode(&f) {
        Some(Frame::Upload { req_id, name: n, rows: rr, values: v, col_idx: ci, .. }) => {
            if req_id == 7 && n == name && rr == rows && v == values && ci == col_idx {
                Ok(())
            } else {
                Err(format!("upload round-trip mismatch: req={req_id} name={n} rows={rr} v={v:?} ci={ci:?}"))
            }
        }
        other => Err(format!("decode returned unexpected: {other:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v0.3.22 DELTAIDX — CROSS-LANGUAGE PARITY. These bytes were produced by the SERVER's
    /// `_encodeDeltaColIdx` (server/brain-server/gpu.js), NOT by this file's own logic, so
    /// the test fails if either side's encoding drifts. The input deliberately exercises
    /// every branch: a leading zero, small positive deltas (the 70% local case), a
    /// long-range jump, a NEGATIVE delta (a CSR row boundary stepping backwards — the
    /// reason deltas are zigzagged), and a second long jump.
    ///
    /// This matters more than a typical unit test: a silent encode/decode mismatch would
    /// put learned weights on the WRONG SYNAPSES with no loud failure — right shape,
    /// successful upload, gates still run, every downstream measurement quietly worthless.
    #[test]
    fn delta_cols_matches_server_encoder() {
        let expected: Vec<u32> = vec![0, 3, 7, 8, 250, 11999999, 5, 6, 9, 4000000];
        let encoded: Vec<u8> = vec![
            0, 6, 8, 2, 228, 3, 138, 232, 184, 11, 243, 235, 184, 11, 2, 6, 238, 163, 232, 3,
        ];
        assert!(
            encoded.len() < expected.len() * 4,
            "delta stream must be smaller than the raw u32 stream"
        );
        let mut r = Reader::new(&encoded);
        let got = r
            .delta_cols(expected.len(), encoded.len())
            .expect("decode must succeed");
        assert_eq!(got, expected, "server-encoded delta stream must decode byte-exact");
        assert_eq!(r.pos, encoded.len(), "decoder must consume exactly the declared bytes");
    }

    /// A truncated stream must return None, never a partial or garbage Vec — a corrupt
    /// upload has to fail loudly rather than seed a donor with silently wrong topology.
    #[test]
    fn delta_cols_rejects_truncated_stream() {
        let encoded: Vec<u8> = vec![0, 6, 8, 2, 228];
        let mut r = Reader::new(&encoded);
        assert!(
            r.delta_cols(10, encoded.len()).is_none(),
            "truncated stream must decode to None"
        );
    }

    /// The raw path must remain byte-identical for donors/servers that never set flag 4.
    #[test]
    fn raw_col_idx_path_unchanged() {
        let cols: Vec<u32> = vec![5, 9, 12];
        let mut bytes = Vec::new();
        for c in &cols {
            bytes.extend_from_slice(&c.to_le_bytes());
        }
        let mut r = Reader::new(&bytes);
        assert_eq!(r.u32_vec(cols.len()).expect("raw decode"), cols);
    }
}
