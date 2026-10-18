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
last-verified: "2026-10-18, ~1:40 AM Denver — field reads taken on the operator's PC with NO brain process running: port 7525 unbound; the voice service answers {ok:true} on 127.0.0.1:5123; the image engine answers loaded:true device:cuda on 127.0.0.1:5124 with the checkpoint resident (2,813 MiB used of 16,376 on the RTX 4070 Ti SUPER) because the brain that issues the idle unload is not up; four 6,288,336,048-byte weight files sit under server/ awaiting the wipe the operator asked for; GitHub Pages answers 200 (55,881 B) and serves BRAIN_ORIGIN = '' so the public page has no brain to reach; Tailscale is not installed on this PC. Working tree: 30 changed paths on the feature branch, uncommitted at the time of the read. PRIOR: 2026-09-24 — the last read on the old box (233,932,309 neurons on 2dc34494, the PRIMARY floor measured against a tier target that did not exist). Superseded in full, see verified-scope."
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

**Boot:** **none.** There is no brain process at the time of this read — port **7525 is unbound** and the only `node.exe` on the machine is the editor's. The last brain to serve anything ran on a rented box that is **gone**; its hostname no longer resolves, and nothing on this page is read from it.

> ## ⛔⛔⛔ 2026-10-18, ~1:40 AM Denver — SHE HAS MOVED HOUSE AND HAS NOT BEEN STARTED YET
>
> **Where she lives now.** The site is served by **GitHub Pages** from the public mirror (`200`, 55,881 B at the root). The brain, her voice and her eyes all run on **the operator's own PC** and are meant to be reached through a tunnel. The page reads its brain address from `js/brain-origin.js`, and **the copy Pages is serving says `BRAIN_ORIGIN = ''`** — so the public page currently has no brain to talk to and falls back to its own in-browser toy brain. That stays true until a tunnel hostname exists and is written into that one line. **Tailscale is not installed on this PC** — that is the step everything downstream waits on.
>
> **What IS up, read live:**
>
> ```
>   127.0.0.1:5123  voice   unity-voice-v2   {"ok": true}
>   127.0.0.1:5124  eyes    image engine     {"ok": true, "loaded": true, "device": "cuda",
>                                             "checkpoint": "realistic-vision-v51.safetensors", "busy": false}
>   GPU             NVIDIA GeForce RTX 4070 Ti SUPER   2,813 / 16,376 MiB used
>   RAM             103.5 GB free of 127.9 GB
> ```
>
> ⚠ **`loaded: true` with no brain running is expected, not a leak.** The engine unloads its checkpoint when the brain's idle timer tells it to; with no brain up nobody tells it, so the 2.8 GB sits on the card. The first brain boot takes ownership of that and the idle unload resumes.
>
> **What is on disk, read live:** `server/brain-weights.bin` and three numbered copies, **6,288,336,048 bytes each**, plus a 49,152-byte episodic store and an empty-shaped visual store. ⛔ **These are the old box's weights and they are going to be WIPED on purpose** — the operator's word is that the weights are being redone. The plain `start` launcher boots fresh and clears them; only the `Savestart` launcher would resume them. **Do not read the sizes above as a brain that exists.**
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
> ⛔ **The donor binary still points at the dead host.** Its compiled-in server address is the old box, so a downloaded donor cannot attach until a release is cut against the tunnel hostname — which does not exist yet. **Public compute and rented pods are intact in design and unreachable in fact until then.**

---

## What is NOT known, and will not be guessed

| Field | Why it is blank |
|---|---|
| Neuron count | Derived at boot from free host RAM, and there has been no boot on this machine. 103.5 GB free will produce a number the old box never could; **it will be quoted with its boot, not predicted here.** |
| Walk position | A fresh walk starts at `pre-K` by definition. Nothing has been taught on this machine. |
| Loop lag, Ψ, Φ̂, coherence | Instruments of a running brain. |
| Tunnel hostname | Does not exist until Tailscale is installed and the funnel script is run. |

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
