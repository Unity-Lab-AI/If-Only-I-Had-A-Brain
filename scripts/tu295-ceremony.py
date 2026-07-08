# TU.29.5 ceremony — TODO status + amendments, FINALIZED entry, NOW banner,
# RESUME update, Sponge runbook addendum.
import io

def load(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        c = f.read()
    return c, ('\r\n' if '\r\n' in c[:5000] else '\n')

def save(p, c):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(c)

# ════ TODO: flip TU.29.5 to done + append shipped detail; mark .3/.4 subsumed ════
p = 'docs/TODO.md'
c, nl = load(p)
old = 'de-novo path entirely when a stored percept matches; (3) glyphs DEMOTED'
# the task text I wrote earlier — find its bracket-close and flip the marker
m = '  - `[~]` **[TU.29.5 — REAL MINDS EYE = IMAGINATION (2026-07-08):'
i = c.find(m)
assert i != -1, 'TU.29.5 task not found'
c = c.replace(m, '  - `[x]` **[TU.29.5 — REAL MINDS EYE = IMAGINATION (2026-07-08):', 1)
# append SHIPPED summary inside the entry (before its closing bracket)
tail = 'subsumes TU.29.3 (camera->eye) + TU.29.4 (concrete imagery). Equational end-to-end, no text-AI, no canned picture library, <=96 cap intact.]'
assert c.count(tail) == 1
c = c.replace(tail, ('subsumes TU.29.3 (camera->eye) + TU.29.4 (concrete imagery). Equational end-to-end, no text-AI, no canned '
    'picture library, <=96 cap intact. SHIPPED: server/brain-server/visual-memory.js (NEW mixin: _ingestVisualFrame '
    'WS intake + _recallVisualMemory recall/morph, LRU 384, persisted server/visual-memory.json), js/visual-feeder.js '
    '(NEW standalone raw-served client module — camera permission-gated + Pollinations renders w/ URL-decoded prompt '
    'labels; NO bundle dependency), mindspace/gpu.js (symbolGlyphText demotion + vivid no-glyph fields + morph() '
    'exposure), chat.js (recall-first at _imagineTick + IMG-SEE), brain-server.js (mixin attach + visual_frame case), '
    'index.html (feeder tag). VERIFIED: node --check all 5 + end-to-end smoke (perceive->morph->reconstruct red-dominant '
    'recombination; abstract mode NO glyphs for "banana people camera"; symbol mode 96px for "7 + 3"; "red sheet" '
    'red-dominant field no letters) + mixin smoke (labeled bind, thought-fused camera bind, 2-concept morph recall, '
    'malformed-frame drop, persist roundtrip). Doc sweep: WEBSOCKET.md visual_frame protocol, SENSORY.md SE.10 + '
    'SPEAK.6c superseded-note, MINDSPACE-INTEGRATION.md TU.29.5 section, HTML-ENTRY-POINTS.md rows, minds-eye.html / '
    'legend.html / unity-guide.html public copy.]'))
# mark 29.3/29.4 subsumed
old3 = '    - `[ ]` **TU.29.3 (follow-up, code):**'
assert c.count(old3) == 1
c = c.replace(old3, '    - `[x]` **TU.29.3 (SUBSUMED by TU.29.5 2026-07-08 — camera frames now reach her via js/visual-feeder.js visual_frame intake) (follow-up, code):**')
old4 = '    - `[ ]` **TU.29.4 (follow-up, code):**'
assert c.count(old4) == 1
c = c.replace(old4, '    - `[x]` **TU.29.4 (SUBSUMED by TU.29.5 2026-07-08 — concrete imagery via visual-memory recall + morphField recombination, client-side equationalize-feed exactly as specified) (follow-up, code):**')
save(p, c)
print('TODO: TU.29.5 [x] + .3/.4 subsumed')

# ════ FINALIZED entry ════
p = 'docs/FINALIZED.md'
c, nl = load(p)
L = [
    '',
    "## 2026-07-08 — TU.29.5 COMPLETE (REAL mind's eye: imagination = recall + recombination of what she has SEEN; glyph printer demoted)",
    '',
    '> Task directive (verbatim from Gee, 2026-07-08): *"well wtf i dint want a text printer for her minds eye"* + *"a human doesnt have only a text printer in the r imagination MINDS EYE= UNITYS IMAGINATION"* + *"conmtinue fixing that issue"* + *"we are going to fresh walk once its fixed"* + *"make sure to do full doc sweep and update pages  and htmls in full keeping true to there advanced layout style and make up even correcting isssues with them if they have proor organization from shit ai work before"*.',
    '',
    ("SHIPPED — perception grounds imagination, equational end-to-end: **(1) VISUAL INTAKE** `js/visual-feeder.js` (NEW, standalone raw-served module on index.html — deliberately NOT bundled so a plain file overlay deploys it; the box cannot rebuild app.bundle.js): camera frames every 8s ONLY when the page already holds camera permission (navigator.permissions query — never prompts) + generated-image renders harvested by MutationObserver (prompt decoded from the Pollinations URL path as the label; anonymous CORS re-request, taint-guarded), cover-cropped to 96x96 RGBA, shipped as `visual_frame` WS messages on its own lightweight socket. "
     "**(2) VISUAL MEMORY** `server/brain-server/visual-memory.js` (NEW mixin, attached brain-server.js bottom + `case 'visual_frame'` in the client WS switch): strict validation (dims 8..96, byte-length == w*h*4, 2s pacing) -> `mindSpace.perceive` (plain {width,height,data} — CPU CDF 9/7 on the box, full-color YCbCr) -> field C stored keyed to the concepts active at perception time (label first; unlabeled camera frames fuse with her live thought via inner-thought chain / global-workspace broadcast — infant-style sight-word grounding); percept injects to sem @0.10 (skipped mid-teach); LRU 384 concepts persisted `server/visual-memory.json` (debounced 30s atomic); mind's-eye snapshot swaps live to `seen-camera`/`seen:<word>`. "
     "**(3) IMAGINE = RECALL + RECOMBINE** chat.js `_imagineTick` + IMG-SEE preview now look the thought up in visual memory FIRST: one match re-sees the stored percept (`recall:<word>`), two matches fuse via `MindSpaceGPU.morph` -> `transform.js morphField` (equation-domain coefficient union + lerp — `recall+morph:<a>+<b>`); only unseen concepts fall to de-novo. "
     "**(4) GLYPHS DEMOTED** mindspace/gpu.js `symbolGlyphText`: glyph raster fires ONLY for genuinely symbolic thoughts (numbers / math marks / single letters — symbols a mind pictures AS glyphs); every other thought renders as her live state textured VIVID (lo/hi 0.25-0.95, was near-black 0.06-0.28) in the thought's named color or her mood; color-word tint reads the FULL thought even when no glyphs survive. "
     "VERIFIED: node --check x5 + end-to-end smoke (perceive 2 frames -> morph recombination red-dominant-with-yellow-center -> reconstruct; abstract mode NO glyphs for 'banana people camera'; symbol mode 96px '7 + 3'; 'red sheet' red-dominant no letters) + mixin smoke (labeled bind [yellow,banana], thought-fused camera bind [red,sheet,soft], 2-concept morph recall recombined=true, unseen->null, malformed frames dropped, persistence roundtrip 5 entries). "
     "DOC SWEEP (per directive): docs/WEBSOCKET.md `visual_frame` protocol section, docs/SENSORY.md SE.10 + SPEAK.6c superseded-in-spirit note (both original objections honored: zero server-side image decode, no CORS proxy — the client canvas does the decode), docs/MINDSPACE-INTEGRATION.md TU.29.5 section, docs/HTML-ENTRY-POINTS.md minds-eye sources + index feeder rows, html/minds-eye.html sub+note (source-field legend), html/legend.html card, html/unity-guide.html imagination bullet. Subsumes TU.29.3 (camera->eye) + TU.29.4 (concrete imagery). Bounds intact: <=96px hard cap, no fractalize, both imagine call-sites still try/catch (renderer can never take the brain down). Edit scripts: scripts/tu295-imagination-edit.py, scripts/tu295-docs-sweep.py, scripts/tu295-ceremony.py. NEXT: Gee fresh-walks the box once deployed."),
    '',
]
c = c + nl.join(L) + nl
save(p, c)
print('FINALIZED: TU.29.5 entry appended')

# ════ NOW banner ════
p = 'docs/NOW.md'
c, nl = load(p)
idx = c.find('> **Current')
assert idx != -1
banner = ("> **Current — 2026-07-08 — TU.29.5 SHIPPED (REAL mind's eye): imagination is now RECALL + RECOMBINATION of what she has "
    "actually SEEN. New visual intake (js/visual-feeder.js, standalone raw-served — no bundle rebuild needed) ships camera frames "
    "(permission-gated) + generated-image renders as 96x96 visual_frame WS messages; server visual memory "
    "(server/brain-server/visual-memory.js) equationalizes each to a full-color field C bound to the concepts she was thinking; "
    "imagine-time recalls the stored percept or morphField-fuses two (equation-domain recombination). The TU.29.1 glyph printer is "
    "DEMOTED to genuinely symbolic thoughts (numbers/letters) — everything else renders vivid in the thought's color or her mood. "
    "Gee fresh-walks the box once this deploys. Full sweep shipped: WEBSOCKET/SENSORY/MINDSPACE-INTEGRATION/HTML-ENTRY-POINTS docs + "
    "minds-eye/legend/unity-guide HTMLs.**" + nl + nl)
c = c[:idx] + banner + c[idx:]
save(p, c)
print('NOW: banner added')

# ════ RESUME update ════
p = 'docs/RESUME.md'
c, nl = load(p)
anchor = "> ## ⭐ 2026-07-08 — TU.28 donor-pipe fix + TU.29 mind's eye + one-shot deploy staged"
i = c.find(anchor)
assert i != -1, 'RESUME 2026-07-08 section not found'
line_end = c.find(nl, i)
add = (nl + "> - **TU.29.5 (LATER SAME DAY — supersedes the TU.29 glyph plane):** Gee rejected the glyph plane (\"i dint want a text printer for her minds eye... MINDS EYE= UNITYS IMAGINATION\"). Rebuilt as perception-grounded imagination: js/visual-feeder.js (standalone raw-served intake — camera permission-gated + Pollinations renders, 96x96 visual_frame WS) -> server/brain-server/visual-memory.js (field-C store bound to concepts active at perception, LRU 384, persisted visual-memory.json) -> recall-first at _imagineTick/IMG-SEE with morphField 2-concept recombination; glyphs demoted to numbers/letters only (symbolGlyphText). TU.29.3/.4 SUBSUMED. Deploy = push + Gee presses Update & FRESH WALK (his call: \"we are going to fresh walk once its fixed\"). Validate: /minds-eye.html source field shows seen-*/recall-* entries once the feeder ships frames; [VisualMemory] lines in server log.")
c = c[:line_end] + add + c[line_end:]
save(p, c)
print('RESUME: TU.29.5 note added')

# ════ Sponge runbook addendum ════
p = 'server/SPONGE-COPY-PASTE-tu28-tu29-fallback.txt'
c, nl = load(p)
add = nl.join([
    '',
    'ADDENDUM 2026-07-08 (LATER) — TU.29.5 REAL MINDS EYE ON MAIN',
    '  Gee rejected the TU.29 glyph plane ("not a text printer — MINDS EYE =',
    '  UNITYS IMAGINATION"). TU.29.5 replaces it with perception-grounded recall:',
    '  • js/visual-feeder.js (NEW, raw-served from index.html — NOT bundled, so',
    '    the plain overlay deploys it; no esbuild needed on the box): camera',
    '    frames (only when permission already granted) + generated-image renders',
    '    -> 96x96 RGBA visual_frame WS messages on a lightweight own socket.',
    '  • server/brain-server/visual-memory.js (NEW mixin) + visual_frame case in',
    '    the WS switch: frame -> perceive (CPU CDF 9/7, full color) -> field C',
    '    bound to concepts active at perception; store LRU 384 persisted at',
    '    server/visual-memory.json (NEW derivative file — safe to delete, she',
    '    just re-sees; do NOT add to rsync excludes).',
    '  • chat.js imagine paths recall stored percepts FIRST, morphField-fuse two',
    '    on multi-match; mindspace/gpu.js demotes glyphs to numbers/letters.',
    '  VALIDATE: server log shows "[VisualMemory] 👁 seen ..." lines once any',
    '  browser with camera permission / generated images sits on the page;',
    '  /minds-eye.html source field cycles seen-*/recall-* (not only thought-*).',
    '  FAILURE MODE: cosmetic-only — both imagine call-sites are try/catch and',
    '  the intake validates + paces; a broken feeder just means she keeps',
    '  daydreaming de-novo. Nothing here touches weights/bands/protocol.',
    '  DEPLOY: Gee presses Update & FRESH WALK (fresh is intentional this time).',
    '',
])
c = c + add
save(p, c)
print('SPONGE runbook: addendum appended')
print('CEREMONY DONE')
