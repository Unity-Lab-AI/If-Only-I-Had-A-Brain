# ADMIN CONTROLS — dashboard Stop / Restart / Reset, and the one-backend model

> Clarifies what the admin-only dashboard power buttons actually control, how
> the "deployed website" and "the server" relate (they are NOT two brains), and
> the #112.10 fix that makes **Stop** truly stop.
>
> Last updated: **2026-06-22**.

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
