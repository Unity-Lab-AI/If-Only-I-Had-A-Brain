---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page was read off the running brain's own log
# (`server/server.log`), off her own published state, or measured on her real
# code in an instrument, named as such. Nothing here is recalled.
status: verified
sources:
  - server/brain-server/memory.js
  - js/brain/cluster.js
  - server/brain-server.js
  - server/loop-watchdog.js
  - js/brain/curriculum.js
verified-scope: |
  OVERWRITTEN 2026-11-28 (midday, second pass). This file is a SNAPSHOT of the
  present and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-28, midday (second pass)

## Where she is

| | |
|---|---|
| 🟡 **Walking, and pinning** | Up on build `d7ce42c5`, 199,728,759 neurons, language cortex 1,328,482. Resumed from a coherent weights pair — **no `WEIGHTS PAIR INCOHERENT` line this boot**. |
| 📍 **Cell** | **ela/pre-K**, re-teaching the sections whose synapses were never written, **0 cells** passed. |
| 🖥 **Cards** | Gee's RTX 4070 Ti SUPER holds everything (8/8 clusters). One card, so every-card teaching has nothing to prove yet. |
| 🗣 **Speaking** | her speech file came back across the restart: **6,134 taught · 3,309 said before correction (53.9 %) · 548 says · rehearsed 6,134 with 3,293 repairs · 11 MB**. Her inner voice is alive (`*Mom*`, coherence 0.893). Asked her name, she returned **honest silence** (`motor_unstable`) — correct for a brain that has passed no cells. |

## The one cause behind the freeze, the dead page and the donor drops

**Found and fixed, named by her own stage split rather than by the profiler:**

```
[ChatPin] reply pass 115537ms — … respond:store-episode=73959ms · respond:curiosity=41553ms …
          (every other stage of that reply: 0–11 ms)
```

Her episode write takes a salience term that runs **two full CPU cortex propagates per letter**. The refusal that exists to stop exactly that was written as a neuron count — `size > 2000000` — back when that cluster was **306 million**, where it always refused. The language cortex was then deliberately rebuilt at **1,328,482**, and the branch, untouched, flipped from "always refuse" to "always run". **A guard written as an absolute size inverted the moment the architecture legitimately got smaller.** The same write runs right after every section pass, which is the 90–107 s post-pass freeze; while this was being written she took a **226,047 ms** pin and dropped the donor.

**The fix is priced, not sized** — the cost is per letter over the matrix that does the work: `letters × 2 ticks × (1.5 ms + non-zeros × 6e-6 ms)` against a 2,000 ms budget. Fitted on her own two measurements and exact at both. Verified through the real cluster class: a 90,000-non-zero brain prices at 65 ms, **runs**, returns a real value in 78 ms; her 398,544,600 non-zeros price at **76,521 ms** and are **refused in 1 ms**. Her training is unaffected — the term returns 0 meaning UNMEASURED, which is what the entire walk history already encoded.

⚠ **The press has not happened yet.** The running build is the one before this fix.

## Fixed earlier this session

| Found | Fix | Seen working |
|---|---|---|
| The live stall line named the wrong code for seven freezes — the breadcrumb it reads was written only on a phase change | it also fires on a teach-stage change and carries every tag with its age and sequence | yes — and it immediately showed the gap was the holder on a second phase |
| Her metadata was 158 s ahead of her synapses, then a clean shutdown saved that hole into a tidy-looking pair | restored the newest **coherent** pair so she re-teaches the section whose synapses were never written | yes — this boot carries no incoherence line |
| The old question probe stepped her cortex on the host during a reply | the probe does not run on a cortex that speaks from its own cells | yes — **no `qa-probe` stage** anywhere in her reply line |

## Honest limits of the new instrument

The breadcrumb **cannot be refreshed mid-pin** — its writer is the lag sampler, which rides the loop that is dead. So the live line names the last marked stage *before* the pin (≤1 s stale instead of minutes) and its sequence number is frozen by construction while pinned. Better by minutes; not a complete answer. Her self-profiler, set to a 2-minute cadence, has **still never sampled inside a freeze** — its window landed 84.9 % idle.

## Still to watch

- Her weights save takes about 2½ minutes per checkpoint.
- About half her looks fail on the second picture.
- First-start checks still waiting: the new-word lessons and dashboard row in a browser, her question expiring after five minutes, the gates' TALK lines.
- Every connected card doing teach ops — one card is attached, so it is unproven.
