# Rust Migration Guide — the coordinator (`server/`)

**Status:** planning document. No Rust coordinator code exists yet.
**Written:** 2026-09-05
**Audience:** an engineer picking this up cold, with no prior context on this
repo.

Read [`docs/MEMORY-MAP.md`](MEMORY-MAP.md) first. It explains where the
coordinator's memory actually goes and records two plausible-but-wrong models
that cost real time. This document assumes it.

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

```
unity-protocol/     # phase 0 — SPRS frames, opcodes, shared with donor-app
unity-weights/      # phase 1 — SparseMatrix (CSR), checkpoint I/O, mmap store
unity-donor/        # phase 2 — donor sessions, dispatch, readback
unity-state/        # phase 3 — sqlite stores, resume markers, boot reason
unity-http/         # phase 4 — the 34 endpoints, auth model
unity-coordinator/  # binary that wires it together
```

`donor-app/` then depends on `unity-protocol` instead of carrying its own copy.

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

Phase 0. Extract `donor-app/src/frames.rs` and `protocol.rs` into a
`unity-protocol` crate, have `donor-app` depend on it, and confirm the donor
still builds and connects. Zero behaviour change, no risk to the brain, and it
establishes the shared-contract pattern everything else relies on.

Then write a `unity-weights` CSR type with `Weight = f32`,
`BYTES_PER_NNZ = size_of::<Weight>() + size_of::<u32>()`, an f64 accumulator,
and a `memmap2`-backed store — and port
`tools/weight-precision-probe.mjs` to a Rust test asserting the SNR floor.
