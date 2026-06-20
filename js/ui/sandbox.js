/**
 * sandbox.js — Dynamic UI injection system
 *
 * Unity's page starts nearly empty. When she decides to build UI
 * (text inputs, code editors, visualizers, toggles, etc.) she
 * generates an HTML/CSS/JS spec and this module injects it live.
 *
 * Every component is isolated: scoped CSS, wrapped in its own div,
 * JS evaluated inside a try/catch so one bad component can't nuke
 * the rest.
 */

// U297 — Sandbox soft cap. When this many components are active,
// injecting a new one auto-evicts the oldest. Prevents Unity from
// leaving hundreds of stale components running in the background
// (setInterval leaks, event listener accumulation, DOM bloat).
const MAX_ACTIVE_COMPONENTS = 10;

export class Sandbox {
  /** @param {string} containerId — DOM id of the sandbox container */
  constructor(containerId) {
    this._container = document.getElementById(containerId);
    if (!this._container) {
      throw new Error(`[Sandbox] Container element "#${containerId}" not found in DOM`);
    }

    /** Map<string, { wrapper, styleEl, timerIds, windowListeners, createdAt }> */
    this._components = new Map();

    /** Global style elements added via injectCSS */
    this._globalStyles = [];

    /** Captured errors from injected JS */
    this._errors = [];

    /** Saved component specs for persistence across visits */
    this._specs = new Map();

    /** Unity API object — wired up externally via setUnityAPI */
    this._unityAPI = {
      sandbox: this,
      speak: () => console.warn('[Sandbox] unity.speak not wired yet'),
      listen: () => console.warn('[Sandbox] unity.listen not wired yet'),
      chat: () => console.warn('[Sandbox] unity.chat not wired yet'),
      generateImage: () => console.warn('[Sandbox] unity.generateImage not wired yet'),
      getState: () => console.warn('[Sandbox] unity.getState not wired yet'),
      storage: () => console.warn('[Sandbox] unity.storage not wired yet'),
      on: () => console.warn('[Sandbox] unity.on not wired yet'),
    };
  }

  // ── Core injection ──────────────────────────────────────────

  /**
   * Inject a dynamic component into the sandbox.
   *
   * @param {object} spec
   * @param {string} [spec.html]     — HTML markup
   * @param {string} [spec.css]      — CSS rules (auto-scoped to component)
   * @param {string} [spec.js]       — JavaScript to evaluate in sandbox context
   * @param {string}  spec.id        — Unique component identifier
   * @param {string} [spec.position] — 'append' (default) | 'prepend' | 'replace'
   * @param {boolean} [spec.shadow]  — TRUE isolation via Shadow DOM (default
   *   false). When true, the component's CSS + HTML live inside an attached
   *   shadow root, so styles cannot leak in or out and the page's CSS cannot
   *   bleed in — real isolation, not the naive selector-prefix scoping. The
   *   injected JS receives the shadow root as `el` (so `el.querySelector`
   *   reaches the component's own tree). Used for Unity's synth-built
   *   components (self-contained, carry full CSS). Page-integrated views that
   *   intentionally reuse the app's global stylesheet (e.g. the /think
   *   diagnostic) leave it false and keep the light-DOM scoped-CSS path.
   * @returns {HTMLElement} The component wrapper div (the shadow HOST when shadow:true)
   */
  inject(spec) {
    const { html = '', css = '', js = '', id, position = 'append', shadow = false } = spec;

    if (!id) {
      throw new Error('[Sandbox] inject() requires a spec.id');
    }

    // U297 — ALWAYS replace on duplicate id. Previous behavior
    // warned and bailed; that was a footgun because rebuilds of the
    // same component (Unity iterating) left the old copy running.
    if (this._components.has(id)) {
      this.remove(id);
    }

    // U297 — Soft cap eviction. When the sandbox is at or above the
    // cap, remove the oldest component before adding a new one. This
    // prevents Unity from leaking resources across many builds.
    if (this._components.size >= MAX_ACTIVE_COMPONENTS) {
      // Find the component with the smallest createdAt timestamp
      let oldestId = null;
      let oldestTime = Infinity;
      for (const [cid, entry] of this._components) {
        if ((entry.createdAt || 0) < oldestTime) {
          oldestTime = entry.createdAt || 0;
          oldestId = cid;
        }
      }
      if (oldestId) {
        console.warn(`[Sandbox] Soft cap ${MAX_ACTIVE_COMPONENTS} reached — evicting oldest: ${oldestId}`);
        this.remove(oldestId);
      }
    }

    // -- Wrapper div --
    const wrapper = document.createElement('div');
    wrapper.id = `sandbox-${id}`;
    wrapper.classList.add('sandbox-component');
    wrapper.dataset.componentId = id;

    // -- CSS + HTML --
    // TRUE-isolation path (shadow:true): CSS + HTML live inside an attached
    // shadow root. No selector prefixing, no leak in either direction — the
    // browser enforces the boundary. The component's own `el.querySelector`
    // (el = the shadow root) reaches its tree; the page's CSS never touches
    // it and its `!important` / bare class selectors never touch the page.
    // styleEl stays null (the style lives in the shadow root, removed with
    // the host). Light-DOM path (shadow:false, default): unchanged — naive
    // selector-prefix scoping in document.head, for page-integrated views.
    let styleEl = null;
    let evalRoot = wrapper;
    if (shadow) {
      const root = wrapper.attachShadow({ mode: 'open' });
      let inner = '';
      if (css) inner += `<style>${css}</style>`;
      if (html) inner += html;
      root.innerHTML = inner;
      evalRoot = root;
    } else {
      if (css) styleEl = this._injectScopedCSS(css, id);
      if (html) wrapper.innerHTML = html;
    }

    // -- Insert into container --
    if (position === 'prepend' && this._container.firstChild) {
      this._container.insertBefore(wrapper, this._container.firstChild);
    } else {
      this._container.appendChild(wrapper);
    }

    // -- Track with lifecycle metadata --
    // timerIds — auto-cleared on remove. windowListeners — auto-
    // removed on remove. createdAt — used for LRU eviction.
    this._components.set(id, {
      wrapper,
      styleEl,
      shadow,
      timerIds: new Set(),
      windowListeners: [],
      createdAt: Date.now(),
    });
    this._specs.set(id, { html, css, js, id, position, shadow });

    // -- JS (evaluated with sandbox context + lifecycle hooks) --
    // evalRoot is the shadow root when isolated, else the light-DOM wrapper.
    // Either way the template's `el.querySelector(...)` reaches its own tree.
    if (js) {
      this._evaluateJS(js, evalRoot, id);
    }

    // -- Auto-persist to localStorage --
    this.saveState();

    return wrapper;
  }

  // ── Component management ────────────────────────────────────

  /** Remove a component by id */
  remove(id) {
    const entry = this._components.get(id);
    if (!entry) return false;

    // U297 — Clear all tracked timers for this component so
    // setInterval / setTimeout callbacks don't keep firing after
    // the component is gone.
    if (entry.timerIds) {
      for (const timerId of entry.timerIds) {
        clearInterval(timerId);
        clearTimeout(timerId);
      }
    }

    // U297 — Remove all window/document listeners this component
    // registered so they stop firing after unmount.
    if (entry.windowListeners) {
      for (const { target, event, handler, options } of entry.windowListeners) {
        try {
          target.removeEventListener(event, handler, options);
        } catch (err) {
          console.warn(`[Sandbox] Failed to remove listener for ${id}:`, err.message);
        }
      }
    }

    entry.wrapper.remove();
    if (entry.styleEl) entry.styleEl.remove();
    this._components.delete(id);
    this._specs.delete(id);
    this.saveState();
    return true;
  }

  /** Remove all components from the sandbox */
  clear() {
    for (const [id] of this._components) {
      this.remove(id);
    }
    // Also nuke any global styles
    this._globalStyles.forEach((el) => el.remove());
    this._globalStyles = [];
  }

  /** Check if a component exists */
  has(id) {
    return this._components.has(id);
  }

  /** Get a component's wrapper element */
  getComponent(id) {
    const entry = this._components.get(id);
    return entry ? entry.wrapper : null;
  }

  /** List all component ids currently in the sandbox */
  listComponents() {
    return Array.from(this._components.keys());
  }

  // ── Global injection helpers ────────────────────────────────

  /** Inject global (non-scoped) CSS into the page */
  injectCSS(css) {
    const style = document.createElement('style');
    style.textContent = css;
    style.dataset.sandboxGlobal = 'true';
    document.head.appendChild(style);
    this._globalStyles.push(style);
    return style;
  }

  /** Run arbitrary JS with sandbox context (no specific component) */
  injectScript(js) {
    this._evaluateJS(js, this._container, '__global__');
  }

  /** querySelector scoped to the sandbox container */
  getElement(selector) {
    return this._container.querySelector(selector);
  }

  // ── Unity API ───────────────────────────────────────────────

  /**
   * Wire up the unity API object that injected scripts receive.
   * Called by app.js once the real callbacks are ready.
   *
   * @param {object} apiObject — partial or full override
   */
  setUnityAPI(apiObject) {
    this._unityAPI = {
      ...this._unityAPI,
      sandbox: this, // always keep sandbox ref
      ...apiObject,
    };
  }

  // ── Error tracking ─────────────────────────────────────────

  /** Get captured errors from injected JS */
  getErrors() {
    return [...this._errors];
  }

  // ── Internal helpers ────────────────────────────────────────

  /**
   * Prefix every CSS rule with the component's scoped selector
   * so styles don't leak across components.
   */
  _injectScopedCSS(css, id) {
    const scopePrefix = `#sandbox-${id}`;
    const scoped = this._scopeCSS(css, scopePrefix);

    const style = document.createElement('style');
    style.dataset.componentId = id;
    style.textContent = scoped;
    document.head.appendChild(style);
    return style;
  }

  /**
   * Naively scope CSS by prepending a selector to each rule.
   * Handles basic cases: selectors, @keyframes pass-through,
   * @media wrapping.
   */
  _scopeCSS(css, prefix) {
    // Strip comments
    let cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');

    const result = [];
    // Split on } that isn't inside a nested block
    // Simple approach: process line-by-line for top-level rules
    const blocks = this._parseTopLevelBlocks(cleaned);

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      // Pass through @keyframes / @font-face as-is
      if (/^@(keyframes|font-face)\b/.test(trimmed)) {
        result.push(trimmed);
        continue;
      }

      // @media — scope the inner rules
      if (/^@media\b/.test(trimmed)) {
        const innerStart = trimmed.indexOf('{');
        const mediaQuery = trimmed.slice(0, innerStart + 1);
        const innerEnd = trimmed.lastIndexOf('}');
        const innerCSS = trimmed.slice(innerStart + 1, innerEnd);
        const scopedInner = this._scopeCSS(innerCSS, prefix);
        result.push(`${mediaQuery}\n${scopedInner}\n}`);
        continue;
      }

      // Regular rule — prepend prefix to selector
      const braceIdx = trimmed.indexOf('{');
      if (braceIdx === -1) continue;

      const selector = trimmed.slice(0, braceIdx).trim();
      const body = trimmed.slice(braceIdx);

      // Handle comma-separated selectors
      const scopedSelectors = selector
        .split(',')
        .map((s) => {
          s = s.trim();
          if (!s) return '';
          // :root or html or body — just replace with prefix
          if (s === ':root' || s === 'html' || s === 'body') {
            return prefix;
          }
          return `${prefix} ${s}`;
        })
        .filter(Boolean)
        .join(', ');

      result.push(`${scopedSelectors} ${body}`);
    }

    return result.join('\n');
  }

  /**
   * Parse top-level CSS blocks, respecting nested braces.
   * Returns an array of complete rule strings.
   */
  _parseTopLevelBlocks(css) {
    const blocks = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < css.length; i++) {
      const ch = css[i];
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          current += ch;
          blocks.push(current.trim());
          current = '';
          continue;
        }
      }
      current += ch;
    }

    // Leftover (shouldn't happen with valid CSS)
    if (current.trim()) blocks.push(current.trim());

    return blocks;
  }

  // ── Persistence ─────────────────────────────────────────────

  /**
   * Save all current component specs to localStorage.
   * Call this after inject() or remove() to persist the sandbox state.
   */
  saveState() {
    try {
      const specs = [];
      for (const [id, spec] of this._specs) {
        specs.push(spec);
      }
      localStorage.setItem('unity_brain_sandbox', JSON.stringify(specs));
    } catch (err) {
      console.warn('[Sandbox] Failed to save state:', err.message);
    }
  }

  /**
   * Restore previously saved component specs from localStorage.
   * Re-injects all components that existed on the last visit.
   */
  restoreState() {
    try {
      const raw = localStorage.getItem('unity_brain_sandbox');
      if (!raw) return 0;
      const specs = JSON.parse(raw);
      let restored = 0;
      for (const spec of specs) {
        if (spec && spec.id && !this._components.has(spec.id)) {
          this.inject(spec);
          restored++;
        }
      }
      return restored;
    } catch (err) {
      console.warn('[Sandbox] Failed to restore state:', err.message);
      return 0;
    }
  }

  /**
   * Clear saved state from localStorage.
   */
  clearSavedState() {
    try {
      localStorage.removeItem('unity_brain_sandbox');
    } catch {
      // silent
    }
  }

  /**
   * Evaluate JS in a sandboxed context with lifecycle tracking.
   *
   * The script receives:
   *   - el        : the component wrapper element
   *   - sandbox   : this sandbox controller
   *   - unity     : the unity api object
   *   - setInterval / setTimeout : wrapped versions that track ids
   *   - addListener : helper to register window/document listeners
   *                   that auto-cleanup on component removal
   *
   * Wrapped timers and listeners are registered in the component's
   * tracking record so remove(id) can clean them up (U297).
   *
   * U298 — If the script throws, the error is captured, logged, and
   * the component is auto-removed to prevent half-initialized state
   * from polluting the sandbox.
   */
  _evaluateJS(js, wrapperEl, componentId) {
    const entry = this._components.get(componentId);
    if (!entry) return;

    // Wrapped setInterval that tracks the id for cleanup
    const trackedSetInterval = (callback, delay, ...args) => {
      const id = setInterval(callback, delay, ...args);
      entry.timerIds.add(id);
      return id;
    };
    // Wrapped setTimeout that tracks the id for cleanup
    const trackedSetTimeout = (callback, delay, ...args) => {
      const id = setTimeout(callback, delay, ...args);
      entry.timerIds.add(id);
      return id;
    };
    // Helper to register window/document listeners that auto-cleanup
    const addListener = (target, event, handler, options) => {
      target.addEventListener(event, handler, options);
      entry.windowListeners.push({ target, event, handler, options });
    };

    try {
      const fn = new Function(
        'el', 'sandbox', 'unity', 'setInterval', 'setTimeout', 'addListener',
        js
      );
      fn(wrapperEl, this, this._unityAPI, trackedSetInterval, trackedSetTimeout, addListener);
    } catch (err) {
      const error = {
        componentId,
        message: err.message,
        stack: err.stack,
        timestamp: Date.now(),
      };
      this._errors.push(error);
      console.error(`[Sandbox] JS error in component "${componentId}":`, err);
      // U298 — auto-remove the broken component so half-initialized
      // state doesn't pollute the sandbox. Keeps it clean for retries.
      // Don't call this.remove() from inside eval because we're still
      // inside inject() — schedule it for the next tick instead.
      setTimeout(() => {
        if (this._components.has(componentId)) {
          console.warn(`[Sandbox] Auto-removing broken component "${componentId}" after JS error`);
          this.remove(componentId);
        }
      }, 0);
    }
  }
}
