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
last-verified: "2026-09-09 (3rd) — ⭐ THE SNAPSHOT IS A GENUINE REFRESH FOR THE FIRST TIME IN THIS BATCH: the operator pressed Update & Savestart, the box came up on 5deac0f5 (deployed 20:14:37Z, booted 20:16:34Z, bootReason resume/keep-flag, bootFatal null), and every number in the snapshot above is a field read taken from THAT boot over two samples 171s apart. She is alive and teaching — frameCount 1,735 to 2,131, spikesLifetime 1.286e9 to 1.686e9, teach stamp 3,140ms old, prevocab 82 to 103 of 485 chunks at a measured ~7.4 chunks/min, cgroup 13,013/20,480 with zero throttle events. The apparatus filter is LIVE and every class fires including the two from the second pass (errata 21, tablerule 12). ⛔ AND IT WAS PUBLISHED AT THE WRONG PATH on this boot — state.ownArt.corpusCleaning instead of state.curriculum.corpusCleaning — so the dashboard row read undefined over a working filter; that is a new trap row, and it is the SECOND time that mistake has been made in this file. Donor attachment and Gn/s were REMOVED from the compute table because the public snapshot does not carry them and the previous version quoted them anyway. PRIOR: 2026-09-09 (2nd) — six trap rows for the corpus reader: the corpus on disk is not the corpus she is taught (50,409 apparatus sentences, 1.341%, plus 8,844 markup = 59,253 removed, 1.577%, and 2,200 repaired in place, all measured through the production reader), a source's own index lives INSIDE the work rather than in its boilerplate, the math cells' apparent cleaning loss is the pre-existing LaTeX lane and not the new filter, a filter fitted to one source's back matter generalises only to that source, a cheap gate in front of a rule set is where rules go silently dead, and a press that keeps the weights unlearns nothing. ⚠ NO FIELD READ WAS REFRESHED: every number in the snapshot above still belongs to the 24ddd9c2 boot, because nothing has been pressed since and inventing a fresh read would be worse than an old one that says its own date. ⛔ The apparatus filter itself is NOT in that boot — it is server-side and awaits an Update & Savestart. PRIOR: 2026-09-08 — two trap rows about the deploy's cgroup claim, and a note on why the field stubs are expected."
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

**Boot:** `5deac0f5` on `main`, **deployed 2026-09-09 20:14:37 UTC, booted 20:16:34 UTC** — operator Update & Savestart via the dashboard. `bootReason {mode:"resume", reason:"keep-flag", detail:"DREAM_KEEP_STATE=1 (no marker)"}` · `bootFatal null`.

> ## ⛔⛔⛔ AND AS OF THE LAST READ SHE IS WEDGED — read this before the tables below
>
> **Two samples 121 s apart, ~2.8 h after the boot:**
>
> ```
>   teachStageSeq       21,660 -> 21,660      FLAT      <- the discriminator
>   sinceLastTeachMs    10,093,465 = 2.80 h
>   teachCallsPerMin 0 · teachChunksPerMin 0 · emissionTicksPerMin 0
>   activePhase {name:"_teachSentenceList", elapsedMs:10,093,348} · phaseWork null
>   frameCount 46,828 -> 47,105  CLIMBING    spikesLifetime 26.456e9 -> 26.601e9  CLIMBING
> ```
>
> ⭐ **The substrate is healthy — and that is the point.** Frames and spikes climb, loop lag is normal, memory is under the soft limit with zero throttling, no watchdog tripped. **The tick loop is alive and the TEACH lane is dead.** ⛔ **A tag whose age climbs while its sequence stays frozen means the blocker is in unmarked code**, which is the rule in the trap table below, applied to itself. ⛔ **No watchdog covers a 2.8-hour teach silence.**
>
> **The numbers in the tables below are the early-boot reads and were true when taken.** They describe a brain that was teaching; she is not teaching now.

⭐ **This is the boot that carries the apparatus filter, and it is the first field read on this page taken from it.** Read live, two samples **171 s** apart, **21 minutes into the boot**:

| | | |
|---|---:|---|
| `frameCount` | **1,735 → 2,131** | climbing |
| `spikesLifetime` | **1,285,622,508 → 1,685,773,850** | climbing — the monotonic twin, not `totalSpikes` |
| `teachStageAgeMs` | **3,140** | a fresh stamp is the only positive evidence of work in the bootstrap |
| `prevocab` | **82 → 103 of 485 chunks** · 515/2,425 words | `stage: "resolve"` |

⛔ **`cellStatus in-progress` at `ela/kindergarten`, phases 2/25, `passedCellsTotal 0` of 213, `lastGateVerdict null`.** Nothing has passed a cell gate end to end on any build yet; **the first cell pass is still the milestone, 23 phases out.**

### What the reader refused, this boot

```
  seen 3,695,674 · apparatus 49,707 (1.345%) · markup 8,813 · credited 1,964
  webaddr 16,429 · credit 11,611 · licence 9,960 · citation 6,780 · bibid 2,777
  initrun 1,650 · indexref 218 · placeholder 102 · pagecite 81 · attrdebris 34
  transnote 32 · errata 21 · tablerule 12
```

⭐ **The filter is live and every class is firing, including the two found in the second pass** (`errata`, `tablerule`). ⚠ **`indexref 218` against **112** rows on disk is not a discrepancy — it is the double count**: `academicStorySentences` and `academicStoryExperiences` both split the same stories, so a cell consulted by both is counted twice. **This denominator is sentences READ, not sentences in the corpus.**

⛔ **And the value was published at the WRONG PATH on this boot** — `state.ownArt.corpusCleaning` instead of `state.curriculum.corpusCleaning` — so the dashboard row read `undefined` and rendered its own empty state over a working filter. Fixed; the page reads both across the version boundary so the row works now, and the server field moves on the next press.

### Memory, and it is healthy

```
  cgroup 13,013 / 20,480 MB (max 24,576) · band below-high
  pressureSome60 0 · pressureFull60 0 · throttleEvents 0
```

⭐ **`under the soft limit, no memory stall`** — the resume sizing term holding, on the path that used to stall at 102% of the ceiling in D state.

**PRIOR BOOT (superseded, kept for the shape of the comparison):** `24ddd9c2`, booted 2026-09-08 03:48:45 UTC, operator fresh walk via `force-fresh`.

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
| Position | `ela/kindergarten` — **phases 2 of 25**, in the pre-cell definition bootstrap |
| Cells passed | **0** of 213 · `lastGateVerdict null` |
| Lowest grade cleared | none — still `pre-K` |
| Bootstrap progress | **103 of 485 chunks** · 515 / 2,425 words · `stage: resolve` |
| Measured rate | **~7.4 chunks/min** — 82 → 103 chunks across the 171 s sample |
| Current stage | `prevocab:ela-kindergarten` — stamp **3,140 ms** old |
| Loop lag | **184 ms** |

⚠ **She is at the start of the road, not partway down it.** Cells-passed is the honest measure of progress, and it reads zero. ⭐ **A low phase count with the teach rates at zero is CORRECT here** — the pre-cell definition bootstrap runs outside the phase teach lanes for hours before phase 1, and it has been read as a wedge more than once. **The stamp AGE is the positive evidence; the tag alone is never enough, because `_tstage` is never nulled.**

⛔ **No graduation ETA is given, deliberately.** 23 of 25 phases have no measured cost on this build, one recorded `_teachAssociationPairs` call took **14.88 h**, and a forecast built on the frozen `definitionQueue` pair was once **~9× wrong**. **The only rate stood behind is the measured one above.**

### Her eyes

| | | |
|---|---:|---|
| Things she has seen | **378** | concepts with a banked percept |
| Shapes she can draw from | **0** | |
| Drawings made | **0** | `attempts 0` |
| Reference look-ups | **35** stage counters live | |
| Inner voice | `held` | **0** words banked, so nothing qualifies to be said |
| Figure queue | **289 total** · 284 held · 5 failed · 0 seen | ⭐ **it holds rows at last — see below** |
| Precomputed field store | `0 hit · 12 miss · 3 stub` of **15 attempts** | ⛔ verdict `empty-for-these-figures` |

⛔ **A still mind's-eye frame is normally right, not stuck.** That screen publishes only something real she saw or drew — never the formless mood texture — and the only frame the imagination tick can ground needs words out of her inner-thought chain to aim with. **She has banked none yet**, so nothing qualifies to replace the last real picture. It will start moving on its own when she banks her first words.

⛔ **The field store on the box is answering pointer stubs, and the automatic hydration could not fire.** The credential-free path — copy Forgejo's own LFS objects off local disk by the OID each pointer names — was gated behind `git lfs pull` having failed, and that call **succeeds by design** on a box with no git-lfs. **The one condition it was written for was the one condition that skipped it.** Fixed; it needs the second of two presses, because a press runs the box's own copy of the deploy script.

⛔ **And it is now DELIBERATELY OFF, so the stubs stay for the moment.** Making that path reachable put an unguarded ~114 GB copy on the default path of every press, and its first run coincided with a 20-minute listening-but-not-answering outage. It is opt-in (`UAL_FIELDS_HYDRATE=1`) until the deploy has its own memory budget, **because a missing field costs one live transform and an unreachable brain costs everything.** The deploy prints whether that precondition is met on its own first line. **A pointer stub in the table above is expected, not a regression.**

⛔ **And her third frame source was shut by an ordering defect.** The background figure drain publishes a picture every ~1.5 s — and the only thing that enqueues rows ran *after* the cell's multi-hour prose phase, which has never completed on this walk. Measured: `figureQueue.total 0` on a resumed boot, where zero is not a reset but *never*. The enqueue now runs at the top of the cell.

⭐ **That fix is CONFIRMED on this boot: `figureQueue.total 289`, where it read `0` before.** ⚠ **But `seen 0` with `held 284`** — the rows exist and are not being drained into percepts, which is the field-store verdict above and not the queue. **A queue that fills and never empties is the next thing to read, not a success.**

### Vitals

| | | |
|---|---:|---|
| Ψ (log scale) | **19.98** | absolute size means nothing; deviation from its own recent average is what the brain responds to |
| Φ̂ (`phiProxy`) | **0.2569** | genuinely measuring and moving — it was pinned at a floor for months while looking healthy |
| Coherence | **0.90** | the real synchrony measure, not the placeholder that preceded it |
| Event-loop lag | **184 ms** | ⚠ chunked CPU teach math over the 250 ms warn floor is expected work, not waste |
| Consolidation watchdog | **0 trips** | per-word trickle watchdog also **0** |
| Connected users | **4** | |

### Compute

| | | |
|---|---:|---|
| Donor release on offer | **`donor-v0.3.37`** | the download the page hands out; ⛔ **not a statement that one is attached** |
| Definition queue (dream trickle) | **depth 11** · `lastWindow null` | ⛔ **idle BY DESIGN mid-walk — see the trap table** |
| Definition anchor (live lane) | **11 calls / 3 ms** | the offline dictionary answering from disk |
| Memory | **13,013 / 20,480 MB** | `below-high` · pressure 0/0 · **throttle 0** |

⚠ **Donor attachment and Gn/s are NOT in this table any more, because the public snapshot does not carry them** and the previous version of this page quoted `1 donor · 9.59 Gn/s · 262 ms` as though it did. **A number copied from an earlier boot into a table headed by a newer one is the exact failure this page was reset to stop.** Read them on the dashboard's donor rows, or from `state.utilization` on the admin lane.

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
| ⛔⛔ **THE CORPUS ON DISK IS NOT THE CORPUS SHE IS TAUGHT, AND FOR MONTHS NOTHING PUBLISHED THE DIFFERENCE** | The reader cleans at read time, so a sentence or word count taken off the corpus files overstates her intake. Measured: **50,409 sentences (1.341%) are apparatus** — a book's index rows and bold page references, web addresses, licence and page furniture, bibliographies, citation stamps, transcription notes, a page-anchored errata list and a publisher's catalogue table — plus **8,844 (0.235%) markup**, for **59,253 removed (1.577%)** and **2,200 repaired in place and kept**. ⭐ **The counters carried the warning *"a filter nobody can see the output of is indistinguishable from one that is silently eating content"* and a whole-tree grep found ONE reference to them: a re-export.** Read `state.curriculum.corpusCleaning`, and quote as-taught figures, never on-disk ones. |
| ⛔ **A SOURCE'S OWN INDEX IS INSIDE THE WORK, NOT IN ITS BOILERPLATE** | The fetcher cuts the licence header and footer; the index, the errata list and the transcriber's note sit **between** those markers and are body text by every test that runs. She was caught training the index of her own kindergarten reader — `=412=` is a page number, and the note explaining that markup (*"bold text is represented by ="*) was being taught with it. **Front and back matter are a per-sentence judgement at the reader, not a slice at the fetcher.** |
| ⛔⛔ **A FILTER FITTED TO ONE SOURCE'S BACK MATTER GENERALISES TO THAT SOURCE** | The first apparatus pass was built from one book, shipped, and then a residual scan found a second book's errata list sharing **not one token** with it, plus Wikipedia reference sections and a publisher's catalogue table — **two of them in a cell she had already walked.** ⭐ **What finds them is a METHOD, not more patterns: back matter is TRAILING, so read the tail of each experience AFTER filtering and look at what is still there.** Three classes came from one sweep; guessing had produced none. |
| ⛔ **A CHEAP GATE IN FRONT OF A RULE SET IS WHERE RULES GO SILENTLY DEAD** | Three new apparatus rules contained no character the existing gate admitted, so all three would have been **live in the source and dead in effect** — a fallback whose trigger cannot fire. **Re-verify every class witness through the gate whenever a rule is added**, and state the pass rate: 93% cheap-exit with all 14 witnesses reaching their rule. |
| ⛔⛔ **THE ENCLOSING FUNCTION DECIDES A FIELD'S PATH — NOT ITS INDENTATION AND NOT ITS NEIGHBOURS** | `corpusCleaning` was published at `state.ownArt.corpusCleaning` for a whole boot while its only consumer read `state.curriculum.corpusCleaning`, so a working filter rendered as *"no cell loaded yet"*. The value was correct the entire time. **This is the second time this exact mistake has been made in this exact file** — `ADMIN-CONTROLS.md` records `state.readback` against `state.profiling.readback`, with the same cause: the surrounding comments named a different object and I inferred the parent instead of checking. ⭐ **Read the LIVE payload after a press; do not trust the write.** |
| ⚠ **A PRESS THAT KEEPS THE WEIGHTS DOES NOT UNLEARN ANYTHING** | Update & Savestart lands new code and keeps everything already banked, so a content fix stops future damage and never reverses past damage. **Only a fresh walk clears trained-in poison, and that is a re-price, not a reflex.** ⭐ The question to ask is WHERE the mass sits: most apparatus lives in college/grad cells the walk has never reached, so a filter shipped now lands ahead of the bulk of it. |
| ⚠ **THE MATH CELLS LOOK WORST-HIT BY CORPUS CLEANING AND ARE NOT HIT BY THE NEW FILTER AT ALL** | `math/grade8` loses 8.3% of its sentences: **730 are the long-standing LaTeX drop**, 69 are apparatus. The two are counted separately for exactly this reason. **A rule aimed at furniture nearly ate geometry once already** — `height\s*=` matched *"each with base = 5 centimeters, height = 3 centimeters"*, and the math cells are what caught it. |

---

## How to keep this file honest

1. **Overwrite it. Do not append to it.** The previous version died of appending — 82 stacked blocks, each one written as *"current"*, none of them removed when they stopped being true.
2. **Every number is a field read**, pasted with the boot that produced it. If it was recalled rather than read, it does not belong here.
3. **No internal ticket identifiers and no personal attributions.** Those belong in the board, the ledger and the commit messages. A snapshot names the **mechanism**, never the ticket.
4. **When something here turns out to be false, the correction goes in the ledger** — not into a new paragraph on this page.

---

*The map is not the territory: this page is the map, the code is the brain. If they ever disagree, the code is right.*
