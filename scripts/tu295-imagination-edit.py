# TU.29.5 — REAL MIND'S EYE = IMAGINATION. Demote the glyph printer, wire
# recall-first visual memory into both imagine paths, attach the new mixin +
# WS intake, load the standalone feeder.
import io

def load(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        c = f.read()
    return c, ('\r\n' if '\r\n' in c[:4000] else '\n')

def save(p, c):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(c)

# ════ 1. js/brain/mindspace/gpu.js ════
p = 'js/brain/mindspace/gpu.js'
c, nl = load(p)

# 1a. symbol-extraction helper before renderThoughtPlane
anchor = '// TU.29.1 — compose the thought plane in FULL COLOR'
assert c.count(anchor) == 1
helper_lines = [
    "// TU.29.5 — glyphs DEMOTED to genuinely symbolic thoughts. A human mind's eye",
    '// pictures "7" as the numeral and "B" as the letterform, but it does NOT print',
    '// sentences across the visual field — imagination is not a caption. Only digit',
    '// tokens, math operators and single letters survive to the glyph raster; every',
    '// other thought renders as her state textured in the named color / her mood',
    '// (the abstract field), and CONCRETE imagery comes from the visual-memory',
    '// recall + morph layer (server/brain-server/visual-memory.js) which bypasses',
    '// this de-novo path entirely when a stored real percept matches the thought.',
    'function symbolGlyphText(text) {',
    "  const t = String(text || '').trim();",
    "  if (!t) return '';",
    '  const symbolish = t.split(/\\s+/).filter(w =>',
    '    /^[0-9]+([.,][0-9]+)?$/.test(w)      // numbers — pictured as numerals',
    '    || /^[+\\-x=<>?!]$/.test(w)           // math / punctuation symbols',
    '    || /^[a-zA-Z]$/.test(w));             // single letters — pictured as letterforms',
    "  return symbolish.length ? symbolish.slice(0, 12).join(' ') : '';",
    '}',
    '',
]
c = c.replace(anchor, nl.join(helper_lines) + anchor)

# 1b. renderThoughtPlane signature + tint source + no-glyph field contrast
old_sig = 'function renderThoughtPlane(text, stateVector, W, H, mood) {'
assert c.count(old_sig) == 1
c = c.replace(old_sig, 'function renderThoughtPlane(glyphText, stateVector, W, H, mood, tintText) {')

old_txt = "  const txt = String(text || '').toUpperCase().replace(/\\s+/g, ' ').trim().slice(0, 180);\n  // color-word detection on the thought itself\n  let tint = null;\n  for (const w of txt.toLowerCase().split(/[^a-z]+/)) {"
old_txt = old_txt.replace('\n', nl)
assert c.count(old_txt) == 1, 'renderThoughtPlane txt/tint block not found'
new_txt = (
    "  const txt = String(glyphText || '').toUpperCase().replace(/\\s+/g, ' ').trim().slice(0, 180);" + nl
    + "  // color-word detection on the FULL thought (tintText) — a non-symbolic thought" + nl
    + "  // contributes no glyphs but its named color still paints the field." + nl
    + "  const tintSrc = String(tintText || glyphText || '').toLowerCase();" + nl
    + "  let tint = null;" + nl
    + "  for (const w of tintSrc.split(/[^a-z]+/)) {"
)
c = c.replace(old_txt, new_txt)

old_lohi = ('  // background: state texture modulates the tint. A NAMED color paints strong (a "solid' + nl
            + '  // red sheet" reads as a red field); mood tint stays faint so glyphs dominate.' + nl
            + '  const lo = named ? 0.30 : 0.06, hi = named ? 0.55 : 0.28;')
assert c.count(old_lohi) == 1, 'lo/hi block not found'
new_lohi = ('  // background: state texture modulates the tint. A NAMED color paints strong (a "solid' + nl
            + '  // red sheet" reads as a red field). With NO glyph overlay the state texture IS the' + nl
            + '  // image — render it vivid (her mind-state in color), not near-black; with glyphs,' + nl
            + '  // keep it faint so the symbols dominate.' + nl
            + '  let lo, hi;' + nl
            + '  if (!txt) { lo = named ? 0.45 : 0.25; hi = named ? 0.95 : 0.85; }' + nl
            + '  else { lo = named ? 0.30 : 0.06; hi = named ? 0.55 : 0.28; }')
c = c.replace(old_lohi, new_lohi)

# 1c. imagineFromState — symbol-gated glyph mode
old_mode = (
    '    const hasText = typeof opts.text === ' + chr(39) + 'string' + chr(39) + ' && opts.text.trim().length > 0;' + nl
    + '    let side;' + nl
    + '    if (hasText) {' + nl
    + '      side = Math.max(48, Math.round(maxSide * (0.75 + 0.25 * ratio)));' + nl
    + '    } else {' + nl
    + '      const baseSide = Math.max(8, Math.min(maxSide, Math.floor(Math.sqrt(stateVector.length)) || 8));' + nl
    + '      side = Math.max(32, Math.round(baseSide * (0.5 + 0.5 * ratio)));' + nl
    + '    }' + nl
    + '    side = Math.min(side, maxSide);' + nl
    + '    const W = side, H = side;' + nl
    + '    const data = renderThoughtPlane(hasText ? opts.text : ' + chr(39) + chr(39) + ', stateVector, W, H, opts.mood);'
)
assert c.count(old_mode) == 1, 'imagineFromState mode block not found'
new_mode = (
    '    // TU.29.5 — IMAGINATION, not a text printer. Glyphs fire ONLY for genuinely' + nl
    + '    // symbolic thoughts (numbers / single letters / math marks — symbols a mind' + nl
    + "    // pictures AS glyphs). Everything else renders as her live state textured in" + nl
    + "    // the thought's named color or her mood — the abstract field a mind holds for" + nl
    + '    // a concept it has never SEEN. Concrete imagery (banana as a banana) comes' + nl
    + '    // from the visual-memory recall/morph layer, which bypasses this path.' + nl
    + '    const glyphText = symbolGlyphText(opts.text);' + nl
    + '    const hasGlyphs = glyphText.length > 0;' + nl
    + '    let side;' + nl
    + '    if (hasGlyphs) {' + nl
    + '      side = Math.max(48, Math.round(maxSide * (0.75 + 0.25 * ratio)));   // legibility floor' + nl
    + '    } else {' + nl
    + '      const baseSide = Math.max(8, Math.min(maxSide, Math.floor(Math.sqrt(stateVector.length)) || 8));' + nl
    + '      side = Math.max(32, Math.round(baseSide * (0.5 + 0.5 * ratio)));' + nl
    + '    }' + nl
    + '    side = Math.min(side, maxSide);' + nl
    + '    const W = side, H = side;' + nl
    + '    const data = renderThoughtPlane(glyphText, stateVector, W, H, opts.mood, opts.text);'
)
c = c.replace(old_mode, new_mode)

# 1d. expose morphField on the class (equation-domain recombination for recall)
old_desc = '  describe(rec, dim) { return CPU.describeEquational(rec, dim); }'
assert c.count(old_desc) == 1
new_desc = (old_desc + nl + nl
    + '  // TU.29.5 — equation-domain blend of two stored percepts (coefficient-set' + nl
    + '  // union + lerp, transform.js morphField). This is the RECOMBINATION step of' + nl
    + '  // imagination: two seen field Cs fuse into one imagined field C without ever' + nl
    + '  // leaving the equational domain. Returns null on canvas/pad dim mismatch.' + nl
    + '  morph(recA, recB, t) { return CPU.morphField(recA, recB, t); }')
c = c.replace(old_desc, new_desc)
save(p, c)
print('mindspace gpu.js: glyphs demoted + morph exposed')

# ════ 2. server/brain-server/chat.js — recall-first at both imagine sites ════
p = 'server/brain-server/chat.js'
c, nl = load(p)

# 2a. IMG-SEE preview: recall before de-novo
old_see = (
    '            const emb = this.sharedEmbeddings.getSentenceEmbedding(imgPrompt);' + nl
    + '            // TU.29 — pass the prompt TEXT + live mood so the mind' + chr(39) + 's eye renders the' + nl
    + '            // actual words in color at full resolution, not a ~17px embedding-noise plane.' + nl
    + '            const rec = this.mindSpace.imagineFromState(emb, {' + nl
    + '              maxSide: 96, text: imgPrompt,' + nl
    + '              mood: { arousal: this.arousal, valence: this.valence },' + nl
    + '              priority: 0.4, value: 0.6,' + nl
    + '            });'
)
assert c.count(old_see) == 1, 'IMG-SEE block not found'
new_see = (
    '            // TU.29.5 — RECALL FIRST: if she has SEEN this concept (visual-memory' + nl
    + '            // field C bound at perception time), the preview is the real remembered' + nl
    + '            // percept — recombined via morphField when two concepts match. Only an' + nl
    + '            // unseen concept falls to the de-novo abstract/symbol plane.' + nl
    + '            let rec = null;' + nl
    + '            if (typeof this._recallVisualMemory === ' + chr(39) + 'function' + chr(39) + ') {' + nl
    + '              try {' + nl
    + '                const hit = this._recallVisualMemory(imgPrompt);' + nl
    + '                if (hit) rec = hit.rec;' + nl
    + '              } catch { /* recall best-effort */ }' + nl
    + '            }' + nl
    + '            if (!rec) {' + nl
    + '              const emb = this.sharedEmbeddings.getSentenceEmbedding(imgPrompt);' + nl
    + '              rec = this.mindSpace.imagineFromState(emb, {' + nl
    + '                maxSide: 96, text: imgPrompt,' + nl
    + '                mood: { arousal: this.arousal, valence: this.valence },' + nl
    + '                priority: 0.4, value: 0.6,' + nl
    + '              });' + nl
    + '            }'
)
c = c.replace(old_see, new_see)

# 2b. _imagineTick: recall before de-novo
old_tick = (
    '      // TU.29 — text mode + color: the plane shows the thought' + chr(39) + 's words (glyph raster over' + nl
    + '      // a mood/color-tinted state texture) at up to 96px instead of grayscale noise at <=48px.' + nl
    + '      const rec = this.mindSpace.imagineFromState(_seed, {' + nl
    + '        maxSide: 96, text: _seedText,' + nl
    + '        mood: { arousal: this.arousal, valence: this.valence },' + nl
    + '        priority: 0.25, value: 0.4,' + nl
    + '      });' + nl
    + '      if (!rec) return;'
)
assert c.count(old_tick) == 1, '_imagineTick block not found'
new_tick = (
    '      // TU.29.5 — IMAGINATION = RECALL + RECOMBINE first. If her thought names' + nl
    + '      // concepts she has actually SEEN (camera frames / generated images bound in' + nl
    + '      // visual memory at perception time), the mind' + chr(39) + 's eye re-sees the stored field C' + nl
    + '      // — morphField-blended when two concepts match (recombination). The de-novo' + nl
    + '      // plane (symbol glyphs for numbers/letters, color/mood field otherwise) only' + nl
    + '      // fires for concepts with no grounded percept — like a mind imagining' + nl
    + '      // something it has never seen.' + nl
    + '      let rec = null;' + nl
    + '      if (_seedText && typeof this._recallVisualMemory === ' + chr(39) + 'function' + chr(39) + ') {' + nl
    + '        try {' + nl
    + '          const hit = this._recallVisualMemory(_seedText);' + nl
    + '          if (hit) {' + nl
    + '            rec = hit.rec;' + nl
    + '            _seedSource = (hit.recombined ? ' + chr(39) + 'recall+morph:' + chr(39) + ' : ' + chr(39) + 'recall:' + chr(39) + ') + hit.matched.join(' + chr(39) + '+' + chr(39) + ');' + nl
    + '          }' + nl
    + '        } catch { /* recall best-effort — de-novo below */ }' + nl
    + '      }' + nl
    + '      if (!rec) {' + nl
    + '        rec = this.mindSpace.imagineFromState(_seed, {' + nl
    + '          maxSide: 96, text: _seedText,' + nl
    + '          mood: { arousal: this.arousal, valence: this.valence },' + nl
    + '          priority: 0.25, value: 0.4,' + nl
    + '        });' + nl
    + '      }' + nl
    + '      if (!rec) return;'
)
c = c.replace(old_tick, new_tick)
save(p, c)
print('chat.js: recall-first wired at both imagine sites')

# ════ 3. server/brain-server.js — require + attach + WS intake case ════
p = 'server/brain-server.js'
c, nl = load(p)

old_req = "const { SERVER_CHAT_MIXIN } = require('./brain-server/chat.js');"
assert c.count(old_req) == 1
c = c.replace(old_req, old_req + nl + "const { SERVER_VISUAL_MEMORY_MIXIN } = require('./brain-server/visual-memory.js');")

old_assign = 'Object.assign(ServerBrain.prototype, SERVER_CHAT_MIXIN);'
assert c.count(old_assign) == 1
c = c.replace(old_assign, old_assign + nl + 'Object.assign(ServerBrain.prototype, SERVER_VISUAL_MEMORY_MIXIN);')

old_case = ("        case 'setName':" + nl
            + '          client.name = msg.name;' + nl
            + '          break;')
assert c.count(old_case) == 1, 'setName case not found'
new_case = (
    "        case 'visual_frame': {" + nl
    + '          // Visual intake — what her eyes receive (camera frames /' + nl
    + '          // generated images) from the standalone client feeder' + nl
    + '          // (js/visual-feeder.js). Equationalized into a full-color field C' + nl
    + '          // and bound to the concepts active at perception time so the' + nl
    + "          // mind's eye can RECALL + RECOMBINE real percepts at imagine-time." + nl
    + '          // Strictly validated + paced inside; fire-and-forget.' + nl
    + '          brain._ingestVisualFrame(msg).catch(() => { /* intake best-effort */ });' + nl
    + '          break;' + nl
    + '        }' + nl
    + nl
    + old_case
)
c = c.replace(old_case, new_case)
save(p, c)
print('brain-server.js: mixin attached + visual_frame intake live')

# ════ 4. index.html — load the standalone feeder ════
p = 'index.html'
c, nl = load(p)
anchor = '<!-- ═══ Compute Leaderboard'
i = c.find(anchor)
assert i != -1, 'leaderboard comment not found'
line_start = c.rfind(nl, 0, i) + len(nl)
tag = (
    '  <!-- Visual intake — standalone module (NOT bundled): ships camera frames' + nl
    + '       (permission-gated, never prompts) + generated-image renders to the brain' + nl
    + "       as tiny 96x96 visual_frame messages so her mind's eye learns to recall" + nl
    + '       real percepts. Raw-served so a plain file overlay deploys it. -->' + nl
    + '  <script type="module" src="js/visual-feeder.js"></script>' + nl + nl
)
c = c[:line_start] + tag + c[line_start:]
save(p, c)
print('index.html: feeder module loaded')
