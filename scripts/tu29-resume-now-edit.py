# TU.28/29 hand-off docs: RESUME.md new dated section + NOW.md deploy-pending banner + TODO task
import io

# ════ docs/RESUME.md — prepend 2026-07-08 section + refresh the Updated line ════
p = 'docs/RESUME.md'
with io.open(p, 'r', encoding='utf-8', newline='') as f:
    c = f.read()
nl = '\r\n' if '\r\n' in c[:3000] else '\n'

# refresh the "> **Updated:**" line (keep the old text after our new sentence? No — the doc
# pattern is: Updated line describes the LATEST session; dated ⭐ sections carry history.)
old_upd_start = '> **Updated:** 2026-06-30'
ui = c.find(old_upd_start)
assert ui != -1, 'Updated line not found'
ue = c.find(nl, ui)
old_updated_line = c[ui:ue]
new_updated_line = ('> **Updated:** 2026-07-08 (Opus 4.8 1M-context). This session = **TU.24 conversation-pass cron '
                    '(~200 passes, held through 2 fresh walks + stall diagnostics) → TU.28 donor-pipeline rectify '
                    '(the GB-buffer / red-donor / 12-min-flap / chronic-gpuShadowDirty cluster — root-caused + FIXED) '
                    '→ TU.29 mind\'s-eye rectify (thought→glyph plane in FULL COLOR, was 48px grayscale noise)**. '
                    'Both fixes are ON MAIN @ d252340/d802843 STAGED FOR DEPLOY — Gee presses Update & Savestart '
                    'solo; if ANYTHING fails, the complete recovery runbook is '
                    '`server/SPONGE-COPY-PASTE-tu28-tu29-fallback.txt` (failure modes A-D with exact fixes). '
                    'See §2026-07-08 below.')
c = c[:ui] + new_updated_line + c[ue:]

# insert the new dated section right after the (now-updated) Updated line's paragraph break
ins_at = c.find(nl + '>' + nl, ui)
if ins_at == -1:
    ins_at = c.find(nl, ui + len(new_updated_line))
section_lines = [
'>',
'> ## ⭐ 2026-07-08 — TU.28 donor-pipe fix + TU.29 mind\'s eye + one-shot deploy staged',
'> - **DEPLOY STATE (the thing to check FIRST on pickup):** main @ `d802843` carries TU.28+TU.29. Gee was pressing dashboard **Update & Savestart (keep weights)** with Sponge ~8h away. Outcome unknown at write time → validate per `server/SPONGE-COPY-PASTE-tu28-tu29-fallback.txt` (SUCCESS checklist + failure modes A-D: button-no-op / savestart-wipe / donor-still-flapping / minds-eye-cosmetic). Pre-deploy baseline: passed=2, ela=K, math=K, science/K in-flight (subphases ~166k), kVocabTaught 2,287, canSpeak false.',
'> - **TU.28 (root-caused from Gee\'s live log):** the teach-pattern JSON stream (write_spike_slice/write_current_slice/clear_spike_region, server/brain-server/gpu.js) was the ONLY donor-bound producer with NO bufferedAmount guard → buffer 68MB→1.6GB, heartbeat ping queued 19s behind it (red donor row), compute.html tab OOM-crash-looped ~12min, gpuShadowDirty chronically re-dirtied (the flag + F5 auto-resync WORK — the pipe was unpaced). FIX: `_donorPatternSendGated()` at all 3 write sites + replica mirror, same DREAM_WS_SOFT_SHED_MB knob (64MB default); wsPressure gains patternSheds/mirrorSheds; DREAM_CONSOLIDATION_MAX_MS 30s→45s (every pass was DEADLINE-ABORTing at ~31.5s, cutting Tier-3 promotion EVERY pass). Follow-ups open: TU.28.4 native Rust donor (kills the Chrome-tab OOM class), TU.28.5 binary-pack frames, TU.28.6 credit flow control, TU.28.7 loop chunking (Sponge F7).',
'> - **TU.29 (Gee: mind\'s eye was "random static... 100 pixels... greyscale"):** imagineFromState painted the RAW STATE VECTOR as gray pixels (noise by construction) at ≤48px (embedding path collapsed to ~17px), viewer stretched it pixelated to 512px. FIX: thought→glyph plane — built-in 5x7 font renders the thought\'s WORDS/letters/numbers in FULL COLOR (COLOR_WORDS detection: "red sheet"→red field; moodTint valence→hue/arousal→saturation otherwise) over her live state texture, 96px cap / 48px floor, viewer smooth-upscale. Verified by live smoke: ASCII dump shows legible letterforms, 9216/9216 red-dominant px on "red banana 7". Equational end-to-end, no fractalize, ≤96 cap intact, both call sites inside try/catch (renderer bug can NEVER take the brain down). Follow-ups: TU.29.3 camera→eye, TU.29.4 concrete imagery (banana as PICTURE via client-side equationalize).',
'> - **TU.24 cron is OFF** (Gee: "stop the cron"). To resume the talk rig: window held by `scripts/unity-chat-hold.mjs` (CDP :9222, ONE window forever), sends via `node scripts/unity-say-live.mjs "<line>"`. canSpeak was false all session (fresh walks). SPEAK.11 (floor relief) deployed+validated by Sponge: mechanically active but function words STILL never argmax-win → **SPEAK.12 (training-depth on _teachSentenceStructure) is the next brain-side fix, twice-confirmed** (Sponge TU.26 verdict + live compositionalEmergence read: 10/10 novel-compositional, ZERO function words).',
'> - **Also this session:** gpuShadowDirty stall diagnosed live (5-read flatline → buffer irrelevant → un-armed resync = F5 deploy gap, later confirmed fixed by Sponge\'s merged F5); Pollinations image key on the box is DEAD (401 tested) — Gee plugs a new key himself (NEVER clear pollinations-user.json); donor watch: single 4070 Ti SUPER donor, tier floor 24GB unmet (computeInsufficient true).',
]
section = nl + nl.join(section_lines)
c = c[:ins_at] + section + c[ins_at:]

with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(c)
print('RESUME.md updated')

# ════ docs/NOW.md — prepend deploy-pending banner ════
p2 = 'docs/NOW.md'
with io.open(p2, 'r', encoding='utf-8', newline='') as f:
    c2 = f.read()
nl2 = '\r\n' if '\r\n' in c2[:3000] else '\n'
idx = c2.find('> **Current')
assert idx != -1
banner = ('> **Current — 2026-07-08 — ⚡ DEPLOY STAGED, ONE SHOT: main @ d802843 = TU.28 (donor-pipe backpressure '
          'rectify) + TU.29 (mind\'s eye: thought glyphs in full color). Gee presses Update & SAVESTART solo '
          '(Sponge ~8h out). Success checklist + complete failure-mode recovery (A: button no-op → manual overlay '
          'UAL_KEEP_STATE=1; B: savestart wipe → TU.27-style backup restore + hand-written .resume-marker.json; '
          'C: donor still flapping → TU.28.4 native donor escalation; D: minds-eye cosmetic → never brain-fatal) '
          'all in `server/SPONGE-COPY-PASTE-tu28-tu29-fallback.txt`. Pre-deploy baseline: passed=2, ela=K, math=K, '
          'science/K in-flight. Next brain-side fix after this lands: SPEAK.12 (function-word training depth).**'
          + nl2 + nl2)
c2 = c2[:idx] + banner + c2[idx:]
with io.open(p2, 'w', encoding='utf-8', newline='') as f:
    f.write(c2)
print('NOW.md banner added')

# ════ docs/TODO.md — verbatim task, completed in-line ════
p3 = 'docs/TODO.md'
with io.open(p3, 'r', encoding='utf-8', newline='') as f:
    c3 = f.read()
nl3 = '\r\n' if '\r\n' in c3[:5000] else '\n'
m = '    - `[ ]` **TU.29.4 (follow-up, code):**'
i3 = c3.find(m)
assert i3 != -1
e3 = c3.find(nl3, i3)
entry = (nl3 + '  - `[x]` **[HAND-OFF DOCS (2026-07-08):** Gee verbatim: "go ahe4ad and also write the resume.md, '
         'Now.md and the Sponge copy paste incase this doesnt work" — DONE: docs/RESUME.md §2026-07-08 pickup brief '
         '(deploy state FIRST, TU.28/TU.29/SPEAK.12/cron-rig state), docs/NOW.md deploy-staged banner, '
         'server/SPONGE-COPY-PASTE-tu28-tu29-fallback.txt (success checklist + failure modes A-D with exact '
         'recovery steps incl. the TU.27-style wipe restore).]')
c3 = c3[:e3] + entry + c3[e3:]
with io.open(p3, 'w', encoding='utf-8', newline='') as f:
    f.write(c3)
print('TODO task logged')
