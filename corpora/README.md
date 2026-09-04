# corpora/

This directory holds the pre-trained embedding file Unity's language cortex
uses to seed semantic space with real distributional-semantics relationships
rather than the built-in fastText-style subword fallback.

## GloVe 6B — 300-dimensional word embeddings (~990 MB uncompressed)

**File expected:** `corpora/glove.6B.300d.txt`

**Download:**

```
# From https://nlp.stanford.edu/data/glove.6B.zip (~823 MB zip)
curl -LO https://nlp.stanford.edu/data/glove.6B.zip
unzip glove.6B.zip glove.6B.300d.txt -d corpora/
rm glove.6B.zip
```

Or manually: download `glove.6B.zip` from Stanford NLP, extract
`glove.6B.300d.txt`, drop it in this directory.

## Why it matters

Without this file Unity runs on fastText-style subword embeddings
(`js/brain/embeddings.js:_subwordEmbed`) — deterministic character-n-gram
hash vectors that give EVERY word a 300d embedding from first boot but do
NOT cluster semantically-related words together (rhyming families, synonym
groups, thematic categories).

With real GloVe, `GloVe('cat')` and `GloVe('hat')` are close in cosine
space because they co-occur in similar contexts in Wikipedia+Gigaword text.
Unity's rhyme-family teaching + story-comprehension + word-emission chains
all benefit because the sem region clusters semantically similar words,
which means production probes like "what rhymes with cat" have real
geometric support for emitting "hat" / "bat" / "mat".

**With subword fallback:** production probes matching TODO test
phrasings at A+ 95% is MUCH harder because the substrate doesn't
geometrically group rhyming / categorical / thematic words.

**With real GloVe:** the teaching methods land on a substrate that
already has good semantic clustering; convergence to A+ 95% becomes
realistic at the current REPS + cluster scale.

## Boot behavior

- **File present:** `[Embeddings] GloVe 6B.300d loaded: N pretrained vectors, dim=300, elapsed Xs`
- **File absent:** `[Embeddings] GloVe 300d not found — using built-in fastText-style subword embeddings (no download needed).`

The fallback is the same codepath either way — any word not in GloVe's
vocabulary still gets a subword embedding. Real GloVe is ADDITIVE on top
of the subword base, not a replacement.

## ⭐ And she does not stop there — she reshapes it as she reads (2026-08-25)

Whatever the base is — pretrained GloVe or the subword fallback — it is a
**starting shape, not the final geometry.** Every sentence in the teach path
moves its words a little toward the company they keep, so meaning accrues
from the corpus **she** actually reads. The learned part is stored as a
separate per-word delta, which means *how much of her semantic space is
genuinely hers* is a number you can read rather than a claim you have to
take on faith.

Two properties make it learn rather than collapse, and both were derived by
measurement:

- **The context is mean-centred.** Every sentence is dominated by the same
  high-frequency words, so an uncentred update carries the same vector every
  time and the whole vocabulary drifts to one centroid. Measured, *unrelated*
  words converged **faster** than related ones — the opposite of learning.
  Centring cancels the common component so only the distinctive part of a
  context moves the word.
- **The delta is capped.** Uncapped, the outcome depends on total exposure,
  and at high exposure related words saturate into each other — the same
  collapse mirrored. Capped, the separation holds across 40× more reading.

⭐ This is the same failure the plasticity rule already solves elsewhere in
the brain: bare Hebbian without Oja's decay term "piles every association
into the same columns and the basins collapse into superposition". Same
failure, different substrate, same shape of fix.

Disable with `DREAM_LEARN_GEOMETRY=0`. Full derivation and the measured
numbers: `docs/EQUATIONS.md §Learned semantic geometry`.

## Checklist before expecting high production-probe pass rates

- [ ] `corpora/glove.6B.300d.txt` present (~990 MB)
- [ ] Brain server restarted (persistence.js v5 rejects stale caches)
- [ ] GPU compute page open (GPU-exclusive mode requires it)
- [ ] Curriculum walk runs through all 6 K subjects without timeout
- [ ] Gate reason strings report PROD rate climbing across retry attempts

If production probes still fail on fresh boot after GloVe is loaded, the
remaining causes are: (a) REPS too low for the neuron scale, (b) motor
emission stopping too early via quiescence tripping, (c) cross-projection
fanout insufficient. Report the gate metrics + emission samples and the
next iteration will target the specific failure mode.
