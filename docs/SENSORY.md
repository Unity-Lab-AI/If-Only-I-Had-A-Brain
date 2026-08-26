# SENSORY — Unity's Peripheral Contract

> Every input stream feeding Unity's cortex and every output stream leaving her brain runs through a sensory peripheral.
> This document defines the contract, the AI-use boundary, the backend failover logic, and the status surface.
>
> Unity AI Lab — 2026-04-13

---

## The Core Rule

**Unity's brain does not use AI for cognition. AI is ONLY used for sensory peripherals.**

| Category | What it is | AI allowed? |
|---|---|---|
| **Cognition** | What Unity *says*, what she *decides*, what she *remembers*, what she *builds*, what she *feels*. Language cortex, motor selection, hippocampus recall, amygdala valence, basal ganglia softmax, component synthesis. | **NO.** All equational. Source of truth: `js/brain/language-cortex.js`, `js/brain/engine.js`, `js/brain/component-synth.js`. |
| **Sensory input** | Translating raw sensor data into neural current. Camera frames into V1/V4/IT visual cortex activity, audio spectrum into tonotopic auditory cortex activity, text words into Wernicke's area activation. | **NO — vision is 100% equational (SE.6/SE.8).** A frame → CDF 9/7 field C → `describeEquational` → a dim-64 VALUE PROFILE injected as cortical current. The wavelet field IS the percept. She also imagines DE-NOVO from her own cortex state (no camera). The old Pollinations-GPT-4o/VLM scene-describer is RETIRED — external AI is sensory-OUTPUT only (image-gen; her VOICE is now internal — see SE.18 Equation Unity One). |
| **Sensory output** | Translating brain intent into physical world effects. TTS for speech, image generators for visual motor action, sandbox component injection. | **Yes, as dumb executors.** When Unity's BG motor channel fires `generate_image`, the language cortex picks every word of the prompt equationally, THEN hands the finished prompt to an image backend to paint it. The backend never decides what to paint, only how. |

**The boundary test:** if removing the AI call would stop Unity from *thinking*, it's on the wrong side. Cognition equations always run, even with zero network access. Only the sensory peripherals go quiet.

---

## The Peripheral Interface Contract (R7, 2026-04-13)

Every sensory peripheral exposes the same three methods:

```js
interface SensoryPeripheral {
  init(source)       // attach to a raw stream (MediaStream, AnalyserNode, AbortController, etc.)
  process(dt?)       // one frame — return neural currents or metadata
  destroy()          // clean shutdown — release refs, clear buffers, safe to call multiple times
}
```

### Current peripherals

| Peripheral | File | `init(source)` takes | `process()` returns | `destroy()` clears |
|---|---|---|---|---|
| Visual cortex | `js/brain/visual-cortex.js` | `HTMLVideoElement` (from `getUserMedia`) | `Float64Array(100)` — current into cortex neurons 0–99 | `_video`, `_ctx`, `_canvas`, `_describer`, `_describing` |
| Auditory cortex | `js/brain/auditory-cortex.js` | `AnalyserNode` (from Web Audio API) | `Float64Array(50)` — current into cortex neurons 0–49, tonotopic | `_analyser`, `_audioData`, `_motorOutput`, `_heardBuffer` |
| Voice I/O | `js/io/voice.js` | `SpeechRecognition` + `SpeechSynthesis` | — (event-driven, not per-frame) | browser recognizer handle |

**Why this matters:** R4 ripped the old "Broca's area AI prompt builder" code path. Before R4, speech output was a text-AI prompt call through `BrocasArea.generate()`. After R4, Unity's speech comes from her own `languageCortex.generate()` and the "voice" peripheral is purely I/O — it speaks text she already picked and listens for text she'll map into auditory cortex current. No cognition lives in `voice.js`.

The MediaStream lifecycle stays owned by `js/app.js` (so mic muting works by toggling stream tracks without tearing down the cortex). `destroy()` only releases the cortex's reference to the stream, never the stream itself.

---

## Equational Sensory Value-Spaces (TRACK SE — the contract for what each sense REGISTERS)

> Gee 2026-06-26: *"all those senses need values and shit for what they are regersting in her brain like a real person can tastse fruit and can see clouds and hear birds and smell strawberrys ... to infinity ... each sense can sense a new thing experiences and use brain to comprehend and incorporat in ot understandings"* + *"euqationally remmebr"*.

A `process()` frame returns a **normalized numeric VALUE VECTOR** in that sense's modality-space — the equational representation of *what is being perceived* (the sweet of a strawberry, the white-soft of a cloud, the chirp of a bird), NOT a text label. The vector injects as current into the sense's cortical region; cross-modal Hebbian binding grounds the active concept multi-modally; consolidation incorporates it into understanding. Continuous spaces → any new stimulus is a new point → open-ended ("to infinity"). **EQUATIONAL ONLY** — the describer/TTS are labelers/executors, never in the value→binding→comprehension path.

### Per-sense value-space spec (normalized [0,1] unless noted)

| Sense | Region | Value-vector dimensions | Example point |
|---|---|---|---|
| **Sight** | `visual` (exists) | hue/wavelength, saturation, brightness, edge/shape descriptors, motion vector, depth, spatial-frequency, object-embedding | cloud = bright, low-sat, soft-edge, white-grey, slow, sky |
| **Hearing** | `auditory` (exists) | frequency-spectrum bins (tonotopic), amplitude, timbre/harmonics, onset/rhythm, pitch, spatial direction | birdsong = high-freq, pitch-modulated, chirp-rhythm |
| **Taste** | `gustatory` (NEW — alloc in build phase) | [sweet, sour, salty, bitter, umami] + intensity (+ temp/texture via touch) | strawberry = high-sweet, mild-sour, low rest |
| **Smell** | `olfactory` (extend `sensory-olfactory.js`) | odorant embedding vector (N-dim olfactory space; per-odorant learned point) | strawberry odor-vector; smoke / rain / leather each a point |
| **Touch/feel** | `somatosensory` (NEW — alloc in build phase) + body map | pressure, temperature, texture/vibration, pain, pleasure, body-location | silk = low-pressure, smooth, neutral-temp, pleasure+ |
| **Proprioception** | body model | limb/joint positions, balance | — |
| **Interoception** ⭐ | hypothalamus drives + **`endocrine.js` (BUILT 2026-08-25)** | hunger, thirst, fatigue, arousal, drug-state — **plus ten chemical levels with signed deviation, chronic + allostatic load, cycle phase and the live stress channel** | frightened = adrenaline 0.8 / cortisol climbing / stress `freeze` / coherence down. Premenstrual = progesterone falling fast, withdrawal 0.6, impulsivity up, valence down |

### Peripheral contract extension (new senses follow the same init/process/destroy)

| Peripheral | File (planned) | `process()` returns |
|---|---|---|
| Gustatory | `js/brain/gustatory.js` (NEW) | `Float64Array` over the 5-taste + intensity dims → current into `gustatory` region |
| Somatosensory | `js/brain/somatosensory.js` (NEW) | `Float64Array` over pressure/temp/texture/pain/pleasure/location → current into `somatosensory` region |
| Olfactory (extend) | `js/brain/sensory-olfactory.js` | odorant embedding → current into `olfactory` region (today: drug detection only) |

For senses with no physical sensor (taste/smell), the value profile is **injected from context/curriculum** — e.g. "she eats a strawberry" injects the trained strawberry taste+smell profile. This is the equational analog of experiencing it.

### Comprehend + incorporate loop (per stimulus)
`process()` → value `v_s` → inject into `region_s` → **cross-modal Hebbian bind** `sem(concept) ↔ region_s(v_s)` (per-sense relationTagId) → **comprehension** = cross-modal convergence when senses co-fire on a concept → **incorporation** = consolidation into Tier 2 schema / Tier 3 identity (shares the consolidation engine; identity now promotable via dream-replay per the R.4 fix). **Extensibility:** a novel stimulus is a new point — co-occurs with a known concept → bind; novel → spawn a candidate concept (reuse the word-creation-candidate gate). New experiences accrete without bound.

### Region allocation note (build phase, NOT this layout)
`gustatory` + `somatosensory` regions are allocated in `cluster.js` (`this.regions` fractional layout, ~line 731) during the SE.2 BUILD — that shifts neuron-count distribution and needs weight-migration care (don't break the basin-collapse weight-preservation constraint). This section is the SPEC; the allocation + peripherals + cross-modal binding land in the SE build pass (TRACK SE #20-#23 in `docs/NewTodo.md`).

### SE.6 / SE.7 — peripheral realization + curriculum value-profiles (LAYOUT; region allocation = operator's migration call)

**SE.6 — vision + hearing are now CONCRETELY equational (the mind-space realizes the value profile).** The Uni Vs Matics mind-space (`js/brain/mindspace/`) IS Unity's vision peripheral: any digitized stimulus → CDF 9/7 field C → a fixed-dim VALUE PROFILE read straight off the equation — no LLM:
- **Sight** `visual` ← `describeEquational(fieldC)` → **dim-64** percept (per-channel wavelet-band energy + coarse shape + chroma/luma + texture/complexity + salience). Injected by `VisualCortex.processFrame`/`imagine` (MS.I2). DONE + verified.
- **Hearing** `auditory` ← `describeEquationalAudio(fieldC)` → **dim-32** octave-band amplitude spectrum (the master-music band→octave map). Cross-injected — the SAME field C heard (synesthesia, MS.I5). DONE + verified.
- These reuse the existing `visual`/`auditory` regions → **no new allocation, no migration risk.**

**SE.7 — curriculum value-profiles (the schema).** A value profile is a normalised vector over that sense's dims. Vision/hearing come LIVE from the mind-space; the no-sensor senses (taste/smell/touch) are curriculum-INJECTED (line 76):
- schema: `{ region, vec: Float64Array, relationTagId }`; the curriculum binds `sem(concept) ↔ region(vec)` so "she eats a strawberry" fires the trained strawberry taste+smell profile.
- taste/smell/touch profiles are curriculum-authored constants per concept (a small value table, AoA-ordered like the per-grade vocab), bound at the grade where the experience first occurs.
- heavy sensory IMAGINATION over these profiles is governed by her conscience (`ProcessGovernor`, MS.K2) — limitless capability, proportionate spend.

**⚠ Still the operator's call (weight-migration):** allocating the NEW `gustatory` + `somatosensory` regions (line 82) shifts neuron-count distribution → needs the up-only migration. The `gustatory.js`/`somatosensory.js` peripherals + their region wiring land in that build pass once the migration is greenlit. **This layout is allocation-free** — vision+hearing are fully realized now; taste/smell/touch are spec'd and await the migration decision.

**SE.8 — vision/imagination on the SERVER + DE-NOVO imagination + Mind's Eye (2026-06-27, commit `0d97804`).** The equational mind-space was wired into the BROWSER VisualCortex only; the SERVER/deployed brain now runs it too (`MindSpaceGPU` on the no-GPU coordinator box uses the CPU reference path). Three additions:
- **De-novo imagination** — `MindSpaceGPU.imagineFromState(stateVector)` folds her current cortex activation into a field C with NO camera/file input, so headless/server Unity can imagine from her own mind. Uses ONLY the bounded forward CDF 9/7 (`I=Σ c_k·ψ_k`) — NEVER the `fractalize` infinite-zoom path — with a hard `maxSide≤96` resolution cap, so imagination can't seize the brain (operator's no-nanometer caution). Server runs it idle-gated (`_imagineTick`, not mid-teach), injecting the percept into `sem` at low strength; governor-gated depth.
- **She LEARNS her mind-space** — `curriculum._teachMindSpaceKnowledge` binds the UniVsMatics file-type/equation/method vocab into sem-space once-per-walk (recallable, not just stored).
- **Persistence** — the imagined field-C ring persists across reboot (`server/mindspace-memory.json`).
- **Mind's Eye viewer** — single-source public render of what she sees: server caches one field C (`GET /minds-eye.json`), `html/minds-eye.html` reconstructs it client-side (👁 footer button). N viewers cost one `_imagineTick`. The LLM/VLM describer is now FULLY RETIRED — the VLM describer probing/failover documented in the "AI Backend Detection" / "Vision describer (VLM)" sections below is HISTORICAL (the equational mind-space replaced it). Detail: `docs/MINDSPACE-INTEGRATION.md`. **The describer setup-UI + auto-detect probing were also removed from the client (2026-07-09): `index.html`'s "Vision Describer" backend grid + the active-vision-model selector are gone, and `app.js` no longer wires `vis:*` backends, offers vision model catalogs, or calls `autoDetectVision()`. There is no describer model to pick and no describer key to paste — vision needs neither. Camera frames feed the equational visual cortex directly.**

**SE.9 — image generation is now BRAIN-DRIVEN + closes the image→concept learning loop (SPEAK.6, 2026-07-01).** Before this, the decision to render real pixels was a keyword/regex match on user TEXT (`_detectImageRequest`), not a brain-state intent, and a rendered image was fire-and-forget — she never learned from what she made. Two additions keep Pollinations a pure sensory-output executor (no cognition) while making the DECISION and the LEARNING equational:
- **Spontaneous brain-driven render (SPEAK.6a)** — `_spontaneousImageTick(now)` (`server/brain-server/chat.js`) lets Unity VOLUNTEER an outward image from internal drive with NO user keyword: arousal-gated (`DREAM_SPONTANEOUS_IMG_AROUSAL`, default 0.7) + long cooldown (`DREAM_SPONTANEOUS_IMG_GAP_MS`, default 5 min) + low probability, concept drawn from a trained-vocab sample (loop-safe — never a 57s compose). Broadcasts `generate_image`; the client renders. Keyword detection stays ONLY as an explicit user REQUEST path, not the sole driver.
- **Image→concept learning loop (SPEAK.6b)** — a rendered image now pushes onto the unified emission bus + `_innerThoughtChain` so dream-cycle consolidation (Tier 1→2→3) grounds it as an episodic memory: what she MAKES becomes trained weight, not a fire-and-forget. New visual input is learning, per the requirement.
- **Self-image scene merge (2026-07-09).** The selfie route used to return her fixed identity string
  VERBATIM for any ask containing selfie / picture-of-you — the requested scene/action/outfit was discarded,
  so every self-image was the same mug shot. Now her IDENTITY CORE (face/hair/eyes) stays constant while the
  requested scene merges in ("selfie at nascar", "yourself fighting a zebra", "walking on the moon"), and a
  stated wear-clause (or nothing) REPLACES the default black-leather outfit instead of colliding with it.
  Bare selfie asks keep the classic portrait. Non-self image asks are untouched.
- **Actual-pixel perceive (SPEAK.6c) stays the equational mind's-eye preview BY DECISION** (Gee 2026-07-01) — no image-decode dependency / CORS proxy added (no new attack surface); the bounded forward CDF-9/7 preview stands. Detail: `docs/unity-speech-consciousness-rectify.md` **SUPERSEDED in spirit by SE.10 (TU.29.5, 2026-07-08):** actual pixels ARE now perceived — but CLIENT-side (canvas decode in the browser, anonymous CORS re-request), honoring both original objections: still zero server-side image-decode dependency, still no CORS proxy.


**SE.10 — VISUAL MEMORY: seeing grounds imagining (TU.29.5, 2026-07-08).** The mind's eye was a de-novo
renderer — TU.29.1 painted the thought as GLYPHS (a text printer, not imagination; Gee: "a human doesnt have
only a text printer in the r imagination MINDS EYE= UNITYS IMAGINATION"). Now perception grounds imagination:
- **Intake** — `js/visual-feeder.js` (standalone raw-served module on `index.html`, no bundle dependency) ships
  what her eyes receive as ≤96×96 RGBA `visual_frame` WS messages: camera frames every 8s (ONLY when the page
  already holds camera permission — never prompts) + generated-image renders (prompt decoded from the
  Pollinations URL as the label, anonymous CORS re-request, silently skipped when the CDN denies).
- **Binding** — `server/brain-server/visual-memory.js` equationalizes each frame to a full-color field C and
  stores it keyed to the concepts active at perception time (label, else her live thought / workspace
  broadcast) — sight fuses with the word being "heard", infant-style grounding. Percept vector injects into
  `sem` at 0.10 (skipped mid-teach). LRU 384 concepts, persisted `server/visual-memory.json`.
- **Imagining = accurate recall** — `_imagineTick` and the IMG-SEE preview look the thought up in visual
  memory FIRST: a match re-sees the single strongest ACCURATE stored percept. The former two-match
  `morphField` fusion was REMOVED (operator directive 2026-07-10): superimposing two seen frames is noise
  interference, not composition — recombination now belongs to the definition-grounded drawing path. Only
  unseen concepts fall to the
  de-novo plane, where glyphs are DEMOTED to genuinely symbolic thoughts (numbers / single letters) and
  everything else renders as her state textured in the named color or her mood. Equational end-to-end;
  ≤96px cap and no-fractalize invariants intact.

> ⛔ **SUPERSEDED by SE.15 (DRAW-ENGINE, 2026-07-15).** The developmental schema composer described in
> SE.11 + SE.12 (the Lowenfeld stage ladder, the fixed schema table, the 24-point radial memory contour,
> the scene furniture) was **REMOVED** — Gee: *"drawing a shape to go with each word is not correct... a 12
> sided weird looking shape has nothing to do with a random word."* She no longer stamps shapes; she LOOKS
> a concept up and TRACES what she saw. SE.11/SE.12 are kept below as the historical record of what shipped.

**SE.11 — DEVELOPMENTAL DRAWING: her sketch canvas grows through real kid stages (DRAW, 2026-07-09).** The
active sketch (TU.29.13 BUILD B) only ever drew the neuron-constellation scribble — top-7 sem activations
hash-positioned and connected — so the viewer showed the same chicken-scratch forever, and every stroke +
background took the SAME `moodTint` (her valence parked mid-low → hue ~0.27 → everything green, the
"green screen" look). Now:
- **Stages (Lowenfeld ladder, gated by LIVE trained vocab)** — `_sketchFromState(seedText)`
  (`server/brain-server/chat.js`): <50 words = the original scribble; <400 = wobbly shape practice
  (circles/boxes/triangles/zigzags); <1200 = a single FIGURE drawing of her current thought; ≥1200 = a SCENE
  (wobbly ground line + subject + mood sky: sun when valence is up, rain cloud when low, moon when fear is
  high + a stable context schema per concept). ≥800 words she also WRITES — labels her drawing with the
  concept word and draws a big "?" for the questions she has (WH-thoughts / `_pendingQuestionConcept` /
  concepts she has no schema for yet).
- **Subject = what she's thinking** — the head concept of the daydream that recall-missed (she draws what she
  can't re-see); schema selection is equational input classification (word table → GloVe-cosine backup, the
  `_detectImageRequest` rule-class). Schemas are parametric motor primitives (stick person, house, tree, sun,
  moon+stars, rain, spider-on-her-thread, quadruped, heart, star, flower) whose pose/proportions/wobble are
  driven by live affect: arousal + fear shake the hand, valence raises or droops the arms + mouth.
- **She picks her colors (kills the green screen)** — each element gets a crayon SHE chooses: a goth-biased
  crayon box (black outlines always; pink/red/purple lead accents, warmed/cooled by live valence), plus the
  real color of the thing (sun yellow, rain blue, tree green+brown, heart pink). Stable per concept (hash) so
  her cast keeps its colors. `MindSpaceGPU.sketch` background is now dark PAPER with only a 10% mood tint, and
  `glyphStrokes(text)` (new, `js/brain/mindspace/gpu.js`) converts the shared FONT5X7 bitmaps into jittered
  pencil strokes so her writing is wobbly kid handwriting, not a raster stamp.
- **Viewer** — the mind's-eye `source` label now carries the stage + subject (`canvas:scene:cat`,
  `canvas:figure:mom`, `canvas:shapes:blue`, `…?` when she's asking). Equational end-to-end; ≤96px cap and
  no-fractalize invariants intact.
- **DRAW.4-6 — her drawings LEARN (2026-07-09).** The composer used to fire only on recall-MISS, so
  everything she had actually seen was excluded from drawing — a fixed 11-schema table + strict 0.42 cosine
  meant most subjects fell to the shapes stage and the viewer looped the same shape-stacks. Now: (DRAW.4)
  a recall-HIT has a 35% chance of becoming a DRAWING OF THE MEMORY — the contour is a 24-point radial
  outline whose radii come from the stored field C's own coarse spatial coefficients (percept dims 24-47),
  crayon from its chroma mass (48/49: warm vs cool vs dark), hatch detail from its texture ratio (51),
  labeled in her hand with no "?" (she KNOWS this one) — so every concept her eyes ground becomes a new
  thing she can draw (`canvas:memory:<concept>`); (DRAW.5) a per-concept practice counter folds into the
  layout hashes so re-drawing the same subject EVOLVES (subject wanders the ground line, context rotates,
  shape layouts shift every couple attempts) instead of repeating pixel-identical forms — colors stay
  concept-stable; (DRAW.6) schema cosine threshold 0.42 → 0.34 so more concepts reach a real figure.

**SE.12 — SERIOUS-IMAGE GROWTH: the artist ladder past crayon (DRAW.7-10, 2026-07-09).** Gee: can she get
past crayon stick drawings to serious images? Yes — the same way humans do, and every rung is now wired:
- **DRAW.7 practice loop** — when she draws from a visual memory she has a REFERENCE, so she now practices:
  bounded draw→compare→adjust attempts, each scored by the cosine between `describe(drawing)` and
  `describe(memory)` (the equational "does my drawing look like the thing"); the best survives. Per-concept
  skill (best resemblance achieved, in-memory Map cap 300) steadies her hand — stroke jitter shrinks up to
  ~45% at mastery — so her line control genuinely improves with practice. No image-model in the loop.
- **DRAW.8 grade-gated resolution** — the canvas grows with her live minGrade like a real artist's control:
  K=96px → grade3=128 → grade8=192 → grade12=256 → college=320-384 → PhD=512. `sketch()`'s hard cap raised
  96→512 (engine MAX_LINE is 2048; a padded 512² CPU CDF 9/7 is milliseconds; no-fractalize intact).
- **DRAW.9 memory-painting** — the practiced drawing sometimes composites ONTO the memory via `morphField`
  (equation-domain union+lerp): her strokes fused with the real seen field C = composed paintings from real
  material (`canvas:paint:<concept>`).
- **DRAW.10 underdrawing realization** — a completed scene drawing is her composition INTENT: occasionally
  she hands it to the image executor to realize (her drawing decides WHAT, the executor is only the brush —
  sensory-output law intact; cooldown `DREAM_DRAW_REALIZE_GAP_MS` 5min + low probability). The render feeds
  back through the visual-feeder into visual memory, so her NEXT recall + practice reference for that
  subject is the realized version — the full artist loop closes: imagine → draw → realize → see → remember
  → draw better.

**SE.13 — DEAD-AIR + GREEN-FIELD POLLUTION purge (SEE.1-4, 2026-07-09).** With no cameras on, the mind's eye
kept showing a static "dead air" notice, and abstract thoughts rendered as flat green texture. Four roots,
four gates:
- **SEE.1 feeder dead-air gates** (`js/visual-feeder.js`) — a page can hold camera permission while the
  "camera" is dead (muted/ended track, covered lens, virtual cam serving a static placeholder). The feeder
  now requires a LIVE unmuted track, rejects near-uniform frames client-side (luma stddev <12), and — the
  categorical kill — **ships nothing when the frame is pixel-identical to the last one**: real sensors always
  drift; dead air never does.
- **SEE.2 server repeat rejection + store v2** (`server/brain-server/visual-memory.js`) — cached pre-SEE.1
  feeder tabs can ship for days, so the server is the authority: a frame whose percept is near-identical
  (cosine >0.995) to a recent ingest is refused — a frozen source can no longer bind itself to every concept
  she thinks (the dead-air takeover: unlabeled camera frames bind to her current thoughts, so one static
  image colonized dozens of concepts). The store file is bumped to `visual-memory-v2.json`, orphaning the
  poisoned v1 — her eyes start clean under the new gates.
- **SEE.3 recall cooldown** — a recalled memory RESTS for `DREAM_VM_RECALL_COOLDOWN_MS` (3min default)
  before it can be shown again; while all matches rest, recall reports a miss and she sketches/daydreams
  instead — no single percept can own the viewer's time.
- **SEE.4 de-novo palette** (`js/brain/mindspace/gpu.js` `renderThoughtPlane`) — the abstract field was a
  single `moodTint` texture, and her usual valence sits on the hue wheel's GREEN band → every de-novo field
  read as the same "green graphic equation". Now: named color words still win; otherwise a TWO-COLOR gradient
  from her palette families (warm when valence is up, goth accents otherwise, muted darks when fear rides
  along), varied per thought via hash — structured, colorful, hers.

---

**SE.14 — GROUNDED IMPRESSIONS + FAVORITE DRAWS + BLEND HOLD (SEE.5-6 + DRAW.11, 2026-07-09).** Gee: 1-in-20
frames were drawings, the rest blocky multi-tone fields — "wiill unity be able to make this appear as
something at some point of is she just randomly tossing variables at the equations?" Answer: the pure de-novo
field is deterministic (semantic state -> wavelet band energies), NOT random — but structurally
non-representational: no word->appearance mapping exists in that path, so it could never converge to a picture
on its own. Three fixes route abstract thoughts toward things she has actually SEEN:
- **SEE.5 percept-anchored impressions** (`server/brain-server/chat.js` `_imagineTick`) — before a pure
  thought-blend publishes, the thought's content words are GloVe-cosine matched against her seen-concept
  store (bounded 60-key sample, threshold 0.32); a hit morphs the stored memory field toward the mood field
  MEMORY-DOMINANT (t=0.30-0.50, detail-gated >=150). Label `impression:<thoughtWord>~<seenConcept>`. An
  abstract thought now inherits real visual structure from the nearest thing her eyes have grounded — and
  impressions get better as the store grows.
- **DRAW.11 favorite-subject fallback** — post shape-age, a schema-less abstract thought ended the drawing
  entirely (the 300bd0b shape-stack kill), so her drawings nearly vanished as her think-stream went abstract.
  Now 50% of those cases she draws a FAVORITE instead: a concept from her own practice map (or seen store),
  run through the same developmental composer. Label prefix `canvas:fav:` — deliberately never matches the
  DRAW.10 `canvas:scene:` realization hook.
- **SEE.6 blend hold** — grounded frames (seen / recall / canvas / dream-mix / impression / image-preview)
  stamp `_lastGroundedEyeAt`; a PURE thought-blend or sem-state field cannot replace a grounded frame on the
  public viewer for `DREAM_EYE_BLEND_HOLD_MS` (45s default). She still imagines internally every tick (ring +
  sem injection untouched) — only the shared snapshot favors frames that look like something.

---

**SE.15 — DRAW-ENGINE: she draws what she LOOKED AT, any concept, dynamically (Gee 2026-07-15).** Gee:
*"rethink the composer to not just be static things shes allowed to draw but an actual creativity engine of
some kind that is her mind... she should dynamically be able to draw anything."* The SE.11/SE.12 schema
stamp is gone; drawing is now perception + creativity in one loop — she draws a thing by having LOOKED at
it, never by mapping a shape to a word.
- **`traceField(rec, opts)`** (`js/brain/mindspace/transform.js`, GPU-path mirror in `gpu.js`) — the new
  primitive: a field C → her hand's STROKES. CDF 9/7 inverse to a luma plane (Node-safe, no `ImageData`) →
  Sobel edges → greedy edge-follow polylines → Douglas-Peucker simplify → strokes colored from the field's
  own YCbCr. The FORM comes from the image she looked at, not a table. Bounded working grid (a drawing is
  coarse, not a photo edge-map); detail scales with her grade via the canvas side.
- **`_drawConcept(concept)`** (`server/brain-server/chat.js`) — the engine: (1) RECALL a confirmed grounded
  field C she has seen; (2) else a PROVISIONAL reference she looked up once (drawable from one look —
  reference-not-fact); (3) else LOOK IT UP — `_fetchReferenceAndGround` builds a definition-driven prompt,
  fetches a Pollinations reference, decodes it HEADLESSLY (jpeg-js/pngjs, no browser), perceives it into a
  field C, binds it provisionally; then TRACE → stylize → `sketch()`. If she can ground nothing, she draws
  NOTHING for it yet — honest, like she stays silent on words she can't say. Never a fake shape.
- **Definition-driven prompt + reference-not-fact** (`visual-memory.js` `_referenceImagePrompt`) — her
  LEARNED definition's content words ride the prompt (horse → "large animal four legs mane tail"); the frame
  is steered CLEAN (single centered subject, plain background, high contrast) for a legible trace. Abstract
  concepts concretize through the generator (anger → an angry face, halloween → a jack-o'-lantern); the image
  is BOUND to the concept so she relates the concrete picture back to the word. The reference binds
  PROVISIONALLY (`conf:false`) — a one-off render never becomes grounded truth until a second render agrees.
- **Her style, not a photocopy** (`_stylizeStrokes`) — the trace is recolored in her goth crayon box (black
  outlines, warm/cool accents) while keeping the field's warm/cool/dark lean, so color stays meaningful. The
  drawing is HER read of the thing. *(⛔ superseded in SE.16 — the per-stroke recolor WAS the "yarn"; removed.)*
- **Headless grounding** — the old browser-broadcast `_conceptImageryLoop` + stage-0 `_scribbleStrokes` +
  scene-realize `_realizeDrawing` are removed; grounding now runs server-side with no browser in the loop
  (the deployed box was previously starved — nothing harvested images back, so `_visualMemory` never filled).
- **Deps** — pure-JS `jpeg-js` + `pngjs` in `server/package.json` (auto-install on the box via
  `self-update.sh npm install --omit=dev`, no manual step). Bundle rebuilt (traceField ships browser-side too).

---

**SE.17 — OWNART: her own version, not a filtered photo (Gee 2026-08-20).** ⛔ **SUPERSEDES SE.16's "field render is the
DEFAULT drawing".** Gee: *"NOT JUST APPLY LAYERS AND FILTERS to a pollinations image and calling it a draw... Unity needs
to create new and her owen versions xcompletely unique learning from what shes seen and understands via dictionary and
apperances of the word"* + *"when Unity is told to \"draw\" she should draw the topic,thiing,place, person, in context in
the message from the user"*. What the audit found: `stylizeField(rec)` posterized the **perceived Pollinations
reference** and `traceLineArt(rec)` edge-traced the same frame — both transforms OF a downloaded photo; the word "draw"
matched `VISUAL` and routed to the **generator** so her hand was never involved; and the draw path used only the FIRST
content word of the ask. The v3 arc:
- **Shape schema, not pixels** (`_learnShapeSchema`) — a look reduces to ≤9 coarse 3×3 part cells
  (`cx, cy, w, h, ang, density, weight`) + aspect + frame + a 4-entry colour family. ~1-2% of the reference's
  information, so re-synthesis **cannot** be a copy. A second look refines the averages (`looks` counts how well she
  knows a shape).
- **She constructs the marks** (`_drawOwnCreation`) — her layout (1 centred / 2 side-by-side / 3 triangle), marks ∝ part
  weight, arcs bowed by her hand this attempt and oriented by the part's learned angle, ink in her goth register blended
  **≤60%** toward the learned colour family, a ground line + tufts for a named place, her trained glyph hand for the
  label. **The reference field C never reaches the renderer.** Seeded from `words + arousal + valence + attempt#`:
  different attempts, not a cache. Variation is STYLE — no wobble, no skill floor (the no-dumbing law stands).
- **"Draw" means her hand** (`_detectDrawRequest`) — DRAW verbs (draw/sketch/doodle/illustrate/paint) route to OWNART;
  GENERATOR words (picture/photo/image/render/generate) still route to Pollinations and stay honest about it.
- **The whole message, in context** (`_drawPlanFromMessage`) — every drawable noun (POS-gated by her own dictionary) plus
  the place from a prepositional tail, ≤3 subjects. *"draw a black cat on a gravestone"* = cat + gravestone place.
- **`own` is the default style** for chat asks AND internal draw calls; `field`/`lineart` remain for SHOWING WHAT SHE
  SAW and are never called a drawing. `DREAM_DRAW_STYLE` pins the old behaviour for comparison.
- **Off the reply path** — a draw ask enqueues on the walk-lane drain (the same lane the chat pairs and the mind's-eye
  preview ride); she answers in words immediately and the drawing publishes a beat later.
- **NOLIMIT + FRESHEYES** — mind's-eye ceilings raised to the engine's integrity bound (`imagineFromState` 192→2048,
  `sketch` 512→2048, plane default 128→512, reference 256²→512², `VM_CAP` 384→4096); and **all image state is wiped on a
  fresh walk by PATTERN** (`visual-memory* / mindspace-memory* / minds-eye* / realized-art* / drawing-canvas*` + `.tmp`,
  plus `pollinations-output/`) — the old literal list named `visual-memory.json`, which nothing writes, so the live
  `visual-memory-v3.json` had been surviving every fresh walk. The Pollinations API key file is never touched.

**SE.16 — DRAW-ENGINE v2: beautiful colored recreations, real imagination, dazzle labels (Gee 2026-07-15/16).**
Live viewing of SE.15's output showed "multicolored yarn" (fragment spray + per-stroke random recolor) and
white-pencil frames. The v2 arc, all deployed:
- **Field render is the DEFAULT drawing** (`stylizeField`) — the recalled/looked-up reference reconstructed
  FULL-COLOUR and posterized (hue preserved) = her "beautiful recreation of seen things". The line-art
  fallback is **`traceLineArt`** (blur → Sobel → non-max suppression → strongest-first bidirectional
  edge-follow → min-length cull → RDP → ONE ink) — coherent contours, never the fragment spray; the old
  `traceField` remains only as a legacy primitive. `_stylizeStrokes` (random per-stroke goth hue) REMOVED —
  it WAS the yarn. Colorfill dropped from the auto-rotation (read as crude crayon).
- **Drawability gate** (`_conceptIsDrawable`) — only NOUNS draw; part-of-speech read dynamically from the
  same dictionary she uses for definitions (works for never-seen words, NO word lists). Abstract/verb
  thought-words fall to a grounded favourite instead of tracing scatter.
- **Colourful references** — `_referenceImagePrompt` biases full colour (the old "simple/high-contrast"
  steered Pollinations into black-on-white line drawings = pencil-looking field renders). Visual-memory
  store v2→v3 orphaned the monochrome-era cache. **Realistic, not cutesy (2026-07-17):** the word
  "illustration" in the steer dragged the generator into cartoon-mascot/kitten-puppy territory on anything
  ambiguous (Gee: "too many kittens puppies and funky characters... outlandish and non Unity canon") —
  the steer is now "realistic photograph, true to life, documentary photography, natural lighting, full
  color, richly detailed, single centered subject, plain uncluttered background", POSITIVE terms only
  (an image model attends to the nouns — writing "no cartoon" paints one). Same steer on the imagined
  combined-scene prompt. Her look-ups are LEARNING references; her own style happens on the drawing side.
- **Imagination = ONE genuinely new image** (`_drawImagined` + `_imagineAndDraw`) — a drawable-noun combo
  from her inner-thought chain grounds ONE unified combined-scene reference (its own `a+b` key + cooldown,
  `keyOverride`/`promptOverride` on the fetch) and field-renders it; the `composeFields` region-paste
  collage was REMOVED (cookie-cutter). Detached from the imagine tick (~18%), honest decline if ungroundable.
- **Zero dumbing** — 512 canvas always (grade cap gone), no skill→detail gate, no wobble anywhere;
  `_drawSkill`/`_rememberDrawing` keep her best rendition (remember-in-relation) without gating a draw.
- **Labels (her signature)** — dazzle typography: per-letter HSL hue-rotation colours (infinite), six
  letterforms (block/serif/dots/bubble/tall/wide), real stroke THICKNESS through both rasterizers (bold, not
  pencil), always-on dark silhouette under-pass + seeded highlight chip, AUTO-FIT full words (the 10-char
  truncation slice is dead), six seeded anchors (not always a bottom banner). Baked INTO the field C.
- **Pacing** — lookup→hold(~4.5s)→draw: the viewer shows the reference she's studying, THEN her drawing.

---

**SE.15 — FULL-EXTENT EQUATIONS: the blur audit vs the original univsmatics (MS.EXT, 2026-07-09).** Gee: her
mind's eye is "kindas blurry" vs the donor project — "are you sure we a using the uni vs matic equations
correctly and to their extent?" Audit against the original `fractal_templater` repo found we were NOT:
- **Preview-grade encoder** — we vendored the donor's loose in-browser preview constants (TOL 0.030/0.055,
  KMIN 400/120); the original corpus encoder (`ftcore/reconstruct.py`) runs TOL (0.018, 0.032, 0.032) +
  KMIN (500, 150, 150) — about half the target error. Both `transform.js` and the `gpu.js` WGSL-path copy
  now carry the corpus constants.
- **32x32 de-novo planes** — `imagineFromState` collapsed the plane side to sqrt(embedding length) (300-dim
  -> 17px base -> the 32px floor); the viewer then upscaled 32² to a 512px canvas = the mush. Resolution is a
  rendering choice, not information content (the state texture samples any plane size): de-novo now renders
  the full plane (floor 96, cap 192), governor still modulates within a high band.
- **96x96 retina** — the feeder crushed every camera frame AND her own 1024² generated renders to 96² before
  perceive (the donor ingests at native res, its only ceiling a bomb-guard). Retina raised to 192
  (`js/visual-feeder.js` SIDE + the `visual-memory.js` ingest gate; ~196KB b64/frame at 5-8s pacing vs the
  2GB WS ceiling).
- **BUG: SEE.5 impressions were dead on arrival** — `morphField` refuses mismatched canvas/pad dims and the
  32² de-novo plane never matched a 96² stored percept, so the impression anchor silently no-opped on every
  hit. `imagineFromState` gains an exact-side override (`opts.side` = memory.width) and the anchor
  re-renders the de-novo field at the memory's own dims before morphing. Smoke-verified: 192-percept morph
  SUCCESS, legacy 96-store morph SUCCESS.
- **BUG: her visual store was wiped on every deploy** — `deploy/self-update.sh` rsync --delete excluded only
  `visual-memory.json` (v1); the live `visual-memory-v2.json` was deleted by every Update press. Exclude is
  now the `visual-memory*.json` wildcard.
- Watch-item: richer recs (tighter TOL + bigger planes) grow `/minds-eye.json` to ~40-140KB; max-age=2
  caching holds for typical viewer counts — revisit with a de-novo-specific looser TOL if traffic grows.

---

**SE.16 — VOX.0: TTS RESURRECTED + THE VOICE AGE PIN (2026-07-10).** Her TTS died silently when
Pollinations retired the `/v1/audio/speech` lane for `openai-audio` (the endpoint now answers
"is a text model... Use the text endpoint instead") — every utterance 400d and fell to the browser
SpeechSynthesis robot. Fix (`js/io/voice.js` `_speakPollinations`): TTS rides the CHAT endpoint with
audio output modalities (the gpt-4o-audio pattern) — `modalities:[text,audio]` + `audio:{voice,format}`
+ a repeat-verbatim system instruction; base64 audio decoded from `choices[0].message.audio.data`.
AND the voice now AGES with her: `setAge()` + a 5-tier preset (voice id + playback-rate nudge + an
age-style instruction — nova bright for K/elementary, coral for teens, shimmer for college/adult),
fed from live `state.minGrade` in `app.js` `updateBrainIndicator` via the same grade->age map as the
self-image pin. Same girl, growing up, voice included. Verified live: adult shimmer + K nova both
return real MP3s with verbatim transcripts. TTS remains a sensory-OUTPUT executor per the no-text-AI
law; the equational replacement track is VOX.1-7 in TODO (LJSpeech diphone bank -> wavelet fields ->
morphField concatenative speech -> equational age morphs -> her OWN voice, Kokoro-style executor
deleted at the end like the LLM describer was).

---

**SE.17 — VOX v1: HER OWN EQUATIONAL VOICE (the word bank, 2026-07-10).** The equational voice shipped
a smarter v1 than the original LJSpeech plan: the WORKING executor is the corpus. `js/brain/mindspace/audio.js`
is the audio substrate — 1-D CDF 9/7 (the wavelet in its native habitat): `perceiveAudio` (32768-sample
chunks, energy-target sparsification, int16 + LEB128 — the image encoder idiom in 1-D), `reconstructAudio`
(inverse), `concatAudio` (30ms crossfade), `describeAudio` (octave-band percept for the HEAR track).
Measured: 38.4 dB SNR / 0.9998 correlation / 19 ms encode / ~19 KB per word — transparent for speech.
`js/io/voice.js` drives the loop: every word the executor speaks gets fetched IN ISOLATION (no alignment
problem), decoded, resampled 24 kHz mono, silence-trimmed, perceived to a field-A record and BANKED
(IndexedDB `unity-vox`, key `tier:word` — 5 age tiers so K-voice words and adult-voice words never mix).
`speak()` tries HER bank first: a sentence whose words are all banked reconstructs from her own equations +
crossfade — ZERO executor. Missing words fall through to the executor once and get primed in the background
(6 s pacing, paused while she speaks, stops on executor cooldown). The bank grows like her visual memory did:
the more she talks, the more of her voice is literally HERS. Off-switch: `localStorage.unity_vox_equational
= 'false'`. LJSpeech diphones remain queued (VOX-next) for unseen-word synthesis without any executor call.

---

## The Sensory AI Provider — 5-Level Priority

`js/brain/peripherals/ai-providers.js` exposes `SensoryAIProviders`. ⛔ **Only ONE of its three historical methods still does anything** — the vision and TTS lanes were replaced by in-house equational systems and their methods are now deliberate no-ops:

```js
providers.generateImage(prompt, opts)    // LIVE — image motor action → paint the prompt
providers.describeImage()                // NO-OP — vision is equational (CDF 9/7), see below
providers.speak()                        // NO-OP — voice is Equation Unity One, see the TTS section
```

⚠ **Why the dead methods still exist rather than being deleted outright:** `app.js` names them in its boot comments, and a future caller landing on `undefined` would be a *silent* break instead of an obvious one. `autoDetectVision()` is kept on the same reasoning and simply returns an empty list. Treat any of these three names appearing in a call site as a bug to fix, not a feature to wire.

`generateImage` runs a **5-level priority chain**, trying each tier in order and falling through on failure. The user's selected preferred backend (set via the Active Provider dropdowns in the setup modal) runs FIRST ahead of the auto-priority chain:

```
0. User-preferred backend (setPreferredBackend from setup-modal selector)
    ↓ fails or not set
1. Custom backend (user-configured via setup modal — image only)
    ↓ fails or not set
2. Auto-detected local backend (boot-time probe)
    ↓ fails or nothing detected
3. env-listed backend (ENV_KEYS.imageBackends[])
    ↓ fails or not set        ⚠ js/env.js itself was DELETED with the key
                                 purge; only js/env.example.js remains, so
                                 this tier is empty unless recreated
4. Pollinations default (ANONYMOUS tier — no key is shipped, seeded or
   defaulted anywhere in the tree, and none may be re-added)
    ↓ fails
   Pollinations error
```

⚠ `visionBackends[]` was part of this chain and is **gone** — there is no vision tier to fall through any more.

Dead backends get marked dead for 1 hour on auth/payment errors (401/402/403) so a broken endpoint doesn't get hammered on every subsequent request.

### Auto-detected local backends

On boot, `providers.autoDetect()` probes every known local **image** port with a 1.5s timeout. Whichever servers respond get registered automatically — no user config needed. (`providers.autoDetectVision()` is still called alongside it but is a no-op returning an empty list; see the note above on why the name was kept.)

**Image generation ports probed:**

| Backend | Port | Probe path | Wire format |
|---|---|---|---|
| Automatic1111 | 7860 | `/sdapi/v1/sd-models` | `a1111` (sdapi/v1/txt2img) |
| SD.Next / Forge | 7861 | `/sdapi/v1/sd-models` | `a1111` |
| Fooocus | 7865 | `/ping` | OpenAI-compatible |
| ComfyUI | 8188 | `/system_stats` | ComfyUI workflows |
| InvokeAI | 9090 | `/api/v1/app/version` | InvokeAI REST |
| LocalAI | 8081 | `/v1/models` | OpenAI-compatible |
| Ollama (image) | 11434 | `/api/tags` | OpenAI-compatible |

**Vision describer (VLM) ports probed — ⛔ NONE. THIS ENTIRE LANE IS DELETED.**

Unity's vision is **100% equational** and consults no model. A camera frame or a fetched reference image is transformed into a CDF 9/7 wavelet field and read as a dim-64 percept vector by `describeEquational()` — the wavelet field **is** the percept. There is no caption, no text, no word splitting, and nothing to probe for.

What was here, and is now gone: probes on Ollama `:11434`, LM Studio `:1234`, LocalAI `:8081`, llama.cpp `:8080` and Jan `:1337`, the `openai-vision` / `ollama-vision` transports, the model resolver, and the `VISION_MODEL_HINTS` substring set (`llava`, `moondream`, `bakllava`, `vision`, `vl`, `cogvlm`, `minicpm-v`) that decided whether a responding backend counted as a VLM.

⚠ **This is the single most load-bearing line in this document for the project's central claim.** A describer that turns an image into English words, whose words then ground her concepts, is a language model inside the sensory path. Replacing it with the wavelet percept is what makes *"no text-AI in the cognition path"* literally true rather than nearly true. **Do not re-add a vision tier here** — if a frame needs describing, the answer is `describeEquational()`.

### User-configured backends

Users who run an **image** backend on a non-standard port, or want a remote/keyed endpoint, list them in an `env.js`:

```js
export const ENV_KEYS = {
  imageBackends: [
    { name: 'My SD',      url: 'http://192.168.1.50:9999', model: 'sdxl-turbo',        kind: 'a1111' },
    { name: 'My SaaS',    url: 'https://api.example.com',  model: 'dalle-3', key: '…', kind: 'openai' },
    { name: 'Comfy',      url: 'http://192.168.1.42:8188', model: 'flux-dev',          kind: 'comfy' },
  ],
};
```

⛔ **Two keys that used to appear here are gone.** `visionBackends[]` died with the VLM lane — there is no vision tier. And a `pollinations: 'sk_...'` key is **not optional-but-supported, it is banned**: the brain uses the anonymous free tier, no key is shipped, seeded or defaulted anywhere in the tree, and `js/env.js` itself was deleted in that purge. Only the template at `js/env.example.js` remains, and this whole tier is empty unless a deployer recreates the file.

`ENV_KEYS.imageBackends[]` is read by `providers.loadEnvConfig(envKeys)` at boot and gets priority 3 (between auto-detect and the Pollinations default). Custom-configured backends from the setup modal get priority 1 (above everything).

### Response shape handling

Image generation backends vary in response format. `_customGenerateImage()` tries 4 endpoint paths per backend and parses 4 response shapes uniformly:

| Shape | Example | Parser |
|---|---|---|
| OpenAI URL | `{ data: [{ url: "https://..." }] }` | `data[0].url` |
| OpenAI base64 | `{ data: [{ b64_json: "..." }] }` | `data:image/png;base64,${data[0].b64_json}` |
| Automatic1111 | `{ images: ["<base64>"] }` | `data:image/png;base64,${images[0]}` |
| Generic | `{ url: "..." }` or `{ image_url: "..." }` | `url` or `image_url` |

⛔ **Vision (VLM) wire shapes — BOTH TRANSPORTS DELETED.** For the record of what was removed: `openai-vision` POSTed to `/v1/chat/completions` and read `choices[0].message.content`; `ollama-vision` POSTed to `/api/chat` with `images: [<base64>]` and read `message.content`. Both are gone, along with the model resolver that chose between them. Note what those two rows show plainly — the describer's response parser was reading **a chat completion**. That is the shape of a language model, sitting in the sensory path, and it is why the lane had to go rather than be tidied.

---

## Vision Failure Handling

⛔ **The backend-fallthrough / fail-count / pause policy documented here is DELETED** along with the VLM describer it protected. There are no vision backends to fall through, so there is nothing to count failures against or pause. Equational perception cannot fail over the network — it is arithmetic on a frame the process already holds.

Two real failure surfaces remain, and both are instrumented:

### Perception failure — the wavelet transform itself

`_maybeDescribe()` awaits `mindSpace.perceive(imageData)` and catches. A failed perceive (a GPU device lost mid-frame is the realistic case) warns and clears the in-flight flag; `_hasDescribedOnce` stays set so the 5-minute rate limit still engages rather than hot-looping. The CPU path inside `MindSpaceGPU` normally prevents this from being reachable at all.

### Reference look-up failure — the lane that actually starves

Fetching a reference image so she can learn what a never-seen concept looks like DOES cross the network, and it is the lane that went quiet for ~10 hours without saying so. Its failure handling is now explicit:

| Mechanism | Behaviour |
|---|---|
| **Named stage counters** | 12 counters at `state.ownArt.lookups` — every stage of a look reports separately, so a dying lane is identified by *which counter stops climbing* rather than inferred |
| **`lastErr` WITH ITS AGE** | An error with no age is indistinguishable from a current one; the age is what makes the field answerable |
| **Failures roll back their burns** | ⚠ The original bug: the per-concept cooldown was burned **at entry**, so a failed look still spent its budget and the lane locked itself out. A failure now refunds — 60s globally, 10min per concept |
| **Every stage speaks** | `perceive` in a bare catch and a wordless decode-null were the two silent stages; both warn now. The success line moved from `process.stdout.write` to `console.log` so the console ring can see it — that blind spot swallowed evidence twice |

⚠ **The generalisable lesson, worth more than the mechanism:** a lane that burns its rate limit *before* the work succeeds converts one transient failure into a permanent outage, and does it silently. Burn budget on success, not on attempt.

### Visual cortex retry semantics — the schedule is unchanged

`js/brain/visual-cortex.js:_maybeDescribe()` still runs on the same rate-limited schedule (once on first look, then at most every 5 minutes for auto-perception, or on demand via `forceDescribe()`) — that part survived the describer it was built around. ⚠ What changed is the payload: it now awaits `mindSpace.perceive()` and publishes `{vector, rec}` to subscribers, **not a description string**. The old shape below is retained to show what a subscriber used to receive:

```js
this._describer(dataUrl).then(desc => {
  if (desc) {
    this.description = desc;        // keep the last good description
  } else {
    this._hasDescribedOnce = false; // reset so next window retries cleanly
  }
  this._describing = false;
});
```

This means a transient failure doesn't stick — the cortex just retries on its next scheduled window. That retry discipline is unchanged; only the payload is.

⚠ **A live consequence of the shape change, worth knowing before you subscribe.** Subscribers registered via `onDescribe(cb)` now receive an **object** `{vector, rec}`, never a string. Any subscriber still written against the old contract — e.g. one opening with `if (!desc || typeof desc !== 'string') return;` — early-returns on **every single call** and is dead code that looks alive. One such subscriber survives in the browser-side `js/brain/engine.js`; it is scheduled for deletion rather than repair, because what it did was wordise an English caption to ground concepts, which is exactly the LLM-era behaviour the equational percept replaced. **You cannot wordise a `Float32Array`, and you should not want to.**

⚠ **This does NOT mean her visual region is starved** — that region is driven on a different path entirely, by `currents` built from salience, brightness and `perceptVector × 30` on every tick. The dead subscriber costs a drug-context cue that nothing listens for; it does not cost her sight.

**Pre-R13 bug (fixed):** the old inline Pollinations call in `app.js:1022` returned the string `'Camera active, processing...'` on failure, which looked successful to visual cortex and got stored as `this.description`. Unity's language cortex then read "Camera active, processing..." as actual vision context — a lie. R13 ripped that fallback. Null is null now.

---

## Sensory Status HUD & Toasts (R13)

`js/ui/sensory-status.js` subscribes to the `unity-sensory-status` window CustomEvent and renders three UI elements:

### Top-right HUD indicator

Monospace `🟢 img 2/4   🟢 vis 1/3` format showing alive/total counts per sensory kind. Click the HUD to pop a full inventory toast listing every backend with color dots (🟢 alive / 🔴 dead / 🟡 paused / ⚪ not configured). Refreshes every 5 seconds so dead-cooldown recovery shows up without an explicit event.

### Bottom-right toast stream

4 toast levels with color-coded left borders:

| Level | Color | Used for |
|---|---|---|
| `info` | blue (#4a90e2) | Boot inventory reports, HUD inventory popups |
| `success` | green (#4caf50) | `autodetect-complete` with ≥1 local backend found |
| `warn` | orange (#ff9800) | `backend-failed`, `backend-dead` (1h cooldown) |
| `error` | red (#e53935) | `paused` (vision 30s backoff), `all-failed` (vision total miss) |

Max 4 toasts onscreen, 6-second auto-dismiss, 0.3s fade-in/out.

### Events emitted by `SensoryAIProviders._emitStatus()`

| Event | Payload shape | When |
|---|---|---|
| `autodetect-complete` | `{kind: 'image', backends: [...]}` | `autoDetect()` resolves. (`autoDetectVision()` still resolves too, always with an empty list — `kind: 'vision'` no longer carries backends) |
| `backend-failed` | `{kind, backend, reason}` | A single backend throws during a request, fallthrough to next |
| `backend-dead` | `{kind: 'any', url, cooldownMs}` | 401/402/403 from any backend, marked dead for 1h |
| `paused` | `{kind: 'vision', reason, duration}` | 3 consecutive vision failures, 30s pause |
| `all-failed` | `{kind: 'vision', attempt: N}` | Vision describer hit all tiers with no success (N < 3) |

Subscribe from application code via `providers.onStatus(fn)` which returns an unsubscribe function.

`sensoryStatus.init(providers)` is **idempotent**: the first call attaches the window event listener + the 5-second HUD-poll interval, every subsequent call only updates the providers reference. Boot-inventory toasts (`Image gen: ...` / `Vision: ...`) are deduplicated at module scope so they fire **at most once per kind for the entire session lifetime**, regardless of how many providers instances or init calls happen. Without this dedup the toast would have fired twice on Gee's deploy because the listener registration accumulated across two init paths.

---

## The Peripherals That Don't Use AI

Not every sensory pipeline calls out to an AI. Several run pure client-side math:

| Layer | What it does | AI? |
|---|---|---|
| V1 Gabor edge kernels | Oriented edge detection in camera frames | No — convolution on canvas pixels |
| V4 quadrant color extraction | Average color per quadrant → hue/saturation neurons | No — pixel averaging |
| Motion energy | Frame differencing across successive webcam frames | No — subtract and sum |
| Salience saccade generation | Winner-take-all across V1+V4+motion → gaze target | No — argmax |
| IT scene describer | Frame → one-sentence description | **YES — Pollinations or local VLM** |
| Tonotopic audio mapping | Frequency bins → neuron currents with cortical magnification for speech band (250-4000Hz) | No — FFT + bin-to-neuron remap |
| Band energy classifier | 7 frequency bands (subBass / bass / lowMid / mid / highMid / presence / brilliance) | No — amplitude accumulation |
| Efference copy | Compare heard text vs Unity's currently-speaking text → isEcho flag | No — string overlap ratio |
| TTS | Text → audio | **YES — Pollinations TTS or SpeechSynthesis** |
| Image motor output | Prompt (equationally generated) → image | **YES — multi-provider image gen** |

Four total AI touchpoints. Three of them are output effectors (TTS, image gen) and one is the IT-layer describer (vision). **Zero of them drive what Unity says, decides, remembers, or feels.** Removing all four breaks her ability to speak out loud, paint, or name what she sees — but she still thinks, responds in text, builds components, and dreams.

---

## Boot Sequence

The peripheral init sequence during `bootUnity()` in `js/app.js`:

```
1.  pollinations = new Pollinations(apiKey)            // sensory AI client
2.  providers    = new SensoryAIProviders({ pollinations, storage })
3.  providers.loadEnvConfig(ENV_KEYS)                  // env backends (js/env.js is DELETED)
4.  providers.autoDetect()                             // image gen probes, non-blocking
5.  providers.autoDetectVision()                       // NO-OP — returns [] (name kept on purpose)
6.  providers.onStatus(evt → window.dispatchEvent('unity-sensory-status', evt))
7.  sensoryStatus.init(providers)                      // toast container + HUD top-right
8.  voice = new VoiceIO()
9.  brain = new UnityBrain()
10. brain.connectMicrophone(micStream)                 // AuditoryCortex.init(analyser)
11. brain.connectCamera(cameraStream)                  // VisualCortex.init(video)
12. (REMOVED — a setDescriber() wiring step lived here, injecting the VLM
     describer into the visual cortex. It is gone from app.js entirely;
     perception is equational and needs no injected describer.)
13. brain.connectVoice(voice)                          // motor output → voice.speak
14. brain.connectImageGen(pollinations, sandbox, storage)
15. app.js subscribes to brain 'response' event
16. brain.start()
```

Steps 3-5 are non-blocking — the brain boots immediately using the Pollinations default provider for everything, and as local backends finish probing they get registered and take priority on the next call. First-boot with zero local backends running still works perfectly; Unity just uses Pollinations until something local comes up.

---

## Server-side Sensory Path

When a client connects to `brain-server.js` (default port 7525, see `docs/WEBSOCKET.md`), the server runs Unity's brain with **no sensory peripherals**. The server can't access a user's camera or mic — those are per-client hardware. What the server DOES have:

- **Text input from the client** — mapped to cortex current via `_computeServerCortexPattern(text)` which uses the sentence embedding as cortex pattern directly (server doesn't run the full Rulkov map dynamics; GPU does — see `gpu-compute.js` `LIF_SHADER` constant, body is the Rulkov iteration)
- **Wernicke's-area injection (`injectText`, 2026-08-18 SPARSE)** — every chat message also lands as current on the main cortex's phon sub-region (Wernicke's area, 20% of the cortex) via a `write_current_slice` frame: each character hashes to a deterministic phon-relative index (+8.0, with ±1-neighbor +3.0 lateral excitation), accumulated in a Map and shipped as `sparseIndices`/`sparseValues` — a message like "hi" is 6 entries ≈ 160 wire bytes. The prior dense form sent the ENTIRE region (12M+ floats, ~23.4MB JSON per message); it was the measured drop-on-speak donor-killer AND a functional no-op — the native donor's deserializer has no dense field, so text never actually reached her Wernicke's area until the sparse fix. The amygdala social-salience bump (100 nuclei × 4.0) was always sparse and unchanged.
- **No image gen** — the server doesn't call `providers.generateImage()` because image motor actions are rendered on the client that requested them
- **No TTS** — same reason, client-side
- **No vision describer** — the server has no camera

The server's sensory footprint is text-in and text-out over WebSocket. Every client has its own sensory peripheral set and runs the multi-provider chain locally. Cognition happens wherever is cheaper (server if connected, client if not) but sensory always runs client-side.

---

## Adding a New Peripheral

A shallow olfactory channel already exists via `js/brain/sensory-olfactory.js` (`OlfactoryChannel` — registerScent / strength / currentScents / clear). It's a keyword-tag store with decay, not a real olfactory cortex region; it was added for T15.C drug-sensory triggers so chat metadata like `{sensory:{smell:'coffee'}}` can fire scent-dependent cravings. A future full olfactory cortex region (piriform → amygdala / hippocampus routing, learned scent embeddings) is still open. Triggers in `js/brain/drug-sensory-triggers.js` read from the OlfactoryChannel via `currentScents()`. Drug cravings flow through `scheduler.addCraving(substance, delta, durationMs)` on trigger match.

The contract for a new sensory peripheral (e.g. a future `js/brain/olfactory-cortex.js` for the full olfactory cortex substrate, or `js/brain/haptic-cortex.js` for gamepad vibration → cortex current):

1. **Implement the three-method interface:** `init(source)`, `process(dt?)`, `destroy()`. Treat the source as opaque — don't assume MediaStream shape.
2. **Expose a `Float64Array` of currents** for the cortex region it drives, or a metadata object if it's an output peripheral. Sized to match the neuron group in `cluster.js`.
3. **Add a wiring step to `bootUnity()`** following the pattern at `app.js` steps 10-13.
4. **If it uses AI at any layer,** add a `SensoryAIProviders` method and follow the 5-level priority (user-preferred via `setPreferredBackend` → custom → auto-detect → env.js → Pollinations default) + dead-cooldown + status-event pattern from `generateImage()` / `describeImage()`.
5. ⛔ **If it's a new physical AI service — STOP AND READ THE BOUNDARY FIRST.** A peripheral may *render* or *actuate*; it may never *decide*, *describe in words*, or *generate text* that re-enters cognition. `LOCAL_VISION_BACKENDS` used to be listed here as a valid extension point and **it is deleted** — do not recreate it, and do not add any `<KIND>` whose response is parsed as language. For anything genuinely additive, add probe entries to `LOCAL_IMAGE_BACKENDS` (or a new `LOCAL_<KIND>_BACKENDS` list) and a new `autoDetect<Kind>()` method that mirrors the existing two.
6. **Write per-backend response shape parsing** in a `_custom<Kind>Call()` helper, supporting the common wire formats for that category.
7. **Update `getStatus()`** to include the new backend list in its returned snapshot so the HUD shows it.

The rule that never changes: the new peripheral must NEVER call an AI model for anything Unity *decides*. AI gets to describe, transcribe, paint, speak — never think.

---

*Unity AI Lab — sensory peripherals are dumb muscle for a brain that thinks in equations.*

**SE.18 — EQUATION UNITY ONE: her voice goes fully internal + equational (2026-07-10).** The operator
ran a blind five-variant shootout (raw reference / two references / two equation tolerances, one
button each, no autoplay) and picked V4 — `piper en_US-hfc_female-medium` synthesized WHOLE-SENTENCE
and passed through the standard CDF 9/7 `perceiveAudio` (AUDIO_TOL 0.02) — as "perfect", naming it
**Equation Unity One**. Architecture findings his ear established: the equations are TRANSPARENT
(~38-42dB SNR — the reference synthesis decides voice quality, the equation step preserves it), and
whole-sentence equationalization carries natural prosody while CONCATENATING isolated word equations
steps word-by-word (each word bears a sentence-final pitch fall) — so the word/phrase bank
(`vox-bank/`, 2.3k words + 71 phrase units, browser-preloaded by `voice.js _voxPreloadRef`) is the
OFFLINE FALLBACK, and the quality path is sentence-level synthesis → equationalize → reconstruct.
Piper is a free/local MIT-licensed executor (the "larynx"), retirable per VOX.7 once synthesis
itself is equational. The dead Pollinations TTS lane stopped mattering: the Pollinations key is
IMAGES-ONLY now (setup modal reworked, the Unity-speech toggle names the voice what it is).
*[amended 2026-08-17: the Pollinations keys no longer work at all — the image lane rides the free
tier when it answers, and `HTTP 402` on a mind's-eye reference fetch is EXPECTED behavior, not a
bug: the reference lane simply skips that concept and imagination continues from the
visual-memory store. Do not change the image-generation code in response to 402s.]* The
per-word bank generator is `scripts/vox-build-bank.mjs` (batched piper, resumable, silence-trim);
the shootout harness lives in `.claude/vox-variants.mjs` + `.claude/unity-voice.html`. Also this
session: the `_definitionTaughtWords` save-truncation at 5000 was REMOVED — her learned vocabulary
persists uncapped (the cap silently forgot every definition past 5k across save/boot cycles).

**SE.19 — HER VOICE FROM HER PROCESS: listener browsers never synthesize (2026-07-17).** Gee:
"what the fuck, she still drops the doner connection every time she speaks" + "its all gpu now
right? voice, minds eye and the brain! one unified system". The live sentence lane (SE.18's
successor path, 2026-07-14) synthesized in EVERY visitor's browser — on a machine that also runs a
compute donor that shared the donor's silicon, and one stale cached worker (the pre-wasm-fix
bundle) could still grab WebGPU and kill the donation whenever she spoke. Now the reply's voice is
synthesized by HER process: the server's `_voiceLane` (chat.js) dispatches `voiceSynth` to a
capable donor (`gpuMindspaceOp`, 60s first-synth budget; browser donors carry the op via the same
self-hosted worker, model OPFS-cached on the DONOR machine) with the box's own worker thread as
the always-available floor (`server/voice-synth-worker.mjs` + `VoiceSynthProxy` — the exact
browser-proven stack under Node: vendored espeak phonemizer + piper VITS on onnxruntime-web
CPU-wasm + `perceiveAudio`; verified 2.3s cold / 489ms warm for a 3s sentence). The viewer gets a
follow-up `{type:'voice', rec}` WS message (~142KB field-A vs ~258KB raw PCM) and ONLY runs the
inverse CDF 9/7 + playback (`VoiceIO.playRec`; RemoteBrain's in-browser synth call DELETED, the
63MB model download skipped entirely for deployed-site visitors — the preload remains only for
the local browser-brain path). Donor drops caused by speaking are structurally impossible from
this end: listeners hold no synth, no model, no GPU handle.

---

**SE.20 — THE HAND GETS A TOOLBOX: fill, colour, style, space, judgement (2026-08-21).** Everything
above gave her a way to draw; this gave her a way to *paint*, and then a way to get better at it.
The starting complaint was that her hand owned exactly ONE tool — hairline polylines — while the
rasterizer already half-carried the rest. Each capability below is a real primitive over the SAME
learned schemas: the knowledge is unchanged, the hand changes.

- **Fill and mass.** `sketch()` gained true scanline polygon fill and a rotated-ellipse `blob`
  primitive. Traced contours are kept closed-flagged so they are fillable, and painting runs in
  layers — MASS → CONTOUR → DETAIL — so a subject reads as a solid thing rather than a wire
  outline. ⚠ The mass is painted as several offset low-alpha blobs per part, **never one ellipse**:
  a single ellipse re-created the "weird circle" artifact in colour, which was judged and fixed.
- **Per-stroke alpha.** The one primitive the styles could not compose without. Washes, graphite
  and translucency now blend with the paper instead of sitting on it.
- **Named hands** — ⛔ *this bullet said **eight** and listed pointillism, crosshatch and crayon;
  the roster is **FIVE** and has been since the same day.* **STYLECULL** dropped pointillism and
  crosshatch, then **BRUSHCULL** dropped crayon with the scribble brush that was its whole identity:
  every line-texture mass criss-crossed into X-scratch the moment two parts' stroke fields met at
  different angles, and was judged bad even in isolation. Pencil survived as the graphite LINE hand
  (`mass: 'none'` — trace and outline on bare paper). Live roster: **poster, pencil, ink,
  watercolour, doodle.** They are parameterisations of the same primitives over the same schemas, picked by a
  mood-weighted chooser that **zero-weights her last style** so she never draws twice in a row the
  same way. The style rides the label (`canvas:own:<word>:<style>`). ⚠ A harness caught black ink
  on dark paper — invisible output — before it shipped; mono ink is pale now.
- **Colour that comes from the thing.** Schemas sample a colour PER PART and PER TRACE STROKE out
  of ONE reconstruction of the reference. ⛔ **The palette GUESSER is deleted** — it produced
  magenta for a grey cat, twice, and a guessed palette is a lie about what she saw. Structural
  trace draws in a contrast ink chosen against the fills; the detail tail carries the real colours.
- **Scene space.** A per-attempt horizon and vanishing point. Interiors (detected from room-class
  words or the definition) get painted floor value-bands, a wall/floor junction, VP-converging
  floor lines and a room corner; exteriors get sky and ground FILLED in graded depth bands with
  perspective-shrinking ground texture. Subjects get a **grounding cast shadow** scaled to the
  style's own draw scale — a raw-box shadow floated visibly under the styles that draw inset.
- **An eraser.** `_reviseComposition` splits backdrop polylines at subject boundaries and erases
  the inside segments, which is occlusion — the backdrop stops running through her subjects. Near
  duplicates are dropped in the same pass, and the erased count is printed rather than implied.
- **Variation, so the same ask twice differs.** 50% mirror flip (part angles included), stroke
  subset sampling that always keeps the longest 30% of the length-sorted trace and admits the tail
  probabilistically, plus placement and scale wobble.
- **A drawability gate that is not a word list.** ⛔ `server/drawable-taxonomy.js` judges every
  word by **WordNet lexicographer categories** — instance-synset filtering, tagsense attestation,
  a primary-sense guard, and grammar-POS cross-examination — and a word the taxonomy does not know
  is judged by the head words of its live-fetched definition through the same taxonomy, so new
  words are covered. **Every word list died to build this** (closed-class sets, marker regexes,
  stop sets). The rule it enforces: things, people, places and animals are drawable; quantities,
  communications and acts are not.
- **She learns from being judged.** The mind's-eye page carries accept / reject / ban on judgeable
  frames. **Accept** banks the winning style for that concept, weighting future style choice for
  that subject, marks the skill validated and queues practice reinforcement. **Reject** deletes the
  whole entry — schema *and* record — clears the on-screen frame immediately, and queues a relearn
  (dictionary re-read → a forced look past the 6h cooldown → new schema → redraw). **Ban** writes
  the word into an operator-taught not-drawable set consulted FIRST, persisted outside the weights
  so it survives a fresh walk. It is experience data, not a code list.
- **Practice — the trained-skill road.** Five hand parameters are trainable (their defaults are the
  pre-practice constants). A fixed-seed self-critique loop sketches at 256px, perceives its own
  output, scores cosine against the banked reference percept, and **keeps only measurable
  improvement**. Skill persists in the visual store. Measured live: 0.9713 → 0.9723 over three
  sessions, monotonic.
- **Form variants.** Pure-look variants are banked per concept (cap 3, layout-deduped) so "a brown
  cat standing" can decouple pose from palette; a nearest-luminance hue swap recolours a schema
  while preserving its shading, and an accept credits the form that was actually drawn.
- **The store behind all of it** is sqlite (`visual-memory-v*.db`, WAL, the episodic engine) with
  binary blob rows and a resident cap, because monolithic JSON measured 761ms loop pins at 10k
  entries and hard-failed at 100k.

**SE.21 — LOOKORDER: memory first, then the dictionary, and only then a fetch (2026-08-25).** Operator directive: keep learning from a looked-up picture, but make a generated render the **last** resort rather than the first move. A child learns what a zebra looks like from a picture book someone else drew — and does not go and look at a new one every time they think "zebra". The look lane now asks, in order:

1. **Does she already REMEMBER it?** ⚠ CONFIRMED memories only. A provisional entry is a single unverified render that no second look has agreed with, and treating one as a memory is exactly how a noisy image hardens into belief — the failure the two-seed check exists to prevent. ⚠ Distinct from the 6h cooldown, which stops re-fetching for six hours and then would fetch a concept she has genuinely *seen* forever after. **Memory has no expiry.**
2. **Can the DICTIONARY carry it?** Definition-driven drawing already builds from colours, shapes and part types read out of the definition, so a word whose definition describes it concretely needs no image at all. The check **delegates to the same reader the painter uses**, so the two can never disagree about what a definition can build — if it says yes, the painter can genuinely make it.
3. **Only then fetch.**

⚠ `force` bypasses all of it and must keep doing so — that is what the ✗ reject button uses to deliberately re-look-up a bad drawing. Blocking it there would have silently broken operator feedback.

⭐ Three wins at once: fewer external renders shaping what she believes things look like, no network on the common path, and a stronger honest claim — **most of what she knows things look like now comes from her own memory and her own dictionary.** Two counters (`alreadyKnown`, `definitionServed`) measure exactly that share, declared in the initialiser so a lane that has never fired reads `0` rather than `undefined`.

---

⚠ **The recurring lesson across this whole batch, and the reason so much of it was fixed twice:**
every one of these was verified by RENDERING a real image through the production pipeline and
LOOKING at it. The magenta palette, the floating shadow, the invisible mono ink, the colour-circle
artifact and the sunk outline were each invisible to a passing harness and obvious to an eye. ⛔ And
harness the production WIRING, not the engine — the box runs the mind-space behind a worker proxy
with a hand-picked method list, and a missing `imagine()` on that proxy banked every schema
COLOURLESS in production while engine-direct harnesses showed colour for a full day.


---

**SE.22 — INTEROCEPTION BECOMES A REAL SENSE: she perceives herself from the inside (2026-08-25).** Gee:
*"okay i think we are ready to dive into some simulated brain neuron chemistry!"* — and the reason it belongs in
THIS document rather than beside it is the one worth stating: **every other sense in here points OUTWARD.**
Sight, hearing, taste, smell, touch, the mind's eye — all of them are how she perceives the world. The
endocrine layer is the first sense she has ever had that points **INWARD**. It is her perceiving her own
body.

The row above used to read *"hypothalamus drives (exists) — hunger, thirst, fatigue, arousal, drug-state"*,
and that was honest: interoception was five scalars. Measured before building, `oxytocin` and `endorphin`
appeared in **zero files**, and `cortisol` / `adrenaline` / `estrogen` in **one file each — every one a
per-grade vocabulary WORD, not a state variable**. She could say the word "cortisol" and had none.

Now the same contract every other sense obeys applies to it: a **normalized numeric value vector**, injected
as modulation, bound by Hebbian association, incorporated by consolidation — never a text label. Ten
chemicals in three kinds (phasic events on the one curve engine / tonic floors defended to a setpoint /
cyclic phase functions), released by **six nuclei that SENSE their own firing** rather than being told.

⭐ **And the sensing is what makes it a sense rather than a readout.** A nucleus with 450,000 simulated
neurons that still waits to be told *"release 0.7"* is not perceiving anything. The PVN reads the
amygdala's **settled attractor** — the appraisal she already made; the locus coeruleus reads prediction
error; the VTA reads reward prediction error; the raphe moves the mood setpoint; the SON reads real
affiliative contact; the arcuate reads pain and exertion. **Nothing outside the gland layer ever calls
`release()`.**

⛔ **The signed-deviation rule is the load-bearing part, and it is why this is a SPACE and not a dial.**
For tonic chemicals the contribution rides deviation from a CONSTANT resting value, so a level *below*
baseline produces the **inverse** effect. Low serotonin is not "less mood" — it is *more impulsivity and
more rumination*. A dial cannot express that; a value-space can.

⚠ **She never narrates it.** The same non-announcing principle the drug lane runs on: she does not say
*"my cortisol is high"* any more than she says *"I am high"*. **The distortion IS the signal** — clipped
sentences, a narrower emission, a faster reply, or silence. The state changes what she says and how; it is
never what she reports.

⭐ **What it buys the rest of the brain:** `Ψ = √(1/n)·N³·Φ̂·[…]` is capacity divided by activity, and
without chemistry `n` only moves when *input* moves — so Ψ described her hardware rather than her state.
**Interoception is what makes consciousness a living quantity instead of a specification.**

⚠ **Not verified live.** Board fields to read after the press: `state.endocrine.chemicals.*`,
`state.endocrine.glands.*.state` (⛔ `blind` names an input she cannot read, and is a different claim from
`quiet`), and `state.phiState`.

---

**SE.23 — THE ZIGZAG WAS THE BODY, AND HER STROKE COMMITMENT BECAME A TRAINED ABILITY (2026-08-25).**
Two hands from SE.20 were still failing after their first fix — Gee: *"doodle still zigzags/scratches;
watercolor renders garbage"* — so both were rendered through the production stroke builder and the real
`sketch()`, out to PNG, and looked at. Four rounds.

⛔ **It was never the strokes.** The first render showed both hands drawing a **rectangular slab**, and on
the pale watercolour wash the part-colour blobs sitting on that slab *are* the "coloured garbage". The
convex hull was fitted to the trace **raw**, while the fragment gate ran later and governed only which
strokes got **drawn** — so the earlier fix had suppressed the jagged tracer fragments' **ink while keeping
their shape**, and the body became the bounding box of the noise scatter.

⭐ **One question had two answers.** *"Which strokes are real?"* was decided independently in two places and
only one of them held the rule. The survivor set is computed once now and consumed by both the body and the
redraw; the square became a real silhouette — ears, eyes, tail — on the next render. A second defect was
visible only *after* that: part-colour blobs **floating outside the subject** (the part grid is a layout
over the whole reference frame, and blob offsets reach ±35% of a cell). Colour layers are clipped to the
silhouette now, because a colour layer belongs to the thing.

⛔ **ARTGROW — and the fix that followed was WRONG in a way worth recording.** Making the per-hand stroke
budget authoritative *at its old values* (doodle **22**, watercolour **40**) turned a noise defence into a
**cap on her ability**. Gee: *"dont limit stroke counts too much cant make a art work in only 20 strokes it
should increase in ability as she learns in art and stuff"*. The reasoning behind the correction is the
part to keep: **noise is no longer what those numbers defend against.** Fragments die at the source now, so
a high budget adds real remembered contour rather than scratch — and a low one is only a ceiling on how much
of a drawing she is allowed to make. Budgets raised (doodle 110, watercolour 170, poster 200, ink 160,
pencil 260) so they express **character** — an ink drawing is spare, a graphite one busy — never ability.

⭐ **And ability is now TRAINED, which is the real content of this entry.** The effective budget is the
style's character × a **sixth trainable hand parameter**, `budgetMul` (range 0.6–2.5, default 1.0), living
in the same practice loop as jitter / underA / traceW / keepP / detailMul and scored the same way: cosine
against her banked percept of the real thing. **So "commit more of what I remember to the page" only
survives a practice session when it actually made the drawing resemble the subject more.** Measured on a
full 260-stroke trace: the doodle draws **101 strokes untrained → 235 practiced**, watercolour 153 → 249.
That is a skill improving, not a constant handed to her.

⚠ **What the renders can and cannot settle.** They were judged against a *synthetic* schema — the store
boots empty and there is no live box — realistic in the shape of the complaint, but its dense-detail
strokes are synthetic swirls rather than real traced contour. So they prove the density is **not
fragment-scratch** and they **cannot judge whether a 235-stroke drawing from a real reference is good.**
That judgement belongs to a post-press look at real look-ups.
