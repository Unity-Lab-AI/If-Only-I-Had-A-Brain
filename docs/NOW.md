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
last-verified: "2026-09-08 — two trap rows added about the deploy's cgroup claim, and a note on why the field stubs are expected. ⚠ NO FIELD READ WAS REFRESHED: the numbers above still belong to the 60479ed5 boot, because nothing was pressed and inventing a fresh read would be worse than an old one that says its own date."
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

**Boot:** `24ddd9c2` on `main`, **booted 2026-09-08 03:48:45 UTC** — operator fresh walk, `force-fresh` via the dashboard.

⭐ **The sizing now carries a RESUME term, and this boot is the proof it works.** The budget is divided by `1 + 0.3644` on **every** boot — fresh or resuming — because the saved weight file is proportional to the weights and every brain is resumed eventually. **Predicted ~234,000,000 neurons before the press; measured 233,932,309.** She was teaching **90 seconds after boot**, where the previous resume boot stalled at 102% of its memory ceiling.

### Scale

| | |
|---|---:|
| Neurons | **233,932,309** |
| Language cortex | **13,924,722** |
| Letterforms banked | **94 / 94** |

⛔ **Neither of the first two is a constant.** The total is derived at boot from free host RAM **and now from the resume ratio**, so it is a property of the machine and the ceiling she woke up under. The same code has started at 425,436,550, at 411,216,550, at 388,597,268, at 337,841,199 and at the figure above. **A neuron count means nothing without the boot beside it.**

⚠ **It went DOWN on purpose.** 337.8M → 233.9M is the resume term being applied: the earlier number could not be resumed without the kernel throttling her into a `D`-state stall. **A brain that fits only until it is restarted is not the right size.**

### The walk

| | |
|---|---|
| Position | `ela/kindergarten` — **phases 0 of 25**, in the pre-phase definition bootstrap |
| Cells passed | **0** |
| Lowest grade cleared | none — still `pre-K` |
| Teach rate | **~16,000–28,000** pairs/min, oscillating by phase |
| Current stage | cycling `hebbian:substrate` · `gate:probe-gpu` · `cell:phase-gap:_teachWordDefinition` · `_teachAntiHebbian-done` |
| Loop lag | **0 ms** |

⚠ **She is at the start of the road, not partway down it.** Cells-passed is the honest measure of progress, and it reads zero. ⭐ **`phases 0/25` with `cellPhasesStarted 0` is CORRECT here** — the pre-phase definition bootstrap runs for hours before phase 1, and it has been mistaken for a wedge before.

⚠ **She is at the start of the road, not partway down it.** Cells-passed is the honest measure of progress, and it reads zero.

### Her eyes

| | | |
|---|---:|---|
| Things she has seen | **95** | concepts with a banked percept |
| Shapes she can draw from | **0** | |
| Drawings made | **0** | |
| Mind's-eye frame age | **6 h** | ⚠ **held, and correctly so — see below** |
| Inner voice | `held` | **24,269** skips, because **0** words are banked |
| Precomputed field store | `1 hit · 6 miss · 1 stub` | ⛔ the stub is an **LFS pointer**, not a field |

⛔ **A still mind's-eye frame is normally right, not stuck.** That screen publishes only something real she saw or drew — never the formless mood texture — and the only frame the imagination tick can ground needs words out of her inner-thought chain to aim with. **She has banked none yet**, so nothing qualifies to replace the last real picture. It will start moving on its own when she banks her first words.

⛔ **The field store on the box is answering pointer stubs, and the automatic hydration could not fire.** The credential-free path — copy Forgejo's own LFS objects off local disk by the OID each pointer names — was gated behind `git lfs pull` having failed, and that call **succeeds by design** on a box with no git-lfs. **The one condition it was written for was the one condition that skipped it.** Fixed; it needs the second of two presses, because a press runs the box's own copy of the deploy script.

⛔ **And it is now DELIBERATELY OFF, so the stubs stay for the moment.** Making that path reachable put an unguarded ~114 GB copy on the default path of every press, and its first run coincided with a 20-minute listening-but-not-answering outage. It is opt-in (`UAL_FIELDS_HYDRATE=1`) until the deploy has its own memory budget, **because a missing field costs one live transform and an unreachable brain costs everything.** The deploy prints whether that precondition is met on its own first line. **A pointer stub in the table above is expected, not a regression.**

⛔ **And her third frame source was shut by an ordering defect.** The background figure drain publishes a picture every ~1.5 s — and the only thing that enqueues rows ran *after* the cell's multi-hour prose phase, which has never completed on this walk. Measured: `figureQueue.total 0` on a resumed boot, where zero is not a reset but *never*. The enqueue now runs at the top of the cell.

### Vitals

| | | |
|---|---:|---|
| Ψ (log scale) | **21.07** | absolute size means nothing; deviation from its own recent average is what the brain responds to |
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
| **The deploy announcing that it has its own memory budget is not evidence that it does** | That line was assembled from a config flag and was **wrong on every press for three days** while the deploy ran inside her cgroup. ⭐ **The only field to believe is the deploy's own first log line** — `cgroup: CONTAINED` or `cgroup: ⚠ UNCONTAINED`, which it reads from the kernel. A claim made by the thing that *launched* the work is a prediction; a claim made by the work itself is a measurement. |
| **A fallback that works can hide a primary that never runs** | Both fallback handlers behaved correctly, so the deploy always completed — which is exactly why nobody saw that the isolation it was supposed to get had never once been applied. **A silent successful fallback turns a broken feature into an invisible one.** |
| **A mind's-eye frame that stops moving is usually correct** | The viewer refuses to publish anything but a real percept, so a still frame means *nothing new qualified* — not that the eye is broken. **Read the inner-voice hold before investigating the viewer.** |
| **An error string names where it was CAUGHT, not what failed** | A figure that was perceived, stored, published and taught reported itself as a storage failure for six hours, because the throw came from the success log at the tail of the same `try`. |
| **A fallback whose trigger is a FAILURE cannot fire when the thing that would fail is never attempted** | The field hydration that needs no credential sat behind `if ! git-lfs-pull`, on a box that has no git-lfs and therefore never runs one. **Check what reaches a fallback, not just what it does.** |
| **A work queue that fills at the END of a long phase is empty for the whole phase** | The background figure lane exists so nothing pins the cell pass — and the enqueue that feeds it was placed behind the longest await in that same pass. **`total 0` on a RESUMED boot means *never*, not *reset*.** |
| ⛔⛔ **SERVING STATE IS NOT DOING WORK** | She once ran **53 minutes at `frames 0 · spikes 0 · psi 0 · cellStatus idle`** while `/health` answered 200 in 0.95 ms and every memory and pressure reading was green. **No infrastructure check asks whether she is teaching.** Take **two samples a minute apart** of `frameCount`, `spikesLifetime` and `cellStatus`. |
| ⛔ **`totalSpikes` IS INSTANTANEOUS AND FALLS ON A HEALTHY BRAIN — do not use it for a two-sample test** | Both writers reset it to `0` each tick and re-sum the current per-cluster counts, so it measures **what is firing right now**, not a lifetime. Measured falling twice in one session on a brain that was teaching the whole time (`−24,710`, then `−10,935`), and it produced a false alarm. ⭐ **A reading of exactly `0` is still meaningful** — nothing is firing, which is what the 53-minute incident showed. It is the *delta* that means nothing. **`spikesLifetime` is the monotonic twin; use that.** |
| ⛔ **A LEAF PHASE HAS NO STRUCTURAL DENOMINATOR, AND `phaseWork` NOW SAYS SO INSTEAD OF GOING QUIET** | The total comes from counting the nested `_teach*` units a phase's source calls — **0 for every phase that works in a loop** (`_teachAssociationPairs`, `_teachWordDefinition`, `_teachConcreteSentences`, `_teachQABinding`, `_teachVocabList`), against 5 for an orchestrator. Those leaves are where the hours go. ⭐ **The two with rep loops now publish their own cursor** (`done/total` in reps, plus `pairTeaches*`, since one rep is `pairs.length` wide). ⚠ **For the rest the field returns `denominator: 'unavailable'` with `frac: null` — never `0`, because a zero fraction is a claim about progress.** **Read `inflight` + `inflightMs`: a 4-hour age on a named unit is the difference between stuck and expensive, and no fraction expresses that.** |
| ⛔ **`definitionQueue` DESCRIBES THE DREAM TRICKLE, WHICH IS IDLE BY DESIGN MID-WALK** | `depth` and `lastWindow` come from the dream-cycle trickle lane, so during a walk they stand still — measured frozen **13.6 h** while `_teachWordDefinition` ran **2,365 → 17,002 calls**. A forecast built on that pair was wrong by ~9× on the per-definition cost (20.6 s published, 2.30 s live). **Read `definitionAnchor` for the live lane, and `definitionQueue.lastWindowAgeMs` to see whether the trickle numbers are a fossil.** |
| ⛔⛔ **EVERY TEACH RATE READS `0` DURING THE PRE-CELL DEFINITION BOOTSTRAP, AND THE DASHBOARD USED TO PAINT THAT RED** | `_trainAcademicStories` opens with a definition pass that runs **outside the phase teach lanes**, so `teachCallsPerMin`, `teachChunksPerMin`, `emissionTicksPerMin` and `sinceLastTeachMs` are all legitimately dead. Read live 21 min into a healthy resume: **all five terms false, `sinceLastTeachMs 1,166,902`**, while `prevocab:ela-kindergarten` went **46/662 → 145/662 chunks in 19 min**. ⚠ **It FLICKERS rather than staying dead** — `teachChunksPerMin` hovers at 0–2/min and dips to 0 regularly, measured **RED on 2 of 6 samples** 12 s apart, so a single green reading is not evidence the panel is trustworthy. ⭐ **The lane that IS moving is the stage stamp: read `liveness.teachStage` with `teachStageAgeMs`.** A recent stamp is the only positive evidence of work here. ⚠ **And the AGE is the signal, not the tag** — `_tstage` is never nulled, so a wedged walk keeps its last tag forever while the age climbs. |
| ⛔⛔ **`hit: 0` ON THE FIELD STORE IS A VERDICT, AND EVERY COUNTER AROUND IT WAS TRUTHFUL** | Read live 2026-09-08: `enabled true · hit 0 · miss 16 · stub 4`. The store was present, pointed at the right root, counting honestly — **and delivering nothing**, while she re-transformed every figure live. **The conclusion existed nowhere.** ⛔ **And the stub warning over-claims:** it asserts *"The sync ran without `git lfs pull`"* from `stats.stub === 1`, a global cause from one instance — **16 of those 20 reads found no file at all**, so the dominant cause is *no field was ever made for these figures*. **Read `fields.delivering` for the verdict, and `fields.attempts` before believing either.** |
| ⛔ **A HYPHEN OR APOSTROPHE IS PART OF THE WORD, AND STRIPPING IT MANUFACTURES A WORD THAT CANNOT EXIST** | `Henny-Penny` → `hennypenny`, `children's` → `childrens`, `added.p` → `addedp`. No dictionary can answer for one, the taught-set only records on `defsBound > 0`, so it is never marked learned and is looked up again **every visit, forever**. **2,011 damaged distinct forms measured in one cell's corpus.** ⚠ **When fixing a tokenizer, the taught-set is keyed on the OLD form** — check both keys or every taught word reads as untaught and the pass grows instead of shrinking. |
| **A sizing term read from a GROWING file changes the neuron count every boot** | And `autoClearStaleState` wipes when the saved count differs from the computed one — so it would wipe on **every** savestart while reporting that it was keeping the weights. **The resume term is a RATIO for exactly this reason.** |

---

## How to keep this file honest

1. **Overwrite it. Do not append to it.** The previous version died of appending — 82 stacked blocks, each one written as *"current"*, none of them removed when they stopped being true.
2. **Every number is a field read**, pasted with the boot that produced it. If it was recalled rather than read, it does not belong here.
3. **No internal ticket identifiers and no personal attributions.** Those belong in the board, the ledger and the commit messages. A snapshot names the **mechanism**, never the ticket.
4. **When something here turns out to be false, the correction goes in the ledger** — not into a new paragraph on this page.

---

*The map is not the territory: this page is the map, the code is the brain. If they ever disagree, the code is right.*
