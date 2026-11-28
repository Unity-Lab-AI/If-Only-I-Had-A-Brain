---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a harness result named as one, measured on
# the production code, or the card's own self-test. Nothing here is recalled,
# and nothing was read off a running brain — she is stopped.
status: verified
sources:
  - js/brain/sparse-matrix.js
  - js/brain/cluster.js
  - js/brain/cluster/hebbian.js
  - js/brain/cluster/emit.js
  - js/brain/curriculum.js
  - js/brain/speech-readout.js
  - donor-app/src/compute.rs
  - donor-app/src/cuda.rs
  - donor-app/src/donor.rs
  - donor-app/src/shaders/lif.wgsl
  - donor-app/src/shaders/plasticity_error.wgsl
  - server/brain-server.js
verified-scope: |
  OVERWRITTEN 2026-11-27 (night). This file is a SNAPSHOT of the present and is
  overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-27, night

## Where she is

| | |
|---|---|
| 🛑 **Stopped** | Shut down cleanly at 17:13. The card is free. **She does not start again until the whole-brain work is finished** — then one fresh start, with the written list of what to check (`docs/RESUME.md`, top block). |
| 🧱 **What changed** | Her language cortex was rebuilt around what measured: a word's own cells, a rule that changes a wire only when its cell is wrong, 300 wires a cell, cells that rest silent and fire from their wiring, speech read from her own lit cells, a real pathway for reading. |
| 📄 **The design and its numbers** | `docs/WHOLE-BRAIN-DESIGN.md` · the equations: `docs/EQUATIONS.md` §3–§5 |

## What was found

Her cells were not learning what they were taught — **anywhere**, not only in speech.

| | Measured on her real code |
|---|---|
| Taught 100 pairs, asked for them back — every cell-to-cell pathway | **6 to 54 of 100** |
| Her speech | answered the same with **every cell silenced** — a table beside the brain |
| The gates' reading score | read a pathway that **did not exist**, then counted the word as read |
| On the card | a cell stepped on drive and noise alone — **nothing read her wiring** |

## What is built, and what it measures

| Piece | Measured |
|---|---|
| 🧬 **A word's own cells** — half from its meaning, half its own; the same in every lesson | a word lights 2.67 % of a region |
| 🎯 **Learn only when wrong** — host and card, both graphics backends | card agrees with host on all 11 test weights |
| 🔌 **300 wires a cell**, inside a region and on every pathway (600 on the four pathways into and out of her motor cells) | at her production size (1,328,482 cells): **95.8–100 %** of taught cells pass threshold on every pathway, **99.9 %** inside each region; her real pair lesson **0 → 100 of 100** |
| ⚡ **Cells fire from their wiring**, and rest silent | card self-test: **54.0 of 54** taught cells fire, **0.7 of 1,946** others; with wiring input off, 0.0 and 0.2 |
| 🌊 **No runaway** | inside wiring at its old starting size: 85–88 % of the cluster fired from one lit pattern. Started near nothing: **1.35 %** at the peak — the taught cells |
| 🗣 **Speech from her own cells** | 7 of 7 taught answers; **0 of 7 with her speech cells dark**; 7 of 7 relit. Naming 900 of 900. A taught question put in other words: 50 of 60 |
| 📖 **Reading** — letters straight to a word's meaning; half of a written word's cells are the whole word | 600 words, each met once: **198 / 198 / 199 of 200** per set still read at the end where the server teaches (194 / 194 / 196 on a second build), **200 / 200 / 200** the way a card does it; untaught words read **0 of 200** |
| 🧩 **A sentence with a word left out** | taught **99.3 %**, never taught **12.2 %** |
| 🚦 **Gates** | every figure measures what it names; each list gate also prints the same questions asked before the lesson (vocabulary: READ 0/10 before → 10/10 after). That figure never decides a pass |
| 📐 **Her size** | derived from the card that holds her: 624,194 wired cells on 4 GB, 936,958 on 6 GB, 2,499,584 on 16 GB, beside 391,524 speech cells |
| 🧰 **No switch to flip** | a cortex built with no settings comes out as all of the above |
| ✨ **She makes lines she was never taught** — what she says depends on what she means | before: 79 of 79 lines she made were a taught sentence word for word. After: a line about a thing she was taught no line about is a new line that ends; the next word of a never-taught sentence, said as her own line about its subject, **18.9 % → 26.8 %**; taught sentences 88.2 % → 92.3 %. (The gates' own figure — a never-taught sentence *said to her* with a word left out — is unchanged at 12.2 %; that path was not touched) |
| 👉 **"Say the thing I mean"** — one learned weight per unit, added to the word her line is about | the word in a line about it: **2 % → 100 %**, named once |
| ❓ **Not knowing is a feeling**, and it makes her ask | a question **67 %** of the time when she does not know the word, **17 %** when she is sure (60 words she was taught no line about). The feeling rides in the state it was written for: her wondering reads 6 of 6 not-knowing units, a lesson's state written in between reads 0, her wondering's next state 6 |
| 📥 **A word she does not know** — noticed in what is said to her, looked up, made hers; asked about when there is nothing to look up; the answer weighed | looked-up words: definition · a place to say it · reads it · says it — all yes, and used in a line of her own 5 of 5. A slang-only word is learned the same way. A string nothing has an entry for: she holds it and asks. A fitting answer taken; an unrelated answer taken at a quarter, marked doubted, and asked about again the next time she meets the word — then settled by a fitting answer. 30 earlier words still read and said 30 / 30 |
| ⚖️ **The weighing of an answer** — closest answer word against the `0.9^(1/k)` point of her own words | on 300 of her words: random words doubted **92.7 %**, another word's definition **79.0 %**, the word's own definition **35.7 %** |
| 🌍 **Another language is refused** | **48 of 49** sample words of other languages turned away; **1 of 300** of her own words. A misspelling a dictionary names is met as its real word ("recieve" → receive) — and "danke" is no longer turned into *dance* |
| 🪪 **A name is not a misspelling** — in her lessons too | her saved dictionary had 340 strings marked a misspelling by the one-letter-away guess, nearly all names (alice → slice, julia → julian, claude → clause), and she was taught the other word in its place. The guess is now made only when the encyclopedia has no page titled the string: 32 of 37 known misspellings still get it; six of six names asked directly are left alone. The 914 saved misses are looked at once more |
| 💾 **What she holds about new words survives a restart** | the server's own save and restore, through the file's own format: words taken in (with the doubted mark), words held without a meaning, words waiting to be asked about — all read back equal |
| 🔢 **Dashboard count** — "new words she took in" (looked up · asked · doubted · waiting to ask · refused) | through the server's own code: one line with three unknown words → noticed 3 → counted 2 looked up, 1 waiting to ask |
| 🔤 **Spelling carries meaning to words she was never taught to read** | after a reading lesson on 400 words, a never-taught word whose ending five or more taught words share brings up its own meaning over another word's **60.6 %** of the time (51.9 % before; 16 such words — a thin sample) |

## Not done

1. **One fresh start.** Everything on the board is closed. The card program did not change in this work — the released 0.3.58 stands.
2. **Four things only a start can show** — written out, with what each looks like when it worked and when it did not, at the top of `docs/RESUME.md`: the new-word lessons on the card, the dashboard row in a browser, the weights file carrying the new-word state through a real save and load, her question expiring after five minutes.
3. **The saved speech file changed shape** (version 5). A speech file saved before is refused, by design; she starts fresh anyway.

## Honest edges

- Everything above is her real code in an instrument, or the card's self-test. **Nothing has been booted, and no walk has run on any of it.**
- She holds up when what she was taught is reworded. She now makes lines she was never taught, and they end — but they are rough ("is that open", "what do you your mom"): the word is in the right kind of line and the grammar around it is not clean. The next word of a never-taught sentence is right about one time in four when the line is her own, and a never-taught sentence said to her with a word left out is still completed 12 % of the time.
- When she does not know a word she asks about it most of the time, not every time: an ask whose first word falls just under her speech floor is withheld, and the word waits its turn again (measured 14 of 20 asked).
- Her weighing of an answer is honest but not sharp: it doubts four wrong answers in five and one right answer in three. A doubted answer is still taken in at a quarter and the word is asked about again.
- Anyone who talks to her can teach her a word, by decision. A stranger's wrong answer is caught four times in five, not every time.
- She has not been started on any of this. The new-word lessons have never run on the card, and the dashboard row has never been seen in a browser — both are on the first-start list.
- Asked what a looked-up word means, she says a word of its definition when she has that word ("umbrella" → "collapsible"); when she has none of them she says the nearest thing she can name.
- The word-vector table she starts from is still in her: half of a word's meaning cells are chosen from it. That is kept on purpose.
- The firing controller still holds her other clusters at their target. Her language cortex is no longer held — how much of it fires is an outcome.
