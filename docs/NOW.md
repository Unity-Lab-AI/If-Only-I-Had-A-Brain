---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it, or a harness result named as one. Nothing here is recalled.
status: verified
sources:
  - server/brain-server.js
  - server/brain-server/gpu.js
  - server/brain-server/chat.js
  - server/worker-pool.js
  - server/sparse-worker.js
  - server/definition-service.js
  - server/image-render.py
  - server/brain-ctl.js
  - js/brain/curriculum.js
  - js/brain/cluster.js
  - js/brain/cluster/hebbian.js
  - js/brain/embeddings.js
  - html/teachview.html
verified-scope: |
  OVERWRITTEN 2026-11-24 (15:40). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-24, 15:40

## Where she is

| | |
|---|---|
| state | **RUNNING, not yet through her first cell.** Boot `e2c30399` (15:25). Kindergarten English: 24 of 25 cell phases banked; the last phase is in `_teachSentenceList`. No gate verdict yet, no chat yet. Training kept across every press today; no fresh walk |
| cards | your 4070 Ti SUPER (7 small clusters + her image renderer) and the rented RTX PRO 6000 (`ua8x877eiqz63m`, her cortex, all 17 matrices). Pod donor 0.3.52 |
| pod use | **definition lanes now drive the pod** — 64 words in flight; sampled 15:26: `97 98 98 46 73 79 72 97 58 49 14 98 0 0 22` %. **The sentence lane still idles it** (15:32: 0–2%) — it teaches one word at a time and the donor has no multi-region lesson yet |
| threads | 15 worker threads (every hardware thread but one); the CPU shadow Oja — plain and weighted — runs on them, bit-identical |
| memory | climbs ~1 GB/min inside `_teachSentenceList` on every boot (63 → 94 GB on `e2c30399`), cause **not yet named** — the per-word scratch fix did not stop it |
| next press | the dashboard's Update-Savestart loads everything below that is not yet live; the launcher window now closes itself (runs under conhost) |

## What changed today, after the morning snapshot (all on `main`, both remotes)

| | |
|---|---|
| **words** | an undefined word is held out of every binding until a definition lands; a typo teaches its real word; a dictionary rate-limit now falls through to Wiktionary → Wikipedia → Urban Dictionary instead of waiting 6 h |
| **pod feeding** | definitions taught 64 at a time; association-pair reps merged into lessons up to 4,096 pairs; the separation check's 8 probes go out together; the academic pre-vocab lane uses the same 64-worker pool |
| **correctness** | the definition sem→sem bind uses the word's own sem pattern (it read stale spikes); **the sentence lane now sends its patterns to the card** (the card had been learning over stale spikes — loads on the next press) |
| **main thread** | the firing-row scan and the mind's-eye relation reads were 48% of the thread in the sentence lane; both cut (bit-identical scan, time-bounded reads) |
| **renderer** | an idle unload no longer leaks a whole SDXL each cycle (it had reached 58 GB); renderer restarted, host RAM 113 → 80 GB |
| **teach view** | one request in flight per poll — stacked 16 MB snapshots crashed the tab |
| **boot / pool** | boot corpus fits yield the loop; a card that returns gets the newer weights, not its stale copy |
| **this PC** | VibeRoller shares only Claude; Ollama, its engines and its VR desktop no longer start at sign-in (backup in `.scratch/autostart-backup/`) |

## Open — on the board (`docs/TODO.md`)

- **PEGPOD** — the whole curriculum must keep the pod pegged nonstop. Built so far: the definition and pre-vocab lanes. Next: a donor multi-region lesson (type 18) so the sentence lane sends whole sentences many at once, then the remaining serial lanes (`_teachSequenceCycles`, `_conceptTeach`, `_teachVocabList`, `SELF-ARCH-DEF`, the dream trickle).
- **MEMCLIMB** — the sentence-lane memory climb; needs an allocation trace, not another reading-based guess.
