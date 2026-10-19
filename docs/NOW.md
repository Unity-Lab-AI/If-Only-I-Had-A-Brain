---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/image-engine.js
  - server/brain-server/visual-memory.js
  - server/brain-server/gpu.js
  - windows/start.bat
  - windows/Savestart.bat
  - html/teachview.html
verified-scope: |
  OVERWRITTEN 2026-10-19, ~4:25 AM Denver. This file is a SNAPSHOT and is
  overwritten, never appended — the previous version described the 2026-10-18
  night and the boot that is now superseded. Git holds every byte of it:
      git show 0f0a21c0:docs/NOW.md

  The headline of this snapshot is a DECISION, not a reading: the operator has
  chosen a FRESH WALK so the brain can be re-sized to share its card with her
  voice and her eyes. The running brain described below is the OLD size and is
  about to be replaced.
last-verified: "2026-10-19, ~4:25 AM Denver — field reads on the operator's PC with the brain UP on the 3:59:46 AM resume boot (459,775,607 neurons, formatVersion 6): uptime 1,457 s · phases 2/25 in-progress on ela/kindergarten · spikesLifetime 4,771,469,822 · 1 donor · drops 0 · looks 37 attempts / 29 grounded / 6 engineDown · GPU 15,695 MiB used of 16,376, 367 MiB free · ZERO donor faults on this boot (the boot before it took two GPU hangs). The fresh-walk decision and the 8,000 MB budget derivation below were taken against these numbers."
tags: [snapshot, current-state]
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

## ⛔⛔⛔ NEXT UP IS A FRESH WALK

**The decision is made and it is the operator's.** The brain is about to be
re-sized so it stops claiming the whole card, and a neuron-count change is a
geometry change, which means the saved weights cannot be resumed. **The walk
starts from zero on the next `start.bat`.**

**Why.** Unbudgeted, the brain takes 85% of the card and the language-cortex
pass hands another 2 GB back, which sized her at **459,775,607 neurons** with a
**14,424 MB donor floor on a 16,376 MB card**. Her voice wants ~2,400 MB and a
512² render peaks at ~2,500 MB. There was never room for all three. Measured
mid-walk: **free VRAM 2,132 MiB, then 0 MiB**. A look could not allocate, and
the donor's own next allocation inside `compute_batch` stalled behind it —
**two GPU hangs in one boot, both `blocked 154s (limit 150s)`**, each costing a
full 17-matrix re-upload.

**The new size, derived rather than chosen.** The floor formula below was
verified by reproducing the live `runningFloorMB 14424` reading exactly:

```
  floor(N) = ceil((N × 20 / 1048576 + 2048) / 0.75)

  reserve on the card:  1,130  desktop + driver + image-engine CUDA context
                               (measured with the brain DOWN)
                        2,400  voice resident
                        2,500  render peak
                        -----
                        6,030  MB  ->  the brain may have 10,346 MB

  budget 10,000 MB ->  330M neurons · floor 11,131 ->  17,161 / 16,376   OVER
  budget  9,000 MB ->  297M neurons · floor 10,291 ->  16,321 / 16,376   55 MB spare
  budget  8,000 MB ->  264M neurons · floor  9,451 ->  15,481 / 16,376   895 MB  <= CHOSEN
  budget  7,000 MB ->  231M neurons · floor  8,611 ->  14,641 / 16,376   1,735 MB
```

⛔ **RE-PRICE, as the LAW requires before changing what she is taught.** 264M is
**0.57×** the 459.8M brain, and teach cost scales **with** the brain, so every
teach op gets about **0.57× cheaper**. Shrinking is the safe direction: the walk
gets faster, not longer. **The cost is capability, not time** — 264M is a
smaller brain than the one that just ran, and that is the trade being accepted.

⭐ **`DREAM_BRAIN_BUDGET_MB=8000` is now the default in all four launchers, and
it is the one number to change if she should be bigger.** Raising it spends the
895 MB of headroom; her eyes break first, then the donor.

⚠ **`start.bat` and `Savestart.bat` must always carry the SAME budget.** A
different budget is a different neuron count, so a resume would refuse as
incompatible and silently fall back to a fresh walk — throwing away the
training it was trying to preserve.

---

## The snapshot — the brain this replaces

**Boot `3:59:46 AM Denver`** (`mode: resume`, `reason: compatible`,
`formatVersion 6`), read live at **4:25 AM**:

```
  neurons          459,775,607          <- the OLD size; the fresh walk replaces it
  uptime           1,457 s
  phases           2 / 25 · in-progress · ela/kindergarten
  spikesLifetime   4,771,469,822 and climbing
  donor            1 attached · drops 0 · ZERO faults this boot
  looks            37 attempts · 29 grounded · 6 engineDown
  GPU              15,695 MiB used of 16,376 — 367 MiB free
  ports            7525 brain · 7526 control plane · 5123 voice · 5124 eyes — all answering
```

⭐ **Zero donor faults on this boot** against two on the boot before it. That is
not the fix working — the look-lane gate is not in the running build — it is
the reason the hang is understood as a VRAM race rather than a constant.

---

## What shipped tonight and lands on the fresh walk

| | |
|---|---|
| **Teach View came back from the dead** | One unescaped apostrophe per site, seven sites, from a prose sweep that wrote *the brain's machine* into single-quoted JS strings. **A syntax error anywhere in a `<script>` block means the whole block never executes** — all 154,789 B of it had been dead for a day. Verified by parsing every inline block, not by reading |
| **Teach View reaches the brain** | It was the only brain-facing page never wired to `js/brain-origin.js`; all four URL bases now resolve through it, and UNSET still changes nothing |
| **All four launchers open it** | Beside the landing page and the dashboard — it is the page that answers *what is going into her?* |
| **Free-VRAM gate, both lanes** | A render is refused when the card cannot hold it. ⛔ The first cut was in `_imageEngineRender` only — **the look lane bypasses that function entirely**, so the gate covered the minority caller while the lane doing ~165 renders a boot went ungated |
| **The gate fails OPEN** | A host that cannot be read by `nvidia-smi` must not have her eyes switched off forever by a probe that never worked. Counted apart as `vramUnreadable` |
| **The image engine is readable at last** | `_imageEngineStats` had been counted and published **nowhere**; it is `ownArt.imageEngine` now |

---

## What is NOT known, and will not be guessed

| Field | Why it is blank |
|---|---|
| The fresh walk's neuron count | **Derived at boot from the budget and the card, never a constant.** ~264M is the arithmetic above; quote the boot's own `totalNeurons` line instead once it exists |
| Whether the gate holds | `ownArt.lookups.vramTight` has never been read on a live boot — the running build predates it. **A climbing `vramTight` with zero donor hangs is the proof; anything else is a claim** |
| Whether 264M is enough brain | Unknown and unmeasurable before the walk. It is below the 306M the deployed box ran at |
| Phase timings past phase 2 | Zero of the 27 named ELA-K phases has ever completed on this brain, so there is no sample to price them from |

---

## ⛔ Read these before believing any field above

| Fact | Consequence |
|---|---|
| **The neuron count is derived at boot** | From the budget and the card. It is a property of the configuration, never of her. Quote it with its boot or not at all |
| ⛔⛔ **SERVING STATE IS NOT DOING WORK** | A brain once ran 53 minutes at `frames 0 · spikes 0 · psi 0` while `/health` answered instantly. Take **two samples a minute apart** of `spikesLifetime` — `totalSpikes` is instantaneous and falls on a healthy brain |
| ⛔ **A resume with a different budget is a fresh walk wearing a resume's name** | Neuron count is geometry. `start` and `Savestart` must carry the same number |
| ⛔⛔ **A prose edit to a JS string is a code change** | *the brain's machine* inside `'…'` killed an entire page for a day and looked like a documentation commit. **Syntax-check every inline block after editing any page's copy** |
| ⛔ **"The one chokepoint" is a claim to verify, not a phrase to use** | The free-VRAM gate was placed at a function the dominant caller never enters. Ask *where do all instances converge?* and accept the answer when it is "they do not" |
| ⛔ **A gate that cannot read its input must fail OPEN and say so** | Otherwise a probe that never worked silently disables a feature forever, and the counter reads zero because nothing ran — indistinguishable from healthy |
| **`blocked 154s (limit 150s)` is a driver wedge, not a slow batch** | 154 against a 150 s watchdog means the call never returned. The donor PROCESS survives it — no WER event, no dump, no crash.log — which is what separates it from the `0xc0000409` abort class |
| **`DREAM_KEEP_STATE` unset = WIPE** | `start.*` boots fresh; only `Savestart.*` resumes |
| **The site deploys on every push; the brain restarts only on a launch** | The page can be current while the brain is old. A `200` from the page says nothing about her |

---

## How to keep this file honest

1. **Overwrite it. Do not append to it.** The version before last died of
   appending — 82 stacked blocks, each written as *"current"*, none removed
   when they stopped being true.
2. **Every number is a field read**, pasted with the boot that produced it. If
   it was recalled rather than read, it does not belong here.
3. **No internal ticket identifiers and no personal attributions.** Those
   belong in the board, the ledger and the commit messages. A snapshot names
   the **mechanism**, never the ticket.
4. **When something here turns out to be false, the correction goes in the
   ledger** — not into a new paragraph on this page.

---

*The map is not the territory: this page is the map, the code is the brain. If they ever disagree, the code is right.*
