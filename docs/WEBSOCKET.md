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
    "clientCount": 3
  }
}
```

The exact shape comes from `brain.getState()` in `server/brain-server.js` — it's the full live snapshot the dashboard renders. This is the highest-traffic message by volume (10 Hz × every client).

`drugSnapshot` is `DrugScheduler.snapshot(now)`. `active` carries per-substance `{substance, displayName, level, phase}` where phase ∈ {onset, peak, plateau, tail, sober}. `combos` carries per-pair `{key: 'a+b', displayName, level: min(level_a, level_b)}` for the 7 synergy entries in the COMBOS table. `riskFlags` maps axis name → cumulative intensity across active combos (e.g., `physicalStrain`). `pendingDesires` maps substance → `{delta, expiresAt}` from sensory-trigger cravings. `pendingAcquisitions` tracks substances Unity is waiting on (dealer / friend / party source).

`cortexDivergenceByRegion` is the T17.7 Phase C follow-up telemetry — per-region `{standRate, mainRate, divergence}` between standalone `cortexCluster.lastSpikes` and main-cortex GPU spike slices. Rates in [0, 1] (spike fraction); divergence rounds to 5 decimals. Empty during GPU warmup.

The T17.7 sparse-dispatch + slice-access wire protocol adds binary frames (type=1 upload / type=2 propagate / type=3 hebbian / type=4 chunked-upload) plus JSON messages `write_spike_slice` / `write_current_slice` / `clear_spike_region` / `rebind_sparse` / `readback_letter_buckets`. All are server → compute.html; each has a matching `*_ack` response. Handled in `js/brain/gpu-compute.js` + `compute.html` onmessage dispatcher + `server/brain-server.js` ack-switch (`case 'sparse_upload_ack' | 'sparse_propagate_ack' | 'sparse_hebbian_ack' | 'rebind_sparse_ack' | 'readback_letter_buckets_ack'`).

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
| Donor → Server | `gpu_register` | `{}` (public lane) | Donor joins the replica pool; server uploads the full brain to it |
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

### `gpu_register`

Sent by `compute.html` on WebSocket open to mark itself as the GPU compute client.

```json
{ "type": "gpu_register" }
```

The server marks `brain._gpuClient = ws` and `brain._gpuConnected = true`, then all subsequent Rulkov step requests get routed to this client via `compute_request` / `compute_result` round trips. The brain waits (blocks step dispatching) until a GPU client connects, with a log message every few seconds announcing `[GPU] Waiting for compute client`. Only one GPU client is supported at a time — a second `gpu_register` replaces the first. No CPU fallback exists — at 400K+ cerebellum neurons × 7 clusters × 60 Hz the iteration cost would cook any CPU.

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
| `/compute.html` | GET | GPU compute worker (required for brain to run — it pauses without a GPU client) |
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
