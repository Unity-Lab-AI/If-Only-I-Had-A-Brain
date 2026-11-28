---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page was read off the running brain's own log
# (`server/server.log`) or measured on her real code in an instrument, named
# as such. Nothing here is recalled.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/chat.js
  - server/brain-server/gpu.js
  - server/runpod-control.js
  - js/brain/curriculum.js
verified-scope: |
  OVERWRITTEN 2026-11-28 (early morning). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-28, early morning

## Where she is

| | |
|---|---|
| 🟢 **Walking** | Fresh walk started 00:43. Restarted six times since on Update (keep weights) to land fixes — her weights, speech and finished lessons came back every time. Running build `55bc0869`. |
| 📍 **Cell** | **ela/pre-K** — the cell she was in. **0 cells passed** so far; four sections of ela/pre-K have passed their own checks. |
| 📚 **Definitions first** | the pre-cell pass took 2 h 51 min: **9,242 of 9,446 words, 104,722 meanings**. 16 strings in her corpus have no definition anywhere and are held out; 20 ordinary words were deferred to the next pass. |
| 🖥 **Cards** | Gee's RTX 4070 Ti SUPER holds her cortex and all 17 pathways; a public donor's RTX 5070 Ti steps six of her small clusters. |
| 🗣 **Speaking** | she has about 10,500 words with a place to say them; her inner voice has begun and is mostly silent ("Numbers." once) — she has had no sentence lessons yet. |

## Fixed this morning, on the running brain

| Found | Fix | Seen working |
|---|---|---|
| Talking to her froze her loop 53 s and 70 s and dropped the donor — an old question probe stepped her cortex on the host | the probe does not run on a cortex that speaks from its own cells | not yet — nobody has talked to her since |
| A stranger's card took her whole cortex: any remote card counted as "a pod" | only a pod rented through the Runpod plug-in replaces Gee's card | yes — the 5070 Ti rejoined and the cortex stayed on Gee's card |
| Her reading check compared each word with all 10,500 words she knows: 5,253 ms a word, a 180 s freeze, the site down | only words that could compete are checked, through an index; 72 ms a word | the site answers again |
| Every restart skipped the pre-K cell she was in | only a passed gate counts as done | yes — the restart opened ela/pre-K, not the next subject |

## Not fixed — the one problem left

**After every section pass, her server freezes for 92–107 seconds and Gee's card drops.** Three times on this boot. The card comes straight back holding everything (no re-upload), so nothing is lost — but the site is down for those minutes. Each freeze happens in her sentence lesson right after the pass. I blamed the weights save and changed how it opens its file; the next freeze proved that wrong. The real blocker is being measured now — her real sentence lesson at her real size, every step timed — before any more code is touched.

## Being changed now

**Every card does teach ops.** Gee chose it: her main matrix is split across the connected cards, each teaching its own rows. Code ready, not yet restarted onto.

## Still to watch

- Her weights save takes about 2½ minutes per checkpoint.
- About half her looks fail on the second picture; for 95 minutes they were all held back because the card had too little free memory.
- Once a save printed "SATURATED sem→motor" at every checkpoint; not established whether that check fits the new wiring.
- First-start checks still waiting: the new-word lessons and dashboard row, her question expiring after five minutes.
