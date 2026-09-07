---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-server/state.js
  - js/brain/curriculum.js
  - js/brain/mystery.js
verified-scope: |
  RESET 2026-09-07 on the operator's instruction: "now can be reset to templet..
  its not a history archive and nothing in there is needed".

  The previous version of this file had become an 82-block, 1,217-line,
  582,912-byte changelog - 183 lines over 1,200 characters, the worst single
  line 22,027 characters, and 336 internal ticket identifiers against a
  placement rule that bans them from this document by name. It was a second
  copy of history that already lives in the ledger and the resume brief, and
  duplicated history is worse than none: two records that can disagree.

  The old content is not destroyed. Git holds every byte of it permanently on
  both remotes; recover it with
      git show e1d05673:docs/NOW.md

  This file is now what its title always claimed: a SNAPSHOT.
last-verified: "e1d05673 2026-09-07"
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

**Boot:** `60479ed5` on `main`, deployed 2026-09-07 00:34 UTC, **booted 00:38 UTC**.

### Scale

| | |
|---|---:|
| Neurons | **388,597,268** |
| Language cortex | **15,082,717** |
| Letterforms banked | **94 / 94** |

⛔ **Neither of the first two is a constant.** The total is derived at boot from free host RAM, so it is a property of the machine she woke up on. The same code has started at 425,436,550, at 411,216,550 and at the figure above. **A neuron count means nothing without the boot beside it.**

### The walk

| | |
|---|---|
| Position | `ela/kindergarten` — **phases 2 of 25** |
| Cells passed | **0** |
| Lowest grade cleared | none — still `pre-K` |
| Teach rate | **4,645** pairs/min |
| Current stage | `gate:probe-gpu` |

⚠ **She is at the start of the road, not partway down it.** Cells-passed is the honest measure of progress, and it reads zero.

### Vitals

| | | |
|---|---:|---|
| Ψ (log scale) | **20.97** | absolute size means nothing; deviation from its own recent average is what the brain responds to |
| Φ̂ | `live` | genuinely measuring and moving — it was pinned at a floor for months while looking healthy |
| Coherence | **0.90** | the real synchrony measure, not the placeholder that preceded it |
| Event-loop lag | **1 ms** | |

### Compute

| | | |
|---|---:|---|
| Donors attached | **1** | |
| Aggregate rate | **9.59** Gn/s | |
| Batch round-trip | **262 ms** | ⚠ the GPU is **not** the bottleneck — see below |
| Definition queue | **13** | |
| Watchdog trips | **0** and **0** | consolidation and per-word; both quiet |

---

## ⛔ Read these before believing any field above

These are the traps this project has actually fallen into. Each one cost real time.

| Fact | Consequence |
|---|---|
| **The neuron count is derived at boot from free host RAM** | It is a property of the machine, never of her. Quote it with its boot or not at all. |
| **The frontend deploys on every push; the brain process restarts only on a press** | **The page can be current while the server is old.** A running server was once found many commits behind what the site was serving. |
| **A press runs the box's own copy of the deploy script, not the one on the main branch** | When the box and the branch disagree, updating is a **two-press sequence** — the new script only takes effect on the press *after* the one that delivers it. |
| **A stage tag whose age climbs while its sequence stays frozen means the blocker is in unmarked code** | The tag alone is ambiguous. **The sequence number is the discriminator.** |
| **A teach rate of zero is not necessarily a fault** | Before prose training, a cell anchors every unlearned word it uses — a serial pass that can legitimately run tens of minutes with the teach counter at zero. **Read the stage tag first.** |
| **The GPU is not the throughput ceiling** | Utilisation sits low with essentially no queue wait, so a faster card buys idle silicon. The cost is elsewhere in the round trip. |

---

## How to keep this file honest

1. **Overwrite it. Do not append to it.** The previous version died of appending — 82 stacked blocks, each one written as *"current"*, none of them removed when they stopped being true.
2. **Every number is a field read**, pasted with the boot that produced it. If it was recalled rather than read, it does not belong here.
3. **No internal ticket identifiers and no personal attributions.** Those belong in the board, the ledger and the commit messages. A snapshot names the **mechanism**, never the ticket.
4. **When something here turns out to be false, the correction goes in the ledger** — not into a new paragraph on this page.

---

*The map is not the territory: this page is the map, the code is the brain. If they ever disagree, the code is right.*
