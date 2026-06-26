/**
 * visual-cortex.js — V1→V2→V4→IT visual processing pipeline
 *
 * Processes webcam frames through a neural hierarchy:
 *   V1: Edge detection via oriented receptive fields (Hubel & Wiesel)
 *   V2: Texture/pattern — groups V1 responses
 *   V4: Color — extracts dominant colors
 *   IT: Object recognition — calls AI for high-level description (LAST step)
 *
 * The salience map drives saccade generation — gaze goes where edges are strongest.
 * AI is only called for IT-level recognition, not for basic vision.
 */

// Frame resolution bumped from 20×15 (300 px) to 60×45 (2700 px).
// The old grid was so coarse that a face at webcam distance was only
// ~4-8 pixels wide, smaller than most background edges (window frames,
// door lines, posters, keyboards). Edge detection consistently picked
// high-contrast background junk over the user's face, so the gaze
// pointer bugged out off to the side.
// 60×45 gives face-level detail (~15-25px wide for a typical webcam
// framing) while staying cheap: 9× the V1 ops still runs <1ms per frame.
// MS.I3 — the mind-space thought medium. Imagination is vision without a camera: the same
// equational substrate (consciousness + imaging + imagining are ONE process). describeEquational
// reads a percept out of a field C; morphField/abstract are the thought-ops she runs ON it.
import { describeEquational, describeEquationalAudio, morphField, abstract } from './mindspace/transform.js';

const FRAME_W = 60;
const FRAME_H = 45;
const V1_ORIENTATIONS = 4; // 0°, 45°, 90°, 135°
const V1_COUNT = FRAME_W * FRAME_H; // 2700 V1 neurons (one per pixel)

// Center Gaussian prior — σ controls how tightly gaze favors the
// frame center. σ = frame_width / 3 means edges at the center are
// weighted ~2-3× more strongly than edges at the corners. Webcam
// users are almost always center-framed, so this cheap prior makes
// the attention system land on them unless a background edge is
// DRAMATICALLY stronger than anything near center.
const CENTER_PRIOR_SIGMA_X = FRAME_W / 3;
const CENTER_PRIOR_SIGMA_Y = FRAME_H / 3;

// Gabor-like kernels for oriented edge detection (3x3)
const EDGE_KERNELS = [
  // 0° horizontal
  [-1, -1, -1, 0, 0, 0, 1, 1, 1],
  // 45° diagonal
  [-1, -1, 0, -1, 0, 1, 0, 1, 1],
  // 90° vertical
  [-1, 0, 1, -1, 0, 1, -1, 0, 1],
  // 135° diagonal
  [0, -1, -1, 1, 0, -1, 1, 1, 0],
];

export class VisualCortex {
  constructor() {
    // T14.10 (2026-04-14) — letter-template cache. Each unique character
    // passed through `renderLetterTemplate` gets a deterministic
    // Float64Array pseudo-visual-template computed from its unicode
    // codepoint via a stable trig hash. Text-only Unity uses this as
    // a synthetic "visual" signature per letter so the cortex visual
    // region develops distinct activation basins per character during
    // T14.5 curriculum exposure. Voice/camera Unity will eventually
    // replace this with real bitmap rendering from canvas, but the
    // cache interface and the downstream cluster.readText contract
    // stay the same — just the template source changes. Templates are
    // L2-normalized so injection strength is consistent regardless of
    // which letter is being read.
    this._letterTemplateCache = new Map();
    this._letterTemplateDim = 48;  // dim matches the cortex visual region's typical readout

    // Frame buffers
    this._prevFrame = new Float32Array(FRAME_W * FRAME_H);
    this._currentFrame = new Float32Array(FRAME_W * FRAME_H);

    // V1: edge responses per orientation per pixel
    this.v1Responses = new Float32Array(V1_COUNT * V1_ORIENTATIONS);

    // Salience map — combined edge strength per pixel
    this.salienceMap = new Float32Array(V1_COUNT);

    // V4: dominant colors (RGB averages for quadrants)
    this.colors = { tl: [0, 0, 0], tr: [0, 0, 0], bl: [0, 0, 0], br: [0, 0, 0] };

    // IT: high-level perception — EQUATIONAL, not text-AI (MS.I2). The IT level used to
    // call an LLM/VLM to produce a text description; it now runs the equational mind-space
    // (Uni Vs Matics CDF 9/7) over the frame and yields a deterministic PERCEPT VECTOR — the
    // wavelet field IS the percept. No text model anywhere in the cognition path.
    this.description = '';        // short NON-LLM equational tag, for display only (never fed to cognition)
    this.perceptVector = null;    // Float32Array(64) — the equational VISUAL percept (→ visual region)
    this.audioPercept = null;     // MS.I5 — Float32Array(32) — the SAME field C heard (→ auditory region, synesthesia)
    this._lastRec = null;         // the field C of the last perceived frame (for memory / synesthesia)
    this._recentRecs = [];        // MS.I3 — ring of recent field-Cs she can imagine FROM (cap 8)
    this._lastDescribeTime = 0;
    this._describeInterval = Infinity; // Don't auto-perceive — only on demand or first frame
    this._hasDescribedOnce = false; // first look on boot
    this._mindSpace = null;       // MindSpaceGPU — set via setMindSpace(); the equational vision substrate
    this._describing = false;     // re-entrancy guard for the async perceive
    // Subscribers notified whenever a fresh percept lands. They now receive the EQUATIONAL
    // percept { vector, rec }, NOT an LLM text string.
    this._describeSubscribers = [];

    // Gaze — determined by salience map peak
    this.gazeX = 0.5;
    this.gazeY = 0.5;
    this.gazeTarget = '';

    // Canvas for frame capture
    this._canvas = null;
    this._ctx = null;
    this._video = null;
    this._active = false;

    // Motion energy — how much the scene is changing
    this.motionEnergy = 0;

    // Per-pixel motion map (frame-to-frame absolute brightness delta).
    // Feeds into the effective-salience computation so moving regions
    // dominate over static background edges. Whoever is actually talking
    // to Unity is the thing that's moving — she should look at them.
    this._motionMap = new Float32Array(V1_COUNT);

    // T14.25 — EMA-smoothed motion map. Raw _motionMap is per-frame
    // noise-prone (compression artifacts, camera grain, brief lighting
    // flicker). EMA(0.4) cleans it without dragging the response to
    // real movement (half-life ~2 frames at 60fps). Used by the face-
    // tracking saccade centroid instead of raw _motionMap.
    this._motionMapEMA = new Float32Array(V1_COUNT);

    // T14.25 — skin-tone map for face tracking. HSV-based heuristic:
    // a pixel scores 1.0 when its RGB falls inside the human skin HSV
    // box, 0 otherwise. Not ML, not perfect, but robust enough to
    // bias the saccade centroid toward the user's face+hands instead
    // of a high-contrast background edge.
    this._skinMap = new Float32Array(V1_COUNT);

    // Top-down attention gate driven by brain state (set from the engine
    // via setAttentionState). When arousal is high AND the user recently
    // spoke, Unity's gaze clamps toward the center of the frame where the
    // user is most likely to be. When idle (low arousal, no recent input),
    // gaze free-roams the salience map.
    this._attentionLock = 0.0; // 0 = free-roam, 1 = center-locked
  }

  /**
   * Called by the engine each step with current brain state so the
   * visual cortex can apply top-down attention to gaze.
   *
   * @param {object} state
   * @param {number} state.arousal — amygdala arousal (0-1)
   * @param {number} state.secondsSinceInput — wall-clock seconds since
   *    the last user input arrived. Under 10s = user is actively
   *    talking to Unity; above = idle.
   */
  setAttentionState({ arousal = 0.5, secondsSinceInput = 9999 } = {}) {
    // Center-lock scales with arousal × recency. Unity pays attention to
    // whoever is talking to her. If nobody's around she wanders.
    const recency = Math.max(0, Math.min(1, 1 - secondsSinceInput / 10));
    this._attentionLock = Math.max(0, Math.min(1, arousal * 0.8 + recency * 0.6 - 0.3));
  }

  /**
   * R7 — unified sensory peripheral interface.
   *
   * All sensory peripherals expose the same contract:
   *   init(stream, opts)  — attach to raw input stream
   *   step(dt) / process(dt) / processFrame()
   *                        — one tick of processing, returns
   *                          { currents, metadata } for cortex injection
   *   destroy()           — clean shutdown, free resources
   *
   * Visual cortex takes a video element (from getUserMedia stream
   * already attached to an HTMLVideoElement). It allocates a small
   * backing canvas for frame capture and sets _active=true so
   * processFrame() starts producing real readings instead of zeros.
   */
  init(videoElement) {
    this._video = videoElement;
    this._canvas = document.createElement('canvas');
    this._canvas.width = FRAME_W;
    this._canvas.height = FRAME_H;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
    this._active = true;
  }

  /**
   * R7 — unified destroy hook. Releases the canvas context and
   * drops the video ref so the backing resources can be GC'd.
   * Safe to call multiple times.
   */
  destroy() {
    this._active = false;
    this._video = null;
    this._ctx = null;
    this._canvas = null;
    this._mindSpace = null;
    this.perceptVector = null;
    this._lastRec = null;
    this._describing = false;
  }

  /**
   * MS.I2 — install the equational mind-space (a MindSpaceGPU instance) as the IT-level
   * perceiver. This REPLACES the old LLM/VLM describer: the cortex now SEES by transforming
   * the frame to its CDF 9/7 field C and reading the percept vector out of it — no text model.
   */
  setMindSpace(mindSpace) {
    this._mindSpace = mindSpace;
  }

  /**
   * Process one frame through V1→V2→V4→IT pipeline.
   * Returns neural currents for the cortex visual region.
   *
   * @returns {{ currents: Float32Array, salience: number, gaze: {x,y}, colors: object }}
   */
  processFrame() {
    if (!this._active || !this._video || !this._ctx) {
      return { currents: new Float32Array(100), salience: 0, gaze: { x: 0.5, y: 0.5 }, colors: this.colors };
    }

    // Capture frame
    this._ctx.drawImage(this._video, 0, 0, FRAME_W, FRAME_H);
    const imageData = this._ctx.getImageData(0, 0, FRAME_W, FRAME_H);
    const pixels = imageData.data;

    // Convert to grayscale brightness
    this._prevFrame.set(this._currentFrame);
    for (let i = 0; i < FRAME_W * FRAME_H; i++) {
      const pi = i * 4;
      this._currentFrame[i] = (pixels[pi] + pixels[pi + 1] + pixels[pi + 2]) / (3 * 255);
    }

    // ── V1: Edge Detection ──
    this._computeV1();

    // ── V2: Texture grouping (simplified — sum V1 in local regions) ──
    // Implicit in the salience map

    // ── V4: Color extraction ──
    this._extractColors(pixels);

    // ── Motion detection ──
    this._computeMotion();

    // ── T14.25: Skin-tone map for face tracking ──
    this._computeSkinMap(pixels);

    // ── Salience + motion + skin → Face-tracking Gaze ──
    this._computeGaze();

    // ── IT: Object recognition (periodic AI call) ──
    this._maybeDescribe();

    // Generate neural currents for cortex visual area (neurons 50-149)
    // Map salience + motion to current values
    const currents = new Float32Array(100); // 100 visual cortex neurons
    for (let i = 0; i < 100; i++) {
      const mapIdx = Math.floor(i / 100 * V1_COUNT);
      currents[i] = this.salienceMap[mapIdx] * 15 + // edge strength
                     (this._currentFrame[mapIdx] || 0) * 5; // brightness
    }
    // MS.I2 — fold the EQUATIONAL percept (the IT-level field-C readout) into the visual
    // currents. The wavelet percept vector IS what she sees at the high level; spreading it
    // across the visual neurons drives the region with equational CONTENT, not just edge/brightness.
    // perceptVector is L2-normalised (~0.x); ×30 brings it into range with the salience currents.
    if (this.perceptVector) {
      const pv = this.perceptVector, n = pv.length;
      for (let i = 0; i < 100; i++) currents[i] += pv[i % n] * 30;
    }

    return {
      currents,
      salience: this.motionEnergy + this._maxSalience(),
      gaze: { x: this.gazeX, y: this.gazeY },
      colors: this.colors,
      description: this.description,
    };
  }

  // ── V1: Oriented edge detection ──────────────────────────────

  _computeV1() {
    for (let y = 1; y < FRAME_H - 1; y++) {
      for (let x = 1; x < FRAME_W - 1; x++) {
        const pixIdx = y * FRAME_W + x;

        for (let ori = 0; ori < V1_ORIENTATIONS; ori++) {
          const kernel = EDGE_KERNELS[ori];
          let response = 0;

          // Convolve 3x3 kernel
          let ki = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const ni = (y + ky) * FRAME_W + (x + kx);
              response += this._currentFrame[ni] * kernel[ki];
              ki++;
            }
          }

          this.v1Responses[pixIdx * V1_ORIENTATIONS + ori] = Math.abs(response);
        }

        // Salience = max edge response across orientations
        let maxResp = 0;
        for (let ori = 0; ori < V1_ORIENTATIONS; ori++) {
          maxResp = Math.max(maxResp, this.v1Responses[pixIdx * V1_ORIENTATIONS + ori]);
        }
        this.salienceMap[pixIdx] = maxResp;
      }
    }
  }

  // ── V4: Color extraction ─────────────────────────────────────

  _extractColors(pixels) {
    const qw = Math.floor(FRAME_W / 2);
    const qh = Math.floor(FRAME_H / 2);
    const quads = [
      { key: 'tl', x0: 0, y0: 0, x1: qw, y1: qh },
      { key: 'tr', x0: qw, y0: 0, x1: FRAME_W, y1: qh },
      { key: 'bl', x0: 0, y0: qh, x1: qw, y1: FRAME_H },
      { key: 'br', x0: qw, y0: qh, x1: FRAME_W, y1: FRAME_H },
    ];

    for (const q of quads) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let y = q.y0; y < q.y1; y++) {
        for (let x = q.x0; x < q.x1; x++) {
          const pi = (y * FRAME_W + x) * 4;
          r += pixels[pi]; g += pixels[pi + 1]; b += pixels[pi + 2];
          count++;
        }
      }
      this.colors[q.key] = [
        Math.floor(r / count),
        Math.floor(g / count),
        Math.floor(b / count),
      ];
    }
  }

  // ── Motion detection ─────────────────────────────────────────
  //
  // Per-pixel motion map + scalar total motion energy. The per-pixel
  // map feeds _computeGaze so the attention peak is pulled toward
  // moving regions (the user talking) instead of static background
  // edges (window frames, posters, the wall behind you).

  _computeMotion() {
    let totalDiff = 0;
    for (let i = 0; i < V1_COUNT; i++) {
      const delta = Math.abs(this._currentFrame[i] - this._prevFrame[i]);
      this._motionMap[i] = delta;
      // T14.25 — EMA smoothing so a single-frame lighting flicker
      // doesn't spike the saccade. α=0.4 gives half-life ~1.5 frames,
      // smooth enough to kill noise but fast enough to track real
      // head/hand movement without visible lag.
      this._motionMapEMA[i] = this._motionMapEMA[i] * 0.6 + delta * 0.4;
      totalDiff += delta;
    }
    this.motionEnergy = totalDiff / V1_COUNT;
  }

  // ── T14.25: Skin-tone map (HSV-based face detection heuristic) ───
  //
  // Per-pixel binary skin mask via RGB→HSV conversion and a human-skin
  // HSV box (H in [0°, 50°] OR [340°, 360°], S in [0.2, 0.7], V in
  // [0.35, 0.95]). Covers pale to dark skin tones while rejecting blue
  // walls, green plants, red shirts, saturated posters. Not ML, not
  // perfect, but robust enough to bias the saccade centroid toward the
  // user's face+hands instead of a high-contrast background edge.
  //
  // This is the "face" half of the operator's "track my face and motion"
  // directive — skinMap marks skin pixels, motionMap marks moving
  // pixels, their product is face-AND-motion likelihood, which is
  // what the saccade centroid integrates over.
  //
  _computeSkinMap(pixels) {
    for (let i = 0; i < V1_COUNT; i++) {
      const pi = i * 4;
      const r = pixels[pi] / 255;
      const g = pixels[pi + 1] / 255;
      const b = pixels[pi + 2] / 255;

      // RGB → HSV (fast, no allocations)
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const v = max;
      const s = max === 0 ? 0 : (max - min) / max;
      let h = 0;
      if (max !== min) {
        const d = max - min;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = ((b - r) / d + 2);
        else h = ((r - g) / d + 4);
        h *= 60; // degrees
      }

      // Human skin HSV box — covers pale to dark
      const hueSkin = (h >= 0 && h <= 50) || (h >= 340 && h <= 360);
      const satSkin = s >= 0.18 && s <= 0.75;
      const valSkin = v >= 0.30 && v <= 0.97;

      this._skinMap[i] = (hueSkin && satSkin && valSkin) ? 1.0 : 0.0;
    }
  }

  // ── T14.25: Face+motion-tracking saccade via weighted centroid ───
  //
  // Gaze lands on the weighted CENTROID of an effective attention map
  // (not the peak — peaks are single noisy pixels and jitter). The
  // effective map is:
  //
  //   face[x,y]   = skin[x,y] × motionSmoothed[x,y]      // face AND moving
  //   clutter[x,y] = edge[x,y] × 0.15                    // mild edge prior
  //   motion[x,y] = motionSmoothed[x,y] × motionGain × 0.5  // raw motion
  //   eff[x,y]    = (face × 3.0 + motion + clutter) × centerPrior(x,y)
  //
  // Weights tuned so a face-on-head (high skin × motion) dominates any
  // pure-motion (hand wave) and any pure-edge (background frame) on
  // typical webcam framing. Face weight 3× because skin×motion is the
  // strongest signal we have without a real face detector.
  //
  // Gaze target = centroid Σ(x,y) × eff(x,y) / Σ eff(x,y), with
  // pursuit lerp at `pursuitRate` so the iris moves smoothly rather
  // than snapping. Micro-saccades add biological jitter.
  //
  // Center Gaussian prior biases middle of frame (webcams are always
  // center-framed). Attention lock (set via setAttentionState from the
  // brain based on arousal + time since user input) sharpens the
  // prior when Unity is actively engaged and relaxes it when she's
  // idle and free to wander.
  //
  // Gaze must track BOTH face and motion. Both signals drive the
  // centroid explicitly — face (skin×motion) AND raw motion, not
  // one or the other.
  //
  _computeGaze() {
    const cx = FRAME_W / 2;
    const cy = FRAME_H / 2;
    const sigX2 = CENTER_PRIOR_SIGMA_X * CENTER_PRIOR_SIGMA_X;
    const sigY2 = CENTER_PRIOR_SIGMA_Y * CENTER_PRIOR_SIGMA_Y;

    // Motion gain scales with total motion energy so static scenes
    // don't amplify noise. At motionEnergy=0: gain~0 (pure edge salience).
    // At motionEnergy=0.03 (subtle head turn): gain~3.
    // At motionEnergy=0.15 (active gesturing): gain~15.
    const motionGain = Math.min(20, this.motionEnergy * 120);

    // Attention-lock amplifies the center prior when active. At lock=0
    // the prior is vanilla Gaussian. At lock=1 it steepens ~4×.
    const lockSharpness = 1 + this._attentionLock * 3;

    // Pass 1 — compute effective attention per pixel, accumulate
    // centroid as Σ(x,y,eff) and total = Σ eff.
    let sumX = 0, sumY = 0, total = 0;
    let maxEff = 0, peakX = cx, peakY = cy;
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const idx = y * FRAME_W + x;
        const edge = this.salienceMap[idx] || 0;
        const motion = this._motionMapEMA[idx] || 0;
        const skin = this._skinMap[idx] || 0;

        // Face signal — skin pixels that are moving. This is the
        // dominant term because it's the strongest face proxy we have.
        const face = skin * motion;

        // Combined effective attention
        let eff = face * 3.0 + motion * motionGain * 0.5 + edge * 0.15;

        // Center Gaussian prior (amplified by attention lock)
        const dx = x - cx;
        const dy = y - cy;
        const centerWeight = Math.exp(
          -((dx * dx) / (2 * sigX2) + (dy * dy) / (2 * sigY2)) * lockSharpness
        );
        eff *= centerWeight;

        if (eff > 1e-6) {
          sumX += x * eff;
          sumY += y * eff;
          total += eff;
        }
        if (eff > maxEff) { maxEff = eff; peakX = x; peakY = y; }
      }
    }

    // Centroid target, with graceful fallback to peak if everything
    // is zero (dead frame, camera not ready, etc.) and center if even
    // the peak is zero.
    let targetX, targetY;
    if (total > 1e-6) {
      targetX = (sumX / total) / FRAME_W;
      targetY = (sumY / total) / FRAME_H;
    } else if (maxEff > 0) {
      targetX = peakX / FRAME_W;
      targetY = peakY / FRAME_H;
    } else {
      targetX = 0.5;
      targetY = 0.5;
    }

    // Smooth pursuit — faster when attention is locked (engaged),
    // slower when free-roaming (idle wandering).
    const pursuitRate = 0.12 + this._attentionLock * 0.15;
    this.gazeX += (targetX - this.gazeX) * pursuitRate;
    this.gazeY += (targetY - this.gazeY) * pursuitRate;

    // Micro-saccades — smaller when locked (fixation), larger when idle.
    const saccadeAmp = 0.012 * (1 - this._attentionLock * 0.6);
    this.gazeX += (Math.random() - 0.5) * saccadeAmp;
    this.gazeY += (Math.random() - 0.5) * saccadeAmp;

    // When attention is strongly locked, clamp gaze to a tighter
    // center window so Unity doesn't wander to a random corner
    // during active conversation.
    if (this._attentionLock > 0.5) {
      const window = 0.3 - (this._attentionLock - 0.5) * 0.2; // 0.3 → 0.2
      const min = 0.5 - window;
      const max = 0.5 + window;
      this.gazeX = Math.max(min, Math.min(max, this.gazeX));
      this.gazeY = Math.max(min, Math.min(max, this.gazeY));
    } else {
      this.gazeX = Math.max(0, Math.min(1, this.gazeX));
      this.gazeY = Math.max(0, Math.min(1, this.gazeY));
    }
  }

  _maxSalience() {
    let max = 0;
    for (let i = 0; i < V1_COUNT; i++) {
      if (this.salienceMap[i] > max) max = this.salienceMap[i];
    }
    return max;
  }

  // ── IT: equational perception (mind-space — NO AI/LLM, LAST step) ─────────────

  /**
   * Force an equational perception NOW. Called by handleInput on visual questions
   * or by the brain when it decides it needs to look.
   */
  forceDescribe() {
    // User-requested look — bypass the 5 min auto limit
    // but still rate limit to 10 seconds between forced looks
    const now = performance.now();
    if (this._hasDescribedOnce && now - this._lastDescribeTime < 10000) return;
    this._lastDescribeTime = 0; // reset to allow _maybeDescribe through
    this._maybeDescribe();
  }

  /**
   * MS.I3 — IMAGINE into the mind-space. Imagination is vision without a camera: she recalls
   * a remembered field C, optionally MORPHS it toward another memory and ABSTRACTS it (the
   * thought-ops), reads the percept out, and that percept drives the visual region exactly like
   * a perceived frame — she SEES what she imagines. Returns the percept vector (Float32Array)
   * or null if she has nothing remembered yet. Pure + deterministic (selection from opts, no RNG).
   *
   * @param {object} opts  { blend?:0..1 morph toward another memory, dream?:0..1 abstract amount, pick?:int }
   */
  imagine(opts = {}) {
    if (!this._recentRecs.length) return null;
    const recs = this._recentRecs;
    const a = recs[recs.length - 1];                 // anchor on the most recent memory
    let imagined = a;
    let blend = Math.max(0, Math.min(1, opts.blend || 0));
    let dream = Math.max(0, Math.min(1, opts.dream || 0));
    // MS.K2 — autonomous proportionality conscience. Capability is limitless, but she only
    // imagines as DEEP as the thought is worth: ask the governor, scale morph/abstract depth to
    // the grant. Low worth / high load → a shallower, cheaper recall; truly worthy → full depth.
    const gov = this._mindSpace && this._mindSpace.governor;
    if (gov) {
      const cost = Math.round(40 + 120 * blend + 80 * dream);
      const grant = gov.allot({ kind: 'imagine', requestedUnits: cost, priority: opts.priority, value: opts.value });
      const f = Math.max(0, Math.min(1, grant.ratio));
      blend *= f; dream *= f;                        // she imagines as deep as it's worth, no deeper
    }
    if (blend > 0 && recs.length > 1) {
      const b = recs[(((opts.pick | 0) % (recs.length - 1)) + (recs.length - 1)) % (recs.length - 1)]; // another memory
      const m = morphField(a, b, blend);             // thought-transition between two equational forms
      if (m) imagined = m;
    }
    if (dream > 0) imagined = abstract(imagined, dream);   // dreaminess = simplify the form
    this._lastRec = imagined;
    this.perceptVector = describeEquational(imagined);
    this.audioPercept = describeEquationalAudio(imagined);   // MS.I5 — imagined imagery has its sound too
    this.description = `imagined · ${(imagined.equation_count || 0).toLocaleString()} terms`;
    for (const cb of this._describeSubscribers) {
      try { cb({ vector: this.perceptVector, rec: imagined, imagined: true }); } catch (err) { /* non-fatal */ }
    }
    return this.perceptVector;
  }

  _maybeDescribe() {
    if (!this._mindSpace || this._describing) return;

    // Only auto-perceive ONCE on boot (first look). After that, only on demand.
    if (this._hasDescribedOnce) {
      // Rate limit: 5 minutes between auto perceptions.
      // forceDescribe from user request bypasses this.
      const now = performance.now();
      if (now - this._lastDescribeTime < 300000) return; // 5 minutes
    }

    this._describing = true;
    this._hasDescribedOnce = true;
    this._lastDescribeTime = performance.now();

    // MS.I2 — capture the frame and PERCEIVE it equationally. The mind-space transforms the
    // pixels to a CDF 9/7 field C (on the GPU when available) and reads a deterministic percept
    // vector out of it. NO LLM, NO text — the wavelet field IS the percept.
    const descCanvas = document.createElement('canvas');
    descCanvas.width = 320;
    descCanvas.height = 240;
    const dCtx = descCanvas.getContext('2d');
    dCtx.drawImage(this._video, 0, 0, 320, 240);
    const imageData = dCtx.getImageData(0, 0, 320, 240);

    Promise.resolve(this._mindSpace.perceive(imageData)).then(rec => {
      if (rec && rec.channels) {
        this._lastRec = rec;                                  // field C — for memory / synesthesia (MS.I5/I6)
        this._recentRecs.push(rec); if (this._recentRecs.length > 8) this._recentRecs.shift();  // MS.I3 memory ring
        this.perceptVector = this._mindSpace.describe(rec);   // Float32Array(64) — the equational percept
        this.audioPercept = describeEquationalAudio(rec);     // MS.I5 — the same field C heard (synesthesia)
        // short NON-LLM tag, display only (never fed to cognition)
        this.description = `equational · ${(rec.equation_count || 0).toLocaleString()} terms · ${rec.width}×${rec.height}`;
        // Notify subscribers with the EQUATIONAL percept { vector, rec } — not an LLM text string.
        for (const cb of this._describeSubscribers) {
          try { cb({ vector: this.perceptVector, rec }); } catch (err) { console.warn('[VisualCortex] percept subscriber error:', err.message); }
        }
      }
      this._describing = false;
    }).catch((err) => {
      // perceive failed (e.g. GPU device lost mid-frame) — keep _hasDescribedOnce so the rate
      // limit engages; the CPU fallback inside MindSpaceGPU should normally prevent this.
      console.warn('[VisualCortex] equational perceive failed:', err && err.message);
      this._describing = false;
    });
  }

  /**
   * T7.2 — subscribe to fresh description events. Callback receives
   * the raw description string every time the describer completes
   * with a non-null result. Used by the language cortex to pull
   * gender tokens out of the scene description.
   */
  onDescribe(cb) {
    if (typeof cb === 'function') this._describeSubscribers.push(cb);
    return () => {
      const i = this._describeSubscribers.indexOf(cb);
      if (i >= 0) this._describeSubscribers.splice(i, 1);
    };
  }

  isActive() { return this._active; }

  /**
   * T14.10 — Render a deterministic visual template for a letter.
   *
   * Text-only Unity doesn't have a camera rendering typed characters,
   * so the visual template has to come from somewhere. This method
   * generates a stable Float64Array pseudo-feature-vector from the
   * letter's unicode codepoint via a trig hash — same input always
   * produces the same template, different letters produce uncorrelated
   * templates (cross-template cosine ~0 for different letters).
   * Templates are L2-normalized so injection strength stays consistent.
   *
   * Called from `cluster.readText(text, { visualCortex })` which drives
   * the cortex visual sub-region with each character's template before
   * injecting the letter one-hot. Over T14.5 curriculum exposure the
   * cortex visual↔letter cross-projection learns that a given template
   * should activate the corresponding letter one-hot — matching how
   * biological visual cortex learns letter identity in early reading.
   *
   * For voice/image Unity this method will eventually be overridden
   * to render a real canvas bitmap of the character and project it
   * through the existing V1 → V4 → IT pipeline, producing a real
   * perceptual template instead of a synthetic hash. The cluster.readText
   * contract and caller call sites stay identical — only this method
   * changes.
   *
   * @param {string} letter — single character
   * @returns {Float64Array} — L2-normalized template of length _letterTemplateDim
   */
  renderLetterTemplate(letter) {
    if (!letter || typeof letter !== 'string' || letter.length === 0) {
      return new Float64Array(this._letterTemplateDim);
    }
    const key = letter.toLowerCase();
    const cached = this._letterTemplateCache.get(key);
    if (cached) return cached;
    const cp = key.codePointAt(0) || 0;
    const out = new Float64Array(this._letterTemplateDim);
    // Trig hash: each dim is sin/cos of a prime-seeded frequency so
    // different codepoints get uncorrelated templates. Primes picked
    // to spread across the [0, 2π] range without harmonic overlap.
    const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
    for (let i = 0; i < this._letterTemplateDim; i++) {
      const p = PRIMES[i % PRIMES.length];
      const phase = (i * 0.17) + 0.31;
      out[i] = Math.sin(cp * 0.7853 * p + phase)
             + Math.cos(cp * 0.4636 * p + phase * 2);
    }
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < out.length; i++) norm += out[i] * out[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    this._letterTemplateCache.set(key, out);
    return out;
  }

  /**
   * T1 2026-04-13 — return the video element this cortex is attached
   * to, so viz panels can render the live feed without keeping a
   * separate handle to the raw MediaStream. Single source of truth:
   * whoever wants to display the camera reads through VisualCortex,
   * and VisualCortex owns the video element lifecycle.
   */
  getVideoElement() { return this._video || null; }

  /**
   * T1 2026-04-13 — return the raw MediaStream if callers need it
   * for something the video element doesn't expose (e.g. stopping
   * individual tracks for mute). Only returns non-null when cortex
   * is actually attached to a stream.
   */
  getStream() { return this._video?.srcObject || null; }

  getState() {
    return {
      gazeX: this.gazeX,
      gazeY: this.gazeY,
      gazeTarget: this.gazeTarget,
      description: this.description,
      motionEnergy: this.motionEnergy,
      colors: this.colors,
      maxSalience: this._maxSalience(),
    };
  }
}
