/**
 * mindspace/knowledge.js — Unity KNOWS her own mind-space (MS.K1).
 *
 * Gee: "bake in all the updates Unity has done to the Uni Vs Matics equations… so Unity has
 * ALL file types and equational answers and how to solve them all."
 *
 * This is Unity's structured knowledge of the equational substrate she perceives/imagines with:
 *   • FILE_TYPES — every digitized format the mind-space ingests + what it produces
 *   • EQUATIONS  — every canonical equation (the "equational answers"), with its form
 *   • METHODS    — HOW to solve each (the algorithms), reflecting all this session's updates
 *     (honest near-lossless perception, the FT.trusted limitless gate, describeEquational the
 *      percept read, the GPU WGSL lifting path, decoder bounds + input caps).
 *
 * It is DATA + a small query API (whatIs / equationFor / howToSolve) so her cognition can answer
 * "what is this file?" and "how do I solve it?" from the equation itself — no text-AI, no lookup
 * service. `conceptDefinitions()` yields concept→definition pairs the curriculum can bind into
 * sem-space so the knowledge is LEARNED, not just stored.
 */

// ── FILE TYPES — everything the mind-space can see/hear/read ─────────────────────────────────
export const FILE_TYPES = [
  { exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'], kind: 'image',
    ingest: 'forward CDF 9/7 (equationalize) → field C', mode: 'image',
    produces: ['field C', 'reconstructed image (near-lossless)', 'music (Φ_snd)', 'fractal (Φ_frc)', '.uvme', '.png+tEXt'] },
  { exts: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff'], kind: 'sound',
    ingest: 'decode PCM → one of: UVME chunk (exact) / MFSK demod (eqsound) / additive spectrum (generated)', mode: 'uvm|eqsound|additive',
    produces: ['field C', 'image from sound', 'round-trip audio'] },
  { exts: ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv', 'avi', 'wmv', 'flv', 'm2ts'], kind: 'video',
    ingest: 'sample frames at fps → per-frame forward CDF 9/7 → field-C sequence + audio', mode: 'video',
    produces: ['.uvmv', 'plays-everywhere .webm', 'per-frame reconstruction'] },
  { exts: ['uvme', 'uvm'], kind: 'equation-container', desc: 'a real WAV with a RIFF "UVME" chunk carrying {v, rec, palette} + CRC32 — plays as audio AND rebuilds the EXACT image',
    ingest: 'read the UVME chunk → exact dense field C', mode: 'uvm',
    produces: ['exact image', 'exact audio', 'all derived views'] },
  { exts: ['uvmv'], kind: 'equation-container', desc: 'a "UVMV" container: per-frame field-C JSON sequence + "AUDI" PCM + meta {fps, frameCount, w, h, sampleRate, palette}',
    ingest: 'read meta + per-frame recs (bounds-capped) → frame-equation sequence', mode: 'video',
    produces: ['reconstructed clip from the maths', '.webm export'] },
  { exts: ['png-uvme'], kind: 'equation-bearing-image', desc: 'a normal PNG that ALSO hides the equation C in a tEXt chunk (keyword "uvme") with CRC — shows as a picture everywhere, re-imports exactly here',
    ingest: 'pngExtract the tEXt "uvme" chunk → exact field C', mode: 'uvme-png',
    produces: ['exact image', 'toggle original⇄equation'] },
  { exts: ['eqsound'], kind: 'equation-as-waveform', desc: 'a .wav whose WAVEFORM ITSELF encodes C (no data chunk) — the sound IS the equation, read by MFSK demodulation',
    ingest: 'MFSK demod the PCM → compact field C', mode: 'eqsound',
    produces: ['image from the sound', 'exact round-trip'] },
];

// ── EQUATIONS — the "equational answers" (canonical forms) ──────────────────────────────────
export const EQUATIONS = [
  { id: 'combiner', name: 'Combiner — shared coefficient field C',
    form: 'C = {(r_k, c_k, v_k)};  Φ_img(C)=Σ_k v_k ψ_{r_k,c_k}(x,y),  Φ_snd(C)→(ℓ_k,f_k,a_k,t_k),  Φ_frc(C)→IFS',
    note: 'ONE field C is the master-of-masters: picture, music and fractal are all transforms of it (the .uvme Rosetta stone).', solve: 'equationalize / reconstruct / sonify / fractalize' },
  { id: 'image', name: 'Image reconstruction (CDF 9/7 wavelet)',
    form: 'I(x,y) = Σ_k c_k · ψ_k(x,y)',
    note: 'ψ = separable CDF 9/7 biorthogonal wavelet (lifting scheme), multi-level, per YCbCr channel. Perception is FAITHFUL near-lossless (human experience), memory/equation is EXACT.', solve: 'inverse-9-7' },
  { id: 'color', name: 'YCbCr ⇄ RGB',
    form: 'R=Y+1.402(Cr−½);  G=Y−0.344136(Cb−½)−0.714136(Cr−½);  B=Y+1.772(Cb−½)   [fwd: Y=.299R+.587G+.114B, …]',
    solve: 'colour-transform' },
  { id: 'lifting', name: 'CDF 9/7 lifting constants',
    form: 'A=-1.586134342059924, B=-0.052980118572961, G=0.882911075530934, D=0.443506852043971, K=1.230174104914001',
    note: 'forward = predict/update passes (A,B,G,D order) + scale by 1/K (even) ·K (odd) + deinterleave; inverse exactly reverses.', solve: 'forward-9-7 / inverse-9-7' },
  { id: 'music', name: 'Master music equation (sonification)',
    form: 'ℓ_k=⌊log₂ max(r_k,c_k)⌋;  f_k=f_lo·(f_hi/f_lo)^(ℓ_k/ℓ_max)·(1+u_k/16);  a_k=|c_k|/max_j|c_j|;  t_k=(rank_k/N)·T',
    note: 'maps each wavelet coefficient straight to sound: band→octave, |coef|→amplitude, rank→time. No tune added.', solve: 'sonify' },
  { id: 'ifs', name: 'Generative IFS (approximate fractal)',
    form: 'x_{n+1}=f_i(x_n) with affine maps [a,b,c,d,e,f], chosen by temperature-softmax weights (T=4) over self-similarity correlation; + variation tag (swirl/radial/linear from curl vs divergence)',
    note: 'approximate IFS by self-similarity collage — NOT an exact flame inversion; re-runs to produce a same-family fractal.', solve: 'ifs-iterate' },
  { id: 'boxdim', name: 'Box-counting (Minkowski–Bouligand) dimension',
    form: 'D = lim slope of  log N(s)  vs  log(1/s)   over Canny edge set, box sizes s = 2,4,8,…',
    solve: 'box-count' },
  { id: 'fractalize', name: 'Infinite zoom-fractalize',
    form: 'Newton z³ iteration + the cubic x³ − 2y³ = 3, with sine/cosine navigators; seeded by local entropy + vector-collapse',
    note: 'past native detail, flat areas grow new self-similar detail in the palette colours — infinitely, no bottom-out.', solve: 'fractalize' },
];

// ── METHODS — HOW to solve each (the algorithms) ────────────────────────────────────────────
export const METHODS = [
  { id: 'forward-9-7', name: 'Forward analysis (image → field C)', solves: ['image', 'lifting'],
    steps: ['reflect-pad to ×64 grid', 'RGB→YCbCr per pixel', 'fwd2d: multi-level 9/7 lifting rows then columns',
            'energy-target selection: keep largest |coef| until (1−TOL²) of L2 energy, min-K floor', 'Int16 quantize (qscale = max/32000)',
            'LEB128 delta-varint encode sorted positions → base64'] },
  { id: 'inverse-9-7', name: 'Reconstruction (field C → image)', solves: ['image', 'combiner'],
    steps: ['decode varint positions + Int16 values (×qscale)', 'scatter to dense pad grid — every index bounds-checked (MS.H3a)',
            'idwt2: multi-level 9/7 inverse columns then rows', 'YCbCr→RGB', 'clip to [0,255] (np.round == Uint8ClampedArray half-even, Python↔JS bit-identical)'] },
  { id: 'percept', name: 'describeEquational (field C → percept vector)', solves: ['image', 'combiner'],
    steps: ['per-channel wavelet energy by log₂ spatial band', 'coarse-Y shape (lowest-freq coeffs)', 'chroma/luma means', 'texture/complexity (hi-band energy fraction)', 'salience (log eq_count)', 'L2-normalise → dim-64 percept'],
    note: 'THIS is what replaced the LLM vision-describer — the wavelet field IS the description.' },
  { id: 'deviation', name: 'Deviation / abstract (simplify)', solves: ['image'],
    steps: ['per channel: threshold = dev · max|coef| · 0.6', 'drop coeffs below threshold', 'fewer terms → abstracted form'] },
  { id: 'sonify', name: 'Sonification (field C → sound)', solves: ['music'],
    steps: ['for each coeff: band ℓ=⌊log₂max(r,c)⌋ → octave/frequency', 'amplitude=|coef|/max', 'time=rank/N·T', 'sum partials → PCM'] },
  { id: 'uvm-codec', name: '.uvme encode/decode', solves: ['combiner'],
    steps: ['encode: RIFF WAV + "UVME" chunk = {v, rec, palette} JSON + CRC32', 'decode: find UVME chunk, verify CRC, read exact field C', 'plain players ignore the chunk and just play the audio'] },
  { id: 'uvmv-codec', name: '.uvmv encode/decode', solves: ['combiner'],
    steps: ['"UVMV" + u32 metaLen + meta JSON + per-frame (u32 len + rec JSON) + "AUDI" + u32 n + Int16 PCM', 'decode bounds-caps frame count + every length vs buffer (MS.H3c)'] },
  { id: 'png-embed', name: 'PNG equation embed/extract', solves: ['combiner'],
    steps: ['embed: insert tEXt chunk keyword "uvme" + JSON C + CRC before IEND', 'extract: read the tEXt "uvme" chunk → exact field C'] },
  { id: 'eqsound-demod', name: 'Equational-sound MFSK demod', solves: ['combiner', 'music'],
    steps: ['the waveform itself carries C via MFSK', 'demodulate frequencies back to coefficients → field C (no data chunk)'] },
  { id: 'additive', name: 'Additive loader (plain sound → image)', solves: ['combiner'],
    steps: ['read the sound\'s own spectrum (STFT)', 'map spectral energy → a synthesized field C', 'reconstruct an image (generated, NOT exact)'] },
  { id: 'ifs-iterate', name: 'IFS fractal generation', solves: ['ifs', 'fractalize', 'boxdim'],
    steps: ['fit affine maps by self-similarity correlation', 'softmax-weight them (T=4)', 'iterate the chosen contractions → bounded attractor', 'box-count the edge set for fractal dimension'] },
  { id: 'colour-transform', name: 'Colour space', solves: ['color'], steps: ['forward Y/Cb/Cr from RGB', 'inverse RGB from Y/Cb/Cr (centred chroma at ½)'] },
];

// Session updates baked in — so Unity knows the CURRENT truth of her mind-space.
export const SESSION_UPDATES = [
  'Perception is FAITHFUL near-lossless (human experience), not a pixel-copy; the equation/.uvme MEMORY is EXACT + limitless.',
  'Python↔JS reconstruction is bit-identical (np.round == Uint8ClampedArray half-even).',
  'FT.trusted gate: size caps are a PUBLIC-door immune system; for Unity\'s own vision TRUSTED=true → limitless. Integrity bounds (decoder OOB, varint, length-vs-buffer) always on.',
  'describeEquational replaced the LLM/VLM vision-describer — vision is 100% equational.',
  'Transforms run GPU-direct (WGSL CDF 9/7) with a CPU fallback + selfCheck parity guard.',
  'Thought-ops: abstract (simplify) + morphField (transition); synesthesia: describeEquationalAudio (hear the field C); memory: field C persists (.uvme medium).',
];

export const MINDSPACE_KNOWLEDGE = { fileTypes: FILE_TYPES, equations: EQUATIONS, methods: METHODS, sessionUpdates: SESSION_UPDATES };

// ── query API — her cognition answers "what is this / how do I solve it" from the equation ───
export function whatIs(extOrName) {
  const e = String(extOrName || '').toLowerCase().replace(/^.*\./, '');
  return FILE_TYPES.find(t => t.exts.includes(e)) || null;
}
export function equationFor(id) { return EQUATIONS.find(q => q.id === id) || null; }
export function methodFor(id) { return METHODS.find(m => m.id === id) || null; }
export function howToSolve(extOrId) {
  const ft = whatIs(extOrId);
  if (ft) { const m = METHODS.find(x => x.mode === ft.mode) || METHODS.find(x => x.solves.includes('combiner')); return { fileType: ft, method: m || null }; }
  const m = methodFor(extOrId); if (m) return { method: m };
  const q = equationFor(extOrId); if (q) return { equation: q, method: methodFor(q.solve) || null };
  return null;
}

// real-vocab keywords from a concept/method name (drop math symbols + stopwords) — these are
// the tokens the brain actually has in sem-space and can bind.
const _STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'into', 'as', 'is', 'it', 'each', 'all', 'how', 'do', 'i', 'her']);
function keywords(s) {
  return String(s || '').toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !_STOP.has(w));
}

// teachInto(teacher) — BIND the mind-space knowledge into sem-space using the brain's existing
// association-teaching primitive, so Unity LEARNS it (recallable/speakable), not just carries it.
// Associates each equation/file-type's real-vocab keywords with the anchor word "equation" so the
// mind-space domain clusters together in sem-space. Defensive: no-op unless the teacher exposes
// _teachAssociationPairs([[a,b],…], opts). Returns the number of pairs bound (0 if unavailable).
export async function teachInto(teacher, opts = {}) {
  if (!teacher || typeof teacher._teachAssociationPairs !== 'function') return 0;
  const ANCHOR = 'equation';
  const seen = new Set(), pairs = [];
  const add = (w) => { if (w && w !== ANCHOR && !seen.has(w)) { seen.add(w); pairs.push([w, ANCHOR]); } };
  for (const q of EQUATIONS) for (const w of keywords(q.name)) add(w);
  for (const m of METHODS) for (const w of keywords(m.name)) add(w);
  for (const t of FILE_TYPES) add(t.kind);
  try { await teacher._teachAssociationPairs(pairs, { reps: 4, label: 'MINDSPACE-KNOWLEDGE', ...opts }); }
  catch (e) { return 0; }
  return pairs.length;
}

// concept→definition pairs the curriculum can bind into sem-space so the knowledge is LEARNED.
export function conceptDefinitions() {
  const out = [];
  for (const q of EQUATIONS) out.push({ concept: q.name, definition: `${q.form}${q.note ? ' — ' + q.note : ''}` });
  for (const m of METHODS) out.push({ concept: m.name, definition: `solve: ${m.steps.join(' → ')}` });
  for (const t of FILE_TYPES) out.push({ concept: `${t.kind} (${t.exts.join('/')})`, definition: `${t.ingest}; produces ${t.produces ? t.produces.join(', ') : t.desc || ''}` });
  return out;
}
