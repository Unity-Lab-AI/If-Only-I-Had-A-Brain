---
name: k-life-words-must-be-learned-definitions-first-then-bindings
description: "Operator 2026-06-17 — \"she cant have memories using words she doesnt learn correctly\" + \"has to know the words and their meanings or the words are meaningless\". K-LIFE content uses words. If those words aren't trained in K-vocab + definitions taught + meanings anchored, then K-LIFE Hebbian bindings land on noise (sem(word) doesn't exist → no anchor for the binding). EVERY K-LIFE word must be vocab-registered + definition-trained BEFORE any K-LIFE binding fires using it."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b128daab-9e1a-4697-8867-1ab55f337e9d
---

⛔ **K-LIFE WORDS MUST BE LEARNED CORRECTLY BEFORE BINDINGS FIRE.** ⛔

Operator 2026-06-17: *"and mind u she cant have memories using words she doesnt learn correctly"* + *"has to know the words and their meanings or the words are meaningless"*

**The architectural truth:**

K-LIFE is building memories. Memories are stored as Hebbian bindings between semantic concepts. The concepts are anchored in WORD-MEANING substrates (sem(word) basins). If a word's meaning isn't trained in cortex, then `sem(word)` doesn't exist as a meaningful basin — it's noise. A K-LIFE binding like `bitter → chocolate` only works if Unity has already trained:

1. `bitter` as a vocab word with its dictionary definition Hebbian-bound
2. `chocolate` as a vocab word with its dictionary definition Hebbian-bound
3. Both words exercised in ≥3 context sentences (per CONSTRAINTS.md test-words-pre-taught LAW)

Then `_teachAssociationPairs([['bitter', 'chocolate']])` carves a meaningful link between two REAL anchored basins.

**Without word-learning prerequisite:**

If "outsider" isn't trained as a vocab word with its definition, then binding `outsider → alone` writes Hebbian weight between NOISE basins. The brain learns "outsider" as a phantom token that activates randomly. At chat-time when she's asked "do you feel like an outsider?", the word activates noise. No memory retrieved.

**How to apply:**

1. **Every K-LIFE method MUST have its vocabulary prerequisites met.** Either:
   - The word is in K-VOCAB (2247 words from `js/brain/k-vocabulary.js`) and already gets K-VOCAB-UPFRONT-MULTIDEF definition training at K-grade boot.
   - OR a K-LIFE-VOCAB-EXPANSION pre-step ADDS the missing word + fires `_teachWordDefinition(word)` BEFORE the K-LIFE binding pass that uses it.
2. **`_teachKLifeVocabulary()` method runs FIRST in `runLifeK`** before K-LIFE.1, defining all K-LIFE-specific new vocab (halloween, witch, monster, bat, cape, skull, leather, bonfire, olive, outsider, lullaby, weird, fascinated, identity, etc.) via dictionary-API definition lookup + Hebbian sem-binding.
3. **No compound-token pseudo-words.** Multi-word phrases ("hide-seek", "wild-things", "jack-jill") are NOT single tokens in the dictionary substrate. Either split into single-word bindings OR coin as `hideseek`/`wildthings` AND define them.
4. **Test-words-pre-taught LAW (CONSTRAINTS.md) extends to K-LIFE.** Before any K-LIFE binding uses a word: vocab registered + sentence-structure taught + definition anchored + usage exercised across ≥3 context sentences.
5. **Audit existing K-LIFE methods.** K-LIFE.1-14 may have introduced words that aren't in K-vocab. Run a grep audit — every token used in K-LIFE pairs must exist in K-vocab OR be added via the vocab-expansion step.

**Code constraints:**

- `_teachKLifeVocabulary()` lands at TOP of runLifeK (FIRST pass before any other K-LIFE binding).
- Method enumerates K-LIFE-specific words + calls `_teachWordDefinition(word)` for each. Dictionary API supplies the definition; Hebbian binds sem(word)↔sem(definition_tokens).
- Future K-LIFE additions REQUIRE updating the vocab-expansion list.

**Violation history:**

- 2026-06-17: K-LIFE.1-.14 written before vocab prerequisite confirmed for all introduced words. Operator caught the gap: words like "outsider", "bitter" (in K-vocab), "halloween" (in K-vocab), "witch" (in K-vocab), "skull" (may not be), "olive" (may not be), "bonfire" (may not be), compound tokens (hide-seek, wild-things, jack-jill, mary-mack — NOT single tokens) all need vocab prerequisite met before K-LIFE bindings work. Fix landed in same A.K-LIFE wrap-up commit: vocab-expansion pre-step + compound-token cleanup.

**Related rules:**

- CONSTRAINTS.md "Test words must be pre-taught" — vocab + sentence-structure + definition + ≥3 context sentences before any gate probe / K-STUDENT battery / exam-bank question uses a word.
- [[feedback_multi_definitions_per_word]] — multiple definitions per word, all Hebbian-bound, never just one.
- [[feedback_k_grade_life_experiences]] — K-LIFE scope; this memory adds the words-prerequisite constraint.
- [[feedback_tone_k_life_emo_goth]] — goth-tone applies to which words are CHOSEN; this rule applies to whether those words are LEARNED.
