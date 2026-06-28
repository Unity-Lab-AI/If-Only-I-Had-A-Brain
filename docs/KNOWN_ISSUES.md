# KNOWN ISSUES — running ledger

> Lightweight, scannable list of known bugs, limitations, and intentional
> deferrals across the Unity brain stack. ONE row per issue with a status marker;
> check items off here when they're fixed (don't delete — flip the status and date
> it, so the history stays). Deep dives live in the `ISSUE-*.md` files and the
> full audit in `Problems.md`; this file is the index that points at them.
>
> **Status key:** 🔴 OPEN · 🟡 IN PROGRESS · 🟢 FIXED · ⛔ BLOCKED (intentional / needs sign-off)
>
> Last updated: **2026-06-24**.

---

## Issues

| # | Status | Issue | Where | Notes / link |
|---|--------|-------|-------|--------------|
| KI-1 | 🔴 OPEN | **~15-min cold boot.** Restart costs a long synchronous boot before the brain can think. | `js/brain/cluster.js` construction, `server/brain-server.js` | Root cause inferred from code (not yet measured): single-threaded construction of the biological-scale neural graph — wiring billions of sparse synapses (`size × fanout`) across clusters + the cortical-microstructure passes (small-world topology, microcolumns, 6-layer lamination, hub selection, cross-projections). Donor-upload wait is only a 20 s fallback, NOT the bottleneck. See KI-1 detail below. |
| KI-2 | 🟡 IN PROGRESS | **Leaderboard duplicate named rows.** Named donors (Gee/Sponge/Bob) spawned MANY rows of the same name; routing IDs leaked as anon rows. | `server/brain-server.js`, `server/brain-server/state.js`, `html/compute.html` | Fix coded + verified on `feature/hotfixes` (LB.1–LB.4 in `TODO.md`): named donors collapse to one `name:<lower>` row, anon→named migration, self-heal on load, defensive merge in live-state. **Not yet deployed** — live brain's persisted leaderboard only heals on the next restart. |
| KI-3 | ⛔ BLOCKED | **"Update & Savestart" self-deploy button.** Dashboard button can't self-serve a redeploy. | dashboard + box | Intentionally NOT wired — needs box prereqs (sudoers `NOPASSWD` for `systemctl restart unity-brain` + a deploy-key repo clone). Sponge re-confirmed this is a **safety risk**; leave it until explicitly approved. |
| KI-4 | 🟡 IN PROGRESS | **Cognition / basin quality — mode collapse.** Trained basins collapse into superposition; motor argmax can lock on a single token. | `js/brain/curriculum.js`, cortex Hebbian path | `_rectifySemMotor()` rectify continues instead of halting on saturation. **Held-back remediation (`docs/HELD-BACK.md`) now targets this** — failed/noisy cells get drilled through the de-saturate+inhibition ladder, and the outcome-gated noise gate (`DREAM_NOISE_GATE`, default OFF) suppresses meaningless-noise reinforcement while preserving exploration. Stays open until the noise-gate magnitudes are tuned + verified on a live training run. Deep dive: `docs/ISSUE-basin-collapse-fix.md`. |
| KI-5 | 🔴 OPEN | **K-STUDENT battery stall.** Student-test battery probes could stall the walk. | curriculum probe path | Status + repro tracked in `docs/ISSUE-student-battery-stall.md` — consult that file for current state before assuming fixed. |
| KI-6 | 🔵 SEE AUDIT | **Perimeter hygiene (network bind, auth-free privileged endpoints, curriculum monolith, hot-probe perf).** | stack-wide | Full ruthless audit in `docs/Problems.md`; several criticals already marked FIXED there (loopback bind, `/shutdown` loopback gate). Treat `Problems.md` as the authoritative source for these — don't re-litigate here, just mirror status when one closes. |
| KI-7 | 🟢 CLOSED (2026-06-24) | **Public dashboard feels stale / doesn't update much.** ~~Desired: reliable ~5 s auto-pull.~~ | `html/dashboard.html` (PUBLIC_MODE), `html/dashboard-public.html` | **Closed per Sponge — outdated assumption.** The public view already auto-polls `/public-state.json` every 3 s against a snapshot the server refreshes every 100 ms (`STATE_BROADCAST_MS`), so the "doesn't auto-pull" premise was wrong. Latent caveat preserved (NOT reopened): WS-only panels don't refresh in public mode — see KI-7 detail. Reopen only if a specific panel is observed frozen and it matters. |
| KI-8 | 🟢 CLOSED (2026-06-27) | **Public dashboard prompted admin login.** Visiting the public dashboard threw a Forgejo Basic-auth login prompt (`401 /admin/milestone`) at every viewer. | `html/dashboard.html` (PUBLIC_MODE) | **Fixed (PD.1, `feature/public-dashboard-donor-ux-fixes`).** `dashboard-public.html` redirects to `dashboard.html?public=1`; `refreshMilestone()` + its 5 s `setInterval` polled `adminApi('milestone')` → `/admin/milestone` UNCONDITIONALLY → 401 + login prompt. Now gated behind `!PUBLIC_MODE` (the milestone/save-state panel is `.admin-only` anyway). Audited as the only unconditional admin poll — auto-advance is `isAdmin`-gated, the gate-probe timer does no fetch. |

---

## Operational hazards (not bugs — but they bite)

These are environment gotchas the hard way, carried from prior sessions. Not
"issues to fix" so much as landmines to route around.

- **Never `pkill -f "brain-server.js"`** — the pattern matches the killing shell's own argv and self-kills the command (empty output, exit 1). Kill by captured PID.
- **`lsof -ti:PORT | kill` over-kills** — it matches BOTH the brain (listener) and any donor (client socket) on the same port. Capture and target the right PID.
- **Never stress GPU 0** — it's the user's display GPU (RTX 4070); a high-util run on it once crashed the whole desktop. Test only GPU 1 (RTX 2060), low util, short, with a timeout.
- **Tarball-overlay deploy** — `/opt/unity-brain` is NOT a git checkout. Deploy = `scp` up → `sudo cp` into place → **always** `sudo chown -R unity:unity /opt/unity-brain` (sudo cp leaves files root-owned → EACCES on weight save).
- **A restart is expensive** — see KI-1; ~15 min boot + loses up to ~5 min of curriculum progress since the last checkpoint. Check md5s before deciding a deploy even needs a bounce.

---

## KI-1 detail — the ~15-min boot

The boot is CPU-bound brain-building, not I/O or network. Dominant costs, in order:

1. **Synapse wiring (the big one).** Per cluster the intra-synapse matrix holds
   `size × fanout` non-zeros (`cluster.js`). At biological scale cortex is on the
   order of hundreds of millions of neurons and language cortex auto-scales into
   the tens of millions, fanout ~30 → **billions** of synapse entries to allocate
   as TypedArrays, compute deterministic small-world neighbours for, and populate —
   single-threaded in Node.
2. **Cortical microstructure passes** layered on every cortical region —
   Watts-Strogatz small-world topology, microcolumn assignment, 6-layer lamination,
   hub-neuron selection, topographic cross-projections (each O(neurons) or
   O(neurons × fanout)).
3. **Supporting boot** — semantic-embedding init, binary weight deserialization,
   hippocampus Tier-2 / Tier-3 schema stores.
4. **Then** the sparse cortex streams to the donor GPU and waits for ~20 warmup
   batches (or a 20 s fallback) before curriculum can run.

**Not yet done:** capture the REAL per-phase millisecond breakdown from a live boot
(`journalctl` on the box — the construction already logs `…ready in ${ms}ms` per
cluster) to confirm whether the wiring loops are the actual hog or something dumber
stalls it. Until then the breakdown above is read-from-code inference, not measured.

---

## KI-7 detail — public dashboard staleness

Symptom (Sponge): the public dashboard "doesn't update that much"; wants a reliable
auto-pull (~5 s is fine).

What's actually wired today:

- `html/dashboard-public.html` is a redirect → `html/dashboard.html?public=1`.
- In `PUBLIC_MODE`, `connect()` calls `startPublicPolling()` and **returns before
  opening the admin WebSocket** (`dashboard.html` ~line 904).
- `startPublicPolling()` fetches `GET /public-state.json` every **3 s**
  (`setInterval(poll, 3000)`).
- The server rebuilds that cached snapshot every **100 ms** inside the broadcast
  loop (`STATE_BROADCAST_MS = 100`, refresh at `brain._publicStateJson = …`).

So the snapshot is fresh and the poll is frequent — the gap is that the **admin
view's panels are updated inside `ws.onmessage`**, which never fires in public mode.
Only whatever the `poll()` render path touches actually refreshes; every WS-only
panel is frozen at first paint.

Fix direction (when we pick it up): make the public `poll()` path render the SAME
full panel set the WS handler does (factor the render out and call it from both),
so all panels move off the cached snapshot. Poll cadence can stay 3 s or move to
5 s — that's the easy part; the panel coverage is the real fix.
