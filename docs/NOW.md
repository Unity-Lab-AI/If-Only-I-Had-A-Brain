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
  - js/brain/dictionary.js
  - js/brain/embeddings.js
  - crates/unity-protocol/src/frames.rs
  - donor-app/src/donor.rs
  - html/teachview.html
  - windows/stop.bat
verified-scope: |
  OVERWRITTEN 2026-11-24 (16:20). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-24, 16:20

## Where she is

| | |
|---|---|
| state | **RUNNING, not yet through her first cell.** Boot `ff722be7` (16:09). Kindergarten English: 24 of 25 cell phases banked; the last phase is in `_teachSentenceList`. No gate verdict yet, no chat yet. Training kept across every press today; no fresh walk |
| cards | rented RTX PRO 6000 (`ua8x877eiqz63m`) holds her cortex and all 17 matrices; your 4070 Ti SUPER holds the 7 small clusters and her image renderer. **Both donors on 0.3.53** |
| pod use | definition lanes: 64 words in flight, measured up to 97–98%. Sentence lane: **pattern lessons** (2,048 words per frame) — `stageProfile.patternLesson {lessons: 9, items: 18,432, refused: 0}`; pod 97% read by Gee, ~35% with gaps on a 15 s sample at 16:19 — not yet pegged everywhere |
| memory | **flat** — `ab` 8.7 GB through `_teachSentenceList` (every earlier boot climbed past 80 GB there). The leak was a 40 MB spike-buffer copy per new dictionary word, named live by `/admin/memprobe` |
| threads | 15 worker threads carry the CPU shadow Oja (plain and weighted) |
| next press | none owed — everything built is on this boot |

## What changed today, since the 15:40 snapshot (all on `main`, both remotes)

| | |
|---|---|
| **memory leak** | found by measurement (`2,506 MB/s · 2,628 × Uint8Array ← Dictionary.learnWord`) and fixed: no full spike-buffer copy per new word when the stress stream did not run |
| **sentence lane** | its patterns now reach the card (it had trained the card on stale spikes); then **donor 0.3.53 pattern lesson (type 18)** — whole runs of words per frame, encoder↔decoder parity checked |
| **instrument** | `/admin/memprobe` — memory before/after a full collection plus the allocation sites of every large buffer |
| **stop** | `stop.bat` / `stop.sh` send the shutdown to `127.0.0.1` with 30 s (localhost / 5 s could miss her mid-teach) |
| **this PC** | VibeRoller shares only Claude; Ollama, its engines and VR desktop no longer start at sign-in |

## Open — on the board (`docs/TODO.md`)

- **PEGPOD** — the whole curriculum keeps the pod pegged nonstop. Built: definition / pre-vocab pools, merged and pattern lessons. Still to do: close the gaps between sentence lessons (more in flight / build lessons off the main thread), and the remaining serial lanes (`_teachSequenceCycles`, `_conceptTeach`, `_teachVocabList`, `SELF-ARCH-DEF`, the dream trickle).
- **First cell + talking** — monitored every 5 minutes; every talking bug is recorded with evidence once she speaks.
