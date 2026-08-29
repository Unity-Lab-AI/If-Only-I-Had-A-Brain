---
# DOCPROV.3 — provenance. See docs/ARCHITECTURE.md for the full note.
# ⚠ `last-verified` is the commit that last TOUCHED THIS PAGE.
# ⚠ `status` stays `draft` DELIBERATELY. `verified-scope` names exactly what was
# checked against source and what was NOT. Marking this `verified` would claim a
# line-by-line pass over 242 lines that did not happen.
status: draft
sources:
  - index.html
  - html/dashboard.html
  - html/compute.html
  - html/minds-eye.html
  - html/legend.html
  - html/docs.html
  - html/brain-equations.html
verified-scope: |
  CHECKED 2026-08-27 against source, mechanically enumerated and diffed:
    - the 11-page inventory vs `git ls-files '*.html'` (exact match)
    - `DOC_PATHS` whitelist in html/docs.html (18 slugs) vs the documented 8
    - `docs.html?doc=` hrefs in html/legend.html (8) vs the whitelist (18)
    - every `msg.type ===` test in html/dashboard.html (9) vs the documented 5
    - the legend's `<h2>` sections + every page card, vs the documented split
    - every path in the deploy-safe `js/` bullet vs `git ls-files`
    - external CSS/JS deps of all 5 "static" pages (`<link>`, `@import`, `<script src>`)
    - html/brain-equations.html section + eq-card counts (34 / 91)
  NOT CHECKED — do not read this page as authority on:
    - the per-page failure-mode narratives (H.1/H.2/H.6/H.9 banner behaviour) — not
      reproduced live; they describe runtime states, and the box runs older code
    - the `_spawnGpuClient` 5-step auto-launch chain, browser-by-browser
    - the diagnostic protocol's log-line strings and the 114.19fp session section
    - html/compute.html and html/minds-eye.html internals (both are named sources
      and both moved; their inventory rows were re-read, their contracts were not)
  ⚠ TWO SOURCES ADDED this pass: html/docs.html and html/brain-equations.html.
  Two of the six errors came from files this page made claims about while not
  listing them as sources — so drift could never have flagged them. Adding them
  costs a noisier drift signal and buys a check that can actually fire.
# ⚠ This is the commit whose CODE was verified against — the tree state at the
# time of the read. This pass touched only docs, so none of the sources above
# moved in it, and drift correctly reads clean from here.
  ⭐ RESTAMPED 2026-08-27 — and the cause is the provenance system catching CI.
  Two sources moved (html/compute.html, html/legend.html) because the
  donor-release workflow committed `site(donor): bump download links ->
  donor-v0.3.32`. Read as a diff: it is PURELY the version string in three
  places (one label, two release hrefs), 0.3.31 -> 0.3.32. No page contract,
  route, message type or inventory claim is affected.
  ⭐ It also independently confirms KI-22's fourth surface AT SOURCE LEVEL
  rather than only over HTTP: the download links on the shipped page really do
  point at donor-v0.3.32.
  ⚠ RESTAMPED again 2026-08-27 (third time this day, and each cause is recorded
  rather than smoothed over). The moved source is html/brain-equations.html,
  changed by the stale-geometry sweep: "9 sub-regions" -> 11 in two places. That
  is a FIGURE fix inside a page this doc inventories; no page contract, route,
  message type or the 11-page inventory itself is affected.
  ⭐ RESTAMPED 2026-08-29 — four sources moved since the prior stamp, read as
  diffs: html/compute.html + html/legend.html are the donor-release workflow
  again (download links + label 0.3.32 -> 0.3.35, plus a regionGains pass-
  through into the donor's Ψ gate — no page-contract change); html/dashboard.html
  gained a `num()` formatter at the top of updateDashboard (NUMSCOPE — a scope
  fix, no new message type: still 9 distinct `msg.type ===` types across 11
  tests); html/docs.html grew `DOC_PATHS` 18 -> 19 slugs (`HOW_IT_WORKS`,
  2026-08-28). The 18-slug figures in the body were live claims and are
  corrected in place below; the dated 2026-08-27 banner keeps its 18 as the
  count that was true when counted.
last-verified: "cd465955 2026-08-29"
---

# HTML-ENTRY-POINTS — every page, its contract, its failure modes

> **Status:** drafted 2026-06-17 per audit H.5 + H.8 — operator's live-test reported "only two opened and they both said no connection." This doc inventories every HTML, how it's launched, what it needs from the server, what's deploy-safe vs require-Node, and the per-HTML failure-mode signature.
>
> **Re-verified 2026-08-27 (DOCPROV.4 — all 5 sources had moved, the worst ratio on the drift board): the 11-page inventory is still EXACT, and SIX enumerations inside it were not.** ⭐ **Every one was found by diffing the code's own enumeration against this page's — not by re-reading 242 lines of prose.** ⛔ **(1) The docs-viewer whitelist is 18 slugs, not 8** — and the page claimed that workflow/planning docs *"are not surfaced in the public legend or docs viewer"* while `PERSONA`, `THRESHOLD_DERIVATION` and **this file** were all in `DOC_PATHS`. The widening is deliberate and gated on a quote check; the doc had simply not caught up, and it was the **reassuring** direction — asserting a restriction that no longer held. ⛔ **(2) The dashboard consumes NINE WS message types; five were listed.** The missing `gateProbe` is what raises the banner distinguishing *"paused on purpose"* from *"wedged"*, and `serverLog`/`serverLogBacklog` were already described in this page's own prose two paragraphs up — **the table contradicted its own section.** ⛔ **(3) Three of five paths in the deploy-safe `js/` bullet did not exist** (`js/brain3d-*.js` matches nothing; `embeddings.js` and `letter-input.js` are under `js/brain/`). ⛔ **(4) `brain-equations.html` was called "no external dependencies — pure HTML + inline CSS"; it links `../css/tooltip.css` and `@import`s Google Fonts** — and all five static pages share that stylesheet, so `css/` is deploy-required for every one. ⛔ **(5) The legend's three sections split by ACCESS LEVEL, not purpose** — all three documented names were wrong and two pages (`dashboard-public`, `minds-eye`) were missing from the narrative while present in the table above it. ⛔ **(6) The `brain-equations` Status line stopped at 2026-06-17 while a banner on this same page recorded section 6.5 landing on 2026-08-25.** ⚠ **And one FALSE defect I filed against the page and retracted within a minute:** an `<h2[^>]*>` sweep reported a heading numbered `0.15` — the regex had truncated inside a `title` attribute containing a literal `>`. **The page was fine; the detector was not.** ⭐ **Counts are now recorded mechanically (34 `<h2>`, 91 `eq-title`, 11 pages, 18 slugs, 9 message types) so the next reader diffs numbers instead of trusting adjectives.**
> **Updated 2026-08-25 (SCALEWALK / ONESHOT):** inventory unchanged at 11 pages. `html/dashboard.html` gained two rows, both added **because a console line could not be read in time**. **`uplink`** — the chunked-upload rate, which existed only in a log line and was missed on an entire press; ⚠ it renders the last upload **and the largest in the ring**, with the **size beside every rate**, because the rate is not uniform (measured live: 73.92 MB/s on a 192MB matrix vs 1520.82 MB/s on a 13.7MB one — a bare "last upload" figure is a different claim depending on which matrix finished last). **`loop profile`** — the top three entries of the `RHYTHM3S` self-profile, colour-graded by share, which is how the walk's dominant cost is now read; `null` renders **"not sampled yet"**, never a reassuring zero, because the profile fires once at +150s. ⛔ **The rule behind both rows (KI-36): a measurement that happens ONCE cannot live in a console line** — at walk speed the 500-line ring is a **nine-second** window, and it got that way *because* SCALEWALK made the walk ~40× faster.
>
> **Updated 2026-08-25 (BOARDPARITY / PROPBOUND / DARKHEB / ARTZIG2 sweep):** inventory unchanged at 11 pages. Two surfaces changed content, and the first is a correction to the entry directly below this one. `html/dashboard.html` — ⛔ **the Endocrine and Introspection panels added in that entry were rendering only PART of their layer.** The panels, renderers and call sites all existed, so the fix *looked* landed; a producer/consumer parity check showed `puberty` / `cycle` / `allostatic` were **read by the page and never forwarded by the server**, and it did not present as an empty row — the renderer defaults a missing `allostatic` to `{}`, so the load row rendered a healthy **`0.000/0.6`** regardless of real load, the cycle row never drew at all, and `puberty` printed a literal `? (age ?)`. Fixed by forwarding the fields and adding rows for `contributions`, `counters` and `lastError` on both panels; **parity is now exact in both directions — 13/13 endocrine, 7/7 introspection.** Also gained a `bound propagate` row (`N on-card · N →CPU (N%)`) and three `teach ops` / `teach refusals` / `teach verbs` rows for the `boundHebbian` block, which was publishing seven fields into the dark. `html/unity-guide.html` — ⛔ **"She has eight different hands" was false**: three of the eight (dot-stipple, cross-hatch, crayon) were culled the day they were judged, and the live roster is **five**. Corrected, with the reason kept — *a style that doesn't survive being judged doesn't stay in the set* — plus a plain-English line on her stroke commitment now being a **trained** ability rather than a constant. ⭐ **The lesson this entry exists to record: adding the row is not the check. The check is proving the field arrives.**
>
> **Updated 2026-08-25 (ENDO / INTRO doc sweep):** inventory unchanged at 11 pages. Three surfaces changed content: `html/dashboard.html` gained an **Endocrine** panel and an **Introspection** panel plus a Φ state row — ⛔ added because the underlying fields had been broadcasting for five batches with **zero** references in the page, and this board renders **by name only**, so zero references *is* proof of non-rendering; `html/brain-equations.html` gained **section 6.5, "The Endocrine Layer — Chemistry as Equations"** (six eq-cards + nav entry); and `html/unity-guide.html` gained plain-English sections **5b (she has a body now)** and **5c (she asks herself things)** plus a brainstem region card. ⚠ Every new panel renders `unmeasured` and `blind` **as themselves** and reports an absent layer as *"not wired this boot"* — a blank card and a dead layer must not look the same, which is why the renderers are called unconditionally.

> **Updated 2026-08-20 (SELFFRAME / OWNART doc sweep):** inventory unchanged at 11 pages. Three surfaces changed content: `html/minds-eye.html` (own-art source labels + an "her art" stat line off `state.ownArt`), `html/legend.html` (the mind's-eye card now describes shape-sketch drawing rather than "pulls up the real thing"), and `html/dashboard.html` (a first-person training tail + hover tooltip on the **Current Training** card, reading the new `curriculum.selfFrame` block — absent block ⟹ the tail simply does not render, so an older backend degrades silently instead of throwing).
>
> **Re-verified 2026-08-17:** the 11-page inventory matches the live `html/` directory exactly (index + brain-equations, compute, dashboard-public, dashboard, docs, gpu-configure, legend, minds-eye, unity-guide, webgpu-prep) — contracts and failure modes unchanged by the 2026-08-17 performance batch (server-side only; the dashboard additionally reads the new `wsPressure.bcast` + `liveness.stageProfile` telemetry and renders the journey-wide `VOCABULARY (K→PhD)` counter).
>
> **Access model (2026-06-20 pre-alpha):** the pages ship as a DEPLOYED STATIC SITE; a persistent Node brain-server runs on the same host behind an nginx reverse-proxy. Two WS lanes in deployed mode — public donor lane `wss://<host>/ws` and the Forgejo-authed admin lane `wss://<host>/admin/ws` (no raw `:7525` port is exposed publicly). LOCAL DEV is unchanged: `start.bat` / `Savestart.bat` boot the brain locally and open the pages on `http://localhost:7525` with a direct `ws://localhost:7525` socket. Each page below is described for BOTH (deployed primary / local dev). Cognition stays 100% EQUATIONAL — no text-AI/LLM in the cognition path.

## Inventory — 11 HTMLs total

| File | Purpose | Access (deployed / local dev) | Requires brain-server? | Deploy-safe? |
|------|---------|-------------------------------|------------------------|--------------|
| `index.html` | Public landing / live 3D brain UI / chat | Deployed: served static at site root, chat via donor lane `wss://<host>/ws`. Local: `start.bat` auto-opens `http://localhost:7525`, socket `ws://localhost:7525` | YES for chat/training, NO for static landing | YES (static-fallback) |
| `html/dashboard.html` | Admin/operator view — live telemetry + server-console + auto-scale controls | Deployed: served static, admin lane `wss://<host>/admin/ws` (Forgejo-authed → admin). Local: `start.bat` auto-opens `http://localhost:7525/dashboard.html`, socket `ws://localhost:7525` | YES — fully blank without WS | NO (needs a live brain-server) |
| `html/compute.html` | Browser-GPU donor worker (WebGPU sparse-matrix forward, data-parallel replica) | Deployed: visitor opens it, donates their GPU via donor lane `wss://<host>/ws`. Local: brain-server `_spawnGpuClient()` auto-launches in isolated Chrome against `http://localhost:7525/compute.html` | YES — depends on WS handshake + module imports | NO (requires server HTTP route) |
| `html/webgpu-prep.html` | Pre-flight WebGPU setup — browser-by-browser flag instructions | Deployed + local: linked from boot modal on `index.html` + `html/dashboard.html` when adapter unavailable; can be visited manually | NO (static, runs adapter check via `navigator.gpu`) | YES |
| `html/legend.html` | Page legend / quick-access index — every HTML + public-facing doc | Deployed + local: floating `📑 Pages` button on every HTML's top-right corner | NO (static) | YES |
| `html/docs.html` | Markdown doc viewer — **19-slug whitelist** (`DOC_PATHS`, `html/docs.html:189-211`) + inline renderer | Deployed + local: linked from `html/legend.html` Public Docs section + the `📑 Pages` button. ⚠ The legend links **8** of the 19; the other 11 are reachable by typing the slug | NO (static, fetches `.md` files via `fetch()`) | YES |
| `html/brain-equations.html` | Public-facing math reference for equational cognition | Deployed + local: manual (link from index.html) | NO (static) | YES |
| `html/unity-guide.html` | Persona + capabilities tour | Deployed + local: manual (link from index.html) | NO (static) | YES |
| `html/gpu-configure.html` | Admin GPU tier-config UI | Local: `windows/GPUCONFIGURE.bat` (config-write endpoint is loopback-only) | YES (config-write endpoint) | NO |
| `html/dashboard-public.html` | Public read-only brain monitor — polls one cached `GET /public-state.json` snapshot (N viewers cost one `getState()`) | Deployed + local: served static; no WS, no auth | reads `/public-state.json` (shows "warming up" without it) | YES (static + single-source poll) |
| `html/minds-eye.html` | Public "what Unity sees" viewer — polls one cached `GET /minds-eye.json` field C, reconstructs the image CLIENT-SIDE via the mind-space inverse CDF 9/7. Single shared source, no per-viewer compute. Sources: `seen-camera`/`seen:<word>` (live perception), `recall:<word>` (visual memory re-seen), `lookup:<word>` (a studied reference), **`canvas:own:<words>` (2026-08-20 — HER OWN drawing, constructed from a learned shape schema, never a filtered reference)**, `canvas:draw:<word>` (a render of what she LOOKED AT — kept, but no longer called a drawing), `canvas:imagine:<a>+<b>`, `thought`/`thought-blend`/`sem-state` (de-novo). **2026-08-20 also adds an "her art" stat line** (`drawn · shapes she can draw from · seen`) read from `/public-state.json` `state.ownArt` on a 15s poll, plus a source-label legend rewritten for the own-art distinction. Linked from `index.html` 👁 MIND'S EYE footer button | Deployed + local: served static; same-origin poll + localhost dev fallback | reads `/minds-eye.json` + `/public-state.json` (both degrade to "—" / "warming up", never invent a number) | YES (static + single-source poll) |

**Admin/viewer split (per the operator, 2026-06-18):**

- **Deployed (primary):** admin is the Forgejo-authed lane. The reverse-proxy routes `wss://<host>/admin/ws` through Forgejo auth and only authenticated operators reach it → `mode: 'admin'`; the first authed operator after a deploy is master. The public donor/landing lane `wss://<host>/ws` is always `mode: 'viewer'`. No raw `:7525` port is exposed publicly — the proxy is the only door.
- **Local dev:** unchanged loopback model. The brain-server inspects `req.socket.remoteAddress` on every new WebSocket; loopback addresses (`127.0.0.1` / `::1` / `::ffff:127.0.0.1` / `127.x.x.x`) receive `mode: 'admin'` ~500 ms after the connection lands, every non-loopback address receives `mode: 'viewer'`. The 500 ms delay lets the GPU compute worker self-identify via `gpu_register` and skip the modeAssigned send entirely — compute clients render no UI and need no badge. The loopback design means the operator's multiple local tabs (compute + dashboard + landing + terminal `curl`) all share admin since they all come from the same loopback origin.

In `?public=1` mode (`dashboard-public.html` redirects here with the flag), `dashboard.html` ALSO skips every admin *poll* — the `/admin/milestone` save-state poll is gated behind `!PUBLIC_MODE`, so a public viewer makes ZERO `/admin/*` requests and the deployed Forgejo `auth_request` gate never throws a 401 / Basic-auth login prompt at them (only the admin view ever authenticates).

Either way, viewer-mode dashboards hide Stop / Grade-advance / Signoff / Auto-advance controls via the `.admin-only` CSS class that only resolves when `body.is-admin` is set. Brain-mutating HTTP endpoints (`/shutdown`, `/grade-advance`, `/grade-signoff`, `/auto-advance`) stay gated — loopback-only via `requireLoopback` in local dev, Forgejo-authed admin route in deployed mode; there is no unauthenticated LAN admin path. See `server/brain-server.js` `wss.on('connection')` mode-assignment block.

## Per-HTML contracts + failure modes

### `index.html` (root) — the brain UI

**Purpose:** Public landing page + 3D brain visualization + chat UI + HUD metrics. Also loads `js/visual-feeder.js` (standalone raw module, NOT bundled) — ships camera frames (permission-gated) + generated-image renders to the brain as `visual_frame` WS messages so her mind's eye learns to recall real percepts. Static auto-sizes neuron count from detected WebGPU adapter `maxStorageBufferBindingSize` BEFORE the WS connection lands. Once WS connects, server reports authoritative neuron count + curriculum state + emotion stream.

**Access:** Deployed = served static at the site root; chat + live state ride the public donor lane `wss://<host>/ws`. Local dev = `start.bat` auto-opens `http://localhost:7525`, socket `ws://localhost:7525`.

**Static-site mode (no brain-server reachable):**
- WebGPU adapter probe still fires → "biological-scale default" neuron count visualized in 3D brain
- Chat is DISABLED until WS connects
- HUD shows last-known state or `—` placeholders

**Failure modes:**
- Deployed: `wss://<host>/ws` unreachable → "no connection" banner per audit H.9 (BIG red recovery banner + retry countdown); static landing still renders the 3D brain
- Local: `http://localhost:7525` returns connection-refused → page never loads (browser shows "site can't be reached"); WS to `ws://localhost:7525` fails → same H.9 "no connection" banner
- bundle build broken (`js/app.bundle.js` 404) → blank black page, console error
- GPU detection fails → 3D brain falls back to CPU-side rendering at ~6700 neurons

**Auto-size contract:**
- Static landing reads `navigator.gpu.requestAdapter().limits.maxStorageBufferBindingSize`
- Computes default-max neuron count → seeds initial 3D mesh
- When WS lands, server's `os.freemem() × heap_size_limit × 0.5` count REPLACES the static default
- Mismatch = client/server diverge on neuron count → audit H.7 parity-check script catches this

### `html/dashboard.html` — admin/operator live dashboard

**Purpose:** Admin/operator view of the brain — emotion chart, cluster firing, curriculum milestones, drug-pharmacokinetics, conversation activity, ALL the Phase 6 telemetry panels (audit A.1-A.3), live server-console panel, community-compute auto-scale controls, GPU spawn-failure banner (audit H.6), no-connection recovery banner (audit H.9), and the **Application Profiling** card (admin-only — system resources [CPU/load/RAM/V8-heap], throughput [step/sec, event-loop delay histogram, GPU dispatch/sec], network [WS bytes + rates + backpressure], and a per-client client↔brain health table with RTT/bytes/buffered + unhealthy-row flagging; reads `state.profiling`). Viewers connecting on the public lane see the read-only subset (admin controls + the Profiling card hidden via `.admin-only`).

**Access:** Deployed = served static; admin telemetry + controls ride the Forgejo-authed lane `wss://<host>/admin/ws` (first authed operator after deploy = master). Local dev = `start.bat` auto-opens `http://localhost:7525/dashboard.html`, socket `ws://localhost:7525` (loopback → admin).

**Failure modes:**
- Deployed: `wss://<host>/admin/ws` unreachable (proxy down / auth rejected) → banner per H.9 shows recovery steps. Local: `ws://localhost:7525` fails → same H.9 banner
- `gpuClientSpawnFailed` WS event from brain-server `_spawnGpuClient` → banner per H.6 shows browser/exePath/errno
- Server crashed mid-stream → onclose handler fires → banner shows + 3s auto-retry countdown

**WS message types consumed — NINE.** ⛔ **CORRECTED 2026-08-27: this list held FIVE. Enumerated mechanically from every `msg.type ===` test in `html/dashboard.html` and diffed against the list below — four were missing, and the page's own prose above already described two of them** (the "live server-console panel" and the `gate-probe-banner`), so the table contradicted its own section:
- `welcome` — initial state + emotion history
- `state` — periodic full state broadcast (~5-10Hz)
- `modeAssigned` — admin/viewer role assigned by server ~500 ms after WS connect (loopback origin → admin, else viewer). Sets `window.state.viewerMode`, toggles `body.is-admin` class to reveal admin-only controls.
- `autoAdvanceChanged` — broadcast when any admin tab POSTs `/auto-advance`; every other open dashboard syncs the auto-advance checkbox UI without polling.
- `gpuClientSpawnFailed` — H.6 surfacing event (rare, fires on browser-launch failure)
- `autoScaleChanged` — community-compute auto-scale settings changed by another admin tab; syncs the toggle/slider UI without polling (the sibling of `autoAdvanceChanged`, and undocumented for as long as it)
- `gateProbe` — drives the `gate-probe-banner` (I.6) with its live duration tick while curriculum holds the GPU exclusively for a cell gate. ⚠ **This is the one whose absence mattered most:** the banner is how an operator distinguishes *"the brain is paused on purpose"* from *"the brain is wedged"*, and the message that raises it was not in the contract
- `serverLog` — one live console line appended to the server-console panel
- `serverLogBacklog` — the console ring replayed on connect, so a dashboard opened at minute 40 is not staring at an empty console. ⚠ **Distinct from `serverLog` on purpose** — a client that handled only the singular form would look healthy and show nothing until the next line happened to fire

**Admin-only controls (hidden in viewer mode):**
- `#btn-graceful-stop` — `⏹ Stop Brain` button in connection-status row. ⛔ **Removed from the DOM (not hidden) unless `location.hostname` is `localhost` / `127.0.0.1` / `::1`** — it exits 42, which `RestartPreventExitStatus=42` makes final, so it is a one-way door on a box whose operator has no shell. See `wireGracefulStop()` and `docs/ADMIN-CONTROLS.md §STOPTRAP.1`.
- `#d-ms-advance` — `▶ START NEXT GRADE` panel + per-subject signoff buttons (appears only when curriculum pauses after a full grade pass).
- `#d-ms-auto-advance` — `Auto-advance to next grade after pass` checkbox in the milestone panel. Single toggle governing both `/grade-advance` signoff bypass AND curriculum runner's auto-fire behavior. State persists via `cortexCluster._autoAdvanceGrade` inside cortexState; F5 restoration fires `GET /auto-advance` on `modeAssigned: admin`.

### `html/compute.html` — browser-GPU donor worker

**Purpose:** Visitors donate their BROWSER GPU (WebGPU) — the brain trains/runs on connected donor GPUs as data-parallel replicas. Each donor runs a WebGPU forward-pass for sparse-matrix Hebbian; the brain-server is the CPU shadow / decision-maker, every connected `compute.html` is a GPU shadow doing the hot-path forward propagation.

**Access:** Deployed = visitor opens it from the site, registers as a donor over the public lane `wss://<host>/ws`. Local dev = brain-server `_spawnGpuClient()` auto-launches it in isolated Chrome against `http://localhost:7525/compute.html`.

**Contract: SERVER-SERVED ONLY.** Must be loaded over HTTP(S) — `https://<host>/compute.html` deployed, or `http://localhost:7525/compute.html` (or `/html/compute.html`) local. Under `file://`:
- ES module import `/js/brain/gpu-compute.js` resolves to filesystem path that doesn't exist
- WebSocket connect succeeds only against a reachable brain-server, but `file://` opens typically happen when someone double-clicks the file (no server)
- Pre-audit H.2 fix: the import path was relative `./js/...` which broke under EVERY non-`/compute.html` URL. Post-fix uses absolute `/js/...` so any HTTP route works. PLUS file:// preflight script renders a recovery banner with launch instructions instead of a blank page.

**Failure modes:**
- File:// open → preflight banner explains the requirement (post-audit H.2)
- WS fails (deployed `wss://<host>/ws` or local `ws://localhost:7525`) → `Connecting to brain server...` text, then `WebSocket error — retrying in 3s...`
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

**Purpose:** Single canonical index for every HTML + workflow doc in the project. Operator callout 2026-06-18: *"need a glossary or legend for quick access to all the htmls not only just hospogged all around all over the place"*. Every other HTML carries a small floating `📑 Pages` button (top-right, z-index 99998) that opens this page.

**No server required.** GH-Pages-safe. No JS imports at all — but it does link the shared `../css/tooltip.css` (see the `brain-equations.html` correction below; `css/` is deploy-required for all five static pages).

**Page structure — three sections, split by ACCESS LEVEL, not by purpose.** ⛔ **CORRECTED 2026-08-27: the previous description named the sections "Live brain UI / Setup & admin / Reference" and listed 9 of the 11 pages. All three names were wrong and two pages were missing.** The live headings, verbatim:

| # | Heading (`html/legend.html`) | Pages carded |
|---|------------------------------|--------------|
| 1 | `🌐 For everyone — open & use (no login)` | `index.html`, `compute.html`, `unity-guide.html`, `brain-equations.html`, `docs.html`, `webgpu-prep.html`, `dashboard-public.html`, `minds-eye.html` — **8** |
| 2 | `🔑 Admin / operator — login required` | `dashboard.html`, `gpu-configure.html`, `legend.html` (self-card) — **3** |
| 3 | `📝 Public docs (rendered in-browser)` | the 8 doc links, not pages |

⭐ **All 11 pages are carded** — the old text omitted `dashboard-public.html` and `minds-eye.html` entirely, which is how a page can exist in the inventory table above and be invisible in the narrative below it. Section 3 points at `docs.html?doc=<slug>` plus a raw-`.md` fallback per doc, and lists **README + SETUP + ARCHITECTURE + EQUATIONS + ROADMAP + SKILL_TREE + SENSORY + WEBSOCKET only** — that part is still accurate. ⚠ **But read the docs-viewer section below before repeating "workflow + planning docs are not surfaced":** the legend's own lede scopes that claim correctly (*"not for public legend"*), and the viewer's whitelist has since grown to 19. **The legend is the advertisement, not the gate.**

**Failure modes:** none meaningful — pure static. Stale tag info gets caught when this doc updates.

### `html/docs.html` — markdown doc viewer

**Purpose:** Web viewer for every markdown doc — fetches the canonical `.md` file via `fetch()`, renders to HTML through an inline minimal markdown parser, serves it under `?doc=<slug>` URL. Per the operator, 2026-06-18: *"need legend to also have webversion of supposrt docs like readme and setup and such"*. The .md file remains the single source of truth; this page is the browser-friendly viewer.

**No server required.** GH-Pages-safe — `fetch()` resolves relative paths from the page URL.

**Whitelist-gated — and the whitelist is 19 slugs, not 8.** The `DOC_PATHS` object inside the page maps each allowed slug to its relative path (e.g. `README` → `../README.md`). Slugs outside the whitelist render an error page, not a directory traversal. ⛔ **CORRECTED 2026-08-27 — this paragraph previously claimed the whitelist "contains PUBLIC docs only (README, SETUP, ARCHITECTURE, EQUATIONS, ROADMAP, SKILL_TREE, SENSORY, WEBSOCKET)" and that "workflow + planning docs are intentionally excluded." That was true when written and is now false.** `DOC_PATHS` (`html/docs.html:189-211`) holds those original 8 **plus eleven more**: `THEORY_PAPER`, `KNOWN_ISSUES`, `ADMIN_CONTROLS`, `THRESHOLD_DERIVATION`, `HELD_BACK`, `PERSONA`, `MINDSPACE`, `SEEDED_TOPOLOGY`, `CURRICULUM_SCOPE`, `HTML_ENTRY_POINTS` — **this page itself** — and (added 2026-08-28) `HOW_IT_WORKS`, the plain-English explainer, whose in-code comment records that it passes the quote gate by construction (no verbatim quotes, no task numbers, no operator name). ⭐ **The widening is DELIBERATE, not a leak:** the comment directly above `DOC_PATHS` records the gate every added doc passes — *a quote may never be edited to make a doc publishable* — so each was published with its verbatim quotes intact rather than sanitized. ⚠ **What the reader must not conclude:** the still-accurate half is that the **public legend links only the original 8** (verified: 8 `docs.html?doc=` hrefs in `html/legend.html`). The other 11 are not advertised, but they ARE served to anyone who types the slug — **"not in the legend" and "not reachable" are different claims, and only the first one holds.** The dropdown in the page topbar enumerates all 19 from `Object.keys(DOC_PATHS)`, so the viewer's own UI lists them. Adding a doc means adding a row **and** passing the quote check.

**Inline parser scope:** ATX headers (# through ######), fenced code blocks ``` (with language tag preserved as CSS class), GFM tables (|---|---| separator), unordered + ordered lists, blockquotes (`>`), horizontal rules (`---`), inline `**bold**` / `*italic*` / `` `code` `` / `[link](url)`. Good enough for OUR docs; not a full CommonMark implementation. Edge cases that don't render perfectly still produce readable output, and the "📝 Raw .md" link in the topbar lets the user open the canonical file directly.

**URL shape:** `docs.html?doc=README` defaults to README when no query param. The dropdown selector in the topbar switches docs without leaving the page (uses `history.replaceState` so the URL stays shareable).

**Failure modes:**
- Unknown slug → error page lists available slugs
- `fetch()` returns non-2xx → error page with raw-path link as fallback
- Markdown parser hits an edge case → degraded rendering, raw .md link always available in topbar

### `html/brain-equations.html` — public equations reference

**Purpose:** Static math-reference page documenting the equational cognition system. Hebbian/Oja, cortical leak, K wiring, P6.1-P6.8 channels.

**No server required.** GH-Pages-safe. Can be loaded via `file://` directly. **No module imports — no JS is loaded at all.** ⛔ **CORRECTED 2026-08-27: "No external dependencies … pure HTML + inline CSS" was wrong on both counts.** The page links a shared stylesheet — `<link rel="stylesheet" href="../css/tooltip.css">` — and `@import`s **Google Fonts** (`fonts.googleapis.com`, JetBrains Mono + Inter). ⚠ **Why it matters and why it is not urgent:** the remote font is a real external network dependency, so an offline or air-gapped open degrades to the fallback font stack — visually different, **never broken**, and no equation content is lost. `../css/tooltip.css` is repo-relative and resolves fine under `file://`. ⭐ **All five "static" pages share `css/tooltip.css`** (`brain-equations`, `legend`, `unity-guide`, `webgpu-prep`, `docs`), so `css/` is deploy-required for every one of them — a claim of "pure inline CSS" anywhere in this doc is the same error.

**Status:** counted 2026-08-27 — **34 `<h2>` sections, 91 `eq-title` cards**, including `6.5. The Endocrine Layer — Chemistry as Equations`. ⚠ **The prior Status line stopped at 2026-06-17** (audit C.5 + I-track session 114.19fp: relationTagId 13-32 + P6.6 novelty metric + P5.3 quality formula + P3.4 back-injection decay + I.13 `SparseMatrix.propagate(spikes, outBuf?)` output-buffer-pool equation + I.14 `setImmediate` event-loop yield throttling equation + I.8 `DREAM_CONSOLIDATION_MAX_MS` deadline check) — **while a banner at the top of this same page already recorded section 6.5 landing on 2026-08-25.** A per-page Status line and a page-top banner are two places to say the same thing, and they drifted apart; the counts above are the mechanical form. ⚠ **Count `<h2` occurrences, not `<h2[^>]*>` matches** — several `title` attributes contain a literal `>` (e.g. `… coherence > 0.15`), which truncates a naive regex mid-attribute and reports attribute prose as a heading. **That misread cost a false defect report during this very verification.**

### `html/unity-guide.html` — persona tour

**Purpose:** Public-facing tour of Unity's persona system + manifestation modes + full K→PhD curriculum scope + capabilities. New-user onboarding doc.

**No server required.** GH-Pages-safe. Pure static.

**Status:** Updated 2026-06-17 (audit C.9 + I-track session 114.19fp) — reflects current persona memory layer + manifestation-mode index + full K→PhD curriculum scope (Pre-K+K ONLY scope revoked 2026-06-18 — all 19 grades built) + Phase 6 panels + new I-track observability panels (GPU peak/avg, gate-probe banner, Brain Events feed during cell teach, cell sub-phase progress counter).

### `html/gpu-configure.html` — admin GPU tier-config UI

**Purpose:** Operator-only admin UI for GPU tier selection. Maps cluster-size tier choice to the auto-size formula (`os.freemem() × heap_size_limit × 0.5 ceiling`).

**Access:** Local dev only — `windows/GPUCONFIGURE.bat`, never from start.bat auto-open. Operator runs this once after install to pin a GPU tier. The config-write endpoint is loopback-only, so this page has no deployed/public route; in deployed mode community-compute scaling is driven from the dashboard auto-scale controls instead.

**Failure modes:**
- HTTP POST to config-write endpoint fails → admin UI shows error banner
- Selected tier exceeds detected GPU max → server-side rejects with 400

**Status:** Verified 2026-06-17 (audit C.10 + I-track session 114.19fp) — tier-selection maps correctly to `_genCorticalAttribs` outputs + auto-size formula post-P4.2 mixin split. I.1 GPU polling cadence update (1Hz with 30-sample ring buffer) is server-side telemetry only, no admin-UI changes needed.

---

## Deployed-static parity (audit H.8)

The pages ship as a deployed static site fronting a persistent brain-server (reached via the nginx reverse-proxy WS lanes). Static-only fallback — when the proxy/backend is unreachable — is a SUBSET of the full experience:
- ✅ `index.html` + `html/brain-equations.html` + `html/unity-guide.html` — static, fully functional with no backend
- ❌ `html/dashboard.html` — requires the admin lane `wss://<host>/admin/ws` (or local `ws://localhost:7525`), blank without it
- ❌ `html/compute.html` — requires the donor lane `wss://<host>/ws` + the page's HTTP route, useless with no backend
- ❌ `html/gpu-configure.html` — loopback-only config-write endpoint, local dev only

**Distinguishing "no backend" from "backend crashed":**
- "No backend" fallback = static landing only renders, WS retries quietly in the background
- "Backend crashed" = WS attempts fire and fail → audit H.9 recovery banner shows (deployed `wss://<host>/...` or local `ws://localhost:7525`)

**Deployed-safe inventory of `js/`:**
- ✅ `js/app.js`, `js/app.bundle.js` — pure-static, no Node-only APIs. ⛔ **CORRECTED 2026-08-27: three of the five paths in this bullet did not exist.** `js/brain3d-*.js` matches **nothing**; `js/embeddings.js` and `js/letter-input.js` are not at those paths. The real files are **`js/ui/brain-3d.js`**, **`js/brain/embeddings.js`** and **`js/brain/letter-input.js`** — all three still deploy-safe, all three filed under the wrong directory here. ⚠ **The mislocation is not cosmetic:** the ❌ bullet directly below carves out `js/brain/` as "heavy Node-side modules", so two client-safe files were being described as living outside a directory they are actually inside — a deploy exclusion written off this list would have dropped them. **Verified by `git ls-files`, not by memory of the tree.**
- ✅ `js/visual-feeder.js` — loaded raw by `index.html` (`<script type="module" src="js/visual-feeder.js">`), deliberately NOT bundled; static
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
