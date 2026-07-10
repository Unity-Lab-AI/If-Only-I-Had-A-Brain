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
| **Sensory input** | Translating raw sensor data into neural current. Camera frames into V1/V4/IT visual cortex activity, audio spectrum into tonotopic auditory cortex activity, text tokens into Wernicke's area activation. | **NO — vision is 100% equational (SE.6/SE.8).** A frame → CDF 9/7 field C → `describeEquational` → a dim-64 VALUE PROFILE injected as cortical current. The wavelet field IS the percept. She also imagines DE-NOVO from her own cortex state (no camera). The old Pollinations-GPT-4o/VLM scene-describer is RETIRED — external AI is sensory-OUTPUT only (image-gen, TTS). |
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
| **Interoception** | hypothalamus drives (exists) | hunger, thirst, fatigue, arousal, drug-state | feeds existing drive equations |

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
- **Imagining = recall + recombination** — `_imagineTick` and the IMG-SEE preview look the thought up in visual
  memory FIRST: one match re-sees the stored percept; two matches fuse via `morphField` (equation-domain
  coefficient union + lerp) — imagination as RECOMBINATION of real percepts. Only unseen concepts fall to the
  de-novo plane, where glyphs are DEMOTED to genuinely symbolic thoughts (numbers / single letters) and
  everything else renders as her state textured in the named color or her mood. Equational end-to-end;
  ≤96px cap and no-fractalize invariants intact.

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
  can't re-see); schema selection is equational input classification (token table → GloVe-cosine backup, the
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
  thought-blend publishes, the thought's content tokens are GloVe-cosine matched against her seen-concept
  store (bounded 60-key sample, threshold 0.32); a hit morphs the stored memory field toward the mood field
  MEMORY-DOMINANT (t=0.30-0.50, detail-gated >=150). Label `impression:<thoughtToken>~<seenConcept>`. An
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

## The Sensory AI Provider — 4-Level Priority

`js/brain/peripherals/ai-providers.js` exposes `SensoryAIProviders` with three methods Unity's brain calls at the sensory boundary:

```js
providers.generateImage(prompt, opts)    // image motor action → paint the prompt
providers.describeImage(dataUrl, opts)   // visual cortex IT layer → describe a frame
providers.speak(text, voice)             // TTS motor output → speak a finished sentence
```

Both `generateImage` and `describeImage` run a **5-level priority chain**, trying each tier in order and falling through on failure. The user's selected preferred backend (set via the Active Provider dropdowns in the setup modal) runs FIRST ahead of the auto-priority chain:

```
0. User-preferred backend (setPreferredBackend from setup-modal selector)
    ↓ fails or not set
1. Custom backend (user-configured via setup modal — image only)
    ↓ fails or not set
2. Auto-detected local backend (boot-time probe)
    ↓ fails or nothing detected
3. env.js-listed backend (ENV_KEYS.imageBackends[] / visionBackends[])
    ↓ fails or not set
4. Pollinations default (anonymous tier works without a key — a saved
   Pollinations API key raises rate limits and unlocks paid models)
    ↓ fails
   null (for vision) or Pollinations error (for image)
```

Dead backends get marked dead for 1 hour on auth/payment errors (401/402/403) so a broken endpoint doesn't get hammered on every subsequent request.

### Auto-detected local backends

On boot, `providers.autoDetect()` and `providers.autoDetectVision()` fire in parallel and probe every known local port with a 1.5s timeout. Whichever servers respond get registered automatically — no user config needed.

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

**Vision describer (VLM) ports probed:**

| Backend | Port | Probe path | Wire format | Model filter |
|---|---|---|---|---|
| Ollama (VLM) | 11434 | `/api/tags` | `ollama-vision` (`/api/chat` with `images: [base64]`) | Name contains `llava`/`moondream`/`bakllava`/`vision`/`vl`/`cogvlm`/`minicpm-v` |
| LM Studio | 1234 | `/v1/models` | OpenAI multimodal | Same substring filter on model IDs |
| LocalAI (VLM) | 8081 | `/v1/models` | OpenAI multimodal | Same |
| llama.cpp server | 8080 | `/v1/models` | OpenAI multimodal | Same |
| Jan | 1337 | `/v1/models` | OpenAI multimodal | Same |

`VISION_MODEL_HINTS` is the substring set: `['llava', 'moondream', 'bakllava', 'vision', 'vl', 'cogvlm', 'minicpm-v']`. A backend's probe is only considered "detected" if it responds AND has at least one model matching one of these substrings. This prevents registering a text-only Ollama instance as a vision backend when no VLM has been pulled yet.

### User-configured backends

Users who run a vision or image backend on a non-standard port, or want a remote/keyed endpoint, list them in `js/env.js`:

```js
export const ENV_KEYS = {
  pollinations: 'sk_...',  // optional — raises Pollinations rate limit

  imageBackends: [
    { name: 'My SD',      url: 'http://192.168.1.50:9999', model: 'sdxl-turbo',        kind: 'a1111' },
    { name: 'My SaaS',    url: 'https://api.example.com',  model: 'dalle-3', key: '…', kind: 'openai' },
    { name: 'Comfy',      url: 'http://192.168.1.42:8188', model: 'flux-dev',          kind: 'comfy' },
  ],

  visionBackends: [
    { name: 'Remote Ollama', url: 'http://192.168.1.50:11434', model: 'llava',                   kind: 'ollama-vision' },
    { name: 'Remote VLM',    url: 'https://vlm.example.com',    model: 'gpt-4-vision-preview',   key: 'sk-…', kind: 'openai-vision' },
  ],
};
```

`ENV_KEYS.imageBackends[]` is read by `providers.loadEnvConfig(envKeys)` at boot and gets priority 3 (between auto-detect and the Pollinations default). Custom-configured backends from the setup modal get priority 1 (above everything). `js/env.js` is gitignored — the template lives at `js/env.example.js`.

### Response shape handling

Image generation backends vary in response format. `_customGenerateImage()` tries 4 endpoint paths per backend and parses 4 response shapes uniformly:

| Shape | Example | Parser |
|---|---|---|
| OpenAI URL | `{ data: [{ url: "https://..." }] }` | `data[0].url` |
| OpenAI base64 | `{ data: [{ b64_json: "..." }] }` | `data:image/png;base64,${data[0].b64_json}` |
| Automatic1111 | `{ images: ["<base64>"] }` | `data:image/png;base64,${images[0]}` |
| Generic | `{ url: "..." }` or `{ image_url: "..." }` | `url` or `image_url` |

Vision (VLM) backends follow two wire shapes:

| `kind` | Endpoint | Request body | Response parser |
|---|---|---|---|
| `openai-vision` | `/v1/chat/completions` | `messages: [{role: "user", content: [{type: "text", text: "..."}, {type: "image_url", image_url: {url: dataUrl}}]}]` | `choices[0].message.content` |
| `ollama-vision` | `/api/chat` | `messages: [{role: "user", content: "...", images: [<base64 without data: prefix>]}]` | `message.content` |

---

## Vision Describer Failure Handling (R13)

Cameras can run for hours. Backends can die mid-session. The R13 describer treats every call as potentially failing and has a three-layer resilience policy:

### Layer 1: Backend-level fallthrough

Each call to `describeImage(dataUrl)` walks the priority chain. If `_localVisionBackends[0]` throws, the exception is caught, a `backend-failed` status event fires, and the next backend is tried. Only when EVERY tier has failed does the call return `null`.

### Layer 2: Consecutive failure counter + pause

```
_visionFailCount = 0
_visionPausedUntil = 0

describeImage() total failure:
  _visionFailCount += 1
  if _visionFailCount ≥ 3:
    _visionPausedUntil = now() + 30_000   // 30 second pause
    _visionFailCount = 0
    emit paused event
  else:
    emit all-failed event

describeImage() success (any tier):
  _visionFailCount = 0

describeImage() called during pause window:
  return null immediately (no network activity)
```

After 3 consecutive total failures, vision pauses for 30 seconds. During the pause, `describeImage()` returns null without touching any network — no backend gets hammered. After the pause window expires, the next call retries from the top of the priority chain.

### Layer 3: Visual cortex retry semantics

`js/brain/visual-cortex.js:_maybeDescribe()` calls the describer on a rate-limited schedule (once on first look, then max every 5 minutes for auto-describes, or on demand via `forceDescribe()`). When the describer returns null:

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

This means a transient failure doesn't stick — the cortex just retries on its next scheduled window. Unity's IT cortex state holds the last good description until a new one comes in.

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
| `autodetect-complete` | `{kind: 'image'\|'vision', backends: [...]}` | `autoDetect()` / `autoDetectVision()` resolves |
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
3.  providers.loadEnvConfig(ENV_KEYS)                  // env.js backends registered
4.  providers.autoDetect()                             // image gen probes, non-blocking
5.  providers.autoDetectVision()                       // VLM probes, non-blocking
6.  providers.onStatus(evt → window.dispatchEvent('unity-sensory-status', evt))
7.  sensoryStatus.init(providers)                      // toast container + HUD top-right
8.  voice = new VoiceIO()
9.  brain = new UnityBrain()
10. brain.connectMicrophone(micStream)                 // AuditoryCortex.init(analyser)
11. brain.connectCamera(cameraStream)                  // VisualCortex.init(video)
12. brain.visualCortex.setDescriber(dataUrl →
        providers.describeImage(dataUrl))              // R13 multi-provider describer wrapper
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
5. **If it's a new physical AI service,** add probe entries to `LOCAL_IMAGE_BACKENDS` or `LOCAL_VISION_BACKENDS` (or a new `LOCAL_<KIND>_BACKENDS` list) and a new `autoDetect<Kind>()` method that mirrors the existing two.
6. **Write per-backend response shape parsing** in a `_custom<Kind>Call()` helper, supporting the common wire formats for that category.
7. **Update `getStatus()`** to include the new backend list in its returned snapshot so the HUD shows it.

The rule that never changes: the new peripheral must NEVER call an AI model for anything Unity *decides*. AI gets to describe, transcribe, paint, speak — never think.

---

*Unity AI Lab — sensory peripherals are dumb muscle for a brain that thinks in equations.*
