# CONTROL BUTTONS — WHAT IS BROKEN, PAGE BY PAGE

**Handoff doc. Written 2026-09-05. Copy-paste this whole file.**

Every claim below was read out of the source or measured against the live box on
2026-09-05, not remembered. Line numbers are from `main` @ `1ec2459d`.

---

# ⛔⛔⛔ ROOT CAUSE FOUND — READ THIS FIRST. IT IS NOT THE BUTTONS.

**The brain is parked above its cgroup's `MemoryHigh` and the kernel has been
throttling it for 19.5 hours.** Every other symptom in this document — the dead
WebSocket, the timed-out presses, the "does nothing" buttons — is downstream of
this one fact.

## The reading

`GET /ctl/status`, 2026-09-05 13:52 UTC:

```json
"brainOnline": false,
"loopPinned": true,
"portOpen": false,
"activeForSec": 70168,
"unit": {
  "activeState": "active",  "subState": "running",
  "result": "success",      "exitStatus": 0,
  "nRestarts": 6,
  "activeEnter": "Fri 2026-09-04 18:22:48 UTC",
  "memoryBytes": 22851215360
}
```

## The arithmetic

| | value | source |
|---|---|---|
| brain RSS | **21.28 GB** | `memoryBytes` above |
| `MemoryHigh` | **20 GB** | `deploy/unity-brain.service:92` |
| `MemoryMax` | **24 GB** | `deploy/unity-brain.service:94` |
| box total | 31.1 GB | boot line `memTotalMB 31831` |

**She is 1.28 GB (6.4%) over the soft limit, and 2.7 GB below the hard one.**

## Why that is the worst of the three states

`MemoryHigh` is **a throttle, not a cap.** Above it the kernel puts the whole
cgroup under heavy reclaim pressure and **stalls the processes in it**. That
produces exactly what we see: process alive, `exitStatus 0`, never restarted,
port never binds, event loop pinned.

- **Below `MemoryHigh`** → she runs.
- **Above `MemoryMax`** → OOM-killed **alone**, and `Restart=always` revives her
  in seconds. Loud, self-healing.
- **Between the two** → ⛔ **throttled indefinitely. Nothing kills her, nothing
  recovers her, and no event fires that anything reacts to.**

She has been in that band since **18:22:48 UTC on 2026-09-04**.

⭐ **Sponge measured this same mechanism from the other direction yesterday** — a
wedged `git lfs pull` pushed the same cgroup over the line, and *"killing it took
the box 24G → 15G instantly and the site back to sub-second."* **Same throttle.
This time nothing else is running: she is over on her own.**

## ⛔ The likely underlying bug: the sizing does not know about the cgroup

`unity-brain.service:82-84` states the design intent plainly:

> *"The in-app budget (`DREAM_BRAIN_BUDGET_MB` / the RAM-safe auto-cap) sizes the
> brain well under these so the hard cap is only a backstop."*

**That assumption is what failed.** The neuron count is derived at boot from
**free host RAM** — the boot log says so: `SERVER-RAM SAFETY — no GPU on host
(31831MB RAM, shared with Forgejo): raising brain budget 16384MB -> 18519MB`.

⛔ **Nothing in that calculation reads `MemoryHigh`.** It reasons about the
*host*, while the kernel enforces against the *cgroup*. So the brain sized itself
to 411,216,550 neurons plus a 15,082,717-neuron language cortex, landed at
21.3 GB, and walked straight into a limit it does not know exists.

⚠ **A restart may therefore reproduce this exactly.** If she boots, climbs past
20 GB and re-pins, that is the confirmation — and the fix is a config decision,
not another restart.

## ⭐ THE BOX IS DOING THREE JOBS WITH ONE BUDGET — see `docs/TODO.md §BOXCAP`

Forgejo (the lab's git), the brain, and the brain's own deploys share one RAM
budget, one CPU budget and one disk:

```
RAM   31.1 GB · 8c/16t · no GPU     disk  877 GB total · 420 GB free
brain MemoryHigh=20G · MemoryMax=24G · CPUQuota=1200%
```

Three things follow, and all three bit us this week:

1. ⛔ **The deploy runs inside the brain's cgroup.** `brain-server.js:10715`
   spawns `self-update.sh` with `{ detached: true }` — ⚠ **that is a
   process-group flag, not a cgroup escape. systemd membership is inherited by
   every descendant.** So a 114 GB `git lfs pull` charges against *her*
   `MemoryHigh` and *her* `CPUQuota`. **Fix: `systemd-run --scope` with its own
   limits** (needs a new verb on `brain-ctl-helper`, which today allows only
   `start|stop|restart unity-brain` and `reload-nginx`).
2. ⛔ **The 114 GB is stored twice on one disk, and fetched over the network from
   itself.** `git.unityailab.com` **is this box** — Forgejo's LFS store already
   holds all 26,359 field objects here, and the deploy clones over SSH to
   localhost and pulls them over HTTP from localhost. **~228 GB for one dataset.**
   **Fix, best first:** read them in place (bind-mount/symlink), hydrate by OID
   from the local store (`LOCALFIELDS.1`, built but unexercised), materialise on
   demand, or — what we do today — copy the lot over the wire.
3. ⚠ **Forgejo has no reservation of its own.** The brain is capped *"so it can
   NEVER peg the CPU or OOM the box and take Forgejo down"* — but Forgejo simply
   gets what is left. **A `MemoryMin`/`CPUWeight` floor on its unit would make
   that guarantee real instead of assumed.** Sponge's call; it is his service.

## What to do

1. **Restart her.** `/ctl/restart`, or the dashboard's Brain Power panel. Nothing
   is lost: `passedCellsTotal` has been **0** for 19 hours.
2. **Watch two numbers on the way up** — `activeEnter` leaving
   `Fri 2026-09-04 18:22:48 UTC`, and `memoryBytes` settling.
3. **If she settles under ~20 GB** — fixed, and the sizing got lucky.
4. **If she climbs past 20 GB again** — the sizing bug is confirmed. Then pick
   one, deliberately:
   - raise `MemoryHigh` (24 GB `MemoryMax` on a 31 GB box leaves room), **or**
   - make the boot-time budget read the cgroup limit instead of host free RAM,
     **or**
   - lower `DREAM_BRAIN_BUDGET_MB` so the derived size lands under 20 GB.

⚠ **Do not just raise the limits without deciding.** The whole point of these
caps is that the brain can never take Forgejo or the box down with it — and
Forgejo shares this host.

## ⚠ And the instrument gave bad advice — my text, my error

`/ctl/status` currently ends its `human` field with:

> *"Wait for the operation to finish; a restart here would abandon whatever it is
> holding."*

**That is correct for a save that is minutes from finishing and wrong after 19
hours.** `activeForSec: 70168` is in the same payload, and the message even says
*"far too long to still be booting"* — then still counsels waiting. **The advice
should turn over once `activeForSec` passes any plausible operation length.**
Filed; not yet fixed.

---

## TL;DR

⛔ **The root cause is above, not here: she is 6.4% over `MemoryHigh` and the
kernel has throttled her for 19.5 hours.** The button defects below are real and
worth fixing, but **fixing every one of them would not have started her.**

| page | control set | lane | bounded? | reports honestly? | verdict |
|---|---|---|---|---|---|
| `dashboard.html` | **Brain Power panel** (`bp-*`) | `/ctl/*` ✅ | ✅ **5 min** (2026-09-05) | ✅ yes | **USE THIS ONE** |
| `dashboard.html` | **legacy row** (`btn-*`, 8 buttons) | brain `/admin/*` — **the FALLBACK, on purpose** | ✅ **20 s / 120 s** (2026-09-05) | ✅ **yes** (2026-09-05) | **fallback for when `/ctl` is down** |
| `teachview.html` | press panel (4 buttons) | brain lane **SPA-swallowed when deployed** until 2026-09-06 → `/ctl/*` ✅ | ✅ 20 s + 6 s | ✅ yes | ⚠ **the `/ctl` fallback was carrying this alone. Brain lane fixed 2026-09-06 — see PROBLEM 4** |
| `teachview.html` | buffer · bench · ledger · weights · knob writes · position restore | brain, **bare paths → nginx SPA** ⛔ | n/a | ⛔ **no — blamed the brain** | ⛔ **10 of 12 routes dead when deployed. Fixed 2026-09-06 (`TVADMIN`)** |
| `dashboard.html` | 7 other admin POSTs (`autoscale` ×2, `resync`, `rollback`, `auto-advance`, `grade-advance`, `grade-signoff`) | brain `/admin/*` | ❌ **no timeout** | ✅ yes | **`BUTTONAUDIT.5` — filed, not yet swept** |

> ## ✅ UPDATED 2026-09-05 — PROBLEMS 1 AND 2 BELOW ARE FIXED. The prose is kept as the finding.
>
> **The legacy row was NOT retired, and the recommendation to retire it was wrong.** `CTLSUPERSEDE` already hides it whenever the control plane answers and keeps it when `/ctl` is **down** — where it is *"the ONLY way to control the brain"*. ⛔ **And only six of the eight were ever superseded:** `/ctl` has **no `checkpoint` route and no `curriculum/forget` route**, so `btn-save-checkpoint` and `btn-reteach` are unique capabilities. Deleting the row would have removed the fallback *and* two live controls.
>
> **All three defects fixed at one chokepoint** (`adminPress()` / `adminPressRender()`): `catch` no longer claims success (it reports `? sent — could NOT confirm`, because a real restart and an unreachable server are indistinguishable from the browser); **`r.ok` is now checked** — a `504` from nginx resolves as a real response and used to print a checkmark, which this audit did not name; and every press is bounded. ⭐ `exitsOnSuccess` separates the two honest cases: restart verbs report *could-not-confirm*, `checkpoint`/`reteach` report a real *failure*, because the server is meant to survive those.

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

## ⚠ THE WEBSOCKET ERROR YOU WILL SEE, AND WHY IT IS NOT A SEPARATE BUG

```
dashboard.html:1378  WebSocket connection to
'wss://…/admin/ws' failed: WebSocket opening handshake timed out
```

**Same wedge, different surface.** The brain's own log names it in as many
words: `[EventLoop] BLOCKED …ms — /ws handshakes + donor frames stalled this
long`. A blocked loop never completes the handshake, so the socket times out.

⛔ **Consequence: every live panel on the dashboard goes blank or stale**, because
`updateDashboard` is driven off that socket (`connect()` at `dashboard.html:1376`).
**The page looking dead is not evidence about which buttons work.**

⭐⭐ **THE BRAIN POWER PANEL DOES NOT USE THE WEBSOCKET AND KEEPS WORKING.** It
polls `fetch(ctlUrl('status'))` on its own HTTP timer — `poll()` at
`dashboard.html:4381`, rescheduled every 3 s / 15 s at `:4535`. **Verified by
reading both paths.** So when the socket is dead and the page looks lifeless,
**that panel is still live and still pressable.**

⚠ **If the panel is missing entirely, that is AUTH, not the brain.** It only
renders once `/ctl/status` has answered at least once, and `/ctl/` sits behind
`auth_basic "Unity admin"`. Open
`https://if-only-i-had-a-brain.git.unityailab.com/ctl/status` directly, enter the
admin login, then reload the dashboard.

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

> ⛔⛔ **THAT CONCLUSION WAS WRONG, AND THE CODE IT CITES SAYS SO 15 LINES FURTHER DOWN.**
> `CTLSUPERSEDE` does not say *delete* — it says **hide, and only once `/ctl` has
> actually answered**, because *"if /ctl is not installed or not running, the
> legacy row is the ONLY way to control the brain and hiding it would leave a
> dashboard with no controls at all — strictly worse than a duplicate."*
> **The row is the fallback for exactly the outage this document was written
> during.** ⭐ And the "duplicate a panel that already works" premise is false for
> two of the eight: `/ctl` exposes no `checkpoint` and no `curriculum/forget`, so
> `btn-save-checkpoint` and `btn-reteach` duplicate nothing — deleting them
> destroys capability. **Fixed 2026-09-05 by making all eight honest at one
> chokepoint instead.** I quoted the comment's headline and did not read its
> caveat; the caveat was the whole argument.

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

## ⛔ PROBLEM 4 — teachview.html: ten of twelve routes never reached the brain when deployed (fixed 2026-09-06)

**Reported off the live page:** `buffer ERROR — could not reach the brain (Unexpected token '<', "<html>…" is not valid JSON)`.

**The brain was never asked.** The public nginx vhost forwards exactly **five**
locations — `= /public-state.json`, `= /minds-eye.json`, `/ws`, `/admin/ws`,
`/admin/`. Everything else falls through to the static SPA, which answers
**HTTP 200 with an HTML body**. A bare `fetch('/corpus-buffer')` therefore does
not fail — it *succeeds*, returns a web page, and dies at `r.json()`.

⭐ **A 200-with-HTML is the worst failure shape there is, because every status
check passes.** `r.ok` is true and there is no error status to branch on.

Measured against the live box rather than read off the config:

| route | live result | verdict |
|---|---|---|
| `/public-state.json` | `200 application/json` | forwarded |
| `/teach-ledger.json?cells=1` | **`200 text/html`** | SPA — never reached the brain |
| `/weights/list` | **`200 text/html`** | SPA |
| `/teach-bench` | **`200 text/html`** | SPA |
| `/admin/teach-ledger.json?cells=1` | **`401`** | **forwarded — the fix path** |

**The `401` is the proof, and it is why no nginx change was needed.** A 401 is
nginx reaching for the brain and challenging you; a `200 text/html` is nginx
handing back the SPA. `location /admin/` uses `proxy_pass http://unity_brain/;`
— the **trailing slash strips the prefix** — so `/admin/weights/list` arrives at
the brain as `/weights/list` with `X-UAL-User` set from the login.

**Root cause: the page was built and exercised on localhost, where a bare path
works.** `dashboard.html` has had an `adminApi()` helper for exactly this since
it was written; Teach View had no equivalent and its deployed case was never
run. One line held nine of the ten routes — `WEIGHT_BASES` resolved to `['']`
when deployed, and `WEIGHT_BASE` is reused by `/weights/list`,
`/weights/download`, `/weights/position`, `/knob`, `/knob-default` and all four
press verbs.

⛔ **The second bug, which the fix would otherwise have walked into.**
`isForbidden()` tested `403` only — the brain's `requireLoopback` answer. nginx's
`auth_basic` answers **`401`**. Prefixing without widening that would have
converted every unauthenticated control from a clean 403 into a 401 that falls
through to `r.json()` and reports *"could not reach the brain"* — **the same
false accusation by a new door.** Widened at the one function all seven call
sites converge on, plus the two places still comparing the number by hand.

**Suggested fix for any new page:** resolve privileged routes through a single
base constant declared at the top of the script, never a bare literal at the
call site. See `TV_IS_LOCAL` / `TV_ADMIN` in `teachview.html`.

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

## ⚠ THE GPU DONOR POD — STOPPED 2026-09-05

`q0ydaakrqcz48n` (A40 48 GB, CA-MTL-1, $0.49/hr) was **stopped** because it could
not reach her. Its own runtime figures on the way out:

```
gpu.util 0%   gpu.memoryUtil 0%   cpu.util 0%   uptime 77,336s (21.5 h)
```

**21.5 hours of billing on an idle card.** It attached and uploaded its matrices
on 2026-09-04, then the brain crossed `MemoryHigh` at 18:22 and never spoke to it
again. **Start it again only once she is serving** — `start-pod q0ydaakrqcz48n`;
disk and config persist.

---

## WHAT TO PRESS RIGHT NOW

1. **Dashboard → Brain Power panel → `🔄 Restart (Savestart)`.**
2. If that refuses: **`⚡ Force Restart (wedged)`** (`/ctl/kick`) — its tooltip
   describes this exact symptom, *"process alive but not answering"*. It skips
   the graceful save, which currently costs nothing: `passedCellsTotal` has been
   **0** for 18 hours.
3. Then **`⬆ Update (keep weights)`** to pull the current `main`.

⛔ **Do not use the legacy row.** It will print a green tick either way.
