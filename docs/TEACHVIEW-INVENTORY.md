# The training monitor — what can be shown, and what is missing

> ⛔⛔ **THIS FILE WAS WRONG TWICE AND BOTH CORRECTIONS ARE THE POINT.**
>
> **First draft** enumerated the dashboard's published fields and regrouped them —
> consciousness, endocrine, coherence, donor pool, event-loop lag. Gee: *"remember
> the teach view is not a verbatim copy of the dashboard it is the verbatim shit i
> told you to all put in it"*. **Those vitals belong to the dashboard. This page is
> about THE TRAINING.**
>
> **Second draft** was written in ticket numbers and code identifiers. Gee: *"and
> we dont use item numbers or code names and shit we use plain english for it
> all"*. **A reader cannot look up a ticket. Everything below names the thing
> itself.**

> **The ask, in his words:** *"i want to know everything and seee everything in
> bars graphs, charts readouts of whats being sent statistical data, all lthe nobs
> we have and then some, every single analytical peice of information in totality
> being taught to the brainall in a hightech awesdome well crafted and coded and
> designed system for admin monitering of the training with any and all need
> options and controls and needed buttons"*
>
> He chose **the inventory first, then one area built all the way through.** This
> is the inventory — the menu, so the choosing happens before the building.

---

## The ask, broken into what each part demands

| his words | what it demands |
|---|---|
| *"know everything and seee everything"* | nothing about the training stays unpublished |
| *"in bars graphs, charts readouts"* | drawn, not a wall of numbers |
| *"of whats being sent"* | **what actually goes to the brain** — the wire, not her vital signs |
| *"statistical data"* | spreads and rates, not only totals |
| *"all lthe nobs we have and then some"* | every setting surfaced — **and more than exist today** |
| *"every single analytical peice of information in totality being taught"* | **all of it**, not a sample |
| *"admin monitering of the training"* | scoped to teaching |
| *"any and all need options and controls and needed buttons"* | it must **act**, not only display |

---

## What is being sent — the wire into the brain

The part most under-served today, and what separates this page from the dashboard.

| what | can we show it? |
|---|---|
| Every teaching item, split by which lane taught it | ⛔ **NO until 2026-09-06 — this row was FALSE and is the reason it is now dated.** `teachBus` was wired to exactly **two** teaching sites in the whole curriculum (`_teachWordDefinition`, `_teachSentenceList`). Measured live mid-walk: **5 items published in 18.3 minutes** while `teachCallsPerMin` read **10,769** — so the feed went silent mid-cell and read as the walk having stopped. Silent lanes: `_teachAssociationPairs`, `_teachConcreteSentences`, `_teachVocabList`, `_teachHebbian`, `_teachSelfFramed`, `_teachWordIntegrated`. ✅ **Now yes for the content lanes** — publishing added at the `_teachConcreteSentences` chokepoint (which also carries her self-framed first-person lines, the self-pronoun grounding, the perspective-contrast set and the self-architecture facts) and per word in `_teachVocabList`. ⚠ `_teachHebbian` stays unpublished on purpose: it is a substrate primitive with no human-readable text, and 50,020 calls of it would be noise, not content |
| The actual sentences, live, as they go in | **yes** — a rolling 400-item reading feed, 24 pushed per update |
| Where each item came from — a corpus file, a hand-written runner line, or the dictionary | **yes** |
| How many repetitions each item got, and which relation channel it trained | **yes** |
| **How many bytes actually went on the wire, by kind** | **partly** — measured, but never shown beside the teaching it describes |
| **The shape of each compressed frame sent to the card** | **partly** — lives in the donor telemetry, not here |
| **The pictures sent to her eyes** | ⛔ **no** — figures are fetched, perceived and shown to her, and this page never mentions them |

---

## All of it, not a sample — the part genuinely not met

⛔ **The counts are complete; the reading feed is a rolling window of 400.** That
was a deliberate and correct split — a sampled view of a poisoned corpus can miss
the poison, which is why the counts were never sampled. **But "in totality" asks
for something the window cannot give: everything a cell ever taught, retrievable
afterwards.**

> ### ✅ BUILT 2026-09-02 — the ledger, chosen by Gee as the first area built completely
>
> **The ring answers *what is she being taught right now*; the ledger answers
> *everything this cell has ever taught*.** The ring stays at 400 — it is what a
> human reads live, and an unbounded ring at teach rates is a memory leak with a
> nice name. The ledger is a separate append-only store.
>
> **Priced before it was built, then measured.** `teachBus` fires **once per
> unique item, on rep 0 only** — counting per rep would inflate the analytics by
> the dose — so the row count is the number of distinct things taught, roughly
> **3.5M across a full walk**. Harnessed at **547 MB projected**; disk is the
> cheap axis and the resident ring is untouched.
>
> ⛔ **The row stores the TEXT, refusing an obvious 4x saving.** A row could
> store `(source file, sentence ordinal)` and recover the text from the corpus —
> but an ordinal into a **mutable** file silently re-points at different content
> the moment that file is re-ingested, and nothing can detect it because the row
> still looks well-formed. **That is the position-versus-identity bug fixed in
> the figure lane the same day.** A ledger whose rows quietly change meaning is
> worse than no ledger.
>
> **Reads:** `/teach-ledger.json?cell=<subject>/<grade>&after=N&limit=M` ·
> `?cells=1` for per-cell totals · `?stats=1` for rows written, pending and
> **dropped**. ⛔ **Every response carries `total` beside `returned` and an
> explicit `more` flag** — a client pages until `more` is false rather than
> inferring the end from a short page, and a partial view can never read as the
> whole. `available:false` is a real answer, not an error: if the store is
> missing the page says so instead of returning an empty list that reads as
> *"this cell taught nothing"*.
>
> ⚠ **It dies with the weights.** Surviving a fresh walk would answer *"show me
> everything this cell taught"* with millions of rows about a brain that no
> longer exists — **a more convincing lie than the counts, because it comes with
> the sentences.** A Savestart keeps it; a fresh walk clears it.
>
> **Verified through the production wiring, not a stand-in:** the real
> `TeachLedger` driven through the real `teachBus` — 1,500 items, 0 dropped,
> per-cell totals derived at the chokepoint (900 / 600), 900 of 900 paged in 5
> pages, **ring still 400 while the ledger held all 1,500**, and a fresh instance
> read every row back after a restart.

| what | can we show it? |
|---|---|
| Complete per-lane, per-cell, per-source counts | **yes for the lanes that publish** — never sampled. ⚠ **"Complete" was doing more work than it could carry until 2026-09-06:** the counts were never *sampled*, which is true and is not the same as covering every lane. Six lanes reported nothing at all, so a complete count of two lanes read as a complete count of the teaching. See the corrected row above |
| Totals that survive a restart | **yes** — added today; they accumulate across reboots and reset only on a fresh walk |
| **Everything a single cell ever taught** | ✅ **BUILT** — an append-only ledger keeps every item, paged to the true end, with the complete count printed beside every page. It is **not** a bigger reading window: the live ring stays bounded at 400 while the ledger holds all of it |
| **Test words that appear nowhere in the whole corpus** | ✅ **ON THE PAGE** — the sweep moved out of the CLI script into `server/curriculum-coverage.js`, the module the state publish already shares, so the command line and the page cannot disagree. Latest: **1,788 exam words required, 10 present nowhere** across a 386,996-distinct-word corpus |

---

## Statistics — spreads, not just totals

| what | can we show it? |
|---|---|
| Words in each cell against the bar for its band | **yes** — and each bar says whether it was measured from a real textbook or extrapolated |
| How many cells are full, thin, or empty | **yes** — *213 cells walked · 56 full · 130 thin · 7 empty* |
| Pictures: on disk, reachable, carrying their surrounding text, properly labelled | **yes** — added today |
| Share of entries with a recorded licence | **yes** — *98.4%* |
| Mix of statements, questions and exclamations in the prose | **yes** — ⚠ this is a **genre** signal about the writing, not a measure of whether she can learn questions |
| **Teaching rate over time** | ⛔ **no** — totals exist, no series behind them |
| **How long each phase actually takes** | ⛔ **no** |
| **The spread of repetition doses actually delivered** | ⛔ **no** — repetitions are recorded per item, nothing aggregates them |

---

## Seeing where she is

| what | can we show it? |
|---|---|
| Her grade in each subject, cells passed and still owed | **yes** |
| Movement inside the current cell | **yes** — the sub-phase counter, **the number to trust when the bar disagrees** |
| The progress bar inside a phase | ⚠ **it lies, and the reason is known.** Its denominator counts teaching steps the grade forbids — at kindergarten only **3 of 14** can run, so the bar can never pass **21%** — and the numerator stays at zero for hours because credit is only given when a step finishes, and one step is priced at nearly fifteen hours |
| Warnings raised automatically — a word the dictionary cannot define, a cell below its bar | **yes** — every warning names the cell, the lane and the number |
| Whether sleep-replay has ever actually run | ⚠ **unconfirmed.** The gate that was starving it was removed; **nothing has watched it work in a live brain yet** |

---

## Every setting — *"and then some"*

**196 environment settings**, all catalogued with their defaults, whether each is
a tuning lever or a safety guard, and — for the load-bearing ones — the
measurement behind the value.

⛔ **None can be changed from a page.** Today changing one means editing a file
and pressing deploy. *"and then some"* asks for **new** controls, not just
exposure of the old — and writing into a running brain needs its own safety
design. The irreversible presses already demand confirmation for exactly that
reason.

---

## Options, controls and buttons — it has to act

**What exists today:** Update-and-Savestart, Fresh-walk, and accept / reject /
ban on her artwork.

| ⛔ asked for, absent |
|---|
| Pause or resume the walk |
| Re-teach a single cell — *the server route exists, there is no button* |
| Skip or re-order a phase |
| Change a setting live |
| Export what a cell was taught |

---

## What does **not** belong on this page

Her consciousness measure, arousal, mood, coherence, hormones, drug state, the
donor pool and its throughput, event-loop lag, connection backpressure, neuron
count, how much of the brain has ever fired.

**Those are the dashboard's job.** They describe the brain's condition, not what
is being taught to it. Pulling them in is exactly what made the first draft of
this file a copy of the dashboard.

⚠ **One deliberate exception:** when a condition *stops the teaching* — the
compute substrate being unavailable halts teach calls outright — this page should
say **"teaching is blocked because…"**. That is a fact about the training. It
reports the blockage, not the vital.

---

## The honest summary

- **What is being sent, and having all of it rather than a sample — those two are
  the real gaps.** Most of the rest already exists and needs drawing.
- **Controls barely exist.** The page is read-only today apart from the art
  verdicts.
- **Three things would repeat a known lie if drawn naively** — the in-phase
  progress bar, the replay status, and the console ring (which holds only about
  forty-five seconds once teaching floods it). ⛔ **Each shows its caveat or is
  not shown at all.** This is a monitor for a project whose defining failure is
  instruments that lie; a panel that repeats one is worse than an empty space.

## The rules every panel obeys

Bounded heights that scroll · lists capped with an honest *"+N more"* · **complete
counts printed beside every paced feed** · summaries rather than one row per item ·
panel-scoped style names · **rendered against worst-case data before shipping** —
that rule already caught a zero-width bar that made a lane genuinely sitting at
zero look like a broken page — and **no field that reports health it cannot know.**
