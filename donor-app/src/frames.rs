//! Binary sparse-frame codec (M3). Decodes the server's `SPRS` frames and encodes the
//! donor's `SPRR` ack frames, byte-for-byte per the mapped spec. Header (all frames):
//!   'SPRS' | typeByte(1) | reqId(u32 LE) | nameLen(u16 LE) | name(UTF-8) | pad→4B align
//! Types: 1=upload, 2=propagate, 3=hebbian, 4=chunked-upload, 5=batched-hebbian.
//!
//! Cluster-binding metadata (chunked flag bit 2) is parsed but treated as standalone for
//! the MVP (propagate uses the carried preSpikes); cluster-slice binding is a refinement.

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
}

#[derive(Debug)]
pub struct ChunkFirst {
    pub rows: u32,
    pub cols: u32,
    pub nnz: u32,
    pub row_ptr: Vec<u32>,
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
                if flags & 2 != 0 {
                    // cluster-binding metadata — parse + skip (standalone for MVP).
                    let src_len = r.u16()? as usize;
                    let _src = r.bytes(src_len)?;
                    r.align4();
                    let dst_len = r.u16()? as usize;
                    let _dst = r.bytes(dst_len)?;
                    r.align4();
                    let _ = (r.u32()?, r.u32()?, r.u32()?, r.u32()?); // src/dst start/end
                }
                Some(ChunkFirst { rows, cols, nnz, row_ptr })
            } else {
                None
            };
            let values_offset = r.u32()?;
            let values_byte_len = r.u32()? as usize;
            let values = r.f32_vec(values_byte_len / 4)?;
            let col_idx_offset = r.u32()?;
            let col_idx_byte_len = r.u32()? as usize;
            let col_idx = r.u32_vec(col_idx_byte_len / 4)?;
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
        _ => None,
    }
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
