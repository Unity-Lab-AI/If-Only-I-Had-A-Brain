# CONTROL BUTTONS — WHAT IS BROKEN, PAGE BY PAGE

**Handoff doc. Written 2026-09-05. Copy-paste this whole file.**

Every claim below was read out of the source or measured against the live box on
2026-09-05, not remembered. Line numbers are from `main` @ `1ec2459d`.

---

## TL;DR

| page | control set | lane | bounded? | reports honestly? | verdict |
|---|---|---|---|---|---|
| `dashboard.html` | **Brain Power panel** (`bp-*`) | `/ctl/*` ✅ | ❌ no timeout | ✅ yes | **USE THIS ONE** |
| `dashboard.html` | **legacy row** (`btn-*`, 8 buttons) | brain `/admin/*` ❌ | ❌ no timeout | ⛔ **claims success from `catch`** | **DO NOT USE** |
| `teachview.html` | press panel (4 buttons) | brain, **now falls back to `/ctl/*`** ✅ | ✅ 20 s + 6 s | ✅ yes | **fixed today, live on the box** |

**The short version:** the only controls that can work while the brain is
unresponsive are the ones that talk to `unity-brain-ctl` — and until today only
the dashboard's Brain Power panel did.

---

## THE CONDITION THESE BUTTONS EXIST FOR

Measured 2026-09-05 13:09 UTC, and this has been the state on and off for ~18 h:

```
/index.html            http=200   0.31s     nginx + static site fine
/ctl/status            http=401   0.16s     CONTROL PLANE ALIVE AND FAST
/public-state.json     http=000  14.0s      BRAIN PINNED — never answers
```

⛔ **The brain is alive but its event loop is blocked.** `systemd` says active,
port 7525 is LISTENING, and nothing can connect. **This is exactly when someone
reaches for a restart button — and it is exactly when the brain's own routes
cannot be served.**

---

## ⛔ PROBLEM 1 — the dashboard's legacy row: 8 buttons, all three defects

`html/dashboard.html`. Every one of these posts to `adminApi(path)` →
`${location.origin}/admin/${path}` — **the brain's own routes.**

| button | id | handler line |
|---|---|---|
| Graceful Stop | `btn-graceful-stop` | 4547 |
| Restart | `btn-restart` | 4624 |
| Reset Brain (fresh) | `btn-reset` | 4655 |
| Update | `btn-update` | 4688 |
| Update & Savestart | `btn-update-savestart` | 4724 |
| Save-rerun | `btn-savererun` | 4758 |
| Save checkpoint | `btn-save-checkpoint` | 4838 |
| Re-teach | `btn-reteach` | 4858 |

**All 8 share all three defects:**

1. ⛔ **Wrong lane.** They call the brain. A blocked event loop never accepts the
   request, so they cannot work in the one situation they are for.
2. ⛔ **No timeout.** No `AbortController`, no `signal`. The request hangs until
   nginx 504s (~60 s).
3. ⛔⛔ **They claim success from the `catch` branch.** `dashboard.html:4641`:

```js
} catch (err) {
  btn.classList.add('shutdown-fired');
  btn.textContent = '✓ restarting (resumes)';      // <-- the request FAILED
  log(`Restart fetch failed (server exiting, systemd reviving): ...`);
}
```

**A failed request prints a green tick.** The rationale — "a restart kills the
connection, so a failure looks like success" — is true, but the conclusion is
backwards: **an unreachable server looks identical, and the button cannot tell
them apart, so it should not claim either.**

⭐ **RECOMMENDED FIX: DELETE THIS ROW.** `dashboard.html` already contains a
comment block named `CTLSUPERSEDE` stating that the new Brain Power panel must
**REPLACE** the old row, not join it. The old row surviving is the defect.
Repairing eight handlers to duplicate a panel that already works is the wrong
trade.

---

## ⚠ PROBLEM 2 — the Brain Power panel is correct but unbounded

`html/dashboard.html`, `act()` at line **4418**, used by every `bp-*` button.

**What it gets right** — this is the good one, and it should stay:

- ✅ `ctlUrl(action)` → `/ctl/*`, the always-up service
- ✅ `credentials: 'same-origin'` (the `/ctl/` lane is Basic-auth gated)
- ✅ sends `{"confirm":"WIPE"}` for the destructive verbs, which the server
  requires — that interlock exists because a bare probe of `/ctl/update` once
  destroyed a running walk's weights
- ✅ handles `409 busy` distinctly
- ✅ reports the **server's own message** rather than assuming an outcome

**The one defect:**

- ⛔ **`act()` has no timeout either.** Zero `AbortController` / `signal`
  occurrences in the function. Not currently biting, because `/ctl/status`
  answers in 0.16 s — but it is the same latent hang, and it will bite the day
  the control plane is slow rather than dead.

**Suggested fix:** wrap it the way `teachview.html` now does — see
`pressFetch()` there, ~20 s for power verbs.

---

## ✅ PROBLEM 3 — teachview.html: fixed today, and worth reading for the pattern

Two defects, both fixed and **verified live on the box** (`safetyFetch` markers
present in the served file):

**(a) It printed "accepted" for a press that never happened.**
nginx returns `504` as a **real HTTP response**, not a network error, so the
fetch *resolves*. `r.json()` then throws on the HTML body, the
`.catch(() => ({}))` makes it `{}`, the refusal test finds no `status` field,
and the panel printed:

```
update (keep training) accepted — no status returned
```

**`r.ok` was never consulted.** A press that reports ACCEPTED while nothing
happened is worse than one reporting failure — it sends the operator off to wait
for a boot nobody armed. **That is where ~17 hours went.**

**(b) The guard in front of the fix was itself unbounded.**
`pressSafeties()` runs **before any confirm dialog** and asks the brain
`/weights/list` whether a checkpoint is mid-write — with no timeout. On a pinned
brain it hung, so the panel printed `checking restart safeties…` and stopped:
no dialog, no press, no error. The operator's report was *"does nothing"*, and
it was exact.

⭐ **The rule worth carrying: a guard in front of a bounded call has to be
bounded too, or it becomes the new hang.**

**Now:** 20 s bound on the press, 6 s on the safety probe, `r.ok` checked, and a
`/ctl/*` fallback — automatic for `restart`, confirm-first for the deploy verbs
(because a 504 means nginx stopped waiting, **not** that the brain never got the
request, and two concurrent `self-update.sh` runs `rsync -a --delete`-ing the
same directory is the one failure mode that corrupts an install).

---

## ⛔⛔ PROBLEM 4 — THE ONE THAT NEEDS A SHELL: `unity-brain-ctl` is never restarted

**`deploy/self-update.sh` restarts `$SERVICE` (`unity-brain`) and nothing else.**
There is no `systemctl restart unity-brain-ctl` anywhere in it.

**Consequence:** the control plane runs whatever code it started with,
**indefinitely**. Every fix to `server/brain-ctl.js` — including the deploy
timeout fix on `main` right now — is inert until somebody restarts that unit by
hand.

```bash
sudo systemctl restart unity-brain-ctl
systemctl show unity-brain-ctl -p ActiveEnterTimestamp
```

⚠ **Worth deciding deliberately, not by default:** the unit's own header argues
it should be *"boring enough to never need a deploy"*, which is why nothing
restarts it. That is a reasonable design — but it means the panel everyone
depends on during an outage can silently be months old, with no surface anywhere
saying so.

**Suggested:** publish the ctl build/start time in `/ctl/status` so a stale
control plane is visible instead of assumed.

---

## RELATED SERVER-SIDE FINDINGS (context for the above)

- **Two timeouts in two files, wrong order.** `self-update.sh` bounds
  `git lfs pull` (`UAL_LFS_TIMEOUT`, now 8 m). `brain-ctl.js` ran that same
  script under a hardcoded `execFile` timeout of **15 minutes** — so on the ctl
  path the parent was killed before the guard could fire. Fixed on `main` by
  deriving the deploy cap from the LFS bound; **inert until the ctl unit is
  restarted** (see Problem 4).
- **A build stamp never proves a restart.** `deployed-build.json` is written by
  `self-update.sh` at deploy **start**; `deploy.yml` rsyncs the frontend on every
  push and never touches it. Use **uptime coming back lower**,
  `unit.activeEnter` moving, or the console ring resetting.
- **The console ring holds ~6 minutes during a walk** (500 lines / 376 s
  measured). Diagnosis has to happen within minutes of an event or the evidence
  is gone.

---

## WHAT TO PRESS RIGHT NOW

1. **Dashboard → Brain Power panel → `🔄 Restart (Savestart)`.**
2. If that refuses: **`⚡ Force Restart (wedged)`** (`/ctl/kick`) — its tooltip
   describes this exact symptom, *"process alive but not answering"*. It skips
   the graceful save, which currently costs nothing: `passedCellsTotal` has been
   **0** for 18 hours.
3. Then **`⬆ Update (keep weights)`** to pull the current `main`.

⛔ **Do not use the legacy row.** It will print a green tick either way.
