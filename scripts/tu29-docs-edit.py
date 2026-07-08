# TU.29 — docs ceremony: TODO color-verbatim amend + status flips, FINALIZED entry, NOW banner
import io

# ════ TODO: amend color verbatim + flip statuses ════
p = 'docs/TODO.md'
with io.open(p, 'r', encoding='utf-8', newline='') as f:
    c = f.read()
nl = '\r\n' if '\r\n' in c[:5000] else '\n'

# add Gee's color verbatim to the TU.29 header block (after the investigation sentence, before "Tasks:")
m = 'so "what she sees" was never wired in. Tasks:'
assert c.count(m) == 1, 'TU.29 header anchor not found'
c = c.replace(m, ('so "what she sees" was never wired in. COLOR addendum (Gee verbatim): "aslso its greyscale when she '
                  'needs to use rull range of colors from a solid rad sheet to a american flag to a scene of crayon drawn '
                  'family like childrens art artlr on" — the plane was grayscale end-to-end even though the field-C '
                  'pipeline (equationalizeImageData YCbCr channels + viewer reconstructImageData) already carries full '
                  'color; TU.29.1 now renders in color (named-color-word detection tints the field — "red sheet" reads '
                  'RED — and her live mood valence→hue / arousal→saturation tints it when no color is named). Tasks:'))

for tid in ('TU.29.1', 'TU.29.2'):
    old = '    - `[~]` **%s' % tid
    assert c.count(old) == 1, tid
    c = c.replace(old, '    - `[x]` **%s' % tid)

with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(c)
print('TODO amended + statuses flipped')

# ════ FINALIZED entry ════
p2 = 'docs/FINALIZED.md'
with io.open(p2, 'r', encoding='utf-8', newline='') as f:
    c2 = f.read()
nl2 = '\r\n' if '\r\n' in c2[:5000] else '\n'
L = []
L.append('')
L.append("## 2026-07-08 — TU.29 COMPLETE (mind's eye rectify: thought→glyph plane in FULL COLOR + resolution 48→96 + viewer smooth upscale)")
L.append('')
L.append('> Task directive (verbatim from Gee, 2026-07-08): *"can you also fix the minds eye? its like only 100 pixels by the looks of it its resolution is shit and very blocky loocking and i dont dsee Unity using it at all its just random static when she is suppose to be imageing the things she is thinking about from images of a bannana to words and letters and numbers and images of people and things like what she sees in the camera connected and what she imagines... is it suppose to be just static like.,.. thats not right"* + color addendum: *"aslso its greyscale when she needs to use rull range of colors from a solid rad sheet to a american flag to a scene of crayon drawn family like childrens art artlr on"*.')
L.append('')
L.append("ROOT CAUSES (code-audited): the \"static\" was BY CONSTRUCTION — imagineFromState (js/brain/mindspace/gpu.js) painted the raw seed vector as min-max-normalized GRAY pixels sampled linearly across the plane (a noise readout, not an image OF anything); the \"100 pixels blocky\" was maxSide=48 at both call sites, governor-shrinkable to ~24, AND the image-preview path seeding from a ~300-dim sentence embedding whose sqrt collapsed baseSide to ~17px — then the viewer CSS-stretched that to 512px with image-rendering:pixelated; grayscale end-to-end even though equationalizeImageData/reconstructImageData already carry YCbCr color. SHIPPED: **TU.29.1** thought→glyph plane in full color — built-in pure-JS 5x7 bitmap font (A-Z 0-9 punct, visually-verifiable in-source), word-wrapped + centered + 2x scale for short thoughts, rendered over her live state texture; COLOR_WORDS detection tints the field when her thought names a color (\"red sheet\" → red field, glyphs lightened toward white) and moodTint (valence→hue, arousal→saturation) colors it when no color is named; equational end-to-end (glyph plane → bounded forward CDF 9/7 → field C), NO text-AI, NO fractalize, side hard-capped ≤96 per the operator nanometer caution. **TU.29.2** resolution — maxSide 48→96 at both call sites (server/brain-server/chat.js: the IMG-SEE image-preview + the _imagineTick daydream), text mode floors at 48px legibility regardless of embedding length/governor ratio (spend still allotted), vector mode floors at 32px and takes the mood tint; the thought TEXT + live mood now ride the call (`_seedText` captured beside the embedding seed); viewer (html/minds-eye.html) drops image-rendering:pixelated for smooth upscale + 96px default canvas. Verified: node --check clean (gpu.js, chat.js) + live import() of the mindspace module OK. No bundle dependency for the live path (server imports mindspace ESM directly; the viewer imports transform.js directly as a served module — transform.js unchanged). Follow-ups OPEN in TODO: TU.29.3 camera→mind's-eye (client downsampled frame → WS → equationalize the REAL frame), TU.29.4 concrete imagery (equationalize generated/seen image pixels client-side so \"a bannana\"/\"people\" render as pictures, not words). Edit scripts: scripts/tu29-mindspace-edit.py, scripts/tu29-chatjs-viewer-edit.py.")
L.append('')
c2 = c2 + nl2.join(L) + nl2
with io.open(p2, 'w', encoding='utf-8', newline='') as f:
    f.write(c2)
print('FINALIZED appended')

# ════ NOW banner ════
p3 = 'docs/NOW.md'
with io.open(p3, 'r', encoding='utf-8', newline='') as f:
    c3 = f.read()
nl3 = '\r\n' if '\r\n' in c3[:3000] else '\n'
idx = c3.find('> **Current')
banner = ("> **Current — 2026-07-08 — TU.29 SHIPPED (mind's eye rectify): the viewer was showing raw state-vector "
          "noise on a ≤48px (often ~17px) grayscale plane stretched to 512px pixelated. Now the plane renders WHAT "
          "SHE IS THINKING — the thought's words/letters/numbers glyph-rastered (built-in 5x7 font) in FULL COLOR "
          "(named color words tint the field, mood valence/arousal tints it otherwise) over her live state texture, "
          "at up to 96px with a 48px legibility floor, smooth-upscaled in the viewer. Equational end-to-end, no "
          "text-AI, no fractalize, ≤96 hard cap intact. Rides the same deploy as TU.28. Follow-ups open: TU.29.3 "
          "camera frames → mind's eye, TU.29.4 concrete imagery (banana/people as pictures via client-side "
          "equationalize).**" + nl3 + nl3)
if idx != -1:
    c3 = c3[:idx] + banner + c3[idx:]
else:
    c3 = banner + c3
with io.open(p3, 'w', encoding='utf-8', newline='') as f:
    f.write(c3)
print('NOW banner added')
