# BOARD — triaged task list (2026-08-20)

> Gee (verbatim): *"okay we have alot in the todo still open i want you to build the full task list in the cli so i can follow along with any and all items still open in the todo...(mind you , you need to be smart about it, as some of these are related to what ive told you and some u just added yourself, so we need to make sure that what needs to be done get s done and what doesnt need to be done doesnt get done"*

**86 open items on `docs/TODO.md` triaged by two axes: WHO it came from (Gee's directive vs my own addition) and whether it is STILL LIVE.** Nothing is deleted by this file — `docs/TODO.md` stays the record. This is the reading order.

**Headline: only ~29 of the 86 are real remaining work. ~40 are stale press-riders already answered by later presses, and ~11 are retrospective lessons I wrote that are not tasks at all.**

> **UPDATE 2026-08-20 — 7 of those closed in one batch (✅ rows below), so ~22 real items remain.** The whole **"the board cannot answer *is it working?*"** family shipped together: GATFILE.1/.2/.3, DASHDEAD.4, MIRRORID.5, DONORKILL.2, SYNCPARTIAL.7, PARTMIRROR.4, CANSPEAK.4/.8. **None of them needed a press** — that is why they were picked. One new item was filed from the reading (**MIRRORID.6**, Tier 2 #27) and **RESYNCDUTY.9 was deliberately left open**: it touches the same phase counter CELLBOUND.A–E already changed, so landing it before the CELLBOUND.F verdict would confound the exact read that press exists to produce. Ledger: `docs/FINALIZED.md` §2026-08-20 THE BOARD STOPS LYING.

> **UPDATE 2026-08-20 (second batch) — THE BOARD IS DOWN TO 26 OPEN, AND 66 CLOSED.** Gee: *"keep working we are completeing it all"*. **Nine real items BUILT** (none needing a press to land — they are code, verified `node --check` + ESM `import()` + bundle rebuilt): **FIRSTPIN.1** (respond sub-stages), **FIRSTPIN.2** (the last inline concurrent teacher, evicted onto the drain lane with its definition channel intact), **SURPRISECPU.2** (`img-detect` was an inline mind's-eye preview → queued; `generate` split into primary + continuation stamps), **CELLBOUND.H** (deferral cursor persisted beside `passedPhases`), **LOOPMAX.8** (banked maximum for chatStage + saveStage, the race teachStage v1 lost), **LANGRAM.6** (`server/lang-geometry.json` — the geometry PIN wins over a boot-time RAM dip), **LOOPNAME.13** (bundle freshness checked at boot against the code-hash file list, reported in state), **SYNCEMPTY.3** (the registry GATE — the race removed without guessing a third cause), **MIRRORID.6** (leaderboard credits work, not connection time — Gee chose *"Credit real work only"*, which also answers WORKSHARE.6). **And 47 stale items CLOSED with verdicts on Gee's approval** — 38 Tier-4 press-riders + 9 Tier-5 lessons, statuses flipped in place (`[x]` + the leading `OPEN`/`⏳`/`GEE:` status token replaced by a closure verdict, every word of every description kept). ⛔ **`DELTAIDX.9` was NOT closed** — it was sitting in the close pile because this file's own warning sentence about it got parsed as tier membership by the roster reader. Still DISABLED, cause never found. Ledger: `docs/FINALIZED.md` §2026-08-20 FINISH THE BOARD.

> **UPDATE 2026-08-20 (third batch — VERIFY BEFORE BUILDING) — 20 open.** Gee: *"still open items to do, make sure they are really needed before you do them"*. Every remaining item was checked against evidence BEFORE any code was written, and the checks changed the answers: **`RUNPOD.7` CLOSED on live snapshot data** (`maxBindMB 24210`, `sizeDriverMB 24210`, `computeInsufficient false`, `32.45 Gn/s` — its own escape clause fired when CUDA came back); **`RUNPOD.6` was TWO gates, not one** (main.rs enumeration AND `MultiEngine::new` requiring a wgpu adapter to even find the CUDA ordinal — both fixed, all three feature combos compile); **`LG.6`'s "hard prerequisite" was a client-side default, not a protocol limit** (tungstenite's 64MiB `max_message_size` vs the server's 2GB `maxPayload` — one config call, so the segmented-rowPtr redesign is now optional); **`CELLBOUND.G` is 73 sites, not ~58** (the per-grade files were never grepped); **`DF7SYNC.7`'s own stated prerequisite shipped** (sync-window duration + window + payload, because 8 minutes for 3GB and for 40MB are different diagnoses); **`SCRIPTKILL.2` shipped and my first cut was WRONG** — cap in lines, trigger in bytes, so small entries walked past it; the test caught it. **Closed as RULES rather than built**: `TASKLIST.2`, `TASKLIST.3`, `SCRIPTKILL.3` → persistent memory, because a standing instruction on a task board is a line that can never be finished. **`SCRIPTKILL.1` shipped as a REPORT, not a blocker** (session-start names untracked / patcher-shaped files in `scripts/`; a PreToolUse guard that silently eats a legitimate write is the failure class this ledger is about). New: **`RUNPOD.15`** — one donor tag ships RUNPOD.6 + the LG.6 prereq, filed separately so DONE is never confused with LIVE. Ledger: `docs/FINALIZED.md` §2026-08-20 VERIFY BEFORE BUILDING.

---

## TIER 0 — BLOCKING. Everything else waits on this.

| # | id | what |
|---|----|------|
| 1 | **CELLBOUND.F** | ⏳ **ONE Update & Savestart.** Server+bundle only, weights preserved, art/K resumes from checkpoint. Verdict in one look: `phaseChain` names the full live chain · `cellPhasesCompleted` moves off 14/16 · `_gateArtKReal` finally runs · `phaseWork` no longer reads `done > total`. **A budget-stop line is EXPECTED, not a failure.** |

---

## TIER 1 — REAL WORK, FROM YOUR DIRECTIVES

| # | id | what | why it's yours |
|---|----|------|----------------|
| 2 | ✅ **GATFILE.1/.2/.3** | Port the GATGUARD fixes into `scripts/Gattling Gun Savestart Forced.txt` — fetch guard never auto-restores (ate your Update button once), 2xx counted as a win, and the build guard pinned to `3efc220` makes the spotter declare victory on its FIRST poll and kill the barrels. **SHIPPED 2026-08-20 (v5):** baseline read off the live box at arm time (`build.short` OR `build.bootedAt` change = the win), fetch guard auto-restores in 5s, win only on `armed`, both copies byte-identical. **Nothing needs hand-editing before firing any more.** | *"mark that thing u spotted in the todo"* |
| 3 | ✅ **SURPRISECPU.2** | The second offender from the same split: `generate=17,941ms` and `img-detect=4,925ms`. Both now visible per-stage. | *"did u catch that doner crash?"* |
| 4 | ✅ **FIRSTPIN.1** | Instrument the respond stage sub-stages; no fix until the split names the resident. | drop-on-speak war |
| 5 | ✅ **FIRSTPIN.2** | The curiosity-followup landmine — `chat.js` awaits `_teachAssociationPairs` INLINE, the exact concurrent-teach crime CHATQUEUE was built to kill, alive in a branch that didn't fire in rounds 4–5. **Real latent bug.** | drop-on-speak war |
| 6 | **FIRSTPIN.3** | WATCH (read-only): Oja active-set inflates to ~2.4–2.6M rows during chat windows. | drop-on-speak war |
| 7 | **LG.6 / LG.7** | Language-cortex hops → ~20M, then 12–20% (the April target). ⛔ LG.6 has a hard prerequisite: at ~20M the intra rowPtr alone (~80MB) exceeds the donor's 64MiB message cap — needs a segmented-rowPtr donor release first. | your scale target |
| 8 | **GRANT.2 / GRANT.3** | (a) Emergent Ventures application, (b) NSF Project Pitch — both free, zero-barrier, fire whenever you want. (c) The documented developmental trajectory as the real asset. | *"search online for grant available for this type of project"* |

---

## TIER 2 — REAL WORK I ADDED. Kept because it is proven, not speculative.

**⚠ THREE of these bit us TODAY.** That is the argument for them, not my opinion.

| # | id | what | evidence it's real |
|---|----|------|--------------------|
| 9 | ✅ **DASHDEAD.4** | An auth failure renders as a BRAIN failure. "Brain server unreachable" on a brain teaching 4,257/min. The dashboard can read `/public-state.json` with NO auth — it should probe that before blaming the backend and say *"admin lane not authenticated — brain is UP"*. **SHIPPED 2026-08-20:** every WS close now probes the public snapshot and, when live state answers, rewrites the banner to **"Admin lane not authenticated — the brain is UP"** with live teach/min · cell · build · uptime · donors, and says *do not restart a healthy service*. The probe judges the BODY, not the status code (a 200-with-HTML is a lie on this origin). Probe-failed → old copy stands + the reason is appended. | **cost us a full diagnostic round today** |
| 10 | ✅ **MIRRORID.5** | Donor Gn/s is a persistent field — it shows a rate earned minutes ago while computing nothing. Must decay or read `idle`. **SHIPPED 2026-08-20:** freshness comes off `stepsComputed` (verified monotonic in BOTH donor backends, incremented only on batch completion) → new `computeSteps` / `computeAdvancedAgoSec` / `computeIdle` per row; the table renders `idle 47s (last 9.3Gn/s)` in red instead of a live-looking green number. | **I read `0.00 Gn/s` on a healthy new donor today and had to caveat it** |
| 11 | ✅ **DONORKILL.2** | Nothing outside the brain shows WHICH GPU is primary. RunPod pod list, Clients table and leaderboard all show a card without showing it's load-bearing. **SHIPPED 2026-08-20:** every donor row carries `pauseIfKilled` stating the consequence in words (primary → the walk pauses with no compute substrate until another donor is promoted and re-uploaded; replica → it just drops its share), rendered as a ★ + row tooltip. | **I terminated her primary today** |
| 12 | ✅ **LOOPNAME.13** | Nothing enforces bundle freshness. A `js/brain/*` edit without a local rebuild ships a browser bundle that silently disagrees with the server. A pre-push mtime/hash check fixes it. | **I had to remember it manually this session** |
| 13 | **CELLBOUND.G** | The same unbounded rep-loop shape lives in **~58 other teach methods**. Sweep once CELLBOUND.F proves the shape on the convicted one. | measured |
| 14 | ✅ **CELLBOUND.H** | The deferral cursor is IN-MEMORY only — across a reboot deferred work repeats rather than resumes. Persist it beside `passedPhases`. | stated at build time |
| 15 | ✅ **SYNCEMPTY.3** | The REAL sync fix is not shipped. Registration-sync fires on a fixed 1.5s timer and races the server's own registry. Should GATE on a populated registry. ⛔ **Two theories already wrong here — do not guess a third; the next boot line decides.** | open root cause |
| 16 | ✅ **LOOPMAX.8** | `saveStage` and `chatStage` have the SAME timer race `teachStage` v1 had and were never audited. Apply the banked-maximum pattern. | proven pattern |
| 17 | **RESYNCDUTY.9** | `_gateSciKReal` isn't wrapped in `_phasedTeach`, so a 20.7-minute gate reads `activePhase: null` — indistinguishable from a hang. ⛔ **HELD 2026-08-20, sequenced AFTER CELLBOUND.F:** it edits the same phase counter CELLBOUND.A–E already changed and F has not reported yet. Two unverified changes to `cellPhasesCompleted` / `phaseWork` on one press would confound the exact read F exists to produce. | cost a forensic dig |
| 18 | **LOOPNAME.7** | Every diagnostic lane (admin WS, public-state, console ring) rides the event loop under investigation. We go blind exactly when we need eyes. | structural |
| 19 | ✅ **SYNCPARTIAL.7** | Donor UI should show coverage ("holds 1/17 matrices") not just counters — "21 batches · 0 teach ops" is true but reads as a fault. **SHIPPED 2026-08-20:** `df7TotalMatrices` gives the fraction (`1/17 mx`) and `clusterCoverage` / `clusterCoverageCount` / `clusterTotal` give the compute fraction (`2/8 cl`), both rendered with tooltips explaining WHY a partly-synced or small card is honest work. A fraction cannot tell the "1 matrices pushed = a FULL brain replica" lie. | your own question raised it |
| 20 | ✅ **CANSPEAK.4 / .8** | Retire `canSpeak` from status summaries (it's `minGrade !== 'pre-K'`, pure grade arithmetic); report `matrixDrivenPct` + `word_motor.everFired` instead. **SHIPPED 2026-08-20:** field RENAMED to `minGradeCleared` (the name of what it computes) and its one consumer updated — zero chat-path consumers, so nothing degrades. New `state.voice` block answers the real question off evidence: word_motor size/everFired/pct, oracle vs matrix hits, `matrixDrivenPct`, last emit rejection **with its age**, and a verdict that says `unmeasured` in words rather than implying she cannot speak. | you caught me misreporting it |
| 21 | **RUNPOD.6** | `main.rs:49` enumerates wgpu unconditionally and `:88` hard-exits when empty — a CUDA-capable host with no Vulkan stack can never donate. Kills the whole GLVND/X11 package pile. | blocks a cheap donor fleet |
| 22 | ✅ **LANGRAM.6** | Sizing a load-bearing geometry off `os.freemem()` means the vocabulary ceiling can differ run to run. Pin it or make a size change a loud acknowledged event. | it already flip-flopped once |
| 23 | **SYNCPARTIAL.6 / DF7SYNC.7** | Root cause not established + the sync-window deadlock is narrowed, not eliminated. | honest open |
| 27 | ✅ **MIRRORID.6** | *(new, filed 2026-08-20 from the MIRRORID.5 read — not swept in.)* The SAME disease one layer down, in the ACCOUNTING: `gpu_telemetry` accrues `gneuronsPerSec × dt` into the leaderboard on EVERY frame, and that rate is the persistent field — so a donor doing nothing keeps BANKING Gn·s for as long as it stays connected. One condition fixes it (accrue only when `stepsComputed` advanced, which MIRRORID.5 already tracks), but it lives in a 9,737-line file and it changes what the leaderboard MEANS — decide it together with WORKSHARE.6, not separately. | found while reading, filed not guessed |
| 28 | **TASKLIST.1 / .2 / .3** | *(new, filed 2026-08-20 — Gee: "write task list of all open todo work".)* **.1 SHIPPED:** `scripts/write-open-tasks.py` writes `docs/OPEN-TASKS.md` — every open board item, grouped into these tiers, each body copied **byte-for-byte** off its TODO line with a `docs/TODO.md:<line>` backlink; refuses to write if the Tier 4/5 rosters don't parse, if anything lands UNTRIAGED, or if any body is not byte-present in the file **re-read from disk**. **.2 open:** nothing keeps the snapshot fresh (same disease as LOOPNAME.13, one doc down). **.3 open:** first action every new session is to call `TaskCreate` once — the CLI panel is what Gee actually asked for, and the triage is already done. | the CLI task tools are absent — `ToolSearch` says so, twice |

---

## TIER 3 — YOUR DECISION, not work

| # | id | the call |
|---|----|----------|
| 24 | **WORDEMIT.4** | Fresh walk or not. **NOT forced.** Cheapest next step costs nothing: let art/K finish, talk to her, read `matrixDrivenPct`. |
| 25 | **RUNPOD.8** | Community placement refused 3× at $0.34/hr; every pod lands SECURE at $0.74 (~$533/mo at 24/7). Retry community, accept secure, or switch card (A40 secure $0.44/hr, 48GB, HIGH stock). |
| 26 | **RUNPOD.7** | ⚠ Likely already closed — the CUDA fix landed and today's pod advertised **24,210MB**, not the 2047MB Vulkan cap. Confirm and close. |

---

## TIER 4 — ✅ CLOSED 2026-08-20. Stale press-riders, answered.

**CLOSED on Gee's approval (verbatim option: *"Close all 48 with verdicts"*). All 38 were "⏳ GEE: Update & Savestart, then verify X" written 08-18/08-19. Those presses HAPPENED — repeatedly — and the outcomes are in FINALIZED and in today's live reads (3 names on the leaderboard, CUDA path at 24GB, blocks 250-440ms, teach/min ~4,100, drops/sheds 0/0, 4 cells passed). Each line on `docs/TODO.md` now carries `[x]` plus its closure verdict where the `⏳` / `GEE:` / `OPEN` status token used to be; every word of every original description is preserved after it.**

`RAMP17.3` · `PRECELL.3` · `TPROF.1` · `DROPCHAT.3` · `SAVEPIN.2` · `SAVEPACE.3` · `V0319.2` · `REPLYPIN.3` · `GATESTEP.3` · `GENPIN.3` · `BAND1300.1` (superseded — V0318 took l1b 2,700ms→40ms) · `RUNPOD.11` · `RUNPOD.12` · `RUNPOD.13` (tag landed; template pins v0.3.22) · `RUNPOD.14` (verified today: `[CUDA]` @ 24,210MB) · `DF7SYNC.6` · `PACEDSYNC.5` · `SYNCSERIAL.5` · `DELTAIDX.8` · `QUEUEDEADLINE.4` · `ALIASFIX.4` · `INCREMENTAL.6` · `WORKSHARE.5` · `BUFFLOOR.4` · `PARTMIRROR.3` · `ALLINIT.4` · `MIRRORDIAG.3` · `INITFIT.5` · `MIRRORID.4` · `RESYNCDUTY.6` · `LOOPNAME.5` · `LOOPNAME.6` · `LOOPMAX.6` · `LOOPMAX.7` (answered by LANGRAM: RAM floor, fixed, 12M confirmed) · `LOOPMAX.9` (superseded — CELLBOUND named the real cost) · `SYNCPARTIAL.5` · `LANGRAM.5` (risk MATERIALIZED and was recorded in LANGRAM.9) · `GATGUARD.5` (moot — dashboard is back)

⚠ **`DELTAIDX.9` is NOT in this list and must not be closed** — DELTAIDX is still **DISABLED** and its corruption cause was never found.

---

## TIER 5 — ✅ CLOSED 2026-08-20. Not tasks: retrospective lessons I wrote into the board.

These are things I learned, written as if they were work. They belong in memory/docs, not on a task board where they inflate the count and hide the real 29. **All 9 closed as lessons** (`WORKSHARE.6` closed as answered — Gee's leaderboard call: mirrored work still counts; `DONORKILL.1` was already carried into persistent memory as the name-the-primary rule).

`ALIASFIX.5` · `WORKSHARE.6` · ✅ `PARTMIRROR.4` (turned out to BE work — shipped 2026-08-20 as the `N/M cl` coverage cell + tooltip, so a small card's proportionally lower rate reads as honest work instead of a dud GPU) · `ALLINIT.5` · `INITFIT.6` · `RESYNCDUTY.7` · `SYNCEMPTY.4` · `WORDEMIT.5` · `GATGUARD.6` · `DONORKILL.1` · `DELTAIDX.9`(the ceiling note; the DISABLED status stays live in Tier 2 terms)

---

## Reading order if you only do three things

1. **CELLBOUND.F** — press. Unblocks the walk. *(Still #1 after BOTH 2026-08-20 batches. Nothing in either needed it, and nothing in either changes what it verifies — though the second batch adds lines that press will also show: `phaseRepCursor restored`, `bundle freshness OK`, `LANGRAM.6 geometry pin CONFIRMED`, and the split's new `generate:primary` / `generate:continuation-K` stage names.)*
2. ~~**Tier 2 #9/#10/#11** — the three that bit us today. The board still cannot answer *"is it working?"*~~ → **DONE 2026-08-20**, along with #19, #20, #2 and PARTMIRROR.4. The board answers it now. Next in this slot: **FIRSTPIN.1** (instrument the respond stage before touching it).
3. ~~**FIRSTPIN.2** — a real latent concurrent-teach bug sitting in an unfired branch.~~ → **DONE 2026-08-20** (enqueued onto a job queue that preserves the definition channel; the walk drains it serialized). Next in this slot: **RUNPOD.6** (the wgpu-only enumeration gate that blocks a cheap CUDA-only donor fleet) — or **LG.6**, once the segmented-rowPtr donor release exists.
