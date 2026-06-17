# HTML-ENTRY-POINTS — every page, its contract, its failure modes

> **Status:** drafted 2026-06-17 per audit H.5 + H.8 — operator's live-test reported "only two opened and they both said no connection." This doc inventories every HTML, how it's launched, what it needs from the server, what's GH-Pages-safe vs require-Node, and the per-HTML failure-mode signature.

## Inventory — 6 HTMLs total

| File | Purpose | Launched by | Requires brain-server? | GH-Pages-safe? |
|------|---------|-------------|------------------------|----------------|
| `index.html` | Landing / 3D brain UI / chat | `start.bat` auto-opens at `http://localhost:7525` | YES for chat/training, NO for static landing | YES (static-fallback) |
| `html/dashboard.html` | Read-only live brain dashboard | `start.bat` auto-opens at `http://localhost:7525/dashboard.html` | YES — fully blank without WS | NO |
| `html/compute.html` | GPU compute worker (WebGPU sparse-matrix forward) | brain-server `_spawnGpuClient()` auto-launches in isolated Chrome | YES — depends on WS handshake + module imports | NO (requires server HTTP route) |
| `html/brain-equations.html` | Public-facing math reference for equational cognition | Manual (link from index.html) | NO (static) | YES |
| `html/unity-guide.html` | Persona + capabilities tour | Manual (link from index.html) | NO (static) | YES |
| `html/gpu-configure.html` | Admin GPU tier-config UI | `windows/GPUCONFIGURE.bat` | YES (config-write endpoint) | NO |

## Per-HTML contracts + failure modes

### `index.html` (root) — the brain UI

**Purpose:** Landing page + 3D brain visualization + chat UI + HUD metrics. Static auto-sizes neuron count from detected WebGPU adapter `maxStorageBufferBindingSize` BEFORE the WS connection lands. Once WS connects, server reports authoritative neuron count + curriculum state + emotion stream.

**Static-site mode (no brain-server running):**
- WebGPU adapter probe still fires → "biological-scale default" neuron count visualized in 3D brain
- Chat is DISABLED until WS connects
- HUD shows last-known state or `—` placeholders

**Failure modes:**
- `http://localhost:7525` returns connection-refused → page never loads (browser shows "site can't be reached")
- WS to `ws://localhost:7525` fails → "no connection" banner per audit H.9 (BIG red recovery banner + retry countdown)
- bundle build broken (`js/app.bundle.js` 404) → blank black page, console error
- GPU detection fails → 3D brain falls back to CPU-side rendering at ~6700 neurons

**Auto-size contract:**
- Static landing reads `navigator.gpu.requestAdapter().limits.maxStorageBufferBindingSize`
- Computes default-max neuron count → seeds initial 3D mesh
- When WS lands, server's `os.freemem() × heap_size_limit × 0.5` count REPLACES the static default
- Mismatch = client/server diverge on neuron count → audit H.7 parity-check script catches this

### `html/dashboard.html` — read-only live dashboard

**Purpose:** Shared read-only view of the brain — emotion chart, cluster firing, curriculum milestones, drug-pharmacokinetics, conversation activity, ALL the Phase 6 telemetry panels (audit A.1-A.3), GPU spawn-failure banner (audit H.6), no-connection recovery banner (audit H.9).

**Failure modes:**
- WS to `ws://localhost:7525` fails → banner per H.9 shows recovery steps
- `gpuClientSpawnFailed` WS event from brain-server `_spawnGpuClient` → banner per H.6 shows browser/exePath/errno
- Server crashed mid-stream → onclose handler fires → banner shows + 3s auto-retry countdown

**WS message types consumed:**
- `welcome` — initial state + emotion history
- `state` — periodic full state broadcast (~5-10Hz)
- `gpuClientSpawnFailed` — H.6 surfacing event (rare, fires on browser-launch failure)

### `html/compute.html` — GPU compute worker

**Purpose:** WebGPU forward-pass for sparse matrix Hebbian. The brain-server is the CPU shadow / decision-maker; compute.html is the GPU shadow that does the hot-path forward propagation.

**Contract: SERVER-SERVED ONLY.** Must be loaded via `http://localhost:7525/compute.html` (or `/html/compute.html`). Under `file://`:
- ES module import `/js/brain/gpu-compute.js` resolves to filesystem path that doesn't exist
- WebSocket connect to `ws://localhost:7525` will succeed only if brain-server is running, but typically `file://` opens happen when operator double-clicks the file (no server)
- Pre-audit H.2 fix: the import path was relative `./js/...` which broke under EVERY non-`/compute.html` URL. Post-fix uses absolute `/js/...` so any HTTP route works. PLUS file:// preflight script renders a recovery banner with start.bat instructions instead of a blank page.

**Failure modes:**
- File:// open → preflight banner explains the requirement (post-audit H.2)
- WS fails → `Connecting to brain server...` text, then `WebSocket error — retrying in 3s...`
- Chrome without `--enable-unsafe-webgpu` flag → WebGPU binding limited to 2GB ceiling (~178M neurons), brain capability reduced
- WebGPU device.lost mid-run → `[Chrome stderr] device lost` log line, page goes red, brain-server logs critical, dashboard banner surfaces

**Auto-launch chain (in `brain-server.js _spawnGpuClient`):**
1. Detect Chrome in standard install paths
2. Fall back to Edge if no Chrome
3. Fall back to default-browser `start "" "<url>"` if no Chrome/Edge
4. Spawn with `--enable-unsafe-webgpu --enable-dawn-features=allow_unsafe_apis,disable_robustness` + isolated `UnityBrain-WebGPU-Profile` user-data-dir
5. Per audit H.1: `[Server] _spawnGpuClient INVOKED` log line at entry + `FINISHED` log line at exit so post-test diagnostic is visible
6. Per audit H.6: spawn failures surface to dashboard via `gpuClientSpawnFailed` WS broadcast

### `html/brain-equations.html` — public equations reference

**Purpose:** Static math-reference page documenting the equational cognition system. Hebbian/Oja, cortical leak, K wiring, P6.1-P6.8 channels.

**No server required.** GH-Pages-safe. Can be loaded via `file://` directly. **No external dependencies, no module imports — pure HTML + inline CSS.**

**Status:** Per audit C.5 needs updating to document relationTagId 13-31 + P6.6 novelty metric + P5.3 quality formula + P3.4 back-injection decay equations.

### `html/unity-guide.html` — persona tour

**Purpose:** Public-facing tour of Unity's persona system + manifestation modes + Pre-K+K scope + capabilities. New-user onboarding doc.

**No server required.** GH-Pages-safe. Pure static.

**Status:** Per audit C.9 needs content audit — verify reflects current persona memory layer + manifestation-mode index + Pre-K+K ONLY scope + Phase 6 panels.

### `html/gpu-configure.html` — admin GPU tier-config UI

**Purpose:** Operator-only admin UI for GPU tier selection. Maps cluster-size tier choice to the auto-size formula (`os.freemem() × heap_size_limit × 0.5 ceiling`).

**Launched by:** `windows/GPUCONFIGURE.bat` only — never from start.bat auto-open. Operator runs this once after install to pin a GPU tier.

**Failure modes:**
- HTTP POST to config-write endpoint fails → admin UI shows error banner
- Selected tier exceeds detected GPU max → server-side rejects with 400

**Status:** Per audit C.10 needs verification that tier-selection still maps to current `_genCorticalAttribs` outputs + auto-size formula post-P4.2 mixin split.

---

## Static-site (GH Pages) parity (audit H.8)

GH Pages deployment is a SUBSET of the local-Node experience:
- ✅ `index.html` + `html/brain-equations.html` + `html/unity-guide.html` — static, fully functional
- ❌ `html/dashboard.html` — requires WS to local brain-server, useless on GH Pages
- ❌ `html/compute.html` — requires brain-server's HTTP routing + WS, useless on GH Pages
- ❌ `html/gpu-configure.html` — requires server config-write endpoint, useless on GH Pages

**Operator distinguishing "no server" from "server crashed":**
- "No server" state on GH Pages = static landing only, no WS attempts, no banner
- "Server crashed" state on localhost = WS attempts fire and fail → audit H.9 recovery banner shows

**Static landing should bake-in a "Connect to local brain-server at ws://localhost:7525" CTA** so GH Pages visitors who want the full experience know how to get it. This is a follow-on UX task post-audit-close.

**GH-Pages-safe inventory of `js/`:**
- ✅ `js/app.js`, `js/app.bundle.js`, `js/brain3d-*.js`, `js/embeddings.js`, `js/letter-input.js` — pure-static, no Node-only APIs
- ❌ `js/brain/curriculum*.js`, `js/brain/cluster*.js` — heavy Node-side modules, only loaded via brain-server context
- ✅ `js/brain/gpu-compute.js` — WebGPU client-side, but requires compute.html which requires server
- ✅ `js/version.js`, `js/env.example.js` — static

---

## Diagnostic protocol when a live test reports HTML breakage

1. **Capture the failing URL.** `file://` or `http://localhost:7525/...`?
2. **Check `server/server.log` for boot banners.** Look for `[Brain] HTTP listening on port 7525`, `[Cluster cortex] cortical wiring verified`, `[Cluster cortex] auto-size + mixin dispatch verified`. Missing any of these = boot incomplete.
3. **Check `[Server] _spawnGpuClient INVOKED at +Xms` log line.** If absent, the setTimeout never fired or brain-server crashed before reaching it. If INVOKED but no FINISHED, spawn crashed inside the platform-specific block.
4. **Check dashboard banner state.** If `gpu-spawn-banner` is active, H.6 surfacing fired — log line tells you which Chrome/Edge path / errno.
5. **Check WS connection state.** If `no-conn-banner` is active, brain-server isn't reachable on port 7525 — verify with `netstat -ano | findstr :7525`.
