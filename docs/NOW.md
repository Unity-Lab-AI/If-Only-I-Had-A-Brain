---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it, or a harness result named as one. Nothing here is recalled.
status: verified
sources:
  - js/brain/speech-readout.js
  - js/brain/cluster/emit.js
  - js/brain/cluster.js
  - js/brain/curriculum.js
  - js/brain/curriculum/kindergarten.js
  - js/ui/mind-moments.js
  - js/ui/brain-3d.js
  - server/brain-server.js
  - server/brain-server/state.js
  - html/dashboard.html
verified-scope: |
  OVERWRITTEN 2026-11-27 (14:48). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-27, 14:48

## Where she is

| | |
|---|---|
| state | **THE OLD BUILD IS STILL WALKING, AND IT CANNOT SPEAK.** Boot `42c7bbc4` (2026-11-26 19:18), same boot, never restarted. Passed `ela/pre-K` (~10:29, after 54,208 s) and `math/pre-K` (~12:19, after 6,590 s); now in `science/pre-K` |
| what those passes mean | both passed on **completion**, not on answers: speaking score **0/10** and **1/10**; math's comprehension check skipped all 12 of its questions. Asked "hi! what is your name?" at 12:44 she said **"Writing."** (62.1 s) |
| her thoughts | every inner thought since boot is ~12 unrelated words from the same small set; each takes 20–600 s (last two read: 62 s, 192 s) |
| size | `totalNeurons` 199,728,759 (this boot) |
| cards | the local RTX 4070 Ti SUPER alone (`donorCount` 1). The rented card ran out of money at ~08:52 and is gone |
| the fix | **written, verified off the card, NOT running.** It is uncommitted in the working tree. It changes what she is taught, so it needs a **fresh walk** — the walk above keeps teaching the old way until it is stopped |
| watch | stopped (on request) until the fix is running |

## Why she could not speak — measured, with her own stories

Every spoken word went through one projection, `sem → word_motor`. Rebuilt in a model with the production embedding code: **38 of 3,401 taught transitions recalled (1.1 %), eight words taking 66.9 % of wins.**

| Fault | Measured |
|---|---|
| the state she spoke from barely changed between sentences | two unrelated sentence starts shared 64.7 % of their lit dimensions; 0.94 % of sem cells were lit because of her last word |
| a word slot could not read it | 24 cells × 6 fixed wires; ~1.4 wires read her last word's identity |
| the learning rule overwrote a word each time it was taught | 100× the wiring still recalled 19.9 % |
| the "identity" part of a word's code did not identify | 713 of 905 words shared it with another word |

## What is in the working tree (verified by running it, not yet by a walk)

| | |
|---|---|
| **speech readout** | `js/brain/speech-readout.js` — a sparse state of non-overlapping parts, every word slot reads every unit, "teach until she says it". Production module: **92.9 %** recall of 13,580 taught transitions after four visits (64.4 % after one) |
| **the real lessons, end to end** | real cluster + curriculum on a 60,000-cell cortex, no card: naming **400/400**; sentence order **93 %** already right on pass 3; "what is your name?" → **"My name is unity."**; question→answer binder "what color is grass?" → "Green."; **2.1 ms** a reply; save → restore answers the same |
| **one way to teach speech** | every speech lesson reaches one rule through two doors; sentence and reply ends are taught, so a line stops |
| **the old path is removed** | the `sem ↔ word_motor` card matrices are gone (14 cross-projections); weights format 6 → 7, so earlier saves are refused |
| **saved with her** | `brain-weights.speech` — written with the weights, copied into each checkpoint slot, restored, rolled back and wiped with them |
| **honest gates** | the gates' speaking tests read where she speaks from; the "THINK n/n" on three gates was the sample size and is removed |
| **dashboard** | Speech Health shows taught steps / already said / corrections in place of a number that was the boot-time copy of a card matrix |
| **pop-ups** | everything that is not her inner voice is now a paced plain sentence (`js/ui/mind-moments.js`): at most one every 25 s, the same kind once per 3 min, nothing when nothing happened. The label, field-name, decimal and every-5-seconds filler pop-ups are deleted |

## Open

- **Not measured: a walk.** Everything above was measured in a model and in the real lessons on a small cortex with no card. The numbers to read on the next walk are each speech lesson's "said before being corrected" share and the gates' TALK lines.
- **Not booted.** The server changes (speech file save/restore, format 7, the size estimator) pass a syntax check and have not been run.
- **The sentence gate counts exact next words**, so a sentence start with several taught continuations reads as a miss when she says a different taught one: 76.8 % on the same run where the lesson itself read 93 %.
- **Dropped teach updates:** 11,356 of 707,421 on the old build (the pattern lane's 16 MB cap). Unchanged by this work except that the speech lessons no longer send frames; re-read on the next walk.
- **Thoughts were slow on both cards** (62 s and 192 s just now on the local one). The readout removes the card round trip from every spoken word; whether that is the whole delay is unmeasured until it runs.
