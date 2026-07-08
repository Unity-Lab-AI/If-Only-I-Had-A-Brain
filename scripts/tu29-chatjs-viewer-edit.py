# TU.29 — chat.js call-site wiring (text + mood + 96px) and minds-eye.html viewer polish
import io

# ════ chat.js ════
p = 'server/brain-server/chat.js'
with io.open(p, 'r', encoding='utf-8', newline='') as f:
    c = f.read()
nl = '\r\n' if '\r\n' in c[:2000] else '\n'

# ---- Edit 1: IMG-SEE preview call site — text + mood + 96 ----
old1 = "            const rec = this.mindSpace.imagineFromState(emb, { maxSide: 48, priority: 0.4, value: 0.6 });"
assert c.count(old1) == 1, 'img-see call not unique: %d' % c.count(old1)
new1_src = '''            // TU.29 — pass the prompt TEXT + live mood so the mind's eye renders the
            // actual words in color at full resolution, not a ~17px embedding-noise plane.
            const rec = this.mindSpace.imagineFromState(emb, {
              maxSide: 96, text: imgPrompt,
              mood: { arousal: this.arousal, valence: this.valence },
              priority: 0.4, value: 0.6,
            });'''
c = c.replace(old1, new1_src.replace('\n', nl))

# ---- Edit 2: _imagineTick — capture the thought TEXT next to the embedding seed ----
old2 = "      let _seed = null;" + nl + "      let _seedSource = 'thought';"
assert c.count(old2) == 1, 'seed decl not unique: %d' % c.count(old2)
new2 = ("      let _seed = null;" + nl
        + "      let _seedText = null;   // TU.29 — the thought's TEXT rides along so the plane renders the words" + nl
        + "      let _seedSource = 'thought';")
c = c.replace(old2, new2)

old3 = "          const cur = this.sharedEmbeddings.getSentenceEmbedding(texts[texts.length - 1]);"
assert c.count(old3) == 1, 'cur embed line not unique: %d' % c.count(old3)
new3 = ("          _seedText = texts[texts.length - 1];   // TU.29 — what she is thinking, verbatim" + nl
        + old3)
c = c.replace(old3, new3)

# ---- Edit 3: _imagineTick call site — text + mood + 96 ----
old4 = ("      const rec = this.mindSpace.imagineFromState(_seed," + nl
        + "        { maxSide: 48, priority: 0.25, value: 0.4 });")
assert c.count(old4) == 1, 'imagine tick call not unique: %d' % c.count(old4)
new4_src = '''      // TU.29 — text mode + color: the plane shows the thought's words (glyph raster over
      // a mood/color-tinted state texture) at up to 96px instead of grayscale noise at <=48px.
      const rec = this.mindSpace.imagineFromState(_seed, {
        maxSide: 96, text: _seedText,
        mood: { arousal: this.arousal, valence: this.valence },
        priority: 0.25, value: 0.4,
      });'''
c = c.replace(old4, new4_src.replace('\n', nl))

with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(c)
print('chat.js edits applied')

# ════ minds-eye.html viewer ════
p2 = 'html/minds-eye.html'
with io.open(p2, 'r', encoding='utf-8', newline='') as f:
    c2 = f.read()
nl2 = '\r\n' if '\r\n' in c2[:2000] else '\n'

# smooth upscale instead of pixelated blocks
old5 = 'image-rendering:pixelated;'
assert c2.count(old5) == 1, 'pixelated rule not unique: %d' % c2.count(old5)
c2 = c2.replace(old5, '/* TU.29.2 — smooth upscale (was image-rendering:pixelated = maximal blocks) */')

# default canvas 64 -> 96 to match the new native size
old6 = '<canvas id="eye" width="64" height="64"></canvas>'
assert c2.count(old6) == 1, 'canvas tag not unique: %d' % c2.count(old6)
c2 = c2.replace(old6, '<canvas id="eye" width="96" height="96"></canvas>')

with io.open(p2, 'w', encoding='utf-8', newline='') as f:
    f.write(c2)
print('minds-eye.html edits applied')
