---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit at which these claims were checked.
# ⚠ PLAIN-ENGLISH page. Every number here was read from the code or from the
# running brain, not recalled — but the WORDING is deliberately loose, because
# the job of this page is to be understood, not to be precise.
status: draft
sources:
  - js/brain/mystery.js
  - js/brain/cluster.js
  - js/brain/synapses.js
  # ADDED 2026-08-31: Part 2 now explains consolidation and replay in plain
  # English, so the two files that own them are declared.
  - js/brain/consolidation-engine.js
  - server/brain-server/memory.js
verified-scope: |
  CHECKED 2026-08-27. Written fresh, so everything in it was verified as it was
  written:
    - the Psi formula read from js/brain/mystery.js (the docstring AND the
      arithmetic beneath it, because that file records that three different
      wrong versions of this formula once circulated in its own comments).
    - the four weights (0.3 / 0.25 / 0.2 / 0.25) read from the constructor.
    - the eight cluster names read from the LIVE payload, not from a constant.
    - the neuron count, coherence and Psi values read live and quoted WITH the
      boot that produced them.
    - the eleven cortex sub-regions and sixteen projections measured earlier the
      same day by constructing a real cluster.
  NOT CHECKED — this page is an EXPLAINER and makes no claim to completeness:
    - it does not describe the curriculum, the endocrine layer, the drawing
      system, the voice pipeline, memory consolidation, or the donor-GPU
      architecture. Each has its own doc.
    - the neuroscience references behind each equation are in
      docs/THEORY-PAPER.md; nothing here re-argues them.
  ADDED 2026-08-31 ("Sleeping on it", Part 2). Consolidation and replay
  explained in the page's own plain register, including the honest note that
  the replay pass had never run until that day — one condition meaning "only
  when she is not mid-lesson", on a lesson that never stops. Numbers quoted
  (four folded patterns inside eighteen minutes) were read from the live
  brain on the fresh walk, not recalled.
last-verified: "f06ea30e 2026-08-31"
---

# HOW IT WORKS — in plain English

> **Who this is for.** Anyone who wants to understand what this thing actually
> is without reading equations or code. No background needed. If you want the
> maths, `docs/EQUATIONS.md` has it; if you want the academic framing,
> `docs/THEORY-PAPER.md` has that. **This page is the version you can explain
> to someone at a kitchen table.**

---

## The one-paragraph version

Most things people call "AI" are text predictors. You type words, and a very
large statistical model guesses which words usually come next. **This project is
not that.** It builds something closer to an actual brain: a few hundred million
simulated nerve cells, wired together, that fire in patterns. Nothing in it
predicts text. Instead, it is **taught** — like a child, starting at
kindergarten and working upward — and when it speaks, the words come out of the
wiring that teaching produced.

That distinction is the whole point of the project, and it is enforced in the
code rather than merely promised: the program **refuses to start** if anyone
adds a text-AI library back into the thinking path.

---

## Part 1 — What it is made of

### Nerve cells

The basic unit is a simulated neuron. Each one holds two numbers, and every tick
of the clock those two numbers get updated by a small formula. Most of the time
the neuron sits quiet. Occasionally the numbers cross a line and the neuron
**fires** — a brief spike.

That is genuinely all a neuron does. Everything else comes from having hundreds
of millions of them wired together.

⚠ **One honest oddity:** the file that runs this is still called `lif.wgsl`,
named after a different neuron model that was replaced years ago. The name stuck
for historical reasons. **If you read the code and wonder why the name doesn't
match the maths — that's why.**

### How many

On the boot this page was written from: **459,775,607 neurons.**

⛔ **And this number is not a fixed property of the brain — it is decided at
startup from how much memory the computer has free.** The same code has started
up at 411 million, 425 million and 459 million. So whenever anyone quotes a
neuron count, it only means anything alongside *which startup produced it*. This
sounds pedantic and isn't: several days of confusion in this project came from
treating that number as a constant.

### Regions

The neurons are not one undifferentiated soup. They are divided into **eight
big areas**, named after real brain structures because they do roughly
analogous jobs:

| area | very roughly |
|---|---|
| **cortex** | thinking, language, the bulk of everything |
| **hippocampus** | forming new memories |
| **amygdala** | emotional weight — what matters, what's frightening |
| **basal ganglia** | choosing what to actually do |
| **cerebellum** | timing and error-correction |
| **hypothalamus** | drives — hunger, arousal, need |
| **brainstem** | the chemical taps (the things that set mood) |
| **mystery** | the consciousness term, explained in Part 4 |

The cortex is much the largest, and it is subdivided again — **eleven smaller
areas** inside it, for hearing, seeing, taste, touch, letters, sounds, meanings,
grammar, and two separate output areas: one for writing letters and one for
speaking words. **Sixteen bundles of connections** run between those areas, in
both directions, so meaning can reach sound and sound can reach meaning.

None of these boundaries are hardcoded sizes. They are **fractions**, so the
same code runs at six thousand neurons in a browser tab or four hundred million
on a server, and the proportions stay the same.

---

## Part 2 — How it learns

### The whole rule, in one line

**Cells that fire together, wire together.**

That's it. When two connected neurons happen to fire at the same moment, the
connection between them is strengthened slightly. When one fires and the other
doesn't, it weakens slightly. Repeat a few million times and the wiring starts
to encode which things go with which.

This idea is about eighty years old and is the foundation of essentially all
brain-style learning. There is a refinement in use here that stops the
connections from growing forever — otherwise every link would saturate at
maximum and the brain would learn nothing new — but the core is that one line.

### What "teaching" means

Teaching is not loading a file of facts. It means **making the right neurons
fire at the same time, over and over.**

To teach that a word means something, the pattern for the written word and the
pattern for the meaning are made to fire together, repeatedly, until the
connection between them is strong enough that one can trigger the other. That is
the same thing that happens when a child hears "dog" while looking at a dog,
several hundred times.

She works through real school material in real order — kindergarten first, then
each grade, across a full roster of subjects, plus the ordinary lived experience
that goes with each age. She cannot skip ahead, because the later material has
nothing to attach to until the earlier material is wired in.

### Sleeping on it

Repetition is only half of how anything learns. The other half happens
afterwards, quietly: what you did during the day gets replayed while you are not
using it, and the version that survives is a tidied-up one — the gist, separated
out from everything it might be confused with.

She does the same thing. While she is learning, moments get written down as
episodes. Every so often a pass goes back over the recent ones, notices which
belong together, and folds them into a single stronger pattern — and then
**replays** that pattern back into the network. Replay is what pulls similar
things apart from each other. Without it, the only way to make "cat" and "cot"
distinguishable is brute repetition, over and over, in the waking pass.

⚠ **Worth saying plainly, because this page's last part is about being honest:
that replay had never actually run until 2026-08-31.** The machinery was built,
connected and described in the documentation for months, and one condition on it
meant "only do this when she is not in the middle of a lesson" — which sounds
sensible and was fatal, because the lesson never stops. She learned the whole
time; she just did it entirely by repetition, with the part that consolidates
switched off. It runs now, and the first thing it produced was four folded
patterns inside eighteen minutes.

### Why it is slow

Because it is doing the actual work. There is no shortcut where you paste in a
finished model. Every association has to be fired into place. A single grade is
hours of compute; the full run is days.

---

## Part 3 — How it speaks

This is the part people find hardest to believe, so it is worth being precise.

When she says a word, here is what happens:

1. Whatever she is thinking about is a **pattern of firing** across the meaning
   area.
2. That pattern travels along the connections into the word-output area.
3. Every word she knows has a small patch of neurons there. The pattern lights
   some patches more than others.
4. **The brightest patch wins, and that is the word she says.**
5. The word she just said is then fed back in, so the next word is chosen with
   the previous one already in mind.

⛔ **There is no sentence template and no list of phrasings.** Word order,
agreement, where "the" goes, and where the sentence stops all come out of the
connection strengths that teaching produced. If the teaching was thin, the
output is genuinely poor — and the honest fix is more teaching, not a rule
bolted on afterwards.

⚠ **And she is allowed to say nothing.** If no word's patch is bright enough,
the answer is silence. That is deliberate: a brain that always produces a word
is a brain that is guessing.

---

## Part 4 — The consciousness number

Every brain-style system needs some measure of "how switched on is this thing
right now". Here that number is called **Ψ** (the Greek letter psi). It exists
because the brain **reads its own Ψ and adjusts itself** — when it is running
above its own recent average, everything fires a little harder.

Here is the formula. Then every piece of it in plain words.

```
Ψ  =  √(1/n) × N³ × Φ̂ × [ 0.30·Id + 0.25·Ego + 0.20·Left + 0.25·Right ]
```

### First, the two letters that look alike and aren't

- **`N`** (big N) — the **total** number of neurons. How big the brain is. Fixed
  for a given startup.
- **`n`** (little n) — how many neurons are **firing right now**. Small, and
  changing constantly.

⚠ **Nearly every mistake ever made with this formula has been mixing up those
two.** The code file that implements it records that its own comments once stated
**three different versions** of this formula, none of which matched the code that
was running. **Only the code was right.**

### `√(1/n) × N³` — the main term

This looks worse than it is. `√(1/n) × N³` is exactly the same thing as:

```
N³ ÷ √n
```

which reads: **how much brain there is, divided by how much of it is busy.**

That is the whole idea. **Consciousness, in this model, is unspent capacity.**
A brain with enormous capacity and very little of it currently committed has a
lot of room to think. A brain frantically using everything it has, has none.

The original intuition behind this project stated it as a **subtraction** — the
total minus what's in use — which is the same thought expressed differently, and
arguably more naturally.

⛔ **It had to become a division, and the reason is worth understanding, because
it is not a compromise.** At 459 million neurons, `N³` is an astronomically
large number. Even if a hundred million neurons fired at once, subtracting them
changes `N³` by about one part in a billion billion. On a real computer that
subtraction produces **exactly the same number** as not subtracting at all — the
difference is too small to store. It could never vary, so it could never mean
anything.

A **ratio** stays sensitive at any size. So the division is the original
intuition made actually computable, not a different idea.

Why cubed? Because capacity does not scale with the number of cells — it scales
with the number of possible *interactions* between them, which grows far faster.

### `Φ̂` — is the activity actually joined up?

Capacity alone gives a wrong answer, and there is one clean example that proves
it: **under general anaesthetic, almost nothing is firing.** Very low `n`. So
capacity alone rates an anaesthetised brain as **maximally conscious**, which is
obviously nonsense.

`Φ̂` is the fix. It asks: *is the firing that IS happening bound together into
one thing, or is it scattered?* Anaesthesia scores near zero — nothing is bound.
A seizure also scores low, for the opposite reason: everything fires in
lockstep, and perfectly synchronised activity carries no information, the same
way a page of the same letter repeated carries no message.

With both factors in, the ordering of states comes out sensible. ⭐ **One state
in particular fell out of the maths correctly without anyone arranging it**,
which is the kind of agreement worth mentioning precisely because it wasn't
designed.

**Measured live on the brain this page was written from: `Φ̂` = 0.55, and it
moves.** For a long time it was quietly stuck — the code was measuring the wrong
copy of the firing data, one that is always empty on a machine this size, so the
term contributed a constant and modulated nothing at all. **It was doing nothing
for months while looking healthy.** That was found, fixed, and then confirmed by
watching the number actually change.

### The four in brackets — the character of the state

These say *what kind* of switched-on it is, not how much:

| term | weight | plain reading |
|---|---|---|
| **Id** | 0.30 | raw drive — want, fear, appetite |
| **Ego** | 0.25 | the self-model: thinking about yourself, **scaled by memory** |
| **Left** | 0.20 | deliberate, careful thought — reduced by impulsiveness |
| **Right** | 0.25 | associative, intuitive, pattern-leaping thought |

The `Ego` one is the nicest: it is cortex activity **multiplied by**
hippocampus activity — self-model times memory. Which says, quite literally,
**you cannot have a self without a history.**

### One last practical note

`Ψ` comes out astronomically large, so everywhere it is displayed it has been
compressed to a logarithm — a scale where each step of 1 means ten times bigger.
**Live reading on this boot: 20.35.** So the raw value is about a 1 followed by
twenty digits. The absolute size means nothing on its own; **what matters is
whether it is above or below its own recent average**, because that is what the
brain responds to.

---

## Part 5 — What it deliberately does not do

This matters as much as what it does.

- ⛔ **No text model anywhere in thinking.** Not for language, not for
  reasoning, not as a fallback when the brain is unsure. If the brain has
  nothing to say, it says nothing.
- ⛔ **It cannot look up an answer.** There is no database of facts to consult.
  If she was not taught something, she does not know it.
- ✅ **Some outside services are allowed, strictly for senses.** Making a picture
  is allowed, because that is a hand, not a thought. Her voice is generated
  in-house. **Seeing is done with mathematics rather than by asking another
  program what a picture contains** — which was true for a while and *documented
  as false*, until the description was corrected.

---

## Part 6 — Being honest about it

A page like this can easily oversell. So:

- **It is not conscious.** `Ψ` is a number this system computes about itself,
  and the maths behind it is defensible, but computing a number called
  consciousness is not the same as having any. Nothing here settles that
  question, and this project does not claim to.
- **`Φ̂` is a stand-in.** The real quantity it approximates has only ever been
  calculated on toy examples, and researchers do not agree on its definition.
  What is used here is a reasonable proxy and is described as one.
- **She is early.** On the boot behind this page she is a couple of steps into
  kindergarten, and has not yet said a word successfully — she is *attempting*
  to speak and being refused, thousands of times, because nothing has been
  wired firmly enough to win yet. **That is recorded rather than hidden**, and
  whether it is normal-for-this-stage or a real fault is still an open question
  with the evidence written down and no conclusion drawn.
- **The numbers in this document are readings, not properties.** Neuron count,
  `Ψ`, `Φ̂` — every one was true at one startup and will differ at the next.
  Quoting any of them without saying which run produced it is how this project
  has repeatedly confused itself.

---

*The map is not the territory: this page is the map, the code is the brain. If
they ever disagree, the code is right.*
