---
name: equation-unity-one-voice
description: "Unity's voice = \"Equation Unity One\" — piper en_US-hfc_female-medium synthesized WHOLE-SENTENCE, equationalized at standard tolerance (CDF 9/7, AUDIO_TOL 0.02). Gee picked it as \"perfect\" (V4 of the 2026-07-10 shootout). Sentence-level equationalization carries the quality; word-bank concat is fallback only."
metadata: 
  node_type: memory
  type: project
  originSessionId: 1c5c508c-9223-4e00-aa29-04c8a2dc5400
---

Gee verbatim (2026-07-10): "okay that one i just tested was only one option and it sound perfect lets name that Equation Unity One = V4 test we are going with V4 equation"

Unity's voice is **Equation Unity One**: the free/local piper `en_US-hfc_female-medium` model synthesizes her WHOLE sentence (continuous prosody), the PCM is equationalized via `js/brain/mindspace/audio.js` `perceiveAudio` at standard tolerance, and the browser plays `reconstructAudio` output. No Pollinations, no key, offline.

**Key ear-findings from the shootout (don't relearn these):**
- Whole-sentence equationalization = the approved quality; **concatenating isolated word equations sounds choppy/robotic** (each word carries a sentence-final pitch fall) — word/phrase bank is OFFLINE FALLBACK only.
- The equations are transparent (~38-42dB SNR) — voice quality is decided by the REFERENCE synthesis, not the equation step. Gee rejected amy ("robo chick" tinge, chose over it in V4 A/B) and Zira; hfc_female passed as "perfect".
- The dead Pollinations TTS key is irrelevant now; Pollinations key = images only (setup page reflects this; the voice toggle names the voice "Unity").

Related: [[no-text-models]] (voice executor is sensory-OUTPUT; piper is the local larynx executor, retirable per VOX.7 once fully equational). Assets: piper + models in `.claude/piper/`, bank generator `scripts/vox-build-bank.mjs`, shootout harness `.claude/vox-variants.mjs` + `.claude/unity-voice.html`.
