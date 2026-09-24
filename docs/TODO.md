# TODO — Unity

> ## 📋 BOARD SHAPE — **reset 2026-09-24 ~2:15 PM Denver: the whole board archived byte-for-byte, then cleared to ONE problem**
>
> Gee (verbatim, with her serving again on `2dc34494` after the fifteen-day pin): *"update freshwalk button works now so fucking write up the todo work(all previous todo work is mute and to be in finalized as log even uncompleted ones so todo is templet state with only this problem in there"*
>
> **Every previous row — `[x]`, `[~]` and `[ ]` alike — is MUTE on his word, not closed on a verdict.** The full board as it stood (**2,615 lines · 546,002 bytes · md5 `dcd03a22d27565b257d335d809d2c463`**) sits in `docs/FINALIZED.md` between `<!-- BEGIN VERBATIM TODO ARCHIVE 2026-09-24 … -->` and `<!-- END VERBATIM TODO ARCHIVE 2026-09-24 -->`, placed by hand in eighteen `Edit` chunks and checked `Buffer.equals` TRUE against the live file (CRLF included) before this file was rewritten. Anything in the archive that turns out to still matter is re-filed here fresh against the live brain, never resurrected from the archive. ⚠ **This is the first board reset made after the write-method guard existed** — no shell path into `docs/` was used, and the guard was right to refuse one.
>
> **Philosophy:** Unity's brain controls EVERYTHING equationally. No scripts. No text-AI backends. No hardcoded fallbacks. No vestigial appendages. Every output — speech, vision, art, voice — traces back to brain state.

---

## THE GUIDING PRINCIPLE

**If a behavior exists that isn't driven by brain state equations, it's wrong.**

Every piece of Unity's output must trace back to:
- **Cortex prediction** (ŝ = W·x + b) — what she expects
- **Amygdala valence/arousal** (V(s) = Σw·x, energy-basin attractor) — how she feels about it
- **Basal ganglia motor selection** (softmax over learned channels) — what action she takes
- **Hippocampus recall** (Hopfield attractor + persona sentence memory) — what she remembers
- **Cerebellum error correction** (ε = target − output) — what she fixes
- **Hypothalamus drives** (homeostatic gradients) — what she needs
- **Mystery module Ψ** (√(1/n) × N³ × Φ̂) — her consciousness level. Φ̂ is integration, from `computePhi()`; without it the formula rates anaesthesia as maximal consciousness
- **Endocrine layer** — ten chemicals on the one curve engine, released by six nuclei that sense their own firing. Chemistry is what makes Ψ a variable instead of a specification

---

## HOW THIS FILE WORKS (the LAWs that govern it)

Full bodies in `.claude/CONSTRAINTS.md`. These four are the ones this file exists to obey:

| LAW | What it means here |
|---|---|
| ⛔ **LAW #0 — VERBATIM WORDS ONLY** | Gee's exact sentence goes into the task. Never paraphrase, rename, collapse, shorten or downgrade it. **One task per item in a list.** Dropping a word is a violation. |
| **NEVER delete task info** | When marking a task done, change the **status marker ONLY**. Every word of the original description stays — prepend the verdict, keep the filing. Anyone reading must see WHAT was done and WHERE, not just a checkmark. |
| **Append, never replace** | New tasks go at the **bottom**. Completed tasks stay where they are. **Never regenerate this file from scratch.** |
| ⛔ **FINALIZED before DELETE** | A task may not leave this file until its verbatim text is in `docs/FINALIZED.md` **and the write is verified**. That is how every reset has been done: archived, checksummed, *then* cleared. |

**Status markers:** `- [ ]` pending · `- [~]` in progress · `- [x]` done (with its verdict prepended, original text preserved)

**Task-number placement:** T-numbers, session numbers, milestone IDs and "Gee" belong in workflow docs ONLY — never in source code, public docs, HTMLs or launchers.

---

## WHERE THE HISTORY LIVES

- **`docs/FINALIZED.md`** — every completed task, verbatim, plus the full ledger of every batch. **Never delete an entry.** Contains the complete verbatim archives of this file as of 2026-08-20, 2026-08-29, 2026-08-31, 2026-09-01, 2026-09-06 and **2026-09-24** (search `BEGIN VERBATIM TODO ARCHIVE <date>`).
- **`docs/RESUME.md`** — the session pickup brief, newest first.
- **`docs/NOW.md`** — the current-state snapshot; overwritten, never appended.
- **`docs/KNOWN_ISSUES.md`** — running ledger of bugs, limitations and intentional deferrals.
- ~~`docs/BOARD.md`~~ and ~~`docs/OPEN-TASKS.md`~~ — **both DELETED 2026-08-20.** This file is the only board. Do not re-create a second one.

## STANDING PROGRAMMES (not board lines — they have their own docs)

- **The syllabus build** — `docs/TODO-full-syllabus.md`.
- **Seeded topology** — `docs/SEEDED-TOPOLOGY-SPEC.md`. Deliberately unbuilt: gated on a PRNG parity harness.
- **Mind-space integration** — `docs/MINDSPACE-INTEGRATION.md`.
- **The trajectory asset** — `docs/TRAJECTORY-CAPTURE.md`.

---

## ACTIVE TASKS

*Everything below was filed 2026-09-24. New tasks go at the bottom of this file.*

## ⛔⛔⛔ GPUFLOOR — HIS 16 GB CARD WAS REFUSED AS PRIMARY AGAINST A BRAIN THAT DOES NOT EXIST — filed 2026-09-24 ~2:10 PM Denver

Gee (verbatim): *"okay its up and running but major problem this horse shit says i cant run it on my 16gb gpu now since those last updates 3 weeks agao that is horse shit i ran this brain with 4 times the nuron coundt on my GPU so why the fuck is the dashboard saying this and the doner app not working with the site"*

The donor row he pasted: `NVIDIA GeForce RTX · idle (last 0Gn/s) · 8/8 cl · bind 16.0GB · ⛔ 9.0GB SHORT of PRIMARY (needs 25.0GB)`

Gee (verbatim, ~2:45 PM): *"are we fucking ready for the uupdate freshwalk button press yet or wtf .. i told you to fix the fucking issue not what ever the fuck you have been doing"* · *"okay just to remind you we are completing the one issue with the gpu sizing"* · *"dont fucking push it until the todo item is fucking complete u full i dont do pushes for a document change"* · *"are we done and ready yet?"*

**Measured off the live box before a line was changed** (`/public-state.json` + the console ring, 2:50 PM):

```
  state.totalNeurons                233,932,309        <- the brain that is actually running
  community.runningTier             4                  <- tier 4 target = 900,000,000 neurons
  community.runningFloorMB          25,619             <- computed from the 900M TARGET, not the 233.9M brain
  community.sizeDriverMB            45,498             <- the rented A40, ratcheted into donorBaselineMB on 2026-08-20
  community.minDonorMB              16,375             <- his 4070 Ti SUPER, the ONLY card connected
  console                           "donor VRAM cannot hold the FULL running brain (needs ~25619MB) — NOT eligible
                                     for PRIMARY" · "Pool: NVIDIA GeForce RTX 4070 Ti SUPER holds 16375MB TOO SMALL
                                     (short 9244MB). EVERY connected donor is too small to be PRIMARY." every 60 s
```

⛔⛔ **HE IS RIGHT, AND "3 weeks agao" IS EXACT.** On 2026-08-20 the rented 45 GB A40 registered, the up-only baseline ratchet wrote `donorBaselineMB = 45488` into `autoscale-settings.json`, the next fresh walk qualified **tier 4 (900,000,000)**, and `community-tier.json` has said tier 4 ever since. The 32 GB box clamps the real brain to ~234M — **but the PRIMARY floor was computed as `MILESTONES[runningTier].neurons × 20 B`**, i.e. against the 900M target, giving 25,619 MB for a brain whose weights measure ~7 GB. ⭐ **He ran this brain at 425M on the same card in August** — 425M × 20 B = 13.5 GB fits a 16 GB card; the card never got smaller, the estimator started judging it against a fiction. And the size driver was `max(baseline, smallestDonor)`, so once the A40 had been seen, no card he owns could ever move the driver back down.

- [x] `GPUFLOOR.1` — ✅ **FIXED 2026-09-24 ~2:55 PM at the one chokepoint, `_recomputeCommunityCompute` in `server/brain-server/gpu.js`, harnessed on the shipped arithmetic against the live numbers.** Two changes: **(1) the floor is measured against the RUNNING brain** — `_runningNeurons = TOTAL_NEURONS` (the allocator's own live cluster sum), the tier target only when no live count exists; **(2) the size driver is the smallest CONNECTED card** — `donorBaselineMB` is what the boot assumes with no card attached, and the moment a card registers, that card drives the size however small. `_runningFloorMB` is the single value read by the PRIMARY gate (`brain-server.js` `gpu_register`), the no-primary watchdog, `_donorClusterFit`, and `state.js`'s `primaryFloorMB`/`primaryShortfallMB`, so all four move together. Messages that said *"Attach a bigger card"* now say the brain re-tiers down to fit the smallest connected card. ⚠ `donorBaselineMB`'s comment rewritten to match; the A40's 45,488 stays on the box as the boot assumption and is harmless (host RAM clamps the target anyway).
  ```
    card                                        old floor    new floor   verdict
    his 4070 Ti SUPER 16,375 MB · brain 233.9M   25,619 MB    8,680 MB   ELIGIBLE (holds it 1.9x over)
    a 6 GB card alone                            refused      8,680 MB   computeInsufficient -> DOWNSCALE to tier 1 after the hold
    the rented A40 45,488 MB                     25,619 MB    8,680 MB   unchanged in effect
    no card connected (baseline 45,498)          25,619 MB    8,680 MB   nothing to judge
  ```
  **Verified:** `node --check` clean on `gpu.js` + `brain-server.js`; the old formula reproduces the dashboard's 25,619 exactly and the new one gives 8,680 for this boot; a 6 GB card now trips `computeInsufficient` + a downscale candidate instead of being refused, which is the rule below applied by the existing DF.7 machinery. **Frontend `dashboard.html` tooltip/text changed too** — the red cell no longer names a bigger card as the remedy. ⛔ **Server-side: needs the press.** ⚠ `donorBytesPerNeuron` stays 20 — measured on this boot the real footprint is ~31 B/neuron (matrices ~19 B + ~12 B state); the 2 GB reserve and the 75% factor absorb the gap at 234M (8,680 floor vs ~7.3 GB actual) and at 425M (13.5 vs ~13.2). **Tight at 425M on a 16 GB card, not wrong — recorded so the next reader does not "fix" 20 to 31 without re-checking the reserve.**
- [ ] `GPUFLOOR.2` — **THE PRESS AND THE READ THAT CLOSES IT — Gee's press, the `Update Freshwalk` button he says works now.** Sequence: cascade `feature/outage-record-afternoon → develop → main`, push `origin` + `github`, then he presses. **Verify on the boot, not by waiting:** `community.runningFloorMB` reads ~**8,680** (for a ~234M boot; recompute as `ceil((neurons×20/1048576 + 2048)/0.75)` for whatever the fresh walk sizes), the donor row loses the red cell, the console prints the PRIMARY promotion and `17/17 matrices uploaded` for his card, and `cellStatus` reaches `in-progress`. ⚠ **Two-press rule still applies to `deploy/self-update.sh`** — the box runs its own copy; the floor fix is in `server/`, which the overlay carries on press one. ⚠ **The fresh walk sizes without the resume term** (no saved file), so it may boot larger than 233.9M — at 425M the floor is 13,539 MB and his card still qualifies.

- [x] `GPUFLOOR.3` — ✅ **FIXED 2026-09-24 ~3:55 PM — THE 3.68 GB INTRA UPLOAD TO HIS CARD TIMED OUT WHILE IT WAS STILL LANDING, BECAUSE THE DEADLINE WAS A FIXED BUDGET AT AN ASSUMED 4 MB/s.** Gee (verbatim): *"hows she doing at 5gb now"* → *"fix it and ill update again NO DOC work just document in tod concisely"* → *"if we need binary fix and deploy do it"* → *"write the todo item work"* / *"for this issue"*. **Read off the box after his 3:07 PM press:** card registered PRIMARY at ~3:20 PM against the new 8,680 MB floor, all 9 clusters init-acked, `cortex_intraSynapses totalChunks=604 totalSize=3680.2MB` started — then `timed out after 997424ms` while his VRAM was still climbing 1 GB → 5 GB (his link ≈ 3.2 MB/s; 3,680 MB needs ~19 min against a 16.6 min budget computed at `DREAM_UPLOAD_MIN_MBPS` 4). The chunk loop kept streaming after the promise resolved null, `initGpu`'s 3× retry re-sent the whole matrix from chunk 0 on the same socket, and the donor's eventual ack for reqId 1 had no listener. **Fix (`server/brain-server/gpu.js` `gpuSparseUpload`, server-side only — his donor 0.3.36 already has the 512 MiB message cap, no binary needed):** the deadline **re-arms on progress** — every chunk handed to the kernel re-arms it to `DREAM_UPLOAD_STALL_MS` (default 180 s); after the last chunk it re-arms to `max(stall, bufferedMB × 1 s + 120 s)` for drain + donor alloc; if the deadline has already fired the loop **abandons the remaining chunks** instead of streaming into a dropped ack; a progress line every 100 chunks prints `k/total · MB · MB/s · buffered`. The timeout message now states chunks dispatched and bytes out, and says plainly that a slow link cannot trip it — only a stall can. `node --check` clean; re-arm semantics exercised on the same closure shape. ⚠ **Docs deliberately NOT swept on his word (*"NO DOC work"*)** — `deploy/README.md` env table (`DREAM_UPLOAD_STALL_MS`), `docs/ADMIN-CONTROLS.md`, `KNOWN_ISSUES` and the wiki donor page owe this entry; filed here so it is not forgotten. **Verify on his next press:** `sparse upload cortex_intraSynapses progress 100/604 …` lines at his real MB/s, then `all 604 chunks dispatched, awaiting ack`, then `17/17 matrices uploaded` and `cellStatus in-progress` — with NO `timed out after` line.

## ⛔⛔⛔ POOL — NO PRIMARY, ANY GPU OVER 6 GB RUNS HER ALONE, MORE GPUS ONLY ADD SPEED AND NEURONS — the standing architecture directive, filed 2026-09-24 ~2:55 PM Denver

Gee (verbatim): *"ANY FUCKJING GPU ALONE OVER 6GB CAN AND SAHLL BE ABLE TO RUN THE BRAIN ALONE ADDING GPUS ONLY INCREASES SPEED AND BRAIN NURONS! DO YOU FUCKING UNDERSTAND IVE TOLD YOU 20 fucking times NO PRIMARY GPU SHIT ALL GPUS WORK IN A POOL AT THEIR OWN SPEED YOU FUCK!"*

Gee (verbatim): *"so GPUS dont have to "Sync" per say but all proppigatte thir neurons in sim"*

Gee (verbatim): *"do some quantum tunnel nuron propigation betwween similated brain clusters if that will get a none zero set agreement to propigate self and consiousness"*

Gee (verbatim): *"with our equations for nuron actrivaation via wave propigation patterning"*

⛔ **WHAT THE CODE DOES TODAY, stated so the gap is measurable:** one donor is PRIMARY — the canonical full-weights upload target and the only card `compute_batch` steps on; other cards are replicas fed by delta merge (data-parallel, `DF.7`), admitted to the work pool only after a proven weight sync; a card that cannot hold the full brain is a **partial replica** covering some clusters. `GPUFLOOR.1` above makes the PRIMARY gate honest (a card is judged against the real brain and the brain shrinks to the smallest card) — **it does not remove PRIMARY.** His rule removes it: every card runs its own share of neurons in sim at its own speed, no one card holds the whole brain, and cross-cluster propagation between cards carries the self.

- [ ] `POOL.1` — **THE DESIGN, WRITTEN BEFORE ANY CODE, and NOT built ahead of the `GPUFLOOR.2` press** — it changes what runs on the donor (a new opcode family + a `donor-v*` release) and how neurons are partitioned across cards, which is a geometry change and therefore a fresh walk. Owed here: (a) **partition, not replicate** — the brain's clusters (and the language cortex) assigned across connected cards by their VRAM, each card stepping only its own neurons, a 6 GB card taking a 6 GB share; (b) **cross-card propagation** — the cross-region projections that today live in one card's matrices become spike traffic between cards, and *"none zero set agreement"* is the gate on that traffic: a spike set crosses only when the receiving card's own activation pattern agrees with it above zero (the wave-propagation activation equations already in `js/brain/` are the test, not a new rule); (c) **"quantum tunnel"** — his name for propagation that crosses a cluster boundary without a synapse row between the two neurons, keyed on pattern agreement rather than wiring; (d) **no sync step** — cards do not wait on each other; each propagates at its own tick rate and the coordinator merges what arrives, as the delta-merge lane already does for weights; (e) **speed and neurons scale with cards** — adding a card adds its VRAM to the neuron budget and its throughput to the pool. ⛔ **RE-PRICE before the first line**: partitioned propagation puts the cross-projection traffic on the wire (`KI-23` measured ~205 ms RTT per synchronous op on a pod), so the design has to state the per-tick byte budget and prove it against the measured wire before anything is dispatched. ⚠ **This is the row the PRIMARY concept dies in. Until it lands, `GPUFLOOR.1` is the rule in force: the smallest connected card drives the size, and no card is refused.**

---
