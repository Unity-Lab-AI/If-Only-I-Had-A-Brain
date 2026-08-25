# Thalamic relay — attention over the emission context window

## ⛔ THIS IS NOT TRANSFORMER ATTENTION. Read this before anything else.

The word "attention" in this filename is the **thalamic / Posner sense** — a gain bias on what the brain is currently attending to. It is **not** the attention of an attention-is-all-you-need transformer, and the two share nothing but a noun.

**Stated plainly, because this file's NAME is the thing an outside reader will point at when they want to argue there is a language model in here.** `js/brain/cluster/attention.js` was read closely during the 2026-08-25 no-text-AI audit and confirmed:

| A transformer has | This has |
|---|---|
| Q / K / V projection matrices | **none** |
| Multiple heads, learned per-head | **none** |
| Gradients / backprop | **none — nothing in this brain uses backprop** |
| A vocabulary / output projection layer | **none** |
| Softmax over a sequence of tokens | **one cosine-weighted read over the last ≤16 words she actually emitted** |

That is the whole mechanism: it looks at the small window of words she just said and biases the next read toward what is relevant in it. There is no learned parameter in the operation and no text model anywhere near it.

⚠ If a future change makes any row on the right-hand side stop being true, that is not a refactor — it is a breach of the project's central claim, and the boot guard that fails on an LLM SDK or a transformer dependency exists precisely to catch it.

## What changed

One new mixin, `js/brain/cluster/attention.js`, attached to
`NeuronCluster.prototype` alongside the existing four. Two call sites in
`js/brain/cluster/emit.js` (window reset at the top of a compose call, read
+ inject in the back-injection block). One new render region in
`js/ui/brain-3d.js`.

**Nothing runs unless a caller passes `attention: true`.** Default-off, so
every existing gate probe, production probe and chat path behaves exactly
as it did. No neurons are allocated, no region boundaries move, no sparse
matrices are created, and the saved weight format is untouched — existing
trained weights load and run unchanged. There is no
`WEIGHTS_FORMAT_VERSION` bump because there is no topology change.

## Why it was needed

Emission is autoregressive. `composeSentence` emits a word, injects it back
into `sem`, ticks, and emits the next one. Two facts about that loop:

- the back-injection carries **one** word of history, at strength
  `0.24 × 0.92^position`
- the word-order channel (`relationTagId=13`, `_teachConcreteSentences`) is
  trained on **adjacent pairs**

A model whose only memory of the sentence so far is the previous word is a
**bigram model**. Bigram output is topically correct and grammatically
scrambled, which is exactly the failure that reads as word salad. It is not
a training deficit and more reps will not fix it — it is the known ceiling
of the context width.

## What it is

A single attention head, built only from operations already present in this
codebase:

    score_i = cos(query, key_i) + recency_i · bias
    a       = softmax(score / temperature)
    context = Σ a_i · value_i                      then L2-normalised

The query is the just-emitted word (the brain's present position in the
sequence). The keys and values are the words already emitted this
utterance. The result is injected into `sem` through the cluster's own
`injectEmbeddingToRegion`, at 0.6× the recency injection, so the trained
transition signal stays primary and the context read is a bias on top of
it.

Cosine appears already in the compose coherence post-check. Softmax with
temperature appears already in `emitWordDirect`'s sampling path. Weighted
sums are what every sparse propagate does. Nothing here is imported,
downloaded, or pre-trained, and there is **no backpropagation and no
gradient descent** — this is a forward read over live state, like every
other equation in the brain. The brain's own trained weights still choose
the word; attention only changes what state they choose from.

## Why the thalamus

Seven clusters, all talking cortex-to-cortex, with no relay between them.
Biology does not work that way: the thalamus, and specifically the
pulvinar, is the structure that gates which cortical representations get
amplified into the current processing window. Crick called it the
searchlight. That gating function is precisely what an attention read does,
so the telemetry region tag is `thalamus` and the visualization renders it
as a deep bilateral structure at the centre — filling the one anatomical
hole the model had.

Attention reads fire `_pushBrainEvent('attention', 'thalamus', …)`, so the
relay shows up as live popups on the 3D brain rather than being an
invisible math change.

## The measurements

    node js/brain/test_attention.mjs

Runs the read against a fixture whose similarity geometry matches a real
embedding space (related pairs at cosine 0.600, unrelated at 0.250 — the
band GloVe 300d actually occupies).

| check | result |
|---|---|
| empty window returns null | PASS — emission falls through to prior behaviour |
| content beats recency | PASS — `dog` 0.800 vs newest unrelated word 0.108 |
| entropy strictly between collapsed and uniform | PASS — H=0.638, uniform would be 1.099 |
| weights sum to 1 | PASS |
| context is L2-normalised | PASS |
| window capped at 16, oldest dropped | PASS |
| different queries read different context | PASS |

**Content beating recency is the load-bearing result.** The oldest word in
the window outscores the newest one when it is semantically closer to the
query. If position always won, this would be a more expensive bigram.

**Entropy is the diagnostic to watch.** Near `log(n)` means the read is a
uniform average and contributes nothing; near 0 means it collapsed onto one
word and contributes nothing. Useful values sit between, and
`getAttentionState()` surfaces it live.

## Two constants, both found by measurement

`temperature = 0.15`. Cosine scores across a real sentence span only a few
tenths, so temperature 1.0 leaves the softmax nearly flat.

**No `1/sqrt(d)` term**, deliberately. Standard dot-product attention
divides by `sqrt(d)` because raw Q·K products grow with dimension. Cosine
is already that normalisation. Applying both double-corrects: the first
build of this module did, and at d=300 it compressed every score into
±0.058 and produced entropy 1.099 on a three-word window — exactly uniform,
i.e. attention contributing nothing. The test caught it.

## What has not been shown

The checks above prove the read is content-addressed and well-conditioned.
They do **not** prove emission quality improves — that needs a live GPU run
with trained weights, comparing composed sentences with the flag on and
off. Headless cannot exercise emission. That comparison is the next step
and it should happen before anything further is built on this.

## The follow-up, and its real cost

This stage runs the read over **embedding vectors in a small ring**, not
over a neuron population. It has no neurons, so it cannot itself learn.

The neuron-resident version carves an `attn` band out of `free` with its
own sparse Q/K/V cross-projections, trained by the existing Oja rule — at
which point the relay has real firing patterns and learns what to attend
to. That is a **topology change**: it needs a `WEIGHTS_FORMAT_VERSION` bump
and a fresh walk, the same price the `gustatory` + `somatosensory` carve
paid.

It is deliberately not done here. Prove the read improves emission on the
current weights first, then pay for the substrate.
