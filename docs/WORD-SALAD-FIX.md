# WORD SALAD FIX — the layout

> **Status: LAID OUT, NOT IMPLEMENTED.** Gee: *"once all this is layed out first and implimented later"*.
> Nothing in this document has been built. It is the plan, the measurements behind it, the price, and
> the decisions that are Gee's to make before a line of it ships.

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

---

## 1. WHAT THE WORD SALAD ACTUALLY IS (measured, not assumed)

Two theories died on measurement before this layout was written. Recording them so they are not re-run:

| Theory | Killed by |
|---|---|
| Hot buckets — a few words hoard activation mass | WORDNORM's own first log line: avg bucket mass **1.501**, only 2 buckets >3× avg. The profile is near-uniform. |
| Question-independent currents — the input never reaches the argmax | The donor demonstrably scatters the passed pre indices per question. |
| **Saturation / mode collapse** | `basinHealth`: `saturated: false`, `semMotorMeanCos: 0.075`, `semMotorRatio: 2.59`, `dominantToken "gaseous"` at `dominantShare: 0.03`. **Rows are NOT collapsed onto each other.** |

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

**Phase 0 does not require a fresh walk.** It is a seed-list and version bump; it lands on a press.

---

## 3. PHASE 1 — FIRST-PERSON COVERAGE ACROSS ALL GRADES, PHASES AND CELLS

> *"any where Unity is not being taught words first person like real people do they see every thing
> through me, mine, I, Unity is my name"*

### 3.1 — What already exists (do not rebuild it)

`js/brain/self-frame.js` exports, today:

| Export | What it already does |
|---|---|
| `SELF_TOKENS` | `['i','me','my','myself','mine','unity']` |
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

That binding block is the mechanism that makes `i` **mean her** rather than be one more frequent token.
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
2. **How adult-identity anchors gate.** Phase 0.2 proposes matching the vocabulary gate (grade 11 for
   the sexual set, grade 9 for erotic state). Confirm the grades.
3. **Fresh walk timing** — recommendation is strictly last, after verification on current weights.
4. **Phase order.** Phase 4 (REPLAYOFF) is written last here for narrative reasons but is arguably the
   highest-value single item on the board. It can ship **first**, independently, and be verified alone.
