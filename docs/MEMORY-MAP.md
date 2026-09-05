# Where the brain's memory actually goes (OVH coordinator)

Written 2026-09-05 while chasing "node is holding 8.80 GiB and nothing explains
it". Two plausible-sounding models were wrong before the right one held up.
Both wrong models are recorded here, because each cost a rebuild of the plan and
each would have produced a *worse* system if acted on.

## The short version

On the deployed box (`UAL_PROXY_AUTH=1`, no GPU) the resident weight bytes are
**the language cortex CSR master copy**, not the main brain.

| structure | where it lives | size | access pattern |
|---|---|---|---|
| main brain LIF state (21 B/neuron) | **donor GPUs** | not resident | n/a on the coordinator |
| language cortex CSR (12M neurons) | **host RAM** | 6.28 GiB @ Float64, 4.18 GiB @ Float32 | cold: init, upload, hourly readback |
| deploy staging (`FTMP/bw`) | PrivateTmp = **RAM** | ~11.7 GiB | fixed 2026-09-05, now on disk |

Sum of the first two against the observed 8.80 GiB PSS is consistent once V8
overhead and scratch buffers are counted.

## Wrong model #1: "the main brain is the 8.8 GiB, and it's cold, so mmap it"

The reasoning was that `_tierTargetNeurons = 357M` at 21 B/neuron is ~7.5 GB, and
`brain-server.js:734` calls the CPU CSR copy authoritative, so it must be
resident and cold.

**Why it is wrong:** `brain-server.js:2482` — *"GPU maintains the real voltage
state. Server only needs voltages for injectText()"* — and `_injectionSize` is
`min(10000, CLUSTER_SIZES.cortex)`. The main brain's per-neuron state is on the
donors. The coordinator holds ~10K neurons of it, not 178M.

The 21 B/neuron figure is real but it is a *budgeting* unit used to derive a
VRAM/tier target. It is not a coordinator-side allocation.

## Wrong model #2: "the language cortex is hot, so mmap would starve her"

Having found the cortex is the resident thing, the next reflex was that
`cluster.js:2631` calls it a CPU-side `NeuronCluster` that computes locally
every tick, so paging it to disk would reproduce the 2026-09-04 event-loop
starvation.

**Why it is wrong:** every CPU compute path in the cortex is *gated off* above
2M neurons, and the cortex is pinned at 12M:

- `cluster.js:2952`, `:3030`, `:3202` — `if (this.size > 2000000) return` with
  the GATESTEP comment: *"each carries the full synaptic propagate on the CPU
  (measured: seconds per tick); no CPU cortex path at biological scale."*
- `cluster.js:349` — `this.requireGpuSubstrate = !!this._gpuProxy`. A brain
  wired with a GPU proxy **requires** it; the "silent CPU fallback" was
  deliberately removed in 2026-08-14 because donors disconnecting used to leave
  the host doing 306M-neuron Hebbian by hand.

So at 12M the CPU paths refuse by design. The arrays are touched by:
1. **init** — one sequential fill (`initRandom`)
2. **donor upload** — bulk sequential read (`gpu.js` chunked upload)
3. **hourly readback** — bulk write (`refreshCheckpointFromDonor`, 1-hour gap,
   5-minute tick, so 11 of 12 calls refuse as routine)

That is a cold, streaming access pattern. Measured locally: sequential read of a
0.75 GiB Float32 array off disk runs ~9 GiB/s warm, far above what a donor
upload can consume.

## Why the language cortex does not scale with the tier

`langCortexSize` is **pinned at 12M** by the WMB floor
(`WORD_MOTOR_TARGET_LANG_CORTEX`, `brain-server.js:3106`), and
`brain-server.js:988` states it directly: *"langCortexSize is PINNED at 12M by
the WMB floor, so this footprint does not grow with the main brain."*

A naive `tier x language_cortex weight (0.50)` gives 178M neurons and ~62 GiB,
which cannot fit a 31 GiB box. If a calculation produces that, the WMB pin has
been missed.

## The sizing bug that made all of this hard to see

Until 2026-09-05 the estimator and the allocator disagreed by 1.5x:

- `brain-server.js:2860` — `const BYTES_PER_NNZ = 8;  // Float32 + Uint32`
- `sparse-matrix.js` — `this.values = new Float64Array(...)` → really 12 B

Every budget decision was made against a footprint 50% smaller than what got
allocated. The same file already knew: the WMB comment at `:2755` prices it as
`nnz x 12B`. Two constants, 8 and 12, for the same byte.

Fixed by making values `Float32` (matching what donors already compute in, see
`gpu.js` `new Float32Array(matrix.values)`) **and** having the estimator
`await import` the constant from the allocator instead of restating it. Shipping
either half alone would have been wrong: correcting only the constant shrinks
the brain by a third, changing only the type leaves the estimator lying.

### ⛔⛔ That fix reached 5 of 12 allocation sites — completed 2026-09-05

The change's own comment warned that *"missing one would produce a matrix whose
values array silently disagreed with the rest"*, and seven were missed. **The
misses included the largest matrix in the system**, so on its own the change
moved almost nothing:

| what was missed | why it mattered |
|---|---|
| `initTopographic`, `initSmallWorld` | build the **intra** matrix. `brain-server.js` forces `topographic = true` on a fresh walk, and the cortex is 12M — so the 360M-nnz allocation whose unexplained 8.80 GiB started this document was allocated at 12 B/nnz while the estimator budgeted 8 |
| the laminated cross init, `fromDense` | same class, smaller matrices |
| `prune`, `pruneTopKPerRow`, `grow` | **rebuild** paths: they allocate a fresh values array and assign it over `this.values`, so a correctly-Float32 matrix came back Float64 the first time it was pruned. `pruneTopKPerRow` runs on cross-projections during the curriculum walk, making the widening progressive and silent |

⛔ **And the binary checkpoint writer THREW on every Float32 matrix.** Both save
paths sized the values write as `nnz * 8` and handed that to
`Buffer.from(arr.buffer, off, len)`, which raises `ERR_BUFFER_OUT_OF_BOUNDS`
rather than clamping when the length runs past the ArrayBuffer — and a Float32
array of `nnz` elements owns exactly half of `nnz * 8`. Per the BIGSAVE comment
in that same function, an aborted save **falls back to the previous checkpoint
and silently loses everything learned since**. The half of the fix that DID land
(cross-projections, built by `initRandom`) is precisely the half that would have
triggered it, so the brain would have walked and never checkpointed.

⭐ **All twelve sites now route through `WEIGHT_ARRAY`, and the file format
carries its own width.** The writer derives the value width from
`values.BYTES_PER_ELEMENT` — a constant can go stale, an array cannot — and the
`UBWT` header gained `BIN_FORMAT_VERSION` (v1 = f64, v2 = f32), **a different
number from `WEIGHTS_FORMAT_VERSION` and not gated by it.** v1 files are still
read and narrowed on apply rather than refused, because a v1 checkpoint holds
real training.

⚠ **Correction to the change's own claim that *"a size/format change trips the
boot compat gate into a fresh walk regardless"*: it does not.**
`WEIGHTS_FORMAT_VERSION` did not move and the estimator's value went from a
hardcoded `8` to an imported `8` — the same number — so neither input to that
gate changed. It sees nothing. With the format version above in place a resume
is now genuinely safe, which is better than the wipe that was assumed.

⭐ **The lesson for the next width change:** a grep for the allocation is not a
check of the result. What settled this was constructing a matrix through every
init and rebuild path and reading back `values.constructor.name` — twelve sites
is exactly the count at which "I changed them all" stops being verifiable by eye.

## Mixed precision boundary

**On the coordinator: storage Float32, arithmetic Float64.** `propagate()` reads
Float32 values and accumulates into `let sum = 0` (a JS double), writing a
`Float64Array`. Error compounds in the sum across fanout, not in one stored
weight.

Do **not** "tidy" the accumulator or output buffer to Float32 for consistency.
That is the one edit that turns a free 33% saving into a real regression.
Same rule for LIF state (`voltages`, `motorChannels`) — integrator state stays
Float64.

⚠ **The donors are f32 end to end, and cannot be otherwise.**
`donor-app/src/shaders/synapse_propagate.wgsl:16` binds `values: array<f32>`
and accumulates in `var sum: f32` — **WGSL has no f64 storage type at all**.
`donor-app/src/frames.rs:28` takes `values: Vec<f32>` on the wire. So the
"arithmetic stays Float64" rule above describes the *coordinator's CPU path
only*. The real compute substrate has always been single precision, which is
the strongest evidence that Float32 storage costs nothing: the numbers were
being rounded to f32 the instant they left the box regardless.

⭐ Side effect worth knowing: `gpu.js:2541` reads

    matrix.values instanceof Float32Array ? matrix.values : new Float32Array(matrix.values || [])

Before WEIGHTPREC that ternary **always** took the right branch, allocating a
fresh full-size Float32 copy (~2.68 GiB for the intra matrix) on *every* upload.
It now takes the left branch and passes through with zero copy — removing a
multi-GiB transient from the donor-join path, which is exactly when memory is
tightest.

Measured cost of Float32 storage at the real fanout-300 geometry
(`tools/weight-precision-probe.mjs`): relative RMS error 2.7e-8, SNR 151.4 dB,
**0 threshold flips in 20,000 neurons**, and among the 18,398 rows carrying real
signal the max relative error is 8.1e-7 with none above 1e-6.

⚠ Probe trap: building the Float64 "reference" by *widening* an already-Float32
array measures exactly zero deviation by construction. That is a tautology, not
a pass. The probe must draw at Float64 and round a copy **down**.

## The next fix, and why it is NOT mmap

The obvious idea — back the cortex CSR with `mmap` so the kernel can evict cold
weight pages — was investigated and **rejected**. Three reasons, in the order
they killed it:

1. **Node has no native `mmap`.** A file-backed typed array needs a native
   addon. The box runs `npm install --omit=dev` unattended inside the deploy,
   with no shell to recover from a failed build. That is a new failure mode on
   the exact path the operator cannot debug, bought with memory.
2. **The arrays are already off-heap.** Measured: a 400 MiB `Float32Array` puts
   381 MiB in `external`/`arrayBuffers` and ~0 in `heapUsed`. So "get it out of
   the V8 heap" was *already true* — `--max-old-space-size` never bounded these
   and GC never moved them. Only *evictability* was ever actually on offer.
3. **The codebase already models the better answer.** `sparse-matrix.js:744`
   warns *"Matrix is likely GPU-bound with CPU arrays freed"* and
   `gpu.js:5624` sets `proj._gpuBound = true`. There is already a concept for
   "the donor holds this matrix, the CPU copy is not needed".

### The design that should happen instead

**Free the CPU CSR arrays for `_gpuBound` matrices; restream them from the
checkpoint when a donor actually needs them.** Same memory win (~4.18 GiB after
WEIGHTPREC), no native dependency, and it extends a lifecycle the code already
has rather than inventing one.

Cost: one sequential read when a donor joins or a readback lands. At the box's
**measured** 3248 MiB/s that is ~1.3 s for the full 4.23 GiB CSR — against an
upload that already takes far longer over the wire.

⚠ Benchmark trap, in case someone re-measures: writing a `Buffer.allocUnsafe`
buffer to a file and timing it produces nonsense (682 GiB/s observed) because
the buffer is sparse/untouched and the filesystem elides the write. Fill the
buffer with real data, and prefer the box's own measured disk rate over any
warm-cache number.

Open questions that need answering before writing it:
- what exactly re-materialises the arrays, and who blocks while it happens
- whether a partial readback can interleave with a free (see
  `refreshCheckpointFromDonor`: *"a partial transfer leaves `matrix.values` a
  mix of old-CPU and new-GPU rows"* — freeing mid-readback must be impossible)
- what happens when the LAST donor disconnects and no CPU copy exists;
  `cluster.js:349` says a proxied brain REQUIRES its proxy, so this may be
  already-correct behaviour rather than a new hazard, but it must be confirmed
  rather than assumed

## Field notes from the 2026-09-05 deploy (observed, not theorised)

The STAGEDISK/ONEPRESS/OWNCGROUP fixes were deployed and watched. What actually
happened, including two things the earlier analysis got wrong.

### The fixes work, and here is the measurement

Same press, same box, before and after the new `self-update.sh` was in place:

| | old script (18:39 press) | new script (19:00 press) |
|---|---|---|
| staging location | `/tmp` tmpfs | `/opt/unity-brain/.staging` (disk) |
| `/tmp` during deploy | **12 GiB (77%)** | **65 MiB (1%)** |
| PSI memory full avg10 | **72.2** | **0.00 - 0.69** |
| brain HTTP during deploy | **timed out >20s** | **200 in 1.2 ms** |
| staging peak | capped by a 16 GiB tmpfs | **203 GiB on disk** |

⭐ The 203 GiB number is the point. The old script could *never* have completed
this deploy — the full LFS payload does not fit in a 16 GiB tmpfs. It only ever
"worked" because the pull wedged or timed out first. Staging to disk did not
just relieve memory pressure, it made the operation possible at all.

### ⛔ CORRECTION: `write_bytes == 0` IS NOT SUFFICIENT TO CALL A WEDGE

The 2026-09-04 wedge signature is recorded elsewhere in this repo as
"`read_bytes` climbing while `write_bytes` stays frozen at 0". **On 2026-09-05
a perfectly healthy fields rsync showed exactly that signature** — `write_bytes`
flat at 0 across repeated 10-12 s samples — while the destination directory grew
4.5G → 11G → 19G → 28G.

The reason: writes land in page cache and are not always accounted to the
process's `write_bytes` until writeback. A process can be making excellent
progress with `write_bytes` at zero.

⚠ **The reliable progress signal is DESTINATION GROWTH** (`du -sh` on the
target), not `/proc/<pid>/io`. An earlier call in this session killed a healthy
rsync on the `write_bytes` reading alone. The in-script watchdog
(`UAL_LFS_STALL_SEC`) requires BOTH flat writes AND climbing reads, which is
better, but destination size is the signal that cannot lie.

### ⛔ A REAL RUNAWAY: `git lfs pull` wrote 212 GB from a 110 GB store

Distinct from the wedge, and the opposite failure. With disk space finally
available (the old tmpfs staging always died first), the pull ran freely and
was observed writing ~4.7 GB every 10 s — genuine progress by any measure —
until it had written **212 GB**.

`sudo du -sh /var/lib/forgejo/data/lfs` = **110 GB**. It had written nearly
twice the total size of the source it was reading from, and was still going.

⚠ **Bound the LFS pull by BYTES WRITTEN against the known store size, not only
by wall clock.** The existing `UAL_LFS_TIMEOUT` (8m) does catch it, but only
after it has burned however much disk 8 minutes buys — on a fast disk that is
enough to fill the volume. A `written > 1.5 × store_size` check would catch the
pathology itself rather than its duration.

⚠ Root cause not yet identified. Candidates: the repo genuinely contains more
LFS history than the store's current size (the store is deduplicated by OID,
the checkout is not), or a retry loop re-fetching objects it has already
written. **Not diagnosed — do not assume.**

### The BrainWaves local-path discovery fails on the box

Every press logs:

```
data repo not at any known path — searching the filesystem for it …
data repo not found on local disk (known paths AND a bounded search) —
using git@git.unityailab.com:UnityAILab/BrainWaves.git over SSH
```

The script's own comment says `git.unityailab.com` **is this box**, so the
clone loops back over SSH to the same machine for data sitting on local disk.
Both the 4.5-hour wedged press and the 212 GB runaway happened in that SSH
clone path. `_search_local_repo()` probes `/var/lib /home /data /srv /opt /mnt
/var/opt` at `-maxdepth 6` for `brainwaves.git`; Forgejo's LFS store is at
`/var/lib/forgejo/data/lfs`, so the repository root is likely
`/var/lib/forgejo/data/` — **which the fixed candidate list does not include**
(it tries `/var/lib/forgejo/repositories/...`, not `/var/lib/forgejo/data/
repositories/...`).

⭐ Fixing this is probably the single highest-value remaining deploy change: it
removes the SSH round trip, the credential dependency, and both observed
failure modes in one edit. **Verify the real path on the box before changing
the list** — `sudo find /var/lib/forgejo -maxdepth 4 -name '*.git' -type d`.

### The checkpoint bug that shipped with WEIGHTPREC

The Float32 change reached 5 of 12 allocation sites, and the binary checkpoint
writer hardcoded `s.nnz * 8` as the values width. With Float32 values that
buffer is `nnz * 4`, so `Buffer.from(values.buffer, 0, nnz*8)` throws
`"length" is outside of buffer bounds`.

**Observed live on the box** after the 18:39 deploy:

```
[Brain] Binary weights save failed: "length" is outside of buffer bounds
[Brain] Binary weights async save failed: "length" is outside of buffer bounds
```

She trained for ~2 hours and wrote **no checkpoint at all**. `brain-weights.bin`
did not exist. A crash in that window would have lost everything since the
deploy.

⛔ **The lesson is bigger than the bug.** The dtype of a stored array is a
*format* decision, and every place that computes a byte offset or length from
`nnz` is coupled to it. Changing the type without auditing every width
computation produces a system that boots, trains, and looks healthy while
silently never persisting. Fixed by `BIN_FORMAT_VERSION = 2` with a
`_BIN_VALUES_ARRAY_FOR(v)` map so v1 (f64) files still load and migrate.

⚠ **Which also means: the "0 threshold flips" precision measurement was true
and irrelevant to this failure.** A numerical-accuracy probe cannot catch a
serialisation-width bug. Both kinds of check are needed.

## Deploy memory (fixed 2026-09-05)

Three incidents, one root cause: work that is not the brain, spending the
brain's cgroup budget, because `spawn(..., {detached:true})` starts a new
session but **not a new cgroup**.

- 2026-09-04 — `git lfs pull` wedged: 2.07 TB read, 0 bytes written, event loop
  2% serviced. The unit stayed `active`, port 7525 stayed LISTENING, and
  `/ctl/status` said "online and serving" while curl timed out at 20s.
  **`/ctl/status` checks that the port is OPEN, not that it ANSWERS.**
- 2026-09-04 — the fields rsync pulled 12.4 GiB of *page cache* into the cgroup
  while `node` RSS was only 8.7 GiB. Killing it dropped the cgroup 20G → 4G.
  `ps rss` looks innocent the whole time.
- 2026-09-05 — `mktemp -d` under `PrivateTmp=true` staged ~12 GiB into **RAM**.
  tmpfs pages are *unreclaimable*: the kernel can only swap them, swap was
  99.99% full, so all reclaim pressure landed on the brain's working set. A
  deploy was starving the process it was deploying.

Now: `TMPDIR` exported to `$BACKEND_DIR/.staging` (disk), an `flock` making
presses mutually exclusive, and the deploy launched in its own
`systemd-run --user --scope` with `MemoryMax` (`UAL_DEPLOY_MEM_MAX`, default 2G).

### Traps found while fixing that, all by running it

- **`kill -9` does not release an `flock`.** Children (rsync, git, a watchdog's
  `sleep`) inherit fd 9 and the kernel holds the lock until the last holder
  closes it. The first version left a SIGKILLed press holding the lock forever,
  so every later press printed REFUSED — a permanently dead Update button for an
  operator with no shell. The lock file now carries the owner PID so a refusal
  can distinguish "really running" from "stale, break it and proceed".
- **A bare `systemd-run --scope` targets the SYSTEM manager and prompts for a
  password via polkit.** Six property probes produced six prompts. From the box
  that would be far worse: `User=unity`, `NoNewPrivileges=true`, spawned from an
  HTTP handler with no terminal — the prompt asks nobody and the press hangs.
  Use `--user` (own manager, real cgroup, no privilege) and keep
  `--no-ask-password` as a permanent interlock.
- **`IOSchedulingClass=idle` and `MemoryAccounting=true` are not valid here.**
  The first is ionice's syscall interface, not a unit property (cgroup-v2
  spelling is `IOWeight`); the second is implicit under v2 and returns "Access
  denied" on a transient scope. A rejected property means the unit never starts,
  so the press printed "deploy spawned" and deployed **nothing**. Probe any new
  property first:
  `systemd-run --user --scope --collect --quiet --unit=probe-$RANDOM --property='X=y' true`
  (silence = accepted).
- **Two failure modes need two handlers.** A missing binary fires `'error'`
  (ENOENT, asynchronously — it does not throw). A *present-but-refusing*
  `systemd-run` spawns fine, never fires `'error'`, and exits non-zero having
  started nothing. Only the first handler existed at first, which is exactly how
  the invalid properties got through.
- `.staging/` and `.self-update.lock` must be on the overlay rsync's
  `--exclude` list — they live under `BACKEND_DIR`, so `--delete` would remove
  the staging directory the script is reading from, mid-deploy.
- `FTMP` (the ~12 GiB clone) belongs in the `EXIT` trap. Its only cleanup was at
  the bottom of the block, so every abort path (books gate, embeddings gate, a
  kill, `set -e`) leaked the full 12 GiB.

## Sizing chain, for reference

`SELF-SEEDING BOOT` (`brain-server.js:854`) computes a tier from an **assumed**
donor baseline (`donorBaselineMB` default 16384, `donorBytesPerNeuron` 20), not
from any donor that is actually connected:

    cap = (16384 * 0.75 - 2048) * 1MiB / 20 = 536,870,912  ->  clears tier 3
    tierRequiredMB = 357M * 21 / 0.5 / 1MiB + 2048 ~= 16,348 MB
    _safeMB = hostRAM - 13312 = 18,519 MB   (not binding)

⚠ `deploy/dropins/10-pin-brain-size.conf` sets `DREAM_DONOR_FIT_MB=4096` and its
comment says it exists so a default change *"cannot silently resize -> wipe
again"*. **It is dead code.** The tier branch (`:892`) is tested *before* the
donor-fit branch (`:896`), and self-seeding writes `community-tier.json` on
every deployed boot, so a tier always exists and donor-fit is unreachable. The
only override that beats the tier path is `DREAM_BRAIN_BUDGET_MB`.

## Restart hazard

The `/update` handler writes `server/.force-fresh` **before** spawning the
script. `_abort` disarms it, but a plain `systemctl restart` mid-press does not.
If that file exists, the next restart from *any* cause boots into a weight wipe,
and `DREAM_KEEP_STATE=1` does not protect you — `autoClearStaleState` honours
the flag regardless. Check for it before restarting.
