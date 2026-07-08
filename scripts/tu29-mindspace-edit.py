# TU.29 — mindspace gpu.js edit: 5x7 font + color thought-plane + text-mode imagineFromState
import io

p = 'js/brain/mindspace/gpu.js'
with io.open(p, 'r', encoding='utf-8', newline='') as f:
    c = f.read()
nl = '\r\n' if '\r\n' in c[:2000] else '\n'

# ---- Insert font + color helpers + glyph-plane renderer at module scope, before the class ----
anchor = 'export class MindSpaceGPU {'
ai = c.find(anchor)
assert ai != -1, 'class anchor not found'

APOS = chr(39)  # single quote
font_src = r'''
// ── TU.29.1 — thought→glyph plane: a built-in 5x7 bitmap font (pure JS, no deps) so the
// mind's-eye renders WHAT SHE IS THINKING (words / letters / numbers) instead of painting
// the raw state vector as noise. Each glyph is 7 rows of 5 chars ('1' = lit). Visually
// verifiable in-source — correctness by inspection, per the no-tests LAW.
const FONT5X7 = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11100','10010','10001','10001','10001','10010','11100'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00010','00010','00010','00010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','11011','10001'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['01110','10001','00001','00110','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  ',': ['00000','00000','00000','00000','00110','00100','01000'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '-': ['00000','00000','00000','01110','00000','00000','00000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};

// TU.29.1 — full-color palette for color-word detection: when her thought NAMES a color
// ("a solid red sheet", "yellow banana") the plane takes that color — no grayscale-only
// imagination. Detection is a plain word-table lookup on her own emitted words (equational
// input classification, not text-AI cognition).
const COLOR_WORDS = {
  red:     [220, 45, 45],   blue:   [55, 95, 225],   green:  [45, 180, 75],
  yellow:  [235, 210, 55],  orange: [240, 145, 45],  purple: [155, 65, 205],
  pink:    [240, 125, 185], white:  [235, 235, 235], black:  [18, 18, 18],
  brown:   [145, 95, 55],   gray:   [130, 130, 130], grey:   [130, 130, 130],
  cyan:    [65, 205, 225],  magenta:[220, 65, 205],  gold:   [220, 180, 60],
  silver:  [195, 195, 205], violet: [160, 80, 220],  tan:    [205, 175, 130],
};

// TU.29.1 — mood tint: when no color is named, the background hue comes from her live
// affect (valence maps blue→red across the hue wheel, arousal drives saturation) so the
// field is COLORED BY HOW SHE FEELS instead of flat gray.
function moodTint(mood) {
  const val = Math.max(-1, Math.min(1, (mood && typeof mood.valence === 'number') ? mood.valence : 0));
  const aro = Math.max(0, Math.min(1, (mood && typeof mood.arousal === 'number') ? mood.arousal : 0.4));
  const h = (1 - (val + 1) / 2) * 0.66;          // +1 valence → h=0 (red/warm), -1 → h=0.66 (blue/cool)
  const s = 0.35 + 0.5 * aro, v = 1.0;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const pq = v * (1 - s), qq = v * (1 - f * s), tq = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = tq; b = pq; break;
    case 1: r = qq; g = v; b = pq; break;
    case 2: r = pq; g = v; b = tq; break;
    case 3: r = pq; g = qq; b = v; break;
    case 4: r = tq; g = pq; b = v; break;
    default: r = v; g = pq; b = qq; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// TU.29.1 — compose the thought plane in FULL COLOR: background = her live state as a
// texture tinted by the named color (or her mood), foreground = the thought's words
// rasterized bright and centered. Short thoughts render at 2x glyph scale so a single
// word fills the eye. Returns RGBA for equationalizeImageData (whose YCbCr channels
// carry the color through the field-C rec to the viewer). Bounded: side<=96 (engine
// cap), text<=180 chars — no fractalize, no runaway.
function renderThoughtPlane(text, stateVector, W, H, mood) {
  const N = W * H;
  const data = new Uint8ClampedArray(N * 4);
  const txt = String(text || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 180);
  // color-word detection on the thought itself
  let tint = null;
  for (const w of txt.toLowerCase().split(/[^a-z]+/)) {
    if (COLOR_WORDS[w]) { tint = COLOR_WORDS[w]; break; }
  }
  const named = !!tint;
  if (!tint) tint = moodTint(mood);
  // background: state texture modulates the tint. A NAMED color paints strong (a "solid
  // red sheet" reads as a red field); mood tint stays faint so glyphs dominate.
  const lo = named ? 0.30 : 0.06, hi = named ? 0.55 : 0.28;
  if (stateVector && stateVector.length > 0) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < stateVector.length; i++) { const v = stateVector[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const range = (mx - mn) || 1;
    for (let p = 0; p < N; p++) {
      const sv = (stateVector[Math.floor(p * stateVector.length / N)] - mn) / range;
      const k = lo + sv * (hi - lo);
      const o = p * 4;
      data[o] = Math.round(tint[0] * k); data[o + 1] = Math.round(tint[1] * k);
      data[o + 2] = Math.round(tint[2] * k); data[o + 3] = 255;
    }
  } else {
    for (let p = 0; p < N; p++) {
      const o = p * 4;
      data[o] = Math.round(tint[0] * lo); data[o + 1] = Math.round(tint[1] * lo);
      data[o + 2] = Math.round(tint[2] * lo); data[o + 3] = 255;
    }
  }
  if (!txt) return data;
  // glyph color: named color lightened toward white (legible on its own field), else warm white
  const gl = named
    ? [Math.round(tint[0] * 0.4 + 255 * 0.6), Math.round(tint[1] * 0.4 + 255 * 0.6), Math.round(tint[2] * 0.4 + 255 * 0.6)]
    : [238, 236, 228];
  // glyph scale: short thoughts get 2x (chunky-legible), longer get 1x
  const scale = txt.length <= 22 ? 2 : 1;
  const gw = 6 * scale, gh = 8 * scale;             // glyph advance (5+1 gap) x (7+1 gap)
  const cols = Math.max(1, Math.floor((W - 4) / gw));
  const maxRows = Math.max(1, Math.floor((H - 4) / gh));
  // word-wrap
  const lines = [];
  let cur = '';
  for (const word of txt.split(' ')) {
    const cand = cur ? cur + ' ' + word : word;
    if (cand.length <= cols) { cur = cand; continue; }
    if (cur) lines.push(cur);
    cur = word.length > cols ? word.slice(0, cols) : word;
    if (lines.length >= maxRows) break;
  }
  if (cur && lines.length < maxRows) lines.push(cur);
  const used = lines.slice(0, maxRows);
  // centered block
  const y0 = Math.max(2, Math.floor((H - used.length * gh) / 2));
  for (let li = 0; li < used.length; li++) {
    const line = used[li];
    const x0 = Math.max(2, Math.floor((W - line.length * gw) / 2));
    for (let ci = 0; ci < line.length; ci++) {
      const glyph = FONT5X7[line[ci]] || FONT5X7[' '];
      for (let r = 0; r < 7; r++) {
        const rowBits = glyph[r];
        for (let cc = 0; cc < 5; cc++) {
          if (rowBits[cc] !== '1') continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const x = x0 + ci * gw + cc * scale + sx;
              const y = y0 + li * gh + r * scale + sy;
              if (x < 0 || x >= W || y < 0 || y >= H) continue;
              const o = (y * W + x) * 4;
              data[o] = gl[0]; data[o + 1] = gl[1]; data[o + 2] = gl[2]; data[o + 3] = 255;
            }
          }
        }
      }
    }
  }
  return data;
}

'''
# add the apostrophe glyph key programmatically to dodge quoting pitfalls
apos_glyph = "  {q}{a}{q}: ['00100','00100','01000','00000','00000','00000','00000'],".format(q='"', a=APOS)
font_src = font_src.replace("  '-': [", apos_glyph + "\n  '-': [")
font_js = font_src.replace('\n', nl)
c = c[:ai] + font_js.lstrip('\r\n') + nl + c[ai:]

# ---- Rework imagineFromState: text mode + color + side floor ----
old_block = (
    "    const maxSide = Math.max(8, Math.min(opts.maxSide ?? 64, 96));" + nl +
    "    const baseSide = Math.max(8, Math.min(maxSide, Math.floor(Math.sqrt(stateVector.length)) || 8));" + nl +
    "    const side = Math.max(8, Math.round(baseSide * (0.5 + 0.5 * ratio)));" + nl +
    "    const W = side, H = side, N = W * H;" + nl +
    "    // Normalize state → [0,255] grayscale, sampling evenly across the whole vector so the full" + nl +
    "    // mind-state shapes the image (not just its first N values)." + nl +
    "    let mn = Infinity, mx = -Infinity;" + nl +
    "    for (let i = 0; i < stateVector.length; i++) { const v = stateVector[i]; if (v < mn) mn = v; if (v > mx) mx = v; }" + nl +
    "    const range = (mx - mn) || 1;" + nl +
    "    const data = new Uint8ClampedArray(N * 4);" + nl +
    "    for (let p = 0; p < N; p++) {" + nl +
    "      const sv = stateVector[Math.floor(p * stateVector.length / N)];" + nl +
    "      const g = Math.round(((sv - mn) / range) * 255);" + nl +
    "      const o = p * 4; data[o] = g; data[o + 1] = g; data[o + 2] = g; data[o + 3] = 255;" + nl +
    "    }" + nl +
    "    const rec = CPU.equationalizeImageData({ width: W, height: H, data });"
)
assert c.count(old_block) == 1, 'imagine block not unique: %d' % c.count(old_block)
new_src = r'''    const maxSide = Math.max(8, Math.min(opts.maxSide ?? 64, 96));
    // TU.29.1/.2 — TEXT MODE + COLOR: when the caller passes the thought's TEXT, the plane
    // renders the actual words/letters/numbers (glyph raster over a state texture tinted by
    // a named color word or her live mood) instead of painting the raw vector as grayscale
    // noise. Text mode uses the FULL maxSide (a ~300-dim sentence embedding was collapsing
    // baseSide to ~17px) with a hard 48px legibility floor — the governor still ALLOTS the
    // spend (grant above), it just can't shrink the canvas below readable. Vector mode keeps
    // the state-sampled field but floors at 32px and takes the mood tint instead of gray.
    const hasText = typeof opts.text === 'string' && opts.text.trim().length > 0;
    let side;
    if (hasText) {
      side = Math.max(48, Math.round(maxSide * (0.75 + 0.25 * ratio)));
    } else {
      const baseSide = Math.max(8, Math.min(maxSide, Math.floor(Math.sqrt(stateVector.length)) || 8));
      side = Math.max(32, Math.round(baseSide * (0.5 + 0.5 * ratio)));
    }
    side = Math.min(side, maxSide);
    const W = side, H = side;
    const data = renderThoughtPlane(hasText ? opts.text : '', stateVector, W, H, opts.mood);
    const rec = CPU.equationalizeImageData({ width: W, height: H, data });'''
new_block = new_src.replace('\n', nl)
c = c.replace(old_block, new_block)

with io.open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(c)
print('mindspace gpu.js edits applied')
