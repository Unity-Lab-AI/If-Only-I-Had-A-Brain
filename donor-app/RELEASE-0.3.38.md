# donor v0.3.38 — the brain moved house; the donor knows the new address

**No protocol change. No new opcode. No behaviour change once connected.**
This release changes one compiled-in constant and the three page links the GUI
opens, and it is published from a different place.

## Why

The rented box that served `wss://if-only-i-had-a-brain.git.unityailab.com/ws`
is gone (its hostname no longer resolves). Every donor built before this one
dials that address by default and attaches to nothing — a stranger's download
and a RunPod pod alike.

## What changed

| | before | after |
|---|---|---|
| `PROD_SERVER` (default server) | `wss://if-only-i-had-a-brain.git.unityailab.com/ws` | `wss://dumbass.tailec58e0.ts.net/ws` |
| GUI links (legend / dashboard / leaderboard) | the old box | `https://unity-lab-ai.github.io/If-Only-I-Had-A-Brain/html/…` |
| where releases are published | Forgejo release + rsync to the box | **GitHub Releases** on this repository, then a Pages redeploy |

The brain now runs on the operator's own machine and is reached through a
Tailscale Funnel; `/ws` is one of the five read lanes the funnel forwards. The
public site is GitHub Pages. `--local` and a persisted custom server are
unaffected.

## Nothing else

Same wire contract, same capability gates, same self-exit-when-silent behaviour
from 0.3.37. The brain's `DREAM_MIN_DONOR_VERSION` floor is unchanged (0.3.26),
so older donors still connect — they just have to be told the new server by
hand, which is the reason to ship this one.
