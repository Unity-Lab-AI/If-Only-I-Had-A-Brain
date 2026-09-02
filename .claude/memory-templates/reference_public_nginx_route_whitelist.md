---
name: reference-public-nginx-route-whitelist
description: "The public origin's nginx only forwards endpoints it already knows — brand-new server routes are SPA-swallowed from outside; tunnel new public data through /public-state.json query params."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 1e2e9344-0606-4134-b69d-222d4e9ee8f8
  modified: 2026-08-18T02:34:40.225Z
---

The public origin (`if-only-i-had-a-brain.git.unityailab.com`) nginx forwards ONLY already-configured paths (`/public-state.json`, `/minds-eye.json`, `/ws`, the download doors); any brand-new server route returns the SPA's index.html from outside — a `200` with HTML, which LOOKS deployed but isn't reachable. Lived it 2026-08-18: `/console-tail.json` (CONSOLERING) was alive inside the box but SPA-swallowed publicly; the code's own donor-doors note above `refreshDonorLatest()` documents this exact wall.

**Why:** box/nginx changes are off-limits (deploys are dashboard-buttons-only per [[feedback-box-deploy-dashboard-only]]), so new public endpoints can't just be added to nginx.

**How to apply:** ship new public read-only data as a QUERY-PARAM branch inside an already-forwarded route — e.g. `GET /public-state.json?console=N[&since=ms]` serves the console ring (query strings pass through path-matched nginx locations untouched). Always verify a "new endpoint works" claim by checking the response is JSON, not `<!DOCTYPE` — a 200 status alone proves nothing.
