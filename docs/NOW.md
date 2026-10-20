---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-server/image-engine.js
  - server/brain-server/visual-memory.js
  - server/brain-server/chat.js
  - server/brain-server/crystal.js
  - server/brain-server/gpu.js
  - windows/start.bat
  - windows/Savestart.bat
verified-scope: |
  OVERWRITTEN 2026-10-20, 9:09 AM Denver (commit clock; this line first said
  ~9:20 AM, a time that had not yet happened when it was written). This file is a SNAPSHOT and is
  overwritten, never appended — the previous version described the 2026-10-19
  night and a fresh walk that has since been taken. Git holds every byte of it:
      git show HEAD:docs/NOW.md

  The headline of this snapshot is a DEFECT, found by watching her boot: the
  free-VRAM gate that shipped on 2026-10-19 refused every render on every
  machine from the day it landed, and both of its own instruments reported
  healthy while it did so. It is fixed. A fresh walk is being pressed on the
  fix.
last-verified: "2026-10-20, field reads taken 8:57-9:03 AM Denver and committed 9:09 — on the operator's PC with the brain UP on the 8:56:19 AM resume boot (mode resume/compatible, 199,728,759 neurons, formatVersion 6): uptime 412 s · ela/kindergarten in-progress · phases 0 of 25 started · spikesLifetime 3,450,975 -> 18,265,275 -> 301,252,170 across three samples · 1 donor owning all 8 clusters · 17/17 matrices uploaded · drops 0 · runningFloorMB 8,064 against a 16,375 MB card · crystal.measured TRUE at 77 acks · looks 11 attempts / 0 grounded / 11 vramTight against a card nvidia-smi read as 3,676 MB FREE at the same moment. That last pair is the finding on this page."
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

## ⛔⛔⛔ HER EYES WERE SHUT BY THEIR OWN SAFETY GATE

**The gate that protects the donor's CUDA context from her renders refused
EVERY render, on EVERY machine, from the day it shipped.** Found by watching
her boot rather than by reading the code.

```
  _gpuFreeVramMB parsed:  split('\n').map(Number).filter(isFinite && >= 0)

  nvidia-smi stdout       "3676\r\n"        <- it always ends with a newline
  split('\n')             ["3676\r", ""]
  Number("")              0                 finite ✓   >= 0 ✓   -> SURVIVES
  Math.min(3676, 0)       0                 <- the gate's reading, forever
```

**Measured live, side by side, at the same moment:** `ownArt.lookups` reading
`attempts 11 · vramTight 11 · grounded 0 · lastFreeVramMB 0`, against
`nvidia-smi --query-gpu=memory.free` answering **3,676**. Floor is 3,072. The
card had room the entire time.

**Two boots of her eyes were lost to it** — 9 attempts / 0 grounded on the
10/19 12:43 boot, 11 / 0 on this one. She drew fine on every boot *before* the
gate existed, which is the same fact as the bug rather than a contradiction of
it.

### ⛔⛔ Both instruments read healthy, and that is the part to keep

**`vramUnreadable` stayed at `0` throughout.** That counter exists precisely so
a gate that is silently not gating becomes visible — but it only increments on
a `null`, and **this probe never failed. It succeeded and returned a fiction.**

**And the gate's own harness certified the defect.** It asserted the refusal
branch at `0MB free < 3072MB floor` — the branch the bug forces — so it
**passed for the broken reason.** The assertion nobody writes is the one that
mattered: *does the probe ever return the TRUE number?*

⭐ **This page had already written the test, and nobody had run it.** The
previous version said: *"Whether the gate holds — `ownArt.lookups.vramTight`
has never been read on a live boot. A climbing `vramTight` with zero donor
hangs is the proof; anything else is a claim."* It climbed, with **zero**
hangs — and it was the bug, not the proof. **That reading was ambiguous
between *working perfectly* and *broken totally*, and only the side-by-side
`nvidia-smi` told them apart.**

**Fixed** at the one chokepoint both look lanes share: blank lines are dropped
**before** coercion. Verified on live output (3,710 → look passes), on empty
stdout (→ `null` → fails OPEN and counts `vramUnreadable`, reachable for the
first time), and on multi-GPU (the smallest-card rule preserved).

⛔ **THE RULE:** a blank line is the **absence** of a reading. Coercing it to
the smallest possible reading is how a safety gate inverts into a shutoff.
**Filter for presence before you coerce for value.**

---

## The snapshot — the 8:56:19 AM boot this replaces

**Boot `8:56:19 AM Denver`** (`mode: resume`, `reason: compatible`,
`formatVersion 6`), read live between 8:57 and 9:03:

```
  neurons          199,728,759          <- quoted with its boot; never a constant
  runningFloorMB   8,064                against a 16,375 MB card — holds it 2.0x over
  uptime           412 s
  cell             ela/kindergarten · in-progress · phases 0 of 25 started
  spikesLifetime   3,450,975 -> 18,265,275 -> 301,252,170  (three samples, climbing)
  donor            1 attached · owns all 8 clusters · 17/17 matrices · drops 0
  crystal          measured TRUE · 77 acks · C 0.9994 · A 0 · Phi_LR null at windowN 11
  looks            11 attempts · 0 grounded · 11 vramTight   <- the defect above
  voice            wordsBucketed 0 · wordMotorEverFired 0    <- she has never spoken
  ports            7525 brain · 7526 control plane · 5123 voice · 5124 eyes — all 200
```

⭐ **`runningFloorMB 8,064` is exactly the 21-bytes-per-neuron formula.**
`ceil((199,728,759 × 21 / 1048576 + 2048) / 0.75) = 8,064`; at 20 B it is
7,811. **The one-bytes-per-neuron repair is confirmed live** — and the sizing
derivation that chose the 8,000 MB budget was computed at 20 B, so it
understated the floor by 253 MB. The headroom is still ample.

---

## What is NOT known, and will not be guessed

| Field | Why it is blank |
|---|---|
| ~~Why the CPU gauge freezes~~ **ANSWERED** | The sampler sat below an early return that fires on every tick while the walk runs, so it ran only before the walk began; its first call also had no CPU baseline and read all of boot as one second. Moved to the top of the tick and seeded at start — lands on the next launch. The emotion-history ring shared the block and froze the same way. Original entry: **It is frozen, not clamped** — `cpuPercent 7 · raw 7.3 · cpuSampleMs 3486 / cpuWindowMs 2978` byte-identical across three polls spanning 251 s while spikes climbed 87×. So the earlier hard `100` was ONE stale sample published forever, and the arithmetic is exonerated. The sampler sits behind a 1-second gate in the tick loop, and a call that ran would report `cpuWindowMs ≈ 1000`. Two candidates, neither confirmed: it stops being called, or `state.perf` is served from a different object than the one that writes it |
| Whether the gate now holds | The fix is server-side and loads on the next launch. **`ownArt.lookups.grounded` CLIMBING is the proof**; `vramTight` still climbing with `grounded 0` means the fix did not load |
| Whether Φ_LR behaves | `windowN 11` of the 64 batches it needs, so `Phi_LR null` is correct-and-early. **The stated failure signature — Φ_LR pinned at 0 while C climbs — is not yet testable** |
| Whether the loop starvation matters | `[EventLoop] ⛔ STARVED — late 56.0s of the last 61s (8% serviced)`, the brain's own note being *"thousands of short ones"*. The per-second synchronous `nvidia-smi` is genuinely gone from `chat.js`, so this is either the honest cost of chunked teach math or a second blocker. `blocked 154s` on this boot: **0** |
| Whether the 30-minute readback bound is real | `grep -c readback server/server.log` = **0**, as on every boot before it |
| Phase timings past phase 0 | Zero of the 25 phases has started on this brain, so there is no sample to price them from |

---

## ⛔ Read these before believing any field above

| Fact | Consequence |
|---|---|
| ⛔⛔ **AN INSTRUMENT THAT CANNOT FAIL CANNOT WARN** | `vramUnreadable` counts only a `null`. A probe that returns a plausible wrong number is invisible to it. **Ask what reading a broken version of this instrument would produce, and if the answer is "a healthy one", the instrument is not finished** |
| ⛔⛔ **A HARNESS THAT EXERCISES THE PATH A BUG FORCES CERTIFIES THE BUG** | The gate's harness asserted the refusal branch and passed, because the probe always refused. **Assert the TRUE value, not just the branch** |
| **The neuron count is derived at boot** | From the budget and the card. It is a property of the configuration, never of her. Quote it with its boot or not at all |
| ⛔⛔ **SERVING STATE IS NOT DOING WORK** | A brain once ran 53 minutes at `frames 0 · spikes 0 · psi 0` while `/health` answered instantly. Take **two samples a minute apart** of `spikesLifetime` — `totalSpikes` is instantaneous and falls on a healthy brain |
| ⛔ **A resume with a different budget is a fresh walk wearing a resume's name** | Neuron count is geometry. `start` and `Savestart` must carry the same number |
| ⛔⛔ **A prose edit to a JS string is a code change** | An apostrophe inside `'…'` killed an entire page for a day and looked like a documentation commit. **Syntax-check every inline block after editing any page's copy** |
| **`blocked 154s (limit 150s)` is a driver wedge, not a slow batch** | 154 against a 150 s watchdog means the call never returned. The donor PROCESS survives it — no WER event, no dump, no crash.log — which separates it from the `0xc0000409` abort class |
| **An instrument that writes nothing because nothing happened is working** | The donor's WER `LocalDumps` arming was verified still in place and correctly silent. **Make that read before concluding anything from a quiet instrument** |
| **`DREAM_KEEP_STATE` unset = WIPE** | `start.*` boots fresh; only `Savestart.*` resumes |
| **A starved loop cannot service a `gpu_register` frame** | Which is the documented mechanism behind donors that attach and are never seen |
| **The site deploys on every push; the brain restarts only on a launch** | The page can be current while the brain is old. A `200` from the page says nothing about her |

---

## How to keep this file honest

1. **Overwrite it. Do not append to it.** A version before last died of
   appending — 82 stacked blocks, each written as *"current"*, none removed
   when they stopped being true.
2. **Every number is a field read**, pasted with the boot that produced it. If
   it was recalled rather than read, it does not belong here.
3. **No internal ticket identifiers and no personal attributions.** Those
   belong in the board, the ledger and the commit messages. A snapshot names
   the **mechanism**, never the ticket.
4. **When something here turns out to be false, the correction goes in the
   ledger** — not into a new paragraph on this page. This page's own prediction
   about the VRAM gate turned out ambiguous; the correction is in the ledger
   and the replacement wording is above.
5. ⛔ **EVERY TIMESTAMP IS READ FROM A CLOCK, NEVER PREDICTED.** This page, the
   board and the pickup brief were all caught on 2026-10-20 carrying stamps
   **in the future** — `~9:20 AM` on work that committed at `9:09:34`, and
   `~9:40 AM` on work that committed at `9:21:01` — because the stamp was
   written at the START of the work as a guess at when it would finish and
   never corrected. **A predicted timestamp is not a reading.** Stamp from the
   commit clock (`git log --date=format-local:'%H:%M:%S'`), which is the only
   one a later reader can verify, and when a reading and its write are minutes
   apart, **say both** — a correct number wearing a stale label is the same
   defect as a stale stage tag naming the wrong culprit.

---

*The map is not the territory: this page is the map, the code is the brain. If they ever disagree, the code is right.*
