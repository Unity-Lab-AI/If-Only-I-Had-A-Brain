# TU.29.5 — full doc sweep: protocol + sensory + mindspace docs, all three
# public HTMLs, entry-points table, ceremony (TODO/FINALIZED/NOW/RESUME) +
# Sponge runbook addendum. Edits IN PLACE within each doc's existing structure.
import io

def load(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        c = f.read()
    return c, ('\r\n' if '\r\n' in c[:4000] else '\n')

def save(p, c):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(c)

# ════ 1. docs/WEBSOCKET.md — visual_frame client→server message ════
p = 'docs/WEBSOCKET.md'
c, nl = load(p)
anchor = '### `gpu_register`'
i = c.find(anchor)
assert i != -1
section = nl.join([
    '### `visual_frame` (2026-07-08)',
    '',
    "Visual intake — what Unity's eyes receive. Sent by the standalone client",
    'feeder (`js/visual-feeder.js`, raw-served — NOT bundled) for camera frames',
    '(permission-gated, never prompts) and generated-image renders (prompt decoded',
    'from the Pollinations URL as the label).',
    '',
    '```json',
    '{',
    '  "type": "visual_frame",',
    '  "source": "camera",',
    '  "w": 96, "h": 96,',
    '  "rgba_b64": "<base64 RGBA, exactly w*h*4 bytes>",',
    '  "label": "yellow banana"',
    '}',
    '```',
    '',
    'Server (`server/brain-server/visual-memory.js` `_ingestVisualFrame`)',
    'equationalizes the frame into a full-color field C (forward CDF 9/7, YCbCr)',
    'and stores it keyed to the concept words active at perception time — the',
    '`label` when present, else her current thought (inner-thought chain /',
    "global-workspace broadcast). At imagine-time the mind's eye recalls +",
    'morphField-recombines these stored percepts (`_recallVisualMemory`).',
    'Validation is strict (dims 8..96, byte length must equal `w*h*4`, base64',
    'decode verified) and intake is paced (2s min gap brain-wide); malformed or',
    'flooding frames drop silently. Store: LRU-capped 384 concepts, persisted to',
    '`server/visual-memory.json` (debounced 30s, atomic).',
    '',
    '',
])
c = c[:i] + section + c[i:]
save(p, c)
print('WEBSOCKET.md: visual_frame documented')

# ════ 2. docs/SENSORY.md — SE.10 + SPEAK.6c decision update ════
p = 'docs/SENSORY.md'
c, nl = load(p)
old_6c = ("- **Actual-pixel perceive (SPEAK.6c) stays the equational mind's-eye preview BY DECISION** (Gee 2026-07-01) "
          "— no image-decode dependency / CORS proxy added (no new attack surface); the bounded forward CDF-9/7 "
          "preview stands. Detail: `docs/unity-speech-consciousness-rectify.md`.")
assert c.count(old_6c) == 1, 'SPEAK.6c bullet not found'
new_6c = (old_6c[:-1].replace('preview stands.', 'preview stands.')
          + ' **SUPERSEDED in spirit by SE.10 (TU.29.5, 2026-07-08):** actual pixels ARE now perceived — but '
          'CLIENT-side (canvas decode in the browser, anonymous CORS re-request), honoring both original '
          'objections: still zero server-side image-decode dependency, still no CORS proxy.')
c = c.replace(old_6c, new_6c)

anchor = nl + '---' + nl
se9_end = c.find(new_6c) + len(new_6c)
ins_at = c.find(anchor, se9_end)
assert ins_at != -1
se10 = nl.join([
    '',
    "**SE.10 — VISUAL MEMORY: seeing grounds imagining (TU.29.5, 2026-07-08).** The mind's eye was a de-novo",
    'renderer — TU.29.1 painted the thought as GLYPHS (a text printer, not imagination; Gee: "a human doesnt have',
    'only a text printer in the r imagination MINDS EYE= UNITYS IMAGINATION"). Now perception grounds imagination:',
    '- **Intake** — `js/visual-feeder.js` (standalone raw-served module on `index.html`, no bundle dependency) ships',
    '  what her eyes receive as ≤96×96 RGBA `visual_frame` WS messages: camera frames every 8s (ONLY when the page',
    '  already holds camera permission — never prompts) + generated-image renders (prompt decoded from the',
    '  Pollinations URL as the label, anonymous CORS re-request, silently skipped when the CDN denies).',
    '- **Binding** — `server/brain-server/visual-memory.js` equationalizes each frame to a full-color field C and',
    '  stores it keyed to the concepts active at perception time (label, else her live thought / workspace',
    '  broadcast) — sight fuses with the word being "heard", infant-style grounding. Percept vector injects into',
    '  `sem` at 0.10 (skipped mid-teach). LRU 384 concepts, persisted `server/visual-memory.json`.',
    '- **Imagining = recall + recombination** — `_imagineTick` and the IMG-SEE preview look the thought up in visual',
    '  memory FIRST: one match re-sees the stored percept; two matches fuse via `morphField` (equation-domain',
    '  coefficient union + lerp) — imagination as RECOMBINATION of real percepts. Only unseen concepts fall to the',
    '  de-novo plane, where glyphs are DEMOTED to genuinely symbolic thoughts (numbers / single letters) and',
    '  everything else renders as her state textured in the named color or her mood. Equational end-to-end;',
    '  ≤96px cap and no-fractalize invariants intact.',
    '',
])
c = c[:ins_at] + nl + se10 + c[ins_at:]
save(p, c)
print('SENSORY.md: SE.10 added + SPEAK.6c updated')

# ════ 3. docs/MINDSPACE-INTEGRATION.md — visual-memory section ════
p = 'docs/MINDSPACE-INTEGRATION.md'
c, nl = load(p)
anchor = '## Consciousness de-gating'
i = c.find(anchor)
assert i != -1
section = nl.join([
    '### Visual memory — seeing grounds imagining — **TU.29.5 (NEW, 2026-07-08)**',
    'The recall layer that turns the mind\'s eye from a de-novo renderer into IMAGINATION:',
    '- **`server/brain-server/visual-memory.js`** — `_ingestVisualFrame` (WS `visual_frame` intake:',
    '  ≤96×96 RGBA → `mindSpace.perceive` → full-color field C, bound to the concepts active at',
    '  perception time) + `_recallVisualMemory` (thought tokens → stored field C; two matches fuse',
    '  via `MindSpaceGPU.morph` → `transform.js morphField`, equation-domain recombination).',
    '- **`js/visual-feeder.js`** — standalone raw-served client module (index.html, NOT bundled):',
    '  camera frames (permission-gated) + generated-image renders (Pollinations URL → prompt label).',
    '- **Recall-first order** in `_imagineTick` / IMG-SEE: recall+morph → de-novo only for unseen',
    '  concepts. De-novo glyphs demoted to symbol thoughts (numbers/letters); abstract color/mood',
    '  field otherwise (`symbolGlyphText` in `mindspace/gpu.js`).',
    '- **Persistence** — `server/visual-memory.json`, LRU 384 concepts, debounced 30s atomic write.',
    '',
])
c = c[:i] + section + c[i:]
save(p, c)
print('MINDSPACE-INTEGRATION.md: TU.29.5 section added')

# ════ 4. docs/HTML-ENTRY-POINTS.md — minds-eye row + index feeder note ════
p = 'docs/HTML-ENTRY-POINTS.md'
c, nl = load(p)
old_row_frag = 'Single shared source, no per-viewer compute. Linked from `index.html` 👁 MIND\'S EYE footer button'
assert c.count(old_row_frag) == 1
c = c.replace(old_row_frag, ('Single shared source, no per-viewer compute. Sources: `seen-camera`/`seen:<word>` (live perception), '
    '`recall:<word>`/`recall+morph:<w1>+<w2>` (visual memory re-seen/recombined), `thought`/`thought-blend`/`sem-state` (de-novo). '
    'Linked from `index.html` 👁 MIND\'S EYE footer button'))
old_purpose = '**Purpose:** Public landing page + 3D brain visualization + chat UI + HUD metrics.'
assert c.count(old_purpose) == 1
c = c.replace(old_purpose, (old_purpose + ' Also loads `js/visual-feeder.js` (standalone raw module, NOT bundled) — ships camera frames '
    '(permission-gated) + generated-image renders to the brain as `visual_frame` WS messages so her mind\'s eye '
    'learns to recall real percepts.'))
save(p, c)
print('HTML-ENTRY-POINTS.md: rows updated')

# ════ 5. html/minds-eye.html — copy reflects imagination ════
p = 'html/minds-eye.html'
c, nl = load(p)
old_sub = ('<p class="sub">A live window into what Unity is imagining right now — her equational <b>field&nbsp;C</b>, '
           'reconstructed from the inverse CDF&nbsp;9/7 wavelet transform. This is a <b>single shared source</b>: the '
           'brain imagines once, caches one snapshot, and every viewer reconstructs the same image locally. No compute '
           'donation, no per-viewer brain.</p>')
assert c.count(old_sub) == 1, 'minds-eye sub not found'
new_sub = ('<p class="sub">A live window into what Unity is imagining right now — her equational <b>field&nbsp;C</b>, '
           'reconstructed from the inverse CDF&nbsp;9/7 wavelet transform. Her imagination is grounded in what she has '
           '<b>actually seen</b>: camera frames and images she makes are perceived into field&nbsp;C memories bound to '
           'the concepts she was thinking, and at imagine-time she <b>recalls</b> them — or <b>recombines two</b> in '
           'the equation domain. Unseen concepts render as her mind-state in the thought\'s color or her mood; numbers '
           'and letters image as symbols. <b>Single shared source</b>: the brain imagines once, caches one snapshot, '
           'and every viewer reconstructs the same image locally.</p>')
c = c.replace(old_sub, new_sub)
old_note = ('<p class="note">She only daydreams when her brain is <b>idle</b> (not mid-lesson) — so the image holds still '
            'during training and refreshes when she\'s free. It never imagines down to infinite detail (bounded '
            'resolution, no fractal runaway) so it can\'t seize her processing.</p>')
assert c.count(old_note) == 1, 'minds-eye note not found'
new_note = ('<p class="note">The <b>source</b> field tells you what kind of image this is: <b>seen-camera / seen:&lt;word&gt;</b> '
            '= live perception through her eyes · <b>recall:&lt;word&gt;</b> = a memory re-seen · <b>recall+morph:&lt;a&gt;+&lt;b&gt;</b> '
            '= two memories recombined (imagination proper) · <b>thought / thought-blend / sem-state</b> = de-novo daydream of an '
            'unseen concept. She daydreams when her brain is idle (mid-lesson the image holds still), and never imagines down to '
            'infinite detail (bounded resolution, no fractal runaway) so it can\'t seize her processing.</p>')
c = c.replace(old_note, new_note)
save(p, c)
print('minds-eye.html: copy updated')

# ════ 6. html/legend.html — card copy ════
p = 'html/legend.html'
c, nl = load(p)
old_card = ('A live window into what Unity is imagining right now — her equational <strong>field C</strong>, reconstructed '
            'from the inverse CDF 9/7 wavelet transform. <strong>Single shared source:</strong> the brain imagines once and '
            'caches one snapshot (<code>/minds-eye.json</code>); every viewer reconstructs the same image locally — no '
            'compute donation, no per-viewer brain. She daydreams when her brain is idle (not mid-lesson), and never images '
            'to infinite detail (bounded — it can\'t seize her processing).')
assert c.count(old_card) == 1, 'legend card not found'
new_card = ('A live window into what Unity is imagining right now — her equational <strong>field C</strong>, reconstructed '
            'from the inverse CDF 9/7 wavelet transform. Her imagination is <strong>grounded in what she has seen</strong>: '
            'camera frames + images she makes become field-C memories bound to the concepts she was thinking, recalled — or '
            'recombined two-at-a-time in the equation domain — at imagine-time; unseen concepts render as her mind-state in '
            'the thought\'s color or her mood. <strong>Single shared source:</strong> the brain imagines once and caches one '
            'snapshot (<code>/minds-eye.json</code>); every viewer reconstructs the same image locally — no compute donation, '
            'no per-viewer brain. Bounded resolution — it can\'t seize her processing.')
c = c.replace(old_card, new_card)
save(p, c)
print('legend.html: card updated')

# ════ 7. html/unity-guide.html — imagination bullet ════
p = 'html/unity-guide.html'
c, nl = load(p)
old_li = ('<li><strong>Imagination (her mind\'s eye)</strong> — she doesn\'t only see through a camera. She imagines '
          'DE-NOVO from her own brain state: her current cortex activity gets folded into a field C and she "sees" what '
          'she imagines. It\'s bounded on purpose — she never imagines down to infinite detail (which would seize up her '
          'processing), and she only daydreams when idle, not mid-lesson. You can watch what she\'s imagining on the '
          'public <a href="minds-eye.html">👁 Mind\'s Eye</a> page.</li>')
assert c.count(old_li) == 1, 'unity-guide li not found'
new_li = ('<li><strong>Imagination (her mind\'s eye)</strong> — she doesn\'t only see through a camera; what she SEES '
          'becomes what she can IMAGINE. Camera frames and images she creates are perceived into equational field-C '
          'memories bound to the concepts she was thinking at that moment. When she imagines, she recalls those real '
          'percepts — or recombines two of them in the equation domain — and only concepts she has never seen render '
          'as an abstract field colored by her thought and mood (numbers and letters image as symbols). It\'s bounded '
          'on purpose — she never imagines down to infinite detail (which would seize up her processing), and she only '
          'daydreams when idle, not mid-lesson. You can watch what she\'s imagining on the public '
          '<a href="minds-eye.html">👁 Mind\'s Eye</a> page.</li>')
c = c.replace(old_li, new_li)
save(p, c)
print('unity-guide.html: bullet updated')

print('SWEEP PART 1 DONE')
