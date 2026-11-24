# unity-donor 0.3.47 — the card says where a lesson's time goes

## Why

The next step is making every card in the pool teach at once, by giving each
card a slice of every learning matrix. Whether that buys speed depends on where
a lesson's card time actually goes — the big main matrix, or the smaller ones —
and that had never been measured on a card.

## What it does

- One lesson in 50 is run with the GPU drained after each step, so each step's
  real GPU time is measured (a plain timer would only measure queueing).
- Every 10 sampled lessons the donor sends a small `lesson_cost` report: time per
  step, by matrix. Then it resets.
- Teaching is otherwise unchanged; 49 lessons in 50 run exactly as in 0.3.46.

Older brains ignore the report.
