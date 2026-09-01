# Unity — Deployed Admin Guide (NOT pushed — lives in `.claude/`, gitignored)

> **Audience:** YOU, the operator/admin, running Unity on the deployed site.
> **This file never ships** — `.claude/` is fully gitignored (Layer-0 block).
> Plain-language, exact steps. Deploy URL: `https://if-only-i-had-a-brain.git.unityailab.com` (subdomain = lowercased repo name; rename the repo for a cleaner one).

---

## 0) The ONE-TIME setup (before any of this works)

The deployed site is a **static page** (the brain UI) PLUS a **Node brain-server** running on the same box git lives on, joined by nginx. The static page is auto-deployed on every push to `main`. The brain-server has to be installed ONCE:

```bash
# on the server, as root, ONE TIME:
sudo BACKEND_DIR=/opt/unity-brain SERVICE_USER=unity \
     DEPLOY_USER=<your PAGES_DEPLOY_USER> \
     DOMAIN=if-only-i-had-a-brain.git.unityailab.com \
     bash deploy/bootstrap-backend.sh
```

After that it's automatic forever: every push to `main` re-syncs the code and restarts the brain. You never run this again unless you move boxes.

---

## 1) How to open the BRAIN PAGE (the main site)

Just go to the deploy URL in any WebGPU-capable browser (Chrome/Edge):

```
https://if-only-i-had-a-brain.git.unityailab.com
```

That's the landing page with the live 3D brain + "TALK TO UNITY". A normal visitor who isn't logged in sees the public view and (if no admin backend is reachable for them) a local in-browser fallback brain. **You** see the real brain once you're admin (next step).

---

## 2) How to become ADMIN (you = master)

The admin lane is gated by **Forgejo login** — the public literally cannot reach it.

1. **Log into Forgejo first** in the same browser: `https://git.unityailab.com` → sign in with your lab account.
2. Then open the deploy URL. Your browser now carries the Forgejo session, so the page's admin WebSocket (`/admin/ws`) authenticates and the server flips you to **admin** mode.
3. **The FIRST Forgejo-authed person to connect after a fresh deploy is locked as the PRIMARY OPERATOR (master), persisted forever.** So connect first after the very first deploy and the master seat is yours across all reboots. (Other lab members who auth later get "admin" too, but flagged non-primary.)

You'll know you're admin: the dashboard badge reads **🔑 ADMIN**, and admin-only panels/buttons appear (Stop Brain, Auto-Scale controls, Server Console, grade signoffs).

---

## 3) How to open the DASHBOARD (as admin)

```
https://if-only-i-had-a-brain.git.unityailab.com/dashboard.html
```

Open it in the **same browser where you're logged into Forgejo** (so it connects as admin). The dashboard is read-only telemetry for viewers; for you it also shows the admin controls. Top-right badge confirms 🔑 ADMIN vs 🟢 VIEWER.

---

## 4) How to open the COMPUTE WORKER (donate your GPU)

```
https://if-only-i-had-a-brain.git.unityailab.com/compute.html
```

This is the page that **donates your GPU** to the brain. Open it in a WebGPU browser and leave the tab open — it connects over the public donor lane (`/ws`, no login needed) and starts computing. The brain trains/thinks on whatever GPUs are connected here.

- For max neuron capacity in Chrome, launch with:
  `--enable-unsafe-webgpu --enable-dawn-features=allow_unsafe_apis,disable_robustness`
- You can open compute.html on multiple machines/browsers — **every one becomes a brain replica that shares the compute** (that's the whole point: lots of people donating at once).

---

## 5) How to see the CONSOLE LOGS — three different logs, three ways

There are THREE separate logs. Know which one you want:

### (a) The BROWSER console (client-side JS) — for the brain page / dashboard / compute worker
This is what the *page* is doing in *your* browser (WebGPU init, WS connect, render).
- Press **F12** (or right-click → Inspect) → **Console** tab.
- Works on index (brain page), dashboard.html, and compute.html — open DevTools on whichever tab you want.
- This is where you'd see "RemoteBrain admin backend reachable", WebGPU adapter info, donor connect messages, client-side errors.

### (b) The SERVER console — IN THE DASHBOARD (admin-only, no SSH needed) ⭐
This is the brain-server's own `console.log` — the boot sequence, the K→PhD walk, teach phases, gate probes, saves. On a local PC this was the "Log Tail" window; **deployed, it's now a panel right in the dashboard.**
- Open the dashboard as admin (step 3).
- Scroll to the **🖥 Server Console (admin · live brain-server log)** card.
- It shows a 200-line backlog the moment you connect, then streams new lines live.
- Toggles: **auto-scroll**, **errors/warns only**; button: **clear view**. Errors are red, warnings amber.
- This is the deployed equivalent of watching the server terminal — use it to watch the walk progress.

### (c) The SERVER console — via SSH (raw, full history)
If you're on the box and want the unfiltered system log:
```bash
journalctl -u unity-brain -f         # live tail
journalctl -u unity-brain --since "1 hour ago"
systemctl status unity-brain         # is it running? last lines
```

---

## 6) Startup: there is NO start.bat / Savestart.bat deployed — here's what runs instead

**`start.bat` and `Savestart.bat` are LOCAL-Windows-dev only.** They do not exist on the server and there is no button to choose between them deployed. Instead:

- The brain-server runs as a **systemd service** (`unity-brain.service`) with `Restart=always`.
- It boots with **`DREAM_KEEP_STATE=1`**, which means **every restart PRESERVES the training** — i.e. **every deployed restart behaves like `Savestart.bat`, automatically.** You never have to choose "preserve vs wipe"; preserve is the default and the walk survives crashes/restarts.
- The only time weights are intentionally wiped + re-walked is a **milestone resize** (see §7) — that's the controlled, on-purpose "fresh start", and it's automatic when warranted.

Manual control from the box:
```bash
sudo systemctl restart unity-brain    # restart (preserves the walk)
sudo systemctl stop unity-brain       # stop
sudo systemctl start unity-brain      # start
```
From the dashboard as admin, use **🔄 Restart (Savestart)** — it force-saves weights, drops a resume marker, and exits **0**, so `Restart=always` revives it and it **resumes the walk**. Non-destructive, no code overlay, no shell needed.

⛔ **`⏹ Stop Brain` is a TRUE HALT and does NOT come back.** It exits **42**, and the unit's `RestartPreventExitStatus=42` makes that final on purpose — recovering it needs `sudo systemctl start unity-brain` on the box. This guide claimed the opposite until 2026-08-25, the button was pressed on that promise, and the trained brain sat at 502 until the server admin brought it up. **The button is now removed entirely from any dashboard not served from localhost**, so on the deployed box it is no longer reachable at all; a locally-served dashboard still has it, because there a halt is undone with `Savestart.bat`.

---

## 7) Retrain / brain-size scaling — when and why it happens

The brain auto-sizes to the **community compute** (sum of all connected donor GPUs' VRAM). This is **admin-controlled** in the dashboard:

**⚡ Community Compute & Auto-Scale panel (admin-only):**
- **Auto-scale toggle** — ON = the brain may grow itself when enough compute connects; OFF = it never auto-resizes and you drive size manually.
- **Dead-zone buffer slider (%)** — how far PAST a tier's gate the community must reach before a resize is even considered. This is the anti-thrash buffer: **a single person connecting/disconnecting right at a gate will NOT trigger a relearn.**
- **Stability-hold slider (minutes)** — how long that surplus must be *held* before the resize actually fires. Transient surges don't trigger it.
- Live readout: donor count, community VRAM, tier-qualified, tier-running, pending.

**Up-scale (grow):** when community compute crosses a milestone tier AND clears the dead-zone AND holds past the stability window, the brain saves, exits, and systemd restarts it at the **bigger** neuron count, then re-walks. This is the only intentional wipe+retrain.

**Down-protection (shrink):** **a donor leaving NEVER downgrades the running brain.** It can only cancel a not-yet-fired upgrade. Your brain doesn't shrink because someone closed a tab.

---

## 8) Open design questions you raised (my answers + recommendation)

**Q: "Loss of compute where neuron count can't be maintained by current connected users — do we need a downscale retrain?"**

Here's the honest situation and what I recommend:

- **If NO donor is connected:** the brain **pauses and waits** — its weights are safe on disk (`DREAM_KEEP_STATE=1`), and it resumes the instant a donor reconnects. No data loss, no downscale needed. It just idles.
- **The risky edge case:** if the brain was upscaled to a BIG tier (needs a big GPU) and then the big donors leave, leaving only small GPUs that can't physically hold that size → the brain can't run on the available hardware until a capable GPU returns.
- **Auto-downscale is a TRAP:** shrinking to fit = retraining from scratch at a smaller size = **throwing away everything the bigger brain learned.** Doing that automatically every time compute dips would be catastrophic — you'd lose the walk to a transient outage.

**BUILT (all of this is now live in the auto-scale panel):**
1. **Auto-scale is strictly up-only by default** + a separate, more-conservative **auto-downscale** path you control.
2. **Stable operating band** — between the downscale floor and the upscale gate, the brain just keeps running at its current neuron count. Donors come and go freely; **a single donor (or 10) leaving never downgrades the brain** unless compute stays collapsed below the floor past the downscale hold window.
3. **Insufficient-compute ALERT** — a red banner in the panel the instant connected GPUs can't hold the running tier, telling you the exact numbers ("connected X MB below the running tier floor Y MB") and whether a downscale is counting down or it's just waiting.
4. **Auto-downscale rectify (toggle, default ON)** — if compute genuinely collapses below the running tier's floor by more than the **downscale buffer (default 35%)** AND stays there past the **downscale hold (default 15 min)**, the brain rectifies: it retrains at the biggest tier the surviving GPUs can hold. The deep buffer + long hold = "buffers for the buffers" so a transient mass-disconnect that returns never shrinks you. Turn the toggle OFF to make it alert-and-wait only (never auto-shrink).
5. **Manual downscale button** — deliberate, immediate downscale (with a "this retrains + loses current progress" confirm) for when you decide to shrink on purpose.

**How the rectify actually runs (the "stop→savestart→full-train" you described):** it's the prompt-free deployed path — graceful save → `process.exit(0)` → systemd `Restart=always` brings the brain back → the boot-scaler reads the new (smaller) tier → the curriculum re-walks. **No `start.bat`, no y/n prompt** (you flagged start.bat's prompt as unusable for automation — correct; this path is automation-safe).

**Auto-advance survives ALL of it.** The "auto-skip to next grade" toggle is now persisted in its own file (`server/auto-advance.json`) that survives the weight-clear a resize performs. So once you flip it ON, **every restart, resize, downscale, and re-walk stays unattended** — the brain keeps auto-advancing through grades instead of pausing for a manual signoff. Maintenance + train runs are fully hands-off.

**Restart intelligence / timers:** restarts stay **event-driven, never on a timer** — they fire only on crash (systemd auto, preserves walk), deploy push (workflow restarts), and a confirmed tier change (up or down). A timed restart would just interrupt the walk for no reason, so there are none.

**Default gates (set, tunable in the panel):** upscale dead-zone buffer **20%**, upscale hold **5 min**; downscale buffer **35%**, downscale hold **15 min**; auto-downscale **ON**; auto-scale **ON**.

---

## 9) Quick reference

| I want to… | Do this |
|---|---|
| See the brain | open the deploy URL |
| Be admin/master | log into Forgejo first, then open the site (first authed = master) |
| Open dashboard | `/dashboard.html` (logged into Forgejo) |
| Donate a GPU | open `/compute.html`, leave it open |
| Page's JS console | F12 → Console (on any tab) |
| Server's live log | dashboard → 🖥 Server Console panel (admin) |
| Server log via SSH | `journalctl -u unity-brain -f` |
| Restart (keeps walk) | dashboard **🔄 Restart (Savestart)**, or `sudo systemctl restart unity-brain` |
| Brain is down / 502 after a Stop | `sudo systemctl start unity-brain` — **`start`, not `restart`**; it resumes the walk (`DREAM_KEEP_STATE=1`), so do NOT reach for Fresh Walk |
| Control auto-grow | dashboard → ⚡ Community Compute & Auto-Scale (toggle + sliders) |
| Why is it paused? | no donor GPU connected — open compute.html |
