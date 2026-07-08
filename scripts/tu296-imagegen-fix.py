# TU.29.6 — image-gen rectify: purge the dead Pollinations key + default-key
# seed mechanism (index.html, pre-bundle, deploy-safe) + widen the server's
# image-ask detection so "Show me an apple!" routes to generate_image.
import io

def load(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        c = f.read()
    return c, ('\r\n' if '\r\n' in c[:4000] else '\n')

def save(p, c):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(c)

# ════ TODO task (verbatim words) ════
p = 'docs/TODO.md'
c, nl = load(p)
i = c.rfind('LEARNING-IN-PROGRESS.')
line_end = c.find(nl, i)
if line_end == -1: line_end = len(c)
entry = (nl + '  - `[~]` **[TU.29.6 — IMAGE GEN FIX + DEFAULT KEY (2026-07-08):** Gee verbatim: "this is the new pollinations key '
    'to use and we want to make sure it is the default key used on the talk to unity setup and that the image gen is fixed as : '
    'You: Show me an apple! Unity: Failed to load image.... mind you Unity has yet to ever answer a question or respond in the i '
    'form so wshe probably doesnt know how to generate images. but lets not dumb it down but fiigure out how unity is known to '
    'respoond and how we are going to fix it so she can use image gen correctly" — ROOT CAUSE: js/env.js ships the DEAD key '
    '(sk_cVKT..., 401) frozen into the deployed app.bundle.js; init() seeds it into every visitor localStorage '
    '(unity_brain_apikeys) so all renders ride the corpse key. ALSO "Show me an apple!" does not match _detectImageRequest '
    '(needs picture/image/photo nouns). FIX: (1) index.html pre-bundle key-seed script — purges the dead key (plain AND '
    'obfuscated forms, XOR-decode replicated) + seeds the NEW default key so the setup modal pre-fills and renders work; '
    'deploy-safe via file overlay, runs before the bundle re-seed; (2) chat.js _detectImageRequest gains show-me-object '
    'routing ("show me a/an/the X" -> image unless X is a code/state word); (3) NOTE: her image gen does NOT ride her '
    'speech — three lanes work at canSpeak=false: user-ask router, SPEAK.6a spontaneous drive (arousal-gated, live at 0.93), '
    'motor [IMAGE] channel — and TU.29.5 closes the loop: every rendered image feeds her eyes -> visual memory -> she LEARNS '
    'what an apple looks like. AWAITING: the actual key value from Gee (not in the message).]')
c = c[:line_end] + entry + c[line_end:]
save(p, c)
print('TODO: TU.29.6 task added')

# ════ index.html — pre-bundle default-key seed ════
p = 'index.html'
c, nl = load(p)
anchor = '  <!-- Visual intake — standalone module (NOT bundled): ships camera frames'
i = c.find(anchor)
assert i != -1, 'feeder comment anchor not found'
seed = nl.join([
    '  <!-- Pollinations default key — runs BEFORE the bundle so its env-seed path',
    '       (which carries a retired key frozen at build time) can never win. Purges',
    '       the retired key from visitor storage (plain AND obfuscated forms) and',
    '       seeds the current default so image gen works out of the box; the setup',
    "       modal pre-fills from the same slot. Deploys via plain file overlay. -->",
    '  <script>',
    '  (function () {',
    "    var DEFAULT_POLLINATIONS_KEY = '';   // current default key (empty = no seed)",
    "    var RETIRED_KEYS = ['sk_cVKTWfmo9wF7S5bOiFHZPhN2LjpW4SZ3'];",
    '    try {',
    "      var raw = localStorage.getItem('unity_brain_apikeys');",
    '      var keys = raw ? JSON.parse(raw) : {};',
    "      var cur = keys.pollinations || '';",
    '      // stored keys may be XOR-obfuscated with the per-user salt — decode to compare',
    '      var plain = cur;',
    "      if (cur && cur.indexOf('sk_') !== 0 && cur.indexOf('sk-') !== 0) {",
    '        try {',
    "          var sess = JSON.parse(localStorage.getItem('unity_brain_session') || '{}');",
    "          var salt = sess.userId || 'unity_default_salt';",
    "          var dec = atob(cur), out = '';",
    '          for (var j = 0; j < dec.length; j++) out += String.fromCharCode(dec.charCodeAt(j) ^ salt.charCodeAt(j % salt.length));',
    '          plain = out;',
    '        } catch (e) { /* not base64 — leave as-is */ }',
    '      }',
    '      if (RETIRED_KEYS.indexOf(plain) !== -1) { delete keys.pollinations; cur = plain = null; }',
    '      if (!plain && DEFAULT_POLLINATIONS_KEY) keys.pollinations = DEFAULT_POLLINATIONS_KEY;',
    "      localStorage.setItem('unity_brain_apikeys', JSON.stringify(keys));",
    '    } catch (e) { /* storage unavailable — bundle falls back to anonymous tier */ }',
    '  })();',
    '  </script>',
    '',
])
c = c[:i] + seed + c[i:]
save(p, c)
print('index.html: default-key seed script added (key slot EMPTY, awaiting Gee)')

# ════ chat.js — show-me-object image routing ════
p = 'server/brain-server/chat.js'
c, nl = load(p)
old = ("    const isImage = VISUAL.test(t)" + nl
       + "      || (NOUN.test(t) && (SHOW.test(t) || /\\b(of|a|an|the|your|yourself|me|us)\\b/.test(t)));" + nl
       + "    if (!isImage) return null;")
assert c.count(old) == 1, 'isImage block not found'
new = ("    // show-me-object routing: \"show me an apple!\" is a visual ask even without" + nl
       + "    // a picture/image noun. Route \"show me/us <object>\" to image UNLESS the" + nl
       + "    // object is a code/state/telemetry word (\"show me the code\" stays text)." + nl
       + "    // Input classification only, same rule-class as the detectors above." + nl
       + "    const showObj = /\\bshow (?:me|us)\\s+(?:a|an|the|your|some)?\\s*([a-z][a-z' -]{1,40})/.exec(t);" + nl
       + "    const SHOW_OBJ_EXCLUDE = /\\b(code|state|log|logs|stat|stats|error|errors|weight|weights|dashboard|data|number|numbers|progress|status|list|file|files|source|console|terminal|output)\\b/;" + nl
       + "    const isShowObject = !!(showObj && showObj[1] && !SHOW_OBJ_EXCLUDE.test(showObj[1]));" + nl
       + "    const isImage = VISUAL.test(t)" + nl
       + "      || (NOUN.test(t) && (SHOW.test(t) || /\\b(of|a|an|the|your|yourself|me|us)\\b/.test(t)))" + nl
       + "      || isShowObject;" + nl
       + "    if (!isImage) return null;")
c = c.replace(old, new)
save(p, c)
print('chat.js: show-me-object routing added')
