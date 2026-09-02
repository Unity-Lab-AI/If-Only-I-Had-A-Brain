---
name: feedback-no-word-lists-use-taxonomy
description: "NO whitelists/blacklists of words as classifiers — use structural taxonomies (WordNet lex categories, dictionary POS tags, definition-genus recursion); thrice-corrected 2026-08-21"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9ca334e2-f8b0-473a-a026-3b9a384143ae
  modified: 2026-08-21T10:28:46.534Z
---

Gee, three escalating corrections in one batch (2026-08-21): *"WTF is this const MUST_REFUSE = [??? that in no fucking way covers the hundreds of thousands of words"*, *"u cant use words lists for white and blacklists i already told you this FIX IT ALL"*, *"blacklists and whitelists are not comprehesive to hadle real world"*.

**Why:** enumerated word lists can never cover open vocabulary; every list is a maintenance debt and a coverage lie. The codebase has real structural sources instead.

**How to apply:** classify words via `server/drawable-taxonomy.js` (WordNet lexicographer categories + instance-synset filter + tagsense attestation), the dictionary's own POS tags (conjunction/numeral = grammar, the dictionary declares it), and definition-genus recursion (judge a new word by the taxonomy verdict of its definition's head words). Stop-word sets are also banned — filter by "WordNet knows it as noun/adjective" instead. Functional word LISTS that are content (color→RGB tables, room-class regex, training corpus) are fine — the ban is on classifier lists. See [[feedback-no-example-words-in-code]].
