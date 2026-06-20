// WebGPU pre-flight helpers — adapter probe + browser detection.
//
// Consumed by:
//   - html/webgpu-prep.html (standalone onboarding page)
//   - index.html boot modal (wired in the subsequent task)
//   - html/dashboard.html boot modal (wired in the subsequent task)
//
// Defensive try/catch around requestAdapter() is allowed because some
// browsers throw on the call itself (driver mismatch, GPU not present)
// rather than returning null cleanly. The one-shot console.error pattern
// surfaces the FIRST failure with full stack so debugging is possible;
// subsequent failures are suppressed so the console isn't spammed when
// the user re-checks repeatedly. Silent try/catch can hide
// ReferenceErrors and missing imports; the
// `if (!_warned) { console.error(err) }` pattern keeps both invariants
// (catch the error so the helper still returns a structured result +
// log it once so the operator can diagnose).

let _adapterCheckWarned = false;

/**
 * Probe the browser for a usable WebGPU adapter.
 *
 * Returns a structured result:
 *   { available: true,  adapter: GPUAdapter, reason: 'adapter acquired' }
 *   { available: false, adapter: null,        reason: '<diagnostic string>' }
 *
 * Reasons surfaced for the false case:
 *   - 'navigator.gpu undefined — WebGPU not exposed by this browser'
 *   - 'requestAdapter returned null — WebGPU flag may be off, drivers may be too old, or GPU is unsupported'
 *   - 'requestAdapter threw: <err.message>'
 *
 * The throw branch logs full err.stack to console.error on the FIRST
 * invocation only (one-shot warn), to honor the no-silent-catch
 * directive from the I.19 root-cause fix while not spamming the console
 * when the user clicks Re-check repeatedly.
 */
export async function checkWebGPUAdapter() {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return {
      available: false,
      adapter: null,
      reason: 'navigator.gpu undefined — WebGPU not exposed by this browser',
    };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return {
        available: false,
        adapter: null,
        reason: 'requestAdapter returned null — WebGPU flag may be off, drivers may be too old, or GPU is unsupported',
      };
    }
    return { available: true, adapter, reason: 'adapter acquired' };
  } catch (err) {
    if (!_adapterCheckWarned) {
      _adapterCheckWarned = true;
      // eslint-disable-next-line no-console
      console.error('[WebGPU] requestAdapter failed (logged once per page):', err);
    }
    return {
      available: false,
      adapter: null,
      reason: `requestAdapter threw: ${err && err.message ? err.message : 'unknown error'}`,
    };
  }
}

/**
 * Identify the host browser. Returns one of:
 *   'chrome' | 'edge' | 'firefox' | 'safari' | 'opera' | 'brave' | 'unknown'
 *
 * Detection precedence:
 *   1. navigator.userAgentData.brands (modern Chromium-based browsers)
 *   2. navigator.userAgent regex (Firefox/Safari + fallback for older Chromium)
 *
 * The brand check goes Edge → Opera → Brave → Chrome because Edge,
 * Opera, and Brave all advertise "Chromium" too — we want the most
 * specific match first.
 */
export function detectBrowser() {
  const uaData = (typeof navigator !== 'undefined' && navigator.userAgentData) ? navigator.userAgentData : null;
  if (uaData && Array.isArray(uaData.brands)) {
    const brands = uaData.brands.map((b) => (b && b.brand) ? b.brand : '');
    if (brands.some((b) => /Microsoft Edge/i.test(b))) return 'edge';
    if (brands.some((b) => /Opera/i.test(b))) return 'opera';
    if (brands.some((b) => /Brave/i.test(b))) return 'brave';
    if (brands.some((b) => /Google Chrome/i.test(b))) return 'chrome';
    if (brands.some((b) => /Chromium/i.test(b))) return 'chrome';
  }
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/OPR\//i.test(ua) || /Opera\//i.test(ua)) return 'opera';
  if (/Brave/i.test(ua)) return 'brave';
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'chrome';
  // Safari MUST come after Chrome — Chrome on macOS reports "Safari" in UA too.
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'safari';
  return 'unknown';
}

/**
 * Human-readable name for a browser id.
 */
export function browserDisplayName(id) {
  const map = {
    chrome: 'Google Chrome',
    edge: 'Microsoft Edge',
    firefox: 'Mozilla Firefox',
    safari: 'Apple Safari',
    opera: 'Opera',
    brave: 'Brave',
    unknown: 'an unidentified browser',
  };
  return map[id] || map.unknown;
}

/**
 * Mount a non-dismissible boot-time modal that hard-blocks the page
 * when WebGPU is unavailable. Should be called as early as possible
 * from a page's <script type="module"> block so the modal renders
 * before the rest of the app paints.
 *
 * Per feedback_no_fallbacks_law.md ("fallbacks violate the rule we
 * code it right the first time"), this modal does NOT offer a CPU-only
 * bypass. WebGPU is REQUIRED. The user either fixes their browser
 * (via the prep page) or they do not use Unity. There is one correct
 * compute path — degraded capability paths are banned.
 *
 * Behavior:
 *   - If WebGPU is available, returns 'available' without mounting.
 *   - Otherwise, mounts an overlay with two actions: navigate to the
 *     prep page OR re-check the adapter (retry after the user toggles
 *     their browser flag). No bypass.
 *
 * Options:
 *   - prepUrl (string, default 'webgpu-prep.html'): URL of the prep
 *     page. Pages in subdirectories must override (e.g. dashboard.html
 *     passes 'webgpu-prep.html' since both live in /html/; root
 *     index.html passes 'html/webgpu-prep.html').
 *   - bannerColor (string, default '#ef4444'): outline color of the
 *     modal. Callers can match their page accent if needed.
 */
export async function mountBootModal({ prepUrl = 'webgpu-prep.html', bannerColor = '#ef4444' } = {}) {
  if (typeof document === 'undefined') return 'no-document';

  const result = await checkWebGPUAdapter();
  if (result.available) return 'available';

  // Build overlay. Inline styles so this works on any host page without
  // CSS dependency. Z-index 99999 so it floats above 3D canvases.
  const overlay = document.createElement('div');
  overlay.id = 'unity-webgpu-boot-modal';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'unity-webgpu-boot-modal-title');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.92)',
    'z-index:99999', 'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:"JetBrains Mono","Fira Code",Consolas,monospace',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'background:#0f1a1f', `border:2px solid ${bannerColor}`,
    'border-radius:10px', 'padding:24px 26px', 'max-width:560px',
    'width:92vw', 'color:#e5e7eb', 'line-height:1.55',
    'box-shadow:0 0 32px rgba(239,68,68,0.25)',
  ].join(';');

  const browserName = browserDisplayName(detectBrowser());
  const reasonText = (result && result.reason) ? result.reason : 'unknown reason';

  card.innerHTML = `
    <h3 id="unity-webgpu-boot-modal-title" style="color:${bannerColor};margin:0 0 10px;font-size:18px;font-weight:700;">⚠ WebGPU Required — No Bypass</h3>
    <p style="margin:6px 0;font-size:13px;color:#e5e7eb;">Unity's 357M-neuron brain needs WebGPU to run its GPU-resident Hebbian learning kernels. <strong>${browserName}</strong> doesn't have a working WebGPU adapter yet.</p>
    <p style="font-size:11px;color:#9ca3af;font-style:italic;margin:6px 0 16px;padding:8px 10px;background:#1f2937;border-radius:4px;">${escapeHtml(reasonText)}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      <a id="unity-webgpu-boot-modal-prep" href="${escapeAttr(prepUrl)}" style="background:#22c55e;color:#000;padding:10px 16px;text-decoration:none;border-radius:6px;font-size:12px;font-weight:700;display:inline-block;">📖 Go to WebGPU Setup</a>
      <button id="unity-webgpu-boot-modal-recheck" style="background:#374151;color:#e5e7eb;border:none;padding:10px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">🔄 Re-check</button>
    </div>
    <p style="margin:14px 0 0;font-size:10px;color:#6b7280;">No CPU fallback — Unity's architecture is one correct path, not a degraded-capability menu. Enable WebGPU to continue.</p>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const recheckBtn = card.querySelector('#unity-webgpu-boot-modal-recheck');

  if (recheckBtn) {
    recheckBtn.addEventListener('click', async () => {
      recheckBtn.disabled = true;
      recheckBtn.textContent = '🔄 Checking…';
      const r2 = await checkWebGPUAdapter();
      if (r2.available) {
        overlay.remove();
      } else {
        recheckBtn.disabled = false;
        recheckBtn.textContent = '🔄 Re-check';
        const reasonEl = card.querySelector('p[style*="font-style:italic"]');
        if (reasonEl) reasonEl.textContent = r2.reason || 'unknown reason';
      }
    });
  }
  return 'blocked';
}

// Small HTML-escape helpers used only by mountBootModal's innerHTML so
// the reason string from a GPUAdapter error message can't smuggle markup
// into the modal. Standard text-node assignment would be safer but we'd
// have to build the modal subtree manually; this keeps the template
// readable while still neutralizing < > & " '.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) {
  return escapeHtml(s);
}
