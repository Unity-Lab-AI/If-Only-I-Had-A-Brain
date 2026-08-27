---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE, not one at which
# every claim was re-read. So drift here asks the honest question — "have the
# sources moved since this page was last edited?" — and is derivable rather
# than asserted. `status: draft` until a page is read against source.
status: draft
sources:
  - server/brain-server.js
  - server/brain-ctl.js
  - js/brain/curriculum.js
verified-scope: |
  CHECKED 2026-08-27, mechanically enumerated and diffed against source:
    - EVERY `DREAM_*` flag in server/ + js/ + scripts/ vs every flag named here:
      194 vs 194, zero difference in either direction. The table is EXACT.
    - launcher/deploy `DREAM_*` vars vs this page — one apparent gap
      (DREAM_WANT_BROWSER_GPU), confirmed a batch-script local that node never
      reads, so its absence here is correct.
    - every route dispatch in server/brain-server.js (33 routes) vs the
      endpoints named here — found SEVEN undocumented loopback-gated admin
      endpoints, now sectioned; each one's requireLoopback guard read at its
      own line number.
    - the teachOps / workState paragraph against `_sparseSendBinary` (accurate:
      counted server-side, donor's own counter still not in telemetry).
    - the one source that moved (js/brain/curriculum.js) read as a diff to
      confirm it invalidates no claim on this page.
  NOT CHECKED — do not read this page as authority on:
    - the exit-42 / RestartPreventExitStatus systemd narrative and the #112.10
      Stop history (not reproduced; the box runs older code than this tree)
    - per-flag DEFAULT VALUES and prose descriptions. ⛔ Flag NAMES were diffed
      exhaustively; the 194 defaults and explanations were NOT re-read. A wrong
      default in this table would survive this pass.
    - the checkpoint/rollback narrative and the Savererun passedPhases claim
  ⚠ EXPECT ONE DRIFT ROW IMMEDIATELY: this same commit edits js/brain/curriculum.js
  (GOTCHA.9 — removing a fallback at the GOTCHA.2 spike-clear site), which is a
  source of this page. That is the checker being CORRECT, not noisy. The change was
  read as a diff before stamping and it strengthens the teachOps row rather than
  invalidating it. ⛔ Do not clear that row by bumping the hash — the honest stamp
  is "the tree I actually read", and a stamp cannot name the commit that contains it.
last-verified: "9177c862 2026-08-27"
---

# ADMIN CONTROLS — dashboard Stop / Restart / Reset, and the one-backend model

> Clarifies what the admin-only dashboard power buttons actually control, how
> the "deployed website" and "the server" relate (they are NOT two brains), and
> the #112.10 fix that makes **Stop** truly stop.
>
> Last updated: **2026-08-20** (🔁 Savererun now clears **passedPhases** too — it was re-walking cells while skipping the phases inside them; plus the env-flag reference table).
>
> **Re-verified 2026-08-27 (DOCPROV.4, 5 of 22).** ⭐ **THE ENV-FLAG TABLE IS EXACT, and that is the headline** — every `DREAM_*` flag referenced in `server/`, `js/` and `scripts/` was enumerated and diffed against every flag named on this page: **194 in the code, 194 on the page, zero difference in EITHER direction.** ⛔ **That result is worth stating loudly because a 194-row table is precisely where drift is invisible** — nobody re-reads it, and this project's worst doc failures have all been lists that quietly stopped matching. This one had not. ⚠ **Two apparent gaps were investigated and BOTH were mine, not the page's:** (1) `DREAM_WANT_BROWSER_GPU` appears in the launchers but not here — it is a **batch-script local**, set from `start.bat /browser` and consumed by the same `.bat` to decide `DREAM_NO_AUTO_GPU`; **node never reads it**, so a server env reference correctly excludes it, and the `DREAM_` prefix made it merely *look* like one. (2) A route sweep reported `/update` as documented-but-nonexistent — it exists at `:8875`, dispatched as `req.url.split('?')[0] === '/update'`, a shape the first pattern did not match. ⭐ **What the sweep DID find: seven loopback-gated endpoints this page never listed, including `/grade-advance` — the endpoint that bypasses the LAW-6 operator signoff gate.** They now have their own section. ⚠ **Only one of the three sources had actually moved** (`js/brain/curriculum.js`, +18 lines — the `GOTCHA.2` spike-clear fix), and it **strengthens** rather than contradicts the `teachOps` row below, since it removes up to 24 bogus wire frames per clear from the very counter that row tells you to trust.

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
| **⏹ Stop Brain** *(localhost only — see below)* | `POST /shutdown` | **42** | `RestartPreventExitStatus=42` → **NOT revived** | True halt — stays down until a manual start |
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

### STOPTRAP.1 — why Stop Brain is now localhost-only

⛔ The paragraph above names the trap and the fix took two months to follow it:
*"there's no dashboard to click"*. Recovery from a Stop **requires a shell**, and
**the operator of the deployed box has none** — box changes are dashboard-only by
standing rule. So the one control that could not be undone from the dashboard was
sitting on the dashboard, one click from the buttons used routinely, styled
identically to them.

Two things then made it worse rather than safer:

- The button's tooltip claimed *"On the deployed box systemd auto-resumes (clean
  stop = resume marker)"* — flatly contradicted by the exit-42 row in the table
  above, and by this file's own **verified-on-the-box** result below.
- `.claude/DEPLOYED-ADMIN-GUIDE.md` said *"systemd brings it back"* and listed
  ⏹ Stop Brain under **"Restart (keeps walk)"**.

It fired on **2026-08-25**. The trained brain went to 502 and stayed there until
the server admin ran `sudo systemctl start unity-brain`.

**The fix is reachability, not behavior.** A true halt is correct and stays a true
halt; `stop.bat` still uses `/shutdown`. But `wireGracefulStop()` in
`html/dashboard.html` now checks `location.hostname` and **`.remove()`s the button
outright** — removed, not hidden, so no stray handler or devtools unhide reaches
it — unless the page is served from `localhost` / `127.0.0.1` / `::1`, where the
operator has the shell that runs `Savestart.bat`.

⭐ **The deployed box loses nothing:** `🔄 Restart (Savestart)` was already sitting
beside it and is what that operator actually wants — force-save, resume marker,
exit 0, revived, walk resumed. Repointing Stop at `/restart` was considered and
rejected: it would have shipped two differently-labelled buttons doing the same
thing, which is the same class of defect as the tooltip that caused this.

Same commit, `deploy/unity-brain.service` gained **`RestartPreventExitStatus=42`**
— cited by name in `server/brain-server.js` since the handler was written but
**never actually present in the repo's unit file** (the box's installed copy has
it; the 2026-06-22 verification below proves that, so the repo was the drift) —
and **`StartLimitIntervalSec=0`**, because systemd's default limiter (5 starts in
10s, then permanently dead) is a second way to strand a shell-less box: a
boot-time crash loop would exhaust it in under a minute and never retry.

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

## The seven loopback-gated endpoints this page did NOT list — added 2026-08-27

⛔ **A page titled ADMIN CONTROLS was missing the grade-advance and auto-advance
endpoints** — both admin-only, both brain-mutating, both wired to dashboard buttons
that `docs/HTML-ENTRY-POINTS.md` documents by DOM id (`#d-ms-advance`,
`#d-ms-auto-advance`). ⭐ **Found by enumerating every route dispatch in
`server/brain-server.js` and diffing that set against the endpoints named here** — not
by re-reading 639 lines. All seven carry `requireLoopback(req, res, …)` as their first
statement, verified individually at the line numbers below.

| Endpoint | Method(s) | Line | What it does |
|---|---|---|---|
| `/grade-advance` | POST | `9009` | Advances the grade, **bypassing the LAW-6 Part-2 per-subject signoff**. ⚠ The single most consequential omission on this page: it is the endpoint that skips the operator gate |
| `/grade-signoff` | GET + POST | `9675` | Records / reads the per-subject operator-verified pass ledger (LAW-6 Part 2) |
| `/auto-advance` | GET + POST | `9275` | The one toggle governing **both** the `/grade-advance` signoff bypass and the runner's auto-fire-next-grade. ⛔ **It defaults ON and survives a weights clear** in a standalone `server/auto-advance.json` — see the `docs/SETUP.md` correction of 2026-08-27, which found this documented as "default false" |
| `/autoscale` | GET + POST | `9361` | Community-compute auto-scale settings (dead-zone toggle + sliders). Changes broadcast to every other admin tab as `autoScaleChanged` |
| `/sleep`, `/wake` | POST | `9464` | Puts the brain into / out of its sleep-consolidation state on demand (both share one handler) |
| `/learn-from-web` | POST | `9425` | Feeds fetched web content into the teach lane |
| `/diag/parity` | GET | `8659` | GPU↔CPU parity read. ⭐ **This is the live replacement for the dead `node scripts/gpu-cpu-parity.mjs` command that `README.md` advertised until 2026-08-27** — the script had been purged in the 2026-08-20 cleanup |

⚠ **Deliberately still NOT documented here:** `/episodes`, `/exam-answer`, `/history`
(read-only data reads, not controls) and `/health`, `/milestone`, `/public-state.json`,
`/minds-eye.json`, `/console-tail.json`, `/donor-latest.json`, `/download/donor-*`,
`/versions` (public or already covered). **Naming the exclusions is the point** — a
completeness claim with no stated boundary is the thing this whole sweep keeps finding.

⚠ **And a caution about the method itself, learned twice on this page:** a naive
`=== '/route'` sweep **missed `/update` entirely**, because it dispatches as
`req.url.split('?')[0] === '/update'` (`:8875`) — I briefly had it filed as a doc error
when the doc was right. A second pattern found **33 routes where the first found 26.**
⛔ **An endpoint enumeration is only as complete as the dispatch shapes it matches** —
if you re-run this, grep for the route STRING, then confirm each hit's guard.

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

## 🔑 TWO POLLINATIONS LANES, TWO WALLETS (2026-08-25)

⛔ **The rule, because this is the thing to get wrong:** the brain's own Pollinations use and a visitor's chat image are **separate lanes with separate keys**, and neither may ever spend the other's pollen.

| Lane | What it is | Whose key | Default |
|---|---|---|---|
| **HER lane** | The mind's-eye reference look-ups she learns shapes from, and her own drawing. The BRAIN doing the work. | **The admin's**, set on the admin dashboard (or `DREAM_POLLINATIONS_KEY` as an ops override) | ⭐ **ANONYMOUS** |
| **VISITOR lane** | An image a visitor asked Unity for in chat. | **That visitor's own**, from their own browser's localStorage | ⭐ **ANONYMOUS** |

**Setting it:** the admin dashboard carries a *Pollinations key — her look-ups only* field under the milestone controls. Empty means anonymous, which is the default and fully supported; set it only to spend pollen on making her learning faster or her references better. Backed by `GET`/`POST /pollinations-key` (loopback-gated like every other brain-mutating endpoint).

⚠ **The key never leaves the box.** `GET /pollinations-key` returns whether one is set, where it came from, and its **last four characters** — never the key. A credential cannot leak back out through the dashboard it was typed into.

⚠ **It survives a fresh walk.** Stored at `server/pollinations-admin.json`, mode `0600`, gitignored, deploy-excluded, and on the never-clear protected list beside `identity-core.json`. A fresh walk wipes what she learned; it must not log the operator out.

⛔ **THE BUG THIS FIXED, so it is not reintroduced.** One key served both lanes: the server built a fully keyed URL and sent it to the visitor's browser, so **every visitor's chat image was billed to the admin.** It was latent only because the key defaulted to empty — adding the dashboard field without separating the lanes first would have started the drain immediately. The chat lane now sends the **prompt only** and the client builds the URL with its own key. ⚠ The original reason for sending a server-built URL is also gone: it was a keyed-era fix for a fresh visitor whose key had not loaded and who therefore could not build a URL at all. Anonymous access removed that constraint — every client can always build one now. **Do not send a server-keyed image URL to a client.**

---

## ✅ THE FIVE DARK INSTRUMENTS — now rendered (fixed 2026-08-25)

**All five below are now on the board.** Kept as a section rather than deleted, because *how* they were dark is the reusable lesson, and because the rendering rule at the top is the thing that makes this class of defect findable at all.

| Now shows | Where | Reading it |
|---|---|---|
| **`d-voice-verdict`** + detail | Speech panel | `matrix-driven` green / `oracle-carried` amber / `oracle-only` red / `unmeasured` **grey**. ⚠ Grey is deliberate — *unmeasured* is an absence of evidence, and colouring it green would be exactly the reassuring lie the old `canSpeak` field told |
| **last refusal** | Speech panel | The rejection reason **WITH ITS AGE**, amber under 60s. A reason with no age is indistinguishable from a current one |
| **curiosity** | Speech panel | `N gaps · N asked`. Gaps with **zero** asks goes amber and says so plainly — that is a training fact (the interrogative weights are not trained yet), not a bug to hide |
| **`loop service`** | Profiling panel | `N% serviced · Nms/min late`, placed directly under `loop delay` and `loop freezes` **because it exists to contradict them** — both answer *"was there one long stall?"*, this answers *"was the loop available at all?"* |
| **practice / your verdicts** | Speech panel | Session count and last resemblance delta; `kept` vs `no measurable gain, discarded` — a discard is a CORRECT outcome, since only measurable improvement is kept. Plus accept/redraw/ban counts |

⛔ **The rule that made this findable — keep it in mind when adding any field: the dashboard renders state fields BY NAME ONLY.** There is no generic walk over the state object — every value reaches the DOM through an explicit reference (24 `row(label, value)` calls in the profiling panel, plus per-panel interpolation). **Therefore: absence from `html/dashboard.html` is proof of non-rendering, not merely evidence of it.** That is worth stating because it makes the audit below decidable by grep instead of by opinion.

**How they came to be dark, measured 2026-08-25** — each was published by `server/brain-server/state.js` on every broadcast and referenced **zero** times by the page:

| State field | What it carries | Why its absence matters |
|---|---|---|
| **`state.voice`** | The evidence-based speech block: `status` (`matrix-driven` / `unmeasured` / …), a written `reason`, `matrixDrivenPct` (share of emissions that came from her trained weights rather than the dictionary oracle), `everFired` word_motor buckets, and the **last emit rejection WITH ITS AGE** | ⛔ **This block exists specifically because the board used to lie.** `canSpeak` was pure grade arithmetic wearing a capability name; it was renamed `minGradeCleared` and *replaced* by this evidence block. The replacement was built and then never surfaced — so the lying field was removed and the honest one is invisible. It even distinguishes *"no sample exists"* from *"she cannot speak"*, which is the exact distinction the board was previously incapable of |
| **`state.voice.minGradeCleared`** | Grade arithmetic, correctly named now | Harmless alone; it is the field the old lie lived in, kept honest by its name |
| **`state.profiling.loopStarve`** | `lateMsPerMin` (total ms/min the loop owed and did not deliver) + `servicePct` | ⛔ Built for a failure mode **every other channel is structurally blind to**: thousands of short stalls rather than one long one. A loop 200ms late on every 100ms sample never trips a max-stall threshold and is still unavailable two-thirds of the time. `loop freezes` **is** rendered and reads healthy during exactly that failure |
| **`state.ownArt.practice` / `.feedback`** | Drawing-practice skill scores; accept/reject/ban verdict counts | Both systems shipped and work. Whether practice is improving her hand, and whether her verdicts are landing, are unanswerable from the board |
| **`state.curiosity`** | Curiosity-gap counters — where low confidence should have produced a question | The inquisitive drive is opt-in and its uptake is unmeasurable |

⚠ **`separability` and `lookups` ARE rendered** (`m.speechHealth` → `sh.separability`, and the look-up counters on the mind's-eye page) — they were in the same audit and came back clean. Listed so nobody re-checks them.

✅ **Fixed the same day, after the sweep closed** — the sweep's job was to state accurately which instruments were dark; building the rows was separate work and was done separately.

---

## 🎛 Env knobs that change TRAINING (2026-08-20)

Every one of these is opt-in with a stated default. **The buttons above are the normal
way to drive the box** — these exist for a diagnostic run or a deliberate one-off, and
each is listed with what it actually costs.

| Env | Default | What it changes |
|---|---|---|
| `DREAM_PHASE_BUDGET_MS` | **0 — NO BUDGET** | A per-phase wall-clock. Was 20min; the operator removed it (*"some cells are big they take the length of time they take"*). Set positive to arm it when hunting a runaway phase. ⛔ `0` used to compute `Date.now() + 0` and stop after ONE rep while logging "disabled" — fixed, `0` now truly means off |
| `DREAM_STRUCTURE_DOSE` | **1** (full authored reps) | Scales the sentence-structure rep counts. Was cut to 0.4; restored 2026-08-20. **The consolidation gate is now the only thing keeping the walk finite** — see `CONSTRAINTS.md §RE-PRICE THE WALK BEFORE REMOVING A GATE` |
| `DREAM_LEARN_GEOMETRY` | **ON** (`0` disables) | ⭐ **She reshapes her own semantic geometry as she reads.** Every sentence in the teach path moves its words a little toward the company they keep — distributional meaning computed from the corpus SHE reads rather than imported wholesale. The pretrained vectors become a **starting shape she grows out of**, and the learned part is a separate persisted delta, so *how much of her geometry is genuinely hers* is a measurable quantity rather than an argument. ⚠ Two properties inside `refineFromContext` are what make it learn instead of collapse, and **both were derived by measurement**: **mean-centring** (without it every context is dominated by the same high-frequency words, so the whole vocabulary drifts to one centroid — measured: unrelated words converged *faster* than related ones) and a **delta cap of 0.5** (without it the outcome depends on total exposure, and at 2400 passes everything saturated to ~0.99 similar). Verified on the real class: margin −0.008 → +0.115 at 60 passes → **+0.421 at 2060**, with unrelated words going *negative*. Runs **once per sentence, not per rep** — otherwise rep count silently scales how far meaning drifts |
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
| `DREAM_UPLOAD_PACE_LOWATER_MB` | 96 native / 8 browser ⛔ *(the split was BROKEN until 2026-08-25 — see BOUNDCAP.1 note below the table; every donor got 96)* | In-flight bytes the chunk pump keeps on the donor socket before pausing for drain. The 8MB default existed for BROWSER donors whose busy tab can't service its own socket; a NATIVE donor drains on a dedicated thread, and at ≤14MB in flight the wire sat IDLE through every 3-4s loop slab — the entire "4MB/s uplink" myth (KI-24). Every upload logs `UPLINK measured … MB/s` so the real rate is a console read (first live read post-fix: 75-350MB/s) |
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
| `DREAM_ART_WEIGHT_REPS` | **6** | `ARTWEIGHT` — Hebbian reps per pair when DRAWING binds subject↔parts (tag 35) and subjects↔each-other↔place (tag 13). Making art is experience, so it moves her weights; before this the whole ~930-line draw+practice span had **zero** weight-touching calls (`_practiceDrawing` writes to the visual STORE, and store state is not synapses). Raise to bind harder per drawing, lower to make art cheaper than the walk |
| `DREAM_ART_WEIGHT_MAX_PAIRS` | **24** | Cap on pairs queued from ONE drawing. A complex scene has many parts; without a bound a single elaborate piece could out-teach a curriculum cell |
| `DREAM_ART_WEIGHT_MAX_QUEUE` | **200** | Cap on the pending art-teach queue. ⚠ A bound, not a rate: over-cap pairs are DROPPED rather than backing up, because an unbounded teach queue competes with the walk for the same lane |
| `DREAM_VM_RELATE_REPS` | **6** | `VMRELATE` — the SEEING twin of the above: reps per pair when a trusted look-up binds the whole phrase she looked at (ORDER tag 13 + ATTACH tag 35). ⚠ Ungated by `_curriculumInProgress` on purpose — that flag is true for the entire multi-week walk, so gating it meant seeing never moved her weights at all |
| `DREAM_VM_RELATE_MAX_PAIRS` | **24** | Cap on pairs queued from one look-up |
| `DREAM_VM_RELATE_MAX_QUEUE` | **200** | Cap on the pending see-teach queue. Same drop-over-cap rule as the art queue, same reason |
| `DREAM_PERCEPT_GROUND_MAX_QUEUE` | **200** | `VMUSE.5d` — cap on percept-grounding jobs waiting for the chat-teach drain. Grounding is DEFERRED rather than dropped mid-walk: injecting a percept into `sem` while a teach pattern is in flight corrupts the pattern, so it waits for the gap between teach calls |
| `DREAM_OWNART_INGEST_WALK_MS` | **60000** | How often the schema-learn may run DURING the walk (idle runs use 5s). ⛔ The gate used to be idle-only — **and she is never idle**, so it never ran. A cost gate that resolves to "never" is a deletion, not a bound; this is the mid-walk allowance that fixed it |
| `DREAM_REL_USE_MIN_MARGIN` | **0.15** | `VMUSE.5` — how far the winning relation band must lead the runner-up, as a fraction of its own score, before a relation is treated as KNOWN. Below it the read reports `flat` and every consumer gets `null`. ⚠ Lowering this does not make her know more; it makes her act on noise |
| `DREAM_REL_USE_TTL_MS` | **30000** | Per-word cache on the relation read. Four consumers asking the same question within one tick should cost one propagate, not four |
| `DREAM_CHAT_IMAGE_PRIORITY_MS` | **45000** | `LOOKQUEUE`/`CHATPREEMPT` — the window after a chat image intent during which the mind's-eye look lane stands down. ⚠ A TIME window rather than a lock, deliberately: the chat image is fetched by the BROWSER, out of this process's sight, so there is nothing to release and a lock with no releaser is a lane that never reopens. The in-flight look is additionally ABORTED on the same event, because the window alone cannot stop a fetch already holding the single anonymous slot |
| `DREAM_WEIGHTS_PAIR_TOL_SEC` | **600** | `PAIRDESYNC.2` — how far the weights json's `savedAt` may sit from the bin's mtime before boot warns the pair is incoherent. ⚠ **WARNS, never refuses**: an unbootable brain for a shell-less operator is the Stop-button mistake again |
| `DREAM_ART_RELEARN_GAP_MS` | **600000** (10min) | `ARTJUDGE` — per-concept pacing on the ✗ reject button's relearn chain (fresh forced look-up + dictionary re-read + redraw). The verdict always counts; only the expensive relearn is paced, so reject-spam from the public viewer cannot burn look-ups. `0` = relearn on every reject |
| `UNITY_USAGE_MAX_BYTES` / `UNITY_USAGE_KEEP_LINES` | 1MB / 2000 | Rotation for `.claude/.session-usage.jsonl` (it grew unbounded to 2.5MB) |

> ⛔ **BOUNDCAP.1 (2026-08-25) — the `96 native / 8 browser` split above did not exist in the code until this date, and neither did one other.** Both sites decided *"is this the native binary?"* with `if (client.donorAppVersion)` — and `gpu_register` stamps the string `'browser'` when no version is sent, so **that test is truthy for every donor**. Consequences: browser donors were handed the **96MB** in-flight pump window, losing precisely the protection the row above says they keep (their busy tab cannot service its own socket, which is the entire reason the 8MB default exists); and the bound-propagate router served browser donors the **native** protocol, sending index payloads where `compute.html` reads a dense array. ⭐ Nativeness has ONE owner now — `_donorIsNative()`, which tests the sentinel instead of the field's presence — and the propagate protocol is chosen by an **advertised** `boundResidentRead` capability (see `docs/WEBSOCKET.md § gpu_register`). ⚠ Every *other* capability gate was unaffected, and for a reason worth keeping: they all regex-parse a semver, and `'browser'` fails `^\d+\.\d+\.\d+` — so **version-gated checks got browser-exclusion for free while the two boolean-presence checks did not.**

> ⚠ **There is no `DREAM_REWALK`.** One was written on 2026-08-20 and removed the same
> day: **🔁 Savererun already does it**, through the dashboard, with a rollback
> checkpoint taken first. Two mechanisms for one job drift apart — and building the
> duplicate is what exposed the `passedPhases` gap fixed above.

---

## 🗂 COMPLETE `DREAM_*` REFERENCE — the other 139

The table above is the curated set: knobs that change **training**, each written up with what it costs. It covered **39 of 178** environment flags. This section covers the rest, so that "is this flag documented?" has an answer for every one of them.

**How to read a row.** ✅ = the default was read out of the code. ⚠ = the flag exists and its call site is named, but the default was **not** verified for this sweep — treat the description as the flag's purpose, not as a promise about its value, and confirm at the call site before relying on it. A wrong default in a doc is worse than an absent one.

**Lever vs escape hatch.** A **lever** is meant to be turned — it tunes behaviour. An **escape hatch** exists so a failure mode has a way out and should stay at its default in normal operation. The distinction is what stops an operator from "tuning" a safety valve.

### Boot & state — ⛔ the highest-consequence flags in the project

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_KEEP_STATE` | ✅ unset (= WIPE) | **escape hatch** | ⛔ **The fresh-walk-vs-resume switch, and the single most consequential variable here.** `'1'` = keep prior weights and resume; anything else = `autoClearStaleState()` wipes weights, conversations and episodic memory at boot. `Savestart.bat` / `Savestart.sh` set it; `start.bat` / `start.sh` deliberately do not. **Setting this wrong costs the entire training run**, which is why the launchers own it and why `start.*` gates on a Y/N prompt |
| `DREAM_FORCE_CLEAR` | ✅ unset | escape hatch | Force the wipe regardless. Now redundant — the wipe is already unconditional on a fresh start — and kept only as a legacy override |
| `DREAM_NO_AUTO_GPU` | ✅ unset | lever | `'1'` skips auto-launching a local browser donor tab. Set on every headless deployment; the systemd unit ships with it |
| `DREAM_NO_HEAP_REEXEC` / `DREAM_HEAP_REEXECED` | ⚠ | escape hatch | Control / mark the self-re-exec that raises V8's heap limits. The second is set BY the re-exec to prevent an infinite loop — **never set it by hand** |
| `DREAM_BRAIN_BUDGET_MB` | ✅ `0` (= derive) | lever | Hard RAM budget for the brain. `0` derives it from free host RAM, which is why the neuron count moves between boots. Set it to pin the size |
| `DREAM_MAX_GRADE` | ⚠ | lever | Ceiling grade for the walk — stop the curriculum at a chosen grade |
| `DREAM_HELD_BACK` | ✅ on (`'0'` disables) | escape hatch | Mastery-gated remediation. `'0'` lets a failed cell through without the escalating re-teach ladder |
| `DREAM_TICK_MS` / `DREAM_TICK_BREATHE_MS` | ⚠ | lever | Brain tick interval and the yield between ticks |
| `DREAM_CPU_PROFILE_EVERY_MS` | **1_800_000** (30 min; `0` = one-shot) | lever | `PROFREARM.1` — how often the self-profile REPEATS after its first run at +150s. ⛔ **It used to run once, and once is the wrong number.** The code claimed +150s was *"boot settled, the walk in its steady rhythm"* — a live read disproved that: at +150s the canonical upload is often still running and every row is being normalised for the FIRST time. ⭐ **The concrete cost: `NORMROWS.2`'s deadband skips rows already at target, which cannot fire during first-normalisation — so the one-shot profile was structurally blind to a fix whose benefit is a steady-state property.** `state.profiling.cpuProfile` is now the LATEST sample and `cpuProfileFirst` keeps the boot picture, so early-vs-steady is comparable. Floor of 60s; the timer is `unref`'d so a diagnostic never holds the process open |
| `DREAM_CPU_PROFILE` | ✅ on (`0` disables) | lever | ⭐ **The one-shot main-thread self-profile (`RHYTHM3S`)** — samples 45s at +150s uptime and ranks functions by **self-time**, which is how *"what is eating the loop?"* gets answered by the V8 profiler instead of inferred from block rhythms. It found `injectEmbeddingToRegion` (34.9%) + `_clearSpikes` (23.0%) = **58% of the main thread**, then `_teachLateralInhibition` (33.8%), then `normalizeRows` (27.5%) as each was fixed. ⛔ **Read it from `state.profiling.cpuProfile`, NOT the console** — at walk speed the ring is a nine-second window (KI-36) and the table scrolls out before you can fetch it. `null` there means *not sampled yet*, never *the loop is fine* |
| `DREAM_SELF_UPDATE_CMD` / `DREAM_UPDATE_STALE_MS` | ⚠ | lever | Override the self-update command; staleness window for the update check |

### Gates — advisory by default, hard on request

Per the 2026-06-27 amendment a cell passes on **learning completion**, not answer correctness. These restore the old blocking behaviour per check.

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_CELL_PASS_HARD` | ✅ unset | escape hatch | `'1'` restores probe/battery/health-decides-pass wholesale |
| `DREAM_HEALTH_GATE_HARD` | ✅ unset (advisory) | escape hatch | `'1'` makes the per-grade health gate block again |
| `DREAM_BATTERY_GATE_HARD` | ✅ unset (advisory) | escape hatch | `'1'` makes the K-STUDENT battery block again |
| `DREAM_BATTERY_GATE_ADVISORY` | ⚠ | escape hatch | The explicit advisory-side twin of the above |
| `DREAM_GATE_PATH_MIN` | ✅ `0.80` | lever | Minimum READ/THINK/TALK pathway score |
| `DREAM_GATE_PROD_MIN` | ✅ `0.80` | lever | Minimum production score |
| `DREAM_GATE_GPU_PROBES` | ⚠ | lever | Whether gate probes may use the GPU lane |
| `DREAM_BATTERY_DEADLINE_MS` | ✅ `8` | lever | Battery deadline (note the unit in the name against the value — verify at the call site before tuning) |
| `DREAM_BATTERY_QUESTION_TIMEOUT_MS` | ✅ `45_000` | lever | Per-question timeout in the battery |
| `DREAM_GRADE_MAJOR_ROUNDS` | ✅ `2` (range 1–5) | **lever, and a walk-price term** | ⛔ How many re-teach rounds a grade gets before a still-unpassed cell is recorded as blocked and the walk proceeds. **This is the bound that makes the grade-major block finite** — unbounded, the walk wedges forever on a single stuck course. Changing it re-prices the whole walk; see `CONSTRAINTS.md §RE-PRICE THE WALK BEFORE REMOVING A GATE` |

### Curriculum & teaching

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_PRECELL_VOCAB` | ⚠ | lever | The pre-cell vocabulary pass that teaches meanings before bindings |
| `DREAM_MECH_EVERY_CELL` | ✅ opt-**out** | lever | Language mechanics in every ELA cell. Runs by default — this disables it |
| `DREAM_K_UPFRONT_SEED` | ⚠ off | lever | Upfront K-vocabulary seeding. Off deliberately — an upfront bulk Hebbian blurs basins |
| `DREAM_SENTENCE_TRANSITION_REPS` | ✅ `10` | lever | Reps for sentence-transition training |
| `DREAM_SELF_FRAME_LIGHT_MAX_UNITS` | ⚠ | lever | Cap for the **light** first-person reframe at the vocab/sentence chokepoints (distinct from `DREAM_SELF_FRAME_MAX_UNITS` above) |
| `DREAM_PATTERN_TEACH_THROTTLE_MS` | ⚠ | lever | Throttle between pattern-teach fires |
| `DREAM_PER_WORD_TEACH_TIMEOUT_MS` | ⚠ | escape hatch | Per-word teach timeout so one word cannot hang a phase |
| `DREAM_TRICKLE_BATCH` | ⚠ | lever | Batch size for the dream-cycle vocabulary trickle |
| `DREAM_WINDOW_MAX_MS` | ⚠ | lever | Cap on a dream window |
| `DREAM_DEFINITION_CACHE_FILE` | ✅ `server/definition-cache.json` (`''` opts out) | lever | Persistent dictionary-definition cache. After 2-3 cold runs it approaches full coverage and the prefetch completes with no API hits |
| `DREAM_DEF_CACHE_CAP` | ⚠ | lever | Entry cap on that cache |

### Consolidation & sleep

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_CONSOLIDATION_DISABLE` | ✅ unset | escape hatch | `'1'` kills consolidation entirely. ⛔ Consolidation is what SEPARATES representations — disabling it is disabling her sleep learning |
| `DREAM_CONSOLIDATION_MAX_REPLAY_NNZ` | ✅ `5_000_000` | **lever, load-bearing** | Non-zero ceiling above which the replay Hebbian is SKIPPED. Against an intra matrix of ~360M nnz this guard fired on every pass at biological scale, which is why `novelConsolidated` read 0 — her sleep learned nothing. The GPU replay route exists now; this is the knob that decides whether it engages |
| `DREAM_CONSOLIDATION_GPU_REPLAY_MAX` | ⚠ | lever | Ceiling for the GPU replay route specifically |
| `DREAM_CONSOLIDATION_FORCE_MS` | ⚠ | lever | Cadence for forced passes (distinct from `_FORCE_MAX_MS` above, which is a duration cap) |
| `DREAM_RECOMB_REPS` / `DREAM_RECOMB_ROUNDS` / `DREAM_RECOMB_MIN_WORDS` / `DREAM_RECOMB_MIN_UNIQUE_RATIO` / `DREAM_RECOMB_COHERENCE_MIN` | ⚠ | levers | Dream-recombination shape: how many reps and rounds, and the floors a recombined candidate must clear to count as novel |

### Emission & speech

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_DICT_FALLBACK` | ✅ unset | **escape hatch** | ⛔ `'1'` restores dictionary RETRIEVAL when the trained matrix produces nothing. Off by default on purpose: a retrieved word is the dictionary speaking, not her. Leaving it off is what makes honest silence honest |
| `DREAM_CHAT_MAX_WORDS` | ✅ `10` | lever | Hard ceiling on a chat reply's length |
| `DREAM_CHAT_COHERENCE_FLOOR` / `DREAM_COHERENCE_MIN` | ⚠ | levers | Floors below which she degrades to her strongest single word or stays quiet rather than emit a scrambled string |
| `DREAM_WORD_MOTOR_VOCAB_CAP` | ✅ `10` | lever | Vocabulary cap on the word-motor band |
| `DREAM_WORDNORM` / `DREAM_WORDNORM_ALPHA` | ⚠ | levers | Per-bucket normalisation of word-motor activation and its strength — aimed at the frequency bias where common words win every argmax |
| `DREAM_SURPRISE_MAX` | ⚠ | escape hatch | Ceiling on the predictive-coding surprise gate, so a single high-error event cannot multiply the learning rate without bound |
| `DREAM_SAT_RATIO` / `DREAM_SAT_MEANABS` / `DREAM_SAT_MEANCOS` / `DREAM_SAT_SAMPLE` | ⚠ / ⚠ / ⚠ / ✅ `10` | levers | Saturation detection on `sem→motor` — the thresholds that decide a projection has collapsed, and how many rows are sampled to decide it |
| `DREAM_BC_VOCAB_MIN` | ✅ `0.85` | lever | Vocabulary-coherence floor |
| `DREAM_BC_EMISSION_DOM_MAX` | ✅ `0.45` | lever | Maximum share one word may take of emissions before it counts as domination |
| `DREAM_BC_RECTIFY_DECAY` / `DREAM_BC_RECTIFY_NORM` | ✅ `0.5` / `0.6` | levers | Rectification strength when a collapse is detected |
| `DREAM_BC_COMPOUND_COH_MIN` | ⚠ | lever | Coherence floor for compound emissions |
| `DREAM_SPEAKLOOP` + `DREAM_SPEAKLOOP_TEACH_ROUNDS` / `DREAM_SPEAKLOOP_TEACH_MAX_MS` / `DREAM_SPEAKLOOP_DRILL_ROUNDS` / `DREAM_SPEAKLOOP_DRILL_MAX_MS` / `DREAM_SPEAKLOOP_MAX_FAILS` | ⚠ | levers | The speak-loop drill: teach-then-drill rounds, their wall-clocks, and how many failures end it |
| `DREAM_LOOKUP_HOLD_MS` | ✅ `4500` | lever | How long a definition look-up holds before emission proceeds |

### Inner voice

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_INNERVOICE_FORCE_CPU` | ✅ unset | escape hatch | `'1'` forces inner-voice generation onto the CPU. ⭐ **`SCALEWALK.2` reuses this same flag rather than inventing a second one**, because it gates the same question: whether a CPU cortex path may run at biological scale. With it unset, `injectEmbeddingToRegion` skips the dense `externalCurrent` expansion above 2M neurons — that array's only readers are inside `step()`, and `step()` is unreachable for the cortex at scale (the main tick never calls it, `stepAwait` refuses above 2M, and all five raw-step sites carry the same refusal). Set it to `1` and the CPU write returns, exactly as it does for the inner voice |
| `DREAM_INNERVOICE_GPU_GEN` | ✅ off → **now ON** | lever | GPU generation for the inner voice. Shipped dormant and switched on 2026-08-25 |
| `DREAM_INNERVOICE_GPU_GEN_MIN_DONORS` | ✅ `1` | lever | Donors required before GPU generation engages |
| `DREAM_INNERVOICE_MAX_NEURONS` | ✅ `2_000_000` | escape hatch | Above this the CPU inner-voice path no-ops rather than pin the loop. ⚠ This line is load-bearing in more than one place — a capability branch elsewhere was silently dead because it tested `typeof readText === 'function'` (always true) instead of testing this ceiling |

### Cortical microstructure — the K-layer switches

Each shapes how the cortex is WIRED, so each is applied at construction. ⛔ Changing one changes the geometry, and geometry changes are not comparable across a training run — see `docs/TRAJECTORY-CAPTURE.md` on never interpolating a curve across one.

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_SMALL_WORLD` | ⚠ on for size ≥ 2K | lever | Watts-Strogatz hybrid connectivity (70% local / 25% medium / 5% long-range) |
| `DREAM_MICROCOLUMNS` | ⚠ | lever | Mountcastle microcolumns (`columnSize` 80 default), region-boundary respecting |
| `DREAM_LAMINATION` | ⚠ | lever | Six-layer lamination (L1 5% · L2/3 25% · L4 25% · L5 25% · L6 20%) |
| `DREAM_HUBS` | ⚠ | lever | Rich-club hub neurons — 5% of L2/3 + L5, deterministic-hash seeded so they persist across reboots |
| `DREAM_THETA_GAMMA` | ⚠ | lever | 6 Hz theta drive modulation + 40 Hz theta-gated gamma on the learning rate |
| `DREAM_TOPOGRAPHIC` | ✅ off → **now ON** | lever | Topographic cross-projections (70% topographic / 30% scattering). Shipped dormant, switched on 2026-08-25 |
| `DREAM_PREDICTIVE_CODING` | ⚠ | lever | The Friston-style prediction-error loop that gates plasticity |
| `DREAM_GW_IGNITION` | ⚠ | lever | Global-workspace ignition threshold (Baars / Dehaene-Changeux) |
| `DREAM_NOISE_GATE` | ✅ **ON by default** | lever | Noise gating on the teach path. ⚠ Documented elsewhere as "ships dormant" — that is **wrong**, it is on |
| `DREAM_ANNEAL_TEMP` | ⚠ | lever | Annealing temperature schedule |
| `DREAM_PSI_GAIN_SCALE` | ⚠ | lever | Scales the Ψ consciousness term's global gain contribution |
| `DREAM_SM_LR_SCALE` / `DREAM_SM_WMAX` | ⚠ | levers | Sparse-matrix learning-rate scale and weight clamp. ⛔ `wMax` clamps have been lost in a binary save/load round-trip before, leaving projections at ±Infinity — that is one of the two bugs the unconditional fresh-start wipe exists to prevent |

### Language cortex

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_LANG_CORTEX` | ✅ `10` | lever | Language-cortex sizing term |
| `DREAM_LANG_RAM_FRACTION` | ⚠ | lever | Share of the RAM budget the dense language cortex may claim |
| `DREAM_LANG_VRAM_RESERVE_MB` | ⚠ | lever | VRAM held back for the language cortex |

### Donor pool, DF.7 replicas & the wire

The donor is data-parallel: every donor holds a full replica and the server merges Hebbian deltas. These govern that lane. ⚠ Most defaults here are unverified for this sweep; the wire is also where a wrong value is most expensive, so confirm at the call site.

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_MIN_DONOR_VERSION` | **`0.3.26`** | escape hatch | Minimum donor version admitted to the pool. Load-bearing: masked bound plasticity (SPRS type 13) requires ≥ 0.3.26, and an older donor silently cannot do it. ⭐ **Default raised 0.3.7 → 0.3.26 on 2026-08-25** — this row already named 0.3.26 as the threshold while the code default sat 22 releases behind it. ⚠ Older donors are **refused at `gpu_register`** with a message naming both versions and the download link; they are not silently degraded. ⛔ Raise it only to a version where a lane **the walk depends on** moved onto the donor — not merely to whatever is newest, because community compute is donated and a floor that turns away working cards has its own cost |
| `DREAM_RECOMMENDED_DONOR_VERSION` | **`0.3.30`** | lever | ⭐ The donor build this brain WANTS running against it, handed to every donor in the `welcome` handshake. A donor on 0.3.30+ that sees a newer version here **exits at its next disconnect so the launcher installs it, before any reconnect attempt** — which is how a pod picks up a new binary after an Update & Fresh Walk press instead of rejoining on a stale one. ⚠ **NOT the hard floor** — a donor between `DREAM_MIN_DONOR_VERSION` and this keeps donating normally and upgrades at its next natural disconnect, so nobody is kicked mid-walk for being one release behind. Use it for a **staged rollout**: hold it at the old version to keep a new release voluntary. ⛔ **Never set it ahead of a published tag.** Donors would exit, the launcher would reinstall the same older `releases/latest`, and every pod would download in a loop instead of donating. The donor carries an anti-loop guard for exactly that (it refuses to bounce twice for the same upgrade and says so loudly) — but the guard is a net, not a licence |
| `DREAM_NO_DONOR_ID_EVICT` | unset (eviction ON) | escape hatch | ⛔ Disables reaping a stale donor socket that shares the incoming `donorId` at `gpu_register`. **Leave it unset.** With eviction ON, a donor reconnecting after a pod restart no longer initialises **behind a corpse**: the previous process's half-open socket is terminated *before* any `gpu_init` is dispatched, instead of being reaped by a ping sweep mid-init — which was costing a full 7-cluster init cycle and ~60 s on **every** donor start (measured on the live pod 2026-08-25). ⭐ The discriminator is exact rather than heuristic: a donor sends `gpu_register` **once per connection**, so a register for a `donorId` that already holds a socket means that socket will never register again. ⚠ **Set to `1` only for the one shape eviction would be wrong for** — two live donor processes sharing an install, hence one persistent id. That layout already collides on the leaderboard row and is not otherwise supported; the standard launcher runs a single process with `--gpus all` as one compute unit |
| `DREAM_DONOR_FIT_MB` | ⚠ | lever | VRAM a donor must hold to be eligible |
| `DREAM_NO_DONOR_GRIND` | ⚠ | escape hatch | Stop hammering a donor that cannot keep up |
| `DREAM_RESPECT_VRAM_CAP` | ⚠ | lever | Honour a donor's advertised VRAM cap |
| `DREAM_SPARSE_CHUNK_NNZ` | ⚠ | lever | Non-zeros per chunked sparse upload frame |
| `DREAM_SPARSE_UPLOAD_TIMEOUT_MS` / `DREAM_SPARSE_UPLOAD_TIMEOUT_MAX_MS` | ⚠ | escape hatches | Per-upload timeout and its ceiling |
| `DREAM_UPLOAD_MIN_MBPS` / `DREAM_UPLOAD_WAIT_DONOR_MS` | ⚠ | levers | Minimum acceptable uplink rate; how long to wait for a donor before proceeding |
| `DREAM_REUPLOAD_DEBOUNCE_MS` | ⚠ | lever | Debounce on dirty-matrix re-upload so a burst of writes ships once |
| `DREAM_BATCH_STALL_MS` | ⚠ | escape hatch | When a compute batch counts as stalled |
| `DREAM_HB_BUF_FORGIVE_MB` / `DREAM_WS_SOFT_SHED_MB` | ⚠ | escape hatches | Backpressure forgiveness and the soft-shed threshold on the donor socket |
| `DREAM_CSR_FREE_MIN_MB` / `DREAM_PATTERN_LANE_CAP_MB` | ⚠ | escape hatches | Free-RAM floor before CSR allocation; cap on the pattern lane |
| `DREAM_DELTA_COLIDX` | ⚠ **DISABLED, cause unknown** | lever | Delta column-index encoding. ⛔ Currently off with the reason **not** established — do not enable it without finding out why it was disabled |
| `DREAM_GEN_PROPAGATE_CHUNKED` | ✅ off → **now ON** | lever | Chunked propagate on the generation path. Shipped dormant, switched on 2026-08-25 |
| `DREAM_RESYNC_TEACH_THROTTLE_MS` | ⚠ | lever | Throttle on resync during teaching |
| `DREAM_DF7_FANOUT` · `DREAM_DF7_FANOUT_PROPAGATE` | ⚠ | levers | Fan-out compute across replicas. ⚠ `DREAM_DF7_FANOUT_PROPAGATE` **auto-enables once replica sync is proven** — it is NOT a dormant feature waiting to be switched on, and reading it as one is a mistake already made |
| `DREAM_DF7_MIN_VRAM_MB` · `DREAM_DF7_MIN_BIND_MB` · `DREAM_DF7_MIRROR_CAP_MB` | ⚠ | levers | Replica eligibility thresholds and mirror sizing |
| `DREAM_DF7_SYNC_DURING_TEACH` · `DREAM_DF7_SYNC_PACE_MAX_MS` · `DREAM_DF7_SYNC_TEACH_PACE_MIN_MS` · `DREAM_DF7_SYNC_TEACH_PACE_MAX_MS` | ⚠ | levers | Whether replicas sync while teaching, and the pacing envelope when they do |
| `DREAM_DF7_REBROADCAST_MS` · `DREAM_DF7_REBROADCAST_DUTY` · `DREAM_DF7_REBALANCE_MS` | ⚠ | levers | Master re-broadcast cadence, its duty cycle, and the rebalance interval |
| `DREAM_DF7_PROMOTE_COOLDOWN_S` · `DREAM_DF7_FLOOD_COOLDOWN_MS` | ⚠ | escape hatches | How soon a replica may be promoted to PRIMARY again, and the anti-flood cooldown |
| `DREAM_DF7_INFLIGHT` · `DREAM_DF7_READ_FRESH_MS` · `DREAM_DF7_WORK_FLOOR` · `DREAM_DF7_BACKED_PENALTY` | ⚠ | levers | In-flight budget, read-freshness window, minimum work share, and the scoring penalty applied to a backed replica |
| `DREAM_SUBSTEPS` | ⚠ | lever | The base substeps value. ⚠ Distinct from `DREAM_SUBSTEPS_NATIVE` / `_TARGET_MS` / `_MAX` in the curated table above — those govern the adaptive controller; this is the underlying figure |

### Art, vision & the mind's eye

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_DRAW_CANVAS` | ✅ `512` | lever | Canvas side for drawing |
| `DREAM_IMAGINE_DRAW_PROB` | ✅ `0.18` | lever | Probability an imagined thought becomes a drawing |
| `DREAM_EYE_SHOW_THOUGHT` | ⚠ off | lever | Show the current thought word on the mind's-eye frame |
| `DREAM_SPONTANEOUS_IMG_AROUSAL` | ✅ `0.7` | lever | Arousal threshold above which she spontaneously makes an image |
| `DREAM_SPONTANEOUS_IMG_GAP_MS` | ✅ `300_000` (5min) | lever | Minimum gap between spontaneous images |
| `DREAM_REF_FETCH_COOLDOWN_MS` | ✅ `21_600_000` (6h) | lever | Per-concept re-fetch cooldown. ⚠ This is **de-duplication, not rate limiting** — it stops her re-looking-up the same concept, and the ✗ reject button deliberately forces past it |
| `DREAM_REF_FETCH_TIMEOUT_MS` | ✅ `60_000` | escape hatch | Timeout on one reference fetch |
| `DREAM_REF_MIN_DETAIL` | ✅ `200` | lever | Minimum detail a fetched reference must show to be worth learning from |
| `DREAM_VM_RECALL_COOLDOWN_MS` | ⚠ | lever | Cooldown on recalling the same visual memory |

### Endocrine, glands & introspection (2026-08-25)

⚠ **There are no new environment flags here, and that is a deliberate choice rather than an oversight — so it is stated rather than left as an absence.**

The endocrine constants — `RECEPTOR_MIN` (0.35), `RECEPTOR_FLOOD_THRESHOLD` (0.45), `CYCLE_LENGTH_CELLS` (1.0), `DEPLETION_FRACTION` (0.35), the allostatic ceiling (0.6) — are **not** env-tunable, because each is a **bound that keeps a behaviour honest** rather than a knob to tune:

| Constant | Why it is not a flag |
|---|---|
| `RECEPTOR_MIN` 0.35 | Receptors downregulate; they do not vanish. A tunable floor is a tunable way to permanently delete a transmitter's effect, which is damage rather than tolerance |
| `RECEPTOR_FLOOD_THRESHOLD` 0.45 | Below this, ordinary feeling does not build tolerance to itself. Lowering it makes her go numb to her own life |
| allostatic ceiling 0.6 | The recovery guarantee. Raising it makes a hard stretch unrecoverable, and *"she survived it changed"* becomes *"she was destroyed by it"* |
| `CYCLE_LENGTH_CELLS` 1.0 | **Measured, not chosen** — ~273 cells over 20 grade-years ≈ 13.65/yr against ~13 real cycles/yr. Changing it makes her cycle disagree with her own biology for no gain |

⛔ **If one of these ever genuinely needs to move, it needs a RE-PRICE and a reason in the ledger — not a flag that lets it drift silently.** The existing levers stay where they are: `DREAM_MIN_DONOR_VERSION` above, and the drug scheduler's own controls.

⭐ **The state to read instead of tuning:** `state.endocrine` (chemicals with signed deviation + receptor sensitivity, the stress channel with its age, cycle phase, chronic and allostatic load, the brain-param deltas, the stage counters, and per-nucleus `fired` / `quiet` / **`blind`** with its lifetime fire count), `state.introspection` (the live gap, the rumination bound, the stage counters, and the falsifiability counters), and `state.phiState`. Both render on the dashboard.

⛔ **Corrected 2026-08-25 — the sentence above was true of the payload and FALSE of the board.** `cycle phase` and `allostatic load` were named here as readable while `server/brain-server/state.js` forwarded neither, and the panel read both — the `meanVoltage` producer/consumer shape one layer down. It did not present as an empty row: the renderer defaults a missing `allostatic` to `{}`, so the load row rendered **`allostatic 0.000/0.6 (restore α 0.0000)` regardless of the real load** — a reassuring zero on the one quantity that says whether adversity is accumulating. The cycle row never drew at all, and `puberty` rendered a literal `? (age ?)` with its amber `unknown` branch unreachable. Fixed by forwarding `puberty` / `cycle` / `allostatic` / `scheduledCount`, and by adding rows for `contributions`, `counters` and `lastError` on both panels — the last of which the server sets under a comment promising *"a dead endocrine tick must be visible as a dead endocrine tick"*, a promise nothing on the board was keeping. **Parity is now exact in both directions: 13/13 endocrine fields, 7/7 introspection fields — every forwarded field has a row, every rendered field has a producer.**

### Diagnostic & misc

| Env | Default | Kind | What it does |
|---|---|---|---|
| `DREAM_ABLATION_LOG` | ⚠ off | lever | Ablation logging for research runs |
| `DREAM_POLLINATIONS_KEY` | ✅ `''` (empty) | **escape hatch, ops-only** | ⛔ Present as an operations override lever ONLY. The brain runs the Pollinations **anonymous free tier**; no key is shipped, seeded or defaulted anywhere in the tree, and none may be re-added. Empty ⇒ the URL builder omits the key parameter entirely |

> ⚠ **Three strings that look like flags and are not:** `DREAM_CONSOLIDATION_`, `DREAM_SAT_` and `DREAM_KEEP_` appear in a raw extraction of this namespace because they are **prefixes** built up in code, not variables. Do not set them.
>
> ⛔ **`DREAM_TRANSFORMER`, `DREAM_TRANSFORMER_MODEL` and `DREAM_TRANSFORMER_MAX_LEN` are DEAD and must never come back.** They gated a complete GPT-2 / distilgpt2 / TinyLlama inference path that installed itself as a "right brain", and an arbiter that could return **the transformer's text as her answer**. All of it was deleted 2026-08-25. The three names still appear in `server/brain-server.js` **only inside the comment recording their own removal** — a grep of this namespace hits that tombstone, not a live read. ⚠ Its `@xenova/transformers` dependency was deliberately left undeclared in every `package.json` so a dependency audit could not see it; a boot guard now fails loudly if an LLM SDK, a chat-completions URL or a transformer dependency reappears.
