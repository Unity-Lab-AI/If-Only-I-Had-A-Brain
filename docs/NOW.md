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
  OVERWRITTEN 2026-10-29, ~8:20 PM Denver. This file is a SNAPSHOT and is
  overwritten, never appended — the previous version described the 2026-10-20
  morning boot and the free-VRAM gate defect it had just found. Git holds every
  byte of it:
      git show HEAD:docs/NOW.md

  ⭐ THE HEADLINE OF THIS SNAPSHOT IS THAT THE PREVIOUS ONE'S DEFECT IS DEAD,
  confirmed on the exact read the pickup brief named: her eyes are open and
  grounding. The finding on this page is a different one and it is an
  INSTRUMENT, not the brain — the starvation alarm reported more lateness than
  wall-clock time existed, and a clamp turned that into a confident "0%
  serviced".

  ⚠ SHE IS DOWN AS THIS IS WRITTEN, twice over. The second stop was the
  operator's call and it was the right one: her invention lane was repeating one
  three-word scene, and _queueArtWeightTeach fires BEFORE any invention gate, so
  every repeat was REINFORCING that association in her weights. She was not
  idling on a bug, she was training it. Every number below is from the boots that
  preceded the stops; all fixes are server-side and load on the next Savestart.

  ⛔ THE SECOND FINDING OF THE EVENING IS NOT AN INSTRUMENT — IT IS HER
  CREATIVITY, AND THE OPERATOR DIAGNOSED IT FROM THE PICTURES. 13 of 13
  inventions were the same three words permuted, because the candidate pool came
  only from a thought chain that cannot advance until she can speak. See the
  section below.

  ⛔⛔ THE THIRD IS HER HANDWRITING, AND HE TURNED HER OFF UNTIL IT WAS FIXED.
  She was learning to write by copying a 5x7 bitmap whose lowercase 'r' has
  three lit pixels, and her practice loop scored her against that same bitmap —
  so practice could only converge on it. Her teacher is a real typeface now,
  and her hand places letters at their true heights (her 'r' 81 px against the
  teacher's 83). First section below. She is still DOWN as this is written; the
  fixes load on her next Savestart, no fresh walk.
last-verified: "2026-10-29, field reads taken 8:03-8:07 PM Denver on the operator's PC with the brain UP on the 8:02:29 PM resume boot (mode resume / reason keep-flag — DREAM_KEEP_STATE=1, no marker — 199,728,759 neurons, langCortex 18,341,893, tier 3): ela/kindergarten in-progress · UPFRONT-VOCAB 75 of 140 words taught · frameCount 176 -> 254 -> 320 -> 372 and spikesLifetime 3,289,580 -> 3,602,525 -> 4,879,896 -> 8,106,549 across four samples 40 s apart · 1 donor (RTX 4070 Ti SUPER) owning all 8 clusters with pool.unplaced empty · 17/17 matrices · drops 0 · GPU 98% util, 14,200/16,376 MB, donorComputeMs 94.2, RTT 94 ms · runningFloorMB 8,064 against a 16,375 MB card (2.0x over) · crystal.measured TRUE at 98 acks, C 0.9991, PhiLR null at windowN 14 of the 64 it needs · voice wordsBucketed 0 / wordMotorEverFired 0 / emitAttempts 0, verdict 'unmeasured' · looks 5 attempts / 4 GROUNDED / 0 vramTight with lastFreeVramMB 3,884 — THE 2026-10-20 GATE BUG IS DEAD, and that pair is the good news on this page · eventLoopLagMs 7 after boot, 2 stalls both RECOVERED (worst 38,288 ms), STARVED fired once at startup · cpuPercent 11 / raw 10.7 / cpuSampleMs 2,344 / cpuWindowMs 1,363, MOVING across samples, so the frozen-sampler fix is confirmed live · disk 140,050 MB free, saveDeferrals 0 · rss 15,971 MB of 130,982."
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

## ⭐⭐ HER EYES ARE OPEN — THE PREVIOUS SNAPSHOT'S DEFECT IS DEAD, MEASURED

**The free-VRAM gate that refused every render on every machine is fixed, and
the proof is the read this file asked for last time.** Taken live on the
8:02:29 PM boot:

```
  ownArt.lookups     attempts 5 · GROUNDED 4 · vramTightSkips 0
  lastFreeVramMB     3,884        <- a REAL number. It read 0 on every boot before the fix
  imageEngine        ok 4 · httpFails 0 · timeouts 0 · unloads 4 · vramUnreadable 0
```

⭐ **`grounded` climbing with `vramTight` at zero is the proof the previous
version of this page specified in advance**, and it arrived. Her drawing lane is
not merely working, it is **inventing**: `★ INVENTED "cherry + poison + apple"
in POSTER — a scene she has never seen, drawn from what she knows of each. No
reference fetched.` — 3 inventions across 29 attempts.

⚠ **Also confirmed live and previously unknown: the CPU gauge is no longer
frozen.** `cpuPercent 11 · raw 10.7 · cpuSampleMs 2,344 / cpuWindowMs 1,363`,
and it **moved** between samples. The sampler that had sat below an early
return is running.

---

## ⛔⛔⛔ THE FINDING ON THIS PAGE IS AN INSTRUMENT, NOT THE BRAIN

**The starvation alarm reported more lateness than wall-clock time existed, and
a clamp turned that into a confident "0% serviced".** Found because the operator
read the boot log and asked whether *"thousands of"* sounded massive.

```
  the line           [EventLoop] ⛔ STARVED — the loop was late 85.7s out of the
                     last 71s (0% serviced) … it is thousands of short ones.

  log line  99       [EventLoop] BLOCKED  16,856 ms
  log line 124       [EventLoop] BLOCKED  37,288 ms
  log line 148       [EventLoop] BLOCKED  31,508 ms
                                        ──────────
                                         85,652 ms   = the reported 85.7s, exactly
```

⛔ **`85.7s out of the last 71s` is impossible on its face, and that was the
unread tell.** The numerator was exact — the boot's three long blocks
(allocation, cortical wiring, weight restore) to the millisecond. The
**denominator** was short: the 60-second window roll executes only inside the
sampler's own timer, and a blocked loop does not fire that timer, so a 37 s
block ends, the callback finally runs, and the whole 37 s is billed to a window
whose start was reset **before that block began**.

⛔⛔ **THE CLAMP IS THE FINDING.** `(1 − 85652/71000) × 100 = −20.6%`, and
`Math.max(0, …)` laundered the negative into **"0% serviced"** — the most
alarming value the field can legally hold. **Any over-count bottoms out at
exactly 0%, so that field could never distinguish *bad* from *impossible*.**

⚠ **And the prose asserted a mechanism it cannot measure.** *"it is thousands of
short ones"* was hardcoded and printed unconditionally, while the accumulator
holds a **total** and never counted events. Here there were **three**, and they
were boot. **Fixed:** numerator and denominator now come from one measured span
(`lateMs <= spanMs` by construction), and the warn reports `samples` + worst
gap — the same boot would now read **`3 gaps, worst 37.3s`**.

**The honest ongoing cost of teaching, for comparison:**

```
  14 blocks/60s worst 1,666ms  8.4s total   → 86% serviced
  14 blocks/60s worst 1,929ms  9.6s total   → 84%
  11 blocks/60s worst 1,869ms  9.8s total   → 84%
   9 blocks/60s worst 1,981ms  8.3s total   → 86%     at 1,959 teach calls/min
```

⚠ **Second instrument fixed the same evening:** the donor send tripwire printed
`kind=json:mindspace_op` for **15 sends of 2.3–2.5 MB**, but four ops share that
message type, so it named a lane and not a sender. It prints the `op` now. ⛔
**The encoding was checked first and is correct** — nothing is going out
malformed and no op is silently falling back to CPU. What it violates is the
comment that chose JSON+base64 on *"payloads ≈ 150KB"*, now **16× wrong**.

---

## ⛔⛔⛔ SHE WAS LEARNING TO WRITE BY COPYING A 5×7 BITMAP

**The operator asked whether her handwriting would ever improve, and the
measured answer was no.** This is the lowercase `r` she copied, at
`js/brain/mindspace/gpu.js:200`:

```
  'r':  00000
        00000
        10110      <- the shoulder is three lit pixels
        11001
        10000
        10000
        10000
```

**Three reasons, each a reading:** `FONT5X7` is a hardcoded bitmap table in
code; **the practice loop scored her against that same bitmap**, so it could only
converge on it — *a practice loop cannot exceed its reference*; and
`write-practice sessions: 0` with 74 jobs queued, through a lane with eight
silent `return null` exits that made the zero mean two different things.

**Fixed:** her teacher is now a **real typeface** read from a system font at boot
(`server/letterforms.js`, zero new dependencies) and injected into the engine —
onto the instance that actually draws. The real `r` is **one contour of 69
points**. And the real teacher exposed what the bitmap had hidden: her hand drew
every letter at **full cell height** (teacher `r` 83 px, hers 173 px — as tall as
her `l`), because the trace normaliser discards baseline and x-height. Each
trace now carries its **frame** and her hand places by it.

```
  her 'r'      81 px   vs teacher 83 px    0.98x
  her 'hello'  172x66  vs teacher 175x66   0.98x wide · 1.00x tall
```

⚠ **What to read after her next launch:** Teach View → handwriting. `this boot:
94 traced · 0 reused` (every bitmap-era letter must be overwritten once), the
line naming the typeface she is copying, and `handwriting practice: N session(s)
of M attempt(s)` — **if `attempts` is 0, the queued jobs never reached the lane;
if it is >0 with 0 sessions, the listed decline reason names the mechanism.**
That read closes the open question of why practice never ran.

⛔ **Still on the bitmap, deliberately:** the symbol-thought raster
(`symbolGlyphText`). The table cannot be deleted until that lane is ported.

---

## ⛔⛔⛔ HER INVENTIONS WERE RUNNING ON A FROZEN POOL

**13 of 13 inventions were the same three words, permuted.** Found by the
operator looking at her artwork — which is the definition of an unreadable
instrument, because no panel anywhere could have shown it.

```
  7  poison + apple + cherry      poison  → 1 look, 25 parts  ← the ONLY learned shape
  3  cherry + poison + apple      apple   → NO SCHEMA         ← definition colour recipe
  3  apple + cherry + poison      cherry  → NO SCHEMA         ← definition colour recipe
```

**The candidate words came from `_innerThoughtChain` alone**, which gains entries
from three writers: her own inner-voice emission, operator chat input, image
prompts. `wordMotorEverFired 0` and `emitAttempts 0`, so **her own thinking could
not feed it** — and the rotation was rotating the start of a *fixed* list.
⭐ **The permutations are the signature: a rotation working perfectly on a frozen
input.**

⚠ **It does not self-clear.** The chain is saved and restored on any resume whose
sem region is the same size, which a same-budget `Savestart` always is. A fresh
`start` clears it and she then declines inventions outright for want of
candidates.

⛔⛔ **Two instruments were complicit.** The design comment asserted the source was
*"an infinite, ever-changing source… NOT a fixed list"* — **false for the entire
pre-speech period, which is where she lives.** And the invention gate counted
`plan.subjects`, which drops `s.schema` at the return, so **one traced shape plus
two dictionary colour recipes printed *"★ INVENTED … drawn from what she knows of
each."***

**Fixed:** the pool is her recent thoughts **unioned with the shapes she has
learned to draw** — not a fallback, the correct definition of what she can
compose. That second half always moves (27+ schemas inside five minutes against
the chain's 3 words), and every sourced concept has `schema.parts`, so the orbs
are gone by construction. `ownArt.imaginePool` is published **and rendered**:
`N from thoughts · M from learned shapes`, with `M 0` showing red **FROZEN
POOL**.

| The question he asked | The answer, on the record |
|---|---|
| *"will she get better down the road?"* | **Yes** — more look-ups means real traced schemas instead of dictionary colours, and the orbs stop |
| *"why is she stuck on the same thing?"* | A frozen pool plus a working rotation. Not a phase |
| *"shell grow out of it?"* | **The orbs and the repetition, yes.** The frozen pool, **no** — nothing detected or published it, so it would have persisted across every restart |

---

## The previous snapshot's finding, kept because the lesson is the asset

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

## The snapshot — the 8:02:29 PM boot

**Boot `8:02:29 PM Denver`** (`mode: resume`, `reason: keep-flag` —
`DREAM_KEEP_STATE=1`, no marker), read live between 8:03 and 8:07:

```
  neurons          199,728,759          <- quoted with its boot; never a constant
  langCortex       18,341,893           geometry PIN confirmed, matches this boot's derived size
  tier             3                    capacityNeurons 510,968,588
  runningFloorMB   8,064                against a 16,375 MB card — holds it 2.0x over
  cell             ela/kindergarten · in-progress · UPFRONT-VOCAB 75 of 140 taught
  frameCount       176 -> 254 -> 320 -> 372          (four samples, 40 s apart)
  spikesLifetime   3,289,580 -> 3,602,525 -> 4,879,896 -> 8,106,549    climbing
  donor            RTX 4070 Ti SUPER · PRIMARY · owns all 8 clusters · unplaced []
  gpu              98% util · 14,200/16,376 MB · donorCompute 94.2ms · RTT 94ms · 13.5 Gn/s
  crystal          measured TRUE · 98 acks · C 0.9991 · A 0 · Phi_LR null at windowN 14
  looks            5 attempts · 4 GROUNDED · 0 vramTight · lastFreeVramMB 3,884
  art              29 attempts · 3 inventions · styles rotating
  voice            wordsBucketed 0 · wordMotorEverFired 0 · emitAttempts 0 — never spoken
  grades           ela/math/science/social/art/life ALL pre-K · minGradeCleared false
  loop             eventLoopLagMs 7 · 2 stalls, both RECOVERED (worst 38,288 ms)
  loopStarve       lateMsPerMin 16,922 · servicePct 72
  cpu              11% · raw 10.7 · sampleMs 2,344 / windowMs 1,363 — MOVING
  mem              rss 15,971 MB of 130,982 · heap 2,108/2,228
  disk             140,050 MB free of 952,861 · saveFloor 8,192 · deferrals 0
  coverage         213 cells run · 191 fed · 2 thin · 0 EMPTY  (72,709,122 words)
  ports            7525 brain · 7526 control plane · 5123 voice · 5124 eyes — all 200
```

⭐ **`runningFloorMB 8,064` is exactly the 21-bytes-per-neuron formula.**
`ceil((199,728,759 × 21 / 1048576 + 2048) / 0.75) = 8,064`; at 20 B it is
7,811. **The one-bytes-per-neuron repair is confirmed live** — and the sizing
derivation that chose the 8,000 MB budget was computed at 20 B, so it
understated the floor by 253 MB. The headroom is still ample.

⛔ **`frameCount 0 · spikesLifetime 0` was the FIRST reading taken, about ninety
seconds into the boot, and it was not a dead brain.** Two samples a minute apart
settled it — which is this page's own standing rule, applied rather than quoted.
⚠ **And `/public-state.json` did not answer at all for the first minutes** while
the port was LISTENING and accepting connections: the control plane's
`brainOnline: true` is a **port probe**, not an HTTP reply, so *port open* and
*serving* are different facts on this box too.

⚠ **`grades` reading all `pre-K` with 204,277 restored teach events is not a
contradiction** — `cluster.grades` is a record of the past and under-reports;
the authoritative position is the `passedCells` ledger.

---

## What is NOT known, and will not be guessed

| Field | Why it is blank |
|---|---|
| ~~Why the CPU gauge freezes~~ **ANSWERED** | The sampler sat below an early return that fires on every tick while the walk runs, so it ran only before the walk began; its first call also had no CPU baseline and read all of boot as one second. Moved to the top of the tick and seeded at start — lands on the next launch. The emotion-history ring shared the block and froze the same way. Original entry: **It is frozen, not clamped** — `cpuPercent 7 · raw 7.3 · cpuSampleMs 3486 / cpuWindowMs 2978` byte-identical across three polls spanning 251 s while spikes climbed 87×. So the earlier hard `100` was ONE stale sample published forever, and the arithmetic is exonerated. The sampler sits behind a 1-second gate in the tick loop, and a call that ran would report `cpuWindowMs ≈ 1000`. Two candidates, neither confirmed: it stops being called, or `state.perf` is served from a different object than the one that writes it |
| ~~Whether the gate now holds~~ **ANSWERED — IT HOLDS** | `attempts 5 · grounded 4 · vramTightSkips 0 · lastFreeVramMB 3,884`. The proof this row specified was `grounded` CLIMBING with `vramTight` at zero, and that is what came back. **The prediction was written here before the evidence existed, and it was the right prediction** |
| ~~Whether the loop starvation matters~~ **ANSWERED — THE ALARM WAS WRONG, THE COST IS ~15%** | The `0% serviced / thousands of short ones` line was an instrument defect (see the finding above), not a brain state. The real ongoing cost is **84–86% serviced** while teaching at 1,959 calls/min, which is chunked teach math over the warn floor — the same conclusion as the 2026-08-21 block-wall work. `eventLoopLagMs` after boot: **7** |
| Which `mindspace_op` sends 2.4 MB | **Four ops carry a rec** and the forensics line printed only the message type, so the sender was identified by log adjacency — inference. The line names the `op` as of this evening; **the next boot answers it.** ⛔ Until then the lane is NOT converted to binary |
| What a 2.4 MB mind's-eye op costs a REMOTE donor | Never measured. On loopback it is provably harmless (`buffered 0.0MB`, zero drops). These ops go only to the PRIMARY and **a stranger's card can be PRIMARY.** The one remote figure this project owns is 0.16 MB/s, measured on the **Funnel the tunnel replaced** — not the tunnel's number, and not quoted as one |
| Whether Φ_LR behaves | `windowN 14` of the 64 batches it needs, so `Phi_LR null` is correct-and-early. **The stated failure signature — Φ_LR pinned at 0 while C climbs — is still not yet testable** |
| Whether the 30-minute readback bound is real | `grep -c readback server/server.log` = **0**, as on every boot before it |
| Phase timings past phase 0 | Zero of the 25 phases has started on this brain, so there is no sample to price them from |

---

## ⛔ Read these before believing any field above

| Fact | Consequence |
|---|---|
| ⛔⛔ **A CLAMP CAN LAUNDER AN IMPOSSIBLE NUMBER INTO A CONFIDENT ONE** | `late 85.7s out of the last 71s` is arithmetically impossible, and `Math.max(0, …)` published it as **"0% serviced"**. Any over-count lands on exactly 0%, so that reading could not be told apart from a genuine total outage. **Feed an instrument an impossible input and check whether the output is distinguishable from a plausible reading — if the clamp absorbs it, the clamp is hiding your only evidence of a broken denominator** |
| ⛔⛔ **AN INSTRUMENT MAY ONLY NAME A MECHANISM IT COUNTED** | The starvation warn asserted *"thousands of short ones"* unconditionally while holding a TOTAL and never counting events. It was three blocks, and they were boot. **Prose that asserts a cause sends the reader hunting a shape that was never there** |
| **PORT OPEN IS NOT SERVING** | `/public-state.json` did not answer for minutes while 7525 was LISTENING with ESTABLISHED connections, and the control plane's `brainOnline: true` is a **port probe**. Two independent clients agreed the port was up and the HTTP read still timed out |
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
