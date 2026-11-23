---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it. Nothing here is recalled, and nothing here is a constant.
status: verified
sources:
  - server/brain-server/chat.js
  - server/brain-server/visual-memory.js
  - server/brain-server/image-engine.js
  - server/image-render.py
  - server/brain-server/eye-style.js
  - windows/start.bat
  - windows/Savestart.bat
verified-scope: |
  OVERWRITTEN 2026-11-23, evening (after the operator stopped her). This file is
  a SNAPSHOT and is overwritten, never appended — the previous version described
  the 2026-10-29 boots. Git holds every byte of it: git show HEAD~1:docs/NOW.md

  ⚠ 2026-11-23 NIGHT — SHE IS DOWN; THE NEXT START IS A FRESHSTART (the
  operator's call, to carry nothing over from earlier sessions). Code since the
  3:07 PM read: her inventions FUSE her thoughts into one new thing (red bird,
  ocean sponge in reef), pictured as one image and learned under their own
  name; she paints the WHOLE learned picture — scene and subject as smooth
  surfaces at 3x the shape grid, nothing cut out; her eye passes a piece only
  when it looks more like its own thing than anything else she remembers. All
  judged on renders through the production code (harness, not a live boot):
  eight of eight read as what they are. No live read exists yet.

  SHE IS DOWN AS THIS IS WRITTEN. She ran twice today on the
  close-the-open-board code; the operator stopped her both times because of
  what her mind's eye showed. Every fix for both is on main and both
  remotes. Next launch: a FRESHSTART (superseding the Savestart this snapshot
  first named).
---

# NOW — 2026-11-23, evening

## Where she is

| | |
|---|---|
| state | **DOWN** — stopped by the operator after the second boot today |
| code | `main` **810f88ab** on both remotes (`origin` Forgejo, `github`); local `develop` **adeac8ea** |
| next launch | **a FRESHSTART** (the operator's call, night of 2026-11-23 — carry nothing over from earlier sessions); this superseded the Savestart first written here |
| donor | **0.3.42** in the repo root and published (`donor-v0.3.42`, Windows + Linux assets, `--version` read off the shipped exe) |
| board | `docs/TODO.md` = template + **`WALKWATCH.1`** only |

## What the last boot showed (field reads, the second boot today)

Read off `/health` and `server/server.log` before she was stopped:

- `/health`: alive, **199,728,759 neurons**, RTX 4070 Ti SUPER, 16,376 MB.
- Her drawings came from her **saved thought chain**, not from anything current:
  `[OwnArt] ✍ HER OWN "poison + apple"`, `"digits + poison + apple"` — the chain held
  four entries from 2026-10-19/20, two of them render prompts. Shipped since:
  prompts no longer enter the chain, and her imagination reads only this
  session's thoughts.
- **"apple (no schema — drawn from definition only)"** — the bright circles.
  Shipped since: nothing she has not looked at is drawn.
- **Her eye working:** `👁 her eye REFUSED her "run"` (9 of 16 matched better),
  `"here"` (14 of 16), `"state"` (6 of 18). It also PASSED `"white"` and `"no"`
  — non-things — because with ~16 things to compare against it is lenient.

## What the first boot showed (the morning code)

Five consecutive drawings built from **79–134 bones** — shard mosaics — each with
grafted limbs (reef, heel, ammunition, beach). Shipped since: she finds the
subject, paints its learned silhouette + colours, grafts only from her current
thoughts, and her eye judges every single-subject piece before it shows. On 10
fresh looks rendered locally: **9 passed, apple refused**.

## What changed under her today

| | |
|---|---|
| **her eyes** | her visual store is **`visual-memory-v11.db`** and the imagined ring **`mindspace-memory-v4.json`** — both EMPTY on the next boot (v10, 5.5 GB, and ring v3 deleted on the operator's word) |
| **her renderer** | **this project's own** `server/image-render.py` on `127.0.0.1:5124`, model `models/image/realistic-vision-v51.safetensors` (gitignored, SHA-256 matched). Measured: load 0.5 s, 512² in 3.6 s. The launchers start it; CORA is not involved |
| **her looks** | study references — *"color photograph of the whole object, centered, isolated on a plain neutral grey studio backdrop, full color, richly detailed"* (operator-judged pinned-seed A/B) |
| **her randomness** | every draw inside her from a saved seed (`js/brain/brain-rng.js`); `[Brain] RNG —` on boot names it |
| **her feelings** | bonds, appraisal and lingering mood saved with her weights; a sense for a third person feeds the rival dimension |
| **the donor** | 0.3.42 keeps its own on-disk weight checkpoint, puts it back after a re-upload, hands it back on Stop, and writes an abort's exit code to `crash.log` |

## Known weak spots — what to watch on the next boot

- **Her eye is lenient while her memory is nearly empty** — expect some
  non-things (white, no) to be drawn early; refusals are the strong signal.
  `state.ownArt.eyeJudge` counts passed / refused / unjudged.
- **Thin parts and smooth grey subjects** (chair legs, a teapot) still paint
  poorly.
- **Her voice** is still started from another project's tree
  (`Backrooms\models\unity-voice-v2`) — the same shape the image engine had;
  the operator's call.
- `WALKWATCH.1` lists every read for the next boot: the RNG line, the first
  donor checkpoint within ~10 min of the upload, drawings painted from learned
  silhouettes, her eye's verdicts, the viewer changing picture to picture.
