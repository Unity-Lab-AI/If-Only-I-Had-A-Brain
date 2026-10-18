---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-ctl.js
  - js/brain-origin.js
  - server/voice-synth-worker.mjs
  - server/brain-server/image-engine.js
  - windows/start.bat
  - windows/stop.bat
verified-scope: |
  RESET 2026-09-07 on the operator's instruction: "now can be reset to templet..
  its not a history archive and nothing in there is needed".

  OVERWRITTEN 2026-10-18. The machine every earlier snapshot described no
  longer exists: the rented box is gone, its hostname does not resolve, and the
  brain now runs on the operator's own PC behind a tunnel while GitHub Pages
  serves the site. Every table on the previous version quoted a boot on that
  box; none of it describes anything that can be read today, so none of it is
  kept here. Git holds every byte of it permanently on both remotes:
      git show c8ba98ad:docs/NOW.md

  This file is what its title claims: a SNAPSHOT. There is no running brain
  at the moment of this read, and the page says so instead of pretending.
last-verified: "2026-10-18, ~5:20 AM Denver — the 4:22 AM boot died at 5:06:56 with no trace (donor abort 0xc0000409 at 5:06:58); kill-all at 5:12 AM on the operator's word, all four ports free; nothing runs until his next start.bat. PRIOR: 2026-10-18, ~4:47 AM Denver — field reads on the operator's PC with the brain UP (boot d1979272, 4:22 AM): donor on loopback, 17/17 matrices, ela/kindergarten in progress, spikesLifetime 1.76 B and climbing; the public path answers 200/101/404. PRIOR: 2026-10-18, ~1:40 AM Denver — field reads taken on the operator's PC with NO brain process running: port 7525 unbound; the voice service answers {ok:true} on 127.0.0.1:5123; the image engine answers loaded:true device:cuda on 127.0.0.1:5124 with the checkpoint resident (2,813 MiB used of 16,376 on the RTX 4070 Ti SUPER) because the brain that issues the idle unload is not up; four 6,288,336,048-byte weight files sit under server/ awaiting the wipe the operator asked for; GitHub Pages answers 200 (55,881 B) and serves BRAIN_ORIGIN = '' so the public page has no brain to reach; Tailscale is not installed on this PC. Working tree: 30 changed paths on the feature branch, uncommitted at the time of the read. PRIOR: 2026-09-24 — the last read on the old box (233,932,309 neurons on 2dc34494, the PRIMARY floor measured against a tier target that did not exist). Superseded in full, see verified-scope."
---

# NOW — Session Snapshot

> **What this file is.** One page answering *"what is true about the running
> brain right now?"* — a small set of field reads, each quoted with the boot
> that produced it.
>
> ⛔ **What this file is NOT: a history archive.** It records the present and is
> overwritten as the present changes. **History belongs in exactly two places
> and this is neither of them.**

| If you want | Read |
|---|---|
| What is true right now | **this page** |
| Where to pick up, and what is still open | `docs/RESUME.md` |
| What is being worked on | `docs/TODO.md` |
| What was completed, and why | `docs/FINALIZED.md` |
| How the system is built | `docs/ARCHITECTURE.md` |
| The same thing in plain English | `docs/HOW-IT-WORKS.md` |

---

## The snapshot

> ⛔⛔ **5:20 AM — SHE IS DOWN, ON PURPOSE NOW.** The boot below **died at 5:06:56 AM with no trace** (log ends mid-teach, no shutdown line, no `^C`, no stack, window gone); the native donor aborted with `0xc0000409` two seconds later. The operator ordered a kill-all for a fresh walk; `stop.bat` ran at 5:12 AM — ports 7525/7526/5123/5124 all free, no donor, no windows. **Nothing is running until he presses `start.bat`.** What the next boot carries that this one did not: her window appends node's exit code to `server.log` the moment it returns; a fresh brain answers a chat turn with the honest silence WITHOUT a 14 s reply pass; the silent notice says the walk is running instead of telling him to start it; the donor (0.3.39) writes its own crash reason to `crash.log` and keeps symbols. The cause of the 5:06:56 death is NOT known.

**Last boot (dead):** `d1979272` on `develop`, **booted 2026-10-18 10:22:19 UTC (4:22 AM Denver)** — the operator's own `start.bat` press, fresh walk. Read live at **4:47 AM** on loopback: **`totalNeurons 459,775,607`** · GPU `NVIDIA GeForce RTX 4070 Ti SUPER` (16,376 MB) · **1 donor attached, on loopback** (`unity-donor-windows-x86_64.exe` in `Local (localhost:7525)` mode since 4:37 AM) · **`17/17 matrices uploaded`** · `cellStatus in-progress` on **`ela/kindergarten`** (cell started 4:37 AM; `teachStage _teachAntiHebbian-done`, age 11 ms) · **`spikesLifetime 1,756,942,304` and climbing** (3,125,393 at 4:30 → 9,299,580 at 4:39 → 1.76 B at 4:47) · donor queue `0 MB`, `drops 0` · `passedCellsTotal` none yet · `ownArt.drawn 0` · `state.voice.lastFeel null` — she has not spoken yet. ⛔ **The first 15 minutes of this boot were lost to the tunnel:** the donor was launched in its default "Live" mode and dialed the Funnel hostname from the same PC, and the 4,475 MB cortex upload measured **0.16 MB/s** through the relay (chunk 6 of 734 at the 180 s deadline, abandoned, retried). Flipped to Local: **4,268 MB in 7.9 s, 542 MB/s.** Public path, same boot: `/health` **200**, `/ws` upgrade **101**, `/admin/status` **404**. ⚠ Earlier tonight: boot 1 (`cbe51a81`, 3:20 AM) died at 3:25 to a Ctrl+C through the launcher console; boot 2 (`4d8180bd`, 3:35 AM) ran until this press. The launcher now gives her her own window. ⚠ The WAKE button on the chat page froze on *Booting brain...* for every visitor until 4:47 AM (a page-code throw, fixed in the bundle; no restart) — the brain never knew.

> ## ⛔⛔⛔ 2026-10-18, ~1:40 AM Denver (superseded by the boot line above, refreshed 4:30 AM) — SHE HAD MOVED HOUSE AND HAD NOT BEEN STARTED YET
>
> **Where she lives now.** The site is **`https://theunitybrain.com`** — GitHub Pages behind a custom domain bought ~5 AM; certificate issued ~6:15 AM and **HTTPS enforced**: `https://` 200, `https://www.` → 301 → apex, `http://` → 301 → https. ⚠ Until the cert existed, plain `http://` hid WebGPU from every browser and the boot gate blocked every visitor while she was up — that gate now asks the brain first and stays down whenever a server answers. The brain, her voice and her eyes all run on **the operator's own PC**, reached through **Tailscale Funnel** as `https://dumbass.tailec58e0.ts.net` — up and verified from the public internet at ~3:30 AM: the five forwarded lanes (`/public-state.json`, `/minds-eye.json`, `/health`, `/ws`, `/image`) answer **502** because nothing is on 7525 yet, and `/admin/status`, `POST /reset`, `/ctl/status` and `/` answer **404** — default-deny holds. `js/brain-origin.js` carries that hostname in the working tree; **the copy Pages is serving still says `BRAIN_ORIGIN = ''`** until the next push lands, so the public page has no brain to talk to for a few more minutes, and then it will have one that is not running.
>
> **What IS up, read live:**
>
> ```
>   127.0.0.1:7525  brain   d1979272         459,775,607 neurons · donor on loopback · 17/17 on GPU · ela/K in progress  (4:47 AM)
>   127.0.0.1:7526  ctl     brain-ctl.js     online · respondedMs 2
>   127.0.0.1:5123  voice   unity-voice-v2   {"ok": true}
>   127.0.0.1:5124  eyes    image engine     {"ok": true, "loaded": true, "device": "cuda",
>                                             "checkpoint": "realistic-vision-v51.safetensors", "busy": false}
>   GPU             NVIDIA GeForce RTX 4070 Ti SUPER   2,813 / 16,376 MiB used
>   RAM             103.5 GB free of 127.9 GB
> ```
>
> ⚠ **The image engine's `loaded: true` is now the brain's doing** — her idle-unload timer owns the checkpoint again; before this boot it sat resident only because nothing was telling it to let go.
>
> **What is on disk, read live (4:30 AM):** `server/brain-weights.bin` **6,288,336,048 bytes, written 4:26 AM by THIS boot** (`Binary weights saved 17 sections, 5997.0 MB`, 17 s wall, async-write + fsync) — the first checkpoint of the new home. The old box's weight files were auto-cleared on the first boot of the night; nothing from them survives.
>
> **What changed in her since the last snapshot, and is not yet started:**
>
> | | |
> |---|---|
> | Her voice | **`unity-voice-v2`**, a trained neural voice with emotion, intensity and speech act as inputs, on loopback `:5123`. **Piper is deleted in full** — model, runtimes, browser worker, donor dispatch, `voice-engine/` (~119 MB out of the published site). One synthesizer; if it is down she is silent and the worker counts why. |
> | Her eyes | **CORA's local Stable Diffusion** on loopback `:5124` behind one server-side gate. **Pollinations is deleted in full** — no key, no remote image API, no silent fallback. Paced as a VRAM budget on the shared card: one render at a time, idle unload, a 30 s gap between reference looks, yield during a donor upload. |
> | Her controls | The dashboard's start / stop / restart / savestart / fresh-walk buttons drive the **local control plane** (`brain-ctl.js` without systemd), which spawns the launchers. `stop` stops the control plane too unless told `keepctl`; a stop issued BY the control plane leaves it standing. |
> | Her address | `js/brain-origin.js` — one line, shipped empty. A `?brain=` query overrides it for testing. |
> | Her launchers | All four (`start` / `Savestart`, Windows and Linux) start the voice and image sidecars before the brain and say plainly when either is missing. |
>
> ⭐ **The donor binary points at the tunnel now.** `0.3.38` compiles in `wss://dumbass.tailec58e0.ts.net/ws` and its page links go to the Pages site; it is built and published by GitHub Actions to GitHub Releases (the Forgejo lane built to the dead box and is disabled, not deleted). Until that release's assets exist, a download still hands out the old binary — the first read after the tag is `gh release view donor-v0.3.38` showing both assets, then the download page's version label.

---

## What is NOT known, and will not be guessed

| Field | Why it is blank |
|---|---|
| Neuron count | **Known: 459,775,607 on boot `d1979272`** (card-sized: 14,328 MB usable of the 16 GB card, not host RAM — the same code gave the same count on the two earlier boots tonight). Quote it with its boot. |
| Walk position | `ela/kindergarten in-progress` since 4:37 AM; no cell passed yet. The first cell pass and her first drawing are the two milestones still unread on this boot. |
| Loop lag, Ψ, Φ̂, coherence | Not yet read on this boot — take them from `/public-state.json` once she has an hour behind her, two samples a minute apart. |
| Reachability of a RUNNING brain through the tunnel | The tunnel is proven only against an absent brain (502). The first boot proves `/health` 200 cross-origin from Pages, and `/ws` carrying chat. |

---

## ⛔ Read these before believing any field above

These are the traps this project has actually fallen into. The ones from the old box that still bind are kept; the ones learned moving house are new.

| Fact | Consequence |
|---|---|
| **The neuron count is derived at boot from free host RAM** | It is a property of the machine, never of her. Quote it with its boot or not at all. |
| **The site deploys on every push; the brain restarts only when the operator presses or launches** | **The page can be current while the brain is old** — or, as now, while there is no brain at all. The page answering `200` says nothing about her. |
| ⛔⛔ **SERVING STATE IS NOT DOING WORK** | A brain once ran **53 minutes at `frames 0 · spikes 0 · psi 0`** while `/health` answered in under a millisecond. Take **two samples a minute apart** of `frameCount`, `spikesLifetime` and `cellStatus`. `totalSpikes` is instantaneous and falls on a healthy brain; `spikesLifetime` is the monotonic twin. |
| **A stage tag whose age climbs while its sequence stays frozen means the blocker is in unmarked code** | `_tstage` is never nulled. **The sequence number is the discriminator; the age is the signal.** |
| **Every teach rate reads 0 during the pre-cell definition bootstrap** | Legitimately dead for hours before phase 1. Read `liveness.teachStage` with its age. |
| ⛔ **A "never-mute floor" under the real lane is a fallback with a kinder name** | The first cut of the voice swap kept the old synthesizer beneath the new one, and the browser's old lane still fired FIRST — a listener heard whichever answered. **If a second path exists, it will be the one that speaks.** One lane, or silence with the reason. |
| ⛔ **A lazy init that another path depends on is a dependency, not an optimisation** | The shared percept transform was loaded inside the old voice's init; making that init lazy broke the new voice on the second run and not the first. **Load shared things eagerly; lazy-load only what is private.** |
| ⛔⛔ **Removing an ignore rule for a path that still exists on disk IS a commit of that path** | A stale credential file reached the public mirror the moment its `.gitignore` line was deleted and `add -A` ran. The file was empty, so nothing leaked — the mechanism did not care. **Delete the file first, or keep a tombstone ignore.** |
| ⛔ **Loopback trust is tunnel-blind** | A request forwarded by a tunnel arrives from `127.0.0.1`, so every tunnelled request passes a loopback check. **Trusting a header's presence is not enough either; the terminator must strip the inbound header.** Publish only the read-only routes; the WebSocket server upgrades on ANY path, so the route list is the only thing enforcing `/ws`. |
| ⚠ **Tunnel path rules match by PREFIX** | `/image` admits `/image/anything`. Write the rule list knowing that. |
| ⛔⛔ **A bare port to the tunnel CLI means "expose that local port at `/`"** | `funnel --bg 443` looked like "turn Funnel on for 443" and silently added `/ → 127.0.0.1:443` on every run — default-allow wearing an allowlist. Enable Funnel **per path** (`funnel --bg --https=443 --set-path=/x <target>`), and count the root routes after any tunnel change: the number to read is **0**. |
| ⛔ **A bare `find` in a launcher is whichever `find` PATH names** | Under a git-bash PATH (or any process it spawned — the control plane, once) it is GNU `find`, which reads `/c` as a directory and walks the drive; its errors flip `if errorlevel` branches the wrong way. Launchers call `%SystemRoot%\System32\find.exe` by path. A launcher that works from Explorer and misbehaves from a button is this. |
| ⛔ **From the brain's own machine, the public page cannot reach the tunnel unless the node stops accepting MagicDNS** | MagicDNS resolves the funnel host to the node's private `100.x` address there; Chrome treats a public page's fetch to it as Local Network Access and denies it. `curl` works, visitors elsewhere work, only the host's browser fails. `tailscale set --accept-dns=false` on the node makes it resolve publicly and hairpin through the Funnel. |
| ⛔⛔ **The public tunnel is rate-limited by its relay — a donor must never dial it from the brain's own machine** | Funnel traffic rides Tailscale's relay under *"non-configurable bandwidth limits"*: a same-PC donor in its default Live mode pushed the 4.5 GB cortex at **0.16 MB/s** (eight hours), stalling the pump at chunk 6. Stop the donor, pick `Local (localhost:7525)`, Start: **542 MB/s, 8 s.** A remote donor still has only the relay — that is an open design question, not a setting. |
| ⚠ **On Windows the tunnel daemon's profile dies with the tray app** | Closing the Tailscale tray app took Serve and Funnel down while the brain kept running. Unattended mode is on and the launchers restart the tray app; if the public path reads `000`, check the tray first. |
| ⚠ **A page served from a repository sub-path breaks every absolute URL in it** | Two `/js/…`-style references 404'd on Pages until made file-relative. **Grep for leading-slash paths before publishing to a sub-path.** |
| **A batch `%ERRORLEVEL%` inside a parenthesised block is expanded at parse time** | Use `if errorlevel 1`, which is evaluated at run time. |
| ⚠ **`cmd | head || echo` masks a missing binary** | A check for the tunnel client printed nothing and was nearly read as fine. Check the binary directly. |
| **The stale "weights" on disk are the old box's and are scheduled to die** | `start` wipes, `Savestart` resumes. **A 6 GB file in `server/` is not evidence of a brain.** |

---

## How to keep this file honest

1. **Overwrite it. Do not append to it.** The previous version died of appending — 82 stacked blocks, each one written as *"current"*, none of them removed when they stopped being true. This version was overwritten for the same reason: every table it replaced described a machine that no longer exists.
2. **Every number is a field read**, pasted with the boot that produced it. If it was recalled rather than read, it does not belong here.
3. **No internal ticket identifiers and no personal attributions.** Those belong in the board, the ledger and the commit messages. A snapshot names the **mechanism**, never the ticket.
4. **When something here turns out to be false, the correction goes in the ledger** — not into a new paragraph on this page.

---

*The map is not the territory: this page is the map, the code is the brain. If they ever disagree, the code is right.*
