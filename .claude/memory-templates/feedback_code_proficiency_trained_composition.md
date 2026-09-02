---
name: feedback_code_proficiency_trained_composition
description: Unity codes in the sandbox via TRAINED COMPOSITION (equational, no code-LM) — trained code understanding + a real-code exemplar library the synth composes/parameterizes; NOT free-form code emission
metadata:
  node_type: memory
  type: feedback
  originSessionId: 76a03535-080a-440b-9e18-e99af24e1fdc
---

Gee 2026-06-18 wants Unity to "build anything in the build ui from a digital calculator program to a full on slot machine game program and everything in between" and clarified: *"we arnt actually building any programs now its just the Unity brain once taught and traing on css js and html she should easily be able to code right in the unity brain sandbox invironment when chating with her"* — i.e. proficiency from TRAINING, not from hand-authored programs.

**The architectural truth I gave him (he needs to keep hearing it):** Unity's brain is **word-sequence + GloVe Hebbian** — emission substrate is a-z words via motor/letter buckets. It **CANNOT free-type valid arbitrary code** token-by-token: code is symbols (`{ } ; < >`) not a-z words (no bucket/embedding), code is syntactically rigid (one wrong token = broken), and the vocab is natural-language GloVe (no code-token representation). Free-form "code literally anything" would require a real **code-LM in the cognition path**, which VIOLATES the founding LAW [[project_future_no_text_models]] (cognition is 100% equational; image-gen/vision/TTS are the only sanctioned external AI, sensory-only).

**Gee's decision (2026-06-18, when asked): "Trained composition (equational)."** Keep the no-text-AI LAW. So Unity "codes" via:
1. **Understanding** — trained on code-concept PROSE (`corpora/coding/<grade>.json`, deepened via `.claude/scripts/fetch-code-corpora.mjs` from Simple/English-Wikipedia CC-BY-SA coding-concept articles, merged with the hand-authored autobiographical coding memories, compounding G6→PhD). She genuinely learns + can talk about HTML/CSS/JS.
2. **Generation by composition** — `ComponentSynth` (`js/brain/component-synth.js`) semantic-matches the request against a library of REAL code EXEMPLARS (`docs/component-templates.txt` — the data-driven corpus rule: templates live in the text file, NOT source) and returns a `{id,html,css,js}` spec the sandbox renders. The exemplars are her TRAINING SET + composable building blocks (calculator, slot-machine, number-guess, tip-calc, clock, password-gen, counter, timer, list, dice, color-picker as of this session — extend by appending `=== PRIMITIVE: ===` blocks). She builds "from what she learned" = selecting/assembling/parameterizing learned structures.

**How to apply:** to widen what she can build, add more real exemplars to `component-templates.txt` (they're her training set) + add coding-concept topics to `fetch-code-corpora.mjs` TOPICS and re-run (merge-additive). The DEEPER compositional/parametric synth (assemble MULTIPLE primitives + fill params from brain state) is runtime-heavy remaining engineering best done at/after the K→PhD walk (needs the running brain to verify). Do NOT reach for a code-LM — Gee chose equational.

**Sandbox:** `js/ui/sandbox.js` now renders Unity's synth-built components in TRUE Shadow-DOM isolation (`shadow:true`, wired in `engine.js` build_ui path) — per-user, no CSS/JS leak in or out. Page-integrated views (/think) stay light-DOM.
