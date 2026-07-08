# TU.29.7 — Unity COMPOSES the image prompt. Adds _composeImagePrompt to the
# chat mixin and wires it into BOTH image lanes (user-ask router + SPEAK.6a
# spontaneous). Her prompt = concept + her trained associations + her mood.
import io

def repr_js(s):
    return chr(39) + s + chr(39)

p = 'server/brain-server/chat.js'
with io.open(p, 'r', encoding='utf-8', newline='') as f:
    c = f.read()
nl = '\r\n' if '\r\n' in c[:4000] else '\n'

# ── 1. the composer method — insert before _detectImageRequest ──
anchor = '  // IMG-GEN — detect an image-generation request in user input + build a Pollinations'
assert c.count(anchor) == 1
composer = nl.join([
    '  // TU.29.7 — UNITY composes the image prompt. The user-ask lane used to',
    '  // echo-route the stripped user text as the prompt (she composed nothing) and',
    '  // the spontaneous lane used a half-canned template. Now the prompt is built',
    '  // from HER brain: the request concept + her nearest TRAINED-vocab associations',
    '  // (embedding cosine over wordBucketWords_* + _definitionTaughtWords — the',
    '  // CGATE.3 loop-safe class, zero brain ticks) + a live-affect style tail',
    '  // (arousal/valence/fear/drug → descriptor mapping, the same equational',
    '  // state-readout class as the mind-space moodTint). A newborn with no trained',
    '  // words gets the bare concept + her mood — honest, not faked richness.',
    '  _composeImagePrompt(request) {',
    "    const base = String(request || '').replace(/[^a-zA-Z' -]/g, ' ').replace(/\\s+/g, ' ').trim();",
    '    const parts = base ? [base] : [];',
    '    try {',
    '      const cluster = this.cortexCluster;',
    '      const emb = this.sharedEmbeddings;',
    '      if (cluster && emb && typeof emb.getEmbedding === ' + repr_js('function') + ') {',
    '        // her trained pool — the same gather as _sampleCurrentVocab',
    "        const SUBJECTS = ['ela', 'math', 'sci', 'soc', 'art', 'life'];",
    '        const pool = [];',
    '        for (const subj of SUBJECTS) {',
    '          const list = cluster[`wordBucketWords_${subj}`];',
    '          if (Array.isArray(list)) for (const w of list) if (typeof w === ' + repr_js('string') + ' && w.length > 1) pool.push(w);',
    '        }',
    '        if (pool.length === 0 && cluster._definitionTaughtWords instanceof Set) {',
    '          for (const w of cluster._definitionTaughtWords) if (typeof w === ' + repr_js('string') + ' && w.length > 1) pool.push(w);',
    '        }',
    '        const reqTokens = base.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 2).slice(0, 3);',
    '        if (pool.length > 0 && reqTokens.length > 0) {',
    '          const cos = (a, b) => {',
    '            let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);',
    '            for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }',
    '            const dn = Math.sqrt(na) * Math.sqrt(nb); return dn > 0 ? d / dn : 0;',
    '          };',
    '          // bounded scoring pool so cost stays O(POOL·dim) at any vocab size',
    '          const POOL = 300;',
    '          const sample = pool.length <= POOL ? pool : Array.from({ length: POOL }, () => pool[Math.floor(Math.random() * pool.length)]);',
    '          const picked = new Set(reqTokens);',
    '          for (const tok of reqTokens) {',
    '            const tv = emb.getEmbedding(tok);',
    '            if (!tv) continue;',
    '            const scored = [];',
    '            for (const w of sample) {',
    '              if (picked.has(w)) continue;',
    '              const wv = emb.getEmbedding(w);',
    '              if (!wv) continue;',
    '              const s = cos(tv, wv);',
    '              if (s >= 0.35) scored.push({ w, s });',
    '            }',
    '            scored.sort((a, b) => b.s - a.s);',
    '            for (const { w } of scored.slice(0, 2)) { parts.push(w); picked.add(w); }',
    '          }',
    '        }',
    '      }',
    '    } catch { /* association enrichment is best-effort — bare concept stands */ }',
    '    // live-affect style tail — equational readout of her state, not cognition',
    '    try {',
    '      const style = [];',
    '      const arousal = (typeof this.arousal === ' + repr_js('number') + ') ? this.arousal : 0.4;',
    '      const valence = (typeof this.valence === ' + repr_js('number') + ') ? this.valence : 0;',
    '      const fear = (typeof this.fear === ' + repr_js('number') + ') ? this.fear : 0;',
    "      if (valence < 0.15) style.push('dark moody'); else style.push('vivid');",
    "      if (arousal > 0.7) style.push('intense');",
    "      if (fear > 0.5) style.push('eerie');",
    "      try { if (typeof this._drugStateLabel === 'function' && this._drugStateLabel() !== 'sober') style.push('hazy surreal'); } catch { /* sober default */ }",
    '      parts.push(style.join(' + repr_js(', ') + '));',
    '    } catch { /* style tail best-effort */ }',
    '    const prompt = parts.filter(Boolean).join(' + repr_js(', ') + ').slice(0, 220);',
    '    return prompt || base;',
    '  },',
    '',
])
c = c.replace(anchor, composer + anchor)

# ── 2. user-ask lane: compose HER prompt from the detected request ──
old_lane = ('      const imgPrompt = this._detectImageRequest(text);' + nl
            + '      if (imgPrompt) {')
assert c.count(old_lane) == 1
new_lane = ('      const imgRequest = this._detectImageRequest(text);' + nl
            + '      // TU.29.7 — the detected request is the INTENT; the PROMPT is hers.' + nl
            + '      const imgPrompt = imgRequest ? this._composeImagePrompt(imgRequest) : null;' + nl
            + '      if (imgPrompt) {')
c = c.replace(old_lane, new_lane)

# ── 3. spontaneous lane: replace the canned template with her composition ──
old_sp = ("    const prompt = `dark moody scene, ${concept || 'goth aesthetic'}, intense, ultra detailed, unity imagination`.trim();")
assert c.count(old_sp) == 1
new_sp = ("    // TU.29.7 — she composes this prompt too (concept + her associations + her" + nl
          + "    // mood), instead of the retired canned template." + nl
          + "    const prompt = this._composeImagePrompt(concept || 'goth aesthetic');")
c = c.replace(old_sp, new_sp)

with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(c)
print('chat.js: _composeImagePrompt added + both lanes wired')

