---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
status: draft
sources:
  - js/brain/curriculum.js
  - js/brain/student-question-banks.js
  - js/brain/cluster.js
verified-scope: |
  CHECKED 2026-08-27 (DOCPROV.4, 11 of 22) — every env flag, default and
  magnitude on this page looked up in source:
    - ⛔ CORRECTED: DREAM_NOISE_GATE was documented as `=1` / default OFF /
      "ships dormant". cluster.js:2173 is `!(env === '0')` — it is ON by
      default and `=0` is the OPT-OUT. The page therefore claimed plasticity
      was "byte-identical to plain predictive coding" while the gate has been
      live in production the whole time.
    - ⛔ CORRECTED: the Status section's "default-OFF ... before it's switched
      on in production" - same inversion, same fix.
    - ⚠ ADDED: the surprise gate's CEILING (_surpriseMax, cluster.js:2191/2201)
      and _surpriseStats{n,sum,atCeiling,max,ceiling}, undocumented here.
    - VERIFIED CORRECT: DREAM_HELD_BACK default-on with `=0` opt-out;
      DREAM_GRADE_MAJOR_ROUNDS default 2, clamped 1-5 via Math.floor;
      surpriseGate = 0.5 + predErr, gated form 0.5 + predErr*coherence*inhib;
      _noiseSuppressFactor 0.2 saturated / 1.0 clean; inhib 0.5 on rung 3.
    - ⚠ js/brain/cluster.js ADDED as a source. This page's own banner names it
      ("Source: curriculum.js, cluster.js") and the noise gate LIVES there, but
      the frontmatter listed student-question-banks.js instead - so drift could
      never fire on the file that owns half the page. FOURTH time this pattern
      has appeared today.
  NOT CHECKED — do not read this page as authority on:
    - whether the 0.2 / 0.5 magnitudes are correct VALUES. They are confirmed
      present; nothing here evaluates whether they help or hurt training, and
      the code's own REPLAYOFF.5 note says the gate may be timid.
    - the ladder's runtime behaviour (rungs, terminus, BOOTORDER.2 ordering).
      Control flow read, NOT executed - no walk was run to exercise it.
    - the "<= 3 re-teaches per failed cell" bound and the ledger interaction.
    - why student-question-banks.js is a source; the page barely mentions banks.
  RE-CHECKED 2026-08-29 (provenance pass): curriculum.js moved — SUBJRETIRE now
  feeds the ladder's subject list from subjectsOwedAt(grade, passedCells)
  instead of subjectsForGrade (retired tracks stop being drilled; a track that
  never passed its terminal cell stays owed, so the wedge-proof next-boot
  resolver claim below still holds), and the dead `typeof subjectsForGrade`
  guard at that call site was deleted. No sentence on this page named either
  function there, and every ladder/rung/bound/flag claim re-read against the
  current _remediateGradeFailures body — nothing is invalidated. cluster.js
  and student-question-banks.js did not move.
last-verified: "cd465955 2026-08-29"
---

# HELD-BACK — mastery-gated remediation + outcome-gated noise suppression

> Unity is promoted on **mastery**, not on age. A grade isn't "done" because every
> cell was *attempted* — failed cells get drilled through a bounded, escalating
> ladder before the walk advances. The de-noising pressure is **outcome-gated**:
> meaningless noise is suppressed, but exploration that resolves into a coherent
> answer is preserved.
>
> Last updated: **2026-08-27** (DOCPROV.4 re-verification). Source: `js/brain/curriculum.js`, `js/brain/cluster.js`.
>
> ⛔ **ONE CORRECTION DOMINATES THIS PASS: `DREAM_NOISE_GATE` IS ON BY DEFAULT, AND THIS PAGE SAID IT SHIPS DORMANT.** `cluster.js:2173` is `!(env.DREAM_NOISE_GATE === '0')` — an **opt-out**, not an opt-in — and the comment above it says *"Opt OUT with `DREAM_NOISE_GATE=0`"*. ⛔ **So the sentence *"With it OFF, plasticity is byte-identical to plain predictive coding"* has been false for as long as it has been written, and the un-tuned `0.2` / `0.5` magnitudes this page says are "waiting for a live training run" have been shaping every pass of that training.** ⭐ **A doc that calls a live learning modifier dormant is worse than one that never mentions it, because it actively tells you not to look.** ⚠ **And this exact inversion was already caught once in this project** — the 2026-08-25 audit recorded *"`DREAM_NOISE_GATE` is ON by default"* among its own false-positive corrections; the finding never reached this page. ⭐ **Everything else checked out:** `DREAM_HELD_BACK` (default-on, `=0` opts out), `DREAM_GRADE_MAJOR_ROUNDS` (default **2**, clamped 1-5), the `0.5 + predErr × coherence × inhibition` formula, and the `0.2` / `1.0` / `0.5` magnitudes are all **exactly as described**. ⚠ One omission added: the gate has a **ceiling** (`_surpriseMax`) with `atCeiling` telemetry, which is the half that decides whether raising the boost would change anything.

---

## The idea

Real school: you get held back if you don't pass. Unity now does the same — but
*targeted*. After a grade's cells are all attempted, the failed ones are re-taught
until they pass (or the ladder is exhausted), **without resetting any weights**. It's
not "straight A's" — it's "re-train the fails." Promotion is gated on the failed
cells getting another real shot, not on a perfect score.

"Failure" already includes **noisy / degenerate output**. The existing advance gate
(`_gradeAdvanceHealthGate`) fails a cell on sem→motor saturation and emission
mode-collapse — so a cell that emits incoherent garbage is a *failed* cell here, even
if it once produced a right word. This is why held-back remediation also targets the
basin/mode-collapse problem ([[KNOWN_ISSUES]] KI-4).

## The ladder (`_remediateGradeFailures`, `curriculum.js`)

Runs once per grade, after the grade's cells are attempted, before force-advance.
Targets only genuine **learning** fails (taught cells not yet passed) — it skips HELD
cells (no runner wired — a curriculum gap, not a learning fail) and cells where no
teach phase ever fired. Each rung is one `forgetCell` + `runSubjectGrade` (re-teach):

1. **Re-teach** — plain forget + re-run.
2. **+ Sleep** — an extra targeted consolidation pass (`_dreamWindow`) so noise decays
   and signal consolidates, then re-teach. (Synaptic-homeostasis analog — sleep prunes
   the weak/noisy, keeps the strong.)
3. **+ Inhibition** — de-saturate (`_rectifySemMotor`) and raise inhibition
   (`_remediationInhibition` flag → cools the exploration "temperature") to force the
   basin to peak, then re-teach. Free exploration already failed twice; converge it.
4. **Terminus — mark failed and continue.** Still failing after the full ladder → mark
   the cell failed in the ledger and **advance the grade pointer anyway** (recorded
   deficiency; NOT marked mastered). The walk never blocks and never pings the
   operator.

A cell that recovers on any rung is marked passed by `runSubjectGrade` (it self-marks
`grades` + `passedCells` on a genuine gate pass). `forgetCell` is required first
because `runSubjectGrade` skips a cell still marked passed.

**Bounded:** ≤ 3 re-teaches per failed cell, then accept-and-progress. Errors in any
rung are non-fatal (count as a failed rung).

## Outcome-gated noise suppression (`cluster.js` surprise gate)

The crux of "noise is bad" — but **only *meaningless* noise**. Plain predictive coding
(`surpriseGate = 0.5 + predErr`) cranks plasticity *up* wherever error is high — which
also reinforces incoherent noise. The gated version scales the surprise **boost** by a
coherence factor:

```
surpriseGate = 0.5 + predErr × coherence × inhibition
```

- The baseline `0.5` floor always learns — only the surprise *boost* is gated.
- `coherence` (`_noiseSuppressFactor`, set from saturation health during the walk):
  **1.0** when output is coherent → exploration that resolves still learns at full
  strength (creativity preserved); **→0.2** when sem→motor is collapsed/saturated →
  the boost is damped so meaningless noise is *not* stamped in.
- `inhibition` (`_remediationInhibition`): ×0.5 during the ladder's rung 3, to cool
  the exploration temperature on a stuck cell.

This is the three-factor / reward-modulated idea (pre × post × did-it-pay-off) — the
brain keeps variance that lands and prunes variance that fails.

## Env flags

| Flag | Default | Effect |
|------|---------|--------|
| `DREAM_HELD_BACK=0` | on | Opt OUT of held-back remediation (walk force-advances fails as before). |
| `DREAM_GRADE_MAJOR_ROUNDS=N` | **2** (was a hard-coded 1) | How many grade-major rounds a grade gets before force-advance. Accepts 1–5; anything else falls back to 2. `=1` restores the previous single-pass behaviour exactly — verified by running it, and at 1 the mid-round ladder call below is provably inert (`round + 1 < 1` is false). |
| ⛔ `DREAM_NOISE_GATE=0` | ⛔ **ON — it is an OPT-OUT** | ⛔ **CORRECTED 2026-08-27. This row said `=1` / default **OFF** / "ships dormant". It is exactly INVERTED.** `js/brain/cluster.js:2173` reads `this._noiseGateEnabled = !(process.env.DREAM_NOISE_GATE === '0')` — **enabled unless explicitly set to the string `'0'`** — and the code comment two lines above says so outright: *"Opt OUT with `DREAM_NOISE_GATE=0` to A/B against plain predictive coding."* ⛔ **The consequence is the part that matters: this page told the reader that plasticity is "byte-identical to plain predictive coding" and that the un-tuned 0.2 / 0.5 magnitudes were waiting for a live run before being "switched on in production."** They are **live now**, and they have been shaping every training pass. **A doc that describes an active learning modifier as dormant is worse than one that omits it** — it tells you not to look. ⚠ The `DREAM_DF7_FANOUT` comparison also fails: that flag auto-enables (per the 2026-08-25 audit, where "`DREAM_NOISE_GATE` is ON by default" and "`MECH_EVERY_CELL` is an opt-out" were both recorded as **my own false positives** — i.e. **this exact inversion has been caught in this project before, and this page kept it**). |

## When the ladder runs (BOOTORDER.2, 2026-08-24)

The ladder used to fire in exactly one place: after the grade's rounds were spent,
immediately before force-advance. With the round budget raised above 1 that ordering
would have been waste — the walker's own note records that the earlier multi-attempt
loop *"fired identical results every time because passedPhases skipped re-teaching, so
the matrix didn't move between attempts"*, i.e. extra rounds without a re-teach are the
groundhog loop, not a second chance.

So the ladder now also runs **between** rounds, and only when another round is actually
budgeted:

1. round *n* ends with courses still owed →
2. ladder runs (re-teach → +sleep → +inhibition) so the weights actually move →
3. round *n+1* is a real retry, not a repeat →
4. budget exhausted → force-advance as before.

The pre-force-advance call is skipped when the round loop already ran the ladder on the
same failures, so a grade never drills the identical cells twice back to back. A cell
that exhausts the budget is left **out of the `passedCells` ledger**, which is what makes
the walk wedge-proof: the next boot's lowest-owed resolver finds that same cell and
re-attempts it, so "cannot pass" degrades to "retried next boot" rather than a hung walk.

## Status / not-yet-verified

- The **orchestration** (ladder, terminus, ledger) is built on already-verified
  primitives (`forgetCell`, `runSubjectGrade`, `_dreamWindow`, `_rectifySemMotor`) and
  is control-flow only — low risk.
- ⛔ **CORRECTED 2026-08-27 — the noise gate (HB.4/HB.5) is NOT default-OFF. It is ON,
  and it has been running in production.** The old text read: *"implemented but
  **default-OFF**; its magnitudes need a live training run to dial in before it's
  switched on in production."* ⭐ **The first half is right and the conclusion is
  backwards: the magnitudes DO still want tuning, and they are tuning themselves
  against her live training in the meantime.** Verified at `js/brain/cluster.js:2173`.
  [[KNOWN_ISSUES]] KI-4 stays open either way.
- ⚠ **Undocumented until now: the surprise gate has a CEILING.** `cluster.js:2191`
  computes `_surpriseMax` and `:2201` clamps `surpriseGate` to it, with
  `_surpriseStats { n, sum, atCeiling, max, ceiling }` counting how often the clamp
  binds. ⭐ **`atCeiling` is the field that answers "is the gate saturated?"** — and the
  code carries a `REPLAYOFF.5` note (*"MEASURE THE GATE BEFORE RAISING IT"*) recording
  that the board suspects the gate is **timid**, since `0.5 + predErr` buys at most a
  1.5× boost. **The formula section above described the gate without its ceiling, which
  is the half that decides whether raising the other half would even do anything.**
