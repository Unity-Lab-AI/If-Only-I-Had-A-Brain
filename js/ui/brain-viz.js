/**
 * brain-viz.js — Real-time brain equation visualizer
 *
 * Full-screen overlay showing the brain simulation running live:
 * - Neuron firing grid with spike afterglow (persists visually)
 * - Synapse activity heatmap
 * - Module activity bars with live values
 * - Oscillation waveforms (theta/alpha/beta/gamma)
 * - Consciousness Ψ readout
 * - Live equations with current values plugged in
 * - Spike counter and firing rate
 */

// Cluster layout for visualization
const CLUSTER_LAYOUT = [
  { name: 'cortex',       size: 300, cols: 20, color: '#ff4d9a', label: 'CORTEX (300)' },
  { name: 'hippocampus',  size: 200, cols: 20, color: '#a855f7', label: 'HIPPOCAMPUS (200)' },
  { name: 'amygdala',     size: 150, cols: 15, color: '#ef4444', label: 'AMYGDALA (150)' },
  { name: 'basalGanglia', size: 150, cols: 15, color: '#22c55e', label: 'BASAL GANGLIA (150)' },
  { name: 'cerebellum',   size: 100, cols: 10, color: '#00e5ff', label: 'CEREBELLUM (100)' },
  { name: 'hypothalamus', size: 50,  cols: 10, color: '#f59e0b', label: 'HYPOTHALAMUS (50)' },
  { name: 'mystery',      size: 50,  cols: 10, color: '#c084fc', label: 'MYSTERY Ψ (50)' },
];
const TOTAL_NEURONS = 1000;
const AFTERGLOW_FRAMES = 30;

export class BrainVisualizer {
  constructor() {
    this._open = false;
    this._el = null;
    this._animId = null;
    this._lastState = null;
    this._bandHistory = [];         // rolling buffer for band power over time
    this._maxBandHistory = 300;     // ~5 seconds at 60fps
    this._coherenceHistory = [];
    this._spikeGlow = new Float32Array(TOTAL_NEURONS);  // per-neuron afterglow
    this._spikeHistory = [];        // rolling spike count for rate display
    this._maxSpikeHistory = 60;
    this._spikeRateHistory = [];    // longer-term spike rate for the neuron canvas
    this._maxSpikeRateHistory = 300;
    this._frameCount = 0;
    // Smoothed band power (exponential moving average)
    this._smoothBands = { theta: 0, alpha: 0, beta: 0, gamma: 0 };

    // Rolling history for motor, modules, consciousness — shows trends not just instants
    this._motorHistory = []; // array of { channels: [], action: string, confidence: number }
    this._moduleHistory = []; // array of { cortex, hippo, amyg, bg, cereb, hypo }
    this._psiHistory = [];
    this._maxHistory = 200; // ~3 seconds at 60fps/6

    this._build();
  }

  _build() {
    this._el = document.createElement('div');
    this._el.id = 'brain-viz';
    this._el.className = 'brain-viz hidden';
    this._activeTab = 'neurons';
    this._el.innerHTML = `
      <div class="bv-header">
        <span class="bv-title">BRAIN VISUALIZER</span>
        <div class="bv-tabs" id="bv-tabs">
          <button class="bv-tab active" data-tab="neurons">Neurons</button>
          <button class="bv-tab" data-tab="synapses">Synapses</button>
          <button class="bv-tab" data-tab="oscillations">Oscillations</button>
          <button class="bv-tab" data-tab="modules">Modules</button>
          <button class="bv-tab" data-tab="senses">Senses</button>
          <button class="bv-tab" data-tab="consciousness">Ψ Consciousness</button>
          <button class="bv-tab" data-tab="memory">Memory</button>
          <button class="bv-tab" data-tab="motor">Motor</button>
          <button class="bv-tab" data-tab="innervoice">Inner Voice</button>
          <button class="bv-tab" data-tab="clusterwaves">Cluster Waves</button>
        </div>
        <span class="bv-stats" id="bv-stats">spikes: 0</span>
        <button class="bv-close-btn">&times;</button>
      </div>
      <!-- ═══ TAB PANELS ═══ -->
      <div class="bv-panel" data-panel="neurons">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">NEURAL CLUSTERS — <span id="bv-neuron-total">N</span> Rulkov neurons across 7 brain regions</div>
            <div class="bv-equation">x<sub>n+1</sub> = α/(1+x²) + y &nbsp;|&nbsp; <span id="bv-spike-count">0</span> active</div>
            <div style="margin:4px 0;display:flex;gap:6px;flex-wrap:wrap;font-size:9px;">
              <label style="color:#8be9fd;cursor:pointer;"><input type="checkbox" id="bv-n-theta" checked> θ</label>
              <label style="color:#50fa7b;cursor:pointer;"><input type="checkbox" id="bv-n-alpha" checked> α</label>
              <label style="color:#ffb86c;cursor:pointer;"><input type="checkbox" id="bv-n-beta"> β</label>
              <label style="color:#ff79c6;cursor:pointer;"><input type="checkbox" id="bv-n-gamma"> γ</label>
            </div>
            <canvas id="bv-neuron-canvas" width="800" height="500"></canvas>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="synapses">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">SYNAPSE ACTIVITY — Hebbian + STDP + Reward</div>
            <div class="bv-equation">ΔW = η·pre·post &nbsp;|&nbsp; STDP: Δt = t<sub>post</sub> - t<sub>pre</sub> &nbsp;|&nbsp; Reward: ΔW = η·δ·s<sub>i</sub>·s<sub>j</sub></div>
            <canvas id="bv-synapse-canvas" width="600" height="600"></canvas>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="oscillations">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">BAND POWER — Kuramoto oscillators (θ→γ) &nbsp;|&nbsp; coherence: <span id="bv-coherence">0.000</span></div>
            <div class="bv-equation">dθ<sub>i</sub>/dt = ω<sub>i</sub> + Σ K<sub>ij</sub>·sin(θ<sub>j</sub> - θ<sub>i</sub>)</div>
            <canvas id="bv-osc-canvas" width="800" height="400"></canvas>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="modules">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">BRAIN MODULES — real-time state</div>
            <div class="bv-modules" id="bv-modules"></div>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="senses">
        <div class="bv-grid-wrap">
          <div class="bv-section">
            <div class="bv-section-title">👁 UNITY'S EYES — visual cortex input</div>
            <div class="bv-equation">V1 edge detection → salience map → saccade → IT recognition (on demand)</div>
          <div class="bv-eyes-wrap" id="bv-eyes-wrap">
            <video id="bv-eye-video" autoplay playsinline muted></video>
            <canvas id="bv-eye-overlay" width="320" height="240"></canvas>
            <div class="bv-eye-scan"></div>
            <div class="bv-eye-desc" id="bv-eye-desc">No camera feed</div>
          </div>
        </div>
        <div class="bv-section">
          <div class="bv-section-title">👂 UNITY'S EARS — auditory cortex input</div>
          <div class="bv-equation">Web Speech API → text transcription → neuron current injection (hash distributed)</div>
          <canvas id="bv-audio-canvas" width="320" height="60" style="width:100%;height:60px;background:#0a0a0a;border-radius:6px;display:block;margin-top:8px;"></canvas>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-dim);margin-top:4px;" id="bv-hear-text">Listening...</div>
        </div>
      </div>
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">🧬 SIMULATED SENSES — derived from sight + sound</div>
            <div class="bv-equation">Touch, smell, taste inferred from brain state via hypothalamus</div>
            <div class="bv-senses" id="bv-senses"></div>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="consciousness">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">CONSCIOUSNESS — The Mystery Module Ψ</div>
            <div class="bv-equation">Ψ = √(1/n) × N³ · [α·Id + β·Ego + γ·Left + δ·Right]</div>
            <div class="bv-psi" id="bv-psi">Ψ = 0.000</div>
            <div class="bv-psi-components" id="bv-psi-parts"></div>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="memory">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">MEMORY SYSTEM — Episodic + Working + Consolidation</div>
            <div class="bv-equation">Episodic: cosine recall | Working: 7 items, 0.98 decay | Consolidation: 3+ activations</div>
            <div class="bv-memory" id="bv-memory"></div>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="innervoice">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">INNER VOICE — Brain's Own Language</div>
            <div class="bv-equation">Dictionary + bigrams + cortex prediction → self-generated speech</div>
            <div class="bv-innervoice" id="bv-innervoice"></div>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="motor">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">MOTOR OUTPUT — Basal Ganglia Action Selection</div>
            <div class="bv-equation">6 channels × 25 neurons | Winner-take-all | Confidence threshold 0.15</div>
            <div class="bv-motor" id="bv-motor"></div>
          </div>
        </div>
      </div>

      <div class="bv-panel bv-hidden" data-panel="clusterwaves">
        <div class="bv-grid-wrap">
          <div class="bv-section bv-wide">
            <div class="bv-section-title">CLUSTER ACTIVATION — Per-Region Firing + Wave Overlays</div>
            <div class="bv-equation">7 clusters × spike patterns | θ/α/β/γ band overlay toggleable</div>
            <div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap;">
              <label style="color:#8be9fd;font-size:11px;cursor:pointer;"><input type="checkbox" id="bv-cw-theta" checked> θ Theta (4-8Hz)</label>
              <label style="color:#50fa7b;font-size:11px;cursor:pointer;"><input type="checkbox" id="bv-cw-alpha" checked> α Alpha (8-13Hz)</label>
              <label style="color:#ffb86c;font-size:11px;cursor:pointer;"><input type="checkbox" id="bv-cw-beta" checked> β Beta (13-30Hz)</label>
              <label style="color:#ff79c6;font-size:11px;cursor:pointer;"><input type="checkbox" id="bv-cw-gamma" checked> γ Gamma (30-100Hz)</label>
            </div>
            <canvas id="bv-clusterwaves-canvas" width="900" height="600"></canvas>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this._el);

    this._el.querySelector('.bv-close-btn').addEventListener('click', () => this.close());
    this._el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });

    // Tab switching
    this._el.querySelectorAll('.bv-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        this._el.querySelectorAll('.bv-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._el.querySelectorAll('.bv-panel').forEach(p => {
          p.classList.toggle('bv-hidden', p.dataset.panel !== this._activeTab);
        });
      });
    });

    // Canvas contexts
    this._neuronCtx = this._el.querySelector('#bv-neuron-canvas').getContext('2d');
    this._synapseCtx = this._el.querySelector('#bv-synapse-canvas').getContext('2d');
    this._oscCtx = this._el.querySelector('#bv-osc-canvas').getContext('2d');
    this._eyeOverlayCtx = this._el.querySelector('#bv-eye-overlay').getContext('2d');
    this._eyeVideo = this._el.querySelector('#bv-eye-video');
    this._audioCtx = this._el.querySelector('#bv-audio-canvas').getContext('2d');
    this._eyeScanY = 0;
    this._visionRef = null;
    this._audioAnalyser = null;
    this._audioData = null;
    this._lastHeardText = '';
  }

  /**
   * Connect a Vision source so we can show the camera feed and
   * descriptions in the viz panel.
   *
   * T1 2026-04-13 — accepts a `VisualCortex` instance directly
   * (the new single-source-of-truth path, which exposes `getStream()`
   * / `isActive()` / `description` / `gazeX` / `gazeY` / `gazeTarget`),
   * and also still accepts the legacy duck-typed `{isActive, _stream,
   * getLastDescription, getGaze}` adapter shape for backward compat
   * with any lingering call site that wasn't migrated.
   */
  setVision(visionInstance) {
    this._visionRef = visionInstance;
    if (!visionInstance?.isActive?.()) return;

    // Prefer the new VisualCortex.getStream() entry point
    const stream = typeof visionInstance.getStream === 'function'
      ? visionInstance.getStream()
      : visionInstance._stream;  // legacy fallback

    if (stream && this._eyeVideo) {
      this._eyeVideo.srcObject = stream;
      this._eyeVideo.play().catch(() => {});
    }
  }

  /**
   * Connect an audio source for frequency visualization.
   *
   * T1 2026-04-13 — accepts EITHER an AnalyserNode (the new single-
   * source-of-truth path, reading directly from
   * `AuditoryCortex.getAnalyser()` so we don't duplicate the analyser
   * graph) OR a raw MediaStream (legacy fallback — builds its own
   * analyser like before). Detects which one via the presence of
   * `getByteFrequencyData`.
   */
  setMicStream(source) {
    if (!source) return;

    // AnalyserNode path — reuse the cortex's existing analyser
    if (typeof source.getByteFrequencyData === 'function') {
      this._audioAnalyser = source;
      this._audioData = new Uint8Array(source.frequencyBinCount);
      console.log('[BrainViz] Audio analyser connected (reused from AuditoryCortex)');
      return;
    }

    // Legacy MediaStream path — build our own analyser graph
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(source);
      this._audioAnalyser = audioCtx.createAnalyser();
      this._audioAnalyser.fftSize = 256;
      src.connect(this._audioAnalyser);
      this._audioData = new Uint8Array(this._audioAnalyser.frequencyBinCount);
      console.log('[BrainViz] Audio analyser connected (built from MediaStream)');
    } catch (err) {
      console.warn('[BrainViz] Audio analyser failed:', err.message);
    }
  }

  /**
   * Update the last heard text for display.
   */
  setHeardText(text) {
    this._lastHeardText = text;
  }

  updateState(state) {
    this._lastState = state;

    // 114.19fm — rAF self-heal. _render() returns early without rescheduling
    // if open() ran before the first state frame arrived; without this restart
    // the visualizer stays frozen forever once state finally lands.
    if (this._open && !this._animId) {
      this._render();
    }

    // Track band power over time (smoothed) — this is what makes the oscillation
    // plot show meaningful slow changes instead of raw fast-cycling sine waves
    const bp = state.bandPower || state.oscillations?.bandPower || {};
    const smooth = 0.15; // EMA smoothing factor — lower = smoother
    for (const band of ['theta', 'alpha', 'beta', 'gamma']) {
      const raw = bp[band] ?? 0;
      this._smoothBands[band] = this._smoothBands[band] * (1 - smooth) + raw * smooth;
    }
    this._bandHistory.push({ ...this._smoothBands });
    if (this._bandHistory.length > this._maxBandHistory) this._bandHistory.shift();

    // Track coherence
    const coh = state.oscillations?.coherence ?? 0;
    this._coherenceHistory.push(coh);
    if (this._coherenceHistory.length > this._maxBandHistory) this._coherenceHistory.shift();

    // Update eye description from server vision if available
    if (state.visionDescription) {
      const descEl = this._el?.querySelector('#bv-eye-desc');
      if (descEl) descEl.textContent = state.visionDescription;
    }

    // Always track spike afterglow
    if (state.spikes) {
      const len = Math.min(state.spikes.length, this._spikeGlow.length);
      for (let i = 0; i < len; i++) {
        if (state.spikes[i]) {
          this._spikeGlow[i] = 1.0;
        } else {
          this._spikeGlow[i] *= 0.92;
        }
      }
    }

    // Track spike counts for rate display
    const spikeCount = state.spikeCount ?? (state.spikes ? Array.from(state.spikes).filter(s => s).length : 0);
    this._spikeHistory.push(spikeCount);
    if (this._spikeHistory.length > this._maxSpikeHistory) this._spikeHistory.shift();
    this._spikeRateHistory.push(spikeCount);
    if (this._spikeRateHistory.length > this._maxSpikeRateHistory) this._spikeRateHistory.shift();
  }

  _render() {
    if (!this._open || !this._lastState) return;
    const s = this._lastState;
    this._frameCount++;

    // Only render the ACTIVE tab — saves performance, reduces visual noise
    switch (this._activeTab) {
      case 'neurons': this._renderNeurons(s); break;
      case 'synapses': this._renderSynapses(s); break;
      case 'oscillations': this._renderOscillations(s); break;
      case 'senses':
        this._renderEyes(s);
        this._renderAudio();
        break;
    }

    // DOM updates at 10fps regardless of tab
    if (this._frameCount % 6 === 0) {
      this._renderStats(s);
      switch (this._activeTab) {
        case 'modules': this._renderModules(s); break;
        case 'senses': this._renderSenses(s); break;
        case 'consciousness': this._renderPsi(s); break;
        case 'memory': this._renderMemory(s); break;
        case 'motor': this._renderMotor(s); break;
        case 'innervoice': this._renderInnerVoice(s); break;
        case 'clusterwaves': this._renderClusterWaves(s); break;
      }
    }

    this._animId = requestAnimationFrame(() => this._render());
  }

  _renderStats(s) {
    const statsEl = this._el.querySelector('#bv-stats');
    const countEl = this._el.querySelector('#bv-spike-count');
    const spikeCount = s.spikeCount ?? 0;
    const avgRate = this._spikeHistory.length > 0
      ? (this._spikeHistory.reduce((a, b) => a + b, 0) / this._spikeHistory.length).toFixed(1)
      : '0';
    if (statsEl) statsEl.textContent = `spikes: ${spikeCount.toLocaleString()} | avg rate: ${avgRate}/frame | t=${(s.time ?? 0).toFixed(1)}s`;
    if (countEl) countEl.textContent = spikeCount;
  }

  _renderNeurons(s) {
    const ctx = this._neuronCtx;
    const canvas = ctx.canvas;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);

    // Update total neuron count in header
    const totalEl = this._el.querySelector('#bv-neuron-total');
    if (totalEl) totalEl.textContent = (s.totalNeurons ?? 677710000).toLocaleString();

    // 2D brain map — clusters laid out spatially like a flattened brain
    // Each cluster is a rectangular grid region with cells showing
    // activation intensity. Wave overlays drawn on top.
    const clusters = [
      // { name, label, color, x, y, w, h } — positioned like a flat brain
      { name: 'cortex',       label: 'CORTEX',       color: '#ff79c6', x: 0.15, y: 0.02, w: 0.70, h: 0.22 },
      { name: 'hippocampus',  label: 'HIPPO',        color: '#8be9fd', x: 0.30, y: 0.26, w: 0.40, h: 0.14 },
      { name: 'amygdala',     label: 'AMYG',         color: '#ffb86c', x: 0.05, y: 0.26, w: 0.22, h: 0.14 },
      { name: 'basalGanglia', label: 'BG',           color: '#50fa7b', x: 0.73, y: 0.26, w: 0.22, h: 0.14 },
      { name: 'cerebellum',   label: 'CEREBELLUM',   color: '#bd93f9', x: 0.10, y: 0.55, w: 0.80, h: 0.25 },
      { name: 'hypothalamus', label: 'HYPO',         color: '#f1fa8c', x: 0.05, y: 0.42, w: 0.20, h: 0.11 },
      { name: 'mystery',      label: 'Ψ MYSTERY',    color: '#ff5555', x: 0.75, y: 0.42, w: 0.20, h: 0.11 },
    ];

    const bp = s.oscillations?.bandPower || s.bandPower || {};
    const showTheta = this._el.querySelector('#bv-n-theta')?.checked ?? true;
    const showAlpha = this._el.querySelector('#bv-n-alpha')?.checked ?? true;
    const showBeta  = this._el.querySelector('#bv-n-beta')?.checked ?? false;
    const showGamma = this._el.querySelector('#bv-n-gamma')?.checked ?? false;
    const t = Date.now() / 1000;

    for (const cl of clusters) {
      const px = Math.floor(cl.x * W);
      const py = Math.floor(cl.y * H);
      const pw = Math.floor(cl.w * W);
      const ph = Math.floor(cl.h * H);

      // Get cluster activation
      const rate = s[cl.name]?.spikeRate ?? s.clusters?.[cl.name]?.spikeRate ?? Math.random() * 0.3;
      const neurons = s[cl.name]?.size ?? s.clusters?.[cl.name]?.size ?? 1000;

      // Draw grid cells — 8×8 grid per cluster, each cell's brightness = activation
      const gridCols = 12;
      const gridRows = Math.max(3, Math.floor(ph / (pw / gridCols)));
      const cellW = pw / gridCols;
      const cellH = ph / gridRows;

      for (let gy = 0; gy < gridRows; gy++) {
        for (let gx = 0; gx < gridCols; gx++) {
          // Each cell gets a slightly randomized activation based on cluster rate
          // This simulates per-neuron-group activity without needing 677M data points
          const cellRate = Math.max(0, Math.min(1, rate + (Math.random() - 0.5) * rate * 0.6));
          const r = parseInt(cl.color.slice(1,3), 16);
          const g = parseInt(cl.color.slice(3,5), 16);
          const b = parseInt(cl.color.slice(5,7), 16);
          const alpha = 0.05 + cellRate * 0.85;
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fillRect(px + gx * cellW + 0.5, py + gy * cellH + 0.5, cellW - 1, cellH - 1);
        }
      }

      // Cluster border
      ctx.strokeStyle = cl.color + '55';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, pw, ph);

      // Label
      ctx.fillStyle = cl.color;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(cl.label, px + 3, py + 11);

      // Activation % and neuron count
      const pct = Math.round(rate * 100);
      ctx.fillStyle = '#888';
      ctx.font = '9px monospace';
      ctx.fillText(`${pct}% · ${neurons.toLocaleString()}n`, px + 3, py + ph - 4);

      // Wave overlays on this cluster region
      const midY = py + ph / 2;
      const amp = ph * 0.3;
      ctx.lineWidth = 1.5;

      if (showTheta) {
        ctx.strokeStyle = '#8be9fd60';
        ctx.beginPath();
        for (let x = px; x < px + pw; x++) {
          const phase = (x - px) / pw * Math.PI * 4 + t * 6;
          ctx.lineTo(x, midY + Math.sin(phase) * amp * (bp.theta ?? 0.3));
        }
        ctx.stroke();
      }
      if (showAlpha) {
        ctx.strokeStyle = '#50fa7b60';
        ctx.beginPath();
        for (let x = px; x < px + pw; x++) {
          const phase = (x - px) / pw * Math.PI * 8 + t * 10;
          ctx.lineTo(x, midY + Math.sin(phase) * amp * (bp.alpha ?? 0.3));
        }
        ctx.stroke();
      }
      if (showBeta) {
        ctx.strokeStyle = '#ffb86c60';
        ctx.beginPath();
        for (let x = px; x < px + pw; x++) {
          const phase = (x - px) / pw * Math.PI * 16 + t * 20;
          ctx.lineTo(x, midY + Math.sin(phase) * amp * (bp.beta ?? 0.2));
        }
        ctx.stroke();
      }
      if (showGamma) {
        ctx.strokeStyle = '#ff79c660';
        ctx.beginPath();
        for (let x = px; x < px + pw; x++) {
          const phase = (x - px) / pw * Math.PI * 40 + t * 50;
          ctx.lineTo(x, midY + Math.sin(phase) * amp * (bp.gamma ?? 0.1));
        }
        ctx.stroke();
      }
    }

    // Update spike count
    const spikeEl = this._el.querySelector('#bv-spike-count');
    if (spikeEl) spikeEl.textContent = (s.totalSpikes ?? s.spikeCount ?? 0).toLocaleString();

    // No per-neuron data needed — this view works with aggregate cluster data
  }

  _renderSynapses(s) {
    const ctx = this._synapseCtx;
    const canvas = ctx.canvas;
    const W = canvas.width;
    const H = canvas.height;

    // Gentle fade for trail persistence
    ctx.fillStyle = 'rgba(10,10,18,0.15)';
    ctx.fillRect(0, 0, W, H);

    // 20 inter-cluster projection pathways shown as animated connection lines
    // Brightness pulses with real-time co-firing between source and target
    const keys = ['cortex', 'hippocampus', 'amygdala', 'basalGanglia', 'cerebellum', 'hypothalamus', 'mystery'];
    const labels = ['CTX', 'HPC', 'AMG', 'BG', 'CRB', 'HYP', 'Ψ'];
    const colors = ['#ff79c6', '#8be9fd', '#ffb86c', '#50fa7b', '#bd93f9', '#f1fa8c', '#ff5555'];

    // Position clusters in a circle
    const cx = W / 2, cy = H / 2, radius = Math.min(W, H) * 0.35;
    const positions = keys.map((_, i) => ({
      x: cx + Math.cos(i * Math.PI * 2 / 7 - Math.PI / 2) * radius,
      y: cy + Math.sin(i * Math.PI * 2 / 7 - Math.PI / 2) * radius,
    }));

    // Draw connection lines between all pairs — brightness = co-firing
    const t = Date.now() / 1000;
    for (let i = 0; i < keys.length; i++) {
      const srcRate = s.clusters?.[keys[i]]?.firingRate ?? 0;
      for (let j = i + 1; j < keys.length; j++) {
        const tgtRate = s.clusters?.[keys[j]]?.firingRate ?? 0;
        const coFire = Math.sqrt(srcRate * tgtRate);
        if (coFire < 0.001) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7 + j * 2.3);
        const alpha = Math.min(0.8, coFire * 3 * pulse);
        const r = Math.floor((parseInt(colors[i].slice(1,3),16) + parseInt(colors[j].slice(1,3),16)) / 2);
        const g = Math.floor((parseInt(colors[i].slice(3,5),16) + parseInt(colors[j].slice(3,5),16)) / 2);
        const b = Math.floor((parseInt(colors[i].slice(5,7),16) + parseInt(colors[j].slice(5,7),16)) / 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = 1 + coFire * 4;
        ctx.beginPath();
        ctx.moveTo(positions[i].x, positions[i].y);
        ctx.lineTo(positions[j].x, positions[j].y);
        ctx.stroke();
      }
    }

    // Draw cluster nodes — size pulses with firing rate
    for (let i = 0; i < keys.length; i++) {
      const rate = s.clusters?.[keys[i]]?.firingRate ?? 0;
      const nodeR = 12 + rate * 40;
      const pulse = 0.7 + 0.3 * Math.sin(t * 2 + i);

      // Glow
      ctx.beginPath();
      ctx.arc(positions[i].x, positions[i].y, nodeR + 4, 0, Math.PI * 2);
      ctx.fillStyle = colors[i] + Math.floor(rate * pulse * 80).toString(16).padStart(2, '0');
      ctx.fill();

      // Node
      ctx.beginPath();
      ctx.arc(positions[i].x, positions[i].y, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = colors[i] + 'cc';
      ctx.fill();

      // Label
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], positions[i].x, positions[i].y + 3);
    }
    ctx.textAlign = 'start';

    // Bottom info
    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    ctx.fillText('line brightness = Hebbian co-firing · node size = spike rate', 4, H - 4);
  }

  _renderOscillations(s) {
    const ctx = this._oscCtx;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const len = this._bandHistory.length;
    if (len < 2) return;

    // Plot 4 band power envelopes + coherence — smooth, slow-moving traces
    // These show CHANGES in brain activity over time, not raw fast oscillations
    const bands = [
      { key: 'theta', label: 'θ THETA (4-8Hz) — memory, navigation',     color: '#64b4ff', glow: 'rgba(100,180,255,0.2)' },
      { key: 'alpha', label: 'α ALPHA (8-13Hz) — relaxed attention',      color: '#64ffb4', glow: 'rgba(100,255,180,0.2)' },
      { key: 'beta',  label: 'β BETA (13-30Hz) — active thinking',        color: '#ffb464', glow: 'rgba(255,180,100,0.2)' },
      { key: 'gamma', label: 'γ GAMMA (30-100Hz) — consciousness, binding', color: '#ff4d9a', glow: 'rgba(255,77,154,0.2)' },
    ];
    const bandCount = bands.length;
    const bandH = (h - 30) / (bandCount + 1); // +1 for coherence

    for (let b = 0; b < bandCount; b++) {
      const band = bands[b];
      const yTop = b * bandH + 2;
      const yCenter = yTop + bandH / 2;

      // Grid line
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.lineTo(w, yTop);
      ctx.stroke();

      // Filled area (envelope)
      ctx.beginPath();
      ctx.fillStyle = band.glow;
      for (let t = 0; t < len; t++) {
        const x = (t / this._maxBandHistory) * w;
        const val = this._bandHistory[t][band.key] ?? 0;
        const y = yCenter - val * bandH * 0.8;
        if (t === 0) { ctx.moveTo(x, yCenter); ctx.lineTo(x, y); }
        else ctx.lineTo(x, y);
      }
      // Close back along center
      ctx.lineTo((len / this._maxBandHistory) * w, yCenter);
      ctx.closePath();
      ctx.fill();

      // Line trace
      ctx.beginPath();
      ctx.strokeStyle = band.color;
      ctx.lineWidth = 1.5;
      for (let t = 0; t < len; t++) {
        const x = (t / this._maxBandHistory) * w;
        const val = this._bandHistory[t][band.key] ?? 0;
        const y = yCenter - val * bandH * 0.8;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Current value + label
      const currentVal = this._bandHistory[len - 1]?.[band.key] ?? 0;
      ctx.fillStyle = band.color;
      ctx.font = '10px monospace';
      ctx.fillText(`${band.label}  ${currentVal.toFixed(3)}`, 6, yTop + 12);
    }

    // Coherence trace at the bottom
    const cohTop = bandCount * bandH + 2;
    const cohCenter = cohTop + bandH / 2;
    const cohLen = this._coherenceHistory.length;

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, cohTop);
    ctx.lineTo(w, cohTop);
    ctx.stroke();

    if (cohLen > 1) {
      // Filled
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,229,255,0.15)';
      for (let t = 0; t < cohLen; t++) {
        const x = (t / this._maxBandHistory) * w;
        const val = this._coherenceHistory[t];
        const y = cohCenter - val * bandH * 0.8;
        if (t === 0) { ctx.moveTo(x, cohCenter); ctx.lineTo(x, y); }
        else ctx.lineTo(x, y);
      }
      ctx.lineTo((cohLen / this._maxBandHistory) * w, cohCenter);
      ctx.closePath();
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      for (let t = 0; t < cohLen; t++) {
        const x = (t / this._maxBandHistory) * w;
        const val = this._coherenceHistory[t];
        const y = cohCenter - val * bandH * 0.8;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const cohVal = this._coherenceHistory[cohLen - 1] ?? 0;
    ctx.fillStyle = '#00e5ff';
    ctx.font = '10px monospace';
    ctx.fillText(`R COHERENCE — global sync  ${cohVal.toFixed(3)}`, 6, cohTop + 12);

    const cohEl = this._el.querySelector('#bv-coherence');
    if (cohEl) cohEl.textContent = cohVal.toFixed(3);
  }

  _renderAudio() {
    const ctx = this._audioCtx;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = 'rgba(10,10,10,0.4)';
    ctx.fillRect(0, 0, w, h);

    if (this._audioAnalyser && this._audioData) {
      this._audioAnalyser.getByteFrequencyData(this._audioData);
      const len = this._audioData.length;
      const barWidth = w / len;

      for (let i = 0; i < len; i++) {
        const val = this._audioData[i] / 255;
        const barH = val * h;
        // Color: quiet=dim purple, loud=hot pink
        const r = Math.floor(100 + val * 155);
        const g = Math.floor(30 + val * 47);
        const b = Math.floor(120 + val * 34);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(i * barWidth, h - barH, barWidth - 0.5, barH);
      }
    } else {
      // No mic — draw flatline
      ctx.strokeStyle = 'rgba(255,77,154,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    }

    // Update heard text
    const hearEl = this._el.querySelector('#bv-hear-text');
    if (hearEl && this._lastHeardText) {
      hearEl.textContent = `Last heard: "${this._lastHeardText}"`;
    }
  }

  _renderSenses(s) {
    const el = this._el.querySelector('#bv-senses');
    if (!el) return;

    // Derive simulated senses from brain state:
    // - Touch: arousal level maps to skin sensation (tingling, warmth, pressure)
    // - Smell: drug state + environment description → inferred scents
    // - Taste: intoxication + reward signal → taste sensations
    // Server sends flat fields, not nested amygdala object
    const arousal = s.arousal ?? s.amygdala?.arousal ?? 0;
    const valence = s.valence ?? s.amygdala?.valence ?? 0;
    const reward = s.reward ?? 0;
    const drugState = s.drugState || 'sober';
    const coherence = s.coherence ?? s.oscillations?.coherence ?? 0;

    // Touch — computed from arousal × valence (equation output, not description)
    const touchVal = arousal * (0.5 + Math.abs(valence) * 0.5);
    const touchDesc = `a=${arousal.toFixed(2)} × v=${valence.toFixed(2)} = ${touchVal.toFixed(3)}`;

    // Smell — computed from drug state modulation + coherence
    const smellVal = coherence * 0.6 + arousal * 0.3;
    const smellDesc = `R=${coherence.toFixed(2)} drug=${drugState} = ${smellVal.toFixed(3)}`;

    // Taste — computed from reward signal + arousal
    const tasteVal = Math.abs(reward) * 0.5 + arousal * 0.3;
    const tasteDesc = `δ=${reward.toFixed(3)} × a=${arousal.toFixed(2)} = ${tasteVal.toFixed(3)}`;

    el.innerHTML = `
      <div class="bv-mod-row">
        <span class="bv-mod-name" style="color:#ff6b9d">🤚 TOUCH</span>
        <div class="bv-mod-bar-wrap"><div class="bv-mod-bar" style="width:${touchVal*100}%;background:#ff6b9d"></div></div>
        <span class="bv-mod-detail">${touchDesc}</span>
      </div>
      <div class="bv-mod-row">
        <span class="bv-mod-name" style="color:#b4ff64">👃 SMELL</span>
        <div class="bv-mod-bar-wrap"><div class="bv-mod-bar" style="width:${smellVal*100}%;background:#b4ff64"></div></div>
        <span class="bv-mod-detail">${smellDesc}</span>
      </div>
      <div class="bv-mod-row">
        <span class="bv-mod-name" style="color:#ffb464">👅 TASTE</span>
        <div class="bv-mod-bar-wrap"><div class="bv-mod-bar" style="width:${tasteVal*100}%;background:#ffb464"></div></div>
        <span class="bv-mod-detail">${tasteDesc}</span>
      </div>
    `;
  }

  _renderEyes(s) {
    const ctx = this._eyeOverlayCtx;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;

    // Clear overlay
    ctx.clearRect(0, 0, w, h);

    // Scan line effect — sweeps down continuously
    this._eyeScanY = (this._eyeScanY + 1.5) % h;
    const grad = ctx.createLinearGradient(0, this._eyeScanY - 15, 0, this._eyeScanY + 15);
    grad.addColorStop(0, 'rgba(255,77,154,0)');
    grad.addColorStop(0.5, 'rgba(255,77,154,0.25)');
    grad.addColorStop(1, 'rgba(255,77,154,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, this._eyeScanY - 15, w, 30);

    // Corner brackets — "targeting" frame
    const bLen = 30;
    const bOff = 12;
    ctx.strokeStyle = 'rgba(255,77,154,0.6)';
    ctx.lineWidth = 2;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(bOff, bOff + bLen); ctx.lineTo(bOff, bOff); ctx.lineTo(bOff + bLen, bOff);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(w - bOff - bLen, bOff); ctx.lineTo(w - bOff, bOff); ctx.lineTo(w - bOff, bOff + bLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(bOff, h - bOff - bLen); ctx.lineTo(bOff, h - bOff); ctx.lineTo(bOff + bLen, h - bOff);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(w - bOff - bLen, h - bOff); ctx.lineTo(w - bOff, h - bOff); ctx.lineTo(w - bOff, h - bOff - bLen);
    ctx.stroke();

    // Center crosshair (subtle)
    ctx.strokeStyle = 'rgba(0,229,255,0.3)';
    ctx.lineWidth = 1;
    const cx = w / 2, cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy);
    ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15);
    ctx.stroke();

    // Pulsing focus ring
    const pulse = Math.sin(this._frameCount * 0.05) * 0.3 + 0.5;
    ctx.strokeStyle = `rgba(255,77,154,${pulse * 0.4})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 40 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();

    // Update description text
    // T1 2026-04-13 — read directly from the VisualCortex `description`
    // field (which the cortex updates asynchronously via its IT-layer
    // describer) instead of calling a getLastDescription() method that
    // the old duck-typed adapter exposed. Still falls back to the
    // adapter shape for any legacy call site that hasn't migrated.
    if (this._frameCount % 60 === 0) {
      const descEl = this._el.querySelector('#bv-eye-desc');
      if (descEl && this._visionRef) {
        const desc = this._visionRef.description
          ?? (typeof this._visionRef.getLastDescription === 'function' ? this._visionRef.getLastDescription() : null);
        descEl.textContent = desc || 'Analyzing...';
      }
    }
  }

  _renderModules(s) {
    const el = this._el.querySelector('#bv-modules');
    const modules = [
      { name: 'CORTEX', key: 'cortex', eq: 'ŝ=f(x), err=actual-predicted', color: '#ff4d9a' },
      { name: 'HIPPOCAMPUS', key: 'hippocampus', eq: 'E=-½Σw·x·x (Hopfield)', color: '#a855f7' },
      { name: 'AMYGDALA', key: 'amygdala', eq: 'V(s)=Σw·x (valence)', color: '#ef4444' },
      { name: 'BASAL GANGLIA', key: 'basalGanglia', eq: 'P(a)=softmax(Q/τ)', color: '#22c55e' },
      { name: 'CEREBELLUM', key: 'cerebellum', eq: 'ΔW∝(target-actual)', color: '#00e5ff' },
      { name: 'HYPOTHALAMUS', key: 'hypothalamus', eq: 'dH/dt=-α(H-H_set)+in', color: '#f59e0b' },
    ];

    let html = '';
    for (const mod of modules) {
      const data = s[mod.key];
      let value = 0;
      let detail = '';

      // Server sends flat fields (s.arousal, s.psi, s.fear etc.) + s.clusters[name].{size,spikeCount,firingRate}
      // Module-specific data comes from flat state, not nested objects
      const cluster = s.clusters?.[mod.key];
      const clusterRate = cluster?.firingRate ?? 0;

      if (mod.key === 'cortex') {
        value = Math.min(1, clusterRate * 3);
        detail = `rate=${clusterRate.toFixed(3)} psi=${(s.psi ?? 0).toFixed(4)}`;
      } else if (mod.key === 'hippocampus') {
        value = Math.min(1, clusterRate * 3);
        detail = `rate=${clusterRate.toFixed(3)} recall_active`;
      } else if (mod.key === 'amygdala') {
        value = s.arousal ?? 0;
        detail = `arousal=${(s.arousal ?? 0).toFixed(3)} valence=${(s.valence ?? 0).toFixed(3)} fear=${(s.fear ?? 0).toFixed(3)}`;
      } else if (mod.key === 'basalGanglia') {
        value = s.motor?.confidence ?? 0;
        detail = `→ ${s.motor?.selectedAction ?? 'idle'} (conf=${(s.motor?.confidence ?? 0).toFixed(3)})`;
      } else if (mod.key === 'cerebellum') {
        value = Math.min(1, clusterRate * 2);
        detail = `rate=${clusterRate.toFixed(3)} correction_active`;
      } else if (mod.key === 'hypothalamus') {
        value = Math.min(1, clusterRate * 4);
        detail = `rate=${clusterRate.toFixed(3)} drug=${s.drugState || 'none'}`;
      }

      const barWidth = Math.min(100, value * 100);

      // Cluster firing rate — cluster already declared above
      const spikeInfo = cluster ? `${cluster.spikeCount}/${cluster.size || '?'} firing, rate=${(cluster.firingRate ?? 0).toFixed(1)}` : '';

      html += `
        <div class="bv-mod-row">
          <span class="bv-mod-name" style="color:${mod.color}">${mod.name}</span>
          <div class="bv-mod-bar-wrap">
            <div class="bv-mod-bar" style="width:${barWidth}%;background:${mod.color};box-shadow:0 0 ${barWidth > 50 ? 8 : 0}px ${mod.color}"></div>
          </div>
          <span class="bv-mod-detail">${detail}</span>
        </div>
        <div style="font-family:var(--mono);font-size:8px;color:${mod.color}55;margin:-2px 0 4px 108px;">${spikeInfo} | ${mod.eq}</div>
      `;
    }

    // Track Ψ history for consciousness tab
    this._psiHistory.push(s.psi ?? 0);
    if (this._psiHistory.length > this._maxHistory) this._psiHistory.shift();

    el.innerHTML = html;
  }

  _renderPsi(s) {
    const psiEl = this._el.querySelector('#bv-psi');
    const partsEl = this._el.querySelector('#bv-psi-parts');
    const psi = s.psi ?? 0;
    const mystery = s.mystery || {};

    psiEl.textContent = `Ψ = ${psi.toFixed(6)}`;
    if (psi > 2) {
      psiEl.style.color = '#fff';
      psiEl.style.textShadow = '0 0 20px #ff4d9a, 0 0 40px #a855f7';
    } else if (psi > 0.5) {
      psiEl.style.color = '#ff4d9a';
      psiEl.style.textShadow = '0 0 10px rgba(255,77,154,0.5)';
    } else {
      psiEl.style.color = '#a855f7';
      psiEl.style.textShadow = 'none';
    }

    const parts = [];
    if (mystery.id !== undefined) parts.push(`Id=${(typeof mystery.id === 'number' ? mystery.id.toFixed(3) : mystery.id)}`);
    if (mystery.ego !== undefined) parts.push(`Ego=${(typeof mystery.ego === 'number' ? mystery.ego.toFixed(3) : mystery.ego)}`);
    if (mystery.leftBrain !== undefined) parts.push(`Left=${(typeof mystery.leftBrain === 'number' ? mystery.leftBrain.toFixed(3) : mystery.leftBrain)}`);
    if (mystery.rightBrain !== undefined) parts.push(`Right=${(typeof mystery.rightBrain === 'number' ? mystery.rightBrain.toFixed(3) : mystery.rightBrain)}`);
    if (mystery.n !== undefined) parts.push(`n=${mystery.n}`);
    if (s.reward !== undefined) parts.push(`reward=${s.reward.toFixed(3)}`);
    partsEl.textContent = parts.join('  |  ') || 'waiting for brain state...';

    // Ψ history sparkline
    if (this._psiHistory.length > 1) {
      let sparkHtml = '<div style="margin-top:12px;font-family:var(--mono);font-size:9px;color:var(--text-dim);">Ψ HISTORY</div>';
      sparkHtml += '<div style="display:flex;gap:1px;margin-top:4px;height:30px;align-items:flex-end;">';
      const maxPsi = Math.max(0.1, ...this._psiHistory);
      const recent = this._psiHistory.slice(-100);
      for (const val of recent) {
        const h = Math.max(1, (val / maxPsi) * 30);
        const color = val > 1 ? '#ff4d9a' : val > 0.3 ? '#a855f7' : '#333';
        sparkHtml += `<div style="flex:1;height:${h}px;background:${color};border-radius:1px;"></div>`;
      }
      sparkHtml += '</div>';
      partsEl.insertAdjacentHTML('afterend', sparkHtml);
    }
  }

  _renderMemory(s) {
    const el = this._el.querySelector('#bv-memory');
    if (!el) return;
    // Server sends s.growth.{totalEpisodes, totalWords, totalInteractions}
    // and s.clusters.hippocampus for memory region activity
    const growth = s.growth || {};
    const hippo = s.clusters?.hippocampus || {};
    const episodes = growth.totalEpisodes ?? 0;
    const words = growth.totalWords ?? 0;
    const interactions = growth.totalInteractions ?? 0;
    const hippoRate = hippo.firingRate ?? 0;

    el.innerHTML = `
      <div class="bv-mod-row">
        <span class="bv-mod-name" style="color:#a855f7">EPISODES</span>
        <div class="bv-mod-bar-wrap"><div class="bv-mod-bar" style="width:${Math.min(100, episodes)}%;background:#a855f7"></div></div>
        <span class="bv-mod-detail">${episodes} stored</span>
      </div>
      <div class="bv-mod-row">
        <span class="bv-mod-name" style="color:#00e5ff">VOCABULARY</span>
        <div class="bv-mod-bar-wrap"><div class="bv-mod-bar" style="width:${Math.min(100, words / 50)}%;background:#00e5ff"></div></div>
        <span class="bv-mod-detail">${words.toLocaleString()} words learned</span>
      </div>
      <div class="bv-mod-row">
        <span class="bv-mod-name" style="color:#22c55e">INTERACTIONS</span>
        <div class="bv-mod-bar-wrap"><div class="bv-mod-bar" style="width:${Math.min(100, interactions * 5)}%;background:#22c55e"></div></div>
        <span class="bv-mod-detail">${interactions} conversations</span>
      </div>
      <div class="bv-mod-row">
        <span class="bv-mod-name" style="color:#f59e0b">HIPPOCAMPUS</span>
        <div class="bv-mod-bar-wrap"><div class="bv-mod-bar" style="width:${Math.min(100, hippoRate * 300)}%;background:#f59e0b"></div></div>
        <span class="bv-mod-detail">firing rate: ${hippoRate.toFixed(3)} | ${hippo.spikeCount?.toLocaleString() ?? 0} spikes</span>
      </div>
    `;
  }

  _renderMotor(s) {
    const el = this._el.querySelector('#bv-motor');
    if (!el) return;
    const motor = s.motor || {};
    const channels = motor.channelRates || [];
    const names = ['respond_text', 'generate_image', 'speak', 'build_ui', 'listen', 'idle'];
    const colors = ['#ff4d9a', '#a855f7', '#f59e0b', '#22c55e', '#00e5ff', '#555'];

    // Track history
    this._motorHistory.push({ channels: [...channels], action: motor.selectedAction, confidence: motor.confidence || 0 });
    if (this._motorHistory.length > this._maxHistory) this._motorHistory.shift();

    let html = '';
    for (let i = 0; i < names.length; i++) {
      const rate = channels[i] || 0;
      const isWinner = names[i] === motor.selectedAction;
      const barWidth = Math.min(100, rate * 100 * 3);

      // Peak value from history (highest this channel ever reached recently)
      let peak = 0;
      for (const h of this._motorHistory) { if ((h.channels[i] || 0) > peak) peak = h.channels[i]; }

      html += `
        <div class="bv-mod-row" style="${isWinner ? 'background:rgba(255,255,255,0.03);border-radius:4px;' : ''}">
          <span class="bv-mod-name" style="color:${colors[i]}">${isWinner ? '► ' : ''}${names[i]}</span>
          <div class="bv-mod-bar-wrap">
            <div class="bv-mod-bar" style="width:${Math.min(100, peak * 100 * 3)}%;background:${colors[i]}33;position:absolute;height:100%;border-radius:3px;"></div>
            <div class="bv-mod-bar" style="width:${barWidth}%;background:${colors[i]}${isWinner ? '' : '88'}"></div>
          </div>
          <span class="bv-mod-detail">${(rate * 100).toFixed(1)}% (peak ${(peak * 100).toFixed(1)}%)${isWinner ? ' ★' : ''}</span>
        </div>
      `;
    }

    // Action history timeline — last 50 decisions
    const recentActions = this._motorHistory.slice(-50);
    html += '<div style="margin-top:10px;font-family:var(--mono);font-size:9px;color:var(--text-dim);">DECISION HISTORY</div>';
    html += '<div style="display:flex;gap:1px;margin-top:4px;height:12px;">';
    for (const h of recentActions) {
      const ci = names.indexOf(h.action);
      const c = ci >= 0 ? colors[ci] : '#333';
      html += `<div style="flex:1;background:${c};border-radius:1px;opacity:${0.3 + (h.confidence || 0) * 0.7}" title="${h.action} ${((h.confidence||0)*100).toFixed(0)}%"></div>`;
    }
    html += '</div>';

    html += `<div style="margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--text-dim);">
      Confidence: ${(motor.confidence || 0).toFixed(3)} | ${motor.speechGated ? '<span style="color:var(--red)">GATED: ' + motor.gateReason + '</span>' : '<span style="color:var(--green)">speech OK</span>'}
      | Cooldown: ${motor.cooldown || 0}
    </div>`;
    el.innerHTML = html;
  }

  _renderInnerVoice(s) {
    const el = this._el.querySelector('#bv-innervoice');
    if (!el) return;
    const iv = s.innerVoice || {};
    const mood = iv.mood || '0/0/0';
    // Color from equations: hue from valence, saturation from arousal, lightness from coherence
    const moodHue = (ivValence >= 0 ? 330 : 240) + ivValence * 30;
    const moodSat = 50 + ivArousal * 50;
    const moodLight = 40 + (iv.coherence ?? 0.5) * 20;
    const moodColor = `hsl(${moodHue},${moodSat}%,${moodLight}%)`;
    const color = moodColor || '#555';

    let html = `
      <div style="text-align:center;margin:12px 0;">
        <div style="font-size:24px;color:${color};font-weight:700;font-family:var(--mono);">${mood.toUpperCase()}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">intensity: ${(iv.moodIntensity ?? 0).toFixed(2)} | vocab: ${iv.vocabSize ?? 0} words | bigrams: ${iv.bigramCount ?? 0}</div>
      </div>
    `;

    if (iv.sentence) {
      html += `<div style="background:#111;border:1px solid ${color}33;border-radius:8px;padding:12px;margin:8px 0;font-family:var(--mono);font-size:13px;color:${color};line-height:1.5;">"${iv.sentence}"</div>`;
      html += `<div style="font-size:9px;color:var(--text-dim);">↑ Self-generated from dictionary (no AI model)</div>`;
    } else {
      html += `<div style="font-size:11px;color:var(--text-dim);margin:8px 0;">${iv.vocabSize < 100 ? `Learning vocabulary... (${iv.vocabSize}/100 words needed for self-speech)` : 'Thought below speech threshold'}</div>`;
    }

    if (iv.words && iv.words.length > 0) {
      html += `<div style="margin-top:12px;font-size:9px;color:var(--text-dim);">MOOD-MATCHING WORDS</div>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">`;
      for (const w of iv.words) {
        html += `<span style="background:${color}22;border:1px solid ${color}44;border-radius:4px;padding:2px 6px;font-family:var(--mono);font-size:10px;color:${color}">${w}</span>`;
      }
      html += `</div>`;
    }

    if (iv.history && iv.history.length > 0) {
      html += `<div style="margin-top:12px;font-size:9px;color:var(--text-dim);">MOOD HISTORY</div>`;
      html += `<div style="display:flex;gap:2px;margin-top:4px;height:20px;align-items:flex-end;">`;
      for (const h of iv.history) {
        const hHue = ((h.valence ?? 0) >= 0 ? 330 : 240) + (h.valence ?? 0) * 30;
        const c = `hsl(${hHue},${50 + (h.arousal ?? 0.5) * 50}%,${50}%)`;
        const height = Math.max(3, h.arousal * 20);
        html += `<div style="flex:1;height:${height}px;background:${c};border-radius:1px;" title="${h.mood} a=${h.arousal?.toFixed(2)}"></div>`;
      }
      html += `</div>`;
    }

    el.innerHTML = html;
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  open() {
    this._open = true;
    this._el.classList.remove('hidden');
    // Don't clear history — we've been accumulating while closed
    // so the plots already have data when the user opens the visualizer
    this._render();
  }

  close() {
    this._open = false;
    this._el.classList.add('hidden');
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  }

  isOpen() {
    return this._open;
  }

  // ── CLUSTER WAVES — per-region firing maps with wave overlays ──
  // 114.19fm — state-path corrections: server emits cluster data under
  // `state.clusters[name].spikeRate` (per brain-server.js:2092-2184), not
  // `state[name].spikeRate`. Bandpower is at `state.bandPower` top-level,
  // not `state.oscillations.bandPower`. Defensive alpha clamp prevents
  // addColorStop SyntaxError on rate>1.275 (would have killed rAF chain).
  _renderClusterWaves(s) {
    const canvas = this._el.querySelector('#bv-clusterwaves-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);

    const clusters = ['cortex', 'hippocampus', 'amygdala', 'basalGanglia', 'cerebellum', 'hypothalamus', 'mystery'];
    const clusterColors = ['#ff79c6', '#8be9fd', '#ffb86c', '#50fa7b', '#bd93f9', '#f1fa8c', '#ff5555'];
    const clusterH = Math.floor(H / clusters.length);

    // Per-cluster state lives under state.clusters
    const cs = s.clusters || {};

    // Bandpower lives at top level (server brain-server.js:2183)
    const bp = s.bandPower || s.oscillations?.bandPower || {};
    const showTheta = this._el.querySelector('#bv-cw-theta')?.checked ?? true;
    const showAlpha = this._el.querySelector('#bv-cw-alpha')?.checked ?? true;
    const showBeta  = this._el.querySelector('#bv-cw-beta')?.checked ?? true;
    const showGamma = this._el.querySelector('#bv-cw-gamma')?.checked ?? true;

    const t = Date.now() / 1000; // time for wave animation

    for (let ci = 0; ci < clusters.length; ci++) {
      const name = clusters[ci];
      const color = clusterColors[ci];
      const y0 = ci * clusterH;

      // Cluster label
      ctx.fillStyle = color;
      ctx.font = '11px monospace';
      ctx.fillText(name.toUpperCase(), 4, y0 + 14);

      // Spike rate bar — read from state.clusters[name].spikeRate (or
      // firingRate alias) which the server clamps to [0,1].
      const cd = cs[name] || {};
      const rawRate = (typeof cd.spikeRate === 'number') ? cd.spikeRate
                    : (typeof cd.firingRate === 'number') ? cd.firingRate
                    : 0;
      const rate = Math.max(0, Math.min(1, rawRate));
      const barW = Math.min(rate * W * 0.8, W - 80);
      ctx.fillStyle = color + '40';
      ctx.fillRect(80, y0 + 2, barW, clusterH - 4);

      // Intensity gradient based on rate. Alpha hex byte is clamped to
      // 0-255 so addColorStop never sees an oversized hex string.
      const alphaByte = Math.max(0, Math.min(255, Math.floor(rate * 200)));
      const alphaHex = alphaByte.toString(16).padStart(2, '0');
      const grad = ctx.createLinearGradient(80, y0, W, y0);
      grad.addColorStop(0, color + alphaHex);
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.fillRect(80, y0 + 2, W - 80, clusterH - 4);

      // Spike count + size badge so the bar has a numeric anchor
      if (typeof cd.spikeCount === 'number' && typeof cd.size === 'number') {
        ctx.fillStyle = color + 'cc';
        ctx.font = '10px monospace';
        const pct = (rate * 100).toFixed(1);
        ctx.fillText(`${cd.spikeCount.toLocaleString()}/${cd.size.toLocaleString()} (${pct}%)`, 84, y0 + clusterH - 4);
      }

      // Wave overlays — sinusoidal waveforms at each frequency band
      const midY = y0 + clusterH / 2;
      const amplitude = clusterH * 0.35;
      ctx.lineWidth = 1.5;

      if (showTheta) {
        const thetaPow = bp.theta ?? 0.3;
        ctx.strokeStyle = '#8be9fd80';
        ctx.beginPath();
        for (let x = 80; x < W; x++) {
          const phase = (x - 80) / (W - 80) * Math.PI * 4 + t * 6;
          ctx.lineTo(x, midY + Math.sin(phase) * amplitude * thetaPow);
        }
        ctx.stroke();
      }

      if (showAlpha) {
        const alphaPow = bp.alpha ?? 0.3;
        ctx.strokeStyle = '#50fa7b80';
        ctx.beginPath();
        for (let x = 80; x < W; x++) {
          const phase = (x - 80) / (W - 80) * Math.PI * 8 + t * 10;
          ctx.lineTo(x, midY + Math.sin(phase) * amplitude * alphaPow);
        }
        ctx.stroke();
      }

      if (showBeta) {
        const betaPow = bp.beta ?? 0.2;
        ctx.strokeStyle = '#ffb86c80';
        ctx.beginPath();
        for (let x = 80; x < W; x++) {
          const phase = (x - 80) / (W - 80) * Math.PI * 16 + t * 20;
          ctx.lineTo(x, midY + Math.sin(phase) * amplitude * betaPow);
        }
        ctx.stroke();
      }

      if (showGamma) {
        const gammaPow = bp.gamma ?? 0.1;
        ctx.strokeStyle = '#ff79c680';
        ctx.beginPath();
        for (let x = 80; x < W; x++) {
          const phase = (x - 80) / (W - 80) * Math.PI * 40 + t * 50;
          ctx.lineTo(x, midY + Math.sin(phase) * amplitude * gammaPow);
        }
        ctx.stroke();
      }

      // Divider line between clusters
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y0 + clusterH);
      ctx.lineTo(W, y0 + clusterH);
      ctx.stroke();
    }
  }
}
