// T13.7.5 — direct import of the sharedEmbeddings module singleton.
// Pre-fix this file tried `brain._sharedEmbeddings` which never existed,
// so cortexPattern in _generateEventCommentary was always null. After the
// T13.7 deletion of slot-prior fallback in language-cortex.generate, that
// null cortex path made every commentary call return empty string —
// silencing all of Unity's brain event popups.
import { sharedEmbeddings as __sharedEmbeddings } from '../brain/embeddings.js';

/**
 * brain-3d.js — WebGL 3D brain visualizer
 *
 * N neurons (scales to hardware, 20K rendered) as gl.POINTS in MNI-coordinate 3D clusters.
 * Raw WebGL — no Three.js, no deps. Inline vertex/fragment shaders.
 *
 * Features:
 *   - 7 neural clusters positioned like a real brain
 *   - Spike glow (bright) + afterglow fade per neuron
 *   - Pulse ripple effect radiating from spiking neurons
 *   - Inter-cluster connection lines between active neurons
 *   - Floating HTML cluster labels projected from 3D
 *   - Toggle buttons to show/hide each cluster
 *   - Mouse drag rotate, scroll zoom, touch support
 *   - WebGL context loss/restore recovery
 *   - Dark (#050505) gothic/cyberpunk aesthetic
 *   - T5: 22-detector brain event system triggering equational
 *     commentary popups via Unity's own language cortex
 */

import { detectBrainEvents, CLUSTER_KEYS } from './brain-event-detectors.js';

// ── Constants ───────────────────────────────────────────────────────

// Render neuron count — PER-CLUSTER peg at 20K.

// The display ratio pegs at 20K per brain cluster/region so every
// cluster renders its firing activity at comparable visual density.
// The earlier MAX_RENDER_NEURONS was a GLOBAL cap across ALL 15
// clusters/regions, which at biological scale resulted in ~1.3K
// render points per cluster — too sparse. Renamed to
// MAX_RENDER_NEURONS_PER_CLUSTER so every cluster/region renders up
// to 20K points independently. With 15 clusters × 20K = 300K render
// points at peak — still trivial for WebGL (~10 MB vertex buffer).
// Each cluster's n is clamped to min(20K, realClusterSize) so local-
// brain clients with tiny clusters don't over-render their real
// neuron count. TOTAL is the live sum across clusters (no global cap).
let TOTAL = 1000;
const MAX_RENDER_NEURONS_PER_CLUSTER = 20000;
const AFTERGLOW_DECAY = 0.92;
const PULSE_LIFE = 80;  // ~1.3s at 60fps — visible long enough to track
const MAX_PULSES = 500; // 70+ pulses per cluster simultaneously
const MAX_CONN = 3000;
const MAX_TRAILS = 800; // lightning trails traveling along projection pathways
const TRAIL_LIFE = 45;  // frames — fast expand-converge cycle
const AUTO_ROT_SPEED = 0.0015;

// ── Cluster definitions ─────────────────────────────────────────────

// ORIGINAL ORDER preserved (changing order breaks indexing chain)
// Sizes biologically proportioned — cerebellum LARGEST
// Original 7: 200+100+80+80+380+50+110 = 1000

// Language-cortex sub-regions fill the biological gaps BETWEEN the
// existing 7 so the rendered brain looks filled-in instead
// of spotty and holey. Each sub-region maps to a real anatomical
// language area, all LEFT-LATERALIZED to match human left-dominant
// language organization. Sub-region totals: 30+100+90+30+80+50+30+130 = 540
// GRAND TOTAL: 1000 + 540 = 1540.
const CLUSTERS = [
  { key: 'cortex',       label: 'CORTEX',        n: 200, rgb: [1.0, 0.302, 0.604],  hex: '#ff4d9a' },
  { key: 'hippocampus',  label: 'HIPPOCAMPUS',   n: 100, rgb: [0.659, 0.333, 0.969], hex: '#a855f7' },
  { key: 'amygdala',     label: 'AMYGDALA',       n: 80,  rgb: [0.937, 0.267, 0.267], hex: '#ef4444' },
  { key: 'basalGanglia', label: 'BASAL GANGLIA', n: 80,  rgb: [0.133, 0.773, 0.369], hex: '#22c55e' },
  { key: 'cerebellum',   label: 'CEREBELLUM',    n: 380, rgb: [0.0, 0.898, 1.0],     hex: '#00e5ff' },
  { key: 'hypothalamus', label: 'HYPOTHALAMUS',  n: 50,  rgb: [0.961, 0.620, 0.043], hex: '#f59e0b' },
  { key: 'mystery',      label: 'MYSTERY Ψ',     n: 110, rgb: [0.753, 0.518, 0.988], hex: '#c084fc' },
  // Language cortex sub-regions — fill gaps between existing 7
  { key: 'lang_motor',    label: "BROCA'S (SPEECH)",    n: 30,  rgb: [1.00, 0.45, 0.25], hex: '#ff7340' },
  { key: 'lang_phon',     label: "WERNICKE'S (PHON)",   n: 100, rgb: [0.98, 0.58, 0.12], hex: '#fa9520' },
  { key: 'lang_sem',      label: 'ANGULAR (SEMANTIC)',  n: 90,  rgb: [1.00, 0.82, 0.14], hex: '#ffd124' },
  { key: 'lang_letter',   label: 'VWFA (READING)',      n: 30,  rgb: [0.90, 0.30, 0.38], hex: '#e64d61' },
  { key: 'lang_visual',   label: 'V1 (VISUAL INPUT)',   n: 80,  rgb: [0.11, 0.45, 0.85], hex: '#1c72d9' },
  { key: 'lang_auditory', label: "HESCHL'S (AUDITORY)", n: 50,  rgb: [0.94, 0.15, 0.58], hex: '#f02694' },
  { key: 'lang_fineType', label: 'TEMPORAL POLE',       n: 30,  rgb: [0.58, 0.80, 0.45], hex: '#93cc72' },
  { key: 'lang_free',     label: 'PFC (INTEGRATION)',   n: 130, rgb: [0.45, 0.20, 0.76], hex: '#7333c2' },
];

// ── Inline shaders ──────────────────────────────────────────────────

const NEURON_VS = `
attribute vec3 aPos;
attribute vec3 aCol;
attribute float aGlow;
attribute float aVis;
attribute float aLayer;     // cortical layer 0..4 (L1, L2/3, L4, L5, L6)
attribute float aHub;       // 0 or 1 — rich-club hub flag
attribute float aColumnId;  // microcolumn id (float for shader fract math)
uniform mat4 uMVP;
uniform float uScale;
uniform float uShowLayers;     // toggle 0/1 — when on, base color mixes with layer color
uniform float uShowHubs;       // toggle 0/1 — when on, hub neurons render larger + golden
uniform float uShowColumns;    // toggle 0/1 — when on, fragment alpha modulates by column id
uniform vec3  uLayerColor[5];  // L1..L6 palette (5 entries — L2/3 collapsed)
varying vec3  vCol;
varying float vGlow;
varying float vVis;
varying float vHub;
varying float vColumnId;
varying float vShowColumns;
void main() {
  // Layer color blend: mix base color with the assigned layer color when
  // the layer-color toggle is on. Layer index is rounded to int for index
  // into the palette uniform.
  int layerIdx = int(clamp(aLayer + 0.5, 0.0, 4.0));
  vec3 layerC = uLayerColor[0];
  if (layerIdx == 1) layerC = uLayerColor[1];
  else if (layerIdx == 2) layerC = uLayerColor[2];
  else if (layerIdx == 3) layerC = uLayerColor[3];
  else if (layerIdx == 4) layerC = uLayerColor[4];
  vCol = mix(aCol, layerC, uShowLayers * 0.7);
  vGlow = aGlow;
  vVis = aVis;
  vHub = aHub * uShowHubs;
  vColumnId = aColumnId;
  vShowColumns = uShowColumns;
  vec4 p = uMVP * vec4(aPos, 1.0);
  gl_Position = p;
  // Hub bump: rich-club hubs render 1.6× larger when the hub toggle is on.
  float hubBump = 1.0 + vHub * 0.6;
  float sz = mix(8.0, 18.0, aGlow) * hubBump;
  gl_PointSize = max(5.0, sz * uScale / max(p.w, 0.3));
}
`;

const NEURON_FS = `
precision mediump float;
varying vec3 vCol;
varying float vGlow;
varying float vVis;
varying float vHub;
varying float vColumnId;
varying float vShowColumns;
void main() {
  if (vVis < 0.5) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;

  // STRUCTURE: bright solid core + ring + soft halo fading to edge
  // All three are visible on every neuron — the HALO is the key visual element

  // PHOTOSENSITIVITY PASS — desaturate to ~60% of raw vCol and dim
  // overall output by ~25%. The old shader blasted pure saturated
  // pink/cyan/purple at full intensity which reads as "Vegas neon"
  // and can stress photosensitive viewers. Mix toward luma and scale
  // the final alpha down so the composition still reads clearly but
  // doesn't strobe the retina.
  float luma = dot(vCol, vec3(0.299, 0.587, 0.114));
  vec3 baseCol = mix(vec3(luma), vCol, 0.60);

  // Core — bright center dot (0 to 0.18)
  float core = smoothstep(0.18, 0.0, d);

  // Ring — visible colored ring around core (0.22 to 0.32)
  float ring = smoothstep(0.22, 0.26, d) * smoothstep(0.34, 0.28, d);

  // Halo — soft glow fading from ring edge to dot edge (0.32 to 0.5)
  float halo = smoothstep(0.5, 0.32, d);

  // Base brightness scales with glow (spiking = brighter). Reduced
  // from 0.8 to 0.5 so firing neurons pop without blowing out.
  float glowBoost = 1.0 + vGlow * 0.5;

  // Combine: core is brightest, ring is medium, halo is soft.
  // Halo contribution dropped from 0.35 to 0.20 so the ambient wash
  // of color across the field is much calmer.
  float coreAlpha = core * 0.85 * glowBoost;
  float ringAlpha = ring * 0.65 * glowBoost;
  float haloAlpha = halo * 0.20 * glowBoost;

  float alpha = max(coreAlpha, max(ringAlpha, haloAlpha));

  // Color: white hot core (softened from 0.6+0.4 to 0.45+0.3),
  // colored ring, softer colored halo — all using desaturated baseCol.
  vec3 coreCol = mix(baseCol, vec3(1.0), 0.45 + vGlow * 0.3);
  vec3 ringCol = baseCol * (1.0 + vGlow * 0.35);
  vec3 haloCol = baseCol * (0.60 + vGlow * 0.35);

  vec3 col;
  if (core > 0.01) col = coreCol;
  else if (ring > 0.01) col = ringCol;
  else col = haloCol;

  // Hub highlight — when the hub toggle is on AND this neuron is a hub,
  // tint toward gold. vHub already gates by uShowHubs in the vertex
  // shader, so non-hub fragments and toggle-off frames see vHub == 0
  // and this is a no-op.
  if (vHub > 0.5) {
    vec3 gold = vec3(1.0, 0.78, 0.27);
    col = mix(col, gold, 0.55);
  }

  // Microcolumn boundary visualization — when the column toggle is on,
  // map column id into a hue-stride pattern via fract() and apply a
  // subtle brightness pulse so column boundaries become visible as
  // alternating-column intensity bands. Uses fract(columnId * 0.5) to
  // alternate every column; multiplied by 0.15 amplitude so individual
  // neurons stay readable.
  if (vShowColumns > 0.5) {
    float bandPhase = fract(vColumnId * 0.5);
    float band = 0.85 + 0.30 * step(0.5, bandPhase);
    col *= band;
  }

  gl_FragColor = vec4(col, alpha);
}
`;

const LINE_VS = `
attribute vec3 aPos;
attribute vec4 aCol;
uniform mat4 uMVP;
varying vec4 vCol;
void main() {
  vCol = aCol;
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const LINE_FS = `
precision mediump float;
varying vec4 vCol;
void main() {
  gl_FragColor = vCol;
}
`;

const PULSE_VS = `
attribute vec3 aPos;
attribute float aLife;
attribute vec3 aCol;
uniform mat4 uMVP;
uniform float uScale;
varying float vLife;
varying vec3 vCol;
void main() {
  vLife = aLife;
  vCol = aCol;
  vec4 p = uMVP * vec4(aPos, 1.0);
  gl_Position = p;
  gl_PointSize = (8.0 + aLife * 22.0) * uScale / max(p.w, 0.5);
}
`;

const PULSE_FS = `
precision mediump float;
varying float vLife;
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  // Activation aura ring — thin line-like band, not a big wash.
  // Gee flagged the old (0.28-0.5 width = 0.22) ring as too thick
  // and too similar to the fractal activation pattern underneath.
  // Tightened to (0.39-0.47 width = 0.08) so it reads as a distinct
  // line hovering just outside the neuron's own aura. Core
  // contribution dropped from 0.2 to 0.04 so the interior stays
  // almost empty, which is what makes the outline feel like a ring
  // rather than a filled disc.
  float ring = smoothstep(0.39, 0.42, d) * smoothstep(0.47, 0.44, d);
  float core = smoothstep(0.5, 0.0, d) * 0.04;
  // Ring intensity dropped from 1.4 to 1.0 so it doesn't strobe.
  float alpha = (ring * 1.0 + core) * vLife;
  // Desaturate the ring color toward luma by 40% and drop the
  // white-pop additive from 0.3 to 0.12 for photosensitivity.
  float luma = dot(vCol, vec3(0.299, 0.587, 0.114));
  vec3 baseCol = mix(vec3(luma), vCol, 0.60);
  vec3 col = baseCol + vec3(0.12) * ring;
  gl_FragColor = vec4(col, alpha);
}
`;

// ── LIGHTNING TRAILS — travel along projection pathways driven by brain equations ──
// Each trail has source, target, and a phase 0→1.
// Phase < 0.5: head EXPANDS from source toward midpoint (expand phase)
// Phase >= 0.5: tail CONVERGES to target (converge phase)
// Both ends fade to nothing — trail appears, travels, disappears.
const TRAIL_VS = `
attribute vec3 aPos;        // can be source or target — which is chosen by aEnd
attribute vec3 aSource;
attribute vec3 aTarget;
attribute float aPhase;     // 0-1, position along path
attribute float aEndFlag;   // 0 = head, 1 = tail
attribute float aLife;      // 0-1 remaining life
attribute vec3 aCol;
uniform mat4 uMVP;
uniform float uScale;
varying float vLife;
varying vec3 vCol;
void main() {
  vCol = aCol;
  vLife = aLife;
  // Compute position from phase
  // Head position = mix(source, target, phase+head_offset)
  // Tail position = mix(source, target, phase-tail_offset)
  float t = clamp(aPhase + (aEndFlag > 0.5 ? -0.15 : 0.0), 0.0, 1.0);
  vec3 pos = mix(aSource, aTarget, t);
  vec4 p = uMVP * vec4(pos, 1.0);
  gl_Position = p;
}
`;

const TRAIL_FS = `
precision mediump float;
varying float vLife;
varying vec3 vCol;
void main() {
  // Bright lightning bolt — white hot core + colored tail
  vec3 col = mix(vec3(1.0), vCol, 0.5);
  gl_FragColor = vec4(col, vLife);
}
`;

// ── Math utilities ──────────────────────────────────────────────────

function m4Ident() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

function m4Persp(fov, asp, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([
    f/asp, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far+near)*nf, -1,
    0, 0, 2*far*near*nf, 0,
  ]);
}

function m4Mul(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      o[j*4+i] = a[i]*b[j*4] + a[4+i]*b[j*4+1] + a[8+i]*b[j*4+2] + a[12+i]*b[j*4+3];
  return o;
}

function m4RotX(m, a) {
  const c = Math.cos(a), s = Math.sin(a), r = m4Ident();
  r[5]=c; r[6]=s; r[9]=-s; r[10]=c;
  return m4Mul(m, r);
}

function m4RotY(m, a) {
  const c = Math.cos(a), s = Math.sin(a), r = m4Ident();
  r[0]=c; r[2]=-s; r[8]=s; r[10]=c;
  return m4Mul(m, r);
}

function m4Trans(m, x, y, z) {
  const r = m4Ident();
  r[12]=x; r[13]=y; r[14]=z;
  return m4Mul(m, r);
}

function m4Project(m, v) {
  return [
    m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3],
    m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
    m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3],
    m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3],
  ];
}

/** Box-Muller gaussian */
function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Anatomical position generators ──────────────────────────────────
// MNI-coordinate-based positions scaled to render space.
// Real brain: X = lateral (±90mm), Y = anterior-posterior (±126mm), Z = superior-inferior (±72mm)
// Render space: normalized to ~±2 units. Scale factor: 1 unit ≈ 45mm.

// Sources: Lead-DBS atlas, ICBM 152, Herculano-Houzel 2009, PMC stereological studies
// Each returns an array of [x,y,z] for every neuron in that cluster.

function genCortex(n) {
  // CEREBRAL CORTEX — bilateral hemispheres, outer shell of the brain
  // MNI: surface spans ±90mm lateral, -126 to +90mm A-P, -72 to +72mm S-I
  // 16 billion neurons. Two hemispheres separated by longitudinal fissure.
  // Folded surface (gyri/sulci) — use hemisphere shell with sulcal variation
  const pts = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const side = i < half ? -1 : 1;
    // Hemisphere shell — upper dome with folding noise
    const theta = Math.acos(1 - Math.random() * 1.3);
    const phi = Math.random() * Math.PI * 2;
    const r = 1.1 + gauss() * 0.1; // cortical thickness variation — tighter shell
    const x = r * Math.sin(theta) * Math.cos(phi);
    const sulcalFold = Math.sin(phi * 5) * 0.03 + Math.sin(theta * 7) * 0.02; // gyri/sulci texture
    pts.push([
      side * (Math.abs(x) * 0.45 + 0.12),           // hemispheric split at midline
      r * Math.cos(theta) * 0.55 + 0.35 + sulcalFold, // dorsal dome
      r * Math.sin(theta) * Math.sin(phi) * 0.75,     // anterior-posterior spread
    ]);
  }
  return pts;
}

function genHippocampus(n) {
  // HIPPOCAMPUS — medial temporal lobe, POSTERIOR to amygdala
  // MNI: approximately (-20, -26, -10) to (-30, -10, -20) bilateral
  // Curved seahorse shape (CA1-CA4 + dentate gyrus). 90% pyramidal cells.
  // Each pyramidal cell receives ~30,000 excitatory inputs (most connected structure)
  const pts = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const side = i < half ? -1 : 1;
    // Seahorse curve — C-shaped along anterior-posterior axis
    const t = ((i % half) / half) * Math.PI * 1.8;
    const r = 0.1 + Math.random() * 0.07;
    pts.push([
      side * (0.3 + Math.cos(t) * 0.12) + gauss() * r * 0.2,   // medial temporal
      -0.2 + Math.sin(t * 0.5) * 0.15 + gauss() * r * 0.2,     // below cortex center
      -0.1 + Math.sin(t) * 0.22 + gauss() * r * 0.25,           // POSTERIOR — behind amygdala
    ]);
  }
  return pts;
}

function genAmygdala(n) {
  // AMYGDALA — medial temporal lobe, ANTERIOR to hippocampus
  // MNI: (-27, -4, -20) bilateral. Almond-shaped. 12.21 million neurons.
  // 13 nuclei: lateral (4M), basal (3.24M), accessory basal (1.28M), central (0.36M)
  // Major outputs: stria terminalis, ventral amygdalofugal pathway
  const pts = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const side = i < half ? -1 : 1;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    // Almond shape — elongated along one axis
    const r = 0.12 * Math.cbrt(Math.random());
    pts.push([
      side * 0.38 + r * 0.4 * Math.sin(phi) * Math.cos(theta),  // medial temporal
      -0.3 + r * 0.3 * Math.cos(phi),                             // inferior to BG
      0.4 + r * 0.35 * Math.sin(phi) * Math.sin(theta),           // ANTERIOR — in front of hippo
    ]);
  }
  return pts;
}

function genBasalGanglia(n) {
  // BASAL GANGLIA — deep nuclei BILATERAL (caudate + putamen + globus pallidus)
  // MNI: caudate head ~(±12, 12, 10), putamen ~(±28, 4, 2), GP ~(±18, 0, 0)
  // 90-95% medium spiny projection neurons (GABAergic)
  // Receives STRONGEST projection in brain (corticostriatal)
  const pts = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const side = i < half ? -1 : 1;
    // Three nuclei merged: caudate (elongated), putamen (lateral), GP (medial)
    const subtype = Math.random();
    let x, y, z;
    if (subtype < 0.4) {
      // Caudate — C-shaped, dorsomedial
      const t = Math.random() * Math.PI;
      x = side * (0.15 + Math.cos(t) * 0.06) + gauss() * 0.03;
      y = 0.03 + Math.sin(t) * 0.12 + gauss() * 0.03;
      z = 0.1 + t * 0.08 + gauss() * 0.03;
    } else if (subtype < 0.75) {
      // Putamen — lateral lens-shaped
      const r = 0.1 * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      x = side * (0.38 + r * Math.cos(theta) * 0.4) + gauss() * 0.02;
      y = -0.04 + r * Math.sin(theta) * 0.3 + gauss() * 0.02;
      z = 0.08 + gauss() * 0.06;
    } else {
      // Globus pallidus — medial, compact
      const r = 0.07 * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      x = side * 0.22 + r * Math.cos(theta) * 0.25 + gauss() * 0.02;
      y = -0.04 + r * Math.sin(theta) * 0.25 + gauss() * 0.02;
      z = 0.04 + gauss() * 0.04;
    }
    pts.push([x, y, z]);
  }
  return pts;
}

function genCerebellum(n) {
  // CEREBELLUM — posterior-inferior, behind and below cortex
  // ~69 billion neurons (80% of brain), 50B granule cells
  // MNI: center ~(0, -60, -35). Bilateral with vermis at midline.
  // Folia (leaf-like folds) create layered parallel structure
  const pts = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const side = i < half ? -1 : 1;
    // Foliated structure — layered sheets with slight separation
    const layer = Math.floor(Math.random() * 5); // 5 folia layers
    const layerOffset = layer * 0.06;
    const r = 0.2 + Math.random() * 0.35;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    // Folia texture — wavy layers
    const foliaWave = Math.sin(theta * 4 + layer) * 0.02;
    pts.push([
      side * (0.12 + Math.abs(r * Math.sin(phi) * Math.cos(theta)) * 0.55), // bilateral spread
      -0.5 - Math.abs(r * Math.cos(phi)) * 0.4 + foliaWave,                 // inferior to cortex
      -0.3 - layerOffset - Math.abs(r * Math.sin(phi) * Math.sin(theta)) * 0.28, // POSTERIOR
    ]);
  }
  return pts;
}

function genHypothalamus(n) {
  // HYPOTHALAMUS — ventral diencephalon, midline, above pituitary
  // MNI: approximately (0, -2, -12). 11 nuclei. ~few million neurons.
  // BELOW basal ganglia, ABOVE brainstem. Small but critical.
  // Controls homeostasis, hormones, autonomic nervous system.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = 0.08 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pts.push([
      r * Math.sin(phi) * Math.cos(theta) * 0.5 + gauss() * 0.02,  // tight to midline
      -0.38 + r * Math.cos(phi) * 0.25,                              // below BG, above cerebellum
      0.18 + r * Math.sin(phi) * Math.sin(theta) * 0.25,             // slightly anterior
    ]);
  }
  return pts;
}

function genMystery(n) {
  // Ψ CONSCIOUSNESS — corpus callosum + cingulate cortex.

  // Fully contained INSIDE the cortex dome (which extends roughly Z=-0.7 to +0.7).
  // Callosum length 0.55, centered slightly back at Z=-0.05 → range -0.325 to +0.225
  // Cingulate length 0.5, centered at Z=-0.05 → range -0.30 to +0.20
  // Pushed ~1/5 back of center so the genu doesn't poke out the front.

  // t is normalized 0-1 (NOT 0-π) for proper length control.
  // Shape is determined by sin(t*π) for the arch curve.
  const pts = [];
  const callosum = Math.floor(n * 0.6);
  const cingulate = n - callosum;

  // Corpus callosum — flattened C: genu (front) → body → splenium (back)
  const cbLength = 0.55;     // front-to-back span
  const cbCenter = -0.05;    // center slightly back of brain center
  const cbBackShift = cbLength / 5; // 1/5 back push = 0.11
  for (let i = 0; i < callosum; i++) {
    const tNorm = i / callosum;            // 0 to 1
    const t = tNorm * Math.PI;             // 0 to π for sin arch
    // Z: linear from back to front, shifted back by 1/5
    const z = cbCenter - cbLength / 2 + tNorm * cbLength - cbBackShift;
    pts.push([
      gauss() * 0.03,                                 // tight to midline
      0.2 + Math.sin(t) * 0.22 + gauss() * 0.02,     // arched above BG (Y)
      z + gauss() * 0.03,
    ]);
  }

  // Cingulate cortex — curved band above corpus callosum
  const cgLength = 0.5;
  const cgCenter = -0.05;
  const cgBackShift = cgLength / 5; // 1/5 back push = 0.1
  for (let i = 0; i < cingulate; i++) {
    const tNorm = i / cingulate;
    const t = tNorm * Math.PI;
    const r = 0.1 * Math.cbrt(Math.random());
    const z = cgCenter - cgLength / 2 + tNorm * cgLength - cgBackShift;
    pts.push([
      gauss() * 0.05,
      0.45 + Math.sin(t) * 0.25 + r * Math.random() * 0.08,
      z + gauss() * 0.04,
    ]);
  }
  return pts;
}

// ── Language cortex sub-region generators ──────────────────────────
// All LEFT-LATERALIZED (x < 0) to match human left-dominant language
// organization. Coordinates fill gaps between existing 7 regions so
// the brain shape reads as continuous instead of spotty/holey.

function genLangMotor(n) {
  // BROCA'S AREA — speech motor production.
  // MNI: (-52, 20, 15) approx. Inferior frontal gyrus (pars opercularis
  // + pars triangularis). Between cortex frontal pole and premotor.
  // Fills the left anterior-superior gap.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = 0.06 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pts.push([
      -0.38 + r * Math.sin(phi) * Math.cos(theta) * 0.8 + gauss() * 0.02,
       0.38 + r * Math.cos(phi) * 0.6 + gauss() * 0.03,
       0.33 + r * Math.sin(phi) * Math.sin(theta) * 0.7 + gauss() * 0.02,
    ]);
  }
  return pts;
}

function genLangPhon(n) {
  // WERNICKE'S AREA + superior temporal gyrus — phonological comprehension.
  // MNI: (-55, -45, 15) approx. Posterior temporal, runs along
  // superior temporal sulcus. Fills the left temporal gap between
  // hippocampus/amygdala and cortex lateral shell.
  const pts = [];
  for (let i = 0; i < n; i++) {
    // Elongated along superior temporal sulcus (a-p axis ≈ z)
    const t = Math.random();
    const r = 0.07 * Math.cbrt(Math.random());
    pts.push([
      -0.44 + r * Math.cos(t * Math.PI * 2) * 0.6 + gauss() * 0.03,
       0.0  + r * Math.sin(t * Math.PI * 2) * 0.5 + gauss() * 0.04,
       0.22 - t * 0.22 + gauss() * 0.03,  // sweeps z from +0.22 to 0.0
    ]);
  }
  return pts;
}

function genLangSem(n) {
  // ANGULAR GYRUS + supramarginal — semantic binding hub.
  // MNI: (-45, -60, 30) approx. Inferior parietal lobule. Fills the
  // gap between cortex, hippocampus and cerebellum superior.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = 0.08 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    pts.push([
      -0.32 + r * Math.cos(theta) * 0.9 + gauss() * 0.03,
       0.05 + r * Math.sin(theta) * 0.7 + gauss() * 0.04,
      -0.05 + gauss() * 0.04,  // centered at z≈0, fills center-left gap
    ]);
  }
  return pts;
}

function genLangLetter(n) {
  // VWFA (visual word form area) — fusiform gyrus.
  // MNI: (-45, -55, -15). Ventral temporal, between cortex base and
  // cerebellum top. Key reading-specific region.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = 0.05 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    pts.push([
      -0.32 + r * Math.cos(theta) * 0.8 + gauss() * 0.02,
      -0.4  + r * Math.sin(theta) * 0.4 + gauss() * 0.03,
      -0.08 + gauss() * 0.05,
    ]);
  }
  return pts;
}

function genLangVisual(n) {
  // PRIMARY VISUAL CORTEX (V1) — calcarine sulcus, occipital pole.
  // MNI: (±8, -90, 0). Midline-posterior. Bilateral but slightly
  // left-leaning to match downstream language dominance. Fills the
  // gap between posterior cortex and cerebellum superior.
  const pts = [];
  const half = Math.floor(n * 0.7); // left-leaning bias
  for (let i = 0; i < n; i++) {
    const side = i < half ? -1 : 1;
    const r = 0.1 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pts.push([
      side * (0.05 + r * Math.abs(Math.sin(phi) * Math.cos(theta)) * 0.5),
      -0.2 + r * Math.cos(phi) * 0.5 + gauss() * 0.03,
      -0.3 + r * Math.sin(phi) * Math.sin(theta) * 0.4 + gauss() * 0.03,
    ]);
  }
  return pts;
}

function genLangAuditory(n) {
  // HESCHL'S GYRUS — primary auditory cortex (A1).
  // MNI: (-50, -20, 10). Superior temporal plane. Left-lateralized
  // for language. Fills the gap between lateral cortex and hippocampus.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = Math.random();
    const r = 0.04 * Math.cbrt(Math.random());
    pts.push([
      -0.40 + r * Math.cos(t * Math.PI * 2) * 0.6 + gauss() * 0.02,
       0.10 + r * Math.sin(t * Math.PI * 2) * 0.5 + gauss() * 0.03,
       0.25 - t * 0.12 + gauss() * 0.02,
    ]);
  }
  return pts;
}

function genLangFineType(n) {
  // TEMPORAL POLE — anterior temporal, fine-grained semantic categories.
  // MNI: (-40, 15, -30). Very anterior temporal. Fills the gap
  // between amygdala and cortex frontal-temporal boundary.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = 0.06 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pts.push([
      -0.36 + r * Math.sin(phi) * Math.cos(theta) * 0.7 + gauss() * 0.02,
      -0.03 + r * Math.cos(phi) * 0.5 + gauss() * 0.03,
       0.42 + r * Math.sin(phi) * Math.sin(theta) * 0.5 + gauss() * 0.02,
    ]);
  }
  return pts;
}

function genLangFree(n) {
  // DORSOLATERAL PREFRONTAL CORTEX + medial PFC — integration/binding.
  // MNI: (-40, 40, 30) dlPFC, (0, 50, 0) mPFC. Working memory and
  // cross-region binding. Fills the gap above mystery (corpus callosum)
  // and between cortex frontal dome regions.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const side = Math.random() < 0.7 ? -1 : 1; // left-leaning
    const r = 0.1 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pts.push([
      side * (0.15 + r * Math.abs(Math.sin(phi) * Math.cos(theta)) * 0.7) + gauss() * 0.03,
       0.45 + r * Math.cos(phi) * 0.4 + gauss() * 0.04,
       0.10 + r * Math.sin(phi) * Math.sin(theta) * 0.5 + gauss() * 0.04,
    ]);
  }
  return pts;
}

// Order matches CLUSTERS array
const POS_GEN = [
  genCortex, genHippocampus, genAmygdala, genBasalGanglia,
  genCerebellum, genHypothalamus, genMystery,
  genLangMotor, genLangPhon, genLangSem, genLangLetter,
  genLangVisual, genLangAuditory, genLangFineType, genLangFree,
];

// ── Brain3D class ───────────────────────────────────────────────────

export class Brain3D {

  constructor(containerId) {
    this._containerId = containerId;
    this._open = false;
    this._destroyed = false;

    // Camera state
    this._rotX = -0.25;
    this._rotY = 0;
    this._zoom = 3.5;
    this._dragging = false;
    this._lastMouse = [0, 0];

    // Per-neuron state
    this._glow = new Float32Array(TOTAL);
    this._vis = new Float32Array(TOTAL).fill(1);
    this._clusterOn = CLUSTERS.map(() => true);

    // RULKOV MAP viz mirror — same neural rule the server runs on GPU.
    // Each viz point has its own (x, y) Rulkov state iterated every frame:
    //   x_{n+1} = α / (1 + x_n²) + y_n
    //   y_{n+1} = y_n − μ(x_n − σ)
    // where σ is driven by the real biological firing rate from the
    // server (spikeCount / engineSize, amplified for visibility).
    // Seeded via golden-ratio quasi-random in the bursting basin.
    // See Rulkov 2002, Phys. Rev. E 65, 041922.
    this._rulkovX = new Float32Array(TOTAL);
    this._rulkovY = new Float32Array(TOTAL);
    {
      const phi = 0.61803398875;
      for (let i = 0; i < TOTAL; i++) {
        const gx = (i * phi) % 1;
        const gy = (i * phi * 1.7) % 1;
        this._rulkovX[i] = -1.0 + gx * 0.5;     // (-1.0, -0.5)
        this._rulkovY[i] = -3.2 + gy * 0.4;     // (-3.2, -2.8)
      }
    }

    // Pulses & connections
    this._pulses = [];
    this._connPos = new Float32Array(MAX_CONN * 6);
    this._connCol = new Float32Array(MAX_CONN * 8);
    this._connN = 0;

    // Lightning trails — travel along projection pathways
    // Each trail: { src:[x,y,z], tgt:[x,y,z], col:[r,g,b], phase:0, life:1 }
    this._trails = [];
    // Per-trail buffers (2 vertices per trail: head + tail)
    this._trailSrc = new Float32Array(MAX_TRAILS * 6);   // 2 verts × 3 = 6
    this._trailTgt = new Float32Array(MAX_TRAILS * 6);
    this._trailPhase = new Float32Array(MAX_TRAILS * 2); // 2 verts per trail
    this._trailEnd = new Float32Array(MAX_TRAILS * 2);   // 0 = head, 1 = tail
    this._trailLife = new Float32Array(MAX_TRAILS * 2);
    this._trailCol = new Float32Array(MAX_TRAILS * 6);
    // Initialize aEnd flags (head=0, tail=1) — never changes
    for (let i = 0; i < MAX_TRAILS; i++) {
      this._trailEnd[i * 2] = 0;     // head
      this._trailEnd[i * 2 + 1] = 1; // tail
    }

    // Pop-up notifications — floating process labels
    this._notifications = [];  // { text, x, y, z, age, maxAge, color }
    this._notifEls = [];       // DOM elements for notifications
    this._lastNotifTime = 0;
    this._lastState = null;

    // T5 2026-04-13 — brain event detector state
    // Rolling history buffer for the detectors to compare deltas
    // across ~30 state snapshots (roughly the last 3 seconds at
    // 10Hz state broadcast rate)
    this._stateHistory = [];
    this._maxHistory = 30;
    // Dedup tracker so the same event doesn't fire every tick while
    // its condition stays true (e.g. sustained low coherence)
    this._recentEventTypes = new Map();  // type → lastFireTime ms
    this._eventCooldownMs = 8000;  // don't repeat the same event type within 8s
    // Brain reference set by setBrain() from app.js bootUnity.
    // Null until boot, during which time the event system degrades
    // gracefully to the plain numeric-label notifications without
    // commentary.
    this._brain = null;
    // Seed word → GloVe 50d vector cache, populated lazily once
    // sharedEmbeddings is available via this._brain
    this._seedVectorCache = new Map();

    // Brain expansion — clusters spread as activity increases
    this._expansionFactor = 1.0;  // 1.0 = default, grows with activity
    this._basePos = null;          // original positions before expansion

    // GL resources (set in _initGL)
    this._gl = null;
    this._canvas = null;
    this._animId = null;

    // T14.22.2 — loud error logging so init failures surface in the
    // browser console without the operator having to hunt through
    // console.warn buffers. Gee reported "3D brain completely missing
    // from view" and we needed visibility on exactly which init stage
    // died. Every failure path now prints console.error AND exposes
    // the Brain3D instance on window so devtools can inspect state.
    // Each failure path stashes `_initError` so the on-page banner in
    // app.js can surface the specific reason without DevTools.
    try {
      this._buildDOM();
    } catch (err) {
      console.error('[Brain3D] _buildDOM threw:', err, err.stack);
      this._initError = `_buildDOM threw: ${err?.message || err}`;
      this._destroyed = true;
      return;
    }
    if (!this._canvas) {
      const msg = `Canvas not created — container "${containerId}" ${document.getElementById(containerId) ? 'found' : 'NOT FOUND in DOM'}`;
      console.error('[Brain3D] ' + msg);
      this._initError = msg;
      this._destroyed = true;
      return;
    }
    try {
      this._genPositions();
    } catch (err) {
      console.error('[Brain3D] _genPositions threw:', err, err.stack);
      this._initError = `_genPositions threw: ${err?.message || err}`;
      this._destroyed = true;
      return;
    }
    try {
      this._initGL();
      if (!this._gl) {
        const msg = 'WebGL context creation failed — browser may not support WebGL, or context was lost';
        console.error('[Brain3D] ' + msg);
        this._initError = msg;
        this._destroyed = true;
        return;
      }
      this._uploadStatic();
      console.log('[Brain3D] init complete — container:', containerId, 'canvas:', this._canvas.width + 'x' + this._canvas.height, 'gl:', !!this._gl);
    } catch (err) {
      console.error('[Brain3D] _initGL or _uploadStatic threw:', err, err.stack);
      this._initError = `_initGL/_uploadStatic threw: ${err?.message || err}`;
      this._destroyed = true;
    }
    // Expose on window for devtools inspection
    if (typeof window !== 'undefined') {
      window.__brain3dInstances = window.__brain3dInstances || [];
      window.__brain3dInstances.push(this);
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  updateState(state) {
    if (!state || !this._open || this._destroyed) return;
    this._lastState = state;

    // Scale render count from ACTUAL brain cluster sizes. Works for
    // both deployment modes: server-connected (RemoteBrain,
    // state.totalNeurons reflects the ~393M Node/GPU build) and
    // GitHub-Pages-static local brain (UnityBrain, totalNeurons
    // reflects the client-side auto-scaled count from detectResources()).
    // Re-scale if the actual-neuron count changes (server restart
    // with new scale, or local brain resized on tab wake).
    const realNeurons = state.totalNeurons || 1000;
    if (realNeurons > 1000 && this._lastRealNeurons !== realNeurons) {
      this._lastRealNeurons = realNeurons;
      this._scaled = true;

      // T18.7.a — per-cluster peg at MAX_RENDER_NEURONS_PER_CLUSTER.
      // Gee verbatim 2026-04-18: "it should already peg at 20K per
      // brain cluster(regionS)". Every cluster/region independently
      // renders up to 20K points (clamped to real cluster size so
      // local-brain clients with tiny clusters don't over-render).
      // No global TOTAL cap anymore — sum over clusters is the live
      // TOTAL. At biological scale every cluster pegs at 20K and
      // TOTAL = 15 clusters × 20K = 300K render neurons.
      if (state.clusters) {
        const serverClusters = state.clusters;
        const MIN_PER_CLUSTER = 30;
        for (let i = 0; i < CLUSTERS.length; i++) {
          const cl = CLUSTERS[i];
          const realClusterSize = serverClusters[cl.key]?.size || 0;
          if (realClusterSize <= 0) {
            // First tick before the server has populated cluster sizes.
            // Keep at least MIN_PER_CLUSTER so rendering stays visible
            // until real sizes land.
            cl.n = MIN_PER_CLUSTER;
            continue;
          }
          cl.n = Math.min(MAX_RENDER_NEURONS_PER_CLUSTER, Math.max(MIN_PER_CLUSTER, realClusterSize));
        }
        TOTAL = CLUSTERS.reduce((s, c) => s + c.n, 0);
        console.log(`[Brain3D] Per-cluster peg @ ${MAX_RENDER_NEURONS_PER_CLUSTER}: ${CLUSTERS.map(c => `${c.key}=${c.n}`).join(', ')} = TOTAL ${TOTAL.toLocaleString()}`);
      } else {
        // No cluster data — flat peg at MAX_RENDER_NEURONS_PER_CLUSTER.
        for (const c of CLUSTERS) c.n = MAX_RENDER_NEURONS_PER_CLUSTER;
        TOTAL = CLUSTERS.reduce((s, c) => s + c.n, 0);
      }
      // Rebuild neuron positions and GL buffers
      this._glow = new Float32Array(TOTAL);
      this._vis = new Float32Array(TOTAL).fill(1);
      // T18.7.a — resize Rulkov oscillator state on scale change. Prior
      // code left `_rulkovX`/`_rulkovY` sized to the initial TOTAL=1000
      // from the constructor, so every render neuron past index 1000
      // was reading undefined from the Rulkov buffers (triggering the
      // reseed path in the render loop every frame and never persisting
      // its trajectory — bursting regime never emerged). With per-cluster
      // peg at 20K × 15 clusters = up to 300K render neurons, resizing
      // here becomes load-bearing.
      this._rulkovX = new Float32Array(TOTAL);
      this._rulkovY = new Float32Array(TOTAL);
      {
        const phi = 0.61803398875;
        for (let i = 0; i < TOTAL; i++) {
          const gx = (i * phi) % 1;
          const gy = (i * phi * 1.7) % 1;
          this._rulkovX[i] = -1.0 + gx * 0.5;
          this._rulkovY[i] = -3.2 + gy * 0.4;
        }
      }
      this._genPositions();
      if (this._gl) this._uploadStatic();
      console.log(`[Brain3D] Scaled to ${TOTAL} render neurons (real brain has ${realNeurons.toLocaleString()})`);
      // Update scale displays
      const ratio = Math.round(realNeurons / TOTAL);
      // Short-form number formatter for the concise landing subtitle.
      // 20000 → "20k", 677798880 → "678M", 1200000000 → "1.2B".
      const shortNum = (n) => {
        if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
        return String(n);
      };
      const shortRatio = ratio >= 1e6 ? `1:${(ratio / 1e6).toFixed(1)}M`
                       : ratio >= 1e3 ? `1:${(ratio / 1e3).toFixed(0)}k`
                       : `1:${ratio}`;
      const scaleInfo = this._overlay?.querySelector('.b3d-scale-info');
      if (scaleInfo) scaleInfo.textContent = `${TOTAL.toLocaleString()} rendered · ${realNeurons.toLocaleString()} actual (${ratio}:1) · ${CLUSTERS.length} clusters`;
      const actualEl = this._overlay?.querySelector('.b3d-actual-count');
      if (actualEl) actualEl.textContent = realNeurons.toLocaleString();
      const ratioEl = this._overlay?.querySelector('.b3d-render-ratio');
      if (ratioEl) ratioEl.textContent = `showing 1:${ratio} (${TOTAL.toLocaleString()} of ${realNeurons.toLocaleString()})`;
      // T-landing — propagate counts into the landing-page subtitle so
      // users see the render:real ratio auto-inserted into the headline
      // copy. Rendered count is driven by TOTAL (which itself scales
      // from system specs / GPUconfigure resource tier); actual count
      // comes from the server stats. Both flow through the same
      // calculation; this just surfaces them into the subtitle spans.
      const lsRendered = typeof document !== 'undefined' && document.getElementById('ls-rendered-count');
      if (lsRendered) lsRendered.textContent = shortNum(TOTAL);
      const lsActual = typeof document !== 'undefined' && document.getElementById('ls-actual-count');
      if (lsActual) lsActual.textContent = shortNum(realNeurons);
      const lsRatio = typeof document !== 'undefined' && document.getElementById('ls-render-ratio');
      if (lsRatio) lsRatio.textContent = shortRatio;
    }

    // R9 — per-cluster spike readout.

    // Was: read the flat `state.spikes` bitmask using the VIZ's CLUSTERS
    // array sizes as the offset layout. BUG: the viz uses biologically
    // weighted proportions (cortex=200, cerebellum=380, mystery=110)
    // while the engine uses equal-ish proportions (cortex=300, cereb=100,
    // mystery=50). Mismatch meant every cluster after cortex read the
    // wrong neurons — cerebellum especially, whose viz range [460-839]
    // actually covered amyg+BG+cerebellum+hypo in engine space. That's
    // why cerebellum activation circles never landed on cerebellum
    // positions.

    // Now: iterate clusters and read each cluster's own `state.clusters[
    // name].spikes` bitmask. Each bitmask has length equal to the REAL
    // cluster size from engine (e.g. cerebellum = 100), independent of
    // how many viz positions we allocate for rendering. If the viz has
    // more points than spike bits, we cycle the bitmask (first
    // bitmask-length points get direct readout, remaining points sample
    // from the bitmask proportionally). If the viz has fewer points,
    // we just read the first N bits.
    const clusterStates = state.clusters || {};

    // Glow update + pulses distributed EQUALLY across ALL clusters
    const pulsesPerCluster = Math.floor(MAX_PULSES / CLUSTERS.length);
    const clusterPulseCount = new Array(CLUSTERS.length).fill(0);

    // Count real spikes per cluster from per-cluster bitmasks
    const clusterSpikeCount = new Array(CLUSTERS.length).fill(0);
    for (let ci = 0; ci < CLUSTERS.length; ci++) {
      const cs = clusterStates[CLUSTERS[ci].key];
      if (cs) {
        // Prefer spikeCount field if provided; otherwise count the bitmask
        if (typeof cs.spikeCount === 'number') {
          clusterSpikeCount[ci] = cs.spikeCount;
        } else if (cs.spikes) {
          let c = 0;
          for (let i = 0; i < cs.spikes.length; i++) if (cs.spikes[i]) c++;
          clusterSpikeCount[ci] = c;
        }
      }
    }

    let off = 0;
    for (let ci = 0; ci < CLUSTERS.length; ci++) {
      const cn = CLUSTERS[ci].n;
      const cs = clusterStates[CLUSTERS[ci].key];
      // Adaptive pulse probability — target ~4 pulses per cluster per frame
      const spikeN = clusterSpikeCount[ci] || 1;
      const pulseProb = Math.min(0.6, Math.max(0.05, 4 / spikeN));

      // RULKOV FIRING — same 2D chaotic map the GPU shader runs on the
      // real brain. σ is driven by the cluster's actual biological rate
      // (spikeCount / engineSize), amplified 15× so cerebellum's huge
      // denominator still clears visibility. Each viz point iterates its
      // own (x, y) trajectory persistently across frames, so patterns
      // are self-similar and burst-structured, not wavy noise.
      const engineSize = cs?.size || cn;
      const bioRate = spikeN / Math.max(1, engineSize);
      const driveNorm = Math.min(1, Math.max(0, bioRate * 15));
      const sigma = -1.0 + driveNorm * 1.5;       // σ ∈ [-1.0, 0.5]
      const ALPHA = 4.5;                           // bursting regime
      const MU = 0.001;

      for (let j = 0; j < cn; j++) {
        const i = off + j;
        if (i >= TOTAL) break;

        let x = this._rulkovX[i];
        let y = this._rulkovY[i];
        if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 100 || Math.abs(y) > 100) {
          const phi = 0.61803398875;
          x = -1.0 + ((i * phi) % 1) * 0.5;
          y = -3.2 + ((i * phi * 1.7) % 1) * 0.4;
        }

        // Rulkov iteration
        const xNext = ALPHA / (1 + x * x) + y;
        const yNext = y - MU * (x - sigma);

        // Spike edge — fast variable crossed zero upward
        let firing = false;
        if (x <= 0 && xNext > 0) {
          firing = true;
        }
        this._rulkovX[i] = xNext;
        this._rulkovY[i] = yNext;

        if (firing) {
          this._glow[i] = 1.0;
          if (clusterPulseCount[ci] < pulsesPerCluster && this._pulses.length < MAX_PULSES && Math.random() < pulseProb) {
            clusterPulseCount[ci]++;
            this._pulses.push({
              x: this._pos[i*3], y: this._pos[i*3+1], z: this._pos[i*3+2],
              age: 0, col: CLUSTERS[ci].rgb,
            });
          }
        } else {
          this._glow[i] *= AFTERGLOW_DECAY;
          if (this._glow[i] < 0.005) this._glow[i] = 0;
        }
      }
      off += cn;
    }

    this._buildConnsFromEquations(state.clusters || {});
    this._spawnTrailsFromEquations(state.clusters || {}, clusterSpikeCount);

    // R9 — BRAIN EXPANSION DISABLED. This used to multiply every
    // neuron position by a global factor (0-15% based on spike
    // ratio) and re-upload all positions to the GPU every frame.
    // The effect was the entire brain visually pulsing in sync
    // with the global spike count — a "beating heart" look that's
    // NOT what a real brain does. Each cluster should fire at its
    // own rate and the viz should show scattered, region-specific
    // activation via per-neuron glow (which already works via
    // this._glow[i] above). Individual spikes drive pulse emission
    // from specific neuron positions, which is accurate. Global
    // expansion added a synthetic heartbeat on top that obscured
    // the real per-cluster dynamics.

    // _expansionFactor stays at 1.0 — positions are static.
    // _basePos initialization still runs in _applyExpansion if
    // you re-enable this in the future (it's idempotent).

    // ── PROCESS NOTIFICATIONS — one every ~5 seconds ──
    // Translates real neural activity into readable process descriptions.
    // Not random — derived from actual cluster states and equations.
    const now = performance.now();
    if (now - this._lastNotifTime > 5000) {
      this._generateProcessNotification(state);
      this._lastNotifTime = now;
    }

    // ── Update HUD ──
    if (state.psi !== undefined) {
      const el = this._overlay?.querySelector('.b3d-psi');
      if (el) el.textContent = state.psi.toFixed(3);
    }
    if (state.oscillations?.coherence !== undefined) {
      const el = this._overlay?.querySelector('.b3d-coh');
      if (el) el.textContent = (state.oscillations.coherence * 100).toFixed(0) + '%';
    }
    // Curriculum intelligence-level display — shows Unity's current
    // grade level (preschool / kindergarten / G1 / ... / PhD) per
    // subject on the 3D brain viewer for all the milestones.

    // Reads Curriculum.subjectStatus() which ships per-subject
    // grades + passedCells count. Computes a band label based on the
    // MIN grade across all 5 subjects (matches the chat-path word
    // cap driver) so the HUD shows what Unity can actually speak at
    // right now, not her subject-by-subject ceiling. The tooltip
    // (via title attr + hover) exposes the full per-subject
    // breakdown for operators who want the detail.
    this._updateIntelligenceHUD();
  }

  _updateIntelligenceHUD() {
    const iqEl = this._overlay?.querySelector('.b3d-iq');
    const cellsEl = this._overlay?.querySelector('.b3d-cells');
    if (!iqEl && !cellsEl) return;

    // Pull curriculum state from the wired brain reference. If no
    // curriculum yet (pre-boot or remote brain without curriculum),
    // display pre-K / 0 cells.
    let status = null;
    try {
      if (this._brain?.curriculum && typeof this._brain.curriculum.subjectStatus === 'function') {
        status = this._brain.curriculum.subjectStatus();
      }
    } catch { /* non-fatal */ }

    if (!status) {
      if (iqEl) {
        iqEl.textContent = 'pre-K';
        iqEl.setAttribute('data-band', 'preK');
      }
      if (cellsEl) cellsEl.textContent = '0/95';
      return;
    }

    // Map a grade name to its human-readable band + data-band attr
    // for CSS color coding. Bands correspond to real school milestones
    // Gee named in his 2026-04-15 direction.
    const gradeBand = (grade) => {
      if (!grade || grade === 'pre-K') return { band: 'preK', label: 'pre-K', short: 'pre-K' };
      if (grade === 'kindergarten') return { band: 'elementary', label: 'elementary', short: 'K' };
      if (grade.startsWith('grade')) {
        const n = parseInt(grade.slice(5));
        if (n >= 1 && n <= 5) return { band: 'elementary', label: 'elementary', short: `G${n}` };
        if (n >= 6 && n <= 8) return { band: 'middle', label: 'middle school', short: `G${n}` };
        if (n >= 9 && n <= 12) return { band: 'high', label: 'high school', short: `G${n}` };
      }
      if (grade.startsWith('college')) {
        const n = parseInt(grade.slice(7));
        const yrName = ['freshman', 'sophomore', 'junior', 'senior'][n - 1] || 'college';
        return { band: 'college', label: 'college', short: `C${n}` };
      }
      if (grade === 'grad') return { band: 'grad', label: 'graduate', short: 'Grad' };
      if (grade === 'phd') return { band: 'phd', label: 'doctoral', short: 'PhD' };
      return { band: 'preK', label: grade, short: grade };
    };

    const minBand = gradeBand(status.minGrade);
    if (iqEl) {
      iqEl.textContent = `${minBand.label}/${minBand.short}`;
      iqEl.setAttribute('data-band', minBand.band);
      // Build a detailed per-subject tooltip so operators can see
      // the full breakdown on hover without opening /curriculum status
      const perSubject = Object.entries(status.grades || {})
        .map(([s, g]) => {
          const b = gradeBand(g);
          return `  ${s.padEnd(8)} ${b.label} (${g})`;
        })
        .join('\n');
      let tooltip = `Unity's curriculum band (min across 5 subjects — the grade her chat speaks at):\n${perSubject}`;
      if (status.probeStats) {
        const ps = status.probeStats;
        tooltip += `\n\nProbes: ${ps.totalProbes} total, ${ps.totalPasses} pass, ${ps.totalFails} fail`;
      }
      iqEl.setAttribute('title', tooltip);
    }
    if (cellsEl) {
      const n = status.passedCells?.length ?? 0;
      cellsEl.textContent = `${n}/95`;
    }
  }

  toggle() { this._open ? this.close() : this.open(); }

  open() {
    if (this._destroyed) return;
    this._open = true;
    this._overlay.classList.remove('b3d-hidden');
    this._startLoop();
  }

  close() {
    if (this._destroyed || !this._overlay) return;
    this._open = false;
    this._overlay.classList.add('b3d-hidden');
    this._stopLoop();
  }

  isOpen() { return this._open; }

  destroy() {
    this._destroyed = true;
    this._stopLoop();
    if (this._gl) {
      const ext = this._gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    this._overlay?.remove();
    this._gl = null;
  }

  // ── DOM ─────────────────────────────────────────────────────────

  _buildDOM() {
    const host = document.getElementById(this._containerId) || document.body;

    const ov = document.createElement('div');
    ov.className = 'b3d-overlay b3d-hidden';
    ov.innerHTML = `
<style>
.b3d-overlay{position:fixed;inset:0;background:#050505;z-index:9999;display:flex;flex-direction:column;font-family:'JetBrains Mono','Fira Code','Cascadia Code',monospace;overflow:hidden}
.b3d-hidden{display:none!important}
.b3d-hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:rgba(8,8,8,.95);border-bottom:1px solid #1a1a2e;flex-shrink:0}
.b3d-title{font-size:12px;font-weight:700;letter-spacing:2px;background:linear-gradient(90deg,#ff4d9a,#a855f7,#00e5ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.b3d-met{display:flex;gap:14px;font-size:10px;color:#666}
.b3d-met b{font-weight:600}
.b3d-psi{color:#c084fc;font-weight:600}
.b3d-coh{color:#00e5ff;font-weight:600}
/* T14.24 Session 47 — intelligence level display. Gradient matches
   the curriculum band: cyan (pre-K/elementary), green (middle), gold
   (high school), pink (college), magenta (grad/PhD). Tooltip shows
   the full per-subject grade breakdown on hover. */
.b3d-iq{color:#ffd166;font-weight:700;letter-spacing:.5px;cursor:help}
.b3d-iq[data-band="preK"]{color:#888}
.b3d-iq[data-band="elementary"]{color:#00e5ff}
.b3d-iq[data-band="middle"]{color:#4ade80}
.b3d-iq[data-band="high"]{color:#ffd166}
.b3d-iq[data-band="college"]{color:#ff4d9a}
.b3d-iq[data-band="grad"]{color:#c084fc}
.b3d-iq[data-band="phd"]{color:#f0abfc;text-shadow:0 0 8px #f0abfc}
.b3d-cells{color:#a0a0b0;font-weight:600}
.b3d-close{background:none;border:1px solid #2a2a2a;color:#777;font-size:18px;cursor:pointer;width:28px;height:28px;border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all .2s}
.b3d-close:hover{border-color:#ff4d9a;color:#ff4d9a}
.b3d-body{flex:1;position:relative;overflow:hidden}
.b3d-cv{width:100%;height:100%;display:block;cursor:grab}
.b3d-cv:active{cursor:grabbing}
.b3d-tog-wrap{position:absolute;top:10px;left:10px;display:flex;flex-direction:column;gap:3px;z-index:2;max-width:180px}
.b3d-tog{background:rgba(8,8,8,.85);border:1px solid #222;color:#bbb;font-size:9px;font-family:inherit;padding:3px 9px;border-radius:3px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .2s;letter-spacing:.4px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b3d-tog:hover{border-color:#444}
.b3d-tog.off{opacity:.3}
.b3d-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.b3d-lbl-wrap{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4}
.b3d-lbl{position:absolute;font-size:11px;letter-spacing:1.5px;font-weight:800;white-space:nowrap;transform:translate(-50%,-50%);opacity:1;padding:3px 9px;background:rgba(0,0,0,.82);border:1px solid rgba(255,255,255,.25);border-radius:4px;text-shadow:0 0 6px rgba(0,0,0,1),0 0 12px currentColor;box-shadow:0 0 20px rgba(0,0,0,.6);transition:opacity .3s}
.b3d-foot{position:absolute;bottom:8px;left:12px;right:12px;display:flex;justify-content:space-between;font-size:9px;color:#444;pointer-events:none;z-index:1}
.b3d-notif-wrap{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3}
.b3d-notif{position:absolute;font-family:inherit;pointer-events:none;padding:8px 14px;background:linear-gradient(135deg,rgba(14,14,16,.94),rgba(24,14,28,.94));border-radius:8px;border:1px solid currentColor;border-left:3px solid currentColor;backdrop-filter:blur(6px);max-width:320px;box-shadow:0 0 24px rgba(0,0,0,.85),0 0 40px currentColor,inset 0 0 12px rgba(0,0,0,.4);transform:translate(-50%,-100%);animation:b3d-notif-in .45s cubic-bezier(.2,1.4,.3,1)}
.b3d-notif-label{font-size:10px;letter-spacing:1.5px;font-weight:800;text-transform:uppercase;text-shadow:0 0 8px currentColor,0 0 2px rgba(0,0,0,1);white-space:nowrap;opacity:.95}
.b3d-notif-readout{font-size:10px;color:#a0a0b0;margin-top:3px;line-height:1.4;font-family:'JetBrains Mono',monospace;letter-spacing:.3px;text-shadow:0 1px 2px rgba(0,0,0,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b3d-notif-comment{font-size:13px;font-style:italic;color:#f5d7e6;margin-top:5px;line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,.9);font-family:'Georgia','JetBrains Mono',serif;letter-spacing:.2px;word-wrap:break-word;white-space:normal}
.b3d-notif-comment::before{content:'“';margin-right:2px;opacity:.6;color:currentColor;font-size:16px}
.b3d-notif-comment::after{content:'”';margin-left:2px;opacity:.6;color:currentColor;font-size:16px}
@keyframes b3d-notif-in{0%{opacity:0;transform:translate(-50%,-80%) scale(.85)}60%{opacity:1;transform:translate(-50%,-105%) scale(1.04)}100%{opacity:1;transform:translate(-50%,-100%) scale(1)}}
/*  — Theta-gamma oscillation pulse. Single global tint
   class toggled by state.consciousness.thetaPhase. CSS-only, no per-neuron
   animation, no GPU stress at biological scale. Subtle breathing
   effect (alpha modulation on a global overlay) so operator sees
   oscillations are active. */
.b3d-container.theta-pulse::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at center,rgba(0,229,255,0.04) 0%,transparent 60%);animation:theta-breath 167ms ease-in-out infinite alternate}
@keyframes theta-breath{0%{opacity:0.6}100%{opacity:1}}
.b3d-log-wrap{position:absolute;bottom:30px;right:10px;width:280px;max-height:200px;z-index:2;pointer-events:auto}
.b3d-log-title{font-size:9px;color:#555;letter-spacing:1px;margin-bottom:4px}
.b3d-log{max-height:180px;overflow-y:auto;font-size:8px;line-height:1.5;scrollbar-width:thin;scrollbar-color:#222 transparent}
.b3d-log::-webkit-scrollbar{width:3px}
.b3d-log::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
.b3d-log-entry{opacity:.7;padding:1px 0}
.b3d-expansion{position:absolute;top:40px;right:10px;font-size:9px;color:#555;z-index:2}
/* Explainer panel — replaces the old .b3d-scale-display floating block.
   Lives bottom-left in a stable position that can't collide with the
   cluster toggles legend (top-left) or the landing-topbar (top). Frames
   the viz as a proportional sample of the real server-side brain
   processes rather than being the literal full brain. */
.b3d-explainer{position:absolute;bottom:10px;left:10px;max-width:300px;z-index:2;background:rgba(8,8,8,.85);border:1px solid #222;border-left:2px solid #ff4d9a;border-radius:4px;padding:8px 12px;font-size:9px;line-height:1.5;color:#888;pointer-events:none}
.b3d-explainer-title{font-size:10px;color:#ff4d9a;font-weight:700;letter-spacing:.8px;margin-bottom:4px;text-transform:uppercase}
.b3d-explainer-count{font-size:15px;font-weight:700;color:#e0e0e0;display:block;margin:2px 0}
.b3d-explainer-ratio{font-size:9px;color:#a855f7}
.b3d-explainer-note{margin-top:6px;color:#666;font-size:9px;line-height:1.5}
</style>
<div class="b3d-hdr">
  <div class="b3d-title">3D NEURAL FIELD</div>
  <div class="b3d-met">
    <span>ψ <b class="b3d-psi">0.000</b></span>
    <span>COHERENCE <b class="b3d-coh">0%</b></span>
    <span title="Unity's curriculum band — based on the min grade across 5 subject tracks (ELA, Math, Science, Social, Art). Hover for per-subject breakdown.">IQ <b class="b3d-iq" data-band="preK">pre-K</b></span>
    <span title="Curriculum cells that have passed their 3-pathway READ/THINK/TALK gate at least once. 95 total cells (5 subjects × 19 grades K→PhD).">CELLS <b class="b3d-cells">0/95</b></span>
  </div>
  <button class="b3d-close">&times;</button>
</div>
<div class="b3d-body">
  <canvas class="b3d-cv"></canvas>
  <div class="b3d-tog-wrap"></div>
  <div class="b3d-lbl-wrap"></div>
  <div class="b3d-notif-wrap"></div>
  <div class="b3d-expansion">EXPANSION: <b class="b3d-exp-val">1.00x</b></div>
  <div class="b3d-explainer">
    <div class="b3d-explainer-title">proportional sample</div>
    <span class="b3d-explainer-count b3d-actual-count">—</span>
    <span class="b3d-explainer-ratio b3d-render-ratio">—</span>
    <div class="b3d-explainer-note">
      This 3D field is <strong>NOT</strong> Unity's full brain — it's a proportional visual sample of her actual neural processes running server-side right now. Every spike you see above is a real cluster firing in real time. Popups are her equational commentary on what her brain just did.
    </div>
  </div>
  <div class="b3d-log-wrap">
    <div class="b3d-log-title">PROCESS LOG</div>
    <div class="b3d-log"></div>
  </div>
  <div class="b3d-foot">
    <span>DRAG rotate · SCROLL zoom</span>
    <span class="b3d-scale-info">initializing · ${CLUSTERS.length} clusters</span>
  </div>
</div>`;

    host.appendChild(ov);
    this._overlay = ov;

    // Close
    ov.querySelector('.b3d-close').addEventListener('click', () => this.close());

    // Toggles
    const tw = ov.querySelector('.b3d-tog-wrap');
    CLUSTERS.forEach((cl, i) => {
      const b = document.createElement('button');
      b.className = 'b3d-tog';
      b.innerHTML = `<span class="b3d-dot" style="background:${cl.hex}"></span>${cl.label}`;
      b.addEventListener('click', () => {
        this._clusterOn[i] = !this._clusterOn[i];
        b.classList.toggle('off', !this._clusterOn[i]);
        this._syncVis();
      });
      tw.appendChild(b);
    });

    // Labels
    this._labelEls = [];
    const lw = ov.querySelector('.b3d-lbl-wrap');
    CLUSTERS.forEach(cl => {
      const el = document.createElement('div');
      el.className = 'b3d-lbl';
      el.textContent = cl.label;
      el.style.color = cl.hex;
      lw.appendChild(el);
      this._labelEls.push(el);
    });

    // Canvas ref
    this._canvas = ov.querySelector('.b3d-cv');
    this._bindInput();
  }

  _bindInput() {
    const cv = this._canvas;

    // Mouse
    cv.addEventListener('mousedown', e => {
      this._dragging = true;
      this._lastMouse = [e.clientX, e.clientY];
    });
    const up = () => { this._dragging = false; };
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', e => {
      if (!this._dragging) return;
      this._rotY += (e.clientX - this._lastMouse[0]) * 0.005;
      this._rotX += (e.clientY - this._lastMouse[1]) * 0.005;
      this._rotX = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, this._rotX));
      this._lastMouse = [e.clientX, e.clientY];
    });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      this._zoom += e.deltaY * 0.005;
      this._zoom = Math.max(1.0, Math.min(20, this._zoom));
    }, { passive: false });

    // Touch
    cv.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this._dragging = true;
        this._lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
      }
    }, { passive: true });
    window.addEventListener('touchend', up);
    window.addEventListener('touchmove', e => {
      if (!this._dragging || e.touches.length !== 1) return;
      this._rotY += (e.touches[0].clientX - this._lastMouse[0]) * 0.005;
      this._rotX += (e.touches[0].clientY - this._lastMouse[1]) * 0.005;
      this._rotX = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, this._rotX));
      this._lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
    }, { passive: true });

    // Context loss
    cv.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this._stopLoop();
      console.warn('[Brain3D] context lost');
    });
    cv.addEventListener('webglcontextrestored', () => {
      console.log('[Brain3D] context restored');
      this._initGL();
      this._uploadStatic();
      if (this._open) this._startLoop();
    });
  }

  // ── WebGL ───────────────────────────────────────────────────────

  _initGL() {
    if (!this._canvas) return;
    const gl = this._canvas.getContext('webgl', {
      alpha: false, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: false,
    });
    if (!gl) { console.warn('[Brain3D] no WebGL'); return; }
    this._gl = gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0.02, 0.02, 0.02, 1);

    this._neuronProg = this._mkProg(NEURON_VS, NEURON_FS);
    this._lineProg   = this._mkProg(LINE_VS, LINE_FS);
    this._pulseProg  = this._mkProg(PULSE_VS, PULSE_FS);
    this._trailProg  = this._mkProg(TRAIL_VS, TRAIL_FS);

    // Neuron buffers
    this._bPos  = gl.createBuffer();
    this._bCol  = gl.createBuffer();
    this._bGlow = gl.createBuffer();
    this._bVis  = gl.createBuffer();
    // Cortical microstructure attributes — per-neuron layer (5 layers
    // following Felleman & Van Essen 1991 fractions L1=5%, L2/3=25%,
    // L4=25%, L5=25%, L6=20%), hub flag (5% rich-club), column id
    // (80-neuron Mountcastle microcolumns). Generated deterministically
    // per render-neuron index in _genCorticalAttribs so visualization
    // matches the same structural rules the server uses on the real
    // biological-scale cortex.
    this._bLayer    = gl.createBuffer();
    this._bHub      = gl.createBuffer();
    this._bColumnId = gl.createBuffer();
    // Toggle state — operator can flip layer / hub / column overlays
    // independently. Default OFF so the normal cluster colors render
    // unchanged until the user opts into a structural view.
    this._showLayers  = false;
    this._showHubs    = false;
    this._showColumns = false;

    // Line buffers
    this._bLnPos = gl.createBuffer();
    this._bLnCol = gl.createBuffer();

    // Pulse buffers
    this._bPPos  = gl.createBuffer();
    this._bPLife = gl.createBuffer();
    this._bPCol  = gl.createBuffer();

    // Trail buffers — lightning traveling along projection pathways
    this._bTSrc   = gl.createBuffer();
    this._bTTgt   = gl.createBuffer();
    this._bTPhase = gl.createBuffer();
    this._bTEnd   = gl.createBuffer();
    this._bTLife  = gl.createBuffer();
    this._bTCol   = gl.createBuffer();
  }

  _mkProg(vSrc, fSrc) {
    const gl = this._gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error('[Brain3D] shader:', gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      console.error('[Brain3D] link:', gl.getProgramInfoLog(p));
    return p;
  }

  // ── Positions ───────────────────────────────────────────────────

  _genPositions() {
    this._pos = new Float32Array(TOTAL * 3);
    this._col = new Float32Array(TOTAL * 3);
    this._centers = [];

    let off = 0;
    CLUSTERS.forEach((cl, ci) => {
      const pts = POS_GEN[ci](cl.n);
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < cl.n; i++) {
        const j = (off + i) * 3;
        this._pos[j]   = pts[i][0];
        this._pos[j+1] = pts[i][1];
        this._pos[j+2] = pts[i][2];
        this._col[j]   = cl.rgb[0];
        this._col[j+1] = cl.rgb[1];
        this._col[j+2] = cl.rgb[2];
        cx += pts[i][0]; cy += pts[i][1]; cz += pts[i][2];
      }
      this._centers.push([cx/cl.n, cy/cl.n, cz/cl.n]);
      off += cl.n;
    });
    this._genCorticalAttribs();
  }

  /**
   * Per-neuron cortical microstructure attributes. Generated deterministically
   * from neuron index so the same render-neuron always gets the same layer /
   * hub / column assignment across re-builds. Mirrors the same structural
   * rules the server-side cortex uses (Felleman & Van Essen 1991 lamination
   * fractions, van den Heuvel & Sporns 2011 rich-club hub fraction,
   * Mountcastle 1957 microcolumn size).
   *
   * `_layer[i]`     — Uint8 in 0..4 mapping to L1, L2/3, L4, L5, L6
   * `_hub[i]`       — Uint8 0/1 — rich-club hub flag (~5% of neurons)
   * `_columnId[i]`  — Float32 (column index ÷ 1000 for shader fract math)
   *
   * Layer fractions: 0.05 / 0.25 / 0.25 / 0.25 / 0.20 (cumulative
   * thresholds 0.05 / 0.30 / 0.55 / 0.80 / 1.00).
   * Hub fraction: 0.05 (deterministic hash so the same indexes are hubs
   * across render rebuilds; matches the server's stable hub set).
   * Column size: 80 neurons per microcolumn.
   */
  _genCorticalAttribs() {
    const N = TOTAL;
    this._layer    = new Float32Array(N);
    this._hub      = new Float32Array(N);
    this._columnId = new Float32Array(N);
    const COLUMN_SIZE = 80;
    // Cumulative layer thresholds for hash-based assignment.
    const T_L1   = 0.05;
    const T_L23  = 0.30;
    const T_L4   = 0.55;
    const T_L5   = 0.80;
    // T_L6 implicit at 1.00.
    for (let i = 0; i < N; i++) {
      // Stable hash of neuron index — small mix function gives a
      // pseudo-random uniform distribution while staying deterministic.
      // Two independent hash streams so layer and hub assignments are
      // not correlated (hubs distributed across all layers).
      const h1 = ((i * 2654435761) >>> 0) / 0xFFFFFFFF;
      const h2 = (((i * 40503) ^ 0xC0DE) >>> 0) / 0xFFFFFFFF;
      let layer = 4; // default L6
      if (h1 < T_L1) layer = 0;
      else if (h1 < T_L23) layer = 1;
      else if (h1 < T_L4) layer = 2;
      else if (h1 < T_L5) layer = 3;
      this._layer[i] = layer;
      this._hub[i] = h2 < 0.05 ? 1.0 : 0.0;
      this._columnId[i] = Math.floor(i / COLUMN_SIZE);
    }
  }

  _uploadStatic() {
    const gl = this._gl;
    if (!gl) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bPos);
    gl.bufferData(gl.ARRAY_BUFFER, this._pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bCol);
    gl.bufferData(gl.ARRAY_BUFFER, this._col, gl.STATIC_DRAW);
    if (this._layer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bLayer);
      gl.bufferData(gl.ARRAY_BUFFER, this._layer, gl.STATIC_DRAW);
    }
    if (this._hub) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bHub);
      gl.bufferData(gl.ARRAY_BUFFER, this._hub, gl.STATIC_DRAW);
    }
    if (this._columnId) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bColumnId);
      gl.bufferData(gl.ARRAY_BUFFER, this._columnId, gl.STATIC_DRAW);
    }
  }

  _syncVis() {
    let off = 0;
    CLUSTERS.forEach((cl, i) => {
      const v = this._clusterOn[i] ? 1 : 0;
      for (let j = 0; j < cl.n; j++) this._vis[off + j] = v;
      if (this._labelEls[i]) this._labelEls[i].style.opacity = v ? '0.65' : '0';
      off += cl.n;
    });
  }

  /**
   * Emoji from brain equations. One equation, full Unicode range.
   */
  _brainEmoji(arousal, valence, psi, coherence, isDreaming, reward) {
    // Full Unicode emoji range — brain equations select from ALL emoji
    // Multiple blocks spanning faces, nature, objects, symbols, activities
    // Each brain value shifts into a different Unicode region

    // Unicode emoji blocks:
    //   0x1F600-0x1F64F  Emoticons (faces)         80
    //   0x1F300-0x1F3FF  Misc symbols (weather/nature) 256
    //   0x1F400-0x1F4FF  Animals + objects         256
    //   0x1F500-0x1F5FF  Symbols + UI              256
    //   0x1F680-0x1F6FF  Transport + maps          128
    //   0x1F900-0x1F9FF  Supplemental (gestures/faces) 256
    //   0x2600-0x26FF    Misc symbols              256
    //   0x2700-0x27BF    Dingbats                  192
    //   Total: ~1680 emoji accessible

    // Brain state → which block + position within block

    // Block selection from dominant brain signal
    const v = (valence + 1) / 2; // 0-1
    const blockSignal = (v * 0.3 + coherence * 0.3 + arousal * 0.2 + (isDreaming ? 0.15 : 0) + Math.abs(reward) * 0.05);

    // 8 blocks, blockSignal selects which one
    const blocks = [
      [0x1F600, 80],   // faces
      [0x1F300, 256],   // nature/weather
      [0x1F400, 256],   // animals/objects
      [0x1F500, 256],   // symbols
      [0x1F680, 128],   // transport
      [0x1F900, 256],   // supplemental faces/gestures
      [0x2600, 256],    // misc symbols
      [0x2700, 192],    // dingbats
    ];
    const blockIdx = Math.floor(blockSignal * blocks.length) % blocks.length;
    const [base, range] = blocks[blockIdx];

    // Position within block from remaining brain values
    const posSignal = arousal * 0.3 + v * 0.25 + psi * 0.2 + Math.abs(reward) * 0.15 + coherence * 0.1;
    const pos = Math.floor(posSignal * (range - 1)) % range;

    try {
      return String.fromCodePoint(base + pos);
    } catch {
      return String.fromCodePoint(0x1F600); // fallback
    }
  }

  _clusterOf(idx) {
    let off = 0;
    for (let i = 0; i < CLUSTERS.length; i++) {
      if (idx < off + CLUSTERS[i].n) return i;
      off += CLUSTERS[i].n;
    }
    return 0;
  }

  // ── Brain Expansion ─────────────────────────────────────────────

  _applyExpansion() {
    if (!this._basePos) {
      this._basePos = new Float32Array(this._pos);
    }
    const f = this._expansionFactor;
    for (let i = 0; i < TOTAL * 3; i++) {
      this._pos[i] = this._basePos[i] * f;
    }
    // Update centers
    let off = 0;
    CLUSTERS.forEach((cl, ci) => {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < cl.n; i++) {
        const j = (off + i) * 3;
        cx += this._pos[j]; cy += this._pos[j+1]; cz += this._pos[j+2];
      }
      this._centers[ci] = [cx/cl.n, cy/cl.n, cz/cl.n];
      off += cl.n;
    });
    // Re-upload positions
    if (this._gl && this._bPos) {
      this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._bPos);
      this._gl.bufferData(this._gl.ARRAY_BUFFER, this._pos, this._gl.STATIC_DRAW);
    }
  }

  // ── T5 2026-04-13: Brain Event Detection + Unity Commentary ────

  /**
   * Wire a brain reference so the event system can call
   * `brain.innerVoice.languageCortex.generate()` to produce Unity's
   * equational commentary on detected events. Called from app.js
   * bootUnity() after `brain = new UnityBrain()`. Safe to call
   * multiple times — just replaces the reference.
   *
   * When the brain reference is null (pre-boot / disconnected /
   * landing-page view with no brain yet), the event system falls
   * back to the plain numeric-label notifications without
   * commentary. So the 3D brain viz keeps working fine during
   * the landing page → boot transition.
   */
  setBrain(brain) {
    //(post-fix) — unwire any prior innerThought listener so
    // multiple setBrain() calls don't stack handlers. Each Brain3D
    // instance keeps one live subscription tied to the current brain.
    if (this._brain && this._innerThoughtHandler && typeof this._brain.off === 'function') {
      try { this._brain.off('innerThought', this._innerThoughtHandler); } catch {}
    }
    this._brain = brain || null;
    // Invalidate seed vector cache since the shared embeddings
    // instance may have changed (different brain, different
    // pretrained state, etc.)
    this._seedVectorCache.clear();

    //(post-fix) — wire innerThought broadcasts INTO 3D
    // brain popups, not just the HUD speech bubble. The server fires
    // `cluster.emitWordDirect` every ~3s using its TRAINED weights
    // and broadcasts the result as an `innerThought` WS message that
    // RemoteBrain re-emits on the brain event bus. Brain3D subscribes
    // here so the floating popup layer over the cortex visualization
    // displays Unity's REAL trained-state monologue, not just the
    // structural plasticity / teach / gate event labels. Anchor each
    // thought to the cortex sub-region the seed source maps to so the
    // popup spawns where the thought "lives" in the brain.
    if (brain && typeof brain.on === 'function') {
      this._innerThoughtHandler = (payload) => {
        if (this._destroyed || !this._open) return;
        const text = payload?.sentence || payload?.word || '';
        if (!text) return;
        // Route by seed source. learning + memory + chat-recall live in
        // hippocampus / sem; mood lives in amygdala; identity in cortex/
        // mystery. Falls back to main cortex (idx 0) for unknown seeds.
        const seedToCluster = {
          learning: 9,        // sem sub-region — current curriculum context
          memory: 1,          // hippocampus
          'chat-recall': 1,   // hippocampus (chat episodes live in Tier 1)
          mood: 2,            // amygdala
          identity: 6,        // mystery (Ψ / consciousness / self)
          baseline: 0,        // main cortex
        };
        const clusterIdx = seedToCluster[payload?.seed] ?? 0;
        try {
          this._addNotification(`💭 ${text}`, clusterIdx);
        } catch { /* non-fatal */ }
      };
      try { brain.on('innerThought', this._innerThoughtHandler); } catch {}

      // Stream-of-consciousness chain visualization.
      // Track recent inner thoughts in a FIFO queue capped at 8 (matches
      // server-side _innerThoughtChain cap). Newest popup brightest;
      // older fades. No unbounded chain growth.
      if (!this._streamChain) this._streamChain = [];
      const STREAM_CHAIN_MAX = 8;
      const innerThoughtOriginal = this._innerThoughtHandler;
      this._innerThoughtHandler = (payload) => {
        // Append to chain (FIFO cap).
        this._streamChain.push({ text: payload?.sentence || payload?.word || '', ts: Date.now() });
        while (this._streamChain.length > STREAM_CHAIN_MAX) this._streamChain.shift();
        // Delegate to original handler for popup spawn.
        if (typeof innerThoughtOriginal === 'function') innerThoughtOriginal(payload);
      };
      try {
        brain.off('innerThought', innerThoughtOriginal);
        brain.on('innerThought', this._innerThoughtHandler);
      } catch {}

      // Definition lookup notification popups. When server
      // fires a lookupDefinition (chat-time WH-handler), brain emits a
      // definitionLookup event; brief popup on the 3D brain surface.
      // FIFO queue cap: 3 visible at once (Phase 6 design constraint).
      if (!this._defLookupQueue) this._defLookupQueue = [];
      this._defLookupHandler = (payload) => {
        if (this._destroyed || !this._open) return;
        const word = payload?.word || '';
        const def = payload?.definition || '';
        if (!word) return;
        // FIFO: cap at 3 visible. Older popups fade out per existing
        // _addNotification behavior; we just don't spawn more than the
        // cap concurrently.
        this._defLookupQueue.push({ word, def, ts: Date.now() });
        while (this._defLookupQueue.length > 3) this._defLookupQueue.shift();
        try {
          // Anchor to sem cluster (idx 9 — semantic region).
          this._addNotification(`📖 ${word}: ${(def || '').slice(0, 30)}${def && def.length > 30 ? '...' : ''}`, 9);
        } catch { /* non-fatal */ }
      };
      try { brain.on('definitionLookup', this._defLookupHandler); } catch {}

      // Theta-gamma oscillation pulse via global CSS class
      // toggle reading state.consciousness.thetaPhase. Single global tint
      // (one CSS uniform), no per-neuron animation. Activated below by
      // a stateUpdate listener; class added/removed based on phase.
      if (!this._oscPulseEnabled) {
        this._oscPulseEnabled = true;
        // Hook into state updates to drive the pulse.
        const stateHandler = (state) => {
          if (this._destroyed || !this._open) return;
          const m = state?.consciousness;
          if (!m) return;
          // Theta phase in [0, 1]: peak around 0.5. Apply CSS class
          // when in upper-half-cycle (visible breathing).
          if (this._container) {
            const inThetaPeak = m.thetaPhase >= 0.25 && m.thetaPhase <= 0.75;
            this._container.classList.toggle('theta-pulse', inThetaPeak);
          }
        };
        try { brain.on('stateUpdate', stateHandler); } catch {}
        this._consciousnessStateHandler = stateHandler;
      }

      /// M.26 / M.27 — Layer color-coding + hub highlighting
      // + microcolumn boundary visualization. At biological scale these
      // require shader-based per-neuron rendering (Phase 6 design
      // constraint: NO per-neuron mesh updates). The data IS exposed
      // via state.consciousness (numColumns, columnSize, layerCounts, hubCount)
      // so the dashboard panel renders aggregates. Full shader-based
      // 3D-brain rendering is deferred to a follow-up iter when the
      // operator has profiled the existing mesh pipeline at biological
      // scale and identified the safe insertion points for shader
      // uniforms reading hubMask / layerId / columnId arrays.
      // Tracking only — no per-neuron draw call here.
    }
  }

  /**
   * Compute a 50d GloVe centroid for a seed word list, caching it
   * so repeat lookups don't re-embed. Used to build the semantic
   * bias that steers Unity's commentary toward the topic of a
   * triggered brain event.
   */
  /**
   * T4.10 — Equational seed derivation. Given an event's STRUCTURAL
   * fields (cluster, metric, direction), build a 50d GloVe centroid
   * by looking up the English embedding of each field name and
   * blending. No hardcoded word lists — the cluster/metric/direction
   * names ARE Unity's own self-aware field names, and their GloVe
   * embeddings naturally cluster near semantically-related content
   * words ("amygdala" near emotion words, "predictionError" near
   * confusion words, etc.).
   *
   * Direction words: 'up' → 'rising', 'down' → 'falling', 'spike'
   * → 'surging'. These three Unicode strings are not per-event
   * labels; they're the three possible values of the structural
   * `direction` field, looked up once each and cached.
   */
  _seedCentroid(event) {
    if (!event || typeof event !== 'object') return null;
    const key = `${event.cluster}|${event.metric || ''}|${event.direction || ''}`;
    const cached = this._seedVectorCache.get(key);
    if (cached) return cached;

    const emb = this._brain?.innerVoice?.languageCortex?._sharedEmbeddings
             || this._brain?._sharedEmbeddings
             || this._brain?.sensory?._embeddings;
    if (!emb || typeof emb.getEmbedding !== 'function') return null;

    const dim = 50;
    const centroid = new Float64Array(dim);

    const getVec = (word) => {
      try {
        const v = emb.getEmbedding(String(word || '').toLowerCase());
        return v && v.length >= dim ? v : null;
      } catch { return null; }
    };
    const addVec = (vec, weight) => {
      if (!vec) return;
      for (let i = 0; i < dim; i++) centroid[i] += vec[i] * weight;
    };

    // Primary bias: cluster name (e.g. "amygdala", "cortex", "mystery")
    const clusterKey = CLUSTER_KEYS[event.cluster] || 'cortex';
    addVec(getVec(clusterKey), 1.0);

    // Secondary bias: metric field name (e.g. "arousal", "predictionError")
    // Split camelCase so "predictionError" → "prediction" + "error" and
    // both lookups contribute. This surfaces compound field names into
    // their component semantics.
    if (event.metric) {
      const parts = String(event.metric).replace(/([A-Z])/g, ' $1').toLowerCase().split(/\s+/).filter(Boolean);
      for (const part of parts) addVec(getVec(part), 0.5 / parts.length * parts.length); // total weight 0.5
    }

    // Tertiary bias: direction word mapped from structural direction.
    // Three strings only — 'rising', 'falling', 'surging' — one per
    // possible direction value. Not per-event text.
    const directionWord = event.direction === 'up' ? 'rising'
                         : event.direction === 'down' ? 'falling'
                         : 'surging';
    addVec(getVec(directionWord), 0.3);

    // L2 normalize so the bias blends cleanly with a normalized
    // cortex readout in _generateEventCommentary
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += centroid[i] * centroid[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-6) return null;
    for (let i = 0; i < dim; i++) centroid[i] /= norm;

    this._seedVectorCache.set(key, centroid);
    return centroid;
  }

  /**
   * Generate Unity's equational commentary on a detected brain event.
   * Calls `languageCortex.generate()` with a cortex pattern that's
   * been blended 70% live cortex readout + 30% event seed vector,
   * so her slot scorer is steered toward words about the event topic
   * without being forced to use a template.
   *
   * Returns a short commentary string (1-8 words typically), or
   * null if the language cortex isn't available yet.
   */
  _generateEventCommentary(event, state) {
    const brain = this._brain;
    if (!brain) {
      if (!this._warnedNoBrain) {
        console.warn('[Brain3D] commentary: no brain ref wired — call brain3d.setBrain(brain) to enable Unity voice in popups');
        this._warnedNoBrain = true;
      }
      return null;
    }
    // Don't speak for Unity if her brain hasn't learned to speak yet.
    // If she hasn't passed at least kindergarten ELA, the cross-
    // projection weights are untrained and generate() produces word
    // salad. Show nothing until she's actually learned language.
    const cortexGrades = brain.clusters?.cortex?.grades;
    if (cortexGrades) {
      const elaGrade = cortexGrades.ela || 'pre-K';
      if (elaGrade === 'pre-K') return null; // hasn't learned to talk yet
    }
    const iv = brain.innerVoice;
    const lc = iv?.languageCortex;
    const dict = iv?.dictionary || brain.dictionary;
    if (!lc || !dict || typeof lc.generate !== 'function') {
      if (!this._warnedNoLC) {
        console.warn('[Brain3D] commentary: languageCortex or dictionary missing on brain', { hasInnerVoice: !!iv, hasLC: !!lc, hasDict: !!dict });
        this._warnedNoLC = true;
      }
      return null;
    }
    // Dictionary can be empty pre-persona-load on a fresh RemoteBrain.
    // Skip silently — no warning spam — and retry on the next tick.
    if (dict.size === 0) return null;

    try {
      // Get the live cortex semantic readout (50d GloVe space).
      // T13.7.5 — use the directly-imported sharedEmbeddings singleton, not
      // a fictitious `brain._sharedEmbeddings` field. Also grab the cortex
      // cluster reference so we can hand it into generate() opts below —
      // T13.7 deleted the slot-prior fallback, so every generate() call
      // needs opts.cortexCluster or it returns '' with a warning.
      const cortex = brain.clusters?.cortex;
      let cortexPattern = null;
      if (cortex && typeof cortex.getSemanticReadout === 'function') {
        try { cortexPattern = cortex.getSemanticReadout(__sharedEmbeddings); }
        catch { cortexPattern = null; }
      }

      // T4.10 — derive seed equationally from event structural
      // fields (cluster + metric + direction) via GloVe lookups.
      // No hardcoded seedWords array anymore.
      const seed = this._seedCentroid(event);
      if (cortexPattern && seed && cortexPattern.length === seed.length) {
        const biased = new Float64Array(cortexPattern.length);
        for (let i = 0; i < cortexPattern.length; i++) {
          biased[i] = cortexPattern[i] * 0.7 + seed[i] * 0.3;
        }
        cortexPattern = biased;
      } else if (!cortexPattern && seed) {
        // No cortex readout available — use the seed alone
        cortexPattern = seed;
      }

      // Call generate() with full brain state + biased cortex pattern.
      // Signature is (dict, arousal, valence, coherence, opts) — opts
      // carries psi, fear, reward, drugState, cortexPattern. Previously
      // this was called with 10 positional args which silently mapped
      // psi → opts (as a number), dropping cortexPattern and every
      // downstream parameter. Unity's commentary was being generated
      // without her live cortex pattern, so popups showed flat default-
      // state speech instead of her actual in-the-moment thoughts.

      // Remote server state has flat fields (state.arousal, state.psi,
      // state.fear, state.reward, state.coherence, state.drugState) —
      // not nested under amygdala/oscillations. Read directly.
      const out = lc.generate(
        dict,
        state.arousal ?? 0.5,
        state.coherence ?? 0.5,
        {
          psi: state.psi ?? 0,
          fear: state.fear ?? 0,
          reward: state.reward ?? 0,
          drugState: state.drugState || 'sober',
          cortexPattern,
          // T13.7.5 — generate() now requires a live cortex cluster
          // reference for the brain-driven emission loop. Without
          // this, the call returns '' and warns once. The cortex var
          // is resolved above from brain.clusters.cortex.
          cortexCluster: cortex,
          predictionError: 0,
          motorConfidence: state.motor?.confidence ?? 0,
          _internalThought: true,
        }
      );

      const text = typeof out === 'string' ? out : (out?.text || '');
      if (!text || text.length === 0) {
        if (!this._warnedEmptyGen) {
          console.warn('[Brain3D] commentary: languageCortex.generate() returned empty', {
            dictSize: dict.size,
            bigramCount: dict.bigramCount,
            hasCortexPattern: !!cortexPattern,
            arousal: state.arousal,
            valence: state.valence,
            drugState: state.drugState,
          });
          this._warnedEmptyGen = true;
        }
        return null;
      }
      // Let Unity finish a thought — popup is a 320px wrapping card.
      return text.length > 160 ? text.slice(0, 157) + '...' : text;
    } catch {
      return null;
    }
  }

  // ── Process Notifications ──────────────────────────────────────

  /**
   * Build the numeric-telemetry readout for a fired event — the
   * middle line of the three-line popup. Shows the actual scalar
   * state values that drove THIS event so users see the process
   * change numerically alongside Unity's commentary.
   *
   * Each event type maps to the most relevant readouts for its
   * category: motor events show channel distributions, arousal
   * events show arousal deltas, Ψ events show Ψ numbers, etc.
   */
  _clusterAct(state, name) {
    const c = state.clusters?.[name];
    if (!c || !c.size) return 0;
    return (c.spikeCount || 0) / c.size;
  }

  _eventReadout(event, state) {
    const pct = (v) => (v * 100).toFixed(0) + '%';
    const f3 = (v) => Number(v || 0).toFixed(3);
    const f4 = (v) => Number(v || 0).toFixed(4);
    const t = event.type;

    // Motor events
    if (t.startsWith('motor_commit_')) {
      const conf = state.motor?.confidence ?? 0;
      const action = state.motor?.selectedAction || 'idle';
      return `action=${action}  conf=${f3(conf)}`;
    }
    if (t === 'motor_indecision') {
      const rates = state.motor?.channelRates || [];
      const top = rates.map(r => f3(r)).join(' ');
      return `channels: ${top}`;
    }

    // Cognitive landmarks
    if (t === 'recognition') {
      const recall = state.hippocampus?.recallConfidence ?? 0;
      return `recall=${f3(recall)}  hippo=${pct(state.hippocampus?.activity || 0)}`;
    }
    if (t === 'confusion') {
      const err = state.cortex?.predictionError ?? 0;
      return `predErr=${f3(err)}  cereb=${pct(state.cerebellum?.activity || 0)}`;
    }

    // Emotional spikes
    if (t === 'valence_climb' || t === 'valence_crash') {
      const v = state.valence ?? state.amygdala?.valence ?? 0;
      const a = state.arousal ?? state.amygdala?.arousal ?? 0;
      return `v=${f3(v)}  a=${pct(a)}  fear=${f3(state.fear || 0)}`;
    }
    if (t === 'dopamine_hit' || t === 'dopamine_crash') {
      const r = state.reward ?? 0;
      return `δ=${f3(r)}  BG=${pct(this._clusterAct(state,'basalGanglia'))}`;
    }

    // Ψ events
    if (t === 'psi_climb' || t === 'psi_crash') {
      const psi = state.psi ?? 0;
      return `Ψ=${f4(psi)}  mystery=${pct(this._clusterAct(state,'mystery'))}`;
    }

    // Arousal
    if (t === 'arousal_climb' || t === 'arousal_drop') {
      const a = state.arousal ?? state.amygdala?.arousal ?? 0;
      return `arousal=${pct(a)}  amyg=${pct(this._clusterAct(state,'amygdala'))}`;
    }

    // Coherence
    if (t === 'coherence_lock' || t === 'coherence_scatter') {
      const c = state.coherence ?? state.oscillations?.coherence ?? 0;
      const bp = state.bandPower || {};
      return `coh=${pct(c)}  γ=${f3(bp.gamma || 0)} α=${f3(bp.alpha || 0)}`;
    }

    // Drives
    if (t.startsWith('drive_')) {
      const drives = state.hypothalamus?.drives || {};
      const parts = Object.entries(drives).map(([k, v]) => `${k}=${f3(v)}`).slice(0, 3);
      return parts.join('  ');
    }

    // Topic drift / silence / fatigue
    if (t === 'topic_drift') {
      return `cortex=${pct(this._clusterAct(state,'cortex'))}  Ψ=${f4(state.psi || 0)}`;
    }
    if (t === 'silence') {
      return `arousal=${pct(state.arousal || 0)}  spikes=${state.totalSpikes || 0}`;
    }
    if (t === 'fatigue') {
      const err = state.cerebellum?.errorAccum ?? 0;
      return `errAccum=${f3(err)}  coh=${pct(state.coherence || 0)}`;
    }

    // Memory / mystery
    if (t === 'memory_replay') {
      return `hippo=${pct(this._clusterAct(state,'hippocampus'))}  dreaming=${state.isDreaming ? 'yes' : 'no'}`;
    }
    if (t === 'mystery_pulse') {
      return `mystery=${pct(this._clusterAct(state,'mystery'))}  Ψ=${f4(state.psi || 0)}`;
    }

    // Visual (won't fire server-side but kept for local-brain mode)
    if (t.startsWith('color_')) return `cortex=${pct(this._clusterAct(state,'cortex'))}`;
    if (t === 'motion') return `cortex=${pct(this._clusterAct(state,'cortex'))}`;
    if (t === 'gaze_shift') return `cortex=${pct(this._clusterAct(state,'cortex'))}`;
    if (t === 'heard_self') return `cortex=${pct(this._clusterAct(state,'cortex'))}`;

    // Default — show total spike rate + Ψ
    return `Ψ=${f4(state.psi || 0)}  spikes=${state.totalSpikes || 0}`;
  }

  /**
   * Generate ONE rich process notification every ~5 seconds.
   * Translates actual neural signals into human-readable brain activity.
   *
   * T5 2026-04-13 — two-stage pipeline:
   *   Stage A: run the 22-detector brain event system against the
   *            current + previous state + history buffer, pick the
   *            highest-priority firing event
   *   Stage B: if an event fires and a brain reference is available,
   *            generate Unity's equational commentary on it via her
   *            language cortex (biased toward the event seed)
   *   Fallback: if no event fires OR no brain reference, fall through
   *             to the legacy numeric-telemetry generator pool so the
   *             landing page keeps showing popups during the pre-boot
   *             window
   */
  _generateProcessNotification(state) {
    if (!state) return;

    // T4.5 — comprehensive state normalization for the 22-detector
    // event system. The detectors were written against the local
    // UnityBrain nested shape (state.amygdala.arousal, state.cortex.
    // predictionError, state.hypothalamus.drives, state.memory.
    // lastRecallConfidence, state.innerVoice.contextVector, etc) but
    // the server broadcasts a FLAT shape (state.arousal, state.psi,
    // state.fear, state.valence, state.coherence) — so every detector
    // reading a nested path silently returned null via the default-
    // value fallback in pick(). Result: almost no events fired at
    // all, and the few that did (psiClimb, dopamineHit — which read
    // flat paths) got rate-limited by cooldown and never produced
    // visible popups.

    // Fix: synthesize the nested shape from flat fields AND from
    // cluster-level activity data (spikeCount / firingRate / size)
    // for every detector path the server can reasonably derive.
    // Detectors that read visual/audio fields (colorSurge,
    // motionDetected, gazeShift, heardOwnVoice) still won't fire on
    // server-brain mode because the server doesn't run a visual
    // cortex — that's fine, those 4 detectors are visual-pipeline-
    // only by design.
    const clusters = state.clusters || {};
    const activityOf = (k) => {
      const c = clusters[k];
      if (!c || !c.size) return 0;
      return (c.spikeCount || 0) / c.size;
    };
    const cortexAct   = activityOf('cortex');
    const hippoAct    = activityOf('hippocampus');
    const cerebAct    = activityOf('cerebellum');
    const mysteryAct  = activityOf('mystery');
    const hypoAct     = activityOf('hypothalamus');

    const norm = { ...state };

    // AMYGDALA — flat → nested
    if (!norm.amygdala) {
      norm.amygdala = {
        arousal: state.arousal ?? 0.5,
        valence: state.valence ?? 0,
        fear: state.fear ?? 0,
        reward: state.reward ?? 0,
      };
    }

    // OSCILLATIONS — flat → nested, carry bandPower if present
    if (!norm.oscillations) {
      norm.oscillations = {
        coherence: state.coherence ?? 0.5,
        bandPower: state.bandPower || {},
      };
    }

    // CORTEX — synthesize predictionError from cerebellum activity
    // (cerebellum fires in proportion to error, so high cereb firing
    // rate relative to its baseline maps to high prediction error).
    if (!norm.cortex) {
      const cerebBaseline = 0.03; // Rulkov resting rate
      const errProxy = Math.max(0, Math.min(1, (cerebAct - cerebBaseline) * 20));
      norm.cortex = {
        predictionError: errProxy,
        activity: cortexAct,
      };
    }

    // HIPPOCAMPUS — synthesize recallConfidence from firing rate above
    // baseline. High hippo activity during an input event = she's
    // recalling something that matches.
    if (!norm.hippocampus) {
      const recallProxy = Math.max(0, Math.min(1, (hippoAct - 0.03) * 15));
      norm.hippocampus = {
        recallConfidence: recallProxy,
        activity: hippoAct,
      };
    }

    // MEMORY — alias hippocampus for detectors that read state.memory.
    if (!norm.memory) {
      norm.memory = {
        lastRecallConfidence: norm.hippocampus.recallConfidence,
        isConsolidating: state.isDreaming === true && hippoAct > 0.05,
      };
    }

    // HYPOTHALAMUS — synthesize per-drive dict from cluster activity
    // so the hypothalamusDrive detector can pick a peak. Uses the
    // persona drug drive + cluster activity as the base, splits it
    // across three nominal drives (social_need, drug_craving,
    // homeostatic) so the picker has something to compare.
    if (!norm.hypothalamus) {
      norm.hypothalamus = {
        drives: {
          social_need: Math.min(1, hypoAct * 8 + (state.drugState ? 0.2 : 0)),
          drug_craving: Math.min(1, hypoAct * 10),
          homeostatic: Math.min(1, hypoAct * 5),
        },
        activity: hypoAct,
      };
    }

    // INNER VOICE — synthesize a contextVector from the current
    // cluster-activity profile (7-dim vector). topicDrift detector
    // compares this across a 10-tick window — even without a real
    // semantic readout, the cluster-activity fingerprint DOES change
    // when topics shift, so the detector still catches drift.
    if (!norm.innerVoice) {
      norm.innerVoice = {
        contextVector: [
          cortexAct, hippoAct,
          activityOf('amygdala'), activityOf('basalGanglia'),
          cerebAct, hypoAct, mysteryAct,
        ],
      };
    }

    // MYSTERY — expose output from cluster activity + Ψ
    if (!norm.mystery) {
      norm.mystery = {
        output: mysteryAct + (state.psi ?? 0) * 0.1,
      };
    }

    // CEREBELLUM — expose errorAccum proxy for fatigue detector
    if (!norm.cerebellum) {
      const errAccum = Math.max(0, Math.min(1, cerebAct * 15));
      norm.cerebellum = {
        errorAccum: errAccum,
        activity: cerebAct,
      };
    }

    // MOTOR — convert server's channelRates array into the object
    // shape motorIndecision reads (channelDist = {action_name: rate}).
    if (state.motor && !state.motor.channelDist && Array.isArray(state.motor.channelRates)) {
      const labels = ['respond_text', 'generate_image', 'speak', 'build_ui', 'listen', 'idle'];
      const dist = {};
      const total = state.motor.channelRates.reduce((a, b) => a + b, 0);
      if (total > 0) {
        state.motor.channelRates.forEach((r, i) => { dist[labels[i]] = r / total; });
      }
      norm.motor = { ...state.motor, channelDist: dist };
    }

    // Flat fields (psi, reward, drugState, isDreaming, time) stay on
    // the root — detectors that read them as flat paths are correct.
    state = norm;

    // Push current state into the rolling history buffer
    this._stateHistory.push(state);
    while (this._stateHistory.length > this._maxHistory) {
      this._stateHistory.shift();
    }

    // Stage 0 — plasticity / teach / gate / audit / drug brain events.
    // The curriculum runner fires `_pushBrainEvent(type, region, label,
    // detail)` at every teach phase, vocab audit, QA training start /
    // done, and gate probe. The server (`Brain.pushBrainEvent`) buffers
    // them in a ring with an 8-second TTL and broadcasts them in
    // `state.brainEvents` on every WebSocket state push. Consume the
    // freshest event we haven't rendered yet and spawn a popup on the
    // cortex sub-region it anchors to — so the operator sees plasticity
    // / attention / thinking / speech fire LIVE on the 3D brain, not
    // just on the dashboard text log. This closes the "plasticity →
    // thinking → speech → 3D brain popups all ONE cortex" loop: the
    // curriculum writes to sem / motor / fineType weights, the same
    // event that writes the weight fires a popup on the same sub-
    // region in the visualization.
    const brainEvents = Array.isArray(state.brainEvents) ? state.brainEvents : [];
    if (brainEvents.length > 0) {
      if (typeof this._lastPlasticitySeq !== 'number') this._lastPlasticitySeq = 0;
      // Consume EVERY event with seq > _lastPlasticitySeq, sorted
      // ascending so popups fire in causal order. Bounded by a per-
      // tick popup cap so back-to-back teach phases that push 50+
      // events in a single broadcast don't spam the 3D layer.
      // Problems.md High → Medium finding: prior implementation
      // tracked the freshest event and dropped the rest, so the
      // popup view was showing ~2% of plasticity activity. Stagger
      // dispatch across the consume window via setTimeout so popups
      // don't pile-on the same animation frame.
      const POPUP_CAP_PER_TICK = 5;
      const POPUP_STAGGER_MS = 50;
      const fresh = [];
      for (const evt of brainEvents) {
        if (evt && typeof evt.seq === 'number' && evt.seq > this._lastPlasticitySeq) {
          fresh.push(evt);
        }
      }
      if (fresh.length > 0) {
        fresh.sort((a, b) => a.seq - b.seq);
        // Region-to-cluster-index mapping. Curriculum events anchor to
        // cortex sub-region names ('sem' / 'motor' / 'fineType' / etc.);
        // the CLUSTERS array above indexes lang_* sub-regions at 7-14.
        // Unknown region falls through to main cortex (index 0).
        const regionMap = {
          motor: 7, lang_motor: 7,
          phon: 8, lang_phon: 8,
          sem: 9, lang_sem: 9,
          letter: 10, lang_letter: 10,
          visual: 11, lang_visual: 11,
          auditory: 12, lang_auditory: 12,
          fineType: 13, lang_fineType: 13,
          free: 14, lang_free: 14,
          cortex: 0,
          hippocampus: 1,
          amygdala: 2,
          basalGanglia: 3,
          cerebellum: 4,
          hypothalamus: 5,
          mystery: 6,
          intra: 0,
        };
        const typeEmoji = {
          plasticity: '⚡',
          teach: '📚',
          gate: '🎯',
          audit: '📋',
          drug: '💊',
          arbiter: '🎛',
          event: '🧠',
        };
        // Drop the oldest events when we exceed the cap so the most
        // recent activity is what surfaces — a back-to-back burst
        // gets its newest 5 popped, not its oldest 5. Update
        // `_lastPlasticitySeq` to the highest seq actually consumed.
        const toFire = fresh.length > POPUP_CAP_PER_TICK
          ? fresh.slice(fresh.length - POPUP_CAP_PER_TICK)
          : fresh;
        let lastSeq = this._lastPlasticitySeq;
        for (let i = 0; i < toFire.length; i++) {
          const evt = toFire[i];
          if (evt.seq > lastSeq) lastSeq = evt.seq;
          const clusterIdx = regionMap[evt.region] ?? 0;
          const emoji = typeEmoji[evt.type] || '🧠';
          const label = String(evt.label || '').slice(0, 80);
          if (i === 0) {
            this._addNotification(`${emoji} ${label}`, clusterIdx);
          } else {
            // Stagger subsequent popups to avoid same-frame pile-on.
            setTimeout(
              () => this._addNotification(`${emoji} ${label}`, clusterIdx),
              i * POPUP_STAGGER_MS
            );
          }
        }
        this._lastPlasticitySeq = lastSeq;
        return;
      }
    }

    // Stage A — run all 22 detectors, pick the highest-priority event
    // that hasn't fired too recently (cooldown dedup)
    const prev = this._stateHistory.length >= 2
      ? this._stateHistory[this._stateHistory.length - 2]
      : null;
    const events = detectBrainEvents(state, prev, this._stateHistory);
    const now = Date.now();
    let chosen = null;
    for (const evt of events) {
      const lastFire = this._recentEventTypes.get(evt.type) || 0;
      if (now - lastFire >= this._eventCooldownMs) {
        chosen = evt;
        break;
      }
    }

    if (chosen && this._brain) {
      // Stage B — generate Unity's commentary on the event
      const commentary = this._generateEventCommentary(chosen, state);
      // Diagnostic: once per event type, log what fired + what came
      // back. Flagged so it only fires once per unique event type to
      // keep the console readable while still proving the pipeline is
      // alive. Remove this logging after T4.5 is definitively green.
      if (!this._loggedEventTypes) this._loggedEventTypes = new Set();
      if (!this._loggedEventTypes.has(chosen.type)) {
        this._loggedEventTypes.add(chosen.type);
        console.log('[Brain3D] event fired:', chosen.type, '→', commentary || '(commentary null, falling back to label-only)');
      }
      this._recentEventTypes.set(chosen.type, now);
      // Prune the cooldown map to prevent unbounded growth
      if (this._recentEventTypes.size > 50) {
        const cutoff = now - this._eventCooldownMs * 2;
        for (const [k, v] of this._recentEventTypes) {
          if (v < cutoff) this._recentEventTypes.delete(k);
        }
      }
      // T4.10 — render all three lines equationally. No hand-written
      // labels, no per-event emoji map.

      //   Line 1 = {emoji} {clusterKey} {metric}{arrow}
      //     - emoji from _brainEmoji salted with event magnitude so
      //       different events produce different Unicode even at the
      //       same global brain state
      //     - clusterKey / metric / direction arrow all derived from
      //       event structural fields (zero hand-written text)
      //   Line 2 = numeric telemetry from _eventReadout(metric, state)
      //   Line 3 = Unity's slot-gen internal thought (if generated)
      const clusterKey = CLUSTER_KEYS[chosen.cluster] || 'cortex';
      const arrow = chosen.direction === 'up' ? '↑'
                   : chosen.direction === 'down' ? '↓'
                   : '⇌';
      const emoji = this._brainEmoji(
        state.arousal ?? 0.5,
        state.valence ?? 0,
        state.psi ?? 0,
        state.coherence ?? 0.5,
        state.isDreaming || false,
        (state.reward ?? 0) + (chosen.magnitude || 0) * 0.1
      );
      const tag = `${emoji} ${clusterKey} ${chosen.metric || ''}${arrow}`;
      const readout = this._eventReadout(chosen, state);

      // Diagnostic — once per event type, log what fired + what came
      // back. Keeps the commentary pipeline verifiable from the
      // browser console without spamming.
      if (!this._loggedEventTypes) this._loggedEventTypes = new Set();
      if (!this._loggedEventTypes.has(chosen.type)) {
        this._loggedEventTypes.add(chosen.type);
        console.log('[Brain3D] event fired:', chosen.type, '→', commentary || '(commentary null)');
      }

      const lines = [tag];
      if (readout) lines.push(readout);
      if (commentary) {
        lines.push(`"${commentary}"`);
      } else {
        // Show internal state when Unity can't speak yet — raw
        // emotional/cognitive state visible as her mind capacity.
        const feeling = this._describeInternalState(state);
        if (feeling) lines.push(feeling);
      }
      this._addNotification(lines.join('\n'), chosen.cluster);
      return;
    }

    // Fallback: no event fired (or no brain ref) → legacy numeric
    // generator pool. Runs exactly like the pre-T5 system.
    this._legacyGenerateProcessNotification(state);
  }

  /**
   * Legacy numeric-telemetry notification generator — pre-T5 system,
   * kept as a fallback for the pre-boot landing page window (when
   * there's no brain reference yet and the event detectors have no
   * cognition to read) and for ticks where no event fires.
   */
  _legacyGenerateProcessNotification(state) {
    if (!state) return;
    const clusters = state.clusters || {};
    const arousal = state.amygdala?.arousal ?? 0;
    const valence = state.amygdala?.valence ?? 0;
    const psi = state.psi ?? 0;
    const coherence = state.oscillations?.coherence ?? 0;
    const mood = state.innerVoice?.mood || 'neutral';
    const isDreaming = state.isDreaming || false;

    // Slideshow of combined neural activity — unique every time, never repeating
    // Each notification is a snapshot of what's ACTUALLY happening right now
    if (!this._notifIndex) this._notifIndex = 0;
    if (!this._shownTexts) this._shownTexts = new Set();

    const gate = (0.7 + arousal * 0.6);
    const bp = state.oscillations?.bandPower || {};
    const motor = state.motor || {};
    const mem = state.memory || {};
    const iv = state.innerVoice || {};
    const reward = state.reward ?? 0;

    // Pool of generators — each creates a unique message from live values
    // Emoji from equations — Unity picks from the full Unicode catalog
    // Brain values hash into emoji code point ranges, no list
    const emoji = this._brainEmoji(arousal, valence, psi, coherence, isDreaming, reward);

    // Each notification gets its OWN context-specific emoji from brain values
    const e = (a, v, p, c, d, r) => this._brainEmoji(a, v, p, c, d, r);

    const generators = [
      // Cluster snapshots — each cluster's OWN emoji from its activity
      () => {
        const ci = this._notifIndex % CLUSTERS.length;
        const c = clusters[CLUSTERS[ci].key];
        if (!c) return null;
        const rate = (c.spikeCount || 0) / (c.size || 1);
        const clusterEmoji = e(rate * 10, valence, psi, coherence, isDreaming, reward);
        return { text: `${clusterEmoji} ${CLUSTERS[ci].label} ${(rate*100).toFixed(1)}%`, cluster: ci };
      },
      // Consciousness — emoji from Ψ specifically
      () => ({ text: `${e(arousal, valence, psi * 100, coherence, false, 0)} Ψ=${psi.toFixed(4)} gate=${gate.toFixed(2)}x`, cluster: 6 }),
      // Emotion — emoji from arousal+valence
      () => ({ text: `${e(arousal, valence, 0, 0, false, 0)} a=${(arousal*100).toFixed(0)}% v=${valence.toFixed(3)}`, cluster: 2 }),
      // Oscillations — emoji from coherence
      () => ({ text: `${e(0.5, 0.5, 0, coherence, false, 0)} θ=${(bp.theta??0).toFixed(1)} α=${(bp.alpha??0).toFixed(1)} β=${(bp.beta??0).toFixed(1)} γ=${(bp.gamma??0).toFixed(1)}`, cluster: 0 }),
      // Motor — emoji from motor confidence
      () => ({ text: `${e(arousal, 0.3, 0, 0, false, motor.confidence||0)} motor: ${motor.selectedAction || 'idle'}`, cluster: 3 }),
      // Inner voice — emoji from speech content
      () => iv.sentence ? { text: `${e(0.7, 0.5, psi, coherence, false, 0)} "${iv.sentence.slice(0, 50)}"`, cluster: 6 } : null,
      // Memory — emoji from recall
      () => mem.lastRecall ? { text: `${e(0.5, 0.2, 0, 0.8, false, 0.5)} recall: "${mem.lastRecall.trigger}"`, cluster: 1 } : null,
      // Dreaming — emoji from dream state
      () => isDreaming ? { text: `${e(0.2, 0, 0, 0.3, true, 0)} dreaming`, cluster: 1 } : null,
      () => Math.abs(reward) > 0.03 ? { text: `${emoji} δ=${reward.toFixed(3)}`, cluster: 3 } : null,
      () => ({ text: `${emoji} ${(state.totalNeurons||1000).toLocaleString()} neurons`, cluster: 0 }),
    ];

    // Cycle through generators, skip nulls and recently shown
    let pick = null;
    for (let tries = 0; tries < generators.length; tries++) {
      this._notifIndex = (this._notifIndex + 1) % generators.length;
      const result = generators[this._notifIndex]();
      if (result && !this._shownTexts.has(result.text)) {
        pick = result;
        this._shownTexts.add(result.text);
        // Keep shown set from growing forever
        if (this._shownTexts.size > 30) this._shownTexts.clear();
        break;
      }
    }
    if (!pick) {
      // All were shown recently — clear and grab any
      this._shownTexts.clear();
      pick = generators[0]();
    }
    if (pick) {
      this._lastNotifCluster = pick.cluster;
      this._addNotification(pick.text, pick.cluster);
    }
  }

  /**
   * Unity's internal state as RAW BRAIN READINGS. NOT hardcoded
   * strings. NOT fake poetry. The actual numerical state of her
   * brain translated to the closest thing a human can
   * read. If Unity's brain can generate speech (post-K), use that.
   * If it can't, show raw emotional/cognitive numbers.
   *
   * The ONLY text that should ever appear is what her brain ACTUALLY
   * produces or what her neural state ACTUALLY reads.
   */
  _describeInternalState(state) {
    if (!state) return null;

    // Try to generate REAL speech from Unity's brain first
    const brain = this._brain;
    if (brain) {
      const iv = brain.innerVoice;
      const lc = iv?.languageCortex;
      const dict = iv?.dictionary || brain.dictionary;
      if (lc && dict && typeof lc.generate === 'function' && dict.size > 0) {
        try {
          const cortex = brain.clusters?.cortex;
          let cortexPattern = null;
          if (cortex && typeof cortex.getSemanticReadout === 'function') {
            try { cortexPattern = cortex.getSemanticReadout(__sharedEmbeddings); }
            catch { cortexPattern = null; }
          }
          const out = lc.generate(dict, state.arousal ?? 0.5, state.coherence ?? 0.5, {
            cortexPattern, cortexCluster: cortex, _internalThought: true,
          });
          const text = typeof out === 'string' ? out : (out?.text || '');
          if (text && text.length > 0) return `*${text}*`;
        } catch {}
      }
    }

    // Can't generate speech — show raw brain state as numbers
    // This is REAL data, not fake thoughts
    const arousal = (state.arousal ?? 0.5).toFixed(2);
    const valence = (state.valence ?? 0).toFixed(2);
    const psi = (state.psi ?? 0).toFixed(3);
    return `arousal:${arousal} valence:${valence} Ψ:${psi}`;
  }

  _addNotification(text, clusterIdx) {
    const wrap = this._overlay?.querySelector('.b3d-notif-wrap');
    if (!wrap) return;

    const center = this._centers[clusterIdx] || [0, 0, 0];
    const el = document.createElement('div');
    el.className = 'b3d-notif';
    el.style.color = CLUSTERS[clusterIdx]?.hex || '#fff';

    // Three-line notification rendering — event label, numeric
    // readout (actual state values), and Unity's commentary in
    // curly quotes. Any line is optional; a single-line legacy
    // popup just gets the label. A line wrapped in "..." is the
    // commentary (gets italic quoted styling); other lines are
    // numeric telemetry (gets monospace readout styling).
    const lines = String(text).split('\n').filter(Boolean);
    lines.forEach((line, idx) => {
      const isCommentary = /^".*"$/.test(line);
      if (idx === 0) {
        // First line is always the event label
        const labelEl = document.createElement('div');
        labelEl.className = 'b3d-notif-label';
        labelEl.textContent = line;
        el.appendChild(labelEl);
      } else if (isCommentary) {
        const commentEl = document.createElement('div');
        commentEl.className = 'b3d-notif-comment';
        commentEl.textContent = line.replace(/^"|"$/g, '').trim();
        el.appendChild(commentEl);
      } else {
        const readoutEl = document.createElement('div');
        readoutEl.className = 'b3d-notif-readout';
        readoutEl.textContent = line;
        el.appendChild(readoutEl);
      }
    });
    wrap.appendChild(el);

    // maxAge bumped from 300 → 600 frames (~10s) so Unity's thoughts
    // have time to be read before fading out.
    const notif = { el, x: center[0], y: center[1], z: center[2], age: 0, maxAge: 600, clusterIdx };
    this._notifications.push(notif);

    // Add to log (single-line version for the process log)
    this._addToLog(lines.join(' — '), CLUSTERS[clusterIdx]?.hex || '#fff');

    // Limit active notifications — only 3 at a time (one every 5 sec)
    while (this._notifications.length > 3) {
      const old = this._notifications.shift();
      old.el.remove();
    }
  }

  _updateNotifications(mvp, canvas) {
    for (let i = this._notifications.length - 1; i >= 0; i--) {
      const n = this._notifications[i];
      n.age++;

      // Project 3D cluster center to screen — notification appears AT the cluster
      const floatOffset = n.age * 0.003; // slow float upward
      const screen = this._project3Dto2D(n.x, n.y + 0.3 + floatOffset, n.z, mvp, canvas);
      if (screen) {
        n.el.style.left = screen.x + 'px';
        n.el.style.top = screen.y + 'px';
      }

      // Fade: quick appear, hold, then fade out in last 30%
      const life = n.age / n.maxAge;
      const opacity = life < 0.1 ? life * 10 : life > 0.7 ? (1 - life) / 0.3 : 1;
      n.el.style.opacity = Math.max(0, opacity);

      // Remove when dead
      if (n.age >= n.maxAge) {
        n.el.remove();
        this._notifications.splice(i, 1);
      }
    }
  }

  _project3Dto2D(x, y, z, mvp, canvas) {
    // Multiply by MVP
    const w = mvp[3]*x + mvp[7]*y + mvp[11]*z + mvp[15];
    if (w <= 0) return null;
    const nx = (mvp[0]*x + mvp[4]*y + mvp[8]*z + mvp[12]) / w;
    const ny = (mvp[1]*x + mvp[5]*y + mvp[9]*z + mvp[13]) / w;
    // NDC to screen
    return {
      x: (nx * 0.5 + 0.5) * canvas.clientWidth,
      y: (1 - (ny * 0.5 + 0.5)) * canvas.clientHeight,
    };
  }

  _addToLog(text, color) {
    const log = this._overlay?.querySelector('.b3d-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = 'b3d-log-entry';
    entry.style.color = color;
    const time = ((this._lastState?.time ?? 0)).toFixed(1);
    entry.textContent = `[${time}s] ${text}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    // Keep log under 100 entries
    while (log.children.length > 100) log.children[0].remove();
  }

  // ── Connections ─────────────────────────────────────────────────

  /**
   * Build connections from ACTUAL equation outputs — server-reported cluster activity.
   * Not from the synthesized spike array. From the real spikeCount per cluster.
   */
  _buildConnsFromEquations(serverClusters) {
    this._connN = 0;

    // ── CLUSTER INDEX MAP ──
    // key → index for fast lookup
    const keyToIdx = {};
    CLUSTERS.forEach((cl, i) => { keyToIdx[cl.key] = i; });

    // ── CLUSTER ACTIVITY + OFFSETS ──
    const act = [];
    let off = 0;
    for (let c = 0; c < CLUSTERS.length; c++) {
      const sc = serverClusters[CLUSTERS[c].key];
      const rate = sc ? (sc.spikeCount || 0) / (sc.size || 1) : 0;
      act.push({ rate, offset: off, n: CLUSTERS[c].n });
      off += CLUSTERS[c].n;
    }

    // ── THE 20 PROJECTION PATHWAYS ──
    // Mirrors engine.js projections exactly — real white matter tracts
    // Each entry: [sourceClusterIdx, targetClusterIdx, density, strength]
    // Densities from neuroscience: corticostriatal STRONGEST (10× others)
    // Sources: Herculano-Houzel 2009, PMC white matter taxonomy, Lead-DBS
    const PROJECTIONS = [
      // Cortical output (4)
      [keyToIdx.cortex, keyToIdx.hippocampus, 0.04, 0.4],      // Perforant path
      [keyToIdx.cortex, keyToIdx.amygdala, 0.03, 0.3],         // Ventral visual stream
      [keyToIdx.cortex, keyToIdx.basalGanglia, 0.08, 0.5],     // Corticostriatal — STRONGEST
      [keyToIdx.cortex, keyToIdx.cerebellum, 0.05, 0.3],       // Corticopontocerebellar
      // Hippocampal output (3)
      [keyToIdx.hippocampus, keyToIdx.cortex, 0.04, 0.4],      // Memory consolidation
      [keyToIdx.hippocampus, keyToIdx.amygdala, 0.03, 0.3],    // Recall → emotion
      [keyToIdx.hippocampus, keyToIdx.hypothalamus, 0.03, 0.3], // Fimbria-fornix
      // Amygdala output (4)
      [keyToIdx.amygdala, keyToIdx.cortex, 0.03, 0.3],         // Emotional modulation
      [keyToIdx.amygdala, keyToIdx.hippocampus, 0.04, 0.5],    // Emotional memory encoding
      [keyToIdx.amygdala, keyToIdx.hypothalamus, 0.05, 0.4],   // Stria terminalis
      [keyToIdx.amygdala, keyToIdx.basalGanglia, 0.03, 0.3],   // Ventral amygdalofugal
      // Basal ganglia output (2)
      [keyToIdx.basalGanglia, keyToIdx.cortex, 0.02, 0.2],     // Thalamocortical loop
      [keyToIdx.basalGanglia, keyToIdx.cerebellum, 0.02, 0.2], // Subthalamic → cerebellar
      // Cerebellar output (2)
      [keyToIdx.cerebellum, keyToIdx.cortex, 0.03, 0.2],       // Cerebellothalamocortical
      [keyToIdx.cerebellum, keyToIdx.basalGanglia, 0.03, 0.2], // Cerebellar → BG
      // Hypothalamic output (2)
      [keyToIdx.hypothalamus, keyToIdx.amygdala, 0.05, 0.4],   // Drive → emotion
      [keyToIdx.hypothalamus, keyToIdx.basalGanglia, 0.04, 0.3], // Drive → action
      // Consciousness / corpus callosum (3)
      [keyToIdx.mystery, keyToIdx.cortex, 0.05, 0.3],          // Callosal interhemispheric
      [keyToIdx.mystery, keyToIdx.amygdala, 0.04, 0.3],        // Commissural emotional
      [keyToIdx.mystery, keyToIdx.hippocampus, 0.03, 0.2],     // Hippocampal commissure
    ];

    // ── BUILD OUTGOING MAP ──
    // For each cluster, which clusters does it project TO?
    // Used for fractal branching — after landing in a target, follow its outgoing projections
    const outgoing = CLUSTERS.map(() => []);
    for (const [src, tgt] of PROJECTIONS) {
      outgoing[src].push(tgt);
    }

    // Pick a random neuron index within a cluster
    const randNeuron = (ci) => act[ci].offset + Math.floor(Math.random() * act[ci].n);

    // ── FRACTAL TREE BUILDER ──
    // For each active projection pathway:
    //   1. Pick seed neuron in source cluster (proportional to activity)
    //   2. Connect seed → target neuron (inter-cluster projection)
    //   3. From target neuron, branch WITHIN target cluster (intra-cluster synapses)
    //   4. From those endpoints, follow outgoing projections (depth 2-3)
    //   Each level = deeper branching = fractal tree

    for (const [srcCI, tgtCI, density, strength] of PROJECTIONS) {
      if (this._connN >= MAX_CONN) break;

      const srcRate = act[srcCI].rate;
      const tgtRate = act[tgtCI].rate;

      // ALWAYS show projections — even dormant pathways get visible connections
      // so the fractal anatomy is visible. Active pathways get MORE seeds.
      const activity = (srcRate + tgtRate) * 0.5;
      // Base 3 seeds per pathway + scale up with activity. Real firing rates are ~1-3%.
      // 0.02 × 0.08 × 0.5 × 5000 = 4 extra seeds on top of base 3 = 7 seeds per strong pathway
      const seeds = 3 + Math.round(activity * density * strength * 5000);

      for (let s = 0; s < seeds && this._connN < MAX_CONN; s++) {
        // ── DEPTH 0: Source → Target (inter-cluster projection) ──
        const srcNeuron = randNeuron(srcCI);
        const tgtNeuron = randNeuron(tgtCI);
        this._addConn(srcNeuron, tgtNeuron, CLUSTERS[srcCI].rgb, CLUSTERS[tgtCI].rgb);

        // ── DEPTH 1: Branch within target cluster (intra-cluster synapses) ──
        // Each landing neuron activates 1-3 neighbors via internal synapses
        const branchCount = 1 + Math.floor(Math.random() * Math.min(3, 1 + tgtRate * 10));
        const depth1Neurons = [];

        for (let b = 0; b < branchCount && this._connN < MAX_CONN; b++) {
          const neighbor = randNeuron(tgtCI);
          if (neighbor !== tgtNeuron) {
            this._addConn(tgtNeuron, neighbor, CLUSTERS[tgtCI].rgb, CLUSTERS[tgtCI].rgb);
            depth1Neurons.push(neighbor);
          }
        }

        // ── DEPTH 2: Follow outgoing projections from target cluster ──
        // The signal that landed in target now propagates OUT through its own projections
        // This creates the fractal web — signal chains across the whole brain
        const tgtOutgoing = outgoing[tgtCI];
        if (tgtOutgoing.length === 0 || depth1Neurons.length === 0) continue;

        for (const d1Neuron of depth1Neurons) {
          if (this._connN >= MAX_CONN) break;
          // 80% chance to branch further — make fractal trees deep and visible
          if (Math.random() > 0.8) continue;
          const nextCI = tgtOutgoing[Math.floor(Math.random() * tgtOutgoing.length)];

          const nextNeuron = randNeuron(nextCI);
          this._addConn(d1Neuron, nextNeuron, CLUSTERS[tgtCI].rgb, CLUSTERS[nextCI].rgb);

          // ── DEPTH 3: terminal branch — 60% chance (was 30%) ──
          if (this._connN < MAX_CONN && Math.random() < 0.6) {
            const termNeuron = randNeuron(nextCI);
            if (termNeuron !== nextNeuron) {
              this._addConn(nextNeuron, termNeuron, CLUSTERS[nextCI].rgb, CLUSTERS[nextCI].rgb);
            }
          }
        }
      }
    }

    // ── CONSCIOUSNESS BRIDGES ──
    // Mystery Ψ connects to everything — the corpus callosum binding
    // Extra connections from mystery to ALL clusters, strength modulated by Ψ
    const mysteryIdx = keyToIdx.mystery;
    const mysteryRate = act[mysteryIdx].rate;
    if (mysteryRate > 0) {
      for (let ci = 0; ci < CLUSTERS.length && this._connN < MAX_CONN; ci++) {
        if (ci === mysteryIdx) continue;
        // Ψ-modulated bridge density — consciousness binds more when active
        const bridges = Math.max(1, Math.round(mysteryRate * 30));
        for (let b = 0; b < bridges && this._connN < MAX_CONN; b++) {
          const mNeuron = randNeuron(mysteryIdx);
          const tNeuron = randNeuron(ci);
          this._addConn(mNeuron, tNeuron, CLUSTERS[mysteryIdx].rgb, CLUSTERS[ci].rgb);
        }
      }
    }
  }

  _addConn(ai, bi, colorA, colorB) {
    if (this._connN >= MAX_CONN) return;
    if (ai < 0 || bi < 0 || ai >= TOTAL || bi >= TOTAL) return;
    const vi = this._connN * 6;
    const ci = this._connN * 8;
    this._connPos[vi]   = this._pos[ai*3];
    this._connPos[vi+1] = this._pos[ai*3+1];
    this._connPos[vi+2] = this._pos[ai*3+2];
    this._connPos[vi+3] = this._pos[bi*3];
    this._connPos[vi+4] = this._pos[bi*3+1];
    this._connPos[vi+5] = this._pos[bi*3+2];
    // Alpha — connections clearly visible, slight variation for depth
    const alpha = 0.45 + Math.random() * 0.25;
    this._connCol[ci]   = colorA[0]; this._connCol[ci+1] = colorA[1]; this._connCol[ci+2] = colorA[2]; this._connCol[ci+3] = alpha;
    this._connCol[ci+4] = colorB[0]; this._connCol[ci+5] = colorB[1]; this._connCol[ci+6] = colorB[2]; this._connCol[ci+7] = alpha;
    this._connN++;
  }

  /**
   * Spawn lightning trails along projection pathways based on brain equations.
   * Driven by actual cluster firing rates from server — each tick spawns trails
   * proportional to spike activity. Trails travel source → target then fade.
   */
  _spawnTrailsFromEquations(serverClusters, clusterSpikeCount) {
    const keyToIdx = {};
    CLUSTERS.forEach((cl, i) => { keyToIdx[cl.key] = i; });

    // Cluster offsets for neuron lookup
    const offsets = [];
    let off = 0;
    for (let c = 0; c < CLUSTERS.length; c++) {
      offsets.push(off);
      off += CLUSTERS[c].n;
    }

    // 20 projection pathways — same as connections
    const PROJECTIONS = [
      [keyToIdx.cortex, keyToIdx.hippocampus],
      [keyToIdx.cortex, keyToIdx.amygdala],
      [keyToIdx.cortex, keyToIdx.basalGanglia],
      [keyToIdx.cortex, keyToIdx.cerebellum],
      [keyToIdx.hippocampus, keyToIdx.cortex],
      [keyToIdx.hippocampus, keyToIdx.amygdala],
      [keyToIdx.hippocampus, keyToIdx.hypothalamus],
      [keyToIdx.amygdala, keyToIdx.cortex],
      [keyToIdx.amygdala, keyToIdx.hippocampus],
      [keyToIdx.amygdala, keyToIdx.hypothalamus],
      [keyToIdx.amygdala, keyToIdx.basalGanglia],
      [keyToIdx.basalGanglia, keyToIdx.cortex],
      [keyToIdx.basalGanglia, keyToIdx.cerebellum],
      [keyToIdx.cerebellum, keyToIdx.cortex],
      [keyToIdx.cerebellum, keyToIdx.basalGanglia],
      [keyToIdx.hypothalamus, keyToIdx.amygdala],
      [keyToIdx.hypothalamus, keyToIdx.basalGanglia],
      [keyToIdx.mystery, keyToIdx.cortex],
      [keyToIdx.mystery, keyToIdx.amygdala],
      [keyToIdx.mystery, keyToIdx.hippocampus],
    ];

    // For each projection, spawn trails proportional to source activity
    // Active cluster fires → lightning travels down its outgoing tracts
    for (const [srcCI, tgtCI] of PROJECTIONS) {
      if (this._trails.length >= MAX_TRAILS) break;

      const srcSpikes = clusterSpikeCount[srcCI] || 0;
      const srcN = CLUSTERS[srcCI].n;
      // Trail spawn rate = firing rate × projection intensity
      // Biological: 1-3% firing = 10-30 spikes per 1000 neurons
      // 1-2 trails per projection per tick when active
      const trailCount = Math.max(1, Math.round((srcSpikes / Math.max(1, srcN)) * 100));

      for (let t = 0; t < Math.min(trailCount, 3); t++) {
        if (this._trails.length >= MAX_TRAILS) break;

        // Random source neuron in source cluster (biased toward spiking ones)
        const srcIdx = offsets[srcCI] + Math.floor(Math.random() * srcN);
        const tgtIdx = offsets[tgtCI] + Math.floor(Math.random() * CLUSTERS[tgtCI].n);
        if (srcIdx >= TOTAL || tgtIdx >= TOTAL) continue;

        this._trails.push({
          src: [this._pos[srcIdx * 3], this._pos[srcIdx * 3 + 1], this._pos[srcIdx * 3 + 2]],
          tgt: [this._pos[tgtIdx * 3], this._pos[tgtIdx * 3 + 1], this._pos[tgtIdx * 3 + 2]],
          col: [
            (CLUSTERS[srcCI].rgb[0] + CLUSTERS[tgtCI].rgb[0]) * 0.5,
            (CLUSTERS[srcCI].rgb[1] + CLUSTERS[tgtCI].rgb[1]) * 0.5,
            (CLUSTERS[srcCI].rgb[2] + CLUSTERS[tgtCI].rgb[2]) * 0.5,
          ],
          age: 0,
        });
      }
    }

    // Age existing trails, cull dead ones
    for (let i = this._trails.length - 1; i >= 0; i--) {
      this._trails[i].age++;
      if (this._trails[i].age > TRAIL_LIFE) this._trails.splice(i, 1);
    }
  }

  // ── Render loop ─────────────────────────────────────────────────

  _startLoop() {
    if (this._animId) return;
    const tick = () => {
      if (!this._open || this._destroyed) { this._animId = null; return; }
      this._frame();
      this._animId = requestAnimationFrame(tick);
    };
    this._animId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
  }

  _frame() {
    const gl = this._gl;
    if (!gl || gl.isContextLost()) return;

    // Resize
    const cv = this._canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth * dpr | 0;
    const h = cv.clientHeight * dpr | 0;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // MVP
    const proj = m4Persp(Math.PI / 4, w / h, 0.1, 100);
    let view = m4Ident();
    view = m4Trans(view, 0, 0, -this._zoom);
    view = m4RotX(view, this._rotX);
    view = m4RotY(view, this._rotY);
    const mvp = m4Mul(proj, view);

    if (!this._dragging) this._rotY += AUTO_ROT_SPEED;

    const sc = Math.min(w, h) / 480;

    // 1) Lines (static connection anatomy)
    this._drawLines(gl, mvp);
    // 2) Lightning trails (firing activity along projection pathways)
    this._drawTrails(gl, mvp);
    // 3) Neurons
    this._drawNeurons(gl, mvp, sc);
    // 4) Pulses (activation rings)
    this._drawPulses(gl, mvp, sc);
    // 4) Labels
    this._projectLabels(mvp, cv);
    // 5) Notifications — float up and fade
    this._updateNotifications(mvp, cv);
    // 6) Expansion display
    const expEl = this._overlay?.querySelector('.b3d-exp-val');
    if (expEl) expEl.textContent = this._expansionFactor.toFixed(2) + 'x';
  }

  _drawNeurons(gl, mvp, sc) {
    const p = this._neuronProg;
    gl.useProgram(p);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uMVP'), false, mvp);
    gl.uniform1f(gl.getUniformLocation(p, 'uScale'), sc);

    // Cortical microstructure overlay toggles. Default OFF — base
    // cluster colors render unchanged. Toggling these via setters
    // (setShowLayers / setShowHubs / setShowColumns) flips the
    // matching shader path on without recompiling.
    gl.uniform1f(gl.getUniformLocation(p, 'uShowLayers'),  this._showLayers  ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(p, 'uShowHubs'),    this._showHubs    ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(p, 'uShowColumns'), this._showColumns ? 1 : 0);
    // Layer color palette — perceptually-distinct hues for L1..L6 so
    // the layer-color overlay renders the cortical lamination as a
    // visible structure. Order matches Felleman & Van Essen 1991:
    //   L1   = light pink  (molecular layer)
    //   L2/3 = orange      (external pyramidal)
    //   L4   = yellow      (granular)
    //   L5   = green       (internal pyramidal)
    //   L6   = blue        (multiform)
    const palette = new Float32Array([
      1.00, 0.71, 0.85,
      1.00, 0.55, 0.20,
      1.00, 0.92, 0.30,
      0.40, 0.85, 0.45,
      0.30, 0.55, 1.00,
    ]);
    gl.uniform3fv(gl.getUniformLocation(p, 'uLayerColor[0]'), palette);

    this._bindAttr(gl, p, 'aPos',  this._bPos,  3, false);
    this._bindAttr(gl, p, 'aCol',  this._bCol,  3, false);
    // Static cortical-microstructure attributes — uploaded once in
    // _uploadStatic. Bind directly to attribute locations.
    if (this._layer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bLayer);
      const layerL = gl.getAttribLocation(p, 'aLayer');
      if (layerL >= 0) {
        gl.enableVertexAttribArray(layerL);
        gl.vertexAttribPointer(layerL, 1, gl.FLOAT, false, 0, 0);
      }
    }
    if (this._hub) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bHub);
      const hubL = gl.getAttribLocation(p, 'aHub');
      if (hubL >= 0) {
        gl.enableVertexAttribArray(hubL);
        gl.vertexAttribPointer(hubL, 1, gl.FLOAT, false, 0, 0);
      }
    }
    if (this._columnId) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bColumnId);
      const colIdL = gl.getAttribLocation(p, 'aColumnId');
      if (colIdL >= 0) {
        gl.enableVertexAttribArray(colIdL);
        gl.vertexAttribPointer(colIdL, 1, gl.FLOAT, false, 0, 0);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this._bGlow);
    gl.bufferData(gl.ARRAY_BUFFER, this._glow, gl.DYNAMIC_DRAW);
    const gL = gl.getAttribLocation(p, 'aGlow');
    gl.enableVertexAttribArray(gL);
    gl.vertexAttribPointer(gL, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._bVis);
    gl.bufferData(gl.ARRAY_BUFFER, this._vis, gl.DYNAMIC_DRAW);
    const vL = gl.getAttribLocation(p, 'aVis');
    gl.enableVertexAttribArray(vL);
    gl.vertexAttribPointer(vL, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, TOTAL);
  }

  /**
   * Public toggle setters for the cortical microstructure overlays.
   * Used by the dashboard checkboxes (and any other consumer) to flip
   * layer / hub / column visualization on or off without recompiling
   * shaders. Defaults all-off so the normal cluster colors render
   * unchanged until Gee opts into a structural view.
   */
  setShowLayers(on)  { this._showLayers  = !!on; }
  setShowHubs(on)    { this._showHubs    = !!on; }
  setShowColumns(on) { this._showColumns = !!on; }

  _drawLines(gl, mvp) {
    if (!this._connN) return;
    const p = this._lineProg;
    gl.useProgram(p);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uMVP'), false, mvp);
    gl.depthMask(false);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._bLnPos);
    gl.bufferData(gl.ARRAY_BUFFER, this._connPos.subarray(0, this._connN * 6), gl.DYNAMIC_DRAW);
    const posL = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(posL);
    gl.vertexAttribPointer(posL, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._bLnCol);
    gl.bufferData(gl.ARRAY_BUFFER, this._connCol.subarray(0, this._connN * 8), gl.DYNAMIC_DRAW);
    const colL = gl.getAttribLocation(p, 'aCol');
    gl.enableVertexAttribArray(colL);
    gl.vertexAttribPointer(colL, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, this._connN * 2);
    gl.depthMask(true);
  }

  /**
   * Draw lightning trails — fast-moving line segments along projection pathways.
   * Each trail expands from source then converges to target, fading out.
   * Activity-driven: spawned from cluster firing rates (brain equations).
   */
  _drawTrails(gl, mvp) {
    const n = this._trails.length;
    if (!n) return;

    // Build buffers from active trails
    const srcBuf = this._trailSrc;
    const tgtBuf = this._trailTgt;
    const phaseBuf = this._trailPhase;
    const lifeBuf = this._trailLife;
    const colBuf = this._trailCol;

    for (let i = 0; i < n; i++) {
      const tr = this._trails[i];
      const phase = tr.age / TRAIL_LIFE; // 0 → 1
      // Life envelope — fade in quickly, peak mid, fade out
      // Expand phase: 0 → 0.5 grows from nothing
      // Converge phase: 0.5 → 1 converges to nothing
      const expandFade = Math.min(1, phase * 4);       // fade in during first 25%
      const convergeFade = Math.min(1, (1 - phase) * 4); // fade out during last 25%
      const life = Math.min(expandFade, convergeFade);

      // 2 vertices per trail — head (end=0) and tail (end=1)
      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const p6 = i * 6;

      // Both vertices use same src/tgt — offset computed in vertex shader from aEnd
      srcBuf[p6]     = tr.src[0]; srcBuf[p6+1] = tr.src[1]; srcBuf[p6+2] = tr.src[2];
      srcBuf[p6+3]   = tr.src[0]; srcBuf[p6+4] = tr.src[1]; srcBuf[p6+5] = tr.src[2];
      tgtBuf[p6]     = tr.tgt[0]; tgtBuf[p6+1] = tr.tgt[1]; tgtBuf[p6+2] = tr.tgt[2];
      tgtBuf[p6+3]   = tr.tgt[0]; tgtBuf[p6+4] = tr.tgt[1]; tgtBuf[p6+5] = tr.tgt[2];

      phaseBuf[v0] = phase;
      phaseBuf[v1] = phase;
      lifeBuf[v0]  = life;
      lifeBuf[v1]  = life * 0.5; // tail dimmer than head

      colBuf[p6]   = tr.col[0]; colBuf[p6+1] = tr.col[1]; colBuf[p6+2] = tr.col[2];
      colBuf[p6+3] = tr.col[0]; colBuf[p6+4] = tr.col[1]; colBuf[p6+5] = tr.col[2];
    }

    const p = this._trailProg;
    gl.useProgram(p);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uMVP'), false, mvp);
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive blend for glow effect

    const bind = (buf, name, size, data, count) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count), gl.DYNAMIC_DRAW);
      const loc = gl.getAttribLocation(p, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      }
    };

    bind(this._bTSrc,   'aSource', 3, srcBuf,   n * 6);
    bind(this._bTTgt,   'aTarget', 3, tgtBuf,   n * 6);
    bind(this._bTPhase, 'aPhase',  1, phaseBuf, n * 2);
    bind(this._bTEnd,   'aEndFlag',1, this._trailEnd, n * 2);
    bind(this._bTLife,  'aLife',   1, lifeBuf,  n * 2);
    bind(this._bTCol,   'aCol',    3, colBuf,   n * 6);

    // Need aPos too — use source as position (shader computes real pos)
    const posLoc = gl.getAttribLocation(p, 'aPos');
    if (posLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._bTSrc);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    }

    gl.lineWidth(2);
    gl.drawArrays(gl.LINES, 0, n * 2);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // restore default
    gl.depthMask(true);
  }

  _drawPulses(gl, mvp, sc) {
    // Age + cull
    for (let i = this._pulses.length - 1; i >= 0; i--) {
      if (++this._pulses[i].age > PULSE_LIFE) this._pulses.splice(i, 1);
    }
    const n = this._pulses.length;
    if (!n) return;

    const posA = new Float32Array(n * 3);
    const lifeA = new Float32Array(n);
    const colA = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = this._pulses[i];
      posA[i*3] = p.x; posA[i*3+1] = p.y; posA[i*3+2] = p.z;
      lifeA[i] = 1 - p.age / PULSE_LIFE;
      colA[i*3] = p.col[0]; colA[i*3+1] = p.col[1]; colA[i*3+2] = p.col[2];
    }

    const pr = this._pulseProg;
    gl.useProgram(pr);
    gl.uniformMatrix4fv(gl.getUniformLocation(pr, 'uMVP'), false, mvp);
    gl.uniform1f(gl.getUniformLocation(pr, 'uScale'), sc * 2.5);
    gl.depthMask(false);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._bPPos);
    gl.bufferData(gl.ARRAY_BUFFER, posA, gl.DYNAMIC_DRAW);
    const posL = gl.getAttribLocation(pr, 'aPos');
    gl.enableVertexAttribArray(posL);
    gl.vertexAttribPointer(posL, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._bPLife);
    gl.bufferData(gl.ARRAY_BUFFER, lifeA, gl.DYNAMIC_DRAW);
    const lL = gl.getAttribLocation(pr, 'aLife');
    gl.enableVertexAttribArray(lL);
    gl.vertexAttribPointer(lL, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._bPCol);
    gl.bufferData(gl.ARRAY_BUFFER, colA, gl.DYNAMIC_DRAW);
    const cL = gl.getAttribLocation(pr, 'aCol');
    gl.enableVertexAttribArray(cL);
    gl.vertexAttribPointer(cL, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true);
  }

  _bindAttr(gl, prog, name, buf, size, dynamic) {
    const loc = gl.getAttribLocation(prog, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  _projectLabels(mvp, cv) {
    const rect = cv.getBoundingClientRect();
    for (let i = 0; i < CLUSTERS.length; i++) {
      const el = this._labelEls[i];
      if (!this._clusterOn[i]) { el.style.opacity = '0'; continue; }
      const c = this._centers[i];
      const clip = m4Project(mvp, [c[0], c[1], c[2], 1]);
      if (clip[3] <= 0) { el.style.opacity = '0'; continue; }
      const sx = (clip[0] / clip[3] * 0.5 + 0.5) * rect.width;
      const sy = (1 - (clip[1] / clip[3] * 0.5 + 0.5)) * rect.height;
      if (sx < 30 || sx > rect.width - 30 || sy < 20 || sy > rect.height - 20) {
        el.style.opacity = '0';
      } else {
        el.style.left = sx + 'px';
        el.style.top = sy + 'px';
        el.style.opacity = '0.65';
      }
    }
  }
}
