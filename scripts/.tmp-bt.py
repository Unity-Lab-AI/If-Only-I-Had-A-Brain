# -*- coding: utf-8 -*-

# ---------------------------------------------------------------- Cargo.toml
p = 'donor-app/Cargo.toml'
s = open(p, 'r', encoding='utf-8', newline='').read()
assert 'version = "0.3.11"' in s
s = s.replace('version = "0.3.11"', 'version = "0.3.13"', 1)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('Cargo.toml -> 0.3.13')

# ---------------------------------------------------------------- frames.rs
p = 'donor-app/src/frames.rs'
L = open(p, 'r', encoding='utf-8', newline='').readlines()

# doc line
i = [n for n, l in enumerate(L) if l.startswith('//! Types: 1=upload')][0]
L[i] = '//! Types: 1=upload, 2=propagate, 3=hebbian, 4=chunked-upload, 5=batched-hebbian,\n//! 7=write-spike-slice, 8=write-current-slice, 9=clear-spike-region (7-9: v0.3.13\n//! binary teach patterns - fire-and-forget, no ack; name field carries "cluster/region").\n'

# enum variants
j = [n for n, l in enumerate(L) if l.strip() == 'BatchedHebbian { req_id: u32, ops: Vec<(String, f32)> },'][0]
L[j] = '''    BatchedHebbian { req_id: u32, ops: Vec<(String, f32)> },
    /// v0.3.13 binary teach patterns (types 7-9). These replace the ~153KB JSON
    /// write_spike_slice / write_current_slice / clear_spike_region frames whose
    /// serde_json parse on the single receive thread was the teach-drain
    /// bottleneck (fresh donor drained 19MB in seconds; during teach ~KB/s).
    /// Fire-and-forget: the JSON versions never acked and neither do these.
    WriteSpikeSlice { cluster: String, region: String, indices: Vec<u32> },
    WriteCurrentSlice { cluster: String, region: String, indices: Vec<u32>, values: Vec<f32>, psi: f32 },
    ClearSpikeRegion { cluster: String, region: String },
'''

# decode arms - insert before `_ => None,`
k = [n for n, l in enumerate(L) if l.strip() == '_ => None,'][0]
L[k] = '''        // v0.3.13 teach patterns: header name = "cluster/region".
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
        _ => None,
'''

# helper fn after decode()
m = [n for n, l in enumerate(L) if l.strip().startswith('// ─── SPRR ack encoders')][0]
L[m] = '''/// Split the header name of a type 7/8/9 frame into (cluster, region).
/// Region names never contain '/', so the FIRST '/' is the separator.
fn split_cluster_region(name: &str) -> Option<(String, String)> {
    let idx = name.find('/')?;
    let (c, r) = name.split_at(idx);
    if c.is_empty() || r.len() < 2 {
        return None;
    }
    Some((c.to_string(), r[1..].to_string()))
}

''' + L[m]

open(p, 'w', encoding='utf-8', newline='').write(''.join(L))
print('frames.rs: variants + decode 7/8/9 + splitter')

# ---------------------------------------------------------------- donor.rs
p = 'donor-app/src/donor.rs'
L = open(p, 'r', encoding='utf-8', newline='').readlines()

# 1. binary receive routing
i = [n for n, l in enumerate(L) if l.strip() == 'Message::Binary(bytes) => {'][0]
assert 'frames::decode' in L[i + 1]
assert 'workq.push(Work::Frame(frame));' in L[i + 2], repr(L[i + 2])
L[i:i + 3] = ['''                    Message::Binary(bytes) => {
                        if let Some(frame) = frames::decode(&bytes) {
                            pending.fetch_add(1, Ordering::Relaxed);
                            // v0.3.13 binary teach patterns route straight onto the SAME
                            // Work items the JSON path produces - identical GPU behavior,
                            // minus the serde_json parse that was the drain bottleneck.
                            match frame {
                                Frame::WriteSpikeSlice { cluster, region, indices } => workq.push(Work::WriteSpike { cluster, region, indices }),
                                Frame::WriteCurrentSlice { cluster, region, indices, values, psi } => workq.push(Work::WriteCurrent { cluster, region, indices, values, psi }),
                                Frame::ClearSpikeRegion { cluster, region } => workq.push(Work::ClearSpike { cluster, region }),
                                other => workq.push(Work::Frame(other)),
                            }
                        }
''']

# 2. activity label match - add arms (compiler-required exhaustiveness)
L = ''.join(L)
a = '''                    Frame::BatchedHebbian { .. } => "batched-hebbian".to_string(),
'''
assert a in L
L = L.replace(a, a + '''                    // Routed to Work::WriteSpike/etc at receive; arms exist for exhaustiveness.
                    Frame::WriteSpikeSlice { cluster, region, .. } => format!("write_spike(bin) {cluster}/{region}"),
                    Frame::WriteCurrentSlice { cluster, region, .. } => format!("write_current(bin) {cluster}/{region}"),
                    Frame::ClearSpikeRegion { cluster, region } => format!("clear_spike(bin) {cluster}/{region}"),
''', 1)

# 3. handle_frame - defensive arms with identical engine behavior, no ack
b = '''        Frame::BatchedHebbian { req_id, ops: _ } => {'''
assert b in L
L = L.replace(b, '''        // v0.3.13 teach patterns are routed to Work items at receive and normally
        // never reach here; these arms keep the match exhaustive and, if one DOES
        // arrive, perform the identical engine op. Fire-and-forget: no ack.
        Frame::WriteSpikeSlice { cluster, region, indices } => {
            let _ = engine.write_spike_slice(&cluster, &region, &indices);
            None
        }
        Frame::WriteCurrentSlice { cluster, region, indices, values, psi } => {
            let _ = engine.write_current_slice(&cluster, &region, &indices, &values, psi);
            None
        }
        Frame::ClearSpikeRegion { cluster, region } => {
            let _ = engine.clear_spike_region(&cluster, &region);
            None
        }
        Frame::BatchedHebbian { req_id, ops: _ } => {''', 1)
open(p, 'w', encoding='utf-8', newline='').write(L)
print('donor.rs: routing + label arms + defensive handlers')

# ---------------------------------------------------------------- gpu.js
p = 'server/brain-server/gpu.js'
L = open(p, 'r', encoding='utf-8', newline='').readlines()

# helper before _gpuWriteCortexSpikeSlice
i = [n for n, l in enumerate(L) if l.strip() == '_gpuWriteCortexSpikeSlice(regionName, sparseIndices) {'][0]
# back up to the docstring start for this method
d = i
while not L[d].strip().startswith('/**'):
    d -= 1

HELPER = '''  /**
   * v0.3.13 - does the PRIMARY donor speak binary teach frames (types 7/8/9)?
   * Gated on the appVersion the donor announced at gpu_register (stored as
   * client.donorAppVersion by the register handler). Browser donors report
   * 'browser' and stay on JSON until the register handler stores an explicit
   * capability flag. Cached per socket - one parse per donor session.
   */
  _donorBinTeach() {
    const ws = this._gpuClient;
    if (!ws) return false;
    if (this._binTeachWs === ws) return this._binTeachOk === true;
    this._binTeachWs = ws;
    this._binTeachOk = false;
    try {
      const c = (this.clients && this.clients.get) ? this.clients.get(ws) : null;
      const v = (c && c.donorAppVersion || '').toString().trim();
      const m = v.match(/^(\\d+)\\.(\\d+)\\.(\\d+)/);
      if (m) {
        const num = (+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3]);
        this._binTeachOk = num >= 3013; // 0.3.13
      }
    } catch { this._binTeachOk = false; }
    return this._binTeachOk === true;
  },

'''
L[d:d] = [HELPER]
open(p, 'w', encoding='utf-8', newline='').write(''.join(L).replace('\\r\\n', '\\n'))
print('gpu.js: _donorBinTeach helper inserted')

# re-load and swap the three sender bodies
src = open(p, 'r', encoding='utf-8', newline='').read()

a = '''    const json = JSON.stringify({
      type: 'write_spike_slice',
      clusterName: 'cortex',
      regionName,
      sparseIndices: arr,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)
    this._mirrorCortexWriteToReplicas(json);   // DF.7 — keep replicas' resident state in sync (flag-gated)'''
assert a in src
src = src.replace(a, '''    // v0.3.13 - binary teach frame (type 7) when the donor speaks it: packed
    // u32 indices instead of a JSON integer array. Same lane, same gating,
    // ~3x fewer bytes and no serde_json parse on the donor's receive thread
    // (the measured teach-drain bottleneck). reqId 0: fire-and-forget, no ack.
    if (this._donorBinTeach()) {
      const hdr = this._encodeSparseHeader(7, 0, `cortex/${regionName}`);
      const meta = Buffer.alloc(4);
      meta.writeUInt32LE(arr.length, 0);
      const ta = Uint32Array.from(arr);
      const payload = Buffer.concat([hdr, meta, Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)]);
      this._donorPatternSendGated(payload);
      // Replica mirror stays JSON-only: replicas negotiate their own caps when
      // DF.7 fanout revives; a binary mirror to an unknown replica would be
      // dropped unparsed. Fanout is currently flag-gated off.
      return;
    }
    const json = JSON.stringify({
      type: 'write_spike_slice',
      clusterName: 'cortex',
      regionName,
      sparseIndices: arr,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)
    this._mirrorCortexWriteToReplicas(json);   // DF.7 — keep replicas' resident state in sync (flag-gated)''', 1)

b = '''    const json = JSON.stringify({
      type: 'write_current_slice',
      clusterName: 'cortex',
      regionName,
      sparseIndices: idx,
      sparseValues: val,
      psi: this.psi ?? 0,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)
    this._mirrorCortexWriteToReplicas(json);   // DF.7 — mirror to replicas (flag-gated)'''
assert b in src
src = src.replace(b, '''    // v0.3.13 - binary teach frame (type 8): u32 indices + f32 values + f32 psi.
    if (this._donorBinTeach()) {
      const hdr = this._encodeSparseHeader(8, 0, `cortex/${regionName}`);
      const meta = Buffer.alloc(4);
      meta.writeUInt32LE(idx.length, 0);
      const ti = Uint32Array.from(idx);
      const vmeta = Buffer.alloc(4);
      vmeta.writeUInt32LE(val.length, 0);
      const tv = Float32Array.from(val);
      const psiBuf = Buffer.alloc(4);
      psiBuf.writeFloatLE(this.psi ?? 0, 0);
      const payload = Buffer.concat([
        hdr, meta, Buffer.from(ti.buffer, ti.byteOffset, ti.byteLength),
        vmeta, Buffer.from(tv.buffer, tv.byteOffset, tv.byteLength), psiBuf,
      ]);
      this._donorPatternSendGated(payload);
      return; // replica mirror stays JSON-only (see type-7 note)
    }
    const json = JSON.stringify({
      type: 'write_current_slice',
      clusterName: 'cortex',
      regionName,
      sparseIndices: idx,
      sparseValues: val,
      psi: this.psi ?? 0,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)
    this._mirrorCortexWriteToReplicas(json);   // DF.7 — mirror to replicas (flag-gated)''', 1)

c = '''    const json = JSON.stringify({
      type: 'clear_spike_region',
      clusterName: 'cortex',
      regionName,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)'''
assert c in src
src = src.replace(c, '''    // v0.3.13 - binary teach frame (type 9): header only, region in the name.
    if (this._donorBinTeach()) {
      const payload = this._encodeSparseHeader(9, 0, `cortex/${regionName}`);
      if (this._donorPatternSendGated(payload)) {
        // The clear is the first frame of every teach pattern - the group/stale
        // bookkeeping below runs identically for both encodings.
        this._patternLaneStale = false;
      }
      return;
    }
    const json = JSON.stringify({
      type: 'clear_spike_region',
      clusterName: 'cortex',
      regionName,
    });
    if (!this._donorPatternSendGated(json)) return;   // TU.28.1 — soft-cap gate (stream was unguarded)''', 1)

open(p, 'w', encoding='utf-8', newline='').write(src)
print('gpu.js: three senders binary-enabled')
