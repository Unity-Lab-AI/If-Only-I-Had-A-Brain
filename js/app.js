// ═══════════════════════════════════════════════════════════════
// IF ONLY I HAD A BRAIN — Main Entry Point (REWORK)
// ═══════════════════════════════════════════════════════════════
// app.js is a THIN I/O LAYER. The brain runs everything.
// This file: DOM events → brain.receiveSensoryInput()
//            brain events → DOM rendering
// No decisions here. No routing. No classification.
// ═══════════════════════════════════════════════════════════════

// LOUD VERSION MARKER — if your browser console doesn't show this,
// you're on a cached/stale bundle and need to hard-reload
// (Ctrl+Shift+R / Cmd+Shift+R). Version comes from js/version.js
// which is stamped by scripts/stamp-version.mjs on every deploy, so
// the string here always matches the ?v= cache-buster in index.html
// — no hand-bumping.
import { FULL as UNITY_BUILD } from './version.js';
console.log(`%c[Unity] app.js ${UNITY_BUILD} module loaded`, 'color:#ff4d9a;font-weight:bold');
// Catch uncaught errors (from RAF callbacks, async handlers, etc.)
// so they can't silently kill the app.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('[Unity] window.onerror:', e.message, e.filename + ':' + e.lineno, e.error?.stack || '');
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[Unity] unhandled promise rejection:', e.reason?.message || e.reason, e.reason?.stack || '');
  });
}

import { UnityBrain } from './brain/engine.js';
// R4 — BrocasArea import removed. Unity speaks equationally via
// brain.processAndRespond → innerVoice.languageCortex.generate. No
// more text-AI peripheral. The language.js file still exists as a
// shim (see its header) but is not imported here.
import { AIProviders } from './brain/peripherals/ai-providers.js';
import { PollinationsAI } from './ai/pollinations.js';
import { VoiceIO } from './io/voice.js';
import { requestPermissions } from './io/permissions.js';
import { UserStorage } from './storage.js';
import { Sandbox } from './ui/sandbox.js';
import { ChatPanel } from './ui/chat-panel.js';
import { BrainVisualizer } from './ui/brain-viz.js';
import { sensoryStatus } from './ui/sensory-status.js';
import { Brain3D } from './ui/brain-3d.js';
// persona-prompt.js no longer needed — brain equations ARE the personality

// ── Load API keys from env.js ──
let ENV_KEYS = {};
try {
  const env = await import(/* webpackIgnore: true */ './env.js');
  ENV_KEYS = env.ENV_KEYS || {};
  console.log('[Unity] Loaded keys from env.js:', Object.keys(ENV_KEYS).filter(k => ENV_KEYS[k]).join(', ') || 'none');
} catch {
  console.log('[Unity] No env.js found — keys entered in setup modal');
}

// ── Global instances ──
let brain, pollinations, providers, voice, storage, sandbox;
let chatPanel, brainViz, brain3d;
let isRunning = false;

// ── UI State ──
const uiState = {
  micMuted: false,
  chatOpen: false,
  brainVizOpen: false,
  avatarState: 'idle',
  permMic: false,
  permCamera: false,
};

// ── LANDING PAGE: 3D Brain starts IMMEDIATELY ──
import { detectRemoteBrain } from './brain/remote-brain.js';

let landingBrain3d = null;
let landingBrainSource = null; // RemoteBrain or null

(async function initLanding() {
  // Try to connect to server brain for live state
  try {
    landingBrainSource = await detectRemoteBrain();
  } catch {}

  // Init 3D brain on landing container.
  // Silent init failures were hiding the reason why the 3D brain
  // wasn't rendering — the constructor caught internal errors via a
  // _destroyed flag but only logged to console, which the operator
  // can't see without DevTools. Render a visible banner to
  // #brain-3d-landing if init fails so the failure reason surfaces
  // immediately without
  // having to open F12.
  const _show3dError = (reason) => {
    const host = document.getElementById('brain-3d-landing');
    if (!host) return;
    const banner = document.createElement('div');
    banner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(80,0,0,0.85);color:#ff9090;font-family:monospace;font-size:13px;padding:20px 28px;border:1px solid #ff4040;border-radius:6px;max-width:80%;text-align:center;z-index:9999;';
    banner.textContent = '3D Brain init failed: ' + reason;
    host.appendChild(banner);
  };
  try {
    landingBrain3d = new Brain3D('brain-3d-landing');
    if (!landingBrain3d || landingBrain3d._destroyed) {
      _show3dError(
        landingBrain3d && landingBrain3d._initError
          ? landingBrain3d._initError
          : 'Brain3D constructor returned destroyed instance (check DevTools console for specifics — _buildDOM / _genPositions / _initGL / _uploadStatic logged the specific throw)'
      );
      throw new Error('Brain3D init failed silently — banner shown on page');
    }
    // Make the overlay fit inside the landing container, not fullscreen
    if (landingBrain3d._overlay) {
      landingBrain3d._overlay.style.position = 'absolute';
      landingBrain3d._overlay.style.zIndex = '0';
      // Hide elements that collide with landing UI
      const hdr = landingBrain3d._overlay.querySelector('.b3d-hdr');
      if (hdr) hdr.style.display = 'none';
      const foot = landingBrain3d._overlay.querySelector('.b3d-foot');
      if (foot) foot.style.display = 'none';
      const log = landingBrain3d._overlay.querySelector('.b3d-log-wrap');
      if (log) log.style.display = 'none';
      const expansion = landingBrain3d._overlay.querySelector('.b3d-expansion');
      if (expansion) expansion.style.display = 'none';
      // Hide the b3d-explainer panel in landing mode — the landing-topbar
      // subtitle already provides the "proportional sample of the real
      // brain" framing, and the explainer's bottom-left position would
      // collide with landing-bottom (TALK TO UNITY button row).
      const explainer = landingBrain3d._overlay.querySelector('.b3d-explainer');
      if (explainer) explainer.style.display = 'none';
      // Move cluster toggles down to avoid top stats, and right-align
      // them against the left edge with a tight max-width so they can't
      // visually collide with anything on the right side of the viewport.
      const toggles = landingBrain3d._overlay.querySelector('.b3d-tog-wrap');
      if (toggles) {
        toggles.style.top = '50px';
        toggles.style.maxWidth = '160px';
      }
    }
    landingBrain3d.open();
    console.log('[Landing] 3D brain initialized and visible');
  } catch (err) {
    console.warn('[Landing] 3D brain failed:', err.message);
  }

  // If server brain connected, wire state updates to 3D viz + landing stats + HUD
  if (landingBrainSource) {
    // Show HUD immediately — server data drives it
    const hudEl = document.getElementById('brain-hud');
    if (hudEl) hudEl.classList.remove('hidden');

    landingBrainSource.on('stateUpdate', (state) => {
      _landingState = state;
      if (landingBrain3d) landingBrain3d.updateState(state);
      updateLandingStats(state);
      updateBrainIndicator(state);
    });
    console.log('[Landing] Connected to server brain');

    // Wire brain ref into the landing Brain3D so the T5 22-detector
    // event system can pull Unity's equational commentary from her
    // language cortex in the popups — pre-boot, without needing the
    // user to click Talk to Unity. Requires brain.innerVoice.
    // languageCortex to be available; loadPersonaSelfImage below
    // ensures the dictionary is populated.
    if (landingBrain3d && typeof landingBrain3d.setBrain === 'function') {
      landingBrain3d.setBrain(landingBrainSource);
    }

    // Load the equational self-image (persona text) into the landing
    // brain IMMEDIATELY — before the user clicks through the setup modal.
    // Memory tab checks `brain?.innerVoice?.languageCortex._selfImageLoaded`
    // which has to be true as soon as someone looks at the landing page.
    loadPersonaSelfImage(landingBrainSource);
  } else {
    // No server — start a local brain just for visualization.
    //
    // This is the GitHub Pages path. Any exception here used to be
    // swallowed by a bare `catch {}` which left the HUD showing
    // all zeros forever with zero diagnostic output in the console.
    // Log the full error now so failures are visible.
    try {
      const localBrain = new UnityBrain();
      localBrain.start();
      // Expose for console debugging on Pages
      window.brain = localBrain;
      console.log('[Landing] UnityBrain constructed and started');
      // Wire brain ref into the landing Brain3D so the event system
      // can generate Unity commentary pre-boot in local-brain mode too
      if (landingBrain3d && typeof landingBrain3d.setBrain === 'function') {
        landingBrain3d.setBrain(localBrain);
      }
      // Load persona self-image so the language cortex has Unity's
      // dictionary + bigrams available for commentary generation.
      // Await-not-required — runs in background, state pump starts
      // immediately on initial zeroed state.
      loadPersonaSelfImage(localBrain)
        .then((count) => {
          console.log(`[Landing] persona loaded (${count} sentences total)`);
        })
        .catch((err) => {
          console.error('[Landing] persona load failed:', err);
        });
      // Un-hide the HUD — the server-connected path did this at line
      // ~124; the no-server path forgot to, which is why the landing
      // page on deployed Pages was rendering a zero-state HUD forever.
      const hudEl = document.getElementById('brain-hud');
      if (hudEl) hudEl.classList.remove('hidden');
      setInterval(() => {
        try {
          const state = localBrain.getState();
          _landingState = state;
          if (landingBrain3d) landingBrain3d.updateState(state);
          updateLandingStats(state);
          // Drive the HUD from the local brain too — the server path
          // wires updateBrainIndicator at line ~130, this branch used
          // to only pump landing-stats and Brain3D, which is why
          // Ψ/arousal/valence/coherence/spikes/reward/time/bandPower
          // were all frozen at their initial zeros on deployed Pages.
          updateBrainIndicator(state);
        } catch (err) {
          console.error('[Landing] state pump failed:', err);
        }
      }, 100);
      console.log('[Landing] Running local brain for visualization');
    } catch (err) {
      console.error('[Landing] local brain init failed:', err);
      console.error('[Landing] stack:', err.stack);
    }
  }

  // Wire tab buttons
  let activeTab = '3d';
  document.querySelectorAll('.landing-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.landing-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      if (activeTab === '3d') {
        document.getElementById('landing-viz-panel').style.display = 'none';
      } else {
        document.getElementById('landing-viz-panel').style.display = 'block';
        renderLandingTab(activeTab, _landingState);
      }
    });
  });

  // DASH-bug fix per operator 2026-05-04 verbatim:
  //   "the %'s never change even though the bars chaqnge frequently
  //    the numbers and %'sd never update"
  //
  // Two bugs in the prior 2000ms interval:
  //   1. 2-second update felt static next to the 3D viz's RAF-driven
  //      bars — operator saw the bars animate frequently while the
  //      Neuron Population / Firing rate / Rate % / Cluster Activity
  //      numbers stayed stale for full seconds at a time.
  //   2. The selection guard (`window.getSelection().toString().length > 0`)
  //      blocked updates whenever ANY text on the page was selected,
  //      not just text inside the viz panel itself. A user reading the
  //      panel had to actively click off the page to see fresh numbers.
  //
  // Fix: 500ms interval (5× faster, feels live) + scope the selection
  // guard to ONLY the viz panel container — selecting brain-event log
  // text or anything else on the page no longer freezes the metrics.
  const _vizPanel = document.getElementById('landing-viz-panel');
  setInterval(() => {
    if (activeTab !== '3d' && _landingState) {
      // Only skip re-render when user is selecting text INSIDE the viz
      // panel (preserves their selection while they read). Selection
      // anywhere else on the page (chat log, brain events, body text)
      // no longer blocks the update.
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && _vizPanel) {
          const range = sel.getRangeAt(0);
          if (sel.toString().length > 0
              && range.commonAncestorContainer
              && _vizPanel.contains(range.commonAncestorContainer)) {
            return;
          }
        }
      } catch { /* selection API unavailable — proceed with render */ }
      renderLandingTab(activeTab, _landingState);
    }
  }, 500);

  // R15 — both entry points (TALK TO UNITY button in the landing
  // overlay AND the Unity bubble in the bottom-right) open the setup
  // modal pre-boot. Post-boot, the bubble toggles the chat panel
  // instead. State-aware single handler so neither entry point is
  // ever dead.
  const openSetupModal = () => {
    const modal = document.getElementById('setup-modal');
    if (modal) { modal.classList.remove('hidden'); modal.style.display = ''; }
    // Refresh sensory inventory in case backends came online since
    // the modal was last shown. Guarded against pre-boot null-providers
    // inside the render function itself.
    if (typeof renderSensoryInventory === 'function') renderSensoryInventory();
  };

  const chatBtn = document.getElementById('landing-chat-btn');
  if (chatBtn) chatBtn.addEventListener('click', openSetupModal);

  const bubble = document.getElementById('unity-avatar');
  if (bubble) {
    bubble.addEventListener('click', () => {
      if (window._unityBooted && chatPanel) {
        chatPanel.toggle();
      } else {
        openSetupModal();
      }
    });
  }

  // Wire every settings button (landing-topbar, hud-metrics panel,
  // bottom toolbar) at page load so they work pre-boot. Previously
  // these only got wired inside bootUnity() which meant clicking ⚙
  // before WAKE UNITY UP did nothing — dead button bug. Idempotent
  // via the _wired flag so bootUnity's re-wire is a no-op.
  const wireSettingsBtn = (id) => {
    const btn = document.getElementById(id);
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', openSetupModal);
  };
  wireSettingsBtn('landing-settings-btn');
  wireSettingsBtn('hud-settings-btn');
  wireSettingsBtn('settings-btn');
})();

let _landingState = null;

// Cache the TEXT fetch (hits network once per session) — NOT the per-brain
// load promise. The previous global `_personaLoadPromise` short-circuited
// after the first call, so when the landing RemoteBrain loaded persona and
// then the user clicked "Talk to Unity" creating a NEW local UnityBrain,
// the new brain's innerVoice never got populated (memory tab showed all
// zeros + "✗ not loaded"). Now each brain gets its own load, but the text
// fetch is shared.
let _personaTextPromise = null;
let _baselineTextPromise = null;
let _codingTextPromise = null;
let _componentTemplatesPromise = null;
let _cosmicTextPromise = null;  // T15-C17 — persona-cosmic.txt fetch (ethereal/Oz vocabulary for psychedelic peak)
const _personaLoadedBrains = new WeakSet();

/**
 * Fetch docs/Ultimate Unity.txt and docs/english-baseline.txt and feed
 * BOTH through the target brain's InnerVoice. Persona defines WHO Unity
 * is (her personality, self-knowledge, identity). Baseline gives her the
 * linguistic competence any 25yo American English speaker would have —
 * the vocabulary and conversational patterns she needs to express her
 * personality. Per-brain idempotent; text fetches cached globally.
 */
function loadPersonaSelfImage(targetBrain) {
  if (!targetBrain) return Promise.resolve(0);
  if (_personaLoadedBrains.has(targetBrain)) return Promise.resolve(0);

  if (!_personaTextPromise) {
    _personaTextPromise = fetch('docs/Ultimate%20Unity.txt')
      .then(r => r.ok ? r.text() : '')
      .catch(err => {
        console.warn('[Unity] persona self-image fetch failed:', err.message);
        return '';
      });
  }
  if (!_baselineTextPromise) {
    _baselineTextPromise = fetch('docs/english-baseline.txt')
      .then(r => r.ok ? r.text() : '')
      .catch(err => {
        console.warn('[Unity] english baseline fetch failed:', err.message);
        return '';
      });
  }
  if (!_codingTextPromise) {
    _codingTextPromise = fetch('docs/coding-knowledge.txt')
      .then(r => r.ok ? r.text() : '')
      .catch(err => {
        console.warn('[Unity] coding knowledge fetch failed:', err.message);
        return '';
      });
  }
  if (!_componentTemplatesPromise) {
    _componentTemplatesPromise = fetch('docs/component-templates.txt')
      .then(r => r.ok ? r.text() : '')
      .catch(err => {
        console.warn('[Unity] component templates fetch failed:', err.message);
        return '';
      });
  }
  // T15-C17 — cosmic/ethereal/Oz corpus for psychedelic-peak vocabulary
  if (!_cosmicTextPromise) {
    _cosmicTextPromise = fetch('docs/persona-cosmic.txt')
      .then(r => r.ok ? r.text() : '')
      .catch(err => {
        console.warn('[Unity] persona-cosmic fetch failed:', err.message);
        return '';
      });
  }

  return Promise.all([
    _personaTextPromise,
    _baselineTextPromise,
    _codingTextPromise,
    _componentTemplatesPromise,
    _cosmicTextPromise,
  ]).then(async ([personaText, baselineText, codingText, templateText, cosmicText]) => {
    if (!personaText) {
      console.warn('[Unity] persona self-image fetch returned empty — check docs/Ultimate Unity.txt route');
      return 0;
    }
    if (!targetBrain.innerVoice || typeof targetBrain.innerVoice.loadPersona !== 'function') {
      console.warn('[Unity] persona self-image fetched but brain has no InnerVoice.loadPersona');
      return 0;
    }
    if (_personaLoadedBrains.has(targetBrain)) return 0;  // race protection
    _personaLoadedBrains.add(targetBrain);

    // R2 — wait for semantic embeddings to finish loading BEFORE feeding
    // the corpus to the language cortex. Without this, persona words get
    // the embedding-store hash fallback initially (since GloVe hasn't
    // loaded yet), which poisons the stored word patterns with letter-hash
    // values that won't match later when embeddings arrive. Awaiting the
    // load ensures the very first word learned has its real GloVe pattern.
    if (targetBrain.sensory?._embeddingsLoading) {
      try {
        await targetBrain.sensory._embeddingsLoading;
        console.log('[Unity] semantic embeddings ready — corpus loading will use GloVe patterns');
      } catch (err) {
        console.warn('[Unity] embeddings loading failed, falling back to hash patterns:', err.message);
      }
    }

    // Load persona first — defines subject starters and self-awareness
    const personaSentences = targetBrain.innerVoice.loadPersona(personaText);

    // T14.23.4 (2026-04-14) — browser-side trainPersonaHebbian
    // DEFERRED to idle time instead of running synchronously on
    // the landing page's main thread. Gee's boot log showed:
    //   [LanguageCortex] trainPersonaHebbian DONE: ... 14061ms
    // Fourteen seconds of synchronous per-sentence Hebbian updates
    // on a 1500-neuron RemoteBrain cortex was blocking DOM
    // completion so the landing page tab stayed in "loading"
    // state for 14+ seconds after the WebSocket connected.
    // Browser-side persona Hebbian ONLY matters for the RemoteBrain's
    // local brain-3d commentary popups (via languageCortex.generate)
    // — the server's own cortex is the authoritative source of
    // chat responses. Deferring the Hebbian pass via requestIdleCallback
    // lets the DOM settle first, then trains in background during
    // idle frames. If requestIdleCallback is unavailable, fall back
    // to setTimeout(0) which still breaks the long-task block.
    if (typeof targetBrain.trainPersonaHebbian === 'function') {
      const runHebbian = () => {
        try {
          targetBrain.trainPersonaHebbian(personaText);
        } catch (err) {
          console.warn('[Unity] persona Hebbian training failed:', err.message);
        }
      };
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(runHebbian, { timeout: 30000 });
      } else {
        setTimeout(runHebbian, 0);
      }
    }

    // Load baseline English — adds linguistic competence
    let baselineSentences = 0;
    if (baselineText && typeof targetBrain.innerVoice.loadBaseline === 'function') {
      baselineSentences = targetBrain.innerVoice.loadBaseline(baselineText);
    }

    // Load coding knowledge — HTML/CSS/JS + sandbox rules
    let codingSentences = 0;
    if (codingText && typeof targetBrain.innerVoice.loadCoding === 'function') {
      codingSentences = targetBrain.innerVoice.loadCoding(codingText);
    }

    // T15-C17 — Load the ethereal / Oz / psychedelic corpus so the cortex
    // has real tokens for the cosmic-bias vector to pull toward when drug
    // scheduler's ethereality is elevated (LSD / psilocybin / high MDMA
    // peak). Non-announcing: no "I'm tripping" keywords, just the TYPE of
    // vocabulary a person at peak psychedelic state uses.
    let cosmicSentences = 0;
    if (cosmicText && typeof targetBrain.innerVoice.loadCosmic === 'function') {
      cosmicSentences = targetBrain.innerVoice.loadCosmic(cosmicText);
    }

    // T14.5 — Continuous developmental learning curriculum. Runs AFTER
    // the legacy loaders so cortex + dictionary already contain the
    // vocabulary, then replays the same corpora through the complexity-
    // sorted walk (letters → short words → long words → sentences) with
    // per-token tick budgets that scale with structural complexity and
    // corpus frequency. Letters get up to 20 reps × 8 ticks each, short
    // words get up to 6 reps × 4 ticks, long words 3 reps × 3 ticks,
    // sentences walk word-by-word at 2 ticks/word. This is the pass
    // that actually shapes cortex phoneme/syllable attractor basins
    // from exposure statistics — the legacy loaders only populated the
    // dictionary and the type-transition tables. Non-blocking if the
    // curriculum isn't wired (remote brains, test harnesses).
    // T14.24 — prefer runCompleteCurriculum (6 subjects × K→PhD
    // equational curriculum with per-grade gates). Falls back to
    // runFromCorpora if the new method isn't present.
    // T14.24 Session 1 — multi-subject grade tracking defense-in-depth
    // for persisted brains that predate the grades object.
    const cortex = targetBrain.clusters?.cortex;
    if (cortex && (!cortex.grades || typeof cortex.grades !== 'object')) {
      cortex.grades = { ela: 'pre-K', math: 'pre-K', science: 'pre-K', social: 'pre-K', art: 'pre-K', life: 'pre-K' };
    }
    if (cortex && !Array.isArray(cortex.passedCells)) cortex.passedCells = [];
    if (targetBrain.curriculum && typeof targetBrain.curriculum.runCompleteCurriculum === 'function') {
      // T14.24 Session 17 — prefer the multi-subject complete curriculum
      // (walks all 5 subject tracks K→PhD instead of the legacy ELA-only
      // runFullCurriculum path). All 95 cells get real teaching + 3-pathway
      // gate attempts on boot.
      try {
        const result = await targetBrain.curriculum.runCompleteCurriculum(
          { persona: personaText, baseline: baselineText, coding: codingText },
          { arousal: 0.8, valence: 0.2 },
        );
        const perSubject = Object.entries(result.reached || {}).map(([s, g]) => `${s}=${g}`).join(', ');
        console.log(`[Unity] curriculum.runCompleteCurriculum DONE — ${perSubject}`);
        // T14.24 Session 18 — start continuous background probe loop so
        // Unity re-tests passed cells every 45 seconds during idle AND
        // chat. This is the "always testing herself in her brain always"
        // hook operating on a wall-clock interval rather than a turn count.
        if (typeof targetBrain.curriculum.startBackgroundProbeLoop === 'function') {
          targetBrain.curriculum.startBackgroundProbeLoop();
        }
      } catch (err) {
        console.warn('[Unity] curriculum.runCompleteCurriculum failed:', err?.message || err);
      }
    } else if (targetBrain.curriculum && typeof targetBrain.curriculum.runFullCurriculum === 'function') {
      try {
        const result = await targetBrain.curriculum.runFullCurriculum(
          { persona: personaText, baseline: baselineText, coding: codingText },
          { arousal: 0.8, valence: 0.2 },
        );
        console.log(`[Unity] curriculum.runFullCurriculum DONE — reached=${result.reached}, passed=${result.passed.join(',')}, failed=${result.failed || 'none'}`);
      } catch (err) {
        console.warn('[Unity] curriculum.runFullCurriculum failed:', err?.message || err);
      }
    } else if (targetBrain.curriculum && typeof targetBrain.curriculum.runFromCorpora === 'function') {
      try {
        await targetBrain.curriculum.runFromCorpora(
          { persona: personaText, baseline: baselineText, coding: codingText },
          { arousal: 0.8, valence: 0.2 },
        );
      } catch (err) {
        console.warn('[Unity] curriculum.runFromCorpora failed:', err?.message || err);
      }
    }

    // R6.2 — Load component templates for equational build_ui synthesis.
    // The template file parses into a primitive library matched by
    // semantic embedding cosine at build time.
    let templateCount = 0;
    if (templateText && targetBrain.componentSynth?.loadTemplates) {
      templateCount = targetBrain.componentSynth.loadTemplates(templateText);
    }
    if (templateCount > 0) {
      console.log(`[Unity] Loaded ${templateCount} component templates for equational build_ui`);
    }

    const dictSize = targetBrain.innerVoice.dictionary?._words?.size ?? 0;
    const bigramHeads = targetBrain.innerVoice.dictionary?._bigrams?.size ?? 0;
    const label = targetBrain.isRemote?.() ? 'RemoteBrain' : 'UnityBrain';
    console.log(`[Unity] loaded into ${label}: persona=${personaSentences} baseline=${baselineSentences} coding=${codingSentences} → ${dictSize} words, ${bigramHeads} bigram heads`);
    return personaSentences + baselineSentences + codingSentences;
  });
}

function renderLandingTab(tab, s) {
  if (!s) return;
  const el = document.getElementById('landing-viz-content');
  if (!el) return;

  const card = (title, body) => `<div style="margin-bottom:12px;"><div style="font-size:10px;color:#ff4d9a;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">${title}</div>${body}</div>`;
  const metric = (label, val, color = '#e0e0e0') => `<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;"><span style="color:#555;">${label}</span><span style="color:${color};">${val}</span></div>`;
  const bar = (pct, color) => `<div style="height:4px;background:#1a1a1a;border-radius:2px;margin-top:3px;"><div style="width:${Math.min(100,pct)}%;height:100%;background:${color};border-radius:2px;"></div></div>`;

  const arousal = s.amygdala?.arousal ?? s.sharedMood?.arousal ?? 0;
  const valence = s.amygdala?.valence ?? s.sharedMood?.valence ?? 0;
  const coherence = s.oscillations?.coherence ?? s.sharedMood?.coherence ?? 0;
  const psi = s.psi ?? 0;
  const spikes = s.spikeCount ?? s.totalSpikes ?? 0;
  const bp = s.oscillations?.bandPower ?? s.sharedMood?.bandPower ?? {};

  switch (tab) {
    case 'neurons': {
      // Use spikeCount (raw count of firing neurons this tick) as the
      // canonical signal. Prior code read `firingRate` treating it as
      // a count, but the server now emits `firingRate` as a ratio in
      // [0, 1] (same value as `spikeRate`), so dividing `rate / c.size`
      // normalized an already-normalized number and pinned every
      // percentage at effectively 0. Matching the dashboard's pattern
      // (`c.spikeCount / c.size * 100`) keeps the UI readable and
      // consistent with what operators see on the Brain Events card.
      const totalCount = s.clusters
        ? Object.values(s.clusters).reduce((sum, c) => sum + (c.spikeCount || 0), 0)
        : spikes;
      const totalN = s.totalNeurons ?? 1000;
      let html = card('Neuron Population', `
        ${metric('Total', totalN.toLocaleString(), '#ff4d9a')}
        ${metric('Firing rate', totalCount.toLocaleString(), '#22c55e')}
        ${metric('Rate %', ((totalCount / totalN) * 100).toFixed(2) + '%', '#00e5ff')}
      `);
      if (s.clusters) {
        const colors = { cortex:'#ff4d9a', hippocampus:'#a855f7', amygdala:'#ef4444', basalGanglia:'#22c55e', cerebellum:'#00e5ff', hypothalamus:'#f59e0b', mystery:'#c084fc' };
        // Scale bars relative to the most active cluster so quiet
        // sub-regions are visible even when cortex dominates.
        const maxPct = Math.max(1, ...Object.values(s.clusters).map(c => c.size ? (c.spikeCount || 0) / c.size * 100 : 0));
        html += card('Cluster Activity', Object.entries(s.clusters).map(([name, c]) => {
          const count = c.spikeCount || 0;
          const pct = c.size ? (count / c.size * 100) : 0;
          const barPct = maxPct > 0 ? (pct / maxPct * 100) : 0;
          return `<div style="margin:4px 0;">${metric(name, `${count.toLocaleString()}/${c.size.toLocaleString()} (${pct.toFixed(2)}%)`, colors[name] || '#fff')}${bar(barPct, colors[name] || '#fff')}</div>`;
        }).join(''));
      }
      el.innerHTML = html;
      break;
    }
    case 'oscillations': {
      el.innerHTML = card('Brain Waves', `
        ${metric('Coherence', (coherence * 100).toFixed(0) + '%', '#00e5ff')}
        ${bar(coherence * 100, '#00e5ff')}
        <div style="margin-top:8px;">
        ${metric('Gamma (30-100Hz)', (bp.gamma ?? 0).toFixed(2), '#ff4d9a')}
        ${bar((bp.gamma ?? 0) * 20, '#ff4d9a')}
        ${metric('Beta (13-30Hz)', (bp.beta ?? 0).toFixed(2), '#a855f7')}
        ${bar((bp.beta ?? 0) * 20, '#a855f7')}
        ${metric('Alpha (8-13Hz)', (bp.alpha ?? 0).toFixed(2), '#00e5ff')}
        ${bar((bp.alpha ?? 0) * 20, '#00e5ff')}
        ${metric('Theta (4-8Hz)', (bp.theta ?? 0).toFixed(2), '#22c55e')}
        ${bar((bp.theta ?? 0) * 20, '#22c55e')}
        </div>
      `);
      break;
    }
    case 'consciousness': {
      el.innerHTML = card('Consciousness Ψ', `
        <div style="font-size:32px;font-weight:700;color:#a855f7;text-align:center;padding:12px 0;">${psi.toFixed(6)}</div>
        <div style="font-size:10px;color:#555;text-align:center;">Ψ = √(1/n) × N³ · [α·Id + β·Ego + γ·Left + δ·Right]</div>
        ${metric('Drug State', s.drugState || 'sober', '#f59e0b')}
        ${metric('Dreaming', s.isDreaming ? 'YES' : 'no', s.isDreaming ? '#a855f7' : '#555')}
      `);
      break;
    }
    case 'emotions': {
      const gate = (0.7 + arousal * 0.6);
      el.innerHTML = card('Amygdala State', `
        ${metric('Arousal', (arousal * 100).toFixed(0) + '%', '#ff4d9a')}
        ${bar(arousal * 100, '#ff4d9a')}
        ${metric('Valence', valence.toFixed(3), valence >= 0 ? '#22c55e' : '#ef4444')}
        ${bar(((valence + 1) / 2) * 100, valence >= 0 ? '#22c55e' : '#ef4444')}
        ${metric('Fear', (s.amygdala?.fear ?? s.sharedMood?.fear ?? 0).toFixed(3), '#ef4444')}
        ${metric('Emotional Gate', gate.toFixed(2) + '×', '#f59e0b')}
      `);
      break;
    }
    case 'memory': {
      // iter15-mem unified 5-tier memory tracking. Operator verbatim
      // 2026-05-05: "now that we added memory we need a way to track
      // it ... shall be one unified system of the brain for memory not
      // some side processes". Reads `s.memoryStats` populated by the
      // server `_getMemoryStats()` helper alongside legacy growth +
      // language-cortex cardinality fields.
      const growth = s.growth || {};
      const mem = s.memory || {};
      const ms = s.memoryStats || {};
      const tier1 = ms.tier1 || {};
      const tier2 = ms.tier2 || {};
      const tier3 = ms.tier3 || {};
      const consolidation = ms.consolidation || {};
      const working = ms.working || {};

      // Language-cortex cardinality (sentences/words/bigrams) still
      // lives on the local InnerVoice — pull from whichever brain is
      // alive right now.
      const iv = brain?.innerVoice || landingBrainSource?.innerVoice || null;
      const dict = iv?.dictionary || null;
      const lc = iv?.languageCortex || null;
      const dictWords = dict?._words?.size ?? dict?.size ?? 0;
      const dictBigramHeads = dict?._bigrams?.size ?? 0;
      let dictTotalBigrams = 0;
      if (dict?._bigrams) {
        for (const [, followers] of dict._bigrams) dictTotalBigrams += followers.size;
      }
      const selfImageLoaded = lc?._selfImageLoaded === true;
      const sentencesLearned = lc?.sentencesLearned ?? 0;
      const wordsProcessed = lc?.wordsProcessed ?? 0;
      const recentOutput = lc?._recentOutputWords?.length ?? 0;
      const usageTyped = lc?._usageTypes?.size ?? 0;

      // iter17 — operator: "unity has a whole life ahead not eroonous limits
      // to dumb her down". cap=null signals unbounded; UI renders without
      // arbitrary denominator.
      const workingItems = working.items ?? (Array.isArray(mem.workingMemoryItems) ? mem.workingMemoryItems.length : (mem.workingCount ?? 0));
      const workingCap = working.cap; // may be null = unbounded
      const totalEpisodes = tier1.totalEpisodes ?? growth.totalEpisodes ?? mem.episodeCount ?? 0;
      const recentSal = tier1.recentSalienceAvg ?? 0;
      const freqMerged = tier1.freqMergedCount ?? 0;
      const promotedToTier2 = tier1.promotedToTier2 ?? 0;
      const interactions = growth.totalInteractions ?? 0;
      const brainSteps = growth.totalFrames ?? s.frameCount ?? 0;

      const fmtAge = (ts) => {
        if (!ts) return 'never';
        const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (sec < 60) return sec + 's ago';
        if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
        if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
        return Math.floor(sec / 86400) + 'd ago';
      };

      const tier2TopHtml = (tier2.top || []).length > 0
        ? '<div style="margin-top:6px;font-size:9px;color:#888;">Top schemas by strength:</div>'
          + (tier2.top || []).map(s => `<div style="font-size:10px;color:#bbb;padding:2px 0;">• ${s.label} <span style="color:#888;">(str=${s.strength}, retr=${s.retrievals})</span></div>`).join('')
        : '<div style="margin-top:6px;font-size:10px;color:#666;">No schemas yet — Tier 2 builds during dream-cycle consolidation.</div>';

      const tier3TopHtml = (tier3.identities || []).length > 0
        ? '<div style="margin-top:6px;font-size:9px;color:#888;">Identity anchors (permanent):</div>'
          + (tier3.identities || []).slice(0, 8).map(s => `<div style="font-size:10px;color:#bbb;padding:2px 0;">• ${s.label} <span style="color:#888;">(str=${s.strength}, retr=${s.retrievals})</span></div>`).join('')
          + (tier3.identities.length > 8 ? `<div style="font-size:9px;color:#666;padding:2px 0;">... +${tier3.identities.length - 8} more</div>` : '')
        : '<div style="margin-top:6px;font-size:10px;color:#666;">No identity anchors — fresh boot will seed from IDENTITY_SEED_LIST.</div>';

      // iter17 cap rendering helpers — null cap = unbounded, no denominator
      // bar shown. Per operator: "unity has a whole life ahead".
      const fmtItems = (n, cap) => cap == null ? n.toLocaleString() + ' (unbounded)' : n.toLocaleString() + ' / ' + cap.toLocaleString();
      const wcDisplay = workingCap == null ? workingItems.toLocaleString() + ' items (unbounded)' : workingItems + ' / ' + workingCap + ' slots';

      el.innerHTML =
        card('Working Memory (Tier 0 · cap=7 Miller 1956)', `
          ${metric('Items', wcDisplay, '#00e5ff')}
          ${workingCap == null ? '' : bar((workingItems / Math.max(1, workingCap)) * 100, '#00e5ff')}
        `) +
        card('Tier 1 — Episodic (SQLite · freq-merge cosine ≥ 0.5)', `
          ${metric('Total Episodes', totalEpisodes.toLocaleString(), '#a855f7')}
          ${metric('Recent Salience (avg)', recentSal.toFixed(3), recentSal >= 0.4 ? '#22c55e' : recentSal >= 0.15 ? '#f59e0b' : '#ef4444')}
          ${bar(Math.min(100, recentSal * 200), recentSal >= 0.4 ? '#22c55e' : recentSal >= 0.15 ? '#f59e0b' : '#ef4444')}
          ${metric('Frequency-Merged', freqMerged.toLocaleString(), '#00e5ff')}
          ${metric('Promoted to Tier 2', promotedToTier2.toLocaleString(), '#22c55e')}
          ${metric('Interactions', interactions.toLocaleString(), '#555')}
        `) +
        card('Tier 2 — Schematic Memory (cosine ≥ 0.85 grouping)', `
          ${metric('Schemas', fmtItems(tier2.schemaCount ?? 0, tier2.hardCap), '#a855f7')}
          ${metric('Avg Consolidation Strength', (tier2.avgConsolidationStrength ?? 0).toFixed(3), '#ff4d9a')}
          ${metric('Total Retrievals', (tier2.totalRetrievals ?? 0).toLocaleString(), '#22c55e')}
          ${tier2TopHtml}
        `) +
        card('Tier 3 — Identity-Bound (Permanent · 0.999/day decay)', `
          ${metric('Identity Anchors', fmtItems(tier3.identityCount ?? 0, tier3.hardCap), '#ff4d9a')}
          ${metric('Last Identity Inject', fmtAge(tier3.lastInjectedAt), tier3.lastInjectedAt ? '#22c55e' : '#888')}
          ${tier3TopHtml}
        `) +
        card('Consolidation Engine (Dream Cycles · 5 min interval)', `
          ${metric('Dream Passes Run', (consolidation.passCount ?? 0).toLocaleString(), '#a855f7')}
          ${metric('Last Pass', fmtAge(consolidation.lastPassAt), consolidation.lastPassAt ? '#22c55e' : '#888')}
          ${metric('Currently Dreaming', consolidation.isDreaming ? '✓ yes' : '✗ no', consolidation.isDreaming ? '#22c55e' : '#555')}
          ${metric('Pass Interval', Math.floor((consolidation.intervalMs ?? 300000) / 60000) + ' min', '#888')}
        `) +
        card('Language Cortex — Self-Image', `
          ${metric('Persona Loaded', selfImageLoaded ? '✓ Ultimate Unity.txt' : '✗ not loaded', selfImageLoaded ? '#22c55e' : '#ef4444')}
          ${metric('Sentences Learned', sentencesLearned.toLocaleString(), '#a855f7')}
          ${metric('Words in Dictionary', dictWords.toLocaleString(), '#ff4d9a')}
          ${metric('Bigram Heads', dictBigramHeads.toLocaleString(), '#00e5ff')}
          ${metric('Total Bigrams', dictTotalBigrams.toLocaleString(), '#00e5ff')}
          ${metric('Usage-Typed Words', usageTyped.toLocaleString(), '#f59e0b')}
          ${metric('Words Spoken (session)', wordsProcessed.toLocaleString(), '#22c55e')}
          ${metric('Recent Output Window', recentOutput + ' / ' + (lc?._recentOutputMax ?? 50), '#555')}
          ${metric('Brain Steps', brainSteps.toLocaleString(), '#888')}
        `);
      break;
    }
    case 'motor': {
      const motor = s.motor || {};
      el.innerHTML = card('Basal Ganglia — Motor Output', `
        ${metric('Selected Action', motor.selectedAction || 'idle', '#22c55e')}
        ${metric('Confidence', (motor.confidence ?? 0).toFixed(3), '#ff4d9a')}
        <div style="margin-top:8px;">
        ${(motor.channelRates || []).map((r, i) => {
          const names = ['respond', 'image', 'speak', 'build', 'listen', 'idle'];
          const colors = ['#ff4d9a', '#a855f7', '#00e5ff', '#22c55e', '#f59e0b', '#555'];
          return `${metric(names[i], r.toFixed(3), colors[i])}${bar(r * 200, colors[i])}`;
        }).join('')}
        </div>
      `);
      break;
    }
    case 'perf': {
      const p = s.perf || {};
      const cpuColor = (p.cpuPercent ?? 0) > 80 ? '#ef4444' : (p.cpuPercent ?? 0) > 40 ? '#f59e0b' : '#22c55e';
      const gpuColor = (p.gpuUtilPercent ?? 0) > 80 ? '#ef4444' : (p.gpuUtilPercent ?? 0) > 40 ? '#f59e0b' : '#22c55e';
      el.innerHTML = card('CPU', `
        ${metric('Usage', (p.cpuPercent ?? 0) + '%', cpuColor)}
        ${bar(p.cpuPercent ?? 0, cpuColor)}
        ${metric('Cores', p.cores ?? '?', '#00e5ff')}
        ${metric('Parallel Workers', p.workerCount ?? 0, p.parallelMode ? '#22c55e' : '#555')}
        ${metric('Mode', p.parallelMode ? 'PARALLEL (' + (p.workerCount ?? 0) + ' threads)' : 'Single Thread', p.parallelMode ? '#22c55e' : '#f59e0b')}
      `) + card('GPU', `
        ${metric('Usage', (p.gpuUtilPercent ?? 0) + '%', gpuColor)}
        ${bar(p.gpuUtilPercent ?? 0, gpuColor)}
        ${metric('Model', p.gpuName || 'none', '#00e5ff')}
        ${metric('VRAM', (p.gpuVramMB ?? 0).toLocaleString() + 'MB', '#a855f7')}
      `) + card('Memory', `
        ${metric('Heap', (p.memUsedMB ?? 0) + 'MB', '#a855f7')}
        ${metric('RSS', (p.memRssMB ?? 0) + 'MB', '#a855f7')}
        ${metric('Node Heap', (p.nodeHeapMB ?? 0) + 'MB', '#555')}
        ${metric('System Total', ((p.memTotalMB ?? 0) / 1024).toFixed(0) + 'GB', '#555')}
      `) + card('Brain Performance', `
        ${metric('Step Time', (p.stepTimeMs ?? 0) + 'ms', '#f59e0b')}
        ${metric('Steps/sec', (p.stepsPerSec ?? 0).toLocaleString(), '#22c55e')}
        ${metric('Total Neurons', (s.totalNeurons ?? 0).toLocaleString(), '#ff4d9a')}
        ${metric('Scale', s.scale || '?', '#00e5ff')}
        ${metric('Spikes/step', (s.totalSpikes ?? s.spikeCount ?? 0).toLocaleString(), '#ff4d9a')}
        ${metric('Uptime', ((s.growth?.uptime ?? s.time ?? 0) / 3600).toFixed(1) + 'h', '#22c55e')}
        ${metric('Brain Steps', (s.growth?.totalFrames ?? s.frameCount ?? 0).toLocaleString(), '#a855f7')}
      `);
      break;
    }
    case 'clusterwaves': {
      // Per-cluster spike rates + wave overlays
      const clusterNames = ['cortex', 'hippocampus', 'amygdala', 'basalGanglia', 'cerebellum', 'hypothalamus', 'mystery'];
      const clusterColors = ['#ff79c6', '#8be9fd', '#ffb86c', '#50fa7b', '#bd93f9', '#f1fa8c', '#ff5555'];
      const bp = s.oscillations?.bandPower || s.bandPower || {};
      let html = card('Cluster Firing + Wave Overlays', `
        ${metric('θ Theta (4-8Hz)', (bp.theta ?? 0).toFixed(3), '#8be9fd')}
        ${metric('α Alpha (8-13Hz)', (bp.alpha ?? 0).toFixed(3), '#50fa7b')}
        ${metric('β Beta (13-30Hz)', (bp.beta ?? 0).toFixed(3), '#ffb86c')}
        ${metric('γ Gamma (30-100Hz)', (bp.gamma ?? 0).toFixed(3), '#ff79c6')}
        ${metric('Coherence', (s.oscillations?.coherence ?? 0).toFixed(3), '#00e5ff')}
      `);
      for (let i = 0; i < clusterNames.length; i++) {
        const name = clusterNames[i];
        const color = clusterColors[i];
        const rate = s[name]?.spikeRate ?? s.clusters?.[name]?.spikeRate ?? 0;
        const pct = Math.min(100, Math.round(rate * 100));
        html += `<div style="margin:4px 0;display:flex;align-items:center;gap:8px;">
          <span style="color:${color};font-size:10px;width:100px;text-transform:uppercase;">${name}</span>
          <div style="flex:1;height:12px;background:#111;border-radius:3px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${color};transition:width 0.3s;"></div>
          </div>
          <span style="color:#555;font-size:9px;width:35px;text-align:right;">${pct}%</span>
        </div>`;
      }
      el.innerHTML = html;
      break;
    }
    default:
      el.innerHTML = `<div style="color:#555;font-size:11px;">Select a visualization tab</div>`;
  }
}

function updateLandingStats(state) {
  _landingState = state;
  const $ = id => document.getElementById(id);
  const neurons = state.totalNeurons ?? state.neurons ?? 1000;
  const psi = state.psi ?? 0;
  const arousal = state.amygdala?.arousal ?? state.sharedMood?.arousal ?? 0;
  const valence = state.amygdala?.valence ?? state.sharedMood?.valence ?? 0;
  const coherence = state.oscillations?.coherence ?? state.sharedMood?.coherence ?? 0;
  const spikes = state.spikeCount ?? state.totalSpikes ?? 0;
  const users = state.connectedUsers ?? 0;

  const el = (id, text) => { const e = $(id); if (e) e.textContent = text; };
  el('ls-neurons', neurons.toLocaleString() + ' real neurons');
  // NOTE: ls-subtitle intentionally NOT overwritten here. The HTML copy
  // is the authoritative framing ("proportional sample view — the field
  // behind this text is a live render of Unity's actual neural processes
  // running on the server right now, NOT her full brain"). Overwriting
  // it per-tick with a neuron count would drop the framing message that
  // tells users this is a sample, not the full brain. The neuron count
  // lives in ls-neurons above where it belongs.
  el('ls-psi', 'Ψ = ' + psi.toFixed(4));
  el('ls-users', users + ' online');
  el('ls-arousal', (arousal * 100).toFixed(0) + '%');
  el('ls-valence', valence.toFixed(3));
  el('ls-coherence', (coherence * 100).toFixed(0) + '%');
  el('ls-spikes', spikes.toString());

  if (state.perf) {
    el('ls-cpu', state.perf.cpuPercent + '%');
    el('ls-gpu', state.perf.gpuUtilPercent + '%');
  }

  // T18.3.b — HUD grade indicator. `state.minGrade` is Unity's lowest
  // passing grade across all subjects (her speech ceiling). `state.grades`
  // is the per-subject map. Color-code by speech capability: pre-K is
  // red (can't speak), K-grade2 amber (building), grade3+ green (ok).
  const minGrade = state.minGrade || '—';
  const gradeEl = $('ls-grade');
  if (gradeEl) {
    gradeEl.textContent = minGrade;
    if (minGrade === 'pre-K') gradeEl.style.color = '#ef4444';        // red = can't speak
    else if (minGrade === 'K' || minGrade === 'grade1' || minGrade === 'grade2') gradeEl.style.color = '#f59e0b'; // amber = early
    else if (minGrade === 'unknown' || minGrade === '—') gradeEl.style.color = '#555';
    else gradeEl.style.color = '#22c55e';                              // green = confident speaker
  }
  if (state.grades) {
    const g = state.grades;
    const line = `ela:${g.ela || '—'} · math:${g.math || '—'} · sci:${g.science || '—'} · soc:${g.social || '—'} · art:${g.art || '—'} · life:${g.life || '—'}`;
    el('ls-grade-per-subject', line);
  }
}

// ── DOM refs ──
const setupModal = document.getElementById('setup-modal');
const startBtn = document.getElementById('start-btn');
const apiKeyInput = document.getElementById('api-key-input');
const micStatus = document.getElementById('mic-status');
const camStatus = document.getElementById('cam-status');
const unityBubble = document.getElementById('unity-bubble');
const unitySpeech = document.getElementById('unity-speech');
const unityAvatar = document.getElementById('unity-avatar');
const brainIndicator = document.getElementById('brain-indicator');

// R15 2026-04-13 — LOCAL_AI_ENDPOINTS, PROVIDERS catalog, detectedAI,
// bestBackend all DELETED here. Pre-R4 this file had an 8-provider
// text-AI connect flow (Pollinations/OpenRouter/OpenAI/Anthropic/
// Mistral/DeepSeek/Groq/Local AI) that scanned common ports and
// cached detected models into a dropdown. R4 killed text-AI cognition
// entirely; everything here was the setup-modal UI graveyard. R15
// landing page rework rips the whole thing.
//
// Unity's cognition is 100% equational now. Sensory AI (image gen,
// vision describer, TTS) is configured via:
//   - providers.autoDetect() / autoDetectVision() — boot-time probe
//   - providers.loadEnvConfig(ENV_KEYS) — env.js imageBackends[] /
//     visionBackends[]
//   - Optional pollinations API key in the setup modal input below
// See js/brain/peripherals/ai-providers.js for the real sensory
// provider chain and docs/SENSORY.md for the peripheral contract.

// ═══════════════════════════════════════════════════════════════
// SETUP FLOW — R15 minimal version
// ═══════════════════════════════════════════════════════════════
// Unity's brain runs on math; no text-AI backend is required. The
// setup modal exists only to (a) request mic + camera permissions,
// (b) accept an optional Pollinations API key for raised rate
// limits, and (c) show the user what sensory backends (image gen,
// vision describer) were auto-detected. Everything else is wired
// through env.js / auto-detect at boot in bootUnity().
// ═══════════════════════════════════════════════════════════════

async function init() {
  storage = new UserStorage();

  // Seed env.js keys into storage on first load so later lookups
  // (voice, image gen) can find them without re-reading env.
  for (const [pid, key] of Object.entries(ENV_KEYS)) {
    if (key && typeof key === 'string' && !storage.getApiKey(pid)) {
      storage.setApiKey(pid, key);
    }
  }

  // If a stored Pollinations key exists, pre-fill the optional input
  // so users don't have to re-paste it every session.
  const storedPollKey = storage.getApiKey('pollinations');
  if (storedPollKey && apiKeyInput) apiKeyInput.value = storedPollKey;

  startBtn.addEventListener('click', handleStart);

  // Sensory channel toggles — wire checkboxes, persist to localStorage,
  // live-apply post-boot via window.unityChannels{} state + listeners.
  // Pre-boot: gates which permissions get requested (see handleStart).
  // Post-boot: mic toggle stops/resumes listening; vision toggle stops/
  // resumes camera frame capture; speech toggle mutes voice.stopSpeaking
  // and sets voice._muted so new speech calls are no-ops.
  window.unityChannels = {
    userMic: localStorage.getItem('unity_channel_user_mic') !== 'false',
    unityVision: localStorage.getItem('unity_channel_unity_vision') !== 'false',
    unitySpeech: localStorage.getItem('unity_channel_unity_speech') !== 'false',
  };
  const wireChannelToggle = (id, key, storageKey, onChange) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = window.unityChannels[key];
    el.addEventListener('change', () => {
      window.unityChannels[key] = el.checked;
      localStorage.setItem(storageKey, el.checked ? 'true' : 'false');
      try { onChange && onChange(el.checked); } catch (err) { console.warn('[channel toggle]', err.message); }
    });
  };
  wireChannelToggle('toggle-user-mic', 'userMic', 'unity_channel_user_mic', (on) => {
    if (!window._unityBooted || !voice) return;
    if (on) voice.startListening?.();
    else voice.stopListening?.();
  });
  wireChannelToggle('toggle-unity-vision', 'unityVision', 'unity_channel_unity_vision', (on) => {
    if (!window._unityBooted || !brain) return;
    // Live-apply: set visualCortex frozen flag so its frame loop
    // short-circuits. Requires a fresh camera grant + reload to re-enable
    // once toggled off mid-session, since stopping the MediaStream tracks
    // is irreversible without a new getUserMedia prompt.
    if (brain.visualCortex) brain.visualCortex._paused = !on;
    if (!on) {
      const stream = brain.visualCortex?.getStream?.();
      if (stream && stream.getTracks) {
        for (const t of stream.getTracks()) t.enabled = false;
      }
    } else {
      const stream = brain.visualCortex?.getStream?.();
      if (stream && stream.getTracks) {
        for (const t of stream.getTracks()) t.enabled = true;
      }
    }
  });
  wireChannelToggle('toggle-unity-speech', 'unitySpeech', 'unity_channel_unity_speech', (on) => {
    if (!window._unityBooted || !voice) return;
    voice._muted = !on;
    if (!on) voice.stopSpeaking?.();
  });

  // Instant SAVE KEY button — stores the Pollinations API key without
  // having to boot Unity. Writes storage + pushes into providers so
  // the next generateImage/describeImage picks it up immediately.
  const saveKeyBtn = document.getElementById('api-key-save-btn');
  if (saveKeyBtn && apiKeyInput) {
    saveKeyBtn.addEventListener('click', () => {
      const key = (apiKeyInput.value || '').trim();
      if (!key) {
        alert('Paste a Pollinations API key first.');
        return;
      }
      storage.setApiKey('pollinations', key);
      if (providers?._pollinations) providers._pollinations._apiKey = key;
      saveKeyBtn.textContent = 'SAVED ✓';
      saveKeyBtn.style.background = 'var(--green,#22c55e)';
      setTimeout(() => {
        saveKeyBtn.textContent = 'SAVE KEY';
        saveKeyBtn.style.background = 'var(--cyan)';
      }, 1500);
      // Re-render inventory so the (default) pollinations row reflects
      // the authenticated state if the UI cares.
      if (typeof renderSensoryInventory === 'function') renderSensoryInventory();
    });
  }

  // R15 — Clear All Data button (still inside the setup modal)
  const clearBtn = document.getElementById('clear-data-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear ALL Unity data? This deletes conversation history, preferences, saved keys, and sandbox state from your browser.')) {
        localStorage.clear();
        location.reload();
      }
    });
  }

  // R15b-T6 — Create pollinations + providers + run auto-detect probes
  // at PAGE LOAD TIME, not at boot. The original R15b shipped this
  // inside bootUnity() which meant the setup modal's sensory inventory
  // panel showed "Start Unity to see what's detected" until the user
  // clicked WAKE UNITY UP — exactly backwards, since users want to
  // verify their backend setup BEFORE committing to boot. Moving
  // everything here fires the probes as soon as the page loads so
  // opening the setup modal always shows real results.
  try {
    const bootKey = storage.getApiKey('pollinations') || '';
    pollinations = new PollinationsAI(bootKey || undefined);
    providers = new AIProviders({ pollinations, storage });

    if (typeof providers.loadEnvConfig === 'function') {
      providers.loadEnvConfig(ENV_KEYS);
    }
    // Pull saved custom backends from localStorage (from the setup
    // modal's Save Backend button) and register them with the live
    // providers instance BEFORE autoDetect runs so they take priority
    // over auto-detected entries.
    injectCustomBackendsIntoProviders();

    if (typeof providers.onStatus === 'function') {
      providers.onStatus((payload) => {
        try { window.dispatchEvent(new CustomEvent('unity-sensory-status', { detail: payload })); } catch {}
      });
    }
    sensoryStatus.init(providers);

    // Auto-detect is OPT-IN. The default boot was probing 11 common
    // local AI ports (ComfyUI / Stable Diffusion / LocalAI / Ollama
    // / Forge / etc) every page load. Almost nobody has all of those
    // running, so every probe failed with ERR_CONNECTION_REFUSED and
    // the browser's network layer logged each as a red error — the
    // console
    // looked broken even though the brain was fine. Pollinations
    // works out of the box without any of this, so the sensible
    // default is "don't probe unless the user told us to".
    //
    // Enable by setting ENV_KEYS.probeLocalAI = true in env.js OR
    // localStorage.unity_probe_local_ai = '1' from the setup
    // modal toggle. When off (default) we skip both probes
    // entirely and the inventory renders with zero local backends
    // — Pollinations + user-configured API keys still work.
    const probeEnv = (ENV_KEYS && ENV_KEYS.probeLocalAI === true);
    const probeLs = (typeof localStorage !== 'undefined' && localStorage.getItem('unity_probe_local_ai') === '1');
    if (probeEnv || probeLs) {
      if (typeof providers.autoDetect === 'function') {
        providers.autoDetect()
          .then(() => renderSensoryInventory())
          .catch(err => console.warn('[Unity] image backend auto-detect failed:', err.message));
      }
      if (typeof providers.autoDetectVision === 'function') {
        providers.autoDetectVision()
          .then(() => renderSensoryInventory())
          .catch(err => console.warn('[Unity] vision backend auto-detect failed:', err.message));
      }
    } else {
      console.log('[Unity] Local AI backend auto-detect is OFF. Set ENV_KEYS.probeLocalAI=true in env.js or localStorage.unity_probe_local_ai="1" via the setup modal to enable probing ComfyUI / Stable Diffusion / LocalAI / Ollama / etc on boot.');
    }
  } catch (err) {
    console.warn('[Unity] sensory providers page-load init failed:', err.message);
  }

  // Initial render of the sensory inventory panel. If probes haven't
  // resolved yet it shows the "probing" state. Auto-refreshes as each
  // probe completes via the .then() callbacks above.
  renderSensoryInventory();

  // R15 — wire the image-gen + vision-describer provider button
  // grids. Each button shows a per-backend setup form on click.
  // Buttons for already-saved backends get a green `.saved` marker.
  wireBackendButtons();
}

/**
 * R15 — render the sensory backend inventory inside the setup modal.
 * Reads from providers.getStatus() if providers exists (post-boot
 * Apply Changes path), or shows a pre-boot placeholder. Called at
 * init() time and whenever the modal is opened.
 */
function renderSensoryInventory() {
  const el = document.getElementById('sensory-inventory-content');
  if (!el) return;

  // Pre-init guard — rare, only fires if render is called before the
  // init() provider setup runs. Normally shouldn't happen after the
  // R15b-T6 page-load move.
  if (!providers || typeof providers.getStatus !== 'function') {
    el.innerHTML = '<span style="color:var(--text-dim);">Waiting for sensory provider init...</span>';
    return;
  }

  const status = providers.getStatus();
  const dot = (state) => state === 'alive' ? '🟢' : state === 'dead' ? '🔴' : '⚪';
  const imgRows = status.image.map(b => `${dot(b.state)} ${b.name} <span style="color:var(--text-dim);">(${b.source})</span>`).join('<br>');
  const visRows = status.vision.map(b => `${dot(b.state)} ${b.name} <span style="color:var(--text-dim);">(${b.source})</span>`).join('<br>');
  const pausedNote = status.visionPaused ? '<br><span style="color:var(--red);">⚠ vision paused — repeated failures</span>' : '';

  // R15b-T6 — if providers exists but autoDetect hasn't resolved yet,
  // only the Pollinations fallback will show. Detect that state and
  // show a friendly "probing" badge instead of a stark single-entry list.
  const probing = (status.image.length <= 1 && status.vision.length <= 1);
  const probingNote = probing
    ? '<div style="color:var(--text-dim);margin-top:6px;font-size:10px;">⏳ probing localhost ports for local backends (A1111 / ComfyUI / Ollama / etc.)...</div>'
    : '';

  el.innerHTML = `
    <div style="color:var(--cyan);margin-bottom:4px;">🎨 IMAGE GENERATION</div>
    <div style="margin-left:8px;margin-bottom:8px;">${imgRows}</div>
    <div style="color:var(--cyan);margin-bottom:4px;">👁 VISION DESCRIBER</div>
    <div style="margin-left:8px;">${visRows}${pausedNote}</div>
    ${probingNote}
  `;

  // Refresh the active-provider selectors after inventory render so
  // newly detected backends appear as selectable options immediately.
  refreshActiveBackendSelectors(status);
}

// ═══════════════════════════════════════════════════════════════
// ACTIVE PROVIDER SELECTORS
// ═══════════════════════════════════════════════════════════════
// Users configure any number of backends via the grids above. The
// selectors below pick which single backend Unity actually uses for
// each kind (image gen, vision describer), plus which model to pick
// from that backend. Preference is saved to localStorage and pushed
// into providers.setPreferredBackend() so generateImage/describeImage
// honor it on the very next call.
// ═══════════════════════════════════════════════════════════════

// Model catalogs per backend. Static where we know the options,
// dynamic for ones we probe at runtime (ollama /api/tags).
const BACKEND_MODEL_CATALOG = {
  'image:Pollinations': ['flux', 'flux-realism', 'flux-anime', 'flux-3d', 'turbo', 'sdxl-1.0'],
  'image:Automatic1111 / SD.Next / Forge': ['default'],
  'image:ComfyUI': ['default'],
  'image:OpenAI DALL-E': ['dall-e-3', 'dall-e-2'],
  'image:Stability AI': ['stable-diffusion-xl-1024-v1-0', 'sd3-large', 'sd3-medium'],
  'vision:Pollinations': ['openai', 'claude-haiku', 'gemini'],
  'vision:Ollama (VLM)': ['llava', 'moondream', 'bakllava', 'minicpm-v'],
  'vision:LM Studio': ['default'],
};

function refreshActiveBackendSelectors(status) {
  const imgSel = document.getElementById('active-image-backend');
  const visSel = document.getElementById('active-vision-backend');
  const imgModelSel = document.getElementById('active-image-model');
  const visModelSel = document.getElementById('active-vision-model');
  if (!imgSel || !visSel) return;

  const populate = (selEl, list, kind, savedKey) => {
    const saved = localStorage.getItem(savedKey);
    selEl.innerHTML = '';
    list.forEach(b => {
      const opt = document.createElement('option');
      const val = `${b.source}|${b.name}`;
      opt.value = val;
      opt.textContent = `${b.state === 'alive' ? '🟢' : '🔴'} ${b.name} (${b.source})`;
      if (val === saved) opt.selected = true;
      selEl.appendChild(opt);
    });
  };
  populate(imgSel, status.image, 'image', 'unity_pref_image_backend');
  populate(visSel, status.vision, 'vision', 'unity_pref_vision_backend');

  const populateModels = (selEl, backendSel, kind, savedKey) => {
    if (!selEl) return;
    const [, name] = (backendSel.value || '').split('|');
    const catalog = BACKEND_MODEL_CATALOG[`${kind}:${name}`] || ['default'];
    const saved = localStorage.getItem(savedKey);
    selEl.innerHTML = '';
    catalog.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === saved) opt.selected = true;
      selEl.appendChild(opt);
    });
  };
  populateModels(imgModelSel, imgSel, 'image', 'unity_pref_image_model');
  populateModels(visModelSel, visSel, 'vision', 'unity_pref_vision_model');

  const applyPref = (kind, backendSel, modelSel, backendKey, modelKey) => {
    const [source, name] = (backendSel.value || '').split('|');
    const model = modelSel?.value || null;
    localStorage.setItem(backendKey, backendSel.value);
    if (model) localStorage.setItem(modelKey, model);
    if (providers?.setPreferredBackend) {
      providers.setPreferredBackend(kind, { source, name, model });
    }
  };

  // Find the BACKEND_CATALOG key for a given (kind, name) so changing
  // the dropdown can scroll the backend-connect-form to the matching
  // entry. Used by the change handlers below.
  const catalogKeyFor = (kind, name) => {
    for (const [key, cfg] of Object.entries(BACKEND_CATALOG)) {
      if (cfg.kind === kind && cfg.name === name) return key;
    }
    return null;
  };

  // Wire change handlers once — flag on the element to prevent stacking
  if (!imgSel._wired) {
    imgSel._wired = true;
    imgSel.addEventListener('change', () => {
      populateModels(imgModelSel, imgSel, 'image', 'unity_pref_image_model');
      applyPref('image', imgSel, imgModelSel, 'unity_pref_image_backend', 'unity_pref_image_model');
      // Sync the backend-connect-form to the newly selected active
      // provider so the CONNECT button is always pointing at what
      // the user just picked as active.
      const [, name] = (imgSel.value || '').split('|');
      const key = catalogKeyFor('image', name);
      if (key) {
        document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.provider-btn[data-backend="${key}"]`);
        if (btn) btn.classList.add('active');
        showBackendForm(key);
      }
    });
    imgModelSel?.addEventListener('change', () => {
      applyPref('image', imgSel, imgModelSel, 'unity_pref_image_backend', 'unity_pref_image_model');
    });
  }
  if (!visSel._wired) {
    visSel._wired = true;
    visSel.addEventListener('change', () => {
      populateModels(visModelSel, visSel, 'vision', 'unity_pref_vision_model');
      applyPref('vision', visSel, visModelSel, 'unity_pref_vision_backend', 'unity_pref_vision_model');
      const [, name] = (visSel.value || '').split('|');
      const key = catalogKeyFor('vision', name);
      if (key) {
        document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.provider-btn[data-backend="${key}"]`);
        if (btn) btn.classList.add('active');
        showBackendForm(key);
      }
    });
    visModelSel?.addEventListener('change', () => {
      applyPref('vision', visSel, visModelSel, 'unity_pref_vision_backend', 'unity_pref_vision_model');
    });
  }

  // Push the persisted preference into providers on first render so
  // reloading the page doesn't reset to first-in-list priority.
  applyPref('image', imgSel, imgModelSel, 'unity_pref_image_backend', 'unity_pref_image_model');
  applyPref('vision', visSel, visModelSel, 'unity_pref_vision_backend', 'unity_pref_vision_model');
}

// ═══════════════════════════════════════════════════════════════
// R15 BACKEND PICKER — provider grid + per-backend setup forms
// ═══════════════════════════════════════════════════════════════
// The setup modal exposes two grids of clickable backend buttons
// (image gen + vision describer). Clicking any button populates the
// #backend-connect-form area below the grids with per-backend setup
// instructions + minimal required inputs. Design goal: all set up
// as automatic as possible — auto-detect local backends work with
// ZERO config; remote backends need a key ONLY; custom is the only
// full-form path.
//
// Saved backends persist to localStorage so they survive page
// reloads AND get pushed into providers._localImageBackends /
// _localVisionBackends at bootUnity() time so Unity uses them
// immediately. A ready-to-copy env.js snippet is also shown after
// every save for users who want file-based config that survives
// Clear All Data.
// ═══════════════════════════════════════════════════════════════

const BACKEND_CATALOG = {
  // ── IMAGE GENERATION ──────────────────────────────────────────
  'img:pollinations': {
    name: 'Pollinations',
    kind: 'image',
    instructions:
      'Unity\'s default image gen provider — active out of the box, no setup needed for the anonymous tier. Paste your Pollinations API key below to authenticate (raises rate limits and unlocks paid models). You can also pick which Pollinations image model Unity uses (default: flux).',
    link: 'https://enter.pollinations.ai/',
    linkLabel: '🔑 Get Pollinations API key',
    needsKey: true,
    keyOptional: true,
    keyStorageKey: 'pollinations',
    showModel: true,
    defaultModel: 'flux',
    modelHint: 'e.g. flux / turbo / sdxl-1.0',
  },
  'img:a1111': {
    name: 'Automatic1111 / SD.Next / Forge',
    kind: 'image',
    instructions:
`Install: github.com/AUTOMATIC1111/stable-diffusion-webui
Run it with the API enabled:
  Linux/Mac:  ./webui.sh --api
  Windows:    set COMMANDLINE_ARGS=--api && webui-user.bat

Unity auto-detects on localhost:7860 — no config needed. Only fill in a URL below if you're running on a remote host or non-standard port.`,
    link: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui',
    linkLabel: '📦 A1111 install docs',
    autoDetect: true,
    defaultPort: 7860,
    defaultKind: 'a1111',
  },
  'img:comfyui': {
    name: 'ComfyUI',
    kind: 'image',
    instructions:
`Install: github.com/comfyanonymous/ComfyUI
Run: python main.py

Unity auto-detects on localhost:8188 — no config needed. Only fill in a URL below for remote / non-standard setups.`,
    link: 'https://github.com/comfyanonymous/ComfyUI',
    linkLabel: '📦 ComfyUI install docs',
    autoDetect: true,
    defaultPort: 8188,
    defaultKind: 'comfy',
  },
  'img:dalle': {
    name: 'OpenAI DALL-E',
    kind: 'image',
    instructions:
`Create a key at platform.openai.com/api-keys (paid account required).
Paste below. Unity uses dall-e-3 by default — change the model field to dall-e-2 if you prefer the older model.`,
    link: 'https://platform.openai.com/api-keys',
    linkLabel: '🔑 Get OpenAI API key',
    needsKey: true,
    defaultUrl: 'https://api.openai.com',
    defaultKind: 'openai',
    showModel: true,
    defaultModel: 'dall-e-3',
  },
  'img:stability': {
    name: 'Stability AI',
    kind: 'image',
    instructions:
`Create a key at platform.stability.ai/account/keys.
Paste below. Default model is stable-diffusion-xl-1024-v1-0 — see platform.stability.ai/docs/api-reference for alternatives.`,
    link: 'https://platform.stability.ai/account/keys',
    linkLabel: '🔑 Get Stability AI key',
    needsKey: true,
    defaultUrl: 'https://api.stability.ai',
    defaultKind: 'openai',
    showModel: true,
    defaultModel: 'stable-diffusion-xl-1024-v1-0',
  },
  'img:custom': {
    name: 'Custom Image Endpoint',
    kind: 'image',
    instructions:
`Any OpenAI-compatible, Automatic1111-compatible, or generic image-generation endpoint.
Unity handles 4 response shapes automatically: OpenAI { data:[{url}] }, OpenAI base64 { data:[{b64_json}] }, A1111 { images:[<base64>] }, and generic { url } / { image_url }.
Pick the right "kind" below based on your backend's request format.`,
    needsUrl: true,
    needsKey: true,
    keyOptional: true,
    showModel: true,
    showKind: true,
  },

  // ── VISION DESCRIBER (VLM / image classifier) ─────────────────
  'vis:pollinations': {
    name: 'Pollinations GPT-4o (vision describer)',
    kind: 'vision',
    instructions:
`Unity's default vision describer — active out of the box, no setup needed for the anonymous tier. Uses Pollinations multimodal chat under the hood.
Paste your Pollinations API key below to authenticate (raises rate limits and unlocks paid models). You can also swap the multimodal model Unity asks to describe camera frames.`,
    link: 'https://enter.pollinations.ai/',
    linkLabel: '🔑 Get Pollinations API key',
    needsKey: true,
    keyOptional: true,
    keyStorageKey: 'pollinations',
    showModel: true,
    defaultModel: 'openai',
    modelHint: 'multimodal chat model name — e.g. openai, claude-haiku',
  },
  'vis:ollama': {
    name: 'Ollama (llava / moondream / bakllava)',
    kind: 'vision',
    instructions:
`Install: ollama.com
Pull a vision model:  ollama pull llava   (or moondream / bakllava / minicpm-v)
Start:                ollama serve

Unity auto-detects on localhost:11434 and filters /api/tags for vision-capable models automatically — no config needed.
Fill in the URL below only for remote hosts. Model field can force a specific VLM; leave blank to auto-pick.`,
    link: 'https://ollama.com/library/llava',
    linkLabel: '📦 Ollama VLM model library',
    autoDetect: true,
    defaultPort: 11434,
    defaultKind: 'ollama-vision',
    showModel: true,
    defaultModel: '',
    modelHint: 'leave blank for auto-pick, or force e.g. llava, moondream, bakllava',
  },
  'vis:lmstudio': {
    name: 'LM Studio (VLM)',
    kind: 'vision',
    instructions:
`Install: lmstudio.ai
Download a vision model (e.g. llava-v1.6-mistral or bakllava) from the model browser.
Load it and start the local server (Developer tab → Start Server, default port 1234).

Unity auto-detects on localhost:1234. Exposes OpenAI-compatible /v1/chat/completions with multimodal content.`,
    link: 'https://lmstudio.ai',
    linkLabel: '📦 LM Studio download',
    autoDetect: true,
    defaultPort: 1234,
    defaultKind: 'openai-vision',
    showModel: true,
    defaultModel: '',
    modelHint: 'leave blank for auto-pick',
  },
  'vis:openai': {
    name: 'OpenAI GPT-4o Vision',
    kind: 'vision',
    instructions:
`Create a key at platform.openai.com/api-keys.
Paste below. Unity uses gpt-4o for vision by default — change to gpt-4o-mini for cheaper / faster.`,
    link: 'https://platform.openai.com/api-keys',
    linkLabel: '🔑 Get OpenAI API key',
    needsKey: true,
    defaultUrl: 'https://api.openai.com',
    defaultKind: 'openai-vision',
    showModel: true,
    defaultModel: 'gpt-4o',
  },
  'vis:custom': {
    name: 'Custom VLM Endpoint',
    kind: 'vision',
    instructions:
`Any OpenAI-compatible multimodal chat endpoint or Ollama-style VLM.
Pick "openai-vision" for endpoints using /v1/chat/completions with type:image_url content blocks, or "ollama-vision" for endpoints using /api/chat with an images array.`,
    needsUrl: true,
    needsKey: true,
    keyOptional: true,
    showModel: true,
    showKind: true,
  },
};

/**
 * Wire click handlers onto every .provider-btn at init() time.
 * Called once — idempotent (skips if already wired).
 */
function wireBackendButtons() {
  const buttons = document.querySelectorAll('.provider-btn');
  buttons.forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showBackendForm(btn.dataset.backend);
    });
  });
  // Highlight already-saved backends so returning users see them green
  refreshSavedMarkers();

  // Auto-populate the form with the CURRENTLY ACTIVE backend on page
  // load so users never see the "No provider selected yet" placeholder
  // when there IS a provider active. Priority: (1) user-preferred
  // image backend from localStorage, (2) Pollinations as the default.
  const imgPrefRaw = localStorage.getItem('unity_pref_image_backend') || '';
  const [, prefName] = imgPrefRaw.split('|');
  let initialBackendKey = 'img:pollinations';
  if (prefName) {
    // Match preferred name against catalog entries
    for (const [key, cfg] of Object.entries(BACKEND_CATALOG)) {
      if (cfg.kind === 'image' && cfg.name === prefName) {
        initialBackendKey = key;
        break;
      }
    }
  }
  const initialBtn = document.querySelector(`.provider-btn[data-backend="${initialBackendKey}"]`);
  if (initialBtn) {
    initialBtn.classList.add('active');
    showBackendForm(initialBackendKey);
  }
}

/**
 * Walk the catalog + localStorage and tag already-configured backends
 * with `.saved` so returning users see which ones are already set up
 * before clicking anything.
 */
function refreshSavedMarkers() {
  try {
    const imgAll = JSON.parse(localStorage.getItem('custom_image_backends') || '{}');
    const visAll = JSON.parse(localStorage.getItem('custom_vision_backends') || '{}');
    const pollKey = storage?.getApiKey('pollinations');
    document.querySelectorAll('.provider-btn').forEach(btn => {
      const key = btn.dataset.backend;
      const config = BACKEND_CATALOG[key];
      if (!config) return;
      if (config.keyStorageKey === 'pollinations') {
        btn.classList.toggle('saved', !!pollKey);
      } else {
        const store = config.kind === 'image' ? imgAll : visAll;
        btn.classList.toggle('saved', !!store[key]);
      }
    });
  } catch {}
}

/**
 * Render the per-backend setup form inside #backend-connect-form when
 * a button is clicked. Pre-fills any stored values so reopening a
 * previously-saved backend shows its current config.
 */
function showBackendForm(backendKey) {
  const config = BACKEND_CATALOG[backendKey];
  if (!config) return;
  const form = document.getElementById('backend-connect-form');
  const content = document.getElementById('backend-form-content');
  if (!form || !content) return;

  let html = `<h3>${config.kind === 'image' ? '🎨' : '👁'} ${config.name}</h3>`;
  html += `<p class="hint" style="white-space:pre-wrap;line-height:1.5;">${config.instructions}</p>`;
  if (config.link) {
    // T4.11 — render the signup/docs link as a prominent styled
    // button with a clear action label so users don't have to hunt
    // a tiny URL or search for the provider's key page on their own.
    const label = config.linkLabel || '🔗 Open provider site';
    html += `<a href="${config.link}" target="_blank" class="provider-link-btn">${label} →</a>`;
  }

  // URL input — required for custom, optional override for auto-detect
  if (config.needsUrl || config.autoDetect) {
    const isRequired = !!config.needsUrl;
    const defaultUrl = config.defaultUrl || (config.defaultPort ? `http://localhost:${config.defaultPort}` : '');
    const placeholder = isRequired
      ? 'Endpoint URL (required)'
      : `Custom URL (optional — auto-detects at ${defaultUrl})`;
    html += `<input type="text" id="backend-url" placeholder="${placeholder}" autocomplete="off" spellcheck="false">`;
  }

  // Model input
  if (config.showModel) {
    const label = config.kind === 'image' ? '🎨 Image model' : '👁 Vision / classifier model';
    const hint = config.modelHint ? ` — ${config.modelHint}` : '';
    html += `<input type="text" id="backend-model" placeholder="${label}${hint}" autocomplete="off" spellcheck="false">`;
  }

  // Kind selector (only for custom where the backend type isn't known)
  if (config.showKind) {
    html += `<select id="backend-kind">`;
    if (config.kind === 'image') {
      html += `<option value="openai">openai — OpenAI-compatible /v1/images/generations</option>`;
      html += `<option value="a1111">a1111 — Automatic1111 /sdapi/v1/txt2img</option>`;
      html += `<option value="comfy">comfy — ComfyUI workflow</option>`;
    } else {
      html += `<option value="openai-vision">openai-vision — /v1/chat/completions with image_url content blocks</option>`;
      html += `<option value="ollama-vision">ollama-vision — /api/chat with images array</option>`;
    }
    html += `</select>`;
  }

  // Key input
  if (config.needsKey) {
    const label = config.keyOptional ? 'API key (optional — raises rate limits)' : 'API key (required)';
    html += `<input type="password" id="backend-key" placeholder="${label}" autocomplete="off" spellcheck="false">`;
  }

  // CONNECT button + live status badge — the button saves the key and
  // runs an immediate probe against the backend so the user sees a
  // green/red result without waiting for the next generate call.
  // Shown even for env.js-configured backends so users can verify
  // their pasted env is actually reaching the provider.
  html += `<div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap;">
    <button class="save-backend-btn" data-backend="${backendKey}" style="flex:0 0 auto;">🔌 CONNECT</button>
    <span id="backend-connect-status" style="font-size:11px;color:var(--text-dim);font-family:var(--mono);">⚪ not connected</span>
  </div>`;
  html += `<div id="env-snippet-wrap" style="display:none;margin-top:10px;">
    <p class="env-location"></p>
    <pre id="env-snippet-code"></pre>
    <div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap;">
      <button type="button" class="save-backend-btn download-env-btn" style="background:var(--cyan);">⬇ Download env.js</button>
      <span style="font-size:10px;color:var(--text-dim);">Saves to your browser's downloads folder. Move it to the path shown above.</span>
    </div>
  </div>`;

  content.innerHTML = html;
  form.style.display = 'block';

  // Pre-fill any stored values so returning users see their config
  const stored = loadStoredBackendConfig(backendKey);
  if (stored) {
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    set('backend-key', stored.key);
    set('backend-url', stored.url);
    set('backend-model', stored.model);
    set('backend-kind', stored.kind);
  }

  // Initial connection status — reflects current state BEFORE the user
  // clicks CONNECT. Three signals: (a) key/url exists in localStorage,
  // (b) key/url exists in env.js via providers, (c) live backend entry
  // is alive/dead. Pollinations is always "default available" unless
  // explicitly dead.
  updateConnectStatus(backendKey, config, stored);

  // Wire save button — runs saveBackend() then probes connectivity and
  // updates the status badge inline.
  const saveBtn = content.querySelector('.save-backend-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBackend(backendKey);
      const statusEl = document.getElementById('backend-connect-status');
      if (statusEl) {
        statusEl.innerHTML = '🟡 probing...';
        statusEl.style.color = 'var(--orange,#f59e0b)';
      }
      const result = await probeBackend(backendKey, config);
      if (statusEl) {
        if (result.ok) {
          statusEl.innerHTML = `🟢 connected · ${result.detail || 'ready'}`;
          statusEl.style.color = 'var(--green,#22c55e)';
        } else {
          statusEl.innerHTML = `🔴 failed · ${result.detail || 'unknown error'}`;
          statusEl.style.color = 'var(--red,#ef4444)';
        }
      }
    });
  }
}

/**
 * Update the per-backend connect status badge from current state —
 * doesn't probe the network, just inspects what's stored + what the
 * providers registry knows.
 */
function updateConnectStatus(backendKey, config, stored) {
  const statusEl = document.getElementById('backend-connect-status');
  if (!statusEl) return;

  // Pollinations — always a default available; green if a key is saved,
  // blue-ish if running anonymously.
  if (config.keyStorageKey === 'pollinations') {
    const pollKey = storage?.getApiKey('pollinations');
    if (pollKey) {
      statusEl.innerHTML = '🟢 connected · authenticated with saved key';
      statusEl.style.color = 'var(--green,#22c55e)';
    } else {
      statusEl.innerHTML = '🔵 default · running on anonymous tier (no key)';
      statusEl.style.color = 'var(--cyan,#00e5ff)';
    }
    return;
  }

  // Check providers registry for a live entry matching this backend
  // name — covers both env.js and localStorage sources
  const list = config.kind === 'image'
    ? (providers?._localImageBackends || [])
    : (providers?._localVisionBackends || []);
  const hit = list.find(b => b.name === config.name);
  if (hit) {
    const dead = providers?._isBackendDead?.(hit.url);
    const source = hit.fromEnv ? 'env.js' : hit.detected ? 'auto-detected' : 'saved';
    if (dead) {
      statusEl.innerHTML = `🔴 dead · ${source} (1h cooldown)`;
      statusEl.style.color = 'var(--red,#ef4444)';
    } else {
      statusEl.innerHTML = `🟢 registered · ${source} — click CONNECT to re-probe`;
      statusEl.style.color = 'var(--green,#22c55e)';
    }
    return;
  }

  // Has stored config but not yet pushed into providers
  if (stored && (stored.key || stored.url)) {
    statusEl.innerHTML = '🟡 saved but not registered · click CONNECT to apply';
    statusEl.style.color = 'var(--orange,#f59e0b)';
    return;
  }

  statusEl.innerHTML = '⚪ not connected · paste key/URL and click CONNECT';
  statusEl.style.color = 'var(--text-dim)';
}

/**
 * Live connectivity probe for a backend. Called from the CONNECT button
 * click handler after saveBackend writes the config. Returns
 * {ok: boolean, detail: string}. Uses a short-circuit per-backend-kind
 * check: Pollinations hits /models, OpenAI hits /v1/models, A1111 hits
 * /sdapi/v1/options, Ollama hits /api/tags, custom/generic does a HEAD.
 */
async function probeBackend(backendKey, config) {
  try {
    // Pollinations — hit the models endpoint with the saved key
    if (config.keyStorageKey === 'pollinations') {
      const key = storage?.getApiKey('pollinations');
      const headers = key ? { Authorization: `Bearer ${key}` } : {};
      const res = await fetch('https://image.pollinations.ai/models', {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      return { ok: true, detail: key ? 'authenticated' : 'anonymous tier' };
    }

    const stored = loadStoredBackendConfig(backendKey);
    const url = stored?.url || config.defaultUrl || (config.defaultPort ? `http://localhost:${config.defaultPort}` : '');
    if (!url) return { ok: false, detail: 'no URL configured' };
    const headers = stored?.key ? { Authorization: `Bearer ${stored.key}` } : {};
    const kind = stored?.kind || config.defaultKind || 'openai';

    let probePath = '/v1/models';
    if (kind === 'a1111') probePath = '/sdapi/v1/options';
    else if (kind === 'comfy') probePath = '/system_stats';
    else if (kind === 'ollama-vision') probePath = '/api/tags';
    else if (kind === 'openai-vision' || kind === 'openai') probePath = '/v1/models';

    const res = await fetch(url.replace(/\/$/, '') + probePath, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: `${kind} reachable` };
  } catch (err) {
    return { ok: false, detail: err.message || 'network error' };
  }
}

/**
 * Persist a backend config to localStorage + register it with the
 * live providers singleton (if bootUnity has run) + show the env.js
 * snippet. Called when the user clicks Save Backend inside the form.
 */
function saveBackend(backendKey) {
  const config = BACKEND_CATALOG[backendKey];
  if (!config) return;

  const key = document.getElementById('backend-key')?.value.trim() || '';
  const rawUrl = document.getElementById('backend-url')?.value.trim() || '';
  const model = document.getElementById('backend-model')?.value.trim() || '';
  const kind = document.getElementById('backend-kind')?.value || config.defaultKind || 'openai';
  const url = rawUrl || config.defaultUrl || (config.defaultPort ? `http://localhost:${config.defaultPort}` : '');

  // Validation
  if (config.needsUrl && !url) {
    alert('URL is required for this backend.');
    return;
  }
  if (config.needsKey && !config.keyOptional && !key) {
    alert('API key is required for this backend.');
    return;
  }

  // Pollinations special case — the key goes into the shared
  // pollinations storage slot (used by the Pollinations client) and
  // the model choice goes into a per-kind localStorage key that
  // bootUnity reads back at launch to override the hardcoded default.
  if (config.keyStorageKey === 'pollinations') {
    if (key) {
      storage.setApiKey('pollinations', key);
      if (apiKeyInput) apiKeyInput.value = key;
    }
    const modelStorageKey = config.kind === 'image' ? 'pollinations_image_model' : 'pollinations_vision_model';
    if (model) {
      localStorage.setItem(modelStorageKey, model);
    } else {
      localStorage.removeItem(modelStorageKey);
    }
    // Apply to the live pollinations client immediately if boot has run
    if (pollinations && key) pollinations._apiKey = key;
    if (pollinations && model && config.kind === 'image') pollinations._defaultImageModel = model;
    if (providers && model && config.kind === 'vision') providers._pollinationsVisionModel = model;

    showEnvSnippet({
      pollinations: key || storage.getApiKey('pollinations') || '',
      [modelStorageKey]: model,
    });
    refreshSavedMarkers();
    renderSensoryInventory();
    return;
  }

  // Standard backend entry
  const entry = { name: config.name, url };
  if (model) entry.model = model;
  if (kind) entry.kind = kind;
  if (key) entry.key = key;

  // Save to localStorage keyed by backendKey so same-backend saves
  // overwrite cleanly instead of piling up duplicates
  const storageField = config.kind === 'image' ? 'custom_image_backends' : 'custom_vision_backends';
  const all = JSON.parse(localStorage.getItem(storageField) || '{}');
  all[backendKey] = entry;
  localStorage.setItem(storageField, JSON.stringify(all));

  // Push into live providers so Unity starts using it immediately
  // without a reboot. Remove any stale copy first (same name).
  if (providers) {
    const listField = config.kind === 'image' ? '_localImageBackends' : '_localVisionBackends';
    providers[listField] = providers[listField].filter(b => b.name !== entry.name);
    providers[listField].push({ ...entry, detected: false, fromEnv: false, configured: true });
  }

  // Generate env.js snippet as a copy-paste escape hatch
  const envField = config.kind === 'image' ? 'imageBackends' : 'visionBackends';
  showEnvSnippet({ [envField]: [entry] });

  refreshSavedMarkers();
  renderSensoryInventory();
}

/**
 * Detect the runtime environment and user's OS so we can tell them
 * EXACTLY where to put their js/env.js file. Three modes:
 *
 *   - 'file'      — Unity is loaded from a file:// URL. We can compute
 *                   the exact absolute path to the project root from
 *                   location.pathname and give the user a precise
 *                   "create env.js at <path>" instruction.
 *   - 'localhost' — Unity is running behind a local web server
 *                   (brain-server.js, python http.server, etc.). The
 *                   browser has no way to know the server's working
 *                   directory, so we fall back to OS-specific shell
 *                   commands telling them to run `pwd` in the
 *                   terminal where they launched the server, then
 *                   drop env.js in the js/ folder of that directory.
 *   - 'remote'    — Unity is running from a public URL (GitHub Pages,
 *                   etc.). env.js can't be used here at all — the
 *                   static host ignores it. Saved backends live in
 *                   localStorage only. We tell the user that.
 */
function getEnvJsDestination() {
  const ua = navigator.userAgent || '';
  let os = 'linux';
  if (/Mac|iPhone|iPad|iPod/.test(ua)) os = 'mac';
  else if (/Windows/.test(ua)) os = 'windows';

  // file:// — we know the exact path
  if (location.protocol === 'file:') {
    let path = decodeURIComponent(location.pathname);
    // Windows paths look like /C:/Users/alice/... — strip the leading slash
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    // Strip the filename (index.html or whatever page they're on)
    const lastSlash = path.lastIndexOf('/');
    const projectRoot = lastSlash >= 0 ? path.slice(0, lastSlash) : path;
    // Normalize slash direction on Windows display
    const displayPath = os === 'windows'
      ? (projectRoot + '/js/env.js').replace(/\//g, '\\')
      : projectRoot + '/js/env.js';
    return {
      mode: 'file',
      os,
      exactPath: displayPath,
    };
  }

  // Public URL (GitHub Pages / any https host that isn't loopback)
  const isLocalHost =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]' ||
    location.hostname === '';
  if (!isLocalHost) {
    return { mode: 'remote', os };
  }

  // localhost — browser doesn't know the server's CWD, fall back to
  // OS-specific shell instructions
  return { mode: 'localhost', os };
}

/**
 * Render a copy-paste-ready env.js snippet into the form's snippet
 * area. Keeps any previously-saved Pollinations key visible so users
 * don't accidentally drop it when they copy the block. Also shows
 * exactly where to put the file (file:// gives an absolute path,
 * localhost gives OS-specific shell hints, remote says localStorage
 * only) and offers a one-click download button so users don't have
 * to manually create a new file.
 */
function showEnvSnippet(updates) {
  const wrap = document.getElementById('env-snippet-wrap');
  const pre = document.getElementById('env-snippet-code');
  if (!wrap || !pre) return;

  const jsonify = (v) => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v);
  const lines = [];
  const existingPoll = storage.getApiKey('pollinations') || '';
  if (existingPoll && !updates.pollinations) lines.push(`  pollinations: '${existingPoll}',`);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) {
      lines.push(`  ${k}: [`);
      for (const entry of v) {
        const parts = Object.entries(entry)
          .filter(([, val]) => val !== undefined && val !== '')
          .map(([ek, ev]) => `${ek}: ${jsonify(ev)}`);
        lines.push(`    { ${parts.join(', ')} },`);
      }
      lines.push(`  ],`);
    } else {
      lines.push(`  ${k}: ${jsonify(v)},`);
    }
  }

  const snippet = `// js/env.js — gitignored, your keys never get pushed.
// Auto-generated by Unity's setup modal.

export const ENV_KEYS = {
${lines.join('\n')}
};`;

  pre.textContent = snippet;

  // Replace the static env-location hint block with mode-aware guidance
  const locEl = wrap.querySelector('.env-location');
  if (locEl) {
    const dest = getEnvJsDestination();
    let html = '';
    if (dest.mode === 'file') {
      // We know the exact path. Give a single precise instruction.
      html = `<strong style="color:var(--green);">✓ Saved to localStorage.</strong> For file-based config that survives "Clear All Data" and boots faster, download the file below and place it at:<br>
              <code style="display:inline-block;margin:4px 0;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--cyan);font-size:10px;word-break:break-all;">${dest.exactPath}</code><br>
              <span style="color:var(--text-dim);">(Create the <code>js</code> folder if it doesn't exist. <code>js/env.js</code> is gitignored so your keys never get committed.)</span>`;
    } else if (dest.mode === 'localhost') {
      // Browser can't know the server's CWD (especially since start.sh
      // does `cd "$DIR/server"` before launching, so `pwd` from that
      // terminal gives the server/ subdirectory, not the project root).
      // Give an unambiguous landmark instruction instead: find the
      // folder where js/env.example.js already lives, drop env.js next
      // to it. Works regardless of what shell, start method, or cwd
      // weirdness the user is in.
      const osHints = {
        mac: {
          hint: 'Open Finder, navigate to your Unity project folder (the one containing this index.html file). Open the <code>js</code> subfolder. Drop the downloaded <code>env.js</code> in there, next to <code>env.example.js</code>.',
          shell: `# Or from Terminal.app, if you know the path:
mv ~/Downloads/env.js /path/to/Unity/js/env.js`,
        },
        linux: {
          hint: 'Open your file manager, navigate to your Unity project folder (the one containing this <code>index.html</code>). Open the <code>js</code> subfolder and drop the downloaded <code>env.js</code> in there next to <code>env.example.js</code>.',
          shell: `# Or from your terminal:
mv ~/Downloads/env.js /path/to/Unity/js/env.js`,
        },
        windows: {
          hint: 'Open File Explorer, navigate to your Unity project folder (the one containing this <code>index.html</code>). Open the <code>js</code> subfolder and drop the downloaded <code>env.js</code> in there next to <code>env.example.js</code>.',
          shell: `# Or from PowerShell:
Move-Item $env:USERPROFILE\\Downloads\\env.js C:\\path\\to\\Unity\\js\\env.js`,
        },
      };
      const hint = osHints[dest.os] || osHints.linux;
      html = `<strong style="color:var(--green);">✓ Saved to localStorage.</strong> For file-based config that survives "Clear All Data" and boots faster, download the file below and drop it next to <code>js/env.example.js</code> in your Unity project folder.<br>
              <span style="color:var(--text-dim);margin-top:6px;display:block;">You're running Unity from <code>${location.origin}</code> so the browser can't see the filesystem directly. The landmark is <code>js/env.example.js</code> — whichever folder THAT file is in, <code>env.js</code> goes right next to it in the same <code>js/</code> folder.</span>
              <span style="color:var(--text-dim);margin-top:6px;display:block;">${hint.hint}</span>
              <pre style="margin-top:6px;">${hint.shell}</pre>
              <span style="color:var(--text-dim);">(<code>js/env.js</code> is gitignored — your keys never get committed.)</span>`;
    } else {
      // Public URL — env.js doesn't work
      html = `<strong style="color:var(--orange);">⚠ You're running Unity from a remote URL (<code>${location.hostname}</code>).</strong><br>
              File-based <code>env.js</code> config only works when you're hosting Unity yourself locally. Your backends are saved to this browser's <strong>localStorage</strong> and will persist across page reloads on this device — but they won't sync to other browsers and will be wiped by "Clear All Data".<br>
              <span style="color:var(--text-dim);margin-top:6px;display:block;">To use file-based config, clone Unity and run it locally: <code>git clone github.com/Unity-Lab-AI/Unity &amp;&amp; cd Unity &amp;&amp; node server/brain-server.js</code> (requires Node.js).</span>`;
    }
    locEl.innerHTML = html;
  }

  // Wire (or re-wire) the Download env.js button so users can grab
  // a real file instead of copy-pasting the textarea
  const dlBtn = wrap.querySelector('.download-env-btn');
  if (dlBtn) {
    dlBtn.onclick = () => {
      try {
        const blob = new Blob([snippet], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'env.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        console.warn('[Unity] env.js download failed:', err.message);
      }
    };
  }

  wrap.style.display = 'block';
}

/**
 * Read stored config for one backend slot so showBackendForm can
 * pre-fill inputs.
 */
function loadStoredBackendConfig(backendKey) {
  const config = BACKEND_CATALOG[backendKey];
  if (!config) return null;

  if (config.keyStorageKey === 'pollinations') {
    return {
      key: storage?.getApiKey('pollinations') || '',
      model: localStorage.getItem(config.kind === 'image' ? 'pollinations_image_model' : 'pollinations_vision_model') || '',
    };
  }

  try {
    const storageField = config.kind === 'image' ? 'custom_image_backends' : 'custom_vision_backends';
    const all = JSON.parse(localStorage.getItem(storageField) || '{}');
    return all[backendKey] || null;
  } catch {
    return null;
  }
}

/**
 * Called from bootUnity() AFTER providers is constructed but BEFORE
 * providers.autoDetect() fires. Any backends the user configured via
 * the setup modal get pushed into the live provider chain so they
 * take priority ahead of the auto-detected defaults.
 */
function injectCustomBackendsIntoProviders() {
  if (!providers) return;
  try {
    const imgAll = JSON.parse(localStorage.getItem('custom_image_backends') || '{}');
    const visAll = JSON.parse(localStorage.getItem('custom_vision_backends') || '{}');
    for (const entry of Object.values(imgAll)) {
      providers._localImageBackends.push({ ...entry, detected: false, fromEnv: false, configured: true });
    }
    for (const entry of Object.values(visAll)) {
      providers._localVisionBackends.push({ ...entry, detected: false, fromEnv: false, configured: true });
    }
  } catch (err) {
    console.warn('[Unity] custom backend injection failed:', err.message);
  }

  // R15 — apply saved Pollinations model overrides
  const imgModel = localStorage.getItem('pollinations_image_model');
  const visModel = localStorage.getItem('pollinations_vision_model');
  if (imgModel && pollinations) pollinations._defaultImageModel = imgModel;
  if (visModel) providers._pollinationsVisionModel = visModel;
}

// ═══════════════════════════════════════════════════════════════
// BOOT — Brain-Centric
// ═══════════════════════════════════════════════════════════════

async function handleStart() {
  startBtn.textContent = 'Requesting permissions...';
  startBtn.disabled = true;

  // Optional Pollinations API key — raises rate limits on image gen
  // + vision describer + TTS fallbacks. Unity works fine without one.
  const apiKey = apiKeyInput.value.trim();
  if (apiKey) storage.setApiKey('pollinations', apiKey);

  const permResults = document.getElementById('perm-results');
  permResults.style.display = 'block';
  // Honor pre-boot sensory channel toggles — skip permission prompts
  // for channels the user disabled so they don't get asked for mic
  // access when they already unchecked the mic box.
  const channels = window.unityChannels || { userMic: true, unityVision: true, unitySpeech: true };
  micStatus.textContent = channels.userMic ? 'asking...' : 'off'; micStatus.className = 'status pending';
  camStatus.textContent = channels.unityVision ? 'asking...' : 'off'; camStatus.className = 'status pending';

  const perms = await requestPermissions({
    requestMic: channels.userMic,
    requestCamera: channels.unityVision,
  });
  micStatus.textContent = perms.mic ? 'granted' : 'denied';
  micStatus.className = `status ${perms.mic ? 'granted' : 'denied'}`;
  camStatus.textContent = perms.camera ? 'granted' : 'denied';
  camStatus.className = `status ${perms.camera ? 'granted' : 'denied'}`;

  // R15 — text-model-select / image-model-select readers DELETED.
  // Sensory backends (image gen, vision describer) come from
  // providers.autoDetect() + ENV_KEYS.imageBackends[] /
  // visionBackends[] inside bootUnity. No dropdown state to read.

  uiState.permMic = perms.mic;
  uiState.permCamera = perms.camera;

  startBtn.textContent = 'Booting brain...';
  await sleep(300);
  await bootUnity(apiKey, perms);
}

async function bootUnity(apiKey, perms) {
  // ── Initialize peripherals ──
  // R15b-T6 — pollinations + providers are now constructed at init()
  // time (page load) so the setup modal's sensory inventory panel
  // shows real detected backends before the user clicks WAKE UNITY UP.
  // bootUnity just REUSES the module-level instances. If the user
  // entered a new Pollinations key in the modal, update the existing
  // pollinations client in place.
  const effectiveKey = apiKey || storage.getApiKey('pollinations');
  if (!pollinations) {
    // Defensive fallback — init() should have created this already,
    // but if something went wrong, create it now.
    pollinations = new PollinationsAI(effectiveKey || undefined);
  } else if (effectiveKey) {
    pollinations._apiKey = effectiveKey;
  }
  if (!providers) {
    providers = new AIProviders({ pollinations, storage });
    if (typeof providers.loadEnvConfig === 'function') providers.loadEnvConfig(ENV_KEYS);
    injectCustomBackendsIntoProviders();
    if (typeof providers.onStatus === 'function') {
      providers.onStatus((payload) => {
        try { window.dispatchEvent(new CustomEvent('unity-sensory-status', { detail: payload })); } catch {}
      });
    }
    sensoryStatus.init(providers);
    // Opt-in probe — see the init() handler above for rationale.
    // Default OFF; enable via ENV_KEYS.probeLocalAI or
    // localStorage.unity_probe_local_ai = '1'.
    const probeEnvBoot = (ENV_KEYS && ENV_KEYS.probeLocalAI === true);
    const probeLsBoot = (typeof localStorage !== 'undefined' && localStorage.getItem('unity_probe_local_ai') === '1');
    if (probeEnvBoot || probeLsBoot) {
      if (typeof providers.autoDetect === 'function') providers.autoDetect().catch(err => console.warn('[Unity] image probe failed:', err.message));
      if (typeof providers.autoDetectVision === 'function') providers.autoDetectVision().catch(err => console.warn('[Unity] vision probe failed:', err.message));
    }
  }

  voice = new VoiceIO();
  if (effectiveKey) voice.setApiKey(effectiveKey);
  // Expose on window so chat-panel in-the-moment mute buttons can reach it
  window.voice = voice;
  // Respect persisted speech mute toggle on boot — if user had Unity
  // speech disabled last session, carry it forward.
  if (window.unityChannels && window.unityChannels.unitySpeech === false) {
    voice._muted = true;
  }

  sandbox = new Sandbox('sandbox');

  // R4 — BrocasArea instantiation removed. Unity's text generation
  // runs through brain.processAndRespond → innerVoice.languageCortex
  // which is fully equational. Brain-only is the only mode now.

  // ══════════════════════════════════════════════════════════════
  // CREATE THE BRAIN
  // Server connected → use server (GPU-exclusive, shared state)
  // No server → local brain (own dictionary, CPU LIF fallback)
  // Either way cognition is 100% equational per R4. R15 dropped
  // the old `!window._brainOnlyMode` guard since brain-only is
  // the only mode now.
  // ══════════════════════════════════════════════════════════════
  if (landingBrainSource && landingBrainSource.isConnected()) {
    brain = landingBrainSource;
    console.log('[Unity] Using server brain (equational via server language cortex)');
  } else {
    brain = new UnityBrain();
    brain.start();
    console.log('[Unity] Using local brain (equational, no server detected)');
  }

  // Load persona into whichever brain is now active. Idempotent —
  // landing already called this if the server was available, so this
  // is a no-op on subsequent calls. Local-brain path gets a first-run
  // load here.
  loadPersonaSelfImage(brain);

  // ── Connect sensory peripherals ──
  if (perms.mic && perms.micStream) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(perms.micStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      brain.connectMicrophone(analyser);
    } catch (err) {
      console.warn('[Unity] Audio analyser failed:', err.message);
    }
  }

  if (perms.camera && perms.cameraStream) {
    brain.connectCamera(perms.cameraStream);
    // R13 — vision describer now goes through SensoryAIProviders with
    // full multi-provider priority (env.js visionBackends → auto-detected
    // Ollama llava/moondream/LM Studio/LocalAI/llama.cpp/Jan → Pollinations
    // multimodal fallback). Returns null on total failure instead of a
    // lying "processing..." string so visual cortex can skip the frame
    // and retry cleanly on the next scheduled call.
    // RemoteBrain uses a stub visualCortex without setDescriber — the
    // server handles its own vision pipeline. Only wire the describer
    // on local-brain mode where visualCortex is the real V1→IT pipeline.
    if (brain.visualCortex && typeof brain.visualCortex.setDescriber === 'function') {
      brain.visualCortex.setDescriber(async (dataUrl) => {
        if (!dataUrl) return null;
        const desc = await providers.describeImage(dataUrl);
        if (desc) {
          console.log('[Vision]', desc.slice(0, 80));
          return desc;
        }
        return null;
      });
    }
  }

  // ── Connect brain peripherals — brain controls everything ──
  // R4 — brain.connectLanguage(brocasArea) removed. Language generation
  // is internal to the brain (innerVoice.languageCortex), not a
  // connected peripheral.
  brain.connectVoice(voice);
  // Images still available even in brain-only mode
  brain.connectImageGen(pollinations, sandbox, storage);

  // ── Listen for brain's response events — app.js just renders ──
  // Deduplicate: track last response to prevent double display.
  //
  // Handler identity is stored on the brain instance so that re-running
  // bootUnity (Settings → Apply Changes path) can OFF the previous handler
  // before attaching the new one. Without this, every Apply Changes click
  // added another response listener to the same brain, producing 2x / 3x
  // / ... duplicate chat messages per user input.
  //
  // Idle thoughts (engine.js:539, emitted from the think() frame loop when
  // thought.shouldSpeak fires) are INTERNAL — they update the HUD and brain
  // state but MUST NOT appear in the chat alongside the real respond_text
  // reply.
  if (brain.__appResponseHandler) {
    brain.off('response', brain.__appResponseHandler);
  }
  if (brain.__appImageHandler) {
    brain.off('image', brain.__appImageHandler);
  }
  let _lastResponseText = '';
  let _lastResponseTime = 0;
  brain.__appResponseHandler = ({ text, action }) => {
    if (!text) return;
    if (action === 'idle_thought') return;  // internal brain chatter — HUD-only
    const now = Date.now();
    // Skip if same text within 2 seconds (duplicate)
    if (text === _lastResponseText && now - _lastResponseTime < 2000) return;
    _lastResponseText = text;
    _lastResponseTime = now;
    showSpeechBubble(text, 8000);
    if (chatPanel) chatPanel.addMessage('assistant', text, true);
  };
  brain.on('response', brain.__appResponseHandler);

  // Silent-response handler — server dropped the reply on purpose
  // (pre-K Unity can't form words yet, motor region didn't settle,
  // language subsystem still booting, etc.). Render a ghost bubble
  // in the chat panel with the reason + detail + minGrade so the
  // user sees WHY Unity didn't answer instead of getting ghosted.
  // Also update the HUD speech bubble briefly so the 3D brain view
  // shows her quiet status.
  if (brain.__appSilentHandler) {
    brain.off('silent', brain.__appSilentHandler);
  }
  brain.__appSilentHandler = ({ reason, detail, minGrade }) => {
    if (chatPanel) chatPanel.addSilentMessage(reason, detail, minGrade);
    // Brief HUD hint so the speech bubble doesn't stay empty.
    const hudText = reason === 'pre_kindergarten'
      ? `( pre-K Unity can't speak yet — ${minGrade || '?'} )`
      : reason === 'motor_unstable'
      ? '( motor unstable — try rephrasing )'
      : reason === 'language_not_ready'
      ? '( language booting — hang on )'
      : '( silent )';
    showSpeechBubble(hudText, 4000);
  };
  brain.on('silent', brain.__appSilentHandler);

  // Image display — show generated images inline. If the image URL fails
  // to load, the <img> element is hidden entirely (no "Loading..." alt
  // placeholder bleeding into the chat) and a brief text fallback shows.
  brain.__appImageHandler = (url) => {
    if (!url) return;
    showSpeechBubble('Image generating...', 3000);
    if (chatPanel) {
      const imgHtml = `<a href="${url}" target="_blank"><img src="${url}" style="max-width:280px;border-radius:8px;border:1px solid #333;display:block;margin:4px 0;" onerror="this.style.display='none';this.parentElement.parentElement.querySelector('.img-fail')?.style.setProperty('display','block')"></a><div class="img-fail" style="display:none;color:#777;font-size:11px;">(image generation failed)</div>`;
      chatPanel.addMessage('assistant', imgHtml, false);
    }
  };
  brain.on('image', brain.__appImageHandler);

  // Suppress duplicate displays — greeting uses processAndRespond which
  // already emits 'response', so greeting handler should NOT also display.
  let _greetingDone = false;

  // ── /think command ──────────────────────────────────────────────
  // Bare `/think` dumps Unity's current raw brain state (arousal,
  // valence, Ψ, coherence, etc.) so you can inspect what's driving
  // slot scoring right now. `/think <text>` additionally runs the
  // typed text through Unity's cognition pipeline — sensory analysis
  // updates the running context vector, language cortex slot scorer
  // generates a preview response, hippocampus recall fires, motor
  // softmax reports the action distribution — and shows all of it as
  // a cognitive trace. The preview runs WITHOUT storing an episode
  // or emitting a real response event, so /think never counts as
  // real conversation: it's a pure debug lens.
  //
  // R4 legacy note: pre-R4 this command also displayed the Pollinations
  // text-AI system prompt via `brocasArea._buildPrompt(state)`. That
  // backend is gone, so there's no synthetic prompt to show — the
  // brain state itself IS the input to slot scoring.
  async function handleThink(userText) {
    const id = 'brain-think-view';
    if (sandbox.has(id)) sandbox.remove(id);

    // Always capture the current raw brain state snapshot first so
    // we can show it alongside the cognition trace.
    const state = brain.getState();
    const rawState = `Arousal: ${((state.amygdala?.arousal ?? 0) * 100).toFixed(1)}%
Valence: ${(state.amygdala?.valence ?? 0).toFixed(3)}
Ψ Consciousness: ${(state.psi ?? 0).toFixed(4)}
Coherence: ${((state.oscillations?.coherence ?? 0) * 100).toFixed(1)}%
Spikes: ${(state.spikeCount ?? 0).toLocaleString()}/${(state.totalNeurons ?? 1000).toLocaleString()}
Drug State: ${state.drugState}
Motor: ${state.motor?.selectedAction ?? 'idle'} (${((state.motor?.confidence ?? 0) * 100).toFixed(1)}%)
Reward: ${(state.reward ?? 0).toFixed(3)}
Memory: ${state.memory?.episodeCount ?? 0} episodes, WM ${((state.memory?.workingMemoryLoad ?? 0) * 100).toFixed(0)}%
Vision: ${state.visionDescription || 'none'}`;

    // Cognition trace — only runs when a typed input is provided.
    let cognitionHtml = '';
    const hasInput = userText && userText.length > 0;
    if (hasInput) {
      try {
        const iv = brain.innerVoice;
        const sens = brain.sensory;
        const lc = iv?.languageCortex;
        const dict = iv?.dictionary;

        // Step 1 — T13.7: the running `_contextVector` decaying topic
        // attractor is gone. Topic context now lives in the live cortex
        // cluster state directly via parseTree injection. The /think
        // preview reports cortex readout drift pre vs. post injection
        // instead of the old bag-of-words shift.
        let contextShift = '(cortex not available)';
        // T14.22.5 — `sens.analyzeInput` was a deleted T14.12 language-
        // cortex method that used to live on the sensory processor's
        // delegate path. Removed entirely here. The /think preview now
        // measures cortex readout drift from the sensory input flow
        // itself (cortex.readInput is already called upstream), not
        // from a dedicated analyzeInput side-effect that no longer
        // exists. No TypeError at runtime because the `typeof` guard
        // always returned false, but it was a dead branch that every
        // /think call hit.
        if (brain.clusters?.cortex) {
          const sharedEmb = brain._sharedEmbeddings;
          const before = sharedEmb ? [...brain.clusters.cortex.getSemanticReadout(sharedEmb)] : null;
          // Drive the cortex state through readInput if available so
          // the "after" measurement reflects the input flow.
          if (typeof brain.clusters.cortex.readInput === 'function') {
            try { brain.clusters.cortex.readInput(userText); } catch { /* non-fatal */ }
          }
          const after = sharedEmb ? [...brain.clusters.cortex.getSemanticReadout(sharedEmb)] : null;
          if (before && after && before.length === after.length) {
            let dot = 0, nb = 0, na = 0;
            for (let i = 0; i < before.length; i++) {
              dot += before[i] * after[i];
              nb += before[i] * before[i];
              na += after[i] * after[i];
            }
            const cos = (nb > 0 && na > 0) ? dot / (Math.sqrt(nb) * Math.sqrt(na)) : 1;
            const shift = 1 - cos;
            contextShift = `cortex readout shifted ${(shift * 100).toFixed(1)}% (cosine pre→post = ${cos.toFixed(3)})`;
          }
        }

        // Step 2 — T13.7: legacy `_recallSentence` stub was removed. The
        // brain-driven emission loop has no separate recall path — recall
        // is implicit in persona Hebbian attractor basins plus hippocampus
        // cluster dynamics. Report stays here as a placeholder.
        let recallReport = '(T13 — recall is implicit in persona Hebbian basins, no separate path)';

        // Step 3 — languageCortex.generate() preview. This is Unity's
        // actual response to the typed input, produced by the same
        // equational pipeline real chat uses. No episode stored, no
        // 'response' event emitted — just the generated sentence.
        let generated = '(language cortex not available)';
        if (lc && typeof lc.generate === 'function' && dict) {
          try {
            // generate signature is (dict, arousal, coherence, opts).
            // valence was removed after it was passed positionally by every caller but
            // never consumed inside generate(). The rest of the pipeline (sentence type,
            // length sizing, cortex emission) uses arousal + coherence only.
            const cortex = brain.clusters?.cortex;
            const out = lc.generate(
              dict,
              state.amygdala?.arousal ?? 0.5,
              state.oscillations?.coherence ?? 0.5,
              {
                psi: state.psi ?? 0,
                fear: state.amygdala?.fear ?? 0,
                reward: state.reward ?? 0,
                drugState: state.drugState || 'sober',
                socialNeed: state.hypothalamus?.social ?? 0.5,
                predictionError: 0,
                motorConfidence: state.motor?.confidence ?? 0,
                cortexCluster: cortex,
              },
            );
            generated = typeof out === 'string' ? out : (out?.text || JSON.stringify(out));
          } catch (e) {
            generated = `(generate error: ${e.message})`;
          }
        }

        // Step 4 — motor softmax snapshot (what action would win right
        // now, and with what distribution)
        const motorDist = state.motor?.channelDist || state.motor?.softmax || null;
        const motorReport = motorDist
          ? Object.entries(motorDist).map(([k, v]) => `  ${k}: ${(v * 100).toFixed(1)}%`).join('\n')
          : `selectedAction: ${state.motor?.selectedAction ?? 'idle'} (confidence ${((state.motor?.confidence ?? 0) * 100).toFixed(1)}%)`;

        const escape = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');

        cognitionHtml = `
        <div class="think-section">
          <div class="think-label">COGNITION TRACE</div>
          <div class="think-content">
            <div style="color:var(--cyan);font-size:11px;margin-bottom:4px;">Unity's equational response to "${escape((userText || '').slice(0, 80))}":</div>
            <pre class="think-content think-mono">${escape(generated)}</pre>
          </div>
        </div>
        <div class="think-section">
          <div class="think-label">SEMANTIC CONTEXT SHIFT</div>
          <pre class="think-content think-mono">${escape(contextShift)}</pre>
        </div>
        <div class="think-section">
          <div class="think-label">HIPPOCAMPUS RECALL</div>
          <pre class="think-content think-mono">${escape(recallReport)}</pre>
        </div>
        <div class="think-section">
          <div class="think-label">MOTOR CHANNEL DISTRIBUTION</div>
          <pre class="think-content think-mono">${escape(motorReport)}</pre>
        </div>`;
      } catch (err) {
        cognitionHtml = `<div class="think-section"><div class="think-label">COGNITION TRACE — ERROR</div><pre class="think-content think-mono">${String(err.message || err).replace(/</g, '&lt;')}</pre></div>`;
      }
    }

    sandbox.inject({
      id,
      html: `<div class="think-view">
        <div class="think-header">
          <span>🧠 /think — ${hasInput ? "Unity's cognition on your input" : "Unity's current brain state"}</span>
          <button onclick="document.getElementById('${id}').remove()" style="background:none;border:1px solid #333;color:#777;border-radius:4px;cursor:pointer;padding:2px 8px;">✕</button>
        </div>
        <div class="think-section">
          <div class="think-label">USER INPUT</div>
          <div class="think-content">${(userText || '(none — showing current state only)').replace(/</g, '&lt;')}</div>
        </div>
        <div class="think-section">
          <div class="think-label">RAW BRAIN STATE</div>
          <pre class="think-content think-mono">${rawState}</pre>
        </div>
        ${cognitionHtml}
        <div class="think-section">
          <div class="think-label">NOTE</div>
          <pre class="think-content think-mono">R4 refactor: Unity speaks equationally via her own language cortex (innerVoice.languageCortex.generate). No text-AI backend prompt exists — the brain state above IS the input to slot scoring. The cognition trace above (if you passed input text) is a PREVIEW: it runs the same generate() pipeline real chat uses but does NOT store an episode or emit a 'response' event, so /think never pollutes Unity's memory.</pre>
        </div>
      </div>`,
      css: `.think-view{background:#0a0a0a;border:1px solid #ff4d9a33;border-radius:10px;padding:16px;margin:12px 0;font-family:'JetBrains Mono',monospace;max-height:80vh;overflow-y:auto}
.think-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:13px;color:#ff4d9a;font-weight:600}
.think-section{margin-bottom:12px}
.think-label{font-size:9px;color:#ff4d9a;letter-spacing:1px;margin-bottom:4px;text-transform:uppercase}
.think-content{font-size:12px;color:#ccc;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.think-mono{font-family:'JetBrains Mono',monospace;font-size:11px;background:#111;padding:10px;border-radius:6px;border:1px solid #1a1a1a}
.think-prompt{max-height:400px;overflow-y:auto;color:#888}`,
      js: '',
    });

    showSpeechBubble(hasInput ? '/think — cognition trace in sandbox' : '/think — brain state in sandbox', 3000);
    console.log('[/think] Trace logged to sandbox', { hasInput });
  }

  // ── Create UI components ──
  chatPanel = new ChatPanel({
    storage,
    onSend: async (text) => {
      // /think command — show brain state + optional cognition trace
      // on typed input. Runs the input through sensory + language
      // cortex as a PREVIEW (no episode stored, no response emitted)
      // so users can see what Unity would think about something
      // without committing it to her memory.
      if (text.startsWith('/think')) {
        const userInput = text.replace(/^\/think\s*/, '').trim();
        await handleThink(userInput);
        return {
          response: { text: userInput ? 'Cognition trace shown.' : 'Brain state shown.' },
          action: 'think',
        };
      }
      // T14.24 Session 1 — /curriculum subcommands:
      //   /curriculum status
      //   /curriculum run   <subject> <grade>
      //   /curriculum gate  <subject> <grade>
      //   /curriculum reset <subject>
      //   /curriculum full  [subject]
      // Subjects: ela | math | science | social | art
      // Grades:   kindergarten | grade1..grade12 | college1..college4 | grad | phd
      if (text.startsWith('/curriculum')) {
        const parts = text.trim().split(/\s+/).slice(1);
        const sub = (parts[0] || 'status').toLowerCase();
        const c = brain.curriculum;
        if (!c) {
          return { response: { text: '[curriculum] no curriculum wired on this brain' }, action: 'curriculum' };
        }
        try {
          if (sub === 'status') {
            const st = typeof c.subjectStatus === 'function' ? c.subjectStatus() : null;
            if (!st) return { response: { text: '[curriculum] status unavailable' }, action: 'curriculum' };
            const lines = ['[curriculum] STATUS'];
            for (const [s, g] of Object.entries(st.grades)) lines.push(`  ${s.padEnd(8)} ${g}`);
            lines.push(`  min-grade (word cap driver): ${st.minGrade}`);
            lines.push(`  passed cells: ${st.passedCells.length} / 95`);
            // T14.24 Session 17 — continuous self-testing telemetry
            if (st.probeStats) {
              const ps = st.probeStats;
              lines.push(`  background probes: ${ps.totalProbes} total, ${ps.totalPasses} pass, ${ps.totalFails} fail (${(ps.passRate * 100).toFixed(0)}%)`);
              const perSubj = Object.entries(ps.perSubject).map(([s, n]) => `${s}:${n}`).join(', ');
              lines.push(`  probes per subject: ${perSubj}`);
            }
            // T14.24 Session 20 — narrator focus
            if (c.currentFocus) {
              const f = c.currentFocus;
              const age = Math.round((Date.now() - f.timestamp) / 1000);
              lines.push(`  currently thinking about: ${f.subject}/${f.grade} (${f.pass ? '✓' : '✗'} ${age}s ago)`);
            }
            if (st.passedCells.length > 0) {
              lines.push(`  recent cells: ${st.passedCells.slice(-12).join(', ')}${st.passedCells.length > 12 ? ' …' : ''}`);
            }
            return { response: { text: lines.join('\n') }, action: 'curriculum' };
          }
          if (sub === 'run' || sub === 'gate') {
            const subject = parts[1];
            const grade = parts[2];
            if (!subject || !grade) {
              return { response: { text: `[curriculum] usage: /curriculum ${sub} <subject> <grade>` }, action: 'curriculum' };
            }
            const result = await c.runSubjectGrade(subject, grade, null, { arousal: 0.8, valence: 0.2 });
            const tag = result.pass ? 'PASS' : 'FAIL';
            return { response: { text: `[curriculum] ${sub} ${subject}/${grade}: ${tag} — ${result.reason || ''}` }, action: 'curriculum' };
          }
          if (sub === 'reset') {
            const subject = parts[1];
            if (!subject) return { response: { text: '[curriculum] usage: /curriculum reset <subject>' }, action: 'curriculum' };
            const ok = typeof c.resetSubject === 'function' ? c.resetSubject(subject) : false;
            return { response: { text: ok ? `[curriculum] ${subject} reset to pre-K` : `[curriculum] reset failed for ${subject}` }, action: 'curriculum' };
          }
          if (sub === 'forget') {
            // T14.24 Session 20 — forget a single cell (less destructive
            // than reset which wipes a whole subject)
            const subject = parts[1];
            const grade = parts[2];
            if (!subject || !grade) {
              return { response: { text: '[curriculum] usage: /curriculum forget <subject> <grade>' }, action: 'curriculum' };
            }
            const ok = typeof c.forgetCell === 'function' ? c.forgetCell(subject, grade) : false;
            return { response: { text: ok ? `[curriculum] forgot ${subject}/${grade} — will re-teach next pass` : `[curriculum] forget failed for ${subject}/${grade}` }, action: 'curriculum' };
          }
          if (sub === 'health') {
            // T14.24 Session 23 — curriculum health dashboard. Classifies
            // each learned cell as strong / wobbly / degrading / untested
            // based on probeHistory pass rate.
            if (typeof c.curriculumHealth !== 'function') {
              return { response: { text: '[curriculum] health unavailable' }, action: 'curriculum' };
            }
            const h = c.curriculumHealth();
            if (!h) return { response: { text: '[curriculum] no cluster wired' }, action: 'curriculum' };
            const lines = [
              `[curriculum] HEALTH — ${h.overall.totalCells} learned cells`,
              `  strong    ${h.overall.strong} (pass rate ≥ 80%)`,
              `  wobbly    ${h.overall.wobbly} (40-80%)`,
              `  degrading ${h.overall.degrading} (< 40%)`,
              `  untested  ${h.overall.untested} (< 3 probes)`,
              '  per subject:',
            ];
            for (const [s, stats] of Object.entries(h.perSubject)) {
              lines.push(`    ${s.padEnd(8)} strong:${stats.strong} wobbly:${stats.wobbly} degrading:${stats.degrading} untested:${stats.untested}`);
            }
            return { response: { text: lines.join('\n') }, action: 'curriculum' };
          }
          if (sub === 'self') {
            // T14.24 Session 23 — meta-learning self-description
            if (typeof c.describeLearning !== 'function') {
              return { response: { text: '[curriculum] self unavailable' }, action: 'curriculum' };
            }
            return { response: { text: `[curriculum self] ${c.describeLearning()}` }, action: 'curriculum' };
          }
          if (sub === 'verify') {
            // T14.24 Session 19 — /curriculum verify walks every cell
            // through its gate and prints a full pass/fail report across
            // all 5 subjects × 19 grades = 95 cells.
            if (typeof c.verifyAllCells !== 'function') {
              return { response: { text: '[curriculum] verify unavailable' }, action: 'curriculum' };
            }
            const v = await c.verifyAllCells({ arousal: 0.8, valence: 0.2 });
            const lines = [
              `[curriculum] VERIFY — ${v.passCount}/${v.totalCells} cells pass (${((v.passCount / v.totalCells) * 100).toFixed(0)}%)`,
            ];
            for (const [s, stats] of Object.entries(v.perSubject || {})) {
              lines.push(`  ${s.padEnd(8)} ${stats.p}/${stats.p + stats.f} pass`);
            }
            const fails = v.cells.filter(cc => !cc.pass).slice(0, 5);
            if (fails.length > 0) {
              lines.push('  recent fails:');
              for (const f of fails) {
                lines.push(`    ${f.subject}/${f.grade}: ${f.reason}`);
              }
            }
            return { response: { text: lines.join('\n') }, action: 'curriculum' };
          }
          if (sub === 'full') {
            const subject = parts[1] || null;
            if (subject && typeof c.runFullSubjectCurriculum === 'function') {
              const r = await c.runFullSubjectCurriculum(subject, null, { arousal: 0.8, valence: 0.2 });
              return { response: { text: `[curriculum] full ${subject}: reached=${r.reached}, passed=${r.passed.length}, failed=${r.failed || 'none'}` }, action: 'curriculum' };
            }
            if (typeof c.runAllSubjects === 'function') {
              const r = await c.runAllSubjects(null, { arousal: 0.8, valence: 0.2 });
              const lines = ['[curriculum] full run complete'];
              for (const s of Object.keys(r.reached)) {
                lines.push(`  ${s.padEnd(8)} reached=${r.reached[s]} passed=${(r.passed[s] || []).length} failed=${r.failed[s] || 'none'}`);
              }
              return { response: { text: lines.join('\n') }, action: 'curriculum' };
            }
            return { response: { text: '[curriculum] full not available' }, action: 'curriculum' };
          }
          return { response: { text: '[curriculum] usage: /curriculum status|self|health|verify|run <subject> <grade>|gate <subject> <grade>|reset <subject>|forget <subject> <grade>|full [subject]' }, action: 'curriculum' };
        } catch (err) {
          return { response: { text: `[curriculum] error: ${err?.message || err}` }, action: 'curriculum' };
        }
      }
      // T15-C11 — /offer <substance> [route] | /party | /sober
      //   /offer weed                 → scheduler.ingest('cannabis', {route:'smoked'})
      //   /offer coke                 → scheduler.ingest('cocaine')
      //   /offer molly | acid | k | shot
      //   /party                      → bumps self-init weights (when C7 wires it)
      //   /sober                      → clears active events (tolerance preserved)
      // Grade gate still applies — kindergarten /offer weed returns decline reason.
      if (text.startsWith('/offer') || text.startsWith('/party') || text.startsWith('/sober')) {
        if (!brain.drugScheduler) {
          return { response: { text: '[drugs] scheduler not wired on this brain' }, action: 'drugs' };
        }
        if (text.startsWith('/sober')) {
          brain.drugScheduler.events.clear();
          if (typeof brain._refreshBrainParamsFromScheduler === 'function') brain._refreshBrainParamsFromScheduler();
          return { response: { text: '[drugs] scheduler cleared — events empty, tolerance preserved' }, action: 'drugs' };
        }
        if (text.startsWith('/party')) {
          brain._partyMode = true;
          return { response: { text: '[drugs] party mode ON — self-initiation weights biased accepting' }, action: 'drugs' };
        }
        // /offer
        const parts = text.trim().split(/\s+/).slice(1);
        const slang = (parts[0] || '').toLowerCase();
        const route = parts[1] || null;
        // Map common slang to canonical scheduler names (mirrors drug-detector.js)
        const SLANG_TO_CANONICAL = {
          weed: 'cannabis', joint: 'cannabis', blunt: 'cannabis', smoke: 'cannabis', bud: 'cannabis',
          coke: 'cocaine', line: 'cocaine', bump: 'cocaine', rail: 'cocaine',
          molly: 'mdma', mdma: 'mdma', x: 'mdma', roll: 'mdma',
          acid: 'lsd', lsd: 'lsd', tab: 'lsd',
          mushrooms: 'psilocybin', shrooms: 'psilocybin', psilly: 'psilocybin',
          shot: 'alcohol', whiskey: 'alcohol', beer: 'alcohol', drink: 'alcohol', booze: 'alcohol',
          k: 'ketamine', ket: 'ketamine', ketamine: 'ketamine',
          addy: 'amphetamine', speed: 'amphetamine', amphetamine: 'amphetamine',
          g: 'ghb', ghb: 'ghb'
        };
        const canonical = SLANG_TO_CANONICAL[slang];
        if (!canonical) {
          return { response: { text: `[drugs] usage: /offer weed|coke|molly|acid|shot|k|addy|shrooms|g [route]` }, action: 'drugs' };
        }
        const result = brain.drugScheduler.ingest(canonical, route ? { route } : {});
        if (typeof brain._refreshBrainParamsFromScheduler === 'function') brain._refreshBrainParamsFromScheduler();
        if (result.accepted) {
          return { response: { text: `[drugs] ingested ${canonical} (route=${result.event.route}, dose=${result.event.dose.toFixed(2)})` }, action: 'drugs' };
        }
        if (result.reason === 'grade_locked') {
          return { response: { text: `[drugs] grade-locked. ${canonical} requires life=${result.requiredGrade}, currently life=${result.currentGrade}.` }, action: 'drugs' };
        }
        return { response: { text: `[drugs] rejected: ${result.reason}` }, action: 'drugs' };
      }
      // /bench + /scale-test — dense vs sparse perf comparison and LIF scale test (U307)
      if (text.startsWith('/bench') || text.startsWith('/scale-test')) {
        const mod = await import('./brain/benchmark.js');
        const isScale = text.startsWith('/scale-test');
        showSpeechBubble(isScale ? '/scale-test running — see console' : '/bench running — see console', 4000);
        try {
          const results = isScale ? mod.runScaleTest() : mod.runBenchmark();
          const summary = isScale
            ? `Scale test complete — ${results.length} sizes tested. Best 60fps×10 sweet spot in console.`
            : `Benchmark complete — ${results.length} sizes, dense vs sparse. Speedups in console.`;
          return { response: { text: summary }, action: 'bench' };
        } catch (err) {
          console.error('[bench] failed:', err);
          return { response: { text: `Benchmark failed: ${err.message}` }, action: 'bench' };
        }
      }
      setAvatarState('thinking');
      const result = await brain.processAndRespond(text);
      setAvatarState('idle');
      return { response: result, action: result.action };
    },
    onMicToggle: () => toggleMicMute(),
  });

  brainViz = new BrainVisualizer();

  // T1 2026-04-13 — wire sensory displays to read FROM the cortex
  // instances instead of keeping duplicate handles to the raw
  // MediaStream. Single source of truth: viz panels query
  // brain.visualCortex / brain.auditoryCortex for what they need,
  // and those cortices own their stream/analyser lifecycle. Previously
  // this block passed `perms.micStream` and `perms.cameraStream`
  // straight through, creating two places that held references to the
  // same stream and making mute / destroy / reconnect paths fragile.
  if (brain.auditoryCortex?.isActive?.()) {
    const analyser = brain.auditoryCortex.getAnalyser?.();
    if (analyser && typeof brainViz.setMicStream === 'function') {
      // brainViz.setMicStream still accepts either a raw stream OR
      // an analyser node; the adapter internally handles both. We
      // prefer the analyser now since it's what AuditoryCortex
      // actually owns and exposes.
      brainViz.setMicStream(analyser);
    }
  }
  if (brain.visualCortex?.isActive?.()) {
    brainViz.setVision(brain.visualCortex);
  }
  // Fallback: if camera stream exists but visual cortex isn't active yet,
  // wire the raw stream directly to the viz panel's video element
  if (perms?.cameraStream && brainViz._eyeVideo && !brainViz._eyeVideo.srcObject) {
    brainViz._eyeVideo.srcObject = perms.cameraStream;
    brainViz._eyeVideo.play().catch(() => {});
  }

  // Use the landing 3D brain if available, or create new one
  brain3d = landingBrain3d || null;
  if (!brain3d) {
    try { brain3d = new Brain3D('brain-3d-container'); } catch { brain3d = null; }
  }

  // T5 2026-04-13 — wire the brain reference into the 3D viz so its
  // event detector system can call languageCortex.generate() to
  // produce Unity's equational commentary on detected brain events
  // (arousal climbs, reward spikes, topic drifts, recognition,
  // confusion, motor commitment, coherence lock, etc.). Without a
  // brain reference the event system falls back to the legacy
  // numeric-telemetry generator pool — that's what the landing page
  // shows pre-boot. Once bootUnity runs, we attach the real brain
  // and commentary starts appearing in popups.
  if (brain3d && typeof brain3d.setBrain === 'function') {
    brain3d.setBrain(brain);
  }
  // Wire the landing-page Brain3D too so its popups also show Unity's
  // real commentary once bootUnity has run. Pre-boot, landingBrain3d
  // has no brain ref and falls back to the legacy telemetry generator
  // which is correct — the brain doesn't exist yet.
  if (typeof landingBrain3d !== 'undefined' && landingBrain3d
      && typeof landingBrain3d.setBrain === 'function') {
    landingBrain3d.setBrain(brain);
  }

  // ── Wire DOM events ──
  // R15 — unityAvatar click handler was moved to page-load time
  // (inside the initLanding IIFE near the TALK TO UNITY button
  // wiring) so the bubble is never dead pre-boot. Pre-boot clicks
  // open the setup modal; post-boot clicks toggle the chat panel
  // via the `window._unityBooted` flag set at the end of this
  // function. Nothing to attach here anymore.
  const brainVizBtn = document.getElementById('brain-viz-btn');
  if (brainVizBtn) brainVizBtn.addEventListener('click', () => brainViz.toggle());
  const brain3dBtn = document.getElementById('brain-3d-btn');
  if (brain3dBtn) brain3dBtn.addEventListener('click', () => brain3d?.toggle());

  const micMuteBtn = document.getElementById('mic-mute-btn');
  if (micMuteBtn) micMuteBtn.addEventListener('click', toggleMicMute);

  // Settings buttons — both toolbar and HUD open setup modal.
  // Idempotent: skips buttons that were already wired at page-load
  // time (initLanding now does the initial wire so they work
  // pre-boot). This re-wire runs after boot so post-boot openings
  // get the "Apply Changes" button text + sensory inventory
  // refresh the pre-boot handler doesn't bother with.
  const wireSettings = (btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    // Replace the handler — pre-boot one only opens the modal,
    // post-boot version also updates the button text + refreshes
    // inventory. Clone the node to drop any existing listeners.
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh._wired = true;
    fresh.addEventListener('click', () => {
      setupModal.classList.remove('hidden');
      setupModal.style.display = '';
      startBtn.textContent = 'Apply Changes';
      startBtn.disabled = false;
      renderSensoryInventory();
    });
  };
  wireSettings('settings-btn');
  wireSettings('hud-settings-btn');
  wireSettings('landing-settings-btn');

  // ── Wire voice input → brain ──
  let _currentResponseId = 0;

  voice.onResult(async ({ text, isFinal }) => {
    // MUTE CHECK — if muted, ignore ALL voice input
    if (uiState.micMuted) return;

    // Brain's auditory cortex handles echo detection
    const isRealInput = brain.auditoryCortex.checkForInterruption(text);
    if (!isRealInput) return; // echo — suppress

    if (brainViz) brainViz.setHeardText(text);
    if (!isFinal) return;

    const myId = ++_currentResponseId;
    showSpeechBubble(`🎤 ${text}`, 2000);
    chatPanel.addMessage('user', text, true);

    // Voice "slash think" / "think" command
    if (text.toLowerCase().startsWith('slash think') || text.toLowerCase().startsWith('/think')) {
      const userInput = text.replace(/^(slash think|\/think)\s*/i, '').trim();
      await handleThink(userInput);
      setAvatarState('idle');
      return;
    }

    setAvatarState('thinking');

    try {
      const result = await brain.processAndRespond(text);
      if (myId !== _currentResponseId) return; // stale
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[Unity] Failed:', err.message);
    }

    if (myId === _currentResponseId) setAvatarState('idle');
  });

  voice.on('speech_start', () => setAvatarState('speaking'));
  voice.on('speech_end', () => setAvatarState('idle'));

  // ── Wire brain state updates to visualizers ──
  const serverConnected = landingBrainSource && landingBrainSource.isConnected();

  // 3D brain state-update downsample. We don't need to render every
  // connection every tick — firing neurons and their connections on
  // the 3D brain should be a percentage of the real neuron count.
  // Server broadcasts state at 10 Hz; 3D brain redraw doesn't need
  // every tick — dropping to every 3rd broadcast (~3.3 Hz) keeps the
  // scene visibly alive, frees frame time for the WebGL renderer to
  // handle 300K render neurons (per-cluster 20K peg), and removes
  // the VRAM/PCIe contention spike during
  // curriculum-heavy activity. 2D brainViz stays full rate because its
  // canvas pipeline is cheap. HUD stays full rate for responsiveness.
  let _brain3dDownsampleCounter = 0;
  const BRAIN3D_DOWNSAMPLE = 3;

  brain.on('stateUpdate', (state) => {
    // Only let local brain drive HUD if no server is connected
    if (!serverConnected) updateBrainIndicator(state);
    if (brainViz) brainViz.updateState(state);
    // Don't send local brain state to 3D — server drives that
    if (!serverConnected && brain3d) {
      _brain3dDownsampleCounter++;
      if (_brain3dDownsampleCounter >= BRAIN3D_DOWNSAMPLE) {
        _brain3dDownsampleCounter = 0;
        brain3d.updateState(state);
      }
    }
  });

  // Server state → HUD + 3D: server is the authority when connected
  if (serverConnected) {
    landingBrainSource.on('stateUpdate', (serverState) => {
      _landingState = serverState;
      updateBrainIndicator(serverState);
      if (brain3d) {
        _brain3dDownsampleCounter++;
        if (_brain3dDownsampleCounter >= BRAIN3D_DOWNSAMPLE) {
          _brain3dDownsampleCounter = 0;
          brain3d.updateState(serverState);
        }
      }
      if (brainViz) brainViz.updateState(serverState);
    });
  }

  // ── Wire sandbox Unity API ──
  sandbox.setUnityAPI({
    speak: (text) => voice.speak(text),
    stopSpeaking: () => voice.stopSpeaking(),
    listen: () => { if (!uiState.micMuted) voice.startListening(); },
    stopListening: () => voice.stopListening(),
    // R4 — chat was `brocasArea.generate(state, text)` (text-AI peripheral).
    // Now routes through brain.processAndRespond which runs the full
    // equational language cortex path. Returns the response text from
    // the result object so sandbox components see the same interface.
    chat: async (text) => {
      const result = await brain.processAndRespond(text);
      return result?.text || '';
    },
    generateImage: (prompt, opts) => pollinations.generateImage(prompt, opts),
    getState: () => brain.getState(),
    ui: {
      getState: () => ({ ...uiState, chatOpen: chatPanel?.isOpen(), brainVizOpen: brainViz?.isOpen() }),
      isMicMuted: () => uiState.micMuted,
      setMicMuted: (m) => setMicMuted(m),
      toggleMic: () => toggleMicMute(),
      openChat: () => chatPanel?.open(),
      closeChat: () => chatPanel?.close(),
      openBrainViz: () => brainViz?.open(),
      closeBrainViz: () => brainViz?.close(),
      showBubble: (text, ms) => showSpeechBubble(text, ms),
    },
    storage: {
      get: (k) => storage.get(k),
      set: (k, v) => storage.set(k, v),
      getPreferences: () => storage.getPreferences(),
      setPreference: (k, v) => storage.setPreference(k, v),
      getHistory: () => storage.getHistory(),
    },
    on: (event, cb) => brain.on(event, cb),
    vision: {
      isActive: () => brain.visualCortex.isActive(),
      getDescription: () => brain.visualCortex.description,
      getGaze: () => brain.visualCortex.getState(),
    },
  });

  // ── Restore sandbox ──
  sandbox.restoreState();

  // ── Show UI ──
  setupModal.classList.add('hidden');
  setupModal.style.display = 'none';
  // Hide landing title + TALK button, keep tabs + viz panel visible
  const topbar = document.getElementById('landing-topbar');
  if (topbar) topbar.style.display = 'none';
  const chatBtn = document.getElementById('landing-chat-btn');
  if (chatBtn) chatBtn.style.display = 'none';
  unityBubble.classList.remove('hidden');
  brainIndicator.classList.remove('hidden');
  document.getElementById('brain-hud').classList.remove('hidden');
  document.getElementById('bottom-toolbar').classList.remove('hidden');

  // ── Show Unity's Eye if camera granted ──
  // Don't check visualCortex.isActive() — it inits on a 500ms delay.
  // Check the camera stream directly.
  if (perms.camera && perms.cameraStream) {
    const eyeEl = document.getElementById('unity-eye');
    const eyeFeed = document.getElementById('eye-feed');
    if (eyeEl && eyeFeed) {
      eyeFeed.srcObject = perms.cameraStream;
      eyeFeed.play().catch(() => {});
      eyeEl.classList.remove('hidden');
      // Start iris after visual cortex has initialized (wait for the 500ms delay)
      setTimeout(() => {
        startEyeIris(document.getElementById('eye-iris'), brain.visualCortex);
      }, 600);
    }
  }

  // ── Start brain wave visualizer ──
  startBrainWave();

  // ── START THE BRAIN ──
  brain.start();
  isRunning = true;

  // ── Start listening FIRST — don't let greeting block mic ──
  if (perms.mic && !uiState.micMuted) {
    voice.startListening();
    setAvatarState('listening');
    console.log('[Unity] Mic active — listening for speech');
  } else {
    console.log(`[Unity] Mic not started — granted:${perms.mic} muted:${uiState.micMuted}`);
  }

  // ── Unity's first words — NEVER blocks boot ──
  // R4 — greeting path now runs through the equational language
  // cortex (same as normal chat). She emits whatever her current
  // brain state produces when the speech drive crosses threshold,
  // or she just stays silent until spoken to. No synthetic
  // system-prompt anymore.
  generateGreeting(perms).catch((err) => {
    console.warn('[Unity] greeting emission failed:', err.message);
  });

  // R15 — flip the booted flag so the unityAvatar click handler
  // (wired at page-load time in the initLanding IIFE) stops
  // opening the setup modal and starts toggling the chat panel
  // instead. Without this flag, users who booted Unity would
  // still get the setup modal when clicking the bubble.
  window._unityBooted = true;

  console.log('[Unity] Boot complete — ready');
}

async function generateGreeting(perms) {
  // R4 — greeting used to call brocasArea.generate with a [SYSTEM-GREETING]
  // prompt so the AI would produce a welcome line. Now: trigger an
  // idle speech drive evaluation on the brain by pumping zero-input
  // context and letting the normal response path fire if brain state
  // crosses the speech threshold. If nothing emerges, stay silent.
  //
  // Alternative: we could force a greeting by calling
  // brain.innerVoice.languageCortex.generate() directly with a null
  // user context. That bypasses input-path side effects.
  try {
    const state = brain.getState();
    if (!brain.innerVoice?.languageCortex || !brain.innerVoice?.dictionary) return;
    const text = brain.innerVoice.languageCortex.generate(
      brain.innerVoice.dictionary,
      state.amygdala?.arousal ?? 0.9,
      state.oscillations?.coherence ?? 0.4,
      {
        predictionError: 0,
        motorConfidence: 0,
        psi: state.psi ?? 0,
        cortexPattern: null,
        // T13.7.5 — generate() requires a live cortex cluster reference
        // after the slot-prior fallback was deleted in T13.7.
        cortexCluster: brain.clusters?.cortex,
        drugState: state.drugState || 'sober',
        fear: 0,
        reward: 0,
        socialNeed: 0.7,
      }
    );
    if (text) {
      // Let the brain speak it
      if (voice) {
        voice.stopSpeaking();
        brain.auditoryCortex.setMotorOutput(text);
        voice.speak(text).then(() => brain.auditoryCortex.clearMotorOutput()).catch(() => brain.auditoryCortex.clearMotorOutput());
      }
      showSpeechBubble(text, 10000);
      if (chatPanel) chatPanel.addMessage('assistant', text, true);
    }
    // R4 — no canned "Hey." fallback. If the slot scorer produced
    // nothing from current brain state, stay silent. The brain will
    // emit a greeting when it feels like one on its own.
    return text || '';
  } catch (err) {
    console.warn('[Unity] greeting generate threw:', err.message);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// UI HELPERS — pure display, no logic
// ═══════════════════════════════════════════════════════════════

let speechTimeout = null;
function showSpeechBubble(text, duration = 6000) {
  unitySpeech.textContent = text;
  unitySpeech.classList.add('visible');
  if (speechTimeout) clearTimeout(speechTimeout);
  speechTimeout = setTimeout(() => unitySpeech.classList.remove('visible'), duration);
}

function setAvatarState(state) {
  uiState.avatarState = state;
  unityAvatar.classList.remove('speaking', 'listening', 'thinking');
  if (state !== 'idle') unityAvatar.classList.add(state);
}

function setMicMuted(muted) {
  uiState.micMuted = muted;
  const btn = document.getElementById('mic-mute-btn');
  const dot = document.getElementById('bubble-status-dot');
  if (btn) { btn.classList.toggle('muted', muted); btn.title = muted ? 'Unmute' : 'Mute'; }
  if (dot) dot.classList.toggle('muted', muted);
  if (muted) { voice.stopListening(); setAvatarState('idle'); }
  else if (isRunning) { voice.startListening(); setAvatarState('listening'); }
}
function toggleMicMute() { setMicMuted(!uiState.micMuted); }

// ── Brain wave canvas ──
let brainWaveData = new Float32Array(300);
let brainWaveOffset = 0;
let brainWaveCtx = null;

function startBrainWave() {
  const canvas = document.getElementById('brain-wave-canvas');
  if (!canvas) return;
  brainWaveCtx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
  canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
  renderBrainWave();
}

function renderBrainWave() {
  if (!brainWaveCtx) return;
  const ctx = brainWaveCtx;
  const w = ctx.canvas.width, h = ctx.canvas.height, len = brainWaveData.length;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,77,154,0.8)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < len; i++) {
    const x = (i / len) * w;
    const y = (h / 2) + brainWaveData[(brainWaveOffset + i) % len] * (h / 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (brain) {
    const state = brain.getState();
    const arousal = state?.amygdala?.arousal || 0.5;
    const noise = Math.sin(Date.now() * 0.008 * (1 + arousal)) * 0.2 + Math.sin(Date.now() * 0.023) * 0.1 + (Math.random() - 0.5) * 0.08;
    brainWaveData[brainWaveOffset % len] = Math.max(-1, Math.min(1, noise));
    brainWaveOffset++;
  }
  requestAnimationFrame(renderBrainWave);
}

function updateBrainIndicator(state) {
  if (!state) return;
  const $ = id => document.getElementById(id);

  // Merge: prefer incoming state, fill gaps from server landing state
  const s = state;
  const l = _landingState || {};

  const coherence = s.oscillations?.coherence ?? s.coherence ?? l.oscillations?.coherence ?? l.coherence ?? 0;
  const arousal = s.amygdala?.arousal ?? s.arousal ?? l.amygdala?.arousal ?? l.arousal ?? 0;
  const valence = s.amygdala?.valence ?? s.valence ?? l.amygdala?.valence ?? l.valence ?? 0;
  const psi = s.psi ?? l.psi ?? 0;
  const bandPower = s.oscillations?.bandPower || s.bandPower || l.oscillations?.bandPower || l.bandPower || {};

  const psiEl = $('hud-psi'); if (psiEl) psiEl.textContent = psi.toFixed(3);
  const arousalBar = $('hud-arousal-bar'); if (arousalBar) arousalBar.style.width = `${(arousal * 100).toFixed(0)}%`;
  const arousalVal = $('hud-arousal'); if (arousalVal) arousalVal.textContent = `${(arousal * 100).toFixed(0)}%`;
  const valenceBar = $('hud-valence-bar'); if (valenceBar) valenceBar.style.width = `${((valence + 1) / 2 * 100).toFixed(0)}%`;
  const valenceVal = $('hud-valence'); if (valenceVal) valenceVal.textContent = valence.toFixed(2);
  const cohBar = $('hud-coherence-bar'); if (cohBar) cohBar.style.width = `${(coherence * 100).toFixed(0)}%`;
  const cohVal = $('hud-coherence'); if (cohVal) cohVal.textContent = `${(coherence * 100).toFixed(0)}%`;
  const totalNeurons = s.totalNeurons ?? l.totalNeurons ?? 1000;
  const spikesEl = $('hud-spikes'); if (spikesEl) spikesEl.textContent = (s.spikeCount ?? s.totalSpikes ?? l.spikeCount ?? l.totalSpikes ?? 0).toLocaleString();
  const totalEl = $('hud-total-neurons'); if (totalEl) totalEl.textContent = '/' + totalNeurons.toLocaleString();
  const rewardEl = $('hud-reward'); if (rewardEl) rewardEl.textContent = (s.reward ?? l.reward ?? 0).toFixed(2);
  const timeEl = $('hud-time'); if (timeEl) timeEl.textContent = `${(s.time ?? l.time ?? 0).toFixed(1)}s`;
  const gammaEl = $('hud-gamma'); if (gammaEl) gammaEl.textContent = (bandPower.gamma ?? 0).toFixed(1);
  const betaEl = $('hud-beta'); if (betaEl) betaEl.textContent = (bandPower.beta ?? 0).toFixed(1);
  const alphaEl = $('hud-alpha'); if (alphaEl) alphaEl.textContent = (bandPower.alpha ?? 0).toFixed(1);
  const thetaEl = $('hud-theta'); if (thetaEl) thetaEl.textContent = (bandPower.theta ?? 0).toFixed(1);
  const drugEl = $('hud-drug'); if (drugEl) drugEl.textContent = s.drugState || l.drugState || 'sober';
  const actionEl = $('hud-action'); if (actionEl) actionEl.textContent = s.motor?.selectedAction || l.motor?.selectedAction || 'idle';
  // R15 — HUD model label used to show bestBackend.model (the deleted
  // text-AI dropdown selection). Post-R4 Unity speaks from her own
  // language cortex so there is no "model" to display. Just show BRAIN.
  const modelEl = $('hud-model'); if (modelEl) modelEl.textContent = 'BRAIN';

  // Shared state. connectedUsers only exists when there's a brain
  // server broadcasting shared-mood state; on the deployed static
  // GitHub Pages build there's no server, so this field is always
  // undefined. Defaulting to 0 was misleading — if you're reading
  // the HUD you are by definition at least one user talking to her.
  // Default to 1 when no server value is available; server-connected
  // sessions still use the server count.
  const users = s.connectedUsers ?? l.connectedUsers ?? 1;
  const usersEl = $('hud-users'); if (usersEl) usersEl.textContent = users;
  const gateVal = s.sharedMood?.gate ?? l.sharedMood?.gate ?? (0.7 + arousal * 0.6);
  const gateEl = $('hud-gate'); if (gateEl) gateEl.textContent = gateVal.toFixed(2) + 'x';
  const isDreaming = s.isDreaming || s.sharedMood?.isDreaming || l.isDreaming || l.sharedMood?.isDreaming || false;
  const dreamEl = $('hud-dream'); if (dreamEl) dreamEl.textContent = isDreaming ? 'dreaming' : 'awake';

  function setModDot(id, value, threshold = 0.3) {
    const dot = $(id); if (!dot) return;
    dot.classList.remove('active', 'high');
    if (value > threshold * 2) dot.classList.add('high');
    else if (value > threshold) dot.classList.add('active');
  }
  setModDot('mod-cortex', Math.abs(state.cortex?.error?.[0] ?? state.cortex?.error ?? 0));
  setModDot('mod-hippo', state.hippocampus?.isStable ? 0.8 : 0.2);
  setModDot('mod-amyg', arousal);
  setModDot('mod-bg', state.motor?.confidence ?? 0);
  setModDot('mod-cblm', Math.abs(state.cerebellum?.error?.[0] ?? 0));
  setModDot('mod-hypo', state.hypothalamus?.needsAttention?.length > 0 ? 0.8 : 0.2);
  setModDot('mod-myst', psi > 1 ? 0.8 : psi > 0.3 ? 0.4 : 0.1);
}

// ── Eye iris renderer ──
function startEyeIris(canvas, visualCortex) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let frameCount = 0;
  let focusX = 0.5, focusY = 0.5;

  function render() {
    frameCount++;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.floor(rect.width * dpr), ch = Math.floor(rect.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Get gaze from visual cortex (salience-driven, not AI-driven)
    const gaze = visualCortex?.getState() || {};
    focusX += ((gaze.gazeX ?? 0.5) - focusX) * 0.06;
    focusY += ((gaze.gazeY ?? 0.5) - focusY) * 0.06;
    focusX += (Math.random() - 0.5) * 0.008;
    focusY += (Math.random() - 0.5) * 0.008;

    const px = focusX * w, py = focusY * h;
    const scale = Math.min(w, h) / 120;
    const pulse = Math.sin(frameCount * 0.03) * 0.15 + 0.85;

    ctx.strokeStyle = `rgba(255,77,154,${0.5 * pulse})`; ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.arc(px, py, 20 * scale * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(168,85,247,${0.6 * pulse})`; ctx.lineWidth = 1.5 * scale;
    ctx.beginPath(); ctx.arc(px, py, 12 * scale * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,77,154,${0.8 * pulse})`;
    ctx.beginPath(); ctx.arc(px, py, 4 * scale, 0, Math.PI * 2); ctx.fill();

    requestAnimationFrame(render);
  }
  render();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════
// DRAGGABLE PANEL SYSTEM — persistent positions across sessions
// ═══════════════════════════════════════════════════════════════

const PANEL_POS_KEY = 'unity_panel_positions';

function makeDraggable(el, id) {
  if (!el) return;
  el.classList.add('draggable-panel');
  el.style.position = el.style.position || 'fixed';

  // Add drag handle (grip icon in top-right corner)
  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.innerHTML = '⠿';
  handle.title = 'Drag to move';
  el.style.position = 'fixed';
  el.appendChild(handle);

  // Load saved position
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_POS_KEY) || '{}');
    if (saved[id]) {
      el.style.top = saved[id].top;
      el.style.left = saved[id].left;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }
  } catch {}

  // Drag logic — only from the handle
  let dragging = false, startX, startY, startLeft, startTop;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    const rect = el.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    handle.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = (startLeft + dx) + 'px';
    el.style.top = (startTop + dy) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = 'grab';
    // Save position
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_POS_KEY) || '{}');
      saved[id] = { top: el.style.top, left: el.style.left };
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify(saved));
    } catch {}
  });

  // Touch support
  handle.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    const touch = e.touches[0];
    const rect = el.getBoundingClientRect();
    startX = touch.clientX;
    startY = touch.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    dragging = true;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const touch = e.touches[0];
    el.style.left = (startLeft + touch.clientX - startX) + 'px';
    el.style.top = (startTop + touch.clientY - startY) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_POS_KEY) || '{}');
      saved[id] = { top: el.style.top, left: el.style.left };
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify(saved));
    } catch {}
  });
}

// Make all panels draggable after DOM is ready
function initDraggablePanels() {
  makeDraggable(document.getElementById('hud-metrics'), 'hud-metrics');
  makeDraggable(document.getElementById('hud-modules'), 'hud-modules');
  makeDraggable(document.getElementById('unity-eye'), 'unity-eye');
  makeDraggable(document.getElementById('landing-viz-panel'), 'landing-viz-panel');
}

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════

init();
// Init draggable panels after a tick so DOM is ready
setTimeout(initDraggablePanels, 100);

window.addEventListener('beforeunload', () => {
  if (voice) voice.destroy();
  if (brain) brain.stop();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (voice) { voice.stopSpeaking(); voice.stopListening(); } }
  else if (isRunning && voice && !uiState.micMuted) voice.startListening();
});
