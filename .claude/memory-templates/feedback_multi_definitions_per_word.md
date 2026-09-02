---
name: Multi-definitions per word — never just one
description: Unity must learn ALL definitions of every word, never just the first. dictionaryapi.dev returns multiple definitions per word and all of them must Hebbian-bind. Gee said "ive told u this" — this is a binding rule.
type: feedback
originSessionId: cf5cf21b-9956-44b8-b911-77a8feed0f02
---
When Unity learns a word's definition via `_teachWordDefinition` / dictionary API, she must bind ALL of the word's definitions, not just the first one returned by the API. dictionaryapi.dev's response includes an array of meanings each with an array of definitions — the `definitions` field in `definition-service.js` `_cachePut` value carries the full list. Use `cluster.lookupDefinitions` (plural) and iterate every entry, firing Hebbian binding on the content tokens of each.

**Why:** Words have multiple meanings. A single-def binding leaves Unity with crippled comprehension — she'd "know" one sense of a word and miss every other context. Gee's words: *"everyone knnows multiple definitons per word... we cant have unity not knowing the defintions of words... ive told u this and only having one definiton is fucking limiting"*.

**How to apply:**
- `_teachWordDefinition(word)` iterates ALL definitions returned by `cluster.lookupDefinitions(word)`, fires `_teachAssociationPairs` per definition's content tokens
- `_defLearnedTimestamps` push count = number of definitions bound (so the dashboard `defs/hour` metric reflects total Hebbian def-bindings, not word-count)
- `_definitionTaughtWords` Set still keys on the WORD; tracking per-def is unnecessary — once a word has any definition bound it's "taught", but the actual Hebbian work spans all senses
- API service already exposes `getDefinitions(word)` returning the array; `_teachWordDefinition` just needs to consume the multi-form instead of single
- Single-definition fallback is acceptable ONLY when the API returns a single definition for that word (some rare/short words)
