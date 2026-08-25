# ADMIN CONTROLS — dashboard Stop / Restart / Reset, and the one-backend model

> Clarifies what the admin-only dashboard power buttons actually control, how
> the "deployed website" and "the server" relate (they are NOT two brains), and
> the #112.10 fix that makes **Stop** truly stop.
>
> Last updated: **2026-08-20** (🔁 Savererun now clears **passedPhases** too — it was re-walking cells while skipping the phases inside them; plus the env-flag reference table).

---

## There is ONE backend, not two

A common confusion: "the deployed version (the website) vs the server version."
In reality there is **one** Node brain-server process, and everything connects to
it over WebSocket. There is no second "server-version website."

```
                        ┌─────────────────────────────────────────┐
   donor browsers  ───► │  nginx  :443  (SNI/stream split)         │
   (compute.html)       │   ├─ public lane   /ws        (no auth)  │ ──┐
                        │   └─ admin  lane   /admin/ws  (Forgejo   │   │
   admin dashboard ───► │                    auth_request +        │   ├─►  ONE Node
   (dashboard.html)     │                    X-UAL-User header)    │   │    brain-server
                        │       admin REST   /admin/<endpoint>     │ ──┘    127.0.0.1:7525
                        └─────────────────────────────────────────┘        (loopback only)
```

- **The deployed "website"** = the static frontend (donor page + dashboard UI),
  served by the Forgejo Pages rsync (`.forgejo/workflows/deploy.yml`). It is just
  HTML/JS/CSS. It has **no brain of its own** — it connects to the one brain-server
  over WSS.
- **The brain-server** = the Node process on the OVH box (`/opt/unity-brain`,
  systemd `unity-brain`). It binds loopback only; nginx fronts it.
- **"The server version" / local dev** = running `node server/brain-server.js` on
  your own machine; the page then connects to `ws://localhost:7525` (the hostname
  gate in `js/brain/remote-brain.js` only probes loopback on localhost origins).

So the admin power buttons act on the **single shared brain-server**. There is no
"deployed brain" vs "server brain" to keep in unison — it's the same process for
everyone. The Pages static site is unaffected by these buttons (it's always there;
when the brain is down the page simply shows "waiting for brain / no GPU").

---

## The three admin-only buttons (`html/dashboard.html`)

Hidden behind `.admin-only`; revealed only after the server sends `modeAssigned`
confirming admin. Each POSTs to an endpoint — `localhost:7525/<endpoint>` in local
dev, `https://<host>/admin/<endpoint>` deployed (nginx strips `/admin/`). All three
are gated by `requireLoopback()` in `server/brain-server.js`: the request must
arrive on loopback (it does — nginx proxies to 127.0.0.1) **and**, when
`UAL_PROXY_AUTH=1`, carry the `X-UAL-User` header that nginx injects after Forgejo
auth (client-supplied copies are stripped). So in deployment they are reachable
ONLY through the Forgejo-authenticated admin lane.

| Button | Endpoint | Exit | systemd behavior | Net effect |
|---|---|---|---|---|
| **⏹ Stop Brain** | `POST /shutdown` | **42** | `RestartPreventExitStatus=42` → **NOT revived** | True halt — stays down until a manual start |
| **🔄 Restart (Savestart)** | `POST /restart` | 0 | `Restart=always` → revived | Restarts + auto-resumes trained state |
| **♻ Reset (fresh)** | `POST /reset` | 0 | `Restart=always` → revived | Writes `.force-fresh` → boots a wiped brain (identity-core Tier-3 anchors preserved) |
| **⬆ Update & Fresh Walk** | `POST /update` | n/a (detached `self-update.sh` → `systemctl restart`) | `Restart=always` → revived | Overlays latest code (git-archive) **and** writes `.force-fresh` → reboots into a WIPED fresh K→PhD walk |
| **⬆ Update & Savestart** | `POST /update?keep=1` | n/a (detached `self-update.sh` → `systemctl restart`) | `Restart=always` → revived | Overlays latest code **but SKIPS** `.force-fresh` → reboots and RESUMES saved weights — deploy a fix without losing training (relies on the unit's `DREAM_KEEP_STATE=1`) |
| **🔁 Savererun** | `POST /savererun` | 0 | `Restart=always` → revived | **Weights KEPT** (rollback checkpoint taken first) — resets ONLY the walk pointers (`cluster.grades` → pre-K all subjects, `passedCells` cleared, sub-grades re-derive), force-saves the reset inside the kept weights + drops the resume marker, reboots; the boot walk **re-teaches the whole curriculum on top of the trained synapses** with the current teach code (Oja is self-normalizing — re-teach strengthens, doesn't corrupt). Episodic memory + identity-core preserved. Use after shipping teach-path fixes that need Hebbian mass the original walk never laid down (deploy the code first via ⬆ Update & Savestart, then press 🔁 Savererun once). **2026-08-20 — now clears `passedPhases` + the deferral cursor as well as `passedCells`:** it was re-walking the CELLS while the T31 phase-resume skipped the completed PHASES inside them, so a teach-path fix landing in an already-passed phase never re-taught and the log still reported a clean re-walk. The response now reports `passedPhasesCleared` + `phaseCursorsCleared` so the press proves what it reset |

Stop/Restart/Reset force-save weights first; Restart/Reset drop or set the resume
marker so the revived process resumes (or wipes) correctly. The two **Update**
buttons instead spawn `deploy/self-update.sh` detached — it git-archive-overlays
the latest `main` into the backend dir, then `systemctl restart`s; the restart
fires AFTER the overlay completes (no old/new-code race). `?keep=1` passes
`UAL_KEEP_STATE=1` to the script so it omits the `.force-fresh` write and the
reboot resumes the saved weights (a heavy update that changed brain size/format
still fresh-starts safely via the boot compat gate). After this batch is deployed
once, routine code updates are self-serve from the dashboard — no box admin
needed except for the first deploy, a `unity-brain.service` change, or the
one-time button prerequisites (deploy key, `sudo -n systemctl restart`).

### #112.10 — why Stop now exits 42

Before this fix, **/shutdown and /restart BOTH exited 0**. With systemd
`Restart=always`, exit 0 is auto-revived — so "Stop Brain" behaved exactly like
Restart and **could not actually stop the brain** (the "couldn't shut it off"
symptom). The fix is systemd-native:

- `/shutdown` now `process.exit(42)`, and the unit sets `RestartPreventExitStatus=42`.
- A **deliberate Stop** (exit 42) → systemd does **not** revive → the brain stays down.
- A **Restart** (exit 0) and a **crash** (any other non-zero) → still auto-revived.

**Bringing the brain back after a Stop** (it can't restart itself — the process is
gone, so there's no dashboard to click): on the box run
`sudo systemctl start unity-brain`; locally re-run `start.bat` / `Savestart.bat`.

### Do the buttons work for "both versions"?

There is only one thing to act on — the single brain-server — so yes, the buttons
inherently cover everyone connected (deployed donors + admin alike). They do **not**
(and cannot) stop the static Pages website itself; that's just files on nginx and
is always served. After a Stop/Restart, every connected client (donor + dashboard)
drops and auto-reconnects when the brain is back (`remote-brain.js` reconnect loop).

---

## systemd unit requirements (box)

For the above to hold, `/etc/systemd/system/unity-brain.service` must have:

```
Restart=always
RestartPreventExitStatus=42
SuccessExitStatus=42
```

`Restart=always` keeps the brain up through crashes + Restart-button reboots;
`RestartPreventExitStatus=42` is what lets the Stop button truly halt it (exit 42
is exempt from auto-restart); `SuccessExitStatus=42` makes a deliberate Stop report
as a clean `inactive (dead)` rather than `failed`.

**Verified on the box (2026-06-22):** POST `/shutdown` → `active=inactive`,
`NRestarts=0` (not revived), `ExecMainStatus=42`; stayed down across re-checks;
`systemctl start unity-brain` → `active` + `/health` alive (resumed 51,130,559
neurons). Restart (exit 0) and crashes still auto-revive.

---

## Checkpoints, versioning & rollback (#112.11)

The brain **auto-checkpoints every 5 minutes** while running (plus forced saves on
each passed cell / grade-advance / clean shutdown), and **resumes** from the latest
checkpoint on a Restart. Rolling versioned backups rotate through the last **N**
slots — **default 3** (`DREAM_CHECKPOINT_SLOTS`, was a fixed 5; capped to bound disk,
each `.bin` is ~145 MB at scale). Slots above the cap are pruned on boot.

| Control | Endpoint | What it does |
|---|---|---|
| **💾 Save checkpoint now** | `POST /checkpoint` | Force an immediate versioned save between the 5-min ticks |
| **⏪ Rollback to vN** | `POST /rollback {to:"vN"}` | Restore a backup slot over the active weights (**takes effect on next restart**) |
| checkpoint list | `GET /versions` | The retained slots (slot, version#, time, size) |
| **↻ Re-sync GPU shadow** | `POST /resync` | **Weight-SAFE.** Forces the cortex GPU mirror to re-upload from the intact CPU master to the currently-connected donor (`_rearmCortexGpuUpload`) — clears a stuck `gpuShadowDirty` without waiting for a donor to respawn. Touches no weights; the genuine clear lands when the donor re-confirms `gpu_init` (`_gpuShadowDirty cleared — cortex re-confirmed`). Button in the Community Compute panel. **2026-07-09 fix:** the button used to APPEAR dead — the shed/drop paths set a brain-level dirty flag the dashboard displayed but the resync path never cleared (it clears `cortexCluster._gpuShadowDirty`), so the DIRTY banner latched ON even after a successful re-upload. All dirty-markers + the display now use the one clearable cortex-cluster flag, and every shed also auto-arms the same drain-gated resync the button fires. |

**Version mismatch ⇒ old checkpoint refused.** On boot, a checkpoint loads only if
its `formatVersion === WEIGHTS_FORMAT_VERSION` **and** its `totalNeurons` matches the
current build. If a brain change makes them differ, the old checkpoint is **refused**
and a fresh start runs — surfaced in the dashboard as a **"Training was RESET — the
previous checkpoint was INCOMPATIBLE"** banner (from the persisted
`.last-boot-reason.json`, served via `/milestone`).

**Versioning rule (what bumps a version):**
- **Neuron-count / sizing changes** are auto-detected (the `totalNeurons` check) — old
  checkpoints auto-refuse, no action needed.
- **Weight-format / serialization changes** require **manually bumping
  `WEIGHTS_FORMAT_VERSION`** (`server/brain-server.js`) in the same commit — that's the
  lever that makes a format change refuse stale checkpoints instead of loading garbage.
  Routine changes (telemetry, UI, donor lane) must NOT bump it (it forces a fresh start
  that discards trained weights).

## Live single-cell re-teach (no reset)

Retrain ONE `(subject, grade)` cell on the **running** brain without wiping anything.
Useful when a cell force-advanced or taught poorly and you want to redo just that one
without a full fresh walk (which resets all weights).

| Control | Endpoint | What it does |
|---|---|---|
| **🧠 Re-teach a cell** | `POST /curriculum/forget {subject,grade}` | `forgetCell()` drops the cell from `passedCells` + demotes the subject (**no weight wipe**), then `runSubjectGrade()` re-teaches it **in the background** |

**Why forget-then-teach:** `runSubjectGrade` *skips* a cell that's still in `passedCells`
(it reports a synthetic pass on resume). `forgetCell` removes that mark so the re-run
actually teaches. Weights are never reset — only the one cell's pass-flag + the
subject's top grade are rolled back, and the brain re-teaches in place.

**Semantics:**
- **202 Accepted** — cell forgotten, re-teach started in the background. Watch the
  **Current Training** card / `GET /milestone`; weights `saveWeights({force})` on
  completion. A cell teach takes minutes, so the request returns immediately.
- **409** — refused because a cell is already teaching (`cortex._currentCellKey`) or a
  prior re-teach is still running. Retry when idle (two teach passes must never
  interleave on one cluster).
- **400** — unknown subject/grade (validated against the curriculum's `SUBJECTS` /
  `GRADE_ORDER`; the response lists the valid values).
- **503** — the brain hasn't begun its walk yet (no cached corpora to teach from).

Loopback-gated like every other brain-mutating endpoint; the dashboard button is
**admin-only** (hidden in viewer/public mode). The taught-vs-held **learning-coverage
ledger** (`curriculum.js`, logs `⚠ HELD (not taught)` per cell + `cluster._cellLedger`)
ships alongside, so you can see which cells actually taught vs force-advanced.

> Deploy note: this is a backend addition — it reaches the live brain only after an
> **overlay redeploy + restart** (use **⬆ Update & Savestart**, `DREAM_KEEP_STATE=1`
> resumes the trained weights — no wipe).

---

## 📊 Application Profiling section (admin-only) — `state.profiling`

A dedicated **Profiling** card on the admin dashboard (`html/dashboard.html`, scoped
`profiling-*` classes, hidden in viewer/public mode) surfacing two halves:

**(1) The brain's system-resource usage** — three sub-cards:
- **System Resources** — CPU% + `os.loadavg()`, system RAM used %, process RSS,
  V8 heap used/limit %, external/arrayBuffers, context switches, uptime.
- **Throughput / Speed** — step time + steps/sec, event-loop lag + delay histogram
  (mean/p50/p99/max via `perf_hooks.monitorEventLoopDelay`), GPU dispatch/sec
  (+hits/misses), spikes, defs/hr, frame count, and the **loop freezes** row
  (`LOOPNAME.8`).
  - **Why the freeze row is separate from `loop delay max` directly above it.**
    `max` is a since-boot high-water mark with **no count and no recency**, so a
    single 58,418 ms reading cannot be told apart from one bad moment during boot.
    The freeze row is counted by `server/loop-watchdog.js` — a **separate thread**
    — which is why it can report a stall the main loop was too jammed to report at
    all. `episodes · worst Nms` in amber, `none` in green, and **`watchdog off`**
    when the thread failed to start, because a missing instrument must say so
    rather than render a reassuring zero.
  - Each episode was also written to **stderr while it was happening** (raw
    `fs.writeSync`, not `console.log` — worker stdio is piped through the parent's
    event loop, the very thing under investigation), and the last one is on the box
    at `server/.loop-freeze.json`. **A deliberate exit stamps that file
    `CLEAN_EXIT` on the way out (`WDCLEAN.1`)** — the shutdown save pins the loop
    for ~112s, so without the stamp every clean savestart would leave a forged
    `STALLED` verdict behind. **So a file still reading `state: STALLED` after a
    reboot really does mean a hard death (SIGKILL / OOM / power)** — `process.on('exit')`
    fires on every deliberate exit and never on those. It is excluded from the
    deploy overlay's `--delete`, so a redeploy cannot erase the evidence of the
    freeze that prompted the redeploy.
- **Network** — WS bytes in/out totals + live KB/s rates, message counts, GPU
  buffered vs 500 MB threshold, WS drops + drop rate, donor count + VRAM, aggregate
  Gneurons/sec, GPU-shadow-dirty flag.

**(2) Client↔brain profiling** — a bounded, scroll-capped table (≤24 rows + "+N more")
of every live connection: type (admin/viewer/donor), name, masked IP, uptime,
last-seen, **RTT** (from the heartbeat ping/pong), bytes in/out, buffered, and donor
GPU/throughput. Rows that are stale (>90s silent), laggy (RTT >2.5s while the server
event loop is healthy), or backed-up (>300 MB buffered — 60% of the 500 MB drop line)
are flagged **unhealthy** and sorted to the top, so client-to-brain problems are
visible at a glance. A donor row that sat permanently red at 10-14s RTT was the
64MB-parked-socket bug (fixed 2026-07-09 — see `docs/WEBSOCKET.md` §WSQ.4-6): work
routing now keeps every donor socket under the `DREAM_DF7_LINK_CAP_MB` (4MB) link cap,
so RTT reads true and the row heals on drain. **Busy-donor forgiveness (2026-07-09):**
a donor whose buffer is DRAINED (<8 MB) and which is actively computing (Gn/s > 0) is
exempt from the RTT clause — its compute tab's busy main thread answers the heartbeat
late, which is work, not a fault (a hard-working solo donor showed a permanent 3-5s
RTT red row with an empty buffer); stale and backed-up donors still flag. Aggregates:
totals per type, avg RTT, max buffered, total connections ever.

**⚠ `Gn/s > 0` IS NOT "is it working" — read the WORK STATE (2026-08-20, TEACHMIRROR).**
There are TWO work lanes and during the curriculum walk the busy one is invisible to
`Gn/s`. `gneuronsPerSec` and `computeSteps` come from the donor and advance **only** on
`compute_batch` completion; the walk sends Hebbian/propagate frames instead, so a card
teaching flat out reports **zero on both**. An A6000 holding all 17 matrices, taking
teach frames continuously, rendered as red `idle (last 0Gn/s)` and was read as dead.
The row now shows what the card is actually doing:

| reads | means |
|---|---|
| `teaching (N ops, compute lane quiet)` — green | Hebbian/propagate frames landing. **The normal state of a walking brain.** `N` = frames dispatched to THIS donor |
| `<rate> Gn/s` — green | `compute_batch` completing; the tick loop is stepping neurons |
| `idle Ns (last <rate> Gn/s)` — red | **BOTH lanes quiet** — it really is doing nothing. Tooltip says so and carries lifetime teach ops |
| `no work yet` | connected, never took either kind of work — a sync or gating problem |

`teachOps` / `teachAdvancedAgoSec` / `workState` are counted **server-side** in
`_sparseSendBinary` (we send those frames, so the count is exact and no donor rebuild
is needed). The donor has its own `teach_ops` counter but has never shipped it in the
telemetry payload. **Also fixed in the same pass:** `N/17 mx` now counts the PRIMARY's
matrices too — residency is recorded on the upload ack for both lanes, where before
only the replica-sync path recorded it and the master card always read `0/17`.

**Data path:** `server/brain-server/state.js` `_getProfilingState()` → `state.profiling`,
broadcast on the existing WS state lane (admin) / `/public-state.json` (public — but the
panel is `admin-only`, so viewers never render it). Per-client byte/RTT counters are
instrumented in `server/brain-server.js` (send wrapper + inbound listener + heartbeat
ping-stamp). All reads defensive — missing sources degrade to `—`, never throw.

> Deploy note: backend (`state.js` + `brain-server.js`) reaches the live brain only via
> an **overlay redeploy + restart** (⬆ Update & Savestart, `DREAM_KEEP_STATE=1` — no
> wipe). The `dashboard.html` half is frontend and auto-deploys on push to main.

---

## 🎛 Env knobs that change TRAINING (2026-08-20)

Every one of these is opt-in with a stated default. **The buttons above are the normal
way to drive the box** — these exist for a diagnostic run or a deliberate one-off, and
each is listed with what it actually costs.

| Env | Default | What it changes |
|---|---|---|
| `DREAM_PHASE_BUDGET_MS` | **0 — NO BUDGET** | A per-phase wall-clock. Was 20min; the operator removed it (*"some cells are big they take the length of time they take"*). Set positive to arm it when hunting a runaway phase. ⛔ `0` used to compute `Date.now() + 0` and stop after ONE rep while logging "disabled" — fixed, `0` now truly means off |
| `DREAM_STRUCTURE_DOSE` | **1** (full authored reps) | Scales the sentence-structure rep counts. Was cut to 0.4; restored 2026-08-20. **The consolidation gate is now the only thing keeping the walk finite** — see `CONSTRAINTS.md §RE-PRICE THE WALK BEFORE REMOVING A GATE` |
| `DREAM_SELF_FRAME` | on (`0` disables) | The first-person training layer (SELFFRAME) across every chokepoint |
| `DREAM_SELF_FRAME_MAX_UNITS` | 16 per cell | How many lessons per cell get reframed in her voice. ~8.5 min/cell at 16; it prints when it stops |
| `DREAM_INQUIRE_DEPTH` | 3 | How many follow-up questions she chains off one answer |
| `DREAM_MINDSEYE_MAX_SIDE` | 2048 (`MAX_LINE`) | Ceiling for imagined/drawn canvases. Raised from a defensive 192/512 |
| `DREAM_OWNART_CANVAS` | = draw canvas (512) | Canvas side for her own drawings |
| `DREAM_OWNART_MAX_SUBJECTS` | 3 | How many drawable nouns from one message she composes |
| `DREAM_DRAW_STYLE` | `own` | `own` = she constructs from a learned shape schema. `field` / `lineart` render what she SAW — useful, but they are not a drawing |
| `DREAM_VM_CAP` | **25000** | Seen-concept store size (384 → 4096 → 25,000; VMSCALE 2026-08-21, operator: ~10k concepts at full training, *"the more the better"*). The store is **sqlite now** (`visual-memory-v4.db`, WAL, same engine as episodic memory) because monolithic JSON measured 761ms loop pins @10k entries and hard-failed @100k. Disk no longer cares — this cap bounds the hot in-RAM Map (~10KB/entry ⟹ 25k ≈ 250MB beside the brain); raise it whenever RAM allows |
| `DREAM_REF_MAXSIDE` / `DREAM_REF_RENDER_PX` | 320 / 512 | Reference look-up fidelity — what her shape schemas are learned from |
| `DREAM_LANG_UNPIN` | unset | Ignore `server/lang-geometry.json` for this boot and re-derive the language-cortex size. The pin exists because free-RAM sizing flip-flopped 12,000,000 ↔ 349,155 between boots |
| `DREAM_SUBSTEPS_NATIVE` | **24** | Brain-steps per donor round-trip for a NATIVE donor (>= 0.3.12, which puts `compute_batch` on its priority lane and computes on a dedicated OS thread, so a long batch cannot park its inbound socket). Browser donors keep the conservative 8 — their `onmessage` is serial and genuinely cannot. This is the FLOOR the adaptive controller climbs from |
| `DREAM_SUBSTEPS_TARGET_MS` | **2000** | The wall-clock the adaptive controller aims each batch at. It measures the **batch round-trip** (`_batchTiming.roundTripEmaMs`), NOT the tick — the tick is dominated by CPU-side Hebbian grind, and reading it instead pinned the controller at its floor while looking absent |
| `DREAM_SUBSTEPS_MAX` | 1024 | Hard ceiling on the climb. On the live A40 it settles ~54 (630ms batch) |
| `DREAM_UPLOAD_WATCHDOG_MS` | 180s | If the cortex is not ready, no upload is in flight and a donor IS connected for this long, force the upload trigger back to armed. Exists because `_cortexGpuInitStarted` is set BEFORE the upload runs, so a donor dropping mid-upload could leave it true forever — a permanent deadlock behind a reassuring message |
| `DREAM_UPLOAD_PACE_LOWATER_MB` | 96 native / 8 browser | In-flight bytes the chunk pump keeps on the donor socket before pausing for drain. The 8MB default existed for BROWSER donors whose busy tab can't service its own socket; a NATIVE donor drains on a dedicated thread, and at ≤14MB in flight the wire sat IDLE through every 3-4s loop slab — the entire "4MB/s uplink" myth (KI-24). Every upload logs `UPLINK measured … MB/s` so the real rate is a console read (first live read post-fix: 75-350MB/s) |
| `DREAM_VOCAB_RETEACH_MS` | 48h | Spaced-repetition window on the persisted exam-vocab receipt (`word → lastTaughtAt`, saved in the weights): a gate re-entry inside the window skips the re-teach (`VOCAB OK … 100%` in a second), outside it the word re-teaches in full. One-time-training-forever was revoked as a law violation; this is the rest-then-reinforce cadence |
| `DREAM_NO_PRIMARY_WATCHDOG_MS` | 120s | Donors connected but NO live primary for this long → log every donor's held VRAM against `runningFloorMB` with an ELIGIBLE / TOO SMALL verdict, and promote an eligible one if it is sitting unpromoted. **It deliberately will NOT promote a card that is too small** — that refusal is correct, since a primary which cannot hold the weights cannot serve them |
| `DREAM_UPLOAD_GRACE_MIN` | 3min | How long `runner quiet` stays worded as *"EXPECTED … by design"* before escalating to a `⛔ DEADLOCKED` error naming the flags. It printed the reassuring version for **ten minutes** on a permanently stuck brain. Never escalates while an upload is genuinely in flight |
| `DREAM_SAVE_MIN_FREE_MB` | 3072 (`0` disables) | Host free-RAM floor below which a binary checkpoint DEFERS (retry in 2min — deferred, never dropped). The save assembles multi-GB buffers, so it is the sharpest OOM edge on a box shared with Forgejo |
| `DREAM_OWNART_INGEST_MS` | 5000 (`0` disables) | Throttle for learning a shape schema AT PERCEPTION time rather than only when asked to draw. Confirmed looks only, fire-and-forget, skipped mid-curriculum, first ten log their real cost |
| `DREAM_DF7_REGISTRY_WAIT_MS` | 15min | How long a replica sync waits for a populated matrix registry instead of sweeping 0 of 0 and calling it a full replica |
| `DREAM_LOOP_LAG_WARN_MS` | 250 | Threshold for the in-process `[EventLoop] BLOCKED <ms>` warn. Note what it structurally cannot do: it is a `setInterval` **on the loop it measures**, so it only ever prints *after* the block ends — a freeze that never returns prints nothing |
| `DREAM_LOOP_FREEZE_WARN_MS` | **5000** | Threshold for the `LOOPNAME.8` watchdog **thread** (`server/loop-watchdog.js`). It polls a `SharedArrayBuffer` heartbeat every 500ms from off the main loop, so it reports a stall **while it is still happening** and keeps a count + worst-case that the row above cannot produce. Lower it to catch shorter stalls; each episode costs one stderr line plus one small JSON write, and nothing at all while the loop is healthy |
| `DREAM_LOOP_LAG_SUMMARY_UNDER_MS` | **2000** | `BLOCKREAD.1` — teach-attributed `[EventLoop] BLOCKED` warns UNDER this print as **one summary line per 60s** (count · worst · total · banked stage max) instead of a wall of identical warns. The operator: *"it looks like pages and pages of errors"* — a sub-2s block during a teach phase is a CPU teach slab doing real work, not an error. Blocks AT/ABOVE this, and any block outside teaching, still print immediately in full. Detection unchanged: the watchdog thread and `eventLoopLagMs` see every block regardless |
| `DREAM_REF_FETCH_GAP_MS` | **0 — NO global gap** | The brain-wide pacing between NEW Pollinations reference look-ups. Was 10 minutes — a keyed-account-era budget (renders cost real pollen then); revoked 2026-08-21 (the operator: *"lets get rid of the 10 minute per pollinmations.. we can use it as fast as itll generate.. its the anonymous free"*). Natural pacing remains: per-concept in-flight guard + the 2-60s a look costs + the per-concept 6h re-fetch cooldown (`DREAM_REF_FETCH_COOLDOWN_MS`, which is de-dup, not rate). Set positive ms to re-arm a global gap |
| `DREAM_SAVE_MIN_FREE_DISK_MB` | **8192** (`0` disables) | `CHECKROT.3` — RAMHEAD's twin for DISK: the binary save writes a ~5.4GB `.tmp` before its atomic rename, and nothing checked free space first. Under the floor, the checkpoint DEFERS (2min retry, never dropped) exactly like the RAM guard; shutdown-class syncs are exempt. Uses `fs.statfsSync` (Node ≥18.15; silently off where absent) |
| `DREAM_CHECKPOINT_SLOTS` | **3** | Rolling checkpoint slots (`brain-weights-v0..N-1`, `.bin` + `.json` pairs). `CHECKROT.2`: the slot index comes from a **dedicated ring counter that advances only when a copy actually fires** — it used to be `saveVersion % 3` computed at the hourly-gated copy, and 12 saves/hour % 3 = 0 meant every copy hit the SAME slot (one fresh backup + two fossils, dashboard reading healthy). The ring resumes from the OLDEST slot on disk across restarts, and both files of a slot copy together so a rollback restores a coherent pair. Slots above the cap are pruned at boot |
| `DREAM_CONSOLIDATION_FORCE_MAX_MS` | **120000** | `CONSTARVE.1` — the wall-clock cap for a **forced/emergency** consolidation pass (starvation guard, dream windows). The routine cap (`DREAM_CONSOLIDATION_MAX_MS`, 45s) aborted the once-per-2h emergency pass at 48.5s with the tail (merge · schema-decay · **Tier-3 promotion** · episode-decay) unrun — inside a multi-hour cell, consolidation got 45s per 2h and promotions never happened. The pass yields between stages (~250-340ms blocks measured during a live 48s pass), so a longer wall is more yielding work, not a longer pin |
| `DREAM_PRACTICE_ITERS` | **5** | `PAINT.5` — nudge iterations per drawing-practice session. Each iteration is one 256px sketch + perceive cycle on the walk lane (the same serialized lane the look-ups ride); the session keeps a nudge only when the cosine against her banked reference percept measurably improves |
| `DREAM_PRACTICE_GAP_MS` | **1800000** (30min) | `PAINT.5` — per-concept cooldown between practice sessions on the same word. Drawing a subject queues one practice job; the loop itself gates on this plus schema+percept presence, so over-asking is free. `0` = practice every time she draws |
| `DREAM_ART_RELEARN_GAP_MS` | **600000** (10min) | `ARTJUDGE` — per-concept pacing on the ✗ reject button's relearn chain (fresh forced look-up + dictionary re-read + redraw). The verdict always counts; only the expensive relearn is paced, so reject-spam from the public viewer cannot burn look-ups. `0` = relearn on every reject |
| `UNITY_USAGE_MAX_BYTES` / `UNITY_USAGE_KEEP_LINES` | 1MB / 2000 | Rotation for `.claude/.session-usage.jsonl` (it grew unbounded to 2.5MB) |

> ⚠ **There is no `DREAM_REWALK`.** One was written on 2026-08-20 and removed the same
> day: **🔁 Savererun already does it**, through the dashboard, with a rollback
> checkpoint taken first. Two mechanisms for one job drift apart — and building the
> duplicate is what exposed the `passedPhases` gap fixed above.
