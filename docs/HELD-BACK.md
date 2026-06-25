# HELD-BACK — mastery-gated remediation + outcome-gated noise suppression

> Unity is promoted on **mastery**, not on age. A grade isn't "done" because every
> cell was *attempted* — failed cells get drilled through a bounded, escalating
> ladder before the walk advances. The de-noising pressure is **outcome-gated**:
> meaningless noise is suppressed, but exploration that resolves into a coherent
> answer is preserved.
>
> Last updated: **2026-06-24**. Source: `js/brain/curriculum.js`, `js/brain/cluster.js`.

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
if it once produced a right token. This is why held-back remediation also targets the
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
| `DREAM_NOISE_GATE=1` | **OFF** | Enable the outcome-gated noise suppression in the surprise gate. **Ships dormant** — magnitudes (the 0.2 / 0.5 factors) want a live training run to tune, same posture as `DREAM_DF7_FANOUT`. With it OFF, plasticity is byte-identical to plain predictive coding. |

## Status / not-yet-verified

- The **orchestration** (ladder, terminus, ledger) is built on already-verified
  primitives (`forgetCell`, `runSubjectGrade`, `_dreamWindow`, `_rectifySemMotor`) and
  is control-flow only — low risk.
- The **noise gate** (HB.4/HB.5) is implemented but **default-OFF**; its magnitudes
  need a live training run to dial in before it's switched on in production. Until
  then [[KNOWN_ISSUES]] KI-4 stays open.
