# HTML-ENTRY-POINTS — every page, its contract, its failure modes

> **Status:** drafted 2026-06-17 per audit H.5 + H.8 — operator's live-test reported "only two opened and they both said no connection." This doc inventories every HTML, how it's launched, what it needs from the server, what's GH-Pages-safe vs require-Node, and the per-HTML failure-mode signature.

## Inventory — 9 HTMLs total

| File | Purpose | Launched by | Requires brain-server? | GH-Pages-safe? |
|------|---------|-------------|------------------------|----------------|
| `index.html` | Landing / 3D brain UI / chat | `start.bat` auto-opens at `http://localhost:7525` | YES for chat/training, NO for static landing | YES (static-fallback) |
| `html/dashboard.html` | Read-only live brain dashboard | `start.bat` auto-opens at `http://localhost:7525/dashboard.html` | YES — fully blank without WS | NO |
| `html/compute.html` | GPU compute worker (WebGPU sparse-matrix forward) | brain-server `_spawnGpuClient()` auto-launches in isolated Chrome | YES — depends on WS handshake + module imports | NO (requires server HTTP route) |
| `html/webgpu-prep.html` | Pre-flight WebGPU setup — browser-by-browser flag instructions | Linked from boot modal on `index.html` + `html/dashboard.html` when adapter unavailable; can be visited manually | NO (static, runs adapter check via `navigator.gpu`) | YES |
| `html/legend.html` | Page legend / quick-access index — every HTML + public-facing doc | Linked from floating `📑 Pages` button on every HTML's top-right corner | NO (static) | YES |
| `html/docs.html` | Markdown doc viewer (public docs only) with whitelist + inline renderer | Linked from `html/legend.html` Public Docs section + the `📑 Pages` button | NO (static, fetches `.md` files via `fetch()`) | YES |
| `html/brain-equations.html` | Public-facing math reference for equational cognition | Manual (link from index.html) | NO (static) | YES |
| `html/unity-guide.html` | Persona + capabilities tour | Manual (link from index.html) | NO (static) | YES |
| `html/gpu-configure.html` | Admin GPU tier-config UI | `windows/GPUCONFIGURE.bat` | YES (config-write endpoint) | NO |

**Admin/viewer split (per Gee 2026-06-18):** No login form, no admin token, no cookie. The brain-server inspects `req.socket.remoteAddress` on every new WebSocket; loopback addresses (`127.0.0.1` / `::1` / `::ffff:127.0.0.1` / `127.x.x.x`) receive `mode: 'admin'` ~500 ms after the connection lands, every non-loopback address receives `mode: 'viewer'`. The 500 ms delay lets the GPU compute worker self-identify via `gpu_register` and skip the modeAssigned send entirely — compute clients render no UI and need no badge. The loopback-based design means the operator's multiple tabs (compute + dashboard + landing + terminal `curl`) all share admin since they all come from the same loopback origin. Viewer-mode dashboards hide Stop / Grade-advance / Signoff / Auto-advance controls via the `.admin-only` CSS class that only resolves when `body.is-admin` is set. Brain-mutating HTTP endpoints (`/shutdown`, `/grade-advance`, `/grade-signoff`, `/auto-advance`) remain loopback-only via `requireLoopback` — there is no LAN admin path. See `server/brain-server.js` `wss.on('connection')` mode-assignment block.

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
- `modeAssigned` — admin/viewer role assigned by server ~500 ms after WS connect (loopback origin → admin, else viewer). Sets `window.state.viewerMode`, toggles `body.is-admin` class to reveal admin-only controls.
- `autoAdvanceChanged` — broadcast when any admin tab POSTs `/auto-advance`; every other open dashboard syncs the auto-advance checkbox UI without polling.
- `gpuClientSpawnFailed` — H.6 surfacing event (rare, fires on browser-launch failure)

**Admin-only controls (hidden in viewer mode):**
- `#btn-graceful-stop` — `⏹ Stop Brain` button in connection-status row.
- `#d-ms-advance` — `▶ START NEXT GRADE` panel + per-subject signoff buttons (appears only when curriculum pauses after a full grade pass).
- `#d-ms-auto-advance` — `Auto-advance to next grade after pass` checkbox in the milestone panel. Single toggle governing both `/grade-advance` signoff bypass AND curriculum runner's auto-fire behavior. State persists via `cortexCluster._autoAdvanceGrade` inside cortexState; F5 restoration fires `GET /auto-advance` on `modeAssigned: admin`.

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

### `html/webgpu-prep.html` — WebGPU pre-flight setup

**Purpose:** Pre-flight onboarding page that walks the user through enabling WebGPU in whatever browser they're using. Detects browser via `navigator.userAgentData` (Chromium) + UA-string fallback (Firefox/Safari), reveals the matching enable-flags block, runs `checkWebGPUAdapter()` on load + provides a `Re-check WebGPU` button.

**No server required.** GH-Pages-safe. Pure static + `js/webgpu-prep.js` ES module import.

**Hard-block contract (no fallback).** Per `feedback_no_fallbacks_law.md` the page does NOT offer a CPU-only bypass — Unity's compute architecture is one correct path. Users without WebGPU fix their browser via the flag instructions OR they do not connect. The page provides:
- Per-browser flag URLs (copy-button + clickable) for Chrome / Edge / Brave / Opera / Firefox / Safari
- GPU driver minimums (NVIDIA ≥ 532, AMD Adrenalin ≥ 23.x, Intel ≥ 31.0.101.4314, Apple M-series + macOS 14+)
- A `Re-check WebGPU` button that re-runs `navigator.gpu.requestAdapter()` after the user toggles the flag
- A `Continue to Dashboard` link that ONLY appears when the adapter check passes

**Boot modal wiring:** The same module (`js/webgpu-prep.js` `mountBootModal()`) is imported by `index.html` + `html/dashboard.html` to render a non-dismissible HARD-BLOCK modal whenever the adapter check fails. The modal links to this prep page; no CPU bypass button.

**Failure modes:**
- `navigator.gpu === undefined` (browser doesn't expose WebGPU) → status banner red + browser-specific instruction block revealed
- `requestAdapter()` returns null (flag off, drivers too old, GPU unsupported) → same red banner + reason string
- `requestAdapter()` throws (driver mismatch) → reason string carries the throw message; full `err.stack` logged to console once per page via the one-shot warn pattern from the I.19 root-cause lesson

### `html/legend.html` — page legend / quick-access index

**Purpose:** Single canonical index for every HTML + workflow doc in the project. Gee callout 2026-06-18: *"need a glossary or legend for quick access to all the htmls not only just hospogged all around all over the place"*. Every other HTML carries a small floating `📑 Pages` button (top-right, z-index 99998) that opens this page.

**No server required.** GH-Pages-safe. Pure static, no imports.

**Page structure:** three card-grid sections — Live brain UI (index, dashboard, compute), Setup & admin (webgpu-prep, gpu-configure, docs viewer, legend self-card), Reference (brain-equations, unity-guide). Followed by a **public-docs** list pointing at `docs.html?doc=<slug>` for in-browser markdown rendering plus a raw-`.md` fallback link per doc — README + SETUP + ARCHITECTURE + EQUATIONS + ROADMAP + SKILL_TREE + SENSORY + WEBSOCKET only. Workflow + planning docs (Supertodo, TODO/FINALIZED/NOW/RESUME, TODO-life-experience, TODO-full-syllabus, COMP-todo, PUSH_WORKFLOW, STATUSLINE, PERSONA, THRESHOLD-DERIVATION, this HTML-ENTRY-POINTS doc) are LAB-INTERNAL per Gee directive 2026-06-18 — not surfaced in the public legend or docs viewer.

**Failure modes:** none meaningful — pure static. Stale tag info gets caught when this doc updates.

### `html/docs.html` — markdown doc viewer

**Purpose:** Web viewer for every markdown doc — fetches the canonical `.md` file via `fetch()`, renders to HTML through an inline minimal markdown parser, serves it under `?doc=<slug>` URL. Per Gee 2026-06-18: *"need legend to also have webversion of supposrt docs like readme and setup and such"*. The .md file remains the single source of truth; this page is the browser-friendly viewer.

**No server required.** GH-Pages-safe — `fetch()` resolves relative paths from the page URL.

**Whitelist-gated + public-only.** The `DOC_PATHS` object inside the page maps each allowed slug to its relative path (e.g. `README` → `../README.md`). Slugs outside the whitelist render an error page, not a directory traversal. Per Gee directive 2026-06-18 the whitelist contains PUBLIC docs only (README, SETUP, ARCHITECTURE, EQUATIONS, ROADMAP, SKILL_TREE, SENSORY, WEBSOCKET); workflow + planning docs are intentionally excluded so a public dashboard visitor can't paw through internal task ledgers. Adding a new public doc means adding a row to `DOC_PATHS`; internal docs stay out.

**Inline parser scope:** ATX headers (# through ######), fenced code blocks ``` (with language tag preserved as CSS class), GFM tables (|---|---| separator), unordered + ordered lists, blockquotes (`>`), horizontal rules (`---`), inline `**bold**` / `*italic*` / `` `code` `` / `[link](url)`. Good enough for OUR docs; not a full CommonMark implementation. Edge cases that don't render perfectly still produce readable output, and the "📝 Raw .md" link in the topbar lets the user open the canonical file directly.

**URL shape:** `docs.html?doc=README` defaults to README when no query param. The dropdown selector in the topbar switches docs without leaving the page (uses `history.replaceState` so the URL stays shareable).

**Failure modes:**
- Unknown slug → error page lists available slugs
- `fetch()` returns non-2xx → error page with raw-path link as fallback
- Markdown parser hits an edge case → degraded rendering, raw .md link always available in topbar

### `html/brain-equations.html` — public equations reference

**Purpose:** Static math-reference page documenting the equational cognition system. Hebbian/Oja, cortical leak, K wiring, P6.1-P6.8 channels.

**No server required.** GH-Pages-safe. Can be loaded via `file://` directly. **No external dependencies, no module imports — pure HTML + inline CSS.**

**Status:** Updated 2026-06-17 (audit C.5 + I-track session 114.19fp) with relationTagId 13-32 + P6.6 novelty metric + P5.3 quality formula + P3.4 back-injection decay + I.13 `SparseMatrix.propagate(spikes, outBuf?)` output-buffer-pool equation + I.14 `setImmediate` event-loop yield throttling equation + I.8 `DREAM_CONSOLIDATION_MAX_MS` deadline check.

### `html/unity-guide.html` — persona tour

**Purpose:** Public-facing tour of Unity's persona system + manifestation modes + full K→PhD curriculum scope + capabilities. New-user onboarding doc.

**No server required.** GH-Pages-safe. Pure static.

**Status:** Updated 2026-06-17 (audit C.9 + I-track session 114.19fp) — reflects current persona memory layer + manifestation-mode index + full K→PhD curriculum scope (Pre-K+K ONLY scope revoked 2026-06-18 — all 19 grades built) + Phase 6 panels + new I-track observability panels (GPU peak/avg, gate-probe banner, Brain Events feed during cell teach, cell sub-phase progress counter).

### `html/gpu-configure.html` — admin GPU tier-config UI

**Purpose:** Operator-only admin UI for GPU tier selection. Maps cluster-size tier choice to the auto-size formula (`os.freemem() × heap_size_limit × 0.5 ceiling`).

**Launched by:** `windows/GPUCONFIGURE.bat` only — never from start.bat auto-open. Operator runs this once after install to pin a GPU tier.

**Failure modes:**
- HTTP POST to config-write endpoint fails → admin UI shows error banner
- Selected tier exceeds detected GPU max → server-side rejects with 400

**Status:** Verified 2026-06-17 (audit C.10 + I-track session 114.19fp) — tier-selection maps correctly to `_genCorticalAttribs` outputs + auto-size formula post-P4.2 mixin split. I.1 GPU polling cadence update (1Hz with 30-sample ring buffer) is server-side telemetry only, no admin-UI changes needed.

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
4. **Check dashboard banner state.** If `gpu-spawn-banner` is active, H.6 surfacing fired — log line tells you which Chrome/Edge path / errno. If `gate-probe-banner` is active (I.6 closure 2026-06-17), curriculum is running an exclusive-GPU probe and the main tick is paused — wait for the green-check dismissal.
5. **Check WS connection state.** If `no-conn-banner` is active, brain-server isn't reachable on port 7525 — verify with `netstat -ano | findstr :7525`.
6. **Check dashboard endless-loading.** I.14 closure 2026-06-17: when the operator's Ctrl+R never resolves, the brain's Node event loop is starved by `_teachHebbian` (verified failure mode at 21:52 PT live test, `/health` returned 8-15s timeouts). The 50ms-throttled `setImmediate` yield at `_teachHebbian` entry fixes this — but if it ever recurs, the legacy workaround is `windows/stop.bat` → fix → `windows/Savestart.bat` to preserve training across the cycle.

---

## Live-test session 114.19fp updates (2026-06-17 22:00-22:20 PT)

After the operator-driven K-curriculum run surfaced 14 I-track audit items + 1 emergency LAW addition (I.15), every HTML now reflects the additional surface area:

- **dashboard.html** carries the `gate-probe-banner` (I.6 — floating banner with live duration tick during curriculum gate probes) + the GPU panel's peak/avg labels (I.1 — `XX% · peak: YY% · avg: ZZ% (30s)` instead of single instantaneous reading) + the `cellSubPhases`-aware progress renderer (I.12 — bar moves through nested teach calls instead of waiting for cell completion) + the client-side observability patch in the file tail (I.11 + I.12 — synthesizes Brain Events from heartbeat broadcasts as a UX safety-net when the server-side broadcast pipeline misses any teach path).
- **brain-equations.html** documents I.13 (`SparseMatrix.propagate(spikes, outBuf?)` output buffer pool — eliminates `new Float64Array(rows)` per-call allocation that was the +231 MB/min leak source) + I.14 (`setImmediate` event-loop yield throttled to every 50ms via `_lastHebbianYieldAt` timestamp at `_teachHebbian` entry) + I.8 (`DREAM_CONSOLIDATION_MAX_MS` deadline check that breaks gracefully at cluster boundary).
- **unity-guide.html** documents the I.3 + I.9 inner-thought fallbacks (showcase samples from `cluster._definitionTaughtWords` when `wordBucketWords_<subject>` empty + 7-source seed rotation including `k-vocab-recent` + `cell-progress`) so the persona-tour reflects how Unity can talk during early training.

Per LAW added in commit `cdb82e3` (I.15): `autoClearStaleState()` in `server/brain-server.js` is now gated behind `require.main === module` so syntax-check / REPL / IDE module loads NEVER trigger the wipe. Only an actual `node server/brain-server.js` entry-point boot wipes state per the iter14-D contract.
