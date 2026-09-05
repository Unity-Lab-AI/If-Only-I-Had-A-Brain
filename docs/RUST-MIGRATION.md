# Rust Migration Guide — the coordinator (`server/`)

**Status:** planning document. **No Rust coordinator code exists yet** — the only
Rust in this repo is `donor-app/`, which predates this plan.
**✅ PHASE B0 IS DONE (2026-09-05).** `crates/unity-protocol` exists, a Cargo
workspace at the repo root makes `donor-app` a member depending on it by path,
and the donor builds (headless *and* the default gui+cuda release) with its four
frame tests passing and `--version` still reporting `0.3.36`. **Everything from
B1 onward is still plan.** See §9 for what the extraction actually cost.
**Written:** 2026-09-05
**Audience:** an engineer picking this up cold, with no prior context on this
repo.

Read [`docs/MEMORY-MAP.md`](MEMORY-MAP.md) first. It explains where the
coordinator's memory actually goes and records several plausible-but-wrong
models that cost real time. This document assumes it.

**How to use this document.** §1-4 are the survey: what moves, what stays, and
the contracts that cannot break. **§5 is the architecture** — workspace layout,
module boundaries, the separate-binary question, and minimum-downtime restart.
§6 is the list of memory fixes that must be carried across rather than
rediscovered. §7 is the landmines. §8-9 are how to start.

⚠ **The single most important paragraph in this file is the "what a rewrite will
NOT fix" note at the end of §1.** Read it before committing anyone's time.

---

## 1. What is being rewritten, and what is not

The system has three parts. Only one of them is being rewritten.

| Part | Language | Lines | Rewrite? |
|---|---|---|---|
| **Coordinator** (`server/`) | JavaScript (CommonJS) | ~42,700 | **YES — this is the target** |
| **Brain model** (`js/brain/`) | JavaScript (ESM) | ~72,700 (of which ~31,600 is `curriculum.js` data) | **Partly — see §3** |
| **Donor app** (`donor-app/`) | Rust + WGSL | 8,457 + 424 | No. Already Rust. |
| **Web UI** (`html/`, `js/app.js`, `js/ui/`) | JavaScript | ~17,000 | **No. Stays JS, deliberately.** |

Total JS in the repo: **11.23 MB** across 208 files (9.29 MB excluding generated
bundles and vendored deps).

### Why Rust and not Go

Both were considered. Go is a perfectly reasonable choice for this workload and
would ship sooner — the CSR arrays are `[]float32`/`[]uint32`, pointer-free, so
Go's GC barely scans them, and the HTTP/WebSocket orchestration is Go's sweet
spot.

Rust wins here for two repo-specific reasons, not general ones:

1. **`donor-app/src/frames.rs` already defines the wire protocol.** A Rust
   coordinator *shares that crate* instead of reimplementing it. Today the
   protocol exists twice (Rust + JS) and has to be kept in sync by hand. So does
   the Rulkov neuron equation (`js/brain/gpu-compute.js` emits it as a WGSL
   string; `donor-app/src/shaders/lif.wgsl` restates it, with a comment saying
   it was "lifted from js/brain/gpu-compute.js to stay byte-compatible").
   Every duplicated definition is a drift risk.
2. **`mmap`.** The biggest remaining memory win (§6.2) was *rejected* in JS
   purely because Node has no native mmap and adding a build dependency to an
   unattended `npm install` on a shell-less box is a real hazard. In Rust it is
   `memmap2` and a few lines.

Adding Go would mean a third language, a third toolchain, and no shared crate.

### ⚠ What a rewrite will NOT fix

Be honest about this with whoever funds the work. The three memory faults found
on 2026-09-05 were **not** JavaScript problems:

- The 8.8 GiB was a dtype mismatch between a sizing estimator and an allocator.
  That bug ports to any language perfectly intact.
- The 11.7 GiB was `mktemp -d` under `PrivateTmp=true` (a shell/systemd issue).
- The event-loop starvation was cgroup contention from a deploy sharing the
  brain's memory budget.

A rewrite would have caught none of them. **Port the fixes (§6), do not assume
the language change delivers them.**

---

## 2. Recommended strategy: strangler, not big-bang

Do **not** attempt a single cutover. The coordinator holds the trained brain;
a bad cutover costs a multi-week curriculum walk.

Move one component at a time behind the existing protocol boundary. Suggested
order, chosen so each step is independently valuable and independently
revertable:

| Phase | Component | Why this order |
|---|---|---|
| 0 | Extract `donor-app/src/frames.rs` + `protocol.rs` into a shared `unity-protocol` crate | Zero behaviour change. Everything later depends on it. |
| 1 | **Weight store** (`SparseMatrix`, checkpoint save/load) | Where the memory pressure lives; where `mmap` pays; cleanest boundary (upload / readback / checkpoint). |
| 2 | **GPU dispatch + donor session** (`server/brain-server/gpu.js`, 5,690 lines) | Talks the protocol from phase 0; the single hottest path. |
| 3 | **State + persistence** (`state.js`, `memory.js`, sqlite stores) | `rusqlite` is a direct swap for `better-sqlite3`. |
| 4 | **HTTP control plane** (34 endpoints) | Mechanical; do it last so the dashboard keeps working throughout. |
| — | Curriculum, dictionary, chat, web UI | **Leave in JS.** Re-evaluate only if a measured problem appears. |

During phases 1-3 the JS coordinator remains the process that boots; the Rust
pieces run either in-process (via a Node native addon — *not recommended*) or,
preferably, as a **sidecar process** the JS talks to over a local socket. The
sidecar approach keeps the deploy story simple and lets you revert by not
starting the sidecar.

---

## 3. `js/brain/` — what is code and what is data

`js/brain/` is 72,700 lines but that number is misleading:

```
31,589  curriculum.js              <- DATA (lesson content) wearing a .js extension
 2,323  student-question-banks.js  <- DATA
 ~3,400 grade*-vocabulary.js,      <- DATA (3.37 MB total across vocab files)
        college*-vocabulary.js
```

**Before porting anything, extract the ~3.37 MB of vocabulary/curriculum content
to JSON or sqlite.** It is not logic, it should not be compiled, and it should
not be rewritten in Rust. This alone makes the remaining port dramatically
smaller and is worth doing *even if the Rust migration never happens*.

The genuine model logic worth porting:

| File | Lines | Notes |
|---|---|---|
| `cluster.js` | 5,261 | The brain's structure. **Note `requireGpuSubstrate` (line ~349): on a proxied brain the GPU is the ONE substrate — the CPU paths are gated off above 2M neurons.** Much of this file is a CPU implementation the deployed box never runs. |
| `sparse-matrix.js` | 1,565 | CSR. **Port this first** (phase 1). |
| `language-cortex.js` | 3,169 | |
| `cluster/hebbian.js`, `cluster/emit.js` | 4,106 | |
| `engine.js` | 1,973 | |
| `endocrine.js`, `drug-scheduler.js` | 3,305 | |
| `persistence.js` | 632 | Checkpoint format — see §5. |

⚠ **`gpu-compute.js` (2,456 lines) is mostly WGSL shader source in JS strings.**
Do not port it as logic. Its shaders should become `.wgsl` files shared with the
donor, which is exactly what `donor-app/src/shaders/` already did by hand.

---

## 4. The contracts that must not break

These are the interfaces where a mistake is expensive. A rewrite is only safe if
each is preserved byte-for-byte or migrated deliberately.

### 4.1 The binary wire protocol (`SPRS` frames)

Defined in `donor-app/src/frames.rs`. Magic `SPRS`, then `type_byte:u8`,
`req_id:u32`, `name_len:u16`, name bytes, then **`align4()`** padding, then a
per-type body.

Frame types on the Rust side:
`Upload`, `Propagate`, `PropagateBuckets`, `Hebbian`, `BatchedHebbian`,
`HebbianBoundMasked`, `PredictiveError`, `ClearSpikeRegion`,
`WriteCurrentSlice`, `WriteCurrentTemplate`, `WriteSpikeSlice`,
`WriteSpikeTemplate`, `Chunk`, `Repeat`.

JSON-level opcodes the coordinator sends (from `server/brain-server/gpu.js`):
`gpu_init`, `compute_request`, `compute_batch`, `hebbian_ranges`,
`rebind_sparse`, `readback_matrix_values`, `readback_matrix_checksum`,
`readback_letter_buckets`, `letter_surprise`, `clear_spike_region`,
`write_current_slice`, `write_spike_slice`, `mindspace_op`.

⚠ **Column indices are delta+zigzag varint encoded** (`frames.rs` ~line 200).
This is not a naive `u32` array. Get this wrong and matrices decode as garbage
that still *looks* like valid data.

⚠ **`align4()` after the name.** Trailing padding is skipped to the declared
end so it "cannot desync the reader". Preserve this.

⭐ Phase 0 exists precisely so this is written once and shared.

### 4.2 Weight checkpoint format

`WEIGHTS_FORMAT_VERSION = 6` (`server/brain-server.js:1234`). Files:
`brain-weights.bin` / `.json`, plus rotated `-v0..-v4` slots (CHECKROT keeps 3).

The version has been bumped for: word_motor unification (v3), langCortexSize
1.5M→12M (v4), the `brainstem` cluster being added (v5), and
`WORD_MOTOR_TARGET_LANG_CORTEX` 12M→20M (v6).

**A Rust rewrite MUST either read v6 or bump to v7 and force a fresh walk.**
Silently misreading a checkpoint is the worst available outcome — see the
`autoClearStaleState` note in §7.

### 4.3 Runtime state files

The coordinator owns these under `server/`. `deploy/self-update.sh` has an
`--exclude` list protecting them from the deploy's `rsync --delete`; **any new
file a Rust coordinator writes under its own directory must be added to that
list** or a deploy will eat it.

```
brain-weights.bin/.json (+ -v0..-v4)   community-tier.json
episodic-memory.db (+ -shm/-wal)        autoscale-settings.json
figure-queue.db (+ -shm/-wal)           auto-advance.json
conversations.json                      knob-defaults.json
identity-core.json                      lang-geometry.json
schemas.json                            operator-identity.json
brain-topology.json                     resource-config.json
.resume-marker.json                     brain-code-hash.json
.force-fresh                            .last-boot-reason.json
.loop-freeze.json                       deployed-build.json
```

### 4.4 HTTP surface — 34 endpoints

The dashboard is the operator's **only** control surface (no shell on the box).
Every endpoint must keep working. Notable ones:
`/update`, `/restart`, `/shutdown`, `/reset`, `/savererun`, `/rollback`,
`/resync`, `/checkpoint`, `/weights/{list,download,position}`, `/knob`,
`/knob-default`, `/autoscale`, `/milestone`, `/grade-advance`,
`/grade-signoff`, `/exam-answer`, `/sleep`, `/wake`, `/health`, `/diag/parity`.

⚠ Auth model: `UAL_PROXY_AUTH=1` on deployed boxes means admin is gated on a
proxy-vouched `X-UAL-User` header. nginx strips client-supplied values on the
public path. `requireLoopback()` rejects header-less loopback POSTs — this is
why `self-update.sh` sends `X-UAL-User` on its loopback `/restart` fallback.
Reproduce this exactly or the Update button breaks in a way that looks like
"the button does nothing".

### 4.5 Dependency swaps

| Node | Rust | Notes |
|---|---|---|
| `better-sqlite3` | `rusqlite` (bundled feature) | Direct swap. Used by episodic memory, visual memory, figure queue, teach ledger. |
| `ws` | `tokio-tungstenite` | Donor app already uses it (`0.24`, `native-tls`). |
| `node-fetch` | `reqwest` | |
| `jpeg-js`, `pngjs` | `image` | |
| `onnxruntime-web` | `ort` | Only if the voice/vision path is ported; consider leaving in JS. |
| `wordnet-db` | data file, not a port | |
| — | `memmap2` | **New.** This is the point (§6.2). |

---

## 5. Suggested crate layout

### 5.1 Workspace layout

A single Cargo workspace at the repo root, so `donor-app` and the coordinator
share crates instead of maintaining two copies of the same definitions.

```
Cargo.toml                  # [workspace] members = [...]
crates/
  unity-protocol/           # SPRS frames, opcodes, wire types.  SHARED with donor-app.
  unity-weights/            # CSR SparseMatrix, checkpoint I/O, mmap store
  unity-sizing/             # the budget/tier allocator (see §7 landmines)
  unity-donor/              # donor sessions, dispatch, readback, health
  unity-state/              # sqlite stores, resume marker, boot reason, .force-fresh
  unity-deploy/             # self-update: staging, flock, cgroup scope, local-repo discovery
  unity-http/               # the 34 endpoints, auth model, static serving
  unity-coordinator/        # the binary; wires the above together
donor-app/                  # existing; switches to depend on unity-protocol
```

⚠ **`unity-sizing` is deliberately its own crate.** Every catastrophic weight
loss in this project's history traces to a sizing disagreement between two
places that each thought they were authoritative (§7). Isolating it means the
neuron-count arithmetic has exactly one home and can be unit-tested against
fixed inputs without booting anything.

### 5.2 Module responsibilities and boundaries

| Crate | Owns | Must NOT own |
|---|---|---|
| `unity-protocol` | frame encode/decode, opcode enums, version negotiation | any I/O, any socket |
| `unity-weights` | CSR layout, `Weight = f32`, checkpoint format + version, mmap/free-restream | knowing what a donor is |
| `unity-sizing` | tier ladder, budget arithmetic, `BYTES_PER_NNZ` consumption | reading files, env fallbacks scattered inline |
| `unity-donor` | WebSocket sessions, upload/readback lifecycle, `_gpuBound` state | HTTP routing, checkpoint policy |
| `unity-state` | sqlite, markers, boot-reason history, flag files | business logic about *when* to wipe |
| `unity-deploy` | fetch, stage, lock, cgroup, restart escalation | anything about brains |
| `unity-http` | routing, auth, request/response shapes | direct weight or donor mutation (call the crates) |

⭐ The single most valuable boundary is **`unity-weights` not knowing what a
donor is.** Today `gpu.js` (5,702 lines) mixes transport, weight lifetime and
checkpoint policy, which is exactly why a dtype change (§6.1) could silently
break persistence in a file nobody associated with dtypes.

### 5.3 The separate-binaries idea, and where it pays

Splitting into independently built and deployed binaries is worth doing, but
**only along boundaries that already exist in the runtime.** The two that do:

**1. `unity-deploy` as its own binary — do this first, it is the clear win.**
It is already a separate process (`self-update.sh` spawned detached), already
needs its own cgroup (§6.4), and is the thing most likely to change while the
brain must keep running. As a standalone binary:
- it is a few hundred KB, so fetching and atomically replacing it is instant;
- **it solves SELFFIRST properly.** The shell version must re-exec itself
  mid-run to pick up its own fix (see the SELFFIRST block in `self-update.sh`,
  and the byte-offset trap it documents). A separate binary is simply replaced
  by rename and the *next* invocation is the new one — no re-exec, no
  self-modification hazard, no partially-read script.
- it can be version-checked (`unity-deploy --version`) before being trusted.

**2. `unity-coordinator` stays one binary.** Do **not** split the brain across
processes to chase hot-reload. The weights are multi-GB and live in this
process's address space; moving them across a process boundary means either
copying gigabytes or building shared-memory plumbing, and the whole point of
§6.2 is to *stop* moving those bytes around.

### 5.4 Minimal-downtime restart — what actually works here

The goal is real, but the usual "hot reload a module" answer does not fit a
process whose state is 4-8 GB of weights. Three options, honestly priced:

**(a) Faster cold restart — the cheapest real win.** Boot time today is
dominated by loading GloVe (1.04 GB, streamed line-by-line) and rebuilding the
CSR. Measured on the box: she is unreachable for roughly 30-60 s after restart,
and the event loop logs `RECOVERED after 32162ms`. In Rust:
- memory-map the checkpoint instead of parsing it (§6.2) — the weights become
  available without a decode pass;
- store GloVe in a binary format (`f32` matrix + an index) instead of parsing
  text every boot.
Target: seconds, not a minute. **This alone probably satisfies "minimal
downtime" without any hot-restart machinery.**

**(b) Socket handover (`SO_REUSEPORT` / systemd socket activation).** The new
process binds before the old one exits, so no connection is refused during the
swap. Donors reconnect to the new process, which they already handle (donor
reconnect is an existing, tested path). This is a genuine improvement and is
**independent of the weights problem** — worth doing after (a).

**(c) True zero-downtime weight handover.** The new process mmaps the same
checkpoint file the old one was using, so both see identical bytes with no copy,
and the old process exits once the new one is serving. This is the only design
where multi-GB state survives a restart without a re-read — and it falls out of
§6.2 almost for free, because mmap is already the plan.

⚠ **What is NOT worth building: dynamic module reloading (`dlopen`, hot-swapped
`.so`).** Rust's ABI is unstable, the failure modes are silent memory
corruption rather than a clean error, and this system's entire logging
philosophy exists because *silent* failures are the expensive kind. The
restart-with-handover path in (c) gets the same benefit with a failure mode you
can see.

### 5.5 Build and deploy sequence

```
cargo build --release --workspace
# binaries: target/release/unity-coordinator, target/release/unity-deploy
```

Deploy, mirroring the discipline already in `self-update.sh`:
1. fetch new binaries to `$BACKEND_DIR/.staging` (disk, never tmpfs — §6.3);
2. verify: `<binary> --version` and `--self-test` **before** trusting either;
3. install by **`rename(2)`**, never by writing over the live path;
4. restart via the socket-handover path in 5.4(b).

⛔ **Step 3 is not stylistic.** The SELFFIRST block documents a reproduced
failure where overwriting a *running* file in place made it execute corrupted
content. A binary is mmap'd by the kernel, so in-place overwrite is worse than
for a script: it can `SIGBUS` a running process. `mv` swaps the directory entry
and leaves the running process on its original inode.

⭐ Keep `deploy/self-update.sh` working throughout the migration. It is the only
thing standing between the operator and a box he cannot reach; it should be
retired only when `unity-deploy` has done a real deploy on a real box.

### 5.6 Suggested phase order

| Phase | Deliverable | Risk | Independently useful? |
|---|---|---|---|
| 0 | `unity-protocol` extracted; `donor-app` depends on it | none (no behaviour change) | yes — kills the duplicate protocol |
| 1 | `unity-deploy` binary, replacing the shell script | low — separate process, revert by not installing | yes — solves SELFFIRST properly |
| 2 | `unity-weights` + mmap/free-restream, called from JS via a sidecar | medium | yes — the memory win |
| 3 | `unity-donor` — dispatch and readback | medium-high — hottest path | yes — the CPU win |
| 4 | `unity-state`, `unity-sizing` | medium | yes — one home for the wipe-causing arithmetic |
| 5 | `unity-http` + `unity-coordinator`; JS coordinator retired | high | the cutover |

⚠ Phases 2-4 are where a mistake costs a walk. Every one of them should ship
behind a flag with the JS path intact, so a bad boot is one restart from the old
behaviour.

---

## 6. Memory improvements to port — DO NOT LOSE THESE

All four were found and fixed on 2026-09-05. Full detail and evidence in
[`MEMORY-MAP.md`](MEMORY-MAP.md).

### 6.1 WEIGHTPREC — CSR values are `f32`, and the estimator must import it

**The bug:** `server/brain-server.js` budgeted the entire brain at
`BYTES_PER_NNZ = 8` ("Float32 value + Uint32 colIdx") while
`js/brain/sparse-matrix.js` allocated `new Float64Array(...)` — a real cost of
12 B/nnz. **Every sizing decision was made against a footprint 1.5x smaller than
what was allocated.** The same file already contradicted itself: the WMB comment
priced it correctly at `nnz × 12B`.

**In Rust:**

```rust
pub type Weight = f32;
pub const BYTES_PER_NNZ: usize =
    std::mem::size_of::<Weight>() + std::mem::size_of::<u32>();  // 8
```

⭐ **The estimator must derive its constant from the allocator's type, never
restate it.** In JS this is now `await import(...)`; in Rust make it
`size_of::<Weight>()` so the two *cannot* drift. This is the single most
important structural lesson from that bug.

⛔⛔ **AND THE SECOND LESSON, WHICH COST MORE: THE JS FIX REACHED 5 OF 12
ALLOCATION SITES.** Completed 2026-09-05 — see `MEMORY-MAP.md`. `initTopographic`
and `initSmallWorld` (which build the **intra** matrix, the entire reason the bug
was being chased) plus `fromDense` and the three rebuild paths — `prune`,
`pruneTopKPerRow`, `grow` — all still allocated `Float64Array`. The rebuild paths
were the nastier half: they widened a correct matrix **back** on first use, and
one of them runs during the curriculum walk, so the footprint drifted silently
over days.

⭐ **Rust makes this class of bug unrepresentable, and that is a real argument
for the port.** `pub type Weight = f32` used consistently means there is no
second place to state the type — `Vec<Weight>` in every constructor, and a stray
`Vec<f64>` is a compile error, not a matrix that quietly disagrees with its
siblings. **This is the strongest concrete case in this document for the
rewrite:** the JS fix needed twelve correct edits and a harness that reads back
`values.constructor.name` per code path; the Rust equivalent needs one `type`
alias.

⛔ **CARRY THE ON-DISK FORMAT VERSION ACROSS — it is separate from
`WEIGHTS_FORMAT_VERSION`.** The `UBWT` checkpoint header now holds
`BIN_FORMAT_VERSION` (v1 = f64 values, v2 = f32). Bumping the *brain* format
version does **not** gate the binary reader; conflating them means a file read at
the wrong width, and that misaligns every section after the first **without
raising a parse error**. Two more rules learned by measurement:

- **Derive the write width from the array, not a constant.** `Buffer.from(buf,
  off, len)` *throws* `ERR_BUFFER_OUT_OF_BOUNDS` when `len` overruns — it does
  not clamp — so a stale width aborts the save entirely, and an aborted save
  falls back to the previous checkpoint and loses everything since. In Rust the
  same discipline is `nnz * size_of::<Weight>()`, never a literal.
- **Read old versions, do not refuse them.** A v1 file is a valid f64 checkpoint
  holding real training; the loader picks the array type from the version it
  finds and the apply step converts to the live weight type. Refusing would
  discard a walk to avoid one array copy.

**Mixed precision boundary — deliberate, do not "tidy":**
- **Storage** `f32`.
- **Accumulation** `f64`. In JS this is implicit (`let sum = 0` is a double).
  **In Rust it is NOT implicit — you must write it:**

```rust
let mut sum: f64 = 0.0;                       // NOT f32
for k in row_start..row_end {
    sum += values[k] as f64 * spikes[col_idx[k] as usize] as f64;
}
currents[i] = sum;                            // Vec<f64>
```

⛔ Writing `let mut sum: f32` here is a real numerical regression: at fanout 300
an f32 accumulator loses roughly half its significant digits to cancellation,
and Oja/Hebbian updates read these currents. The asymmetry is the point —
storage is cheap to shrink, summation is not. LIF state (`voltages`,
`motorChannels`) is integrator state and stays `f64` too.

⚠ The **donors** are `f32` end to end and cannot be otherwise — WGSL has no f64
storage type at all (`synapse_propagate.wgsl` binds `array<f32>`, accumulates
`var sum: f32`; `frames.rs` takes `values: Vec<f32>`). The f64 rule is about the
*coordinator's* CPU path only.

**Measured cost of f32 storage** at the real fanout-300 geometry
(`tools/weight-precision-probe.mjs`): relative RMS error 2.7e-8, SNR 151.4 dB,
**0 threshold flips in 20,000 neurons**; among the 18,398 rows carrying real
signal, max relative error 8.1e-7 with none above 1e-6.

⚠ **Probe trap — reproduce this test correctly.** Building the f64 "reference"
by *widening* an already-f32 array measures exactly zero deviation *by
construction*. That is a tautology, not a pass. Draw at f64 and round a copy
**down**.

⭐ **Free bonus already realised:** `gpu.js:2541` is
`matrix.values instanceof Float32Array ? matrix.values : new Float32Array(...)`.
Before the fix that ternary *always* took the right branch, allocating a fresh
full-size copy (~2.68 GiB for the intra matrix) on **every** upload. A Rust port
holding `Vec<f32>` gets the zero-copy path structurally.

### 6.2 The mmap that JS could not have — build this in Rust

**Rejected in JS** because Node has no native mmap and a native addon on an
unattended `npm install` (shell-less box) is a hazard. **This is a headline
reason to move to Rust.**

The language cortex CSR master copy is **4.18 GiB** after WEIGHTPREC and is
**cold** on the coordinator: written at init, read on donor upload, updated on
an **hourly** readback. Every CPU compute path is gated off above 2M neurons and
the cortex is pinned at 12M.

Two designs, either acceptable:

- **`memmap2`** — file-backed `&[f32]` / `&mut [f32]` over the checkpoint.
  Pages become **evictable**: under pressure the kernel drops clean pages
  instead of stalling. Anonymous pages with a full swap (which is what the box
  had — swap 99.99% full) *cannot* be reclaimed, which is why PSI hit 51.3.
- **Free-and-restream** — drop the CPU arrays for `_gpuBound` matrices
  (`gpu.js:5624` already sets this flag; `sparse-matrix.js:744` already warns
  about "GPU-bound with CPU arrays freed") and re-read from checkpoint on
  demand. ~1.3 s for the full 4.23 GiB at the box's measured 3248 MiB/s, against
  a donor upload that takes far longer on the wire anyway.

⚠ Open questions either design must answer:
- what re-materialises the arrays, and who blocks while it happens;
- freeing must be **impossible mid-readback** —
  `refreshCheckpointFromDonor` warns that a partial transfer "leaves
  `matrix.values` a mix of old-CPU and new-GPU rows", and a checkpoint written
  from that is "a third brain";
- what happens when the last donor disconnects and no CPU copy exists.
  `cluster.js:349` says a proxied brain *requires* its proxy, so this may
  already be correct — confirm, do not assume.

⚠ Benchmark trap: timing a write of an untouched `Buffer::allocUnsafe`-style
buffer measures nothing (682 GiB/s observed) because the pages are sparse and
the write is elided. Fill with real data; prefer the box's measured disk rate.

### 6.3 STAGEDISK / ONEPRESS — the deploy script

Already fixed in `deploy/self-update.sh` and **language-independent** — it
carries over unchanged. Keep it. Summary of what it does and why:

- `TMPDIR` **exported** to `$BACKEND_DIR/.staging` (disk). Under
  `PrivateTmp=true` the service's `/tmp` is a **tmpfs = RAM**; ~11.7 GiB of the
  box's 31 GiB was one staged clone. tmpfs pages are *unreclaimable*.
- `flock` making presses mutually exclusive (three concurrent presses were
  observed, all `rsync --delete`-ing into the same destination).
- `.staging/` and `.self-update.lock` on the overlay's `--exclude` list.
- `FTMP` in the `EXIT` trap so aborts don't leak 12 GiB.

⛔ **Trap: `kill -9` does not release an `flock`.** Children (rsync, git, a
watchdog's `sleep`) inherit fd 9 and the kernel holds the lock until the last
holder closes it. The first version left a SIGKILLed press holding the lock
forever — every later press printed REFUSED, leaving a permanently dead Update
button for an operator with no shell. The lock file now carries the owner PID so
a refusal distinguishes "really running" from "stale, break it and proceed".

### 6.4 OWNCGROUP — the deploy gets its own memory budget

`spawn(..., {detached: true})` starts a new **session**, not a new **cgroup**.
The deploy inherited `unity-brain.service`'s `MemoryHigh=20G`, so every heavy
thing it did was charged to the brain and the kernel throttled the whole cgroup,
node included. Root cause of three separate incidents.

The equivalent in Rust is the same `systemd-run` invocation. **Port the exact
flags** — each was found by failure:

```
systemd-run --user --scope --collect --quiet --no-ask-password \
  --unit=unity-brain-selfupdate-<ts> \
  --property=MemoryMax=2G \
  --property=IOWeight=10 \
  --property=CPUWeight=10 \
  bash <script>
```

⛔ **`--user` is mandatory.** A bare `--scope` targets the *system* manager and
prompts for a password via polkit. From the box (`User=unity`,
`NoNewPrivileges=true`, spawned from an HTTP handler with no terminal) the
prompt asks nobody and the press hangs or no-ops.
⛔ **`--no-ask-password` is a permanent interlock.** Never remove it.
⛔ **`IOSchedulingClass=idle` and `MemoryAccounting=true` are INVALID here.**
The first is ionice's syscall interface, not a unit property (cgroup-v2 spelling
is `IOWeight`); the second returns "Access denied" on a transient scope. A
rejected property means the unit never starts — the press printed "deploy
spawned" and deployed **nothing**. Probe any new property first:
`systemd-run --user --scope --collect --quiet --unit=probe-$RANDOM --property='X=y' true`
(silence = accepted).
⛔ **Two failure modes need two handlers.** A missing binary fails one way
(async error); a *present-but-refusing* `systemd-run` succeeds at spawn, never
errors, and exits non-zero having started nothing. Handle both, or the Update
button silently does nothing.

⭐ This is also a **precondition for 6.2**: once weights are file-backed, an
unbounded rsync in the same cgroup would evict them through page-cache pressure
alone — the same failure with a new mechanism.

### 6.5 SELFFIRST — the updater must update itself before it acts

Shipped in `deploy/self-update.sh` on 2026-09-05 and **must be preserved by
`unity-deploy`**, because it is the reason a deploy fix can ever take effect on
the press that delivers it.

The problem: the script overlays the repo (including itself) partway down, but
the staging decision, the lock and the data-repo discovery have already run. So
a fix to any of those lands on disk during press N and only works on press N+1.
This bit twice in one day — the press that delivered STAGEDISK still staged
12 GB into tmpfs, and the press that delivered BWLOCAL still cloned over SSH.
Both were correct code behaving exactly as written.

The shell fix fetches just that one file, validates it (`bash -n` plus
`--self-test`), installs it by **rename**, and `exec`s it.

⛔⛔ **THE TRAP, REPRODUCED BEFORE RELYING ON IT: bash reads a script
incrementally by BYTE OFFSET while running.** Overwriting it in place (`cp`,
`cat >`) keeps the same inode, so the running shell's next read lands at its old
offset inside the *new* content:

```
line A (original)
victim.sh: line 3: line B (NEW) — ...: command not found
line C (NEW)
```

It skipped a line and executed a fragment of another as a command. `mv -f`
replaces the directory entry and leaves the running process on its original
inode, which it holds open until exit.

⭐ **A Rust `unity-deploy` binary makes this structurally simpler** — replace by
rename, and the *next* invocation is the new one; no re-exec and no
self-modification hazard. But the rename discipline becomes *more* critical, not
less: a running binary is mmap'd by the kernel, so an in-place overwrite can
`SIGBUS` the running process rather than merely confusing it.

⚠ Keep the validate-before-trust step. `--self-test` must remain the **first**
executable statement, before any deploy work, or validating a candidate would
itself be a deploy — from an unvalidated file, outside the lock, with no staging
set up.

---

## 7. Landmines specific to this system

Things that will bite a newcomer regardless of language.

- **`autoClearStaleState` wipes trained weights on a size/format mismatch.**
  A Rust coordinator that computes a *slightly* different neuron count than the
  saved checkpoint will silently wipe a multi-week walk. It happened before
  (2026-07-08) from a deploy deleting `community-tier.json`.
- **`.force-fresh` beats everything.** The `/update` handler writes it *before*
  spawning the deploy. If it exists, the next restart from **any** cause wipes
  weights, and `DREAM_KEEP_STATE=1` does not protect you. Check for it before
  any manual restart.
- **`/ctl/status` checks that the port is OPEN, not that it ANSWERS.** During
  the 2026-09-04 starvation the unit was `active`, port 7525 was LISTENING, and
  status said "online and serving" while curl timed out at 20s. Any health
  check ported to Rust should assert on a *response*, not a socket.
- **`deploy/dropins/10-pin-brain-size.conf` is dead code.** It sets
  `DREAM_DONOR_FIT_MB=4096` to pin the size, but the tier branch is tested
  *before* the donor-fit branch and self-seeding writes `community-tier.json` on
  every deployed boot — so a tier always exists and donor-fit is unreachable.
  Only `DREAM_BRAIN_BUDGET_MB` beats the tier path. Do not trust that file.
- **SELF-SEEDING BOOT sizes from an *assumed* donor**, not a connected one:
  `donorBaselineMB` default 16384 → clears tier 3 → 357M neurons, on a box with
  no GPU and possibly no donors. Decide deliberately whether to keep this.
- **The operator has no shell.** Every failure must be legible from the
  dashboard. A silent no-op is the most expensive failure mode this system has;
  the JS is full of hard-won logging that exists for exactly this reason. Port
  the *intent*, not just the code.
- **`server/package.json` has no `type` field** (CommonJS) while the root is
  `"type": "module"` (ESM). `require()` of a `js/brain/*.js` module throws
  `ERR_REQUIRE_ESM` at runtime — inside the boot's language init that is a crash
  loop under `Restart=always`, not an error message. Irrelevant post-Rust, but
  it will bite during any hybrid phase.

---

## 8. Definition of done, per phase

Each phase should be able to state:

1. **Parity** — the JS and Rust implementations produce identical output for
   the same input. For the protocol, byte-identical frames. For weights, a
   checkpoint the other side can load.
2. **Memory measured, not assumed** — RSS/PSS before and after, plus cgroup
   `MemoryCurrent`. ⚠ `ps rss` looks innocent while page cache pins a cgroup;
   read `memory.stat`.
3. **Revertable** — the JS path still boots if the Rust sidecar is not running.
4. **Deploy-safe** — any new state file added to the `--exclude` list in
   `deploy/self-update.sh`.
5. **A fresh walk budgeted** if the weight format changed.

---

## 9. Suggested first task

### ✅ DONE 2026-09-05 — and it was not free. Read this before B1.

Phase 0. Extract `donor-app/src/frames.rs` and `protocol.rs` into a
`unity-protocol` crate, have `donor-app` depend on it, and confirm the donor
still builds and connects. Zero behaviour change, no risk to the brain, and it
establishes the shared-contract pattern everything else relies on.

**What shipped:** `crates/unity-protocol` (deps: `serde`, `serde_json` — nothing
else, per the §5.2 boundary), a `[workspace]` root, `donor-app` as a member.
`main.rs` re-exports the two modules at its crate root
(`pub use unity_protocol::{frames, protocol};`) so **all ten existing
`crate::frames::…` / `crate::protocol::…` call sites resolve unchanged.** That
was deliberate: relocating the code *and* rewriting its call sites in one commit
means a compile error cannot distinguish "the move is wrong" from "a call site
is wrong". Verified by `cargo build --no-default-features`, `cargo build
--release` (the default gui+cuda profile CI actually ships), `cargo test -p
unity-protocol` (4/4), and running the release binary: `unity-donor 0.3.36`.

⛔⛔ **THE EXTRACTION HAD TWO TRAPS, AND BOTH WOULD HAVE SHIPPED SILENTLY.**

**1. `env!("CARGO_PKG_VERSION")` in `GpuRegister::new`.** It expands to the
version of *the crate the code lives in*. Moving the file would have made the
donor advertise **`unity-protocol`'s `0.1.0`** as its `appVersion`.

⚠ The brain **version-gates** on that field, and `donor-release.yml` refuses to
build on a tag/`Cargo.toml` mismatch. **Neither defence would have fired** — the
value would have been a *truthful report of the wrong crate*, and both checks
compare text files rather than asking the binary. Fixed by making it a
caller-supplied parameter; the only thing that knows what version the donor is,
is the binary that IS the donor. ⭐ **The release workflow now also runs the
built Linux binary and compares `--version` to the tag**, which is the only check
that could have caught this class at all.

**2. `crate::mindspace::OPS`** — the sole cross-module reference. Moving the
constant into the protocol crate would have compiled and been wrong: the
advertised op list must track the code that *implements* those ops, which this
crate cannot see, and **advertising a capability the donor lacks is worse than
omitting one it has** because the server routes work on that list. Also
caller-supplied.

⭐ Both fixes are the same shape and it is the shape §5.2 wants: **the protocol
crate describes the message; it does not know the facts that go in it.** Expect
the same question at every later boundary — B3 in particular, where "what does
`unity-donor` know that `unity-protocol` must not?" is the whole design.

⚠ **`serde_json` was almost missed.** A grep for `use serde_json` found nothing,
because the only use is a fully-qualified type in a struct field. The compiler
caught it on the first build — which is precisely why this phase is "move the
code, change nothing else."

⛔⛔ **AND THE WORKSPACE MOVED THE BUILD OUTPUT, WHICH ALMOST BROKE RELEASES.**
A workspace member does **not** build into `<member>/target/`; it builds into the
workspace root's. `donor-release.yml` copied the shipped binary from
`donor-app/target/release/…`. ⭐ **The danger was never a failed build — it was a
successful one:** a stale `donor-app/target/` on a runner would have let that
copy keep working and published a months-old binary under a new tag, every step
green. (This repo has both `donor-app/target/` and `donor-app/target-v35/` on
disk right now, and has already shipped a release lane that logged all-green
while publishing nothing — KI-22.) The workflow now resolves the path from
`cargo metadata`, deletes both the artifact and the destination before building,
and verifies the binary's own `--version` before publishing.

⚠ **`[profile.release]` had to be mirrored to the workspace root.** Cargo
**ignores** a profile declared in a member and only warns — so leaving it only in
`donor-app/Cargo.toml` would have quietly dropped `lto`/`strip`/`opt-level` from
every released binary. The member's copy is retained so a standalone
`--manifest-path` build outside the workspace still optimises.

⚠ **`/target/` and `/Cargo.lock` added to `.gitignore`.** The existing rule was
`donor-app/target/`, which stopped covering the donor's output the moment the
workspace landed.

Then write a `unity-weights` CSR type with `Weight = f32`,
`BYTES_PER_NNZ = size_of::<Weight>() + size_of::<u32>()`, an f64 accumulator,
and a `memmap2`-backed store — and port
`tools/weight-precision-probe.mjs` to a Rust test asserting the SNR floor.

---

## 10. Working agreements for whoever picks this up

These are not style preferences. Each one is a scar.

1. **Measure on the box, not in your head.** Two confident memory models in
   §MEMORY-MAP were wrong, and each would have made the system worse if built.
   The 8.8 GiB was not what anyone assumed it was.

2. **A test that passes for the wrong reason is worse than no test.** The first
   precision probe reported *exactly zero* deviation — because it built its f64
   "reference" by widening an already-f32 array. A tautology. Ask what result
   would falsify the check before trusting a pass.

3. **Silence is not success.** `find … 2>/dev/null` made a permission wall
   indistinguishable from an absent repo and cost two days. `systemd-run` with an
   invalid property printed "deploy spawned" and deployed nothing. When a check
   can fail invisibly, make the failure say so.

4. **Run the failure path, not just the happy path.** `kill -9` does not release
   an `flock` (children inherit the fd), which would have left a permanently dead
   Update button for an operator with no shell. That was found by killing the
   process on purpose, not by reading the code.

5. **`write_bytes == 0` is not a wedge.** A healthy rsync shows it while the
   destination grows, because writes sit in page cache. Progress means the
   destination is growing. This mistake killed a working transfer.

6. **The operator has no shell.** Every failure must be legible from the
   dashboard, and every diagnostic should name the exact command that fixes it.
   The JS is full of long log strings for this reason — port the *intent*, not
   just the code.

7. **Changing a stored type is a format change.** The Float32 cut reached 5 of
   12 allocation sites and left a hardcoded `nnz * 8` in the checkpoint writer.
   Result: she trained for two hours and persisted **nothing**, while looking
   completely healthy. Audit every byte-width computation, and bump a format
   version with an explicit reader for the old one.

8. **Ship the estimator and the allocator together, or not at all.** They
   disagreed by 1.5x for the life of the project. In Rust, derive the constant
   from the type (`size_of::<Weight>()`) so they *cannot* drift.

