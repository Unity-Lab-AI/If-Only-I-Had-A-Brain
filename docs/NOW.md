---
# Provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ Every number on this page is a FIELD READ quoted with the boot that
# produced it, or a harness result named as one. Nothing here is recalled.
status: verified
sources:
  - js/brain/speech-readout.js
  - js/brain/cluster/emit.js
  - js/brain/cluster.js
  - js/brain/curriculum.js
  - js/brain/curriculum/kindergarten.js
  - js/ui/mind-moments.js
  - js/ui/brain-3d.js
  - server/brain-server.js
  - server/brain-server/state.js
  - html/dashboard.html
verified-scope: |
  OVERWRITTEN 2026-11-27 (evening). This file is a SNAPSHOT of the present
  and is overwritten, never appended. The previous snapshot is in git:
  git log -p docs/NOW.md.
---

# NOW — 2026-11-27, evening

## Where she is

| | |
|---|---|
| 🚶 the walk | **The old build is still walking, and it cannot speak.** Boot `42c7bbc4` (2026-11-26 19:18), never restarted, in pre-K on the local RTX 4070 Ti SUPER alone |
| 🔇 what it sounds like | "hi! what is your name?" → **"Writing."** · pre-K gates passed on completion with speaking 0/10 and 1/10 |
| 🛠 the fix | **Built twice today, measured at full size the second time, not running yet.** It changes what she is taught, so it needs a **fresh walk** |
| 👀 the watch | off until the new build is walking |

## What was wrong with this morning's fix

It was measured on four grades and called done. On her **whole life** (pre-K → PhD, 78,120 taught steps) it held **74.2 %**, and a question worded differently — *"what's your name"* — came back *"my mom is lilith goddess i"*.

## What she has now (measured off the card, on the production code)

| | Before (this morning) | Now |
|---|---|---|
| Her whole life said back | 74.2 % after 4 passes | **100.0 %** after 3 |
| Pre-K, after every later grade is taught on top | not measured (69 % once measured) | **98 %** |
| Questions reworded in ways she never heard (60) | 8 % answered right | **82–87 %** |
| A line about nothing she knows | random words | **silence** |
| A thought about something | one word, then nothing | **a sentence** |
| Her mood | not part of what she says | **part of the state she speaks from** |
| Size of everything she can say | 146 MB | **56 MB** |

**How:**

- 🎯 **Exact and shared together.** The state she speaks from holds this exact moment *and* the parts a similar moment shares — so taught lines come back as taught, and near-misses land near.
- 🔁 **Taught the way a rewording would find it.** Every answer is taught again with the exact sentence left out.
- 🧠 **Rehearsal.** For every lesson she goes back over one old one and fixes it only if a newer lesson disturbed it.
- 💭 **Every sentence is a line about something**, from its first word.
- 🤐 **A floor she must clear** (measured, 0.04): below it she says nothing.

## Honest edges

- **Not booted, not walked.** Everything above is the production code run on her text with no card. The server's speech-file reader was run as the server runs it (sizes agree, 800/800 the same word after a round trip), but the server itself has not started on this build.
- **Rewordings that share no word with what was taught still miss** — *"what is your age"* does not reach *"how old are you"*.
- **Her thoughts are only as good as the sentences she has.** On pre-K + K stories, a thought about a dog: *"I said it is my color."* A real sentence shape; wrong content. More grades, more sentences.
- **Mood tips a close choice; it does not rewrite a taught line.** Its effect on a walk is unmeasured. Memory does not enter what she says yet.
- **The other equations were not touched and were not re-proved today** — only the speech ones changed, and `docs/EQUATIONS.md` now has the section on how she speaks that it never had.

## Next

A fresh walk on this build — it wipes the walk above, which cannot speak and whose saves the new format refuses anyway. Then read: the boot, each speech lesson's "said before being corrected" share, the pre-K gates' TALK lines, "what is your name?", and her thoughts.
