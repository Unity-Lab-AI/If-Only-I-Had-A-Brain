# WEBSOCKET — Unity Brain Server Wire Protocol

> Complete reference for the WebSocket protocol between `server/brain-server.js` and its clients.
> Every message type, every payload shape, every state broadcast, every reconnection rule.
>
> Unity AI Lab — 2026-04-13

---

## Endpoint

### Local dev

| | |
|---|---|
| **Default URL** | `ws://localhost:7525` |
| **Env override** | `PORT=xxxx node server/brain-server.js` (bumps both HTTP and WebSocket to the same port) |
| **Library** | [`ws`](https://github.com/websockets/ws) on the server, browser-native `WebSocket` API on the client |
| **Handshake** | Plain HTTP upgrade on the same port as the dashboard/health/compute endpoints |
| **Content type** | JSON, UTF-8, one message per frame |
| **Compression** | None — `ws` default is to negotiate permessage-deflate if both ends offer it |

Local dev connects the browser directly to `ws://localhost:7525` — no proxy, no auth (see the hostname gate under "Client Reconnection Behavior").

### Deployed (nginx reverse-proxy lanes)

In the deployed pre-alpha, the Node brain-server binds to loopback only (`127.0.0.1:7525`) and is never exposed directly. An nginx reverse-proxy fronts it and splits two WSS lanes onto the same brain process:

| Lane | URL | Auth | Who connects |
|---|---|---|---|
| **Public donor/viewer** | `wss://<host>/ws` | None | `compute.html` donor GPUs + read-only viewers |
| **Admin** | `wss://<host>/admin/ws` | Forgejo-authenticated (nginx `auth_request`) — injects a trusted `X-UAL-User` header the brain-server reads | Lab operators. First authed connection after a deploy becomes the master operator. |

Both lanes terminate at the one loopback brain-server; the lane a client arrived on (plus the `X-UAL-User` header on the admin lane) is what gates the admin-only messages described below. Admin REST control endpoints are proxied under `/admin/<endpoint>` (see "Server Endpoints").

**R14 note (2026-04-13):** Unity's brain server used to bind to port `8080`, which collides with llama.cpp's default, is one of the most commonly-used ports, and was a port R13 explicitly wanted to auto-detect for vision describer backends. R14 moved Unity to `7525` — not used by any backend Unity probes, so Unity never fights its own vision detection. If you're still running an old deployment on `8080`, set the `PORT` env var on `node brain-server.js` to keep the old behavior.

---

## Connection Lifecycle

```
Client opens ws://localhost:7525
    ↓
Server accepts, assigns unique id: "user_<timestamp36>_<rand4>"
    ↓
Server sends { type: 'welcome', id, state, emotionHistory }
    ↓
Client holds connection open, receives state broadcasts (10 Hz)
    ↓
Client sends { type: 'text', text: '...' } on user input
    ↓
Server runs equational response pipeline, sends back { type: 'response'|'build'|'image', ... }
    ↓
(No broadcast to other clients — user text is PRIVATE between the user and Unity. See "Privacy model" below.)
    ↓
On disconnect: server removes client from brain.clients map
```

`brain.clients` is a `Map<WebSocket, {id, lastInput, inputCount, name, isGPU?}>`. The server tracks every connected client for rate limiting and GPU compute dispatch. **No cross-client broadcast of user text happens** — see "Privacy model" below.

---

## Messages: Server → Client

Every message is a JSON object with a `type` discriminator. Clients should switch on `msg.type` and ignore unknown types (forward-compat rule — new types will be added in future releases).

### `welcome`

Sent once, immediately after connection is accepted.

```json
{
  "type": "welcome",
  "id": "user_1mz8r4k_9f2x",
  "state": { /* brain.getState() snapshot */ },
  "emotionHistory": [ /* last 300 emotion data points */ ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique client id assigned by the server for rate-limiting / log tagging. No longer used for cross-client broadcast filtering — the `conversation` broadcast was removed 2026-04-13 per the privacy model. |
| `state` | object | Full brain state snapshot (same shape as the per-frame `state` broadcast). Used to hydrate the client HUD immediately on connect. |
| `emotionHistory` | array | Last 300 entries from `brain._emotionHistory`, so a freshly-connected dashboard can render the emotion chart without waiting for new data. |

### `state`

Broadcast to every connected client every `STATE_BROADCAST_MS` (100 ms → 10 Hz).

```json
{
  "type": "state",
  "state": {
    "time":      12345.67,
    "frameCount": 67890,
    "reward":    0.12,
    "clusters": { "cortex": {...}, "hippocampus": {...}, ... },
    "modules":  { "amygdala": {...}, ... },
    "oscillations": [...],
    "mystery":  { "psi": 1.34, "id": ..., "ego": ..., ... },
    "motor":    { "selectedAction": "respond_text", "channelRates": [...] },
    "drugState": "sober",
    "drugSnapshot": {
      "sober": true,
      "active": [],
      "combos": [],
      "riskFlags": {},
      "pendingDesires": [],
      "pendingAcquisitions": [],
      "gradeLocked": false
    },
    "cortexDivergence": 0.0,
    "cortexDivergenceByRegion": {
      "auditory": { "standRate": 0.0, "mainRate": 0.0, "divergence": 0.0 },
      "letter":   { "standRate": 0.0, "mainRate": 0.0, "divergence": 0.0 }
    },
    "profiling": {
      "host":       { "loadAvg": [1.4,1.3,1.4], "cpuCount": 16, "sysMemUsedPct": 41, "osUptimeS": 0 },
      "process":    { "rssMB": 6822, "heapUsedMB": 18, "heapLimitMB": 16384, "heapUsedPct": 0, "cpuPercent": 42, "voluntaryCtxSwitches": 0, "uptimeS": 0 },
      "throughput": { "stepTimeMs": 8.5, "stepsPerSec": 16, "eventLoopLagMs": 8, "eventLoopDelay": {"meanMs":1.2,"p50Ms":0.8,"p99Ms":7.1,"maxMs":9.5}, "gpuDispatchPerSec": 1, "totalSpikes": 0, "defsLearnedPerHour": 0 },
      "network":    { "bytesInTotalMB": 0.03, "bytesInPerSecKB": 0, "bytesOutPerSecKB": 0, "msgInTotal": 0, "donorCount": 1, "aggGneuronsPerSec": 0, "wsPressure": { "...": "see _getWsPressureState" } },
      "clients":    { "total": 4, "admins": 1, "viewers": 2, "donors": 1, "totalConnectionsEver": 4, "avgRttMs": null, "unhealthyCount": 0, "shown": 4, "list": [ { "id": "user_…", "type": "donor", "rttMs": 35, "bytesInMB": 0, "bufferedKB": 0, "unhealthy": false } ] }
    },
    "clientCount": 3
  }
}
```

The exact shape comes from `brain.getState()` in `server/brain-server.js` — it's the full live snapshot the dashboard renders. This is the highest-traffic message by volume (10 Hz × every client).

`profiling` (`server/brain-server/state.js _getProfilingState()`) is the admin Application Profiling payload — **host** hardware, **process** resource usage, **throughput** (incl. a `perf_hooks.monitorEventLoopDelay` percentile histogram + GPU dispatch rate), **network** (per-WS byte totals + live rates, reuses `wsPressure`), and **clients** (per-connection health — type/RTT/bytes/buffered, `unhealthy`-flagged + sorted first, list capped at 24 + `shown`). Per-client byte/RTT counters are instrumented in `brain-server.js` (send-wrapper + inbound listener + heartbeat ping/pong). The dashboard renders it in an `admin-only` Profiling card; public viewers receive it in `/public-state.json` but the panel is admin-gated. Full field reference: `docs/ADMIN-CONTROLS.md`.

`consciousness` (`server/brain-server/state.js _getConsciousnessState()`) is the equational-consciousness telemetry block — GlobalWorkspace ignition (current broadcast + strength + rate% + history), predictive-coding error sparkline, Ψ consciousness gain, Dictionary-API status, K-wiring assertion, cortical microstructure, defs-learned-per-hour. **SPEAK.2-obs (2026-07-01) adds `consciousness.speechHealth`** — per-subject speech separability for the dashboard '🗣 Speech Health (SPEAK)' card: for each bucketable subject, the FROZEN `cellSize` (SPEAK.1 vocab-growth-invariant geometry) + the `sem_to_word_motor` weight-mass ratio (max/mean |W| — the SPEAK.2 separability proxy), plus the coherence-floor stats (`_coherenceFloorStats {total, rejected}` from SPEAK.9) and best-of-N rerank stats (`_coherenceRerankStats`). Surfaces basin-separability regression at G4 instead of G9. All fields bounded/aggregate (no per-word enumeration) per the dashboard-discipline constraints.

`drugSnapshot` is `DrugScheduler.snapshot(now)`. `active` carries per-substance `{substance, displayName, level, phase}` where phase ∈ {onset, peak, plateau, tail, sober}. `combos` carries per-pair `{key: 'a+b', displayName, level: min(level_a, level_b)}` for the 7 synergy entries in the COMBOS table. `riskFlags` maps axis name → cumulative intensity across active combos (e.g., `physicalStrain`). `pendingDesires` maps substance → `{delta, expiresAt}` from sensory-trigger cravings. `pendingAcquisitions` tracks substances Unity is waiting on (dealer / friend / party source).

`cortexDivergenceByRegion` is the T17.7 Phase C follow-up telemetry — per-region `{standRate, mainRate, divergence}` between standalone `cortexCluster.lastSpikes` and main-cortex GPU spike slices. Rates in [0, 1] (spike fraction); divergence rounds to 5 decimals. Empty during GPU warmup.

The T17.7 sparse-dispatch + slice-access wire protocol adds binary frames (type=1 upload / type=2 propagate / type=3 hebbian / type=4 chunked-upload) plus JSON messages `write_spike_slice` / `write_current_slice` / `clear_spike_region` / `rebind_sparse` / `readback_letter_buckets` / `readback_matrix_checksum`. All are server → compute.html; each has a matching `*_ack` response. Handled in `js/brain/gpu-compute.js` + `compute.html` onmessage dispatcher + `server/brain-server.js` ack-switch (`case 'sparse_upload_ack' | 'sparse_propagate_ack' | 'sparse_hebbian_ack' | 'rebind_sparse_ack' | 'readback_letter_buckets_ack' | 'readback_matrix_checksum_ack'`).

**TU.19-D — `readback_matrix_checksum` (GPU↔CPU parity).** `{ type:"readback_matrix_checksum", reqId, name, sampleCount }` → the donor reads its ACTUAL resident sparse-matrix `values` buffer and replies `{ type:"readback_matrix_checksum_ack", reqId, name, found, nnz, checksum, samples:[{idx,val}] }`. `checksum` is FNV-1a-64 over the bit-exact little-endian f32 value bytes, returned as a DECIMAL STRING (survives JSON's number range). Byte-identical across the native wgpu donor (`donor-app` ComputeEngine), the native CUDA donor (memcpy_dtov), and the browser donor (`gpu-compute.js checksumSparseMatrix`, BigInt FNV) — all x86-64 LE + LE GPU buffers (F10). The server compares this against a digest of its CPU-master matrix in the SAME f32 representation it uploaded (`_cpuMasterMatrixChecksum`), and `parityCheckMatrix` returns a verdict: **STALE** (weights differ = dropped uploads), **GPU-DIVERGENT** (weights match but same-input propagate differs = shader/precision bug), **MATH-ERROR** (CPU reference propagate wrong), or **CLEAN**. Exposed via the loopback `GET /diag/parity?name=<matrix>&samples=<n>` endpoint + the `scripts/gpu-cpu-parity.mjs` trigger. Requires the values buffer to carry `COPY_SRC` usage (added on both donor paths so the resident weights are readable).

### `response`

Sent in reply to a `text` message when Unity's BG motor channel selects `respond_text` (or any default action).

```json
{
  "type": "response",
  "text": "whatever unity equationally generated",
  "action": "respond_text"
}
```

`text` is produced by `brain.processAndRespond(msg.text, id)` which on post-T14.6 branches (`t14-language-rebuild`) calls `languageCortex.generateAsync()` (the T14.26 async path for the 3D brain freeze fix). The slot scorer is DELETED — `LanguageCortex.generate` is a 68-line delegate that calls `cluster.generateSentence(intentSeed)`, the cortex tick-driven motor emission loop. Every word comes from a continuous motor-region readout over learned cortex attractor basins — zero dictionary iteration, zero softmax top-K, zero n-gram table lookup at emission time. Output length is capped by the T14.24 Session 1 multi-subject grade word cap: `LanguageCortex.generate` reads `cluster.grades = {ela, math, science, social, art}` and returns the minimum cap across subjects that have advanced past pre-K, with fallback to legacy `cluster.grade` scalar for pre-T14.24-Session-1 brains. No AI prompt involved at any point. See `docs/EQUATIONS.md § T14` for cortex equations and `docs/EQUATIONS.md § T14.24` for the per-subject grade cap equation.

`action` may be any of the 6 motor channels — `respond_text`, `generate_image`, `speak`, `build_ui`, `listen`, `idle` — though `build_ui` and `generate_image` get split into their own dedicated message types below.

### `build`

Sent when Unity's motor channel selects `build_ui` AND the equational component synthesizer finds a matching primitive.

```json
{
  "type": "build",
  "component": {
    "id": "counter_a3f9b2c1",
    "html": "<div class='...'>...</div>",
    "css":  ".counter_a3f9b2c1 { ... }",
    "js":   "(function() { ... })();"
  }
}
```

Routed ONLY to the client who sent the triggering `text` message (per-user sandbox) — NOT broadcast. The client's sandbox layer injects the component into its own live DOM.

See `docs/EQUATIONS.md § Phase 13 R6.2 — Equational Component Synthesis` for the math: user request → GloVe embedding → cosine match against `component-templates.txt` corpus → best primitive selected if `cosine ≥ 0.40`, else brain falls through to `respond_text`. `id` suffix is an 8-character hash derived from the cortex pattern at build time, so the same user request under different brain state produces a different id.

### `image`

Sent when the motor channel selects `generate_image`. The *prompt* is generated equationally on the server side (language cortex picks every word); the actual image rendering happens on the client so each user paints with their own configured image gen backend (see `docs/SENSORY.md § The Sensory AI Provider — 4-Level Priority`).

```json
{
  "type": "image",
  "prompt": "the full equational image prompt unity generated"
}
```

Routed only to the triggering client. The client's `SensoryAIProviders.generateImage(prompt)` runs the 5-level priority chain (user-preferred via setPreferredBackend → custom → auto-detected local → env.js → Pollinations default).

### `conversation` — REMOVED 2026-04-13

This message type used to broadcast `{userId, text (first 200 chars), response (first 500 chars)}` to every connected client after any `text` request completed. It was fed into the dashboard's live conversation feed.

**Removed** to enforce the privacy model: user text is PRIVATE between the user and Unity, never broadcast to other clients. The shared brain still benefits from every conversation (dictionary growth, bigrams, embedding refinements) because those all live in the singleton brain instance, but the raw text + response stay in the one client ↔ server channel.

Any client that used to subscribe to this message type will stop receiving it. `dashboard.html`'s conversation feed now shows per-session stats only (no cross-user text display).

### `error`

Sent when a client message fails validation or rate limiting.

```json
{ "type": "error", "message": "Rate limited — slow down" }
```

Currently only fires for `text` rate limiting (`MAX_TEXT_PER_SEC = 2`, so minimum 500 ms between text messages per client), but the shape is general-purpose. Clients should surface these in the UI as warnings, not fatal errors — the connection stays open.

### `speak`

Reserved. `js/brain/remote-brain.js` has a handler for this type (so clients are forward-compatible) but the current server code doesn't emit it — TTS motor actions currently route through `response` with `action: 'speak'` and the client decides whether to call its TTS peripheral. A future refactor may split speak into its own dedicated message type for TTS-only clients that don't render text.

### `innerThought`

Broadcast to all clients (not gated) on the inner-voice cadence (Hurlburt natural rhythm, ~6-75s gaps). Payload `{ type:'innerThought', word, sentence, seed, seedLabel, ts }` — her live inner monologue for the dashboard popup stream. At biological scale on the no-GPU box the `sentence` is the loop-safe showcase (now a GloVe-cosine-COHERENT trained-vocab fragment, not random word-salad); when `DREAM_INNERVOICE_GPU_GEN=1` + DF.7 donors are present it's REAL `composeSentence` generation.

### `imagine` (2026-06-27)

Broadcast to all clients when Unity imagines (server `_imagineTick`, idle-gated). Payload `{ type:'imagine', terms, source, ts }` — METADATA only (equation-term count + source `mindspace-denovo`); a dashboard "mind's-eye active" indicator. The actual field C is NOT on this message — it's served as a single cached snapshot at `GET /minds-eye.json` so the public Mind's-Eye viewer (`html/minds-eye.html`) polls one shared blob and reconstructs the image client-side (no per-viewer payload, no lag). See "Server Endpoints".

### GPU compute messages

`brain-server.js` offloads all Rulkov-map neuron iteration and synapse propagation to a browser GPU compute client running `compute.html`. The live neural rule is the Rulkov 2002 2D chaotic map (`x_{n+1} = α/(1+x²) + y`, `y_{n+1} = y − μ(x − σ)`) running as a WGSL compute shader in `js/brain/gpu-compute.js` — the `LIF_SHADER` constant name is historical, the kernel body is the Rulkov iteration. Server talks to the GPU client via three WebSocket message types on the same connection:

| Direction | Type | Payload | Meaning |
|---|---|---|---|
| Server → GPU | `gpu_init` | `{clusterName, size, tonicDrive, noiseAmp, lifParams, ...}` | Create GPU buffers for a cluster (one-time per cluster on boot). Neuron state is seeded on the GPU via golden-ratio quasi-random (x, y) pairs inside the Rulkov bursting attractor basin — no voltage array transferred from the server |
| Server → GPU | `compute_request` | `{clusterName, tonicDrive, noiseAmp, gainMultiplier, emotionalGate, driveBaseline, errorCorrection}` | Request one Rulkov step. GPU collapses the modulation scalars to `effectiveDrive` then `σ = −1 + clamp(effectiveDrive/40, 0, 1)·1.5` and iterates the map |
| GPU → Server | `gpu_init_ack` | `{clusterName, size}` | GPU confirms cluster is initialized |
| GPU → Server | `compute_result` | `{clusterName, spikeCount}` | GPU returns atomic-counted spike count after running one Rulkov step. Spike edge = (x_n ≤ 0) ∧ (x_{n+1} > 0) — one spike per action potential |

Why this architecture: state is `vec2<f32>` per neuron (12 bytes/neuron total including spikes u32) and stays resident on the GPU after init. Sending full state arrays every step at 60 Hz × 10 substeps × 7 clusters would be prohibitive at the auto-scaled N. Keeping state + spikes on the GPU and sending only scalar modulation inputs + a single `spikeCount` readback per step keeps WebSocket traffic under 100 KB/step regardless of cluster size. The GPU client is a regular WebSocket client from the server's perspective, just marked with `isGPU: true` in the client record after it sends `gpu_register`.

#### Distributed donor compute (data-parallel replica pool)

On the public donor lane (`wss://<host>/ws`), any number of `compute.html` donor GPUs can `gpu_register` and join a **data-parallel replica pool**. Each donor that joins is uploaded the FULL brain (it runs a complete replica, not a sharded slice), and the server periodically re-broadcasts the master to all replicas via a Hebbian-delta merge — every replica's learned weight deltas fold back into the master, then the merged master pushes back out. Donors never see user text; they only iterate neuron state and report spike counts / learned deltas. The auto-scaled N a replica runs is the same biological-scale brain the master holds.

| Direction | Type | Payload | Meaning |
|---|---|---|---|
| Donor → Server | `gpu_register` | `{ …, appVersion }` (native binary) | Donor joins the replica pool; server uploads the full brain to it. **TU.20.12:** a native binary sends `appVersion` (Cargo pkg version); if it's below `DREAM_MIN_DONOR_VERSION` (default 0.3.7) the server replies `{type:"incompatible_version", yourVersion, minVersion, message}` + closes (code 4001) and does NOT admit it. Browser donors omit `appVersion` → exempt. The refused donor stops reconnecting + shows "Brain status: refused — update". |
| Server → Donor | (full-brain upload + periodic master re-broadcast) | weights | Replica receives the complete brain on join, then periodic merged-master pushes |

Admin-only telemetry rides the admin lane (`wss://<host>/admin/ws`): the live server console stream and auto-scale telemetry (replica count, per-replica throughput, scaling decisions) are pushed only to authed admin clients, never to donors/viewers.

---

## Messages: Client → Server

### `text`

The primary client → server message. User input that should route through Unity's brain.

```json
{ "type": "text", "text": "hi unity, what are you up to" }
```

Rate limited: `1000 / MAX_TEXT_PER_SEC = 500 ms` between text messages per client. Exceeding the rate produces an `error` reply and the message is dropped (brain doesn't process it).

Server pipeline: `brain.processAndRespond(msg.text, client.id)` runs `languageCortex.generate()` with full brain state, selects a motor action, and returns a result object that the server switches on to emit `build` / `image` / `response`.

### `reward`

Scalar reward signal that modulates Unity's learning.

```json
{ "type": "reward", "amount": 0.2 }
```

Adds to `brain.reward` directly. Positive values train toward the current motor action; negative values train away. Exposed in the dashboard as a "👍 / 👎" pair. No rate limiting — the signal is already scalar and small.

### `setName`

Client identifies itself with a display name.

```json
{ "type": "setName", "name": "Gee" }
```

Stored on the server-side client record (`client.name`). Currently used only for logging and future dashboard display — no effect on the brain simulation.

### `visual_frame` (2026-07-08)

Visual intake — what Unity's eyes receive. Sent by the standalone client
feeder (`js/visual-feeder.js`, raw-served — NOT bundled) for camera frames
(permission-gated, never prompts) and generated-image renders (prompt decoded
from the Pollinations URL as the label).

```json
{
  "type": "visual_frame",
  "source": "camera",
  "w": 96, "h": 96,
  "rgba_b64": "<base64 RGBA, exactly w*h*4 bytes>",
  "label": "yellow banana"
}
```

Server (`server/brain-server/visual-memory.js` `_ingestVisualFrame`)
equationalizes the frame into a full-color field C (forward CDF 9/7, YCbCr)
and stores it keyed to the concept words active at perception time — the
`label` when present, else her current thought (inner-thought chain /
global-workspace broadcast). At imagine-time the mind's eye recalls +
morphField-recombines these stored percepts (`_recallVisualMemory`).
Validation is strict (dims 8..96, byte length must equal `w*h*4`, base64
decode verified) and intake is paced (2s min gap brain-wide); malformed or
flooding frames drop silently. Store: LRU-capped 384 concepts, persisted to
`server/visual-memory.json` (debounced 30s, atomic).

### `gpu_register`

Sent by `compute.html` (browser donor) or the native donor-app on WebSocket open to join the donor pool.

```json
{
  "type": "gpu_register",
  "vramMB": 16302,
  "maxStorageBindingMB": 16302,
  "gpuName": "NVIDIA GeForce RTX 2060",
  "donorId": "native-…", "donorName": "Sponge",
  "osPlatform": "linux", "engineBackend": "cuda",
  "driverVersion": "595.71.05", "computeCapability": "7.5",
  "utilizationPct": 60, "donatedMB": 0,
  "linkDownMbps": 0
}
```

The server adds `ws` to `brain._gpuClients` and (if there's no primary, or the newcomer is materially stronger under DF.7) marks it `brain._gpuClient`; otherwise it's brought up as a full data-parallel replica. The browser donor omits everything but `type`; the native donor sends the richer payload above. **`osPlatform` / `engineBackend` (`cuda`/`vulkan`/`dx12`/`metal`/`gl`) / `driverVersion` / `computeCapability`** (donor-app v0.3.3+) are captured on `client.*` and surfaced in the admin dashboard **Clients table** `plat` column so a red / 0-Gn/s donor's platform + backend + driver is visible instead of inferred from logs. `gpu_telemetry` re-sends the same four fields each tick so the row stays correct across a reconnect race. **`utilizationPct` (donation duty-cycle, 0–100, default 100) + `donatedMB` (explicit VRAM cap, 0 = unset)** (donor-app v0.3.4+) tell the brain how much each donor actually gives: `_recomputeCommunityCompute` sums **effective donated** capacity (`donatedMB>0 ? min(donatedMB, fullVram) : fullVram × util/100`) for the auto-scale tier gate, so two 15 GB cards at 60 % count as 18 GB, not 30 GB. ⚠ utilization is a *throughput* duty-cycle, not VRAM held — for data-parallel the brain's max SIZE is bounded by the *smallest* donor's committed VRAM (`/autoscale` exposes `minDonorMB`), not the sum. **`linkDownMbps`** (donor-app v0.3.5+) is the donor's self-measured downlink throughput (megabits/sec, peak-hold with slow decay; `0`/absent = unknown, e.g. the browser donor) — stored on `client.donorLinkMbps` and re-sent each `gpu_telemetry` tick; the brain's WSQ.3 replica-sync pacing uses it to throttle chunk uploads to the donor's REAL link capacity instead of an RTT proxy, so a low-bandwidth uplink (Starlink) isn't flooded.

### `compute_result`

The GPU client's reply to `compute_request`. Delivered via the `_gpuPending[clusterName]` resolver map.

```json
{
  "type": "compute_result",
  "clusterName": "cortex",
  "spikeCount": 47
}
```

Server resolves the pending promise with `{clusterName, spikeCount}`. Voltages and spike indices stay resident on the GPU — only the count comes back, since the server only needs that scalar for the high-level simulation loop.

### `gpu_init_ack`

GPU confirms it initialized a cluster after receiving `gpu_init`.

```json
{
  "type": "gpu_init_ack",
  "clusterName": "cerebellum",
  "size": 100
}
```

Server logs this as confirmation. Used only for boot-time verification that the GPU client picked up all 7 clusters before the simulation loop starts dispatching steps.

### Unknown types

The server logs `[<id>] Unknown message type: <type>` and drops the message. Clients should never hit this path, but the branch exists for forward-compat with future message types that old servers haven't seen yet.

---

## Rate Limiting

| Message type | Limit | Enforced by |
|---|---|---|
| `text` | `MAX_TEXT_PER_SEC = 2` per client (500 ms minimum gap) | `brain-server.js:1534` — gap check against `client.lastInput`, returns `error` on violation |
| Everything else | Unlimited | Relies on client sanity + TCP backpressure |

There's no global rate limit or burst budget — it's purely per-client per-message-type. The cross-client `conversation` broadcast that used to fan-out was removed 2026-04-13 (see the `conversation` section above), so a chatty server no longer multiplies traffic by `N clients × text rate`. Each user's text is a 1:1 conversation with the server.

---

## Client Reconnection Behavior

`js/brain/remote-brain.js` handles connection drops with an automatic reconnect loop. The contract:

1. **On `ws.onclose`:** wait a short backoff (1 second), then try to reconnect.
2. **On reconnect success:** the server issues a fresh `welcome` with a NEW `id`. The client treats this as a new session — any `id` the client was displaying gets replaced. No sticky sessions, no replay buffer, no state resync beyond what `welcome.state` + `welcome.emotionHistory` provide.
3. **On repeated failures:** `remote-brain.js` keeps trying with exponential backoff. There's no "give up" condition — the client assumes the server will eventually come back.
4. **Messages during the gap:** anything the client tried to send while disconnected is lost. The client should queue user input in its own UI layer if it wants delivery guarantees (currently it doesn't — dropped text messages are just dropped).

This is intentional: Unity's brain state lives ON the server, not in the client. A reconnecting client has nothing to restore beyond the HUD snapshot, because the brain kept running the whole time.

### Native donor flap resistance (donor-app v0.3.3+)

The native donor (`donor-app/src/donor.rs`) hardens the donor WS against connection flapping — the failure mode where a `wss://…/ws` link over Starlink CGNAT + a reverse proxy gets its idle connection reaped every few minutes (`Connection reset by peer (os error 104)`), each reset forcing a full GPU-engine rebuild + 40M-neuron re-init = minutes of 0 throughput (dashboard red):

1. **Client-initiated keepalive** — the donor sends its own WS `Ping` every 15s (`KEEPALIVE_INTERVAL`) so the link never goes idle long enough for CGNAT / the proxy to reap it. (Before, the donor only *answered* server pings.)
2. **Fast dead-link detection** — if no inbound frame (incl. the brain's pong) arrives for 45s (`IDLE_TIMEOUT`) while keepalive-pinging, the donor presumes the link dead and reconnects immediately instead of waiting minutes for the OS to surface the RST.
3. **Jittered reconnect backoff** — a deterministic per-install offset (donor-id hash, 0–1500 ms) staggers rejoins so a brain restart doesn't make every donor reconnect in lockstep. The supervisor (`run_donor_supervised`) still resets backoff on a clean drop and grows it (capped 30s) on a failed connect.

### Server heartbeat grace (HBGRACE — `brain-server.js`)

The server's own liveness sweep (`_heartbeatTimer`, 30s `ws.ping()` → terminate if no pong by the next sweep) was FALSE-positive-killing live donors and is the *server-side* cause of "Linux drops more than Windows". When a donor connects, the server replica-syncs the full 40M-neuron brain to it (14.2 MB intra + dozens of cross-projections) — which (a) blocks the server event loop in ~5s chunks (`[EventLoop] BLOCKED … phase=_teachHebbian … replicaSyncing=1`), so the `pong` handler can't run + the ping is delayed, and (b) floods the donor, which on a higher-RTT/lower-bandwidth link (Starlink/Linux) drains the upload backlog slowly and answers the ping late → misses the single 30s window → **terminated mid-sync** → `Cannot call write after a stream was destroyed` flood → reconnect → re-sync → churn. The grace logic:

1. **Grace cycles** — `ws._missedPings` must reach `_HB_MISS_LIMIT` (2) consecutive misses before terminate (was 1). A pong resets it.
2. **Event-loop-block awareness** — the lag sampler stamps `_lastEventLoopBlockTs` on a real block (≥1s); if one happened within the heartbeat window the budget rises to `_HB_MISS_LIMIT_BUSY` (5 ≈ 150s) — a missed pong during the server's own stall isn't the donor's fault.
3. **Mid-sync grace** — if `_replicaSyncInFlight.has(ws)` the donor is busy receiving the brain → the busy budget applies, so it's not killed mid-upload.
4. The post-termination `Cannot call write after a stream was destroyed` burst is now rate-limited (one line / 10s) and the chunk loop bails on a closed socket, instead of one dead donor spewing hundreds of lines.
5. **TU.25.B — buffer-saturation forgiveness** — when OUR send buffer to the socket exceeds `DREAM_HB_BUF_FORGIVE_MB` (32MB), the ping is queued BEHIND that mass and physically never reached the donor (live log: 400-900MB buffered → ping delayed 60-120s → false-reaps every ~107s). The miss is forgiven (uncounted, re-ping), bounded by the same hard ceiling.
6. **TU.25.C — canonical-upload grace** — a socket that had a chunked sparse upload dispatched to it within 90s (`ws._lastUploadDispatchTs`, stamped in `gpuSparseUpload`) is busy receiving the brain even when `_replicaSyncInFlight` never marked it (the PRIMARY's initGpu canonical upload) — same forgiveness class.
7. **TU.25.A/D — flood shed + churn brakes (companions to the grace):** the bound-Hebbian teach batch (the buffer-filler) is SHED instantly when the target socket holds > `DREAM_WS_SOFT_SHED_MB` (64MB) — fire-and-forget shadow, CPU authoritative, auto-resync heals on drain (`wsPressure.sheds` counts it); promote-stronger DEFERS while the primary is mid-canonical-upload or within `DREAM_DF7_PROMOTE_COOLDOWN_S` (120s) of the last promotion; and all in-flight sparse reqIds are target-tagged + CANCELLED (resolve null) the moment their donor disconnects, instead of rotting on 180s timers.

### Donor work-stealing + sync pacing (WSQ — `server/brain-server/gpu.js`)

Flap-recovery (above) keeps a high-RTT donor CONNECTED, but a *separate* DF.7 gate kept it from getting WORK: `_donorHealth` hard-zeroed at rtt ≥ 1000ms and `_nextPoolDonor`/`_capacityWeightedPlan` then `filter(w>0)` it out of every plan while a healthy donor existed — so a willing Starlink/Linux GPU sat at 0 Gn/s no matter how often it reconnected (each reconnect re-measured the same warmup-window RTT and re-benched it). That 6.5s RTT was the 51M-neuron replica-sync flooding the uplink, not a dead link. WSQ restores work-eligibility without letting a slow donor stall the pool:

1. **Work-eligibility floor (WSQ.1)** — `_donorHealth` floors at `0.05` (`DREAM_DF7_WORK_FLOOR`) instead of 0 for rtt ≥ 1s. Because strength = `throughput × health` is multiplicative, a slow donor stays *work-eligible* (no longer filtered out → it pulls real units) yet ranks dead-last for PRIMARY (a healthy donor at health 1.0 always out-scores it), so it's never promoted primary and never becomes the main-tick barrier.
2. **Completion-driven work-stealing (WSQ.2)** — `_gpuParallelMap` replaced its pre-assigned capacity plan + `Promise.all` (which waited on the slowest donor's whole slice) with a shared cursor + bounded in-flight per donor (`DREAM_DF7_INFLIGHT`, default 2): each donor pulls the next unit, runs it, loops back for more. A fast donor returns to the cursor sooner so it naturally pulls MORE; a slow donor pulls FEWER and only holds the ≤in-flight units it grabbed, so the tail is bounded by ONE slow unit, not a slow donor's share. The donor's existing per-unit ACK is the pull signal — no protocol change for the queue.
3. **Sync pacing (WSQ.3)** — `gpuSparseUpload` breathes between 16MB replica-sync chunks for a high-RTT/low-bandwidth donor (∝ rttMs, or the `linkDownMbps` hint when present; capped by `DREAM_DF7_SYNC_PACE_MAX_MS`, default 200ms) so the uplink drains its ACKs instead of saturating — keeping steady-state RTT low so WSQ.1's health recovers to a real value and the donor carries a FULL work share. Only paces replica-sync to already-slow donors; the primary canonical upload + healthy donors are untouched.

All three are pure routing/pacing — no weight-format/size change, savestart-safe. The donor "mining" model (Sponge 2026-06-30): contribute what you can, faster churns more, nobody waits on the slowest.

### The hostname gate

`detectRemoteBrain(url = 'ws://localhost:7525')` only probes when the page is served from `localhost` / `127.0.0.1` / `[::1]` / `file://`. On GitHub Pages or any public origin, the probe is skipped and the client falls through to local-mode UnityBrain with no server.

Why: Chrome allows loopback WebSocket from secure contexts, so visiting the Pages URL from a dev box with `brain-server` running would auto-connect to the dev box's local server and pull its (much larger) auto-scaled neuron count into the public page. The hostname gate prevents every stranger's browser from silently poking their own loopback port on page load.

---

## Privacy Model

Core design rule (established 2026-04-13): **user text is private; brain growth is shared; persona is canonical.**

| Thing | Shared across users? | Why |
|---|---|---|
| **What a user types** | 🔒 **PRIVATE** — only that user and Unity see it | Raw text stays in the one client ↔ server channel |
| **Unity's response to a user** | 🔒 **PRIVATE** — only the triggering client gets it | Same reason; responses never broadcast |
| **Dictionary / bigrams / word frequencies** | 🌐 **SHARED** via the singleton brain instance | Every conversation adds to the same dictionary, every user benefits from the vocabulary that grew from everyone else's conversations |
| **GloVe embedding refinements** (the `sharedEmbeddings` online-learned delta layer) | 🌐 **SHARED** same reason | Semantic associations Unity learns in ANY conversation apply to her whole brain |
| **Persona** (`docs/Ultimate Unity.txt` — self-image, traits, drug state) | 🚫 **NOT MUTABLE BY USERS** — loaded from the canonical file at server boot | She's Unity, not a per-user sock puppet |
| **Episodic memory** (stored conversation episodes in the hippocampus / SQLite) | 🔜 **currently shared, needs per-user scoping** | Tracked as pending task T7 in `docs/TODO.md`. Until that ships, the cortex pattern dissimilarity between different users' conversations makes cross-user recall statistically rare but not impossible. |
| **Motor output decisions** (BG softmax, which action Unity picks) | 🌐 **SHARED** — brain state is global | One brain, one motor system |

**What this means at the WebSocket layer:**

- The `text` message a client sends is processed by the shared brain instance, updates the shared state, and produces a response that's returned ONLY to the sender
- The `conversation` broadcast (which used to send every user's text to every other connected client) was **removed 2026-04-13**
- The `state` broadcast at 10Hz still fires to all clients — but it contains aggregate brain telemetry (arousal, valence, coherence, spike counts, cluster activations), NOT per-user text. That's still fine to share because it's Unity's current vitals, not any specific user's input.
- The `build` and `image` messages go only to the client that triggered them (per-user sandbox, per-user image display)
- The `welcome` message a new client receives contains the brain state snapshot + emotion history — but both of those are aggregate brain telemetry, not individual user conversations

**Mental model:** one Unity, one shared brain that grows from every conversation, but each user's actual chat is just between them and Unity. Other users see Unity getting smarter (N growing, dictionary growing, embeddings refining) but never see the specific conversations that drove the growth.

---

## Security Model

- **Auth lives at the proxy, not the brain-server.** The brain-server itself does no authentication — any client that reaches loopback `127.0.0.1:7525` can connect and send text. In local dev that's the developer alone (loopback only). In the deployed pre-alpha the brain-server binds loopback only and nginx fronts it: the public donor/viewer lane (`/ws`) stays unauthenticated, and the admin lane (`/admin/ws`) is gated by nginx `auth_request` against Forgejo, which injects a trusted `X-UAL-User` header. Admin-only messages and `/admin/<endpoint>` control routes are only reachable via the authed lane. **Direct exposure of `127.0.0.1:7525` to the public internet — bypassing the proxy — is never appropriate.**
- **API keys never traverse the WebSocket.** Unity's brain never needs API keys — cognition runs fully equational on the server, and sensory AI calls happen client-side. Whatever keys the client holds (for their own image gen, TTS, VLM backends) stay in their browser's localStorage.
- **No key material in server storage.** Server persists brain weights (`server/brain-weights.json`), word frequencies, and episodic memory (`server/episodic-memory.db` SQLite). Zero user secrets on disk.
- **Conversation broadcasts are anonymized to userId only** — no client name, no IP, no User-Agent. The `setName` field is server-local and never included in the broadcast.
- **Rate limiting is per-client only.** A hostile client can flood with non-text message types (`reward`, `setName`) without triggering the text limiter. Mitigation: WebSocket frame size limits in `ws`, and TCP backpressure if the server falls behind.

---

## Server Endpoints (HTTP, not WebSocket)

`brain-server.js` runs a plain HTTP server on the same port as the WebSocket upgrade. These are sibling endpoints, not over WebSocket:

| Path | Method | Returns |
|---|---|---|
| `/` | GET | `index.html` — main app |
| `/dashboard.html` | GET | Live brain monitor |
| `/minds-eye.html` | GET | Public "what Unity sees" viewer — polls `/minds-eye.json`, reconstructs the field C client-side |
| `/compute.html` | GET | GPU compute worker (required for brain to run — it pauses without a GPU client) |
| `/public-state.json` | GET | Single cached brain-state snapshot (public dashboard polls it — N viewers cost one `getState()`) |
| `/minds-eye.json` | GET | Single cached imagined field C (the Mind's-Eye source — one `_imagineTick` snapshot served to all viewers; `Access-Control-Allow-Origin: *`, read-only) |
| `/health` | GET | JSON `{status, neurons, clusters, uptime, clients}` |
| `/versions` | GET | JSON list of `brain-weights-v0.json`..`brain-weights-v4.json` save slots |
| `/rollback/:slot` | POST | Restore a previous brain save slot |
| `/episodes` | GET | Query episodic memory (SQLite) |
| `/history` | GET | Emotional history data (for the dashboard chart) |
| Static files | GET | Anything else in the project directory is served as static |

All HTTP endpoints default to `http://localhost:7525/<path>` and move with `PORT`. In the deployed setup these are served behind nginx; the admin REST control endpoints are proxied under `/admin/<endpoint>` on the Forgejo-authenticated lane (same `auth_request` + `X-UAL-User` injection as the admin WSS lane), while public reads come through the unauthenticated front.

---

## Protocol Evolution Rules

The wire protocol is semver-ish but informal. These rules prevent client/server lock-step coupling:

1. **New server → client message types:** clients ignore unknown types. Safe to add at any time.
2. **New client → server message types:** server logs and drops unknown. Safe to add.
3. **New fields on existing types:** both sides treat unknown fields as opaque. Safe to add.
4. **Removed/renamed fields on existing types:** breaking change — bump `server/brain-weights.json` schema version (currently v4) and coordinate a client release.
5. **Message type removal:** breaking change — announce in `docs/FINALIZED.md` and leave the server handler throwing a deprecation `error` for a release cycle before actually removing it.

No schema registry, no protocol buffers, no versioning handshake. The protocol is informal JSON-over-WebSocket by design — simple enough that debugging with browser devtools → Network → WS tab works for 100% of issues.

---

*Unity AI Lab — plain JSON over plain WebSocket, no ceremony.*
