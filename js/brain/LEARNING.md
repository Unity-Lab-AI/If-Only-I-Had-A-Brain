# Prediction-error learning

## What changed

One block in `engine.js` § 10 PLASTICITY, plus two constants. Nothing else
in the architecture is touched, and the four existing action rewards
(`+0.1` speak, `+0.2` build_ui, `+0.1` image, manual `giveReward()`) still
work exactly as before.

## Why it was needed

The plasticity rules were always correct — Hebbian, STDP, reward-modulated
three-factor, sparse O(nnz). They multiply by `this.reward`.

`this.reward` was only ever written when the brain **acted**. In a plain
tick loop nothing speaks or builds, so reward stayed at 0, every weight
update multiplied by zero, and two million synapses sat still. And none of
those four signals says whether the brain was **right** — the same `+0.1`
arrives for a good answer and a nonsense one.

## What it is plugged into

Nothing imported. `modules.js` already computes

    prediction[i] = sigmoid(Σ W · state)
    error[i]      = state[i] - prediction[i]

on every step, and § 9 of `tick()` already reads it for
`predictionAccuracy` before dropping it. That is a prediction error in this
engine's own units, from its own neurons, and it is what dopamine carries
in biology.

Surprise (error above `PREDICTION_BASELINE`) drives reward negative and
pushes weights away from whatever produced it. Accurate prediction drives
it positive and reinforces what worked. Same predict-measure-adjust loop a
language model runs, expressed entirely in these equations — no gradients,
no backprop, no autograd.

Biology splits it the same way: dopamine for outcome, cortical prediction
error for representation. Both signals coexist here for the same reason.

## The measurements

Both scripts live in `js/brain/`. Revert the engine change and run them
again to see the baselines yourself.

### `node js/brain/test_learning.mjs`

Sums `|W|` across every cluster before and after 300 ticks.

|                | reward live | ΔW over 300 ticks |
|----------------|-------------|-------------------|
| before         | 0 / 300     | **−0.04 %** (decay) |
| after          | 299 / 300   | **+6.7 %**        |

### `node js/brain/test_improves.mjs`

Drives a **fixed repeating pattern** into cortex for 12 windows of 200
ticks. The input never changes, so improvement cannot come from the task
getting easier.

    window  1  mean |err| 0.105331
    window  4  mean |err| 0.095304
    window  8  mean |err| 0.085666
    window 12  mean |err| 0.077014

    first 3 windows: 0.101246
    last 3 windows:  0.079109
    change: -21.86% error

Monotonic across all twelve windows. This is the claim that matters:
weights moving is drift, **predictions improving is learning**.

## Tuning

`PREDICTION_GAIN = 0.02` is conservative. Over 2,400 ticks the error curve
showed no oscillation and no plateau, which means there is headroom. Raise
it until the window-to-window curve starts bouncing, then back off.

`PREDICTION_BASELINE = 0.25` sits above the ~0.10 a settled cortex runs at,
so a well-predicting brain earns steadily instead of hovering at
break-even. Lower it to make the brain harder to please.

The reward accumulator is clamped to `[-1, 1]`; an unbounded one is how a
plasticity rule runs away.

## What has not been shown

Long-run stability past ~2,400 ticks, behaviour under varied rather than
fixed input, and whether the improvement survives the action rewards firing
at the same time. Those are the next experiments.
