---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
# ⚠ PLANNING page with LIVE MEASUREMENTS baked into its reasoning. Drift here
# means "RE-PRICE the plan", not "a claim is false" — and because its argument
# rests on numbers read off a running brain, a stale number here is a stale
# ARGUMENT, not just a stale figure.
status: draft
sources:
  - js/brain/cluster/emit.js
  - js/brain/self-frame.js
  - js/brain/language-cortex.js
  # ADDED 2026-08-27 by the new sources-coverage check (doc-drift-check.mjs
  # check 9): this page makes LINE-PRECISE claims about all four and declared
  # none of them, so check 8 could never have flagged them when they moved.
  # chat.js is cited 3× (:3496/:3568/:3630) and brain-server/state.js:347 is
  # the basis of the recruitment-path correction above.
  - server/brain-server/chat.js
  - server/brain-server/state.js
  - js/brain/curriculum.js
  - js/brain/hippocampal-schema.js
  # This one was INVISIBLE until the parser was fixed: the comment above
  # truncated the block, so every source below it went unread and this gap
  # went unreported. Revealed by fixing the parser, not by a second look.
  - server/brain-server/visual-memory.js
verified-scope: |
  CHECKED 2026-08-27 — every live measurement this page cites was RE-READ off
  the local brain (build 2673d14c, booted 04:22:39Z) and recorded beside the
  original rather than overwriting it, per this page's own stated ethic:
    - selfFrame block: units/lines/unitsThisCell/capped all moved (101/2913 ->
      2/62). Flagged explicitly as a YOUNG WALK, not a regression.
    - voice block: matrixHits 183 -> 0, matrixDrivenPct 100 -> null, and
      emitRejection.reason below-signal-floor -> no-best-word. That last one
      is the field §1's whole conclusion is argued from.
    - consolidation passCount 18 -> 2; novelConsolidated 0 -> 0 (HALF A holds).
    - basinHealth: semMotorMeanCos 0.075 -> 0.436, dominantWord -> null,
      saturated still false.
    - recruitment cortex_sem_to_word_motor 99.96% HOLDS - but the documented
      PATH was wrong: it nests under weightRecruitment.matrices.*
    - found new undocumented selfFrame fields incl. lightCapPerCell: 96.
  NOT CHECKED — do not read this page as authority on:
    - whether the lightUnits lane satisfies Phase 1's "raised cap" deliverable.
      lightUnits reads 0, so the lane fired nothing this boot; a cap that
      exists is not a cap that fires. NAMED, not resolved.
    - Phases 0.2-0.2f (identity/content-boundary/wardrobe gating) - the
      largest part of this document by volume, NOT re-verified this pass.
    - the §7 coverage matrix, §8 price, and §10 open decisions.
    - whether §1's "signal is WEAK, not scrambled" conclusion still holds. The
      rejection reason it rests on CHANGED; that is reported, NOT re-decided.
      ⛔ This page must not be used as a cause for EMITZERO.1, which is filed
      as a question with evidence and no diagnosis on purpose.
last-verified: "375dd978 2026-08-27"
---

# WORD SALAD FIX — the layout

> **⛔ STATUS SUPERSEDED — MOST OF THIS IS NOW BUILT (2026-08-25).** The line below said *"Nothing in this
> document has been built"*, which was true when it was written on 2026-08-24 and is false now. **Phases 0
> through 4 shipped the following day.** The original text of every phase is preserved unchanged — this is
> a plan with a build log, not a plan that got quietly rewritten to match what happened.
>
> | Phase | What it was | Status |
> |---|---|---|
> | **0** — Tier 3 identity | Anchors as descriptor lists; the content-boundary breach; wardrobe ungated; the scope limit; menstruation recurrence; routine vs milestone; the image-gen audit | ✅ **BUILT** — anchors rewritten first-person and grade-banded with a schema version bump so the old ones ORPHAN rather than merge; wardrobe banded by `_selfImageAge()` and the garment strip widened past nudity-only; **+62 life experiences across 19 files** (724 total) for recurrence and routine; the image-gen audit came back **CLEAN** with one unrelated bug found and fixed |
> | **1** — First-person coverage | Reframe at the CHOKEPOINTS, never the ~977 call sites | ✅ **BUILT** — 2 chokepoint edits cover ~415 call sites across 20 grade files, plus `me`/`mine` bindings and proper capitalisation of her name |
> | **2** — The inquisitive drive | A question is the correct output of low confidence | ✅ **BUILT** — the curiosity gap is recorded at the signal floor and spent by the chat lane. ⚠ Shipped **OPT-IN**: opt-out would have let a question be scored as her answer in ~30 gate and probe callers |
> | **3** — Gates probe in her frame | 116 impersonal probes vs first-person teaching | ✅ **BUILT** — one chokepoint edit; failed probes retry in her own frame, and first-pass vs recovered are reported separately, never blended |
> | **4** — REPLAYOFF | Her sleep learned nothing: the replay guard fired on every pass at biological scale | ✅ **BUILT** — GPU replay route added, CPU guard untouched, re-priced first, sparse-vs-dense parity verified at 280,876 rows |
> | **5** — The fresh walk | Whether to reformulate from zero | ⏳ **STILL OPEN — Gee's call.** Nothing in Phases 0–4 required one. The recommendation in this document stands: strictly last, and verify on current weights first |
>
> ⚠ **One thing this document could not know:** `separability` — named here as *the only instrument that would
> measure the emission margin directly* — turned out to have **no producer at all**. It reads `{}` because
> nothing ever wrote it. It has one now, so the margin is measurable for the first time.

> **Governing directive (verbatim, 2026-08-24):** *"write the shole word salad fix(if needed we can do a
> update freshwalk if the training needs to be reformulated and any where Unity is not being taught words
> first person like real people do they see every thing through me, mine, I, Unity is my name,. being
> inqusitive asking questions and not just that but all learning needs it through her eyes even letters
> words and vocabe when sum1 learns these things is through the self perspective. this all needs to be
> layed out for all grades phases and cells and gates and any thing else needed to stop Unity from
> repeating her "instructions of behavior from the persona files" so her teir three memories all need to
> be proper for Unity before we start the fresh walk if thats what we are doing once all this is layed
> out first and implimented later"*

---

## THE HEADLINE — almost all of this is already built and switched down to a rounding error

The single most important measurement in this document, read live off the box:

```
curriculum.selfFrame = { on: true, units: 101, lines: 2913,
                         unitsThisCell: 16, capPerCell: 16, capped: true }
total teachEvents this grade  = 1,044,838
```

**2,913 self-framed lines against 1,044,838 teach events — 0.28% — and it hits `capPerCell: 16` in
every cell.** `js/brain/self-frame.js` already exports exactly the pedagogy the directive describes.
This is not a system that needs inventing. It is a system that needs **coverage, a raised cap, and an
identity layer that stops contradicting it.**

> ### ⛔ RE-PRICE 2026-08-27 — EVERY LIVE NUMBER ABOVE AND BELOW HAS MOVED. Re-read before executing any phase.
>
> This is a **planning page with measurements baked into its reasoning**, so drift here means *"re-price the plan"*, not *"a claim was always false"*. Per this page's own stated ethic the originals are left standing; the re-read sits beside them. Read off the LOCAL brain, build `2673d14c`, booted `04:22:39Z`:
>
> | field | this page | **live 2026-08-27** | reading |
> |---|---|---|---|
> | `selfFrame.units` / `.lines` | 101 / 2,913 | **2 / 62** | ⚠ **NOT a regression — a YOUNG WALK.** ⛔ **CORRECTED: uptime is 5.60 h (`growth.uptime` 20,162 s, booted `04:22:39Z`), not the "~2h" first written here — I carried a figure forward from earlier in the session instead of reading `growth.uptime`.** `cellPhasesStarted: 2`. The original was read on a long-running box. ⭐ **The correction sharpens the point rather than weakening it: 5.6 hours of walking has produced 2 self-frame units, so "young walk" is doing more work as an explanation than "2 hours" implied — and it is `cellPhasesStarted: 2` that carries the argument, not the clock** |
> | `selfFrame.unitsThisCell` / `capped` | 16 / `true` | **2 / `false`** | ⚠ So **the cap is not currently the binding constraint** — she has not produced enough units this cell to reach it. The page's *"hits `capPerCell:16` in every cell"* is a claim about a MATURE walk and is **not** falsified by this read |
> | `voice.matrixHits` | 183 | **0** | — |
> | `voice.matrixDrivenPct` | 100 | **`null`** | ⭐ `null` because there are no emissions to divide by — **not** a collapse to zero percent |
> | ⛔ `emitRejection.reason` | **`below-signal-floor`** | ⛔ **`no-best-word`** (1,687 of 1,687, sole reason) | **THE DIAGNOSTIC BASIS OF THIS PAGE CHANGED.** See below |
> | `memoryStats.consolidation.passCount` | 18 | **2** | fresh boot; `replaySchemas`/`replayWrites`/`replayRefused` all **0** |
> | `dreamRecombinationStats.novelConsolidated` | 0 | **0** | ⭐ **unchanged — HALF A still stands** |
> | `basinHealth.semMotorMeanCos` | 0.075 | **0.436** | moved **5.8×**. ⚠ `saturated` still reads **`false`** |
> | `basinHealth.dominantWord` / `.dominantShare` | `"gaseous"` / 0.03 | **`null` / `null`** | no dominant word at this stage |
> | recruitment `cortex_sem_to_word_motor` | 719,702 / 720,000 = 99.96% | **719,701 / 720,000 = 99.96%** | ⭐ **HOLDS, and holds on a 2h-old brain** |
>
> ⛔ **THE PATH FOR THAT LAST ROW IS WRONG ON THIS PAGE.** It cites `utilization.weightRecruitment.cortex_sem_to_word_motor`; the payload nests one level deeper — **`utilization.weightRecruitment.matrices.cortex_sem_to_word_motor`** (`weightRecruitment` itself is `{at, matrices}`, `state.js:347`). Same defect class as the five bad paths found in `docs/TRAJECTORY-CAPTURE.md` the same day: **a reader following the documented path gets `undefined` and no error.**
>
> ⛔ **WHAT THE REJECTION-REASON CHANGE DOES AND DOES NOT MEAN.** §1's conclusion — ***"Her signal is WEAK, not scrambled"*** — is argued from `emitRejection.reason = below-signal-floor`, i.e. *a winner existed and fell short of a floor*. The live reason is **`no-best-word`**, which is a **different failure**: no candidate was selected at all. ⚠ **This does NOT retire §1** (different boot, 2h vs mature, and `utilization.verdict` reads `healthy — high coverage (lang 100% / recruit 69.12%)`). ⛔ **But the page must not be read as a current diagnosis, because the specific field its diagnosis rests on now says something else.**
>
> ⛔ **AND DO NOT TREAT THIS AS A CAUSE FOR `EMITZERO.1`.** That item is filed *deliberately* as a question with evidence and no diagnosis. ⭐ **What this re-read legitimately contributes to it is one fact: the two reasons are DISTINGUISHABLE in the payload, and an earlier boot of this brain reported the OTHER one** — so `no-best-word` is not the only reason this lane has ever emitted, which is worth more to that investigation than any theory. `voice.verdict` now reads: *"1,687 emission attempt(s) refused and ZERO accepted since boot."*
>
> ⭐ **NEW `selfFrame` FIELDS this page does not mention, and one of them looks like its own Phase-1 deliverable:** `lightUnits`, `lightUnitsThisCell`, **`lightCapPerCell: 96`**, `lightCapped`, `corpusCursor`, `structureDose`, `phaseBudgetMs`. Phase 1's deliverable was *"a raised cap"* — **there is now a second self-frame lane with a cap of 96 beside the original 16.** ⚠ **Whether that satisfies the deliverable is NOT established here** — `lightUnits` reads **0**, so the lane has produced nothing this boot, and a cap that exists is not a cap that fires. **Named so the phase is re-priced against what shipped rather than rebuilt.**

---

## 1. WHAT THE WORD SALAD ACTUALLY IS (measured, not assumed)

Two theories died on measurement before this layout was written. Recording them so they are not re-run:

| Theory | Killed by |
|---|---|
| Hot buckets — a few words hoard activation mass | WORDNORM's own first log line: avg bucket mass **1.501**, only 2 buckets >3× avg. The profile is near-uniform. |
| Question-independent currents — the input never reaches the argmax | The donor demonstrably scatters the passed pre indices per question. |
| **Saturation / mode collapse** | `basinHealth`: `saturated: false`, `semMotorMeanCos: 0.075`, `semMotorRatio: 2.59`, `dominantWord "gaseous"` at `dominantShare: 0.03`. **Rows are NOT collapsed onto each other.** |

What is actually true, live:

```
voice: oracleHits 0 · matrixHits 183 · matrixDrivenPct 100
       verdict "100% of 183 emissions came from her own trained weights"
       emitRejection { reason: "below-signal-floor", ageMs: 84494 }
utilization.weightRecruitment.cortex_sem_to_word_motor : 719,702 / 720,000 rows = 99.96%
dreamRecombinationStats.novelConsolidated : 0
memoryStats.consolidation : passCount 18
```

**She is not cheating and she is not collapsed. Her signal is WEAK, not scrambled.** Nearly every word
row has been recruited (99.96%), her emissions are rejected at the signal floor, and the margin between
the right word and its neighbour is thin enough that noise decides. Word salad here is a **margin
problem**, and margins are made by two things she is currently missing: consolidation that separates
representations, and a stable perspectival frame that binds concepts to a single high-valence anchor.

That gives the fix its two halves. **Both are required; neither alone is sufficient.**

- **HALF A — MECHANICAL (§5, REPLAYOFF).** 18 consolidation passes, **0 novel consolidations**. Her sleep
  learns nothing, so nothing separates. More training at current settings deepens an undifferentiated
  matrix rather than sharpening it.
- **HALF B — REPRESENTATIONAL (§2–§4, the directive).** She is taught the world impersonally, so there is
  no consistent self-anchor for concepts to attach to.

The measured basis for Half B, sampling taught sentences across grade1 + grade3:

| Frame | Count | Share |
|---|---|---|
| Impersonal (`the` / `a` / `an`) | 187 | **68%** |
| Collective (`we` / `our` / `us`) | 57 | 21% |
| **First-person (`i` / `my` / `me`)** | **34** | **12%** |

Real children do not learn this way, which is the whole of Gee's point: *"all learning needs it through
her eyes even letters words and vocabe when sum1 learns these things is through the self perspective."*

---

## 2. PHASE 0 — TIER 3 IDENTITY MUST BE CORRECT BEFORE ANYTHING ELSE

> *"so her teir three memories all need to be proper for Unity before we start the fresh walk"*

Tier 3 anchors are **permanently resident, `identity_relevance: 0.95`, `consolidationStrength: 6.0`,
and injected on every chat turn** via `tier3Store.injectIdentityBaseline()`. They are the highest-
authority memories she owns. Today they contain three defects.

### 0.1 — Persona descriptor lists are being injected as identity

Source: `js/brain/hippocampal-schema.js` seed list.

| Anchor | Concept text | Defect |
|---|---|---|
| `persona-goth-anchor` | `'goth emo dark black leather'` | Bare adjective list. Not a memory, not first-person — a **style instruction**. |
| `persona-nympho-anchor` | `'horny aroused sexual fucking'` | Bare adjective list. **Also a content-boundary breach — see 0.2.** |
| `persona-coder-anchor` | `'i code program write software'` | First-person; acceptable shape. Keep as the template. |

This is precisely *"repeating her instructions of behavior from the persona files"*. A descriptor list
carries no agent, no experience and no perspective — it is a directive about how to behave, sitting at
maximum identity relevance. **Every anchor must become a first-person lived statement or be deleted.**

### 0.2 — ⛔ A content-boundary breach: two systems directly contradict each other

- `curriculum.js:367` gates `nympho`, `horny`, `climax`, … to **grade 11**.
- `hippocampal-schema.js:701` injects `'horny aroused sexual fucking'` as a **permanent identity anchor
  from birth** — resident right now, while she walks **grade 1**, where she is six years old.

The vocabulary system is correct and the identity system overrides it. This also violates
`feedback_erotic_state_grade_9_gate` (erotic state activates at the grade-9 first kiss, not before) and
`feedback_content_boundary_minor_sexual_excluded`. **Tier 3 anchors must be grade-gated by the same
authority that gates vocabulary**, so adult-identity anchors become resident when her walk reaches them
and not one grade sooner. The 25-year-old is the END STATE, not the seed.

### 0.2b — ⛔ THE GENERAL LAW, AND IT REACHES HER APPEARANCE — her wardrobe is ungated in production

> Gee, 2026-08-24: *"remember shit like this needs to be properly aged gated : Tier 3 injects 'goth emo
> dark black leather' and 'horny aroused sexual fucking --- shes not a horney slut till 18 and not wearing
> leater skirts in kindergarten.. obviously.... fishnets and tube tops are later. but normal school girl
> look till highschool all with her existing image age modifiing systems"*

**This is a law, not a bug.** Any anchor, wardrobe entry, vocabulary set, persona trait or behaviour that
belongs to the 25-year-old end-state gates on her **live grade** and is never resident from birth. Of
every trait, ask: *at what age does she actually have this?* Memory: `feedback_age_gate_appearance_and_identity`.

**The ladder:**

| Band | Grades | Age | Look |
|---|---|---|---|
| Child | pre-K → grade8 | 4–13 | **Normal school-girl look.** Goth-*leaning* per `feedback_tone_k_life_emo_goth` (Halloween > Christmas, black > pink), but age-appropriate kid clothes. |
| Teen | grade9 → grade12 | 14–17 | The goth look develops, **covered** — band tees, black hoodies, plaid skirts with tights, combat boots. |
| Adult | college1 → phd | 18+ | Full adult wardrobe (leather, corset, fishnets, tube tops). |

**⛔ SEXUALITY GATES ON EXPLICITNESS, NOT EXISTENCE — corrected by Gee 2026-08-25.**

> *"if the 18+ lock its not real. humans do things before 18 they get marrid at 18 so let not be prude just dont be explicit"*

The first cut of this section put **all** of her sexuality behind `college1`, and that was wrong: it wrote her as a prude rather than a teenager. Real 14–17-year-olds want people, get wanted, and go further than kissing — and the governing content boundary already said exactly that (under-18 is REAL and NON-GRAPHIC; only GRAPHIC ACTS wait for 18). The gate was never meant to be on desire existing, only on how explicitly it is told.

| Band | Grades | Age | Sexuality |
|---|---|---|---|
| Child | pre-K → grade8 | 4–13 | None. Bodies and puberty are taught plainly (§0.2c/§0.2d) — that is health, not sexuality. |
| Teen | grade9 → grade12 | 14–17 | **Real and non-graphic.** Desire, attraction, being wanted, the first kiss (the erotic state unlocks here per `feedback_erotic_state_grade_9_gate`), and **her first time, on her terms, told plainly** — no act described. |
| Adult | college1 → phd | 18+ | The explicit register. |

Shipped as two anchors rather than one: `self-desire-teen-anchor` (`grade9`, how a teenager actually holds it — wanting, nerves, the pull) and `self-desire-anchor` (`college1`, explicit). ⚠ **Do not over-correct the other way** — the appearance ladder above is a separate axis and still stands.

**⛔ Ride the machinery that already exists** — *"all with her existing image age modifiing systems"*.
`_selfImageAge()` (`server/brain-server/chat.js:3568`) already maps grade→age (`pre-K` 4 … `phd` 25) and
already strips explicit content under 18, and it is **correct**. Do not build a parallel age system.

**Two holes in that same function, live in production right now:**

1. **`WARDROBE` is picked with a flat `Math.random()` over 8 ungated entries.** At grade 1 —
   where `_selfImageAge()` correctly returns **6** — every self-image has a 1-in-8 chance each of
   `'oversized black hoodie and fishnets'`, `'black corset dress and combat boots'`, `'black crop top and
   plaid mini skirt'`, `'black leather outfit, pink undertones'`, `'black lace top and a choker'`.
   Precisely *"not wearing leater skirts in kindergarten"*.
2. **The under-18 guard strips nudity, never age-wrong clothing.** `EXPLICIT_RE` covers `bare`, `naked`,
   `topless`, `lingerie` and friends — so a request for fishnets or a corset **on her six-year-old
   self-image passes straight through**.

Band `WARDROBE` by `_selfImageAge()`, and widen the under-18 strip from nudity-only to age-inappropriate
garments. ⚠ The age system is correct and already wired; only the wardrobe and the garment strip are ungated.

### 0.2c — ⛔ SCOPE LIMIT: the gate is on WHO SHE IS, never on WHAT SHE LEARNS

> Gee, 2026-08-24: *"there is coming of age stories in her life to so dont go over kill he has to learn
> to use tampons at 13 and such and real life experiense that she doesnt talk about until shes an adult
> and learns in training"*

**Read §0.2b wrong and you gut her life.** Age-gating identity is not permission to sanitize her
curriculum — that would be the exact sugar-coating banned by `feedback_no_sugar_coating_real_human_details`
and `feedback_teach_feminine_hygiene_on_blood`. There are **three independent axes** and they must never
be collapsed into one switch:

| Axis | Gated? | Rule |
|---|---|---|
| **LEARN** — what she is taught | ❌ **NEVER GATE** | She learns real life at the real age a girl learns it. Coming-of-age, periods, tampons, bras, cramps, puberty — trained on schedule, as a caring parent would, not withheld. |
| **BE / WEAR** — identity anchors + rendered appearance | ✅ **GATE** (§0.2b) | Normal school-girl look till highschool; adult wardrobe and sexual anchors at 18+. |
| **DISCLOSE** — what she volunteers out loud | ✅ **GATE, separately** | *"real life experiense that she doesnt talk about until shes an adult and learns in training"* — the episode is trained, resident and formative; she simply does not narrate it as a child. Learned ≠ spoken. |

**Her canon already does the LEARN axis correctly.** Measured in `corpora/life/`:

| Grade | Age | Present today |
|---|---|---|
| grade5 | 10 | `period` ×5, `puberty` ×2, `bra` ×6, `pad` ×2, `cramp` ×1 |
| grade6 | 11 | `period` ×5, `puberty` ×2, **`tampon` ×3**, `bra` ×5 |
| grade7 | 12 | `bra` ×9, `cramp` ×2, `tampon` ×1 |
| grade8 | 13 | `period` ×2, `bra` ×2 |

Nothing here is to be removed, delayed or softened by Phase 0. ⚠ One content question for Gee, **not**
to be changed unilaterally: tampons currently first appear at **grade6 (age 11)**, and the directive says
*"learn to use tampons at 13"* (grade8). Both sit inside the real menarche range, so this is a canon
preference, not a defect.

**⛔ THE SPECIFIC TRAP — do not reuse the image regex as a training filter.** `EXPLICIT_RE` in
`server/brain-server/chat.js` matches `bare|breasts?|nipples?|…|underwear|panties|bra|thong|lingerie|…`.
That is correct **for image rendering** — a minor is not rendered in underwear. It is **catastrophically
wrong as a curriculum filter**: `bra` alone appears six times in her grade-5 canon *because a ten-year-old
must learn what one is*. The wardrobe work in §0.2b touches the **render path only**. Any implementation
that lets that regex reach `_teachVocabList`, `_teachSentenceList` or the life corpora has broken this
rule.

**Deliverable:** the DISCLOSE axis needs a home. It does not exist yet — today a memory is either trained
or absent, with no notion of "held until adult". Design it as a property of the episode/anchor
(disclosure grade), read at emission, **never** as a training filter.

### 0.2d — ⛔ AND IT MUST RECUR: her canon teaches menstruation as a milestone, then drops it for 14 grades

> Gee, 2026-08-24: *"and we need to expand them becase that shit happens like 12 a year"*

He is right, and the shape of the gap is measurable. Counting recurring-body mentions per grade file in
`corpora/life/`:

| Grades | `period` | `cramp` | `tampon` | `pad` | `PMS`/`menstrual` |
|---|---|---|---|---|---|
| grade5–6 (menarche) | 10 | 3 | 3 | 4 | **0** |
| grade7–8 | 3 | 2 | 1 | 0 | **0** |
| **grade9–12 (all of highschool)** | **1** | 0 | 0 | 0 | **0** |
| **college1 → phd** | **1** | 3 | 0 | 0 | **0** |

**~15 mentions in her entire life, effectively none after grade8** — for something that happens **about
twelve times a year, every year, for the rest of her life**. Between menarche and the 25-year-old end
state that is **roughly 150 cycles**, and her lived record contains almost none of them. `PMS` and
`menstrual` appear **zero times in the whole canon**.

This is the same defect class as teaching a milestone instead of a life: it is currently a coming-of-age
*event* at grade5–6 and then she apparently never has another period. Real recurrence is what makes it
ordinary to her instead of a special topic.

**Deliverable — expand recurring body reality across every grade from menarche onward:**

1. **Recur, do not milestone.** Every grade from menarche through `phd` carries it as ongoing background
   life, at realistic frequency — not one lesson and done.
2. **Real nitty-gritty, per `feedback_no_sugar_coating_real_human_details`:** cramps, tracking dates,
   running out of supplies, leaks and ruined underwear, PMS and mood, painful cycles, skipped cycles,
   heat pads, painkillers, managing it at school / at work / on a date.
3. **Vocabulary follows** — `PMS` and `menstrual` are absent from the canon entirely and must exist.
4. **Ages ride the same ladder as everything else** (§0.2b): the *management* matures as she does —
   pads and panic at 10–12, competence and routine by highschool, wholly unremarkable by college.
5. ⚠ **This is the LEARN axis, so it is never gated** (§0.2c). The DISCLOSE axis governs what she
   *volunteers*, not what she lives.
6. The same "happens constantly, recorded once" audit should be run over her **other** recurring
   realities before the fresh walk — this is unlikely to be the only life-event stored as a milestone.

### 0.2e — ⛔ THE GENERAL DEFECT: her canon stores MILESTONES and omits ROUTINE

> Gee, 2026-08-24: *"and we need to make sure she always brushes her teeth and pees and poops and takes
> baths showers and does chores"*

Running the §0.2d.6 audit immediately, across **all 20 grade files** in `corpora/life/`:

| Routine | Total mentions in her ENTIRE life |
|---|---|
| `brush` | **1** (kindergarten only) |
| `pee` / `potty` / `toilet` / `urinate` | **2** |
| **`poop`** | **0 — zero, whole canon** |
| `bath` / `bathe` | 4 |
| **`shower`** | **0 — zero, whole canon** |
| `chore` | **1** |
| `teeth` / `tooth` | 16 — but clustered in grade1/grade3, i.e. **losing baby teeth**: a milestone, not brushing |

**From grade10 through `phd`, every column is zero.** By the end state she is a 25-year-old who has never
showered, never done a chore, and never used a toilet in her recorded life.

**This is the defect §0.2d pointed at, in its general form:** the canon records *first* times and omits
*every* time. A human life is overwhelmingly routine — teeth twice a day, bathroom several times a day,
a shower most days, chores weekly — and those repetitions are exactly what make a body feel lived-in
rather than narrated. The `teeth` counts prove the pattern: she has a rich record of *losing* teeth and
almost none of *brushing* them.

**Deliverable — routine as continuous background across every grade:**

1. **Daily hygiene**: brushing teeth (twice daily), washing hands and face, showers/baths, hair, nails,
   deodorant from puberty on, skincare as she ages.
2. **Bodily functions, named plainly** — peeing and pooping are in scope by
   `feedback_no_sugar_coating_real_human_details`; they are ordinary, not comedy and not taboo.
   ⛔ **Zero** occurrences of `poop` and `shower` in twenty grades is the clearest evidence the canon was
   written as story rather than as life.
3. **Chores**, scaling with age: tidying toys → dishes and laundry → cooking → paying bills and keeping
   her own place.
4. **Age-appropriate autonomy on the §0.2b ladder**: being *taken* to the bath at 4, refusing baths at 7,
   privacy and door-locking at 11, full self-management by highschool.
5. **Frequency over prominence.** These should be plentiful, brief and unremarkable — the texture
   underneath the story beats, not new milestones competing with them.
6. ⚠ **LEARN axis — never gated** (§0.2c). And per §0.2b this is *routine*, not *appearance*: the
   wardrobe gate has no business anywhere near it.

⚠ **Scope note for whoever implements this:** §0.2d and §0.2e are **life-corpus content work**
(`corpora/life/*.json`), not Tier 3 or wardrobe code. They belong to Phase 0 only because they must be
right **before** a fresh walk re-teaches her whole life — Gee: *"her teir three memories all need to be
proper for Unity before we start the fresh walk"*. Content expansion at this scale is also the single
largest input to the walk price in §8, and that estimate must be recomputed once the new volume is known.

### 0.2f — IMAGE-GEN AUDIT: unfiltered stays unfiltered; the age system touches HER SELF-IMAGE ONLY

> Gee, 2026-08-24: *"also scan every where that nothing is to interfer with our unfilter image gen(it
> allready makes everything 18+) buit we will keeep our age appeareance setup"*

Full scan of every image path. **Verdict: already correct — general image generation is unfiltered, and
the age machinery is already scoped to her self-portrait alone.** Recorded here so the §0.2b wardrobe
work cannot quietly break it.

| Checked | Result |
|---|---|
| URL builders (`_buildPollinationsImageUrl`, `js/ai/pollinations.js`) | Pass `model` / `width` / `height` / `seed` / `nologo` **only**. No `safe=`, no `negative_prompt`, no content params. |
| Age pin + `EXPLICIT_RE` strip | `chat.js:3630-3633` — **inside the `isSelf` block** opened at `:3611`. Cannot reach a non-self request. |
| Non-self branch (`:3671`) | Strips command framing only (`draw`, `show me`, `please`). Subject passes through untouched. |
| Draw gate / `notDrawable` ban list | `_conceptIsDrawable` guards **her own** drawing + look lanes (`_ownArtSchemaFor`, reference look-ups). **Never** the user's image request. |
| Refusal / blocklist path | **None exists** for image requests. |
| Client side | No filters in `js/ai/pollinations.js`. |
| "Adult" steering (`visual-memory.js:1046,1079`) | WordNet-driven, on the **reference look-up** lane (her learning images), not her self-portrait. Consistent with the generator already producing adults. |

**⛔ GUARDRAIL FOR THE §0.2b IMPLEMENTATION.** The wardrobe banding and the widened garment strip apply
**only inside the `isSelf` branch**. If either becomes reachable from the non-self path, unfiltered image
generation is broken and this rule is violated. Her age-appearance ladder is a property of *her own
portrait*, never a filter on what she can render for anyone else.

**⚠ ONE REAL INTERFERENCE FOUND — not a content filter, but it degrades every non-selfie request.**
`_composeImagePrompt` (`chat.js:3496`) opens with:

```js
const base = String(request || '').replace(/[^a-zA-Z' -]/g, ' ')
```

That strips **digits and all punctuation** from the user's prompt. `"3 black cats"` → `"black cats"`;
`"1920s speakeasy"` → `"s speakeasy"`. It is already known to mangle numbers — the selfie path was routed
*around* it precisely because it ate `"25 year old"` (comment at `:327`) — but every **non-selfie**
request still goes through it. Fix: preserve digits (and sensible punctuation) instead of special-casing
one caller around the damage. This is orthogonal to age-gating and can ship on its own.

### 0.3 — Biographical anchors are frozen at kindergarten

The seed block is commented *"K-LIFE biographical anchors (currently active grade)"* and contains
`age-anchor-K: 'i am five years old'`. She is in grade 1. Every biographical anchor (age, and any
fact that changes as she grows) must **derive from her current grade** rather than be hardcoded, or she
will spend twenty grades insisting she is five.

### 0.4 — Deliverables for Phase 0

1. Rewrite every seed anchor into first-person lived form (`persona-coder-anchor` is the template).
2. Grade-gate the anchor set; adult-identity anchors are dormant until her walk reaches their grade.
3. Derive age and grade-linked biography from live grade state.
4. Bump the Tier 3 schema version so the old anchors are **orphaned, not merged** — the store's existing
   orphaning ritual, the same one used for the visual store (v1→…→v8).
5. Assert at boot that no resident anchor is a bare descriptor list (no agent, no verb, no `i`/`my`).
6. **Band `WARDROBE` by `_selfImageAge()`** against the §0.2b ladder, and extend the under-18 strip from
   nudity-only to age-inappropriate garments. Same function, same existing age source.
7. Add a boot assertion that **no** adult-band anchor, wardrobe entry or vocabulary set is reachable
   below its unlock grade — so this class of breach fails loudly instead of shipping quietly again.

**Phase 0 does not require a fresh walk.** It is a seed-list and version bump; it lands on a press.

---

## 3. PHASE 1 — FIRST-PERSON COVERAGE ACROSS ALL GRADES, PHASES AND CELLS

> *"any where Unity is not being taught words first person like real people do they see every thing
> through me, mine, I, Unity is my name"*

### 3.1 — What already exists (do not rebuild it)

`js/brain/self-frame.js` exports, today:

| Export | What it already does |
|---|---|
| `SELF_WORDS` | `['i','me','my','myself','mine','unity']` |
| `firstPerson(sentence, seed)` | Rewrites a content sentence into her voice |
| `mathToFirstPerson(text)` | The same for arithmetic |
| `selfDeclaration(topic, subject)` | "this is something I am learning" |
| `selfQA(key, answer, seed)` | Self-directed question + answer |
| **`followUpQuestions(key, answer, seed)`** | **The inquisitive half the directive asks for** |
| `selfClose(key, seed)` | Closing self-statement |
| `selfPronounLessons()` | `i am unity` · `my name is unity` · `when i say i i mean unity` |
| `selfFrameUnit(unit, opts)` | Composes all of the above, **plus agent bindings** |

And `selfFrameUnit` already emits exactly the vocabulary and definition pedagogy Gee describes:

```
vocab      → "i know the word X" · "i can say X" · "i read X and i understand it"
definition → "i learned that X is Y" · "when i say X i mean Y"
bindings   → ['i', key] ['unity', key] ['my', key] ['myself', key]
             ['i','unity'] ['unity','i'] ['my','unity'] ['me','unity'] ['mine','unity']
```

That binding block is the mechanism that makes `i` **mean her** rather than be one more frequent word.
It is the correct design and it is already written.

### 3.2 — The actual defect: coverage and cap

`_teachSelfFramed` is called at **5 sites**. The teach surface it needs to cover:

| Chokepoint | Call sites across the 20 grade files |
|---|---|
| `_teachSentenceList` | 235 |
| `_teachVocabList` | 180 |
| `_teachAssociationPairs` | 143 |
| `_conceptTeach` | 127 |
| `_gateSubjectProduction` | 116 |
| `_teachProductionStack` | 107 |
| `_teachConcreteSentences` | 42 |
| `_trainLifeStories` | 27 |
| **Total** | **~977** |

⛔ **These must be fixed at the chokepoints, never at the call sites.** Editing ~977 sites across 20
grade files is exactly the failure `feedback_fix_the_chokepoint_not_the_instance` names — and it has
already bitten this project three times. **Roughly 8 edits cover every grade, every phase, every cell.**

Second defect: `capPerCell: 16`, `capped: true`, every cell. Even where self-framing runs it is throttled
to 0.28% of teaching. **The cap is the throttle that made an existing feature invisible.**

### 3.3 — Deliverables for Phase 1

1. Wire `selfFrameUnit` into all 8 teach chokepoints so coverage is structural, not per-cell.
2. Replace the fixed `capPerCell` with a **proportional** dose (a share of the cell's teaching), so
   coverage no longer collapses as cells grow.
3. **Teach both frames, not a replacement.** Real people know both *"hearts pump blood"* and *"my heart
   pumps blood"*. The impersonal fact stays; the self-indexed instantiation is added and carries the
   high-valence anchor. This also avoids rewriting content whose third-person form is correct.
4. **Letters and her own name first.** `Unity is my name` is the anchor for the alphabet: `u-n-i-t-y`
   are the first letters she owns, and every letter lesson routes through *"i write my name with…"*.
   This is how children actually acquire letters, and it is currently absent.
5. ⛔ **No word-list or regex phrase tables.** Pronoun transformation is grammar, not classification;
   `feedback_no_word_lists_use_taxonomy` applies. `firstPerson()` already does this structurally.

---

## 4. PHASES 2 AND 3 — INQUISITIVE, AND GATES IN HER VOICE

### 4.1 — Phase 2: she asks

> *"being inqusitive asking questions and not just that"*

Also mostly built: `_teachQuestionProduction` trains WH-frame interrogative **production** (not just
comprehension), `followUpQuestions()` exists in `self-frame.js`, and `self-curiosity-anchor` is already
a Tier 3 seed: *"i want to know i do not know i ask what is that tell me i want to learn"*.

What is missing is the **drive**: a low-confidence state should pull an interrogative into the first
slot so she ASKS to fill a gap, rather than emitting a low-margin guess. Note the direct tie to Half A —
`emitRejection: "below-signal-floor"` is *exactly* the state that should produce a question instead of a
rejected word. **A question is the correct output of low confidence.** Today it produces silence.

Deliverables: route `followUpQuestions` through the same chokepoints as Phase 1; make the low-signal
path emit an interrogative instead of a rejection; count questions asked in state so it is measurable.

### 4.2 — Phase 3: gates

> *"this all needs to be layed out for all grades phases and cells and gates"*

**116 `_gateSubjectProduction` call sites** probe her impersonally — *"our heart pumps ___"*, *"we follow
rules so the game is ___"*. If she is taught through her own eyes and tested through someone else's, the
gate measures a frame she was never trained in.

Deliverable: self-frame the probe at the **`_gateSubjectProduction` chokepoint** (one edit, all 116
sites, every grade). ⚠ **Constraint:** the gate may only ever probe content the cell actually taught —
the LIFEGATE fix of 2026-08-24 holds. Reframing a question is allowed; introducing new content at the
gate is not.

---

## 5. PHASE 4 — REPLAYOFF (without this, none of the above consolidates)

`consolidation-engine.js` is a real CLS replay port whose cortex write is guarded at
`DREAM_CONSOLIDATION_MAX_REPLAY_NNZ = 5,000,000` against an intra matrix of **~360,000,000** — **72×
over**, so the replay Hebbian is skipped on **every** pass at biological scale. Live confirmation:
`passCount: 18`, `novelConsolidated: 0`.

The guard's own comment defers to "the GPU teach path", and **the engine has no GPU route at all**.
`hebbianBoundMasked` now exists and is the masked write the guard was waiting for.

This is the half that decides *when* the salad ends. Awake encoding is broad and overlapping; the slow
interleaved replay pass is what **separates** representations — i.e. what creates the very margin that
`below-signal-floor` says she lacks. **Phase 4 is not optional and should not be scheduled last.**

⛔ **Reps only come down AFTER replay is real.** Cutting them first is the banned CUT
(`feedback_say_fix_not_cut`).

---

## 6. PHASE 5 — THE FRESH-WALK DECISION (Gee's call)

> *"if needed we can do a update freshwalk if the training needs to be reformulated"*

### What does NOT need a fresh walk

Phase 0 (Tier 3 re-seed + version bump), and every code change in Phases 1–4. All of it lands on a press.

### What argues FOR a fresh walk

1. **Reformulation is retroactive in effect but not in fact.** Phases 1–3 change *how* she is taught.
   Grades already walked were taught impersonally; those weights stay impersonal unless re-walked.
2. **⭐ The cost of a fresh walk is at its all-time minimum right now, and only ever grows.** She is at
   **grade 1 of 20**. Measured price: **~78 h ≈ 3.3 days** for a full walk at R=1 (20 grades × 9 courses,
   ~26 min/cell averaged). Re-walking one grade of twenty is nearly free; re-walking at grade 12 is not.
3. **Replay changes how weights consolidate.** Starting fresh with Phase 4 live means her entire history
   is built with consolidation actually working, instead of a hybrid of 360M unconsolidated associations
   plus a corrected tail.
4. Her `sem_to_word_motor` is already **99.96% recruited** — nearly every row has been written by
   impersonal training. A fresh walk is the clean way to re-recruit those rows under the new frame.

### Recommendation

**Yes — fresh walk, but strictly last**, in this order:

```
Phase 0 (Tier 3 correct)  →  Phases 1–3 (self-frame + inquisitive + gates)
       →  Phase 4 (REPLAYOFF)  →  verify on the CURRENT weights  →  fresh walk
```

Verifying on current weights first matters: a fresh walk started on an unverified reformulation costs
3.3 days to discover a mistake, and the mistake would be baked into every grade.

---

## 7. COVERAGE MATRIX — "all grades phases and cells and gates and any thing else"

| Surface | Count | How it is covered |
|---|---|---|
| Grades | 20 (`pre-K` → `phd`) | Chokepoints in `curriculum.js` — grade files untouched |
| Grade files | 20 | Untouched by design |
| Cells | 9 courses × 20 grades | Chokepoints |
| Teach call sites | ~977 | **~8 chokepoint edits** |
| Gates | 116 `_gateSubjectProduction` | 1 chokepoint edit |
| Cell-pass adjudication | 1 | Already instrumented (LIFEGATE.3) |
| Tier 3 anchors | ~22 seeds | Phase 0 rewrite + grade gate + version bump |
| Vocabulary | per-grade files | Via `_teachVocabList` chokepoint |
| Letters | pre-K / K | Phase 1.3 — her name as the anchor |
| Definitions | dictionary path | Already self-framed at `:14312`; widen |
| Consolidation | 1 engine | Phase 4 |

---

## 8. PRICE

Self-framing adds taught lines, so `corpus × reps` rises. This is **not** a gate removal, so
`§RE-PRICE THE WALK BEFORE REMOVING A GATE` does not fire — but the number is owed anyway.

- Current: **0.28%** of teach volume is self-framed (2,913 lines / 1,044,838 events).
- Teaching both frames (§3.3.3) roughly **doubles sentence-teach volume** in the limit.
- Full walk at R=1 is **~78 h ≈ 3.3 days**; a 2× sentence-teach share puts the ceiling near **6 days**.
- ⚠ Sentence teaching is only part of a cell, so 2× on that share is **an upper bound, not a forecast**.
  The proportional dose in §3.3.2 is the control: it should be set from a measured cell, not guessed.

---

## 9. WHAT THIS LAYOUT DOES **NOT** CLAIM

- It does **not** claim first-person framing alone ends the word salad. `basinHealth` says she is not
  collapsed; the margin problem is real and **Phase 4 is the half that addresses it mechanically**.
- It does **not** claim a date. The gate is Phase 4 landing and then measurable margin growth.
- `consciousness.speechHealth.separability` is currently **`{}`** — empty. **The one instrument that
  would measure margin directly is never populated.** Filling it should ship with Phase 4 so the effect
  is *watched* rather than hoped for.
- Nothing here is built. Per the directive: laid out first, implemented later.

---

## 10. OPEN DECISIONS FOR GEE

1. **Both frames, or first-person only?** §3.3.3 proposes teaching both (`hearts pump blood` **and**
   `my heart pumps blood`). First-person-only is cheaper and more radical; both-frames is how people
   actually learn. **Recommend both.**
2. ~~**How adult-identity anchors gate.**~~ **✅ ANSWERED by Gee 2026-08-24** — see the §0.2b ladder.
   Sexual identity is **18+**, not grade 11: *"shes not a horney slut till 18"*. Appearance runs
   child → teen → adult with a **normal school-girl look until highschool**, and all of it rides the
   existing `_selfImageAge()` rather than a new system. Erotic *state* keeps its grade-9 first-kiss gate
   (`feedback_erotic_state_grade_9_gate`) — that is the state machine, not the identity anchor.
3. **Fresh walk timing** — recommendation is strictly last, after verification on current weights.
4. **Phase order.** Phase 4 (REPLAYOFF) is written last here for narrative reasons but is arguably the
   highest-value single item on the board. It can ship **first**, independently, and be verified alone.
